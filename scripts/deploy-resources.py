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


def configure_sandbox_budget():
    # Five independent Python limits must not exhaust a small host together.
    # The shared slice covers both deployment slots and both site channels.
    if not shutil.which('systemctl') or not Path('/sys/fs/cgroup/cgroup.controllers').exists():
        raise RuntimeError('Python concurrency requires systemd/cgroup v2 aggregate resource limits')
    driver = subprocess.check_output(['docker', 'info', '--format', '{{.CgroupDriver}}'], text=True).strip()
    if driver != 'systemd':
        raise RuntimeError('Docker must use the systemd cgroup driver for shared Python resource limits')
    total = memory()['MemTotal'] // MIB
    budget = max(256, min(2560, int(total * (.4 if small_host() else .5))))
    quota = 100 if small_host() else min(500, (os.cpu_count() or 1) * 75)
    unit = Path('/etc/systemd/system/epmd-python.slice')
    temporary = unit.with_suffix('.slice.next')
    temporary.write_text(f'[Unit]\nDescription=EasyPocketMD Python sandbox aggregate budget\n\n[Slice]\nMemoryHigh={int(budget * .9)}M\nMemoryMax={budget}M\nMemorySwapMax=0\nCPUQuota={quota}%\n')
    temporary.chmod(0o644)
    temporary.replace(unit)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'start', 'epmd-python.slice'], check=True)
    return 'epmd-python.slice'


@contextlib.contextmanager
def deployment_memory(channel):
    if channel not in ('main', 'dev'):
        raise RuntimeError('Invalid deployment channel')
    # Image import is streaming and daemon-throttled. Never take the live site
    # offline for a potentially long import; capacity failures retain the site.
    if memory()['MemAvailable'] < 192 * MIB:
        raise RuntimeError('Image import needs 192 MiB available memory; retained current deployment')
    yield


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
    if available < 192 * MIB:
        raise RuntimeError(f'Not enough available memory for image import: need 192 MiB, have {available // MIB} MiB; current deployment retained')
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
                settings = {'memory.high': str((128 if available < 384 * MIB else 256) * MIB), 'cpu.max': '50000 100000', 'io.weight': 'default 10'}
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


def transfer_plan(cache, manifest):
    objects = {member['sha256']: member.get('compressed_size', member['size']) for member in manifest['members']}
    missing = {digest: size for digest, size in objects.items()
               if not (Path(cache) / 'objects' / (digest + '.gz')).exists()}
    total, pending = sum(objects.values()), sum(missing.values())
    print(f'Image objects: {len(objects)} total, {len(objects) - len(missing)} reused, '
          f'{len(missing)} missing; compressed total {total / MIB:.2f} MiB, '
          f'reused {(total - pending) / MIB:.2f} MiB, upload {pending / MIB:.2f} MiB', flush=True)
    if missing:
        largest = sorted(missing.values(), reverse=True)[:3]
        print('Largest missing objects (MiB): ' + ', '.join(f'{size / MIB:.2f}' for size in largest), flush=True)
    return missing


@contextlib.contextmanager
def stage(name):
    started = time.monotonic()
    print(f'START {name}', flush=True)
    try:
        yield
    except BaseException:
        print(f'FAILED {name} ({time.monotonic() - started:.1f}s)', flush=True)
        raise
    else:
        print(f'DONE {name} ({time.monotonic() - started:.1f}s)', flush=True)


if __name__ == '__main__':
    import fcntl
    import json
    import sys
    action, cache, release = sys.argv[1:4]
    manifest = json.loads((Path(release) / 'release.json').read_text())
    if action not in ('transfer', 'deploy'):
        raise SystemExit('Unknown resource guard action')
    lock = Path(cache).parent / 'deployment.lock'
    with lock.open('a') as handle:
        try: fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise SystemExit('Another server deployment is in progress')
        # Free obsolete project artifacts before both the large upload and import.
        # Retain this candidate even when retrying an upload older than one day.
        with stage('Clean obsolete deployment data'):
            subprocess.run([sys.executable, str(Path(release) / 'deploy-docker.py'), 'cleanup', sys.argv[4], release],
                           check=True, env={**os.environ, 'EPMD_DEPLOYMENT_LOCK_HELD': '1'})
        if action == 'transfer':
            missing = transfer_plan(cache, manifest)
            with stage('Inspect installed image layers and import capacity'):
                reserve = required_import_space(manifest)
            needed = sum(missing.values()) + reserve
            print(f'Disk capacity: need {needed / MIB:.2f} MiB including import reserve, free {shutil.disk_usage(cache).free / MIB:.2f} MiB', flush=True)
            if shutil.disk_usage(cache).free < needed:
                raise SystemExit(f'Insufficient disk for transfer + import after cleanup: need {needed // MIB} MiB free. Current services retained.')
        else:
            # Check disk before taking the current service offline.
            with stage('Check import capacity'):
                required = required_import_space(manifest)
            if shutil.disk_usage(cache).free < required:
                raise RuntimeError(f'Not enough disk for image import: need {required // MIB} MiB free; current services retained')
            # Validate the existing TLS edge and prepare renewal before stopping
            # any services. Issuance starts only after the new HTTP route is live.
            with stage('Prepare HTTPS configuration'):
                subprocess.run([sys.executable, str(Path(release) / 'ssl-renewal.py'), 'configure', release, sys.argv[4]], check=True)
            with deployment_memory(sys.argv[4]):
                with stage('Verify cached objects and import Docker images'):
                    subprocess.run([sys.executable, str(Path(release) / 'image-cas.py'), 'load', cache, str(Path(release) / 'release.json')], check=True)
                with stage('Start candidate, check health and switch traffic'):
                    subprocess.run([sys.executable, str(Path(release) / 'deploy-docker.py'), 'deploy', sys.argv[4], release], check=True, env={**os.environ, 'EPMD_DEPLOYMENT_LOCK_HELD': '1'})
            with stage('Start certificate renewal'):
                subprocess.run([sys.executable, str(Path(release) / 'ssl-renewal.py'), 'start', sys.argv[4]], check=True)
