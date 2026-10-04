"""Bound offline imports on small hosts without stopping unrelated services."""
import contextlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

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
def deployment_memory(channel):
    if channel not in ('main', 'dev'):
        raise RuntimeError('Invalid deployment channel')
    stopped = []
    completed = False
    try:
        if small_host() or memory()['MemAvailable'] < 384 * MIB:
            # Release this channel's memory BEFORE importing, not just before
            # activation. Match only managed application containers, never DB,
            # TLS edge, another channel, or unrelated services.
            names = subprocess.check_output(['docker', 'ps', '--filter',
                'label=easypocketmd.managed=true', '--format', '{{.Names}}'], text=True).split()
            names = [name for name in names if re.fullmatch(
                rf'epmd-{channel}-(app|print|gateway)-[01]', name)]
            names.sort(key=lambda name: ('-app-' not in name, name))
            for name in names:
                print(f'Temporarily stopping {name} to make room for image import', flush=True)
                # Record before stopping: a failed CLI may still have stopped it.
                stopped.append(name)
                subprocess.run(['docker', 'stop', '--time', '10', name], check=True, stdout=subprocess.DEVNULL)
                if '-app-' in name:
                    workers = subprocess.check_output(['docker', 'ps', '-q', '--filter',
                        'label=easypocketmd.sandbox-owner=' + name], text=True).split()
                    for worker in workers:
                        # In-flight executions cannot survive stopping their API.
                        subprocess.run(['docker', 'stop', '--time', '3', worker], check=True, stdout=subprocess.DEVNULL)
            if stopped:
                for _ in range(20):
                    if memory()['MemAvailable'] >= 384 * MIB:
                        break
                    time.sleep(.25)
                print(f"Available memory after stopping old services: {memory()['MemAvailable'] // MIB} MiB", flush=True)
        yield
        completed = True
    finally:
        if not completed:
            # Attempt every restart even if one fails; preserve the original
            # import/activation exception and report rollback failures clearly.
            for name in stopped:
                result = subprocess.run(['docker', 'start', name], stdout=subprocess.DEVNULL)
                if result.returncode:
                    print(f'Could not restore old container {name}; manual restart required', flush=True)


def required_import_space(manifest):
    members = {m['sha256']:m for m in manifest['members']}
    image_ids = subprocess.check_output(['docker','image','ls','--quiet','--no-trunc'], text=True).split()
    known = set()
    if image_ids:
        for image in json.loads(subprocess.check_output(['docker','image','inspect',*sorted(set(image_ids))], text=True)):
            known.update(image.get('RootFS',{}).get('Layers',[]))
    growth = sum(m.get('expanded_size',m['size']) for m in members.values() if m.get('layer_diff_id') not in known)
    status = subprocess.check_output(['docker','info','--format','{{json .DriverStatus}}'], text=True)
    # containerd streams blobs into its content store and reuses existing layers.
    # Classic Docker also extracts the full archive to a temporary directory.
    # Existing DiffIDs may be repacked with a different compressed blob digest.
    # Reserve one content copy for those blobs, even though their snapshots reuse.
    existing_content = sum(m['size'] for m in members.values() if m.get('layer_diff_id') in known)
    temporary = existing_content if 'io.containerd.snapshotter.v1' in status else sum(m['size'] for m in members.values())
    return temporary + growth * 2 + 512 * MIB


@contextlib.contextmanager
def import_budget(directory, manifest):
    required = required_import_space(manifest)
    free = shutil.disk_usage(directory).free
    if free < required:
        raise RuntimeError(f'Not enough disk for a safe image import: need {required // MIB} MiB free, have {free // MIB} MiB; retained current deployment')
    available = memory()['MemAvailable']
    if available < 384 * MIB:
        raise RuntimeError(f'Not enough available memory for image import: need 384 MiB, have {available // MIB} MiB; current deployment will be restored')
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
        reserve = required_import_space(manifest)
        needed = sum(missing.values()) + reserve
        if shutil.disk_usage(cache).free < needed:
            raise SystemExit(f'Insufficient disk for transfer + import: need {needed // MIB} MiB free. Current services retained; clean obsolete backups/releases first.')
    elif action == 'deploy':
        lock = Path(cache).parent / 'deployment.lock'
        with lock.open('a') as handle:
            try: fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: raise SystemExit('Another server deployment is in progress')
            # Check disk before taking the current service offline.
            required = required_import_space(manifest)
            if shutil.disk_usage(cache).free < required:
                raise RuntimeError(f'Not enough disk for image import: need {required // MIB} MiB free; current services retained')
            # Validate the existing TLS edge and prepare renewal before stopping
            # any services. Issuance starts only after the new HTTP route is live.
            subprocess.run([sys.executable, str(Path(release) / 'ssl-renewal.py'), 'configure', release, sys.argv[4]], check=True)
            with deployment_memory(sys.argv[4]):
                subprocess.run([sys.executable, str(Path(release) / 'image-cas.py'), 'load', cache, str(Path(release) / 'release.json')], check=True)
                subprocess.run([sys.executable, str(Path(release) / 'deploy-docker.py'), 'deploy', sys.argv[4], release], check=True)
            subprocess.run([sys.executable, str(Path(release) / 'ssl-renewal.py'), 'start', sys.argv[4]], check=True)
    else:
        raise SystemExit('Unknown resource guard action')
