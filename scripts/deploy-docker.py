#!/usr/bin/env python3
"""Start a Docker release, validate it, then atomically change the TLS edge.

MySQL/Redis and the existing TLS edge stay in place; application services and
static delivery run in containers. All images are already loaded offline.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request

import importlib.util
_spec = importlib.util.spec_from_file_location('deploy_resources', Path(__file__).with_name('deploy-resources.py'))
resources = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(resources)

ROOT = Path('/www/wwwroot/easypocketmd/docker')
os.environ['PATH'] = '/www/server/nodejs/v24.14.1/bin:' + os.environ.get('PATH', '')


def command(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def docker(*args):
    return command('docker', *args, stdout=subprocess.DEVNULL)


def remove(name):
    subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def cleanup_sandboxes(owner):
    result = subprocess.run(['docker', 'ps', '-aq', '--filter', 'label=easypocketmd.sandbox-owner=' + owner],
                            stdout=subprocess.PIPE, text=True, check=True)
    for container in result.stdout.split():
        remove(container)


def write_atomic(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.next')
    temporary.write_text(content)
    temporary.chmod(mode)
    temporary.replace(path)


def migrate_data(channel, shared):
    legacy = Path('/www/wwwroot/js' if channel == 'main' else '/www/wwwroot/js_dev')
    def copy_new(source, target):
        if not Path(target).exists() or Path(source).stat().st_mtime_ns > Path(target).stat().st_mtime_ns:
            shutil.copy2(source, target)
        return target
    for name in ('uploads', 'user_uploads', 'user_files', 'avatars', 'screenshots'):
        target, source = shared / name, legacy / name
        target.mkdir(parents=True, exist_ok=True)
        if source.is_dir() and source.resolve() != target.resolve():
            shutil.copytree(source, target, dirs_exist_ok=True, copy_function=copy_new)


def health(port, checksums):
    for attempt in range(40):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=3) as response:
                if json.load(response).get('code') != 200:
                    raise RuntimeError('API unhealthy')
            for path, expected in checksums.items():
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/{path}', timeout=5) as response:
                    digest = hashlib.sha256()
                    while chunk := response.read(64 * 1024):
                        digest.update(chunk)
                    if digest.hexdigest() != expected:
                        raise RuntimeError('Served WASM checksum mismatch: ' + path)
            return
        except Exception:
            if attempt == 39:
                raise RuntimeError('Candidate API/static health check failed; existing service retained')
            time.sleep(2)


def activate(release, channel, slot, current):
    manifest = json.loads((release / 'release.json').read_text())
    config = json.loads((release / 'config.json').read_text())
    images = manifest['images']
    shared = Path('/www/wwwroot/js_shared' if channel == 'main' else '/www/wwwroot/js_dev_shared')
    migrate_data(channel, shared)
    static = Path('/www/wwwroot/static'); static.mkdir(parents=True, exist_ok=True)
    base = (3150 if channel == 'main' else 3250) + slot
    app_port, print_port, gateway_port, print_gateway_port = base, base + 10, base + 30, base + 32
    names = {role: f'epmd-{channel}-{role}-{slot}' for role in ('app', 'print', 'gateway')}
    sandbox_group = resources.configure_sandbox_budget()
    cleanup_sandboxes(names['app'])
    for name in names.values():
        remove(name)
    common = ['run', '-d', '--pull=never', '--restart=unless-stopped', '--init', '--network=host',
              '--label', 'easypocketmd.managed=true', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=3']
    socket = '/var/run/docker.sock'
    if not Path(socket).exists():
        raise RuntimeError('Docker socket missing')
    mounts = []
    for name in ('uploads', 'user_uploads', 'user_files', 'avatars', 'screenshots'):
        mounts.extend(['-v', f'{shared / name}:/app/{name}'])
    # Mount only into the trusted API orchestrator, never submitted-code sandboxes.
    mounts.extend(['-v', f'{socket}:{socket}', '-v', f'{static}:/www/wwwroot/static:ro'])
    backups = {}
    nginx = '/www/server/nginx/sbin/nginx' if Path('/www/server/nginx/sbin/nginx').is_file() else shutil.which('nginx') or '/usr/bin/nginx'
    switched = False
    try:
        docker(*common, '--name', names['app'], '--env-file', str(release / 'app.env'),
               '-e', f'PORT={app_port}', '-e', 'HOST=127.0.0.1', '-e', f"EPMD_SANDBOX_OWNER={names['app']}", '-e', f"PYTHON_SANDBOX_IMAGE={images['python']}",
               '-e', f'PYTHON_SANDBOX_CGROUP={sandbox_group}',
               f"--memory={resources.container_limits('app')}m", f"--memory-swap={resources.container_limits('app')}m", '-e', f"NODE_OPTIONS=--max-old-space-size={resources.container_limits('app') // 2}", '--pids-limit=256', '--cpus=1', *mounts, images['app'])
        docker(*common, '--name', names['print'], f"--memory={resources.container_limits('print')}m", f"--memory-swap={resources.container_limits('print')}m", '--cpus=.5', '--pids-limit=64', images['print'], '--port', str(print_port))
        docker(*common, '--name', names['gateway'], f"--memory={resources.container_limits('gateway')}m", f"--memory-swap={resources.container_limits('gateway')}m", '--cpus=.5', '--pids-limit=64',
               '-v', f'{static}:/www/wwwroot/static:ro', '-e', f'APP_PORT={app_port}',
               '-e', f'PRINT_PORT={print_port}', '-e', f'GATEWAY_PORT={gateway_port}',
               '-e', f'PRINT_GATEWAY_PORT={print_gateway_port}', images['gateway'])
        health(gateway_port, config['wasm'])
        # Probe the exact app-configured sandbox before changing live traffic.
        command('docker', 'exec', names['app'], './node_modules/.bin/tsx',
                'scripts/check-python-sandbox.ts', '--input-only', stdout=subprocess.DEVNULL)
        # Verify the print service responds to a real WebSocket handshake.
        command('docker', 'exec', names['print'], 'python', '-c',
                'import asyncio,websockets\nasync def check():\n async with websockets.connect("ws://127.0.0.1:' + str(print_port) + '") as ws: pass\nasyncio.run(check())',
                stdout=subprocess.DEVNULL)
        domain = config['domain']
        if not re.fullmatch(r'[A-Za-z0-9.-]+', domain):
            raise RuntimeError('Invalid deployment domain')
        cert = Path('/www/server/panel/vhost/cert') / domain
        cert.mkdir(parents=True, exist_ok=True)
        managed_cert = ((cert / '.epmd-auto-renew').is_file()
                        and (cert / 'privkey.pem').is_file()
                        and (cert / 'fullchain.pem').is_file())
        for source, target in [('tls.key', 'privkey.pem'), ('tls.pem', 'fullchain.pem')]:
            supplied = release / source
            if not managed_cert and supplied.exists() and (channel == 'main' or not (cert / target).exists()):
                destination = cert / target
                backups[destination] = destination.read_bytes() if destination.exists() else None
                shutil.copy2(supplied, destination); destination.chmod(0o600 if target.endswith('key.pem') else 0o644)
        if not (cert / 'privkey.pem').is_file() or not (cert / 'fullchain.pem').is_file():
            raise RuntimeError('TLS certificate missing; existing service retained')
        vhost = Path('/www/server/panel/vhost/nginx') / (domain + '.conf')
        backups[vhost] = vhost.read_bytes() if vhost.exists() else None
        # Only advertise the hostname covered by this channel's certificate.
        domains = domain
        contents = f'''server {{
    listen 80;
    server_name {domains};
    location ^~ /.well-known/acme-challenge/ {{ root /www/wwwroot/static; try_files $uri =404; }}
    location / {{ return 301 https://$host$request_uri; }}
}}
server {{
    listen 443 ssl;
    server_name {domains};
    ssl_certificate {cert}/fullchain.pem;
    ssl_certificate_key {cert}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 100m;
    location / {{
        proxy_pass http://127.0.0.1:{gateway_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_buffering off;
    }}
}}
'''
        write_atomic(vhost, contents, 0o644)
        if channel == 'main':
            print_vhost = Path('/www/server/panel/vhost/nginx/print.yhsun.cn.conf')
            if not print_vhost.exists():
                raise RuntimeError('Existing print.yhsun.cn TLS vhost missing')
            backups[print_vhost] = print_vhost.read_bytes()
            old = print_vhost.read_text()
            new, count = re.subn(r'proxy_pass\s+http://(?:127\.0\.0\.1|localhost):(?:3060|3182|3183)\b',
                                f'proxy_pass http://127.0.0.1:{print_gateway_port}', old)
            if not count:
                raise RuntimeError('Print TLS proxy target not found')
            write_atomic(print_vhost, new, 0o644)
        command(nginx, '-t')
        command(nginx, '-s', 'reload')
        candidate = {'release': str(release), 'slot': slot, 'containers': names}
        write_atomic(ROOT / ('state-' + channel + '.json'), json.dumps({'current': candidate, 'previous': current}))
        switched = True
        return candidate
    finally:
        if not switched:
            for path, content in backups.items():
                if content is None:
                    path.unlink(missing_ok=True)
                else:
                    path.write_bytes(content)
            subprocess.run([nginx, '-s', 'reload'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for name in names.values():
                remove(name)


def main():
    action, channel = sys.argv[1:3]
    if channel not in ('main', 'dev'):
        raise RuntimeError('Invalid channel')
    ROOT.mkdir(parents=True, exist_ok=True)
    state_file = ROOT / ('state-' + channel + '.json')
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    current = state.get('current')
    if action == 'rollback':
        previous = state.get('previous')
        if not previous:
            raise RuntimeError('No previous Docker release available')
        release = Path(previous['release'])
    elif action == 'deploy':
        release = Path(sys.argv[3]).resolve()
    else:
        raise RuntimeError('Invalid action')
    slot = 1 - current['slot'] if current else 0
    paused = []
    try:
        if current and resources.small_host():
            # A small host cannot hold two complete releases safely. Briefly pause
            # this site's old services, then restore them if activation fails.
            cleanup_sandboxes(current['containers']['app'])
            for name in current['containers'].values():
                command('docker', 'stop', '--time', '10', name, stdout=subprocess.DEVNULL)
                paused.append(name)
        candidate = activate(release, channel, slot, current)
    except BaseException:
        for name in paused:
            command('docker', 'start', name, stdout=subprocess.DEVNULL)
        raise
    # Old connections get a grace period; rollback keeps the old immutable release.
    if current:
        for name in current['containers'].values():
            subprocess.run(['docker', 'stop', '--time', '30', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cleanup_sandboxes(current['containers']['app'])
    # Stop only this project's legacy PM2 processes, after successful traffic switch.
    pm2 = shutil.which('pm2') or '/www/server/nodejs/v24.14.1/bin/pm2'
    if Path(pm2).is_file():
        legacy = ['md-server-green', 'md-server-blue', 'print-server'] if channel == 'main' else ['md-dev-server-green', 'md-dev-server-blue']
        for name in legacy:
            subprocess.run([pm2, 'delete', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run([pm2, 'save'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # Capture final uploads from legacy processes after their shutdown; newer
    # files already written by containers win by modification time.
    migrate_data(channel, Path('/www/wwwroot/js_shared' if channel == 'main' else '/www/wwwroot/js_dev_shared'))
    config = json.loads((release / 'config.json').read_text())
    filename = 'version.txt' if channel == 'main' else 'version-dev.txt'
    write_atomic(Path('/www/wwwroot/static') / filename, config['version'] + '\n', 0o644)
    print(f'Docker {action} completed: {channel}, slot {slot}')


if __name__ == '__main__':
    main()
