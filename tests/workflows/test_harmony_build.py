import base64
import hashlib
import os
import zipfile
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
    def test_packed_app_verifies_the_exact_signed_hap(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            hap = root / 'entry.hap'; hap.write_bytes(b'signed-hap-with-signing-block')
            app = root / 'release.app'
            with zipfile.ZipFile(app, 'w') as archive:
                archive.writestr('entry.hap', hap.read_bytes())
                archive.writestr('pack.info', '{}')
            with patch.object(build, 'run_private') as verify:
                build.verify_app_contents(app, hap, root, 'java', 'signer.jar')
                embedded = root / 'packed-entry.hap'
                self.assertEqual(embedded.read_bytes(), hap.read_bytes())
                self.assertIn(str(embedded), verify.call_args.args[0])
                self.assertIn('verify-app', verify.call_args.args[0])
                self.assertEqual(verify.call_count, 2)
                self.assertIn(str(app), verify.call_args_list[0].args[0])

    def test_release_pipeline_signs_final_app_and_rejects_unsigned_container(self):
        for strip_app_signature in (False, True):
            with self.subTest(strip_app_signature=strip_app_signature), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                signing = root / 'signing'; signing.mkdir()
                (signing / 'profile.json').write_text(json.dumps({'type': 'release', 'bundle-info': {'bundle-name': build.BUNDLE_NAME}}))
                scope = root / 'harmony/AppScope'; scope.mkdir(parents=True)
                (scope / 'app.json5').write_text('{"app":{"versionName":"1.0.0"}}')
                built = root / 'harmony/entry/build/default/outputs/default'; built.mkdir(parents=True)
                (built / 'pack.info').write_text('{}')
                with zipfile.ZipFile(built / 'entry-unsigned.hap', 'w') as archive:
                    archive.writestr('module.json', '{}')
                env = {name: 'value' for name in build.SIGNING_SECRETS}
                env.update(HARMONY_SIGNER='signer.jar', HARMONY_PACKER='packer.jar')
                verified = []

                def tool(command):
                    if command[0] == 'openssl':
                        return
                    if 'sign-app' in command:
                        source = Path(command[command.index('-inFile') + 1])
                        target = Path(command[command.index('-outFile') + 1])
                        marker = b'' if strip_app_signature and target.suffix == '.app' else b'SIGNATURE'
                        target.write_bytes(source.read_bytes() + marker)
                    elif '--mode' in command:
                        hap = Path(command[command.index('--hap-path') + 1])
                        target = Path(command[command.index('--out-path') + 1])
                        with zipfile.ZipFile(target, 'w') as archive:
                            archive.writestr(hap.name, hap.read_bytes())
                            archive.writestr('pack.info', '{}')
                    elif 'verify-app' in command:
                        source = Path(command[command.index('-inFile') + 1])
                        if not source.read_bytes().endswith(b'SIGNATURE'):
                            raise RuntimeError('unsigned package')
                        verified.append(source)

                with patch.object(build, 'run_private', side_effect=tool):
                    if strip_app_signature:
                        with self.assertRaisesRegex(RuntimeError, 'unsigned package'):
                            build.pack(root, signing, root / 'output', env)
                    else:
                        build.pack(root, signing, root / 'output', env)
                        self.assertEqual([path.suffix for path in verified], ['.hap', '.app', '.hap'])

    def test_packing_that_strips_signature_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            hap = root / 'entry.hap'; hap.write_bytes(b'signed-hap-with-signing-block')
            app = root / 'release.app'
            with zipfile.ZipFile(app, 'w') as archive:
                archive.writestr('entry.hap', b'unsigned-hap')
                archive.writestr('pack.info', '{}')
            with patch.object(build, 'run_private') as verify:
                with self.assertRaisesRegex(ValueError, '改写'):
                    build.verify_app_contents(app, hap, root, 'java', 'signer.jar')
                verify.assert_not_called()

    def test_app_without_entry_hap_or_pack_info_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            hap = root / 'entry.hap'; hap.write_bytes(b'signed')
            for contents in ({'pack.info': '{}'}, {'entry.hap': 'signed'},
                             {'one.hap': 'signed', 'two.hap': 'signed', 'pack.info': '{}'}):
                app = root / 'release.app'
                with zipfile.ZipFile(app, 'w') as archive:
                    for name, content in contents.items():
                        archive.writestr(name, content)
                with self.assertRaisesRegex(ValueError, 'entry HAP'):
                    build.verify_app_contents(app, hap, root, 'java', 'signer.jar')

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


class HarmonyToolSetupTests(unittest.TestCase):
    def test_cli_without_jbr_uses_installed_java_and_flat_launchers(self):
        self.check_tools(external_java=True, flat=True)

    def test_bundle_jdk_is_accepted_without_external_java(self):
        self.check_tools(external_java=False, flat=False)

    def check_tools(self, external_java, flat):
        project = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(prefix='harmony-tools-') as temp:
            root = Path(temp)
            archive = root / 'official.zip'
            files = {
                'command-line-tools/node/bin/node': '#!/bin/sh\nexit 0\n',
                'command-line-tools/sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar': 'signer',
                'command-line-tools/sdk/default/openharmony/toolchains/lib/app_packing_tool.jar': 'packer',
            }
            for tool, directory in [('ohpm', 'ohpm'), ('hvigorw', 'hvigor')]:
                name = 'command-line-tools/bin/' + tool if flat else 'command-line-tools/' + directory + '/bin/' + tool
                files[name] = '#!/bin/sh\nexit 0\n'
            if not external_java:
                files['command-line-tools/jdk-17/bin/java'] = '#!/bin/sh\necho java17\n'
            with zipfile.ZipFile(archive, 'w') as zipped:
                for name, content in files.items():
                    info = zipfile.ZipInfo(name)
                    info.external_attr = (0o100755 if '/bin/' in name else 0o100644) << 16
                    zipped.writestr(info, content)
            mocks = root / 'mocks'; mocks.mkdir()
            curl = mocks / 'curl'; curl.write_text('#!/bin/bash\ncp "$LOCAL_TEST_ZIP" "${@: -1}"\n'); curl.chmod(0o755)
            runtime = root / 'runner'; runtime.mkdir()
            env = {**os.environ, 'PATH': str(mocks) + ':' + os.environ['PATH'],
                   'LOCAL_TEST_ZIP': str(archive), 'RUNNER_TEMP': str(runtime),
                   'HARMONY_TOOLS_URL': 'https://example.invalid/tools.zip',
                   'HARMONY_TOOLS_SHA256': hashlib.sha256(archive.read_bytes()).hexdigest(),
                   'GITHUB_ENV': str(root / 'env'), 'GITHUB_PATH': str(root / 'path')}
            env.pop('JAVA_HOME', None)
            if external_java:
                java_home = root / 'jdk with spaces'; (java_home / 'bin').mkdir(parents=True)
                java = java_home / 'bin/java'; java.write_text('#!/bin/sh\necho java17\n'); java.chmod(0o755)
                env['JAVA_HOME'] = str(java_home)
            result = subprocess.run(['bash', str(project / 'scripts/setup-harmony-tools.sh')], env=env, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            exported = (root / 'env').read_text()
            expected = str(java) if external_java else str(runtime / 'harmony-tools/command-line-tools/jdk-17/bin/java')
            self.assertIn('HARMONY_JAVA=' + expected, exported)
            self.assertIn('HARMONY_HVIGOR=', exported)
            self.assertIn('HARMONY_OHPM=', exported)
            self.assertFalse((runtime / 'harmony-tools.zip').exists())


if __name__ == '__main__':
    unittest.main()
