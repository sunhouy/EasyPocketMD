#!/usr/bin/env python3
"""On the server, reuse existing runtime secrets for a public image artifact."""
import json
from pathlib import Path
import shutil
import sys

ROOT = Path('/www/wwwroot/easypocketmd/docker')


def prepare(release, channel, root=ROOT):
    if channel not in ('main', 'dev'):
        raise ValueError('Invalid deployment channel')
    config = json.loads((release / 'config.json').read_text())
    if config.get('channel') != channel or config.get('role') == 'edge':
        raise ValueError('Artifact channel/role does not match domestic deployment')
    state_file = root / f'state-{channel}.json'
    if not state_file.is_file():
        raise ValueError('No current Docker deployment; configure the first deployment through Actions Secrets')
    current = Path(json.loads(state_file.read_text())['current']['release']).resolve()
    if current == release.resolve():
        raise ValueError('Use a new release directory')
    previous = json.loads((current / 'config.json').read_text())
    if previous.get('role') == 'edge':
        raise ValueError('Current server is an edge, not the domestic origin')
    env = current / 'app.env'
    if not env.is_file() or not env.stat().st_size:
        raise ValueError('Current runtime configuration is unavailable')
    # Keep the established database/session settings; never fetch secrets to the client.
    for name in ('app.env', 'tls.key', 'tls.pem'):
        source = current / name
        if source.is_file():
            shutil.copy2(source, release / name)
            (release / name).chmod(0o600)
    for key in ('domain', 'ssl_email'):
        if key in previous:
            config[key] = previous[key]
    (release / 'config.json').write_text(json.dumps(config))
    print('Current server runtime configuration reused; credentials remain on the server')


if __name__ == '__main__':
    prepare(Path(sys.argv[1]), sys.argv[2])
