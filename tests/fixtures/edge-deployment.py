"""Exercise edge activation and credential isolation without contacting servers."""
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

class Edge(unittest.TestCase):
    def test_edge_activates_only_gateway_without_database_or_print_vhost(self):
        deploy = load('edge_deploy', 'deploy-docker.py')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = root / 'release'; release.mkdir()
            (release / 'release.json').write_text(json.dumps({'images': {'gateway': 'gateway:test'}}))
            (release / 'config.json').write_text(json.dumps({'role': 'edge', 'origin_ip': '192.0.2.1', 'domain': 'md.example.com', 'wasm': {}}))
            (release / 'tls.key').write_text('key'); (release / 'tls.pem').write_text('cert')
            def mapped(value):
                value = str(value)
                return root / value.lstrip('/') if value.startswith('/www/') or value == '/var/run/docker.sock' else Path(value)
            socket = mapped('/var/run/docker.sock'); socket.parent.mkdir(parents=True); socket.touch()
            with patch.object(deploy, 'ROOT', root), patch.object(deploy, 'Path', side_effect=mapped), patch.object(deploy, 'docker') as docker, patch.object(deploy, 'command') as command, patch.object(deploy, 'health') as health, patch.object(deploy, 'nginx_site_directory', return_value=root / 'nginx'), patch.object(deploy, 'public_https_health') as https_health, patch.object(deploy, 'remove') as remove, patch.object(deploy.resources, 'configure_sandbox_budget') as sandbox, patch.object(deploy.resources, 'container_limits', return_value=48), patch.object(deploy.shutil, 'which', return_value='/usr/bin/nginx'), patch.object(subprocess, 'run'):
                candidate = deploy.activate(release, 'main', 0, None)
                self.assertEqual(candidate['containers'], {'gateway': 'epmd-main-gateway-0'})
                sandbox.assert_not_called()
                docker.assert_called_once()
                args = docker.call_args.args
                self.assertIn('ORIGIN_IP=192.0.2.1', args)
                self.assertIn('ORIGIN_TLS_VERIFY=on', args)
                self.assertNotIn('--env-file', args)
                health.assert_called_once_with(3180, {})
                https_health.assert_called_once_with('md.example.com', 'main', True)
                self.assertIn('listen 443 ssl', (root / 'nginx/md.example.com.conf').read_text())
                self.assertFalse(any('exec' in call.args for call in command.call_args_list))
                self.assertEqual(json.loads((root / 'state-main.json').read_text())['current'], candidate)
                old_vhost = (root / 'nginx/md.example.com.conf').read_bytes()
                https_health.side_effect = RuntimeError('Public HTTPS failure')
                with self.assertRaisesRegex(RuntimeError, 'Public HTTPS failure'):
                    deploy.activate(release, 'main', 1, candidate)
                self.assertEqual((root / 'nginx/md.example.com.conf').read_bytes(), old_vhost)
                self.assertEqual(json.loads((root / 'state-main.json').read_text())['current'], candidate)
                remove.assert_any_call('epmd-main-gateway-1')

    def test_system_nginx_uses_its_active_include(self):
        deploy = load('system_nginx', 'deploy-docker.py')
        with patch.object(deploy, 'command', return_value=subprocess.CompletedProcess([], 0, stdout='http {\n include /etc/nginx/conf.d/*.conf;\n}')):
            self.assertEqual(deploy.nginx_site_directory('/usr/sbin/nginx'), Path('/etc/nginx/conf.d'))
        with patch.object(deploy, 'command', return_value=subprocess.CompletedProcess([], 0, stdout='http {}')):
            with self.assertRaises(RuntimeError):
                deploy.nginx_site_directory('/usr/sbin/nginx')

    def test_preparation_excludes_credentials_and_exports_only_built_gateway(self):
        edge = load('edge_prepare', 'prepare-edge-release.py')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); source = root / 'source'; source.mkdir()
            (source / 'app.env').write_text('DB_PASSWORD=secret\nJWT_SECRET=secret')
            (source / 'config.json').write_text(json.dumps({'domain': 'md.example.com'}))
            (source / 'tls.key').write_text('key')
            (source / 'release.json').write_text(json.dumps({'images': {'gateway': 'gateway:same-build', 'app': 'app:build'}}))
            images = root / 'images'; target = root / 'edge'
            def export(args, **kwargs):
                images.mkdir()
                (images / 'release.json').write_text(json.dumps({'images': {'gateway': 'gateway:same-build'}}))
                (images / 'release.sha256').write_text('checksum')
            with patch.object(subprocess, 'run', side_effect=export) as run:
                edge.prepare(source, target, images, '192.0.2.1')
                run.assert_called_once_with(['python3', 'scripts/image-cas.py', 'export', str(images), 'gateway=gateway:same-build'], check=True)
            self.assertFalse((target / 'app.env').exists())
            self.assertEqual(json.loads((target / 'config.json').read_text())['origin_ip'], '192.0.2.1')
            self.assertEqual(set(json.loads((target / 'release.json').read_text())['images']), {'gateway'})
            with self.assertRaises(ValueError):
                edge.prepare(source, target, images, 'geo.example.com')

if __name__ == '__main__':
    unittest.main()
