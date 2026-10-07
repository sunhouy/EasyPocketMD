import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('harmony_build', Path(__file__).resolve().parents[2] / 'scripts/harmony-build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class HarmonyBuildTests(unittest.TestCase):
    def test_version_validation_and_override(self):
        self.assertEqual(build.version_values('v2.9.10', '', '1.0.0'), ('2.9.10', 2009010))
        self.assertEqual(build.version_values('', '88', '2.9.3'), ('2.9.3', 88))
        for version, code in [('2.9;echo secret', ''), ('../2.9.3', ''), ('2.9.3', '-2'), ('2.9.3', '2147483648'), ('0.0.0', '')]:
            with self.assertRaises(ValueError):
                build.version_values(version, code, '2.9.3')

    def test_missing_material_is_reported_before_writing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaisesRegex(ValueError, 'HARMONY_CERT'):
                build.prepare(root, root / 'signing', {'HARMONY_KEY': 'already-saved'})
            self.assertFalse((root / 'signing').exists())

    def test_prepare_fixes_bundle_and_limits_key_permissions(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'harmony/AppScope').mkdir(parents=True)
            (root / 'package.json').write_text('{"version":"2.9.3"}')
            manifest = root / 'harmony/AppScope/app.json5'
            manifest.write_text('{"app":{"bundleName":"incorrect"}}')
            env = {key: 'value' for key in build.SIGNING_SECRETS}
            for key in ('HARMONY_KEY', 'HARMONY_CERT', 'HARMONY_PROFILE'):
                env[key] = base64.b64encode(b'binary-material').decode()
            env['APP_VERSION'] = 'v2.9.10'
            self.assertEqual(build.prepare(root, root / 'signing', env), ('2.9.10', 2009010))
            self.assertEqual(json.loads(manifest.read_text())['app']['bundleName'], 'com.yhsun.md')
            self.assertEqual((root / 'signing/release.p12').stat().st_mode & 0o777, 0o600)
            env['HARMONY_KEY'] = 'invalid-base64'
            with self.assertRaisesRegex(ValueError, 'Base64'):
                build.prepare(root, root / 'signing', env)

    def test_tool_failure_does_not_expose_command_or_password(self):
        with patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess(['java'], 1, b'password=secret')):
            with self.assertRaises(RuntimeError) as failure:
                build.run_private(['java', '-keyPwd', 'secret'])
            self.assertNotIn('secret', str(failure.exception))

    def test_debug_or_wrong_bundle_profile_is_rejected_before_signing(self):
        for profile in [{'type': 'debug', 'bundle-info': {'bundle-name': 'com.yhsun.md'}}, {'type': 'release', 'bundle-info': {'bundle-name': 'other'}}]:
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                signing = root / 'signing'
                signing.mkdir()
                (signing / 'profile.json').write_text(json.dumps(profile))
                env = {key: 'value' for key in build.SIGNING_SECRETS}
                env.update(HARMONY_SIGNER='signer.jar', HARMONY_PACKER='packer.jar')
                with patch.object(build, 'run_private') as run:
                    with self.assertRaisesRegex(ValueError, '发布 Profile'):
                        build.pack(root, signing, root / 'output', env)
                    self.assertEqual(run.call_count, 1)


if __name__ == '__main__':
    unittest.main()
