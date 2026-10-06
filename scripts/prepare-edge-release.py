#!/usr/bin/env python3
"""Reuse the built gateway image on the regional edge; keep all state at origin."""
import ipaddress
import json
import os
from pathlib import Path
import shutil
import subprocess


def prepare(origin, target, images, origin_ip):
    origin_ip = str(ipaddress.ip_address(origin_ip))
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    (target / 'app.env').unlink(missing_ok=True)
    for source in origin.iterdir():
        # The edge needs TLS/control metadata, never database/JWT/API credentials.
        if source.is_file() and source.name != 'app.env':
            shutil.copy2(source, target / source.name)
    config = json.loads((target / 'config.json').read_text())
    config.update(role='edge', origin_ip=origin_ip)
    (target / 'config.json').write_text(json.dumps(config))
    manifest = json.loads((target / 'release.json').read_text())
    gateway = manifest['images']['gateway']
    # Build a small manifest with only gateway layers using the existing CAS exporter.
    subprocess.run(['python3', 'scripts/image-cas.py', 'export', str(images), 'gateway=' + gateway], check=True)
    for name in ('release.json', 'release.sha256'):
        shutil.copy2(images / name, target / name)


if __name__ == '__main__':
    prepare(Path('docker-control'), Path('docker-control-us'), Path('image-cas-us'), os.environ['ORIGIN_IP'])
