#!/usr/bin/env python3
"""Archive only public deployment data, never runtime credentials or TLS keys."""
import json
import os
from pathlib import Path
import shutil


def package(source=Path('.'), target=Path('docker-release'), channel=None):
    channel = channel or os.environ['DEPLOY_CHANNEL']
    if channel not in ('main', 'dev'):
        raise ValueError('Invalid deployment channel')
    if target.exists():
        raise ValueError('Artifact directory already exists')
    control = target / 'docker-control'
    control.mkdir(parents=True)
    images = target / 'image-cas'
    images.mkdir()
    shutil.copytree(source / 'image-cas/objects', images / 'objects', copy_function=os.link)
    for name in ('release.json', 'release.sha256'):
        shutil.copy2(source / 'image-cas' / name, control / name)
    config = json.loads((source / 'docker-control/config.json').read_text())
    public = {key: config[key] for key in ('domain', 'wasm', 'ssl_email', 'version', 'github_run_id') if key in config}
    public['channel'] = channel
    (control / 'config.json').write_text(json.dumps(public))
    for name in ('image-cas.py', 'sandbox-image-identity.py', 'deploy-docker.py',
                 'deploy-resources.py', 'ssl-renewal.py', 'prepare-manual-runtime.py'):
        shutil.copy2(source / 'scripts' / name, control / name)
    (target / 'scripts').mkdir()
    shutil.copy2(source / 'scripts/transfer-docker-release.sh', target / 'scripts')
    shutil.copy2(source / 'scripts/manual-deploy.sh', target / 'manual-deploy.sh')
    print(f'Public manual deployment artifact prepared: {target}')


if __name__ == '__main__':
    package()
