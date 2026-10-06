#!/usr/bin/env python3
"""Choose direct SSH or a US TCP relay using acknowledged upload throughput.

A bounded zero stream is discarded after acknowledgement by the origin. No credentials/images are copied
to the relay; the original SSH session remains encrypted end-to-end.
"""
import ipaddress
import os
import json
import select as io_select
from pathlib import Path
import shlex
import subprocess
import sys
import time

MAX_SAMPLE_BYTES = 64 * 1024 * 1024
# Remote acknowledgement measures sustained bytes received, excluding SSH startup.
SAMPLE_SERVER = """import json,os,select,time
received=0; started=None; deadline=time.monotonic()+20
while time.monotonic()<deadline:
 if not select.select([0],[],[],max(0,deadline-time.monotonic()))[0]: break
 chunk=os.read(0,65536)
 if not chunk: break
 if started is None: started=time.monotonic(); deadline=started+20
 received+=len(chunk)
print(json.dumps({'bytes':received,'seconds':time.monotonic()-started if started is not None else 0}))
"""


def probe(options, destination):
    process = None
    try:
        command = shlex.join(['python3', '-u', '-c', SAMPLE_SERVER])
        process = subprocess.Popen(['sshpass', '-e', 'ssh', *options, destination, command],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        descriptor = process.stdin.fileno(); os.set_blocking(descriptor, False)
        deadline, sent = time.monotonic() + 35, 0
        chunk = b'\0' * 65536
        while sent < MAX_SAMPLE_BYTES and time.monotonic() < deadline:
            if process.poll() is not None: break
            if not io_select.select([], [descriptor], [], .2)[1]: continue
            try:
                sent += os.write(descriptor, chunk[:min(len(chunk), MAX_SAMPLE_BYTES - sent)])
            except BlockingIOError: continue
            except BrokenPipeError: break
        try: process.stdin.close()
        except BrokenPipeError: pass
        process.stdin = None
        output, _ = process.communicate(timeout=10)
        if process.returncode: return None
        result = json.loads(output)
        size, elapsed = result['bytes'], result['seconds']
        if not 0 < size <= min(sent, MAX_SAMPLE_BYTES) or not 0 < elapsed <= 40: return None
        return size / elapsed
    except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError):
        return None
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            try: process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                process.stdout.close(); process.stderr.close()


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
    print('Probing sustained origin direct SSH upload (20s reception, maximum 64 MiB)', flush=True)
    direct = probe(common, destination)
    command = shlex.join(['ssh', '-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
                          '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new',
                          '-W', '[%h]:%p', user + '@' + relay])
    relay_config = 'Host *\n    Compression no\n    ProxyCommand ' + command + '\n'
    config.write_text(relay_config)
    print('Probing sustained origin SSH upload through US (20s reception, maximum 64 MiB)', flush=True)
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
