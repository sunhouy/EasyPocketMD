#!/usr/bin/env python3
"""Persistent HTTP-01 renewal for the host TLS edge, independent of releases."""
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

ROOT = Path('/www/wwwroot/easypocketmd/docker')
INSTALL = Path('/usr/local/lib/easypocketmd/ssl-renewal.py')
WEBROOT = Path('/www/wwwroot/static')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, timeout=600, **kwargs)


def nginx():
    panel = Path('/www/server/nginx/sbin/nginx')
    return str(panel) if panel.is_file() else shutil.which('nginx') or '/usr/bin/nginx'


def atomic(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(content)
            stream.flush()
            os.fchmod(stream.fileno(), mode)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def settings(channel):
    if channel not in ('main', 'dev'):
        raise RuntimeError('Invalid renewal channel')
    return ROOT / 'ssl' / (channel + '.json')


def install_certbot():
    if shutil.which('certbot'):
        return
    # Use an isolated domestic apt source; do not change host repository files.
    release = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    codename = release.get('VERSION_CODENAME', '').strip('"')
    if release.get('ID', '').strip('"') != 'ubuntu' or codename not in ('jammy', 'noble'):
        raise RuntimeError('Install certbot on this OS before deployment')
    architecture = subprocess.check_output(['dpkg', '--print-architecture'], text=True).strip()
    if architecture != 'amd64':
        raise RuntimeError('Install certbot using the correct architecture mirror before deployment')
    with tempfile.TemporaryDirectory(prefix='epmd-certbot-apt-') as directory:
        root = Path(directory)
        root.chmod(0o755)
        (root / 'lists' / 'partial').mkdir(parents=True)
        source = root / 'sources.list'
        source.write_text(''.join(f'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://mirrors.aliyun.com/ubuntu/ {suite} main universe\n' for suite in (codename, codename + '-updates', codename + '-security')))
        options = ['-o', 'Dir::Etc::sourcelist=' + str(source), '-o', 'Dir::Etc::sourceparts=-',
                   '-o', 'Dir::State::lists=' + str(root / 'lists'), '-o', 'APT::Get::List-Cleanup=0',
                   '-o', 'Acquire::Retries=2', '-o', 'Acquire::https::Timeout=30']
        run('apt-get', *options, 'update')
        run('apt-get', *options, 'install', '-y', '--no-install-recommends', 'certbot',
            env={**os.environ, 'DEBIAN_FRONTEND': 'noninteractive'})


def configure(release, channel):
    target = settings(channel)
    config = json.loads((Path(release) / 'config.json').read_text())
    domain = config['domain']
    if not re.fullmatch(r'(?=.{1,253}$)[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*', domain):
        raise RuntimeError('Invalid certificate domain')
    run(nginx(), '-t')
    install_certbot()
    atomic(INSTALL, Path(__file__).read_bytes(), 0o700)
    atomic(target, json.dumps({'domain': domain, 'email': config.get('ssl_email', ''),
        'cert_name': 'epmd-' + channel + '-' + domain, 'certbot': shutil.which('certbot')}).encode())
    (WEBROOT / '.well-known' / 'acme-challenge').mkdir(parents=True, exist_ok=True)
    unit = 'epmd-ssl-' + channel
    service = f'''[Unit]
Description=EasyPocketMD {channel} SSL certificate renewal
Wants=network-online.target
After=network-online.target
ConditionPathExists={target}

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 {INSTALL} renew {channel}
MemoryMax=192M
CPUQuota=25%
Nice=10
TimeoutStartSec=15min
'''
    timer = f'''[Unit]
Description=Check EasyPocketMD {channel} SSL certificate twice daily

[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=1h
Persistent=true
Unit={unit}.service

[Install]
WantedBy=timers.target
'''
    atomic(Path('/etc/systemd/system') / (unit + '.service'), service.encode(), 0o644)
    atomic(Path('/etc/systemd/system') / (unit + '.timer'), timer.encode(), 0o644)
    run('systemctl', 'daemon-reload')
    run('systemctl', 'enable', unit + '.timer')


def deploy_certificate(channel):
    config = json.loads(settings(channel).read_text())
    lineage = Path(os.environ.get('RENEWED_LINEAGE', '')).resolve()
    expected = Path('/etc/letsencrypt/live') / config['cert_name']
    if lineage != expected.resolve():
        raise RuntimeError('Unexpected certificate lineage')
    cert = Path('/www/server/panel/vhost/cert') / config['domain']
    lock = ROOT / 'deployment.lock'
    with lock.open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        if ((cert / '.epmd-auto-renew').is_file()
                and all((cert / name).is_file() and (cert / name).read_bytes() == (lineage / name).read_bytes()
                        for name in ('privkey.pem', 'fullchain.pem'))):
            return
        backup = {}
        try:
            run('openssl', 'x509', '-in', str(lineage / 'fullchain.pem'), '-noout', '-checkend', '86400', stdout=subprocess.DEVNULL)
            for name in ('privkey.pem', 'fullchain.pem'):
                path = cert / name
                backup[path] = path.read_bytes() if path.exists() else None
                atomic(path, (lineage / name).read_bytes())
            run(nginx(), '-t')
            run(nginx(), '-s', 'reload')
            atomic(cert / '.epmd-auto-renew', config['cert_name'].encode())
        except BaseException:
            for path, content in backup.items():
                if content is None:
                    path.unlink(missing_ok=True)
                else:
                    atomic(path, content)
            # If reload already occurred, restore the old certificate in workers.
            if subprocess.run([nginx(), '-t'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                subprocess.run([nginx(), '-s', 'reload'])
            raise


def renew(channel):
    config = json.loads(settings(channel).read_text())
    run(nginx(), '-t')
    hook = shlex.join(['/usr/bin/python3', str(INSTALL), 'deploy-certificate', channel])
    args = [config['certbot'], 'certonly', '--non-interactive', '--agree-tos', '--webroot',
            '--webroot-path', str(WEBROOT), '--cert-name', config['cert_name'],
            '-d', config['domain'], '--keep-until-expiring', '--deploy-hook', hook]
    if config['email']:
        args.extend(['--email', config['email']])
    else:
        args.append('--register-unsafely-without-email')
    run(*args)
    # Also retry installing an already-issued certificate if an earlier hook
    # failed because another site's nginx configuration was invalid.
    lineage = Path('/etc/letsencrypt/live') / config['cert_name']
    if (lineage / 'fullchain.pem').is_file():
        os.environ['RENEWED_LINEAGE'] = str(lineage)
        deploy_certificate(channel)


if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'configure':
        configure(sys.argv[2], sys.argv[3])
    elif action == 'start':
        channel = sys.argv[2]
        settings(channel)
        run('systemctl', 'start', 'epmd-ssl-' + channel + '.timer')
        run('systemctl', 'start', '--no-block', 'epmd-ssl-' + channel + '.service')
    elif action == 'renew':
        renew(sys.argv[2])
    elif action == 'deploy-certificate':
        deploy_certificate(sys.argv[2])
    else:
        raise SystemExit('Unknown SSL action')
