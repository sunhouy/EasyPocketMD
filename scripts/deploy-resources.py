"""Bound offline imports on small hosts without stopping unrelated services."""
import contextlib
import os
from pathlib import Path
import shutil
import subprocess

MIB = 1024 * 1024


def memory():
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        values[key] = int(value.split()[0]) * 1024
    return values


def small_host():
    return memory()['MemTotal'] < 3 * 1024 * MIB


def container_limits(role):
    limits = {'app': 512, 'print': 96, 'gateway': 48} if small_host() else {'app': 1024, 'print': 256, 'gateway': 128}
    return limits[role]


@contextlib.contextmanager
def import_budget(directory, manifest):
    total = sum(member['size'] for member in manifest['members'])
    # Docker's content store and unpacked snapshots can coexist during import.
    required = total * 2 + 1024 * MIB
    free = shutil.disk_usage(directory).free
    if free < required:
        raise RuntimeError(f'Not enough disk for a safe image import: need {required // MIB} MiB free, have {free // MIB} MiB; retained current deployment')
    if memory()['MemAvailable'] < 384 * MIB:
        raise RuntimeError('Not enough available memory for image import (384 MiB minimum); retained current deployment')
    changed = []
    docker_guarded = False
    try:
        if small_host():
            if not Path('/sys/fs/cgroup/cgroup.controllers').exists() or not shutil.which('systemctl'):
                raise RuntimeError('Small-memory deployment requires systemd/cgroup v2 to throttle Docker imports safely')
            # docker load is handled by daemon workers, so limiting only its CLI
            # does not protect the host. Throttle daemon cgroups temporarily.
            for unit in ('docker.service', 'containerd.service'):
                result = subprocess.run(['systemctl', 'show', unit, '--property=ActiveState', '--value'], capture_output=True, text=True, check=True)
                if result.stdout.strip() != 'active':
                    continue
                group = subprocess.check_output(['systemctl', 'show', unit, '--property=ControlGroup', '--value'], text=True).strip()
                if not group or group == '/':
                    raise RuntimeError('Invalid daemon cgroup: ' + unit)
                if unit == 'docker.service': docker_guarded = True
                root = Path('/sys/fs/cgroup') / group.lstrip('/')
                settings = {'memory.high': str(256 * MIB), 'cpu.max': '50000 100000', 'io.weight': 'default 10'}
                for name, value in settings.items():
                    path = root / name
                    old = path.read_text().strip()
                    # Keep an existing stricter administrator memory limit.
                    if name == 'memory.high' and old != 'max' and int(old) < int(value):
                        continue
                    if name == 'cpu.max':
                        quota, period = old.split()
                        if quota != 'max' and int(quota) / int(period) <= .5:
                            continue
                    changed.append((path, old))
                    path.write_text(value)
            if not docker_guarded:
                raise RuntimeError('Unable to locate active Docker daemon resource cgroup')
        os.nice(10)
        yield
    finally:
        for path, value in reversed(changed):
            try:
                path.write_text(value)
            except OSError as error:
                print(f'Could not restore temporary import limit {path}: {error}', flush=True)


if __name__ == '__main__':
    import fcntl
    import json
    import sys
    action, cache, release = sys.argv[1:4]
    manifest = json.loads((Path(release) / 'release.json').read_text())
    if action == 'transfer':
        missing = {m['sha256']:m.get('compressed_size',m['size']) for m in manifest['members']
                   if not (Path(cache) / 'objects' / (m['sha256'] + '.gz')).exists()}
        reserve = sum(m['size'] for m in manifest['members']) * 2 + 1024 * MIB
        needed = sum(missing.values()) + reserve
        if shutil.disk_usage(cache).free < needed:
            raise SystemExit(f'Insufficient disk for transfer + import: need {needed // MIB} MiB free. Current services retained; clean obsolete backups/releases first.')
    elif action == 'deploy':
        lock = Path(cache).parent / 'deployment.lock'
        with lock.open('a') as handle:
            try: fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: raise SystemExit('Another server deployment is in progress')
            subprocess.run([sys.executable, str(Path(release) / 'image-cas.py'), 'load', cache, str(Path(release) / 'release.json')], check=True)
            subprocess.run([sys.executable, str(Path(release) / 'deploy-docker.py'), 'deploy', sys.argv[4], release], check=True)
    else:
        raise SystemExit('Unknown resource guard action')
