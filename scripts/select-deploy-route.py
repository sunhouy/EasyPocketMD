#!/usr/bin/env python3
"""Choose direct SSH or a US TCP relay using acknowledged upload throughput.

Only a one-MiB zero stream is sent to /dev/null. No credentials/images are copied
to the relay; the original SSH session remains encrypted end-to-end.
"""
import ipaddress
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time

SAMPLE = b'\0' * (1024 * 1024)


def probe(options, destination):
    started = time.monotonic()
    try:
        subprocess.run(['sshpass', '-e', 'ssh', *options, destination, 'cat >/dev/null'],
                       input=SAMPLE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                       check=True, timeout=45)
        return len(SAMPLE) / max(time.monotonic() - started, .001)
    except (subprocess.SubprocessError, OSError):
        return None


def select(key, config):
    user, host, relay = (os.environ[name] for name in ('SERVER_USER', 'SERVER_HOST', 'IP_US'))
    # Never resolve the geo-routed public hostname as a relay/origin address.
    ipaddress.ip_address(host); ipaddress.ip_address(relay)
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text('Host *\n    Compression no\n'); config.chmod(0o600)
    known_key = os.environ.get('SERVER_SSH_HOST_KEY', '')
    if known_key:
        known_hosts = Path.home() / '.ssh' / 'known_hosts'
        known_hosts.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with known_hosts.open('a') as output:
            output.write(known_key + '\n')
    common = ['-o', 'ConnectTimeout=10', '-o', 'Compression=no', '-o', 'ServerAliveInterval=15',
              '-o', 'ServerAliveCountMax=1', '-o', 'StrictHostKeyChecking=' + ('yes' if known_key else 'accept-new')]
    destination = user + '@' + host
    print('Probing origin direct SSH upload (1 MiB, at most 45s)', flush=True)
    direct = probe(common, destination)
    command = shlex.join(['ssh', '-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
                          '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new',
                          '-W', '[%h]:%p', user + '@' + relay])
    relay_config = 'Host *\n    Compression no\n    ProxyCommand ' + command + '\n'
    config.write_text(relay_config)
    print('Probing origin SSH upload through US (1 MiB, at most 45s)', flush=True)
    routed = probe([*common, '-F', str(config)], destination)
    def speed(value):
        return f'{value / 1024:.1f} KiB/s' if value is not None else 'unavailable'
    print(f'Origin route samples: direct={speed(direct)}, via-US={speed(routed)}', flush=True)
    if direct is None and routed is None:
        config.unlink(missing_ok=True)
        raise RuntimeError('Neither origin SSH route passed; no image transfer started')
    use_relay = routed is not None and (direct is None or routed > direct * 1.25)
    if not use_relay:
        config.write_text('Host *\n    Compression no\n')
    print('Origin image transfer route: ' + ('via-US SSH TCP relay' if use_relay else 'direct SSH'), flush=True)
    return use_relay


if __name__ == '__main__':
    select(Path(sys.argv[1]), Path(sys.argv[2]))
