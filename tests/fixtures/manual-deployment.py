import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
pack = load('package_release', 'package-docker-release.py')
runtime = load('manual_runtime', 'prepare-manual-runtime.py')

class ManualDeployment(unittest.TestCase):
    def test_archive_whitelist_excludes_runtime_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source'; target = Path(directory) / 'artifact'
            (source / 'image-cas/objects').mkdir(parents=True)
            (source / 'docker-control').mkdir(); (source / 'scripts').mkdir()
            for file in (ROOT / 'scripts').iterdir():
                if file.is_file(): (source / 'scripts' / file.name).write_bytes(file.read_bytes())
            for name in ('release.json','release.sha256'):
                (source / 'image-cas' / name).write_text('fixture')
            (source / 'image-cas/objects/layer.gz').write_text('public-layer')
            config = {'domain':'md.example.com','wasm':{},'version':'1','github_run_id':'123','DB_PASSWORD':'private-value'}
            (source / 'docker-control/config.json').write_text(json.dumps(config))
            for name in ('app.env','tls.key','tls.pem'):
                (source / 'docker-control' / name).write_text('private-value')
            pack.package(source,target,'main')
            self.assertEqual(json.loads((target / 'docker-control/config.json').read_text())['channel'],'main')
            for file in target.rglob('*'):
                if file.is_file():
                    self.assertNotIn(file.name,('app.env','tls.key','tls.pem'))
                    self.assertNotIn(b'private-value',file.read_bytes())
            self.assertEqual((target / 'image-cas/objects/layer.gz').read_text(),'public-layer')
            self.assertTrue((target / 'manual-deploy.sh').is_file())

    def setup_releases(self, root, artifact_channel='main'):
        current = root / 'releases/current'; release = root / 'releases/candidate'
        current.mkdir(parents=True); release.mkdir()
        (root / 'state-main.json').write_text(json.dumps({'current':{'release':str(current)}}))
        (current / 'config.json').write_text(json.dumps({'domain':'real.example.com','ssl_email':'admin@example.com'}))
        (current / 'app.env').write_text('JWT_SECRET=current-secret\nDB_PASSWORD=current-db\n')
        (current / 'tls.key').write_text('existing-key')
        (release / 'config.json').write_text(json.dumps({'channel':artifact_channel,'domain':'download.example.com','version':'new','wasm':{'engine.wasm':'new-hash'}}))
        return current,release

    def test_reuses_current_secrets_and_preserves_new_image_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); current, release = self.setup_releases(root)
            runtime.prepare(release,'main',root)
            self.assertEqual((release / 'app.env').read_bytes(),(current / 'app.env').read_bytes())
            self.assertEqual((release / 'tls.key').stat().st_mode & 0o777,0o600)
            config = json.loads((release / 'config.json').read_text())
            self.assertEqual(config['domain'],'real.example.com')
            self.assertEqual(config['version'],'new')
            self.assertEqual(config['wasm'],{'engine.wasm':'new-hash'})

    def test_wrong_channel_rejects_before_copying_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); _, release = self.setup_releases(root,'dev')
            with self.assertRaisesRegex(ValueError,'channel/role'): runtime.prepare(release,'main',root)
            self.assertFalse((release / 'app.env').exists())

    def test_first_deployment_requires_initial_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); _, release = self.setup_releases(root)
            (root / 'state-main.json').unlink()
            with self.assertRaisesRegex(ValueError,'No current Docker deployment'): runtime.prepare(release,'main',root)
            self.assertFalse((release / 'app.env').exists())

    def test_missing_runtime_configuration_stops(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); current, release = self.setup_releases(root)
            (current / 'app.env').unlink()
            with self.assertRaisesRegex(ValueError,'configuration is unavailable'): runtime.prepare(release,'main',root)
            self.assertFalse((release / 'app.env').exists())

if __name__ == '__main__': unittest.main()
