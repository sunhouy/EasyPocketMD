#!/usr/bin/env python3
"""Prepare, sign and pack HarmonyOS builds without storing credentials in the repo."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

BUNDLE_NAME = 'com.yhsun.md'
SIGNING_SECRETS = ('HARMONY_KEY', 'HARMONY_CERT', 'HARMONY_PROFILE', 'HARMONY_STORE_PASSWORD', 'HARMONY_KEY_PASSWORD', 'HARMONY_KEY_ALIAS')


def version_values(version, code, default_version):
    version = (version or default_version).removeprefix('v')
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise ValueError('版本号必须是 x.y.z 或 vx.y.z')
    parts = [int(part) for part in version.split('.')]
    if code:
        if not re.fullmatch(r'[1-9]\d*', code):
            raise ValueError('version_code 必须是正整数')
        result = int(code)
    else:
        if any(part >= 1000 for part in parts):
            raise ValueError('版本号各部分必须小于 1000，或手动填写 version_code')
        result = parts[0] * 1000000 + parts[1] * 1000 + parts[2]
    if not 0 < result <= 2147483647:
        raise ValueError('version_code 超出范围')
    return version, result


def check_secrets(env):
    missing = [name for name in SIGNING_SECRETS if not env.get(name)]
    if missing:
        raise ValueError('缺少 Actions secrets：' + ', '.join(missing))


def prepare(root, signing, env):
    check_secrets(env)
    version, code = version_values(env.get('APP_VERSION', ''), env.get('APP_VERSION_CODE', ''), json.loads((root / 'package.json').read_text())['version'])
    manifest_path = root / 'harmony/AppScope/app.json5'
    manifest = json.loads(manifest_path.read_text())
    manifest['app'].update(bundleName=BUNDLE_NAME, versionName=version, versionCode=code)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    signing.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name, filename in [('HARMONY_KEY', 'release.p12'), ('HARMONY_CERT', 'release.cer'), ('HARMONY_PROFILE', 'release.p7b')]:
        try:
            data = base64.b64decode(''.join(env[name].split()), validate=True)
        except (ValueError, base64.binascii.Error) as error:
            raise ValueError(name + ' 必须是文件内容的 Base64 编码') from error
        if not data:
            raise ValueError(name + ' 解码结果为空')
        path = signing / filename
        path.write_bytes(data)
        path.chmod(0o600)
    return version, code


def run_private(args):
    # A tool failure must not print its command line (which includes signing passwords).
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError('鸿蒙签名/打包工具执行失败（退出码 %d），请检查证书、Profile、密钥及 SDK 版本' % result.returncode)


def verify_app_contents(app, hap, signing, java, signer):
    # Packing can rewrite pack.info inside the HAP and silently discard its signature.
    # Verify the distributed bytes, not just the standalone HAP before packing.
    with zipfile.ZipFile(app) as archive:
        haps = [name for name in archive.namelist() if name.endswith('.hap')]
        if len(haps) != 1 or 'pack.info' not in archive.namelist():
            raise ValueError('APP 必须包含一个 entry HAP 和 pack.info')
        data = archive.read(haps[0])
    if data != hap.read_bytes():
        raise ValueError('APP 内的 HAP 被打包工具改写，签名可能已丢失，禁止上传')
    embedded = signing / 'packed-entry.hap'
    embedded.write_bytes(data)
    run_private([java, '-jar', signer, 'verify-app', '-inFile', str(embedded),
                 '-outCertChain', str(signing / 'packed-verified.cer'),
                 '-outProfile', str(signing / 'packed-verified.p7b')])


def pack(root, signing, output, env):
    check_secrets(env)
    java = env.get('HARMONY_JAVA', 'java')
    signer = env['HARMONY_SIGNER']
    packer = env['HARMONY_PACKER']
    # Check that the signed provisioning profile belongs to this application and is a release profile.
    profile_json = signing / 'profile.json'
    run_private(['openssl', 'cms', '-verify', '-noverify', '-inform', 'DER', '-in', str(signing / 'release.p7b'), '-out', str(profile_json)])
    profile = json.loads(profile_json.read_text())
    if profile.get('bundle-info', {}).get('bundle-name') != BUNDLE_NAME or profile.get('type') != 'release':
        raise ValueError('HARMONY_PROFILE 必须是 com.yhsun.md 的发布 Profile，不能使用调试 Profile')
    haps = list((root / 'harmony/entry/build').rglob('*-unsigned.hap'))
    if len(haps) != 1:
        raise ValueError('应当生成一个未签名 entry HAP，实际为 %d 个' % len(haps))
    infos = list(haps[0].parent.glob('pack.info'))
    if len(infos) != 1:
        raise ValueError('缺少构建生成的 pack.info')
    version = json.loads((root / 'harmony/AppScope/app.json5').read_text())['app']['versionName']
    output.mkdir(parents=True, exist_ok=True)
    hap = output / ('easypocketmd-' + version + '-harmony.hap')
    run_private([java, '-jar', signer, 'sign-app', '-mode', 'localSign', '-keyAlias', env['HARMONY_KEY_ALIAS'], '-signAlg', 'SHA256withECDSA', '-appCertFile', str(signing / 'release.cer'), '-profileFile', str(signing / 'release.p7b'), '-inFile', str(haps[0]), '-keystoreFile', str(signing / 'release.p12'), '-outFile', str(hap), '-keyPwd', env['HARMONY_KEY_PASSWORD'], '-keystorePwd', env['HARMONY_STORE_PASSWORD'], '-signCode', '1'])
    run_private([java, '-jar', signer, 'verify-app', '-inFile', str(hap), '-outCertChain', str(signing / 'verified.cer'), '-outProfile', str(signing / 'verified.p7b')])
    app = output / ('easypocketmd-' + version + '-harmony.app')
    run_private([java, '-jar', packer, '--mode', 'app', '--hap-path', str(hap), '--pack-info-path', str(infos[0]), '--out-path', str(app), '--force', 'true', '--replace-pack-info', 'false'])
    for path in (hap, app):
        if not path.is_file() or not path.stat().st_size:
            raise ValueError('鸿蒙构建产物缺失：' + path.name)
    verify_app_contents(app, hap, signing, java, signer)
    print('APP 内 HAP 内容一致，签名和代码签名校验通过')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['prepare', 'pack'])
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--signing', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.command == 'prepare':
        version, code = prepare(args.root, args.signing, os.environ)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            stream.write('version=' + version + '\nversion_code=' + str(code) + '\n')
    else:
        if not args.output:
            parser.error('pack requires --output')
        pack(args.root, args.signing, args.output, os.environ)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, KeyError, zipfile.BadZipFile) as error:
        print('::error::' + str(error), file=sys.stderr)
        sys.exit(1)
