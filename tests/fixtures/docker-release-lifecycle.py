"""Regression checks for live imports, rollback and scoped release cleanup."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

deploy = load('deploy_docker', 'deploy-docker.py')
resources = deploy.resources

class Lifecycle(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'releases').mkdir()
        (self.root / 'cache' / 'objects').mkdir(parents=True)
        self.addCleanup(patch.stopall)
        patch.object(deploy, 'ROOT', self.root).start()

    def release(self, name, digest, activated=True):
        path = self.root / 'releases' / name
        path.mkdir()
        images = {role: f'easypocketmd-{role}:{digest * 40}' for role in ('app', 'print', 'gateway', 'python')}
        manifest = {'images': images, 'members': [{'sha256': digest * 64}]}
        (path / 'release.json').write_text(json.dumps(manifest))
        (path / 'config.json').write_text(json.dumps({'version': 'test'}))
        (self.root / 'cache' / 'objects' / (digest * 64 + '.gz')).write_bytes(b'layer')
        if activated:
            (path / '.activated').touch()
        return {'release': str(path), 'slot': 0, 'containers': {role: f'epmd-main-{role}-0' for role in ('app', 'print', 'gateway')}}

    def state(self, current, previous=None, channel='main'):
        (self.root / f'state-{channel}.json').write_text(json.dumps({'current': current, 'previous': previous}))

    def test_small_host_import_never_stops_live_containers(self):
        with patch.object(resources, 'memory', return_value={'MemTotal': 1600 * resources.MIB, 'MemAvailable': 256 * resources.MIB}), patch.object(subprocess, 'run') as run:
            with resources.deployment_memory('main'):
                pass
            run.assert_not_called()

    def test_low_import_memory_retains_live_site(self):
        with patch.object(resources, 'memory', return_value={'MemAvailable': 128 * resources.MIB}), patch.object(subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'retained current deployment'):
                with resources.deployment_memory('main'):
                    self.fail('unsafe import was allowed')
            run.assert_not_called()

    def test_cleanup_keeps_rollback_other_channel_and_in_progress_upload(self):
        current, previous = self.release('main-3-1', 'a'), self.release('main-2-1', 'b')
        stale = self.release('main-1-1', 'c')
        dev = self.release('dev-4-1', 'd')
        dev['containers'] = {role: f'epmd-dev-{role}-0' for role in ('app', 'print', 'gateway')}
        staged = self.release('dev-5-1', 'e', False)
        self.state(current, previous)
        self.state(dev, channel='dev')
        names = 'epmd-main-app-0 epmd-main-app-1 epmd-dev-app-0 unrelated-db'
        tags = ' '.join(f'easypocketmd-app:{c * 40}' for c in 'abcde') + ' unrelated:old'
        with patch.object(subprocess, 'check_output', side_effect=[names, tags]), patch.object(deploy, 'remove') as remove, patch.object(deploy, 'cleanup_sandboxes') as sandbox, patch.object(subprocess, 'run') as run:
            deploy.cleanup_obsolete_releases()
            remove.assert_called_once_with('epmd-main-app-1')
            sandbox.assert_called_once_with('epmd-main-app-1')
            run.assert_called_once_with(['docker', 'image', 'rm', f'easypocketmd-app:{"c" * 40}'], stdout=subprocess.DEVNULL)
        self.assertFalse(Path(stale['release']).exists())
        for record in (current, previous, dev, staged):
            self.assertTrue(Path(record['release']).exists())
        self.assertFalse((self.root / 'cache' / 'objects' / ('c' * 64 + '.gz')).exists())
        for digest in 'abde':
            self.assertTrue((self.root / 'cache' / 'objects' / (digest * 64 + '.gz')).exists())

    def test_invalid_retained_manifest_prevents_deletion(self):
        current = self.release('main-3-1', 'a')
        self.state(current)
        (Path(current['release']) / 'release.json').write_text('corrupt')
        with patch.object(deploy, 'remove') as remove, patch.object(subprocess, 'run') as run:
            deploy.cleanup_obsolete_releases()
            remove.assert_not_called()
            run.assert_not_called()

    def test_activation_failure_restarts_only_paused_api(self):
        current = self.release('main-1-1', 'a')
        candidate = self.release('main-2-1', 'b')
        self.state(current)
        with patch.object(deploy.sys, 'argv', ['deploy-docker.py', 'deploy', 'main', candidate['release']]), patch.object(resources, 'memory', return_value={'MemAvailable': 200 * resources.MIB}), patch.object(deploy, 'cleanup_sandboxes'), patch.object(deploy, 'migrate_data'), patch.object(deploy, 'activate', side_effect=RuntimeError('health failed')), patch.object(deploy, 'command') as command, patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as run:
            with self.assertRaisesRegex(RuntimeError, 'health failed'):
                deploy.main()
            command.assert_called_once_with('docker', 'stop', '--time', '5', 'epmd-main-app-0', stdout=subprocess.DEVNULL)
            run.assert_called_once_with(['docker', 'start', 'epmd-main-app-0'], stdout=subprocess.DEVNULL)
            self.assertEqual(json.loads((self.root / 'state-main.json').read_text())['current'], current)

    def test_success_removes_old_containers_after_activation(self):
        current = self.release('main-1-1', 'a')
        candidate = self.release('main-2-1', 'b')
        self.state(current)
        events = []
        with patch.object(deploy.sys, 'argv', ['deploy-docker.py', 'deploy', 'main', candidate['release']]), patch.object(resources, 'memory', return_value={'MemAvailable': 512 * resources.MIB}), patch.object(deploy, 'cleanup_sandboxes'), patch.object(deploy, 'activate', side_effect=lambda *args: events.append('activate') or candidate), patch.object(deploy, 'remove', side_effect=lambda name: events.append(name)), patch.object(deploy, 'migrate_data'), patch.object(deploy, 'write_atomic'), patch.object(deploy, 'cleanup_obsolete_releases') as cleanup, patch.object(deploy.shutil, 'which', return_value=None), patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
            deploy.main()
            self.assertEqual(events, ['activate', *current['containers'].values()])
            cleanup.assert_called_once()

if __name__ == '__main__':
    unittest.main()
