#!/usr/bin/env python3
"""Create a small deployment control bundle; secrets never enter image layers."""
import hashlib
import json
import os
from pathlib import Path
import shutil
from urllib.parse import urlparse

root = Path('docker-control')
root.mkdir(mode=0o700, exist_ok=True)
for name in ('image-cas.py', 'sandbox-image-identity.py', 'deploy-docker.py', 'deploy-resources.py', 'ssl-renewal.py'):
    shutil.copy2(Path('scripts') / name, root / name)
for name in ('release.json', 'release.sha256'):
    shutil.copy2(Path('image-cas') / name, root / name)
keys = ('DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'REDIS_HOST',
        'REDIS_PORT', 'REDIS_PASSWORD', 'REDIS_DB', 'JWT_SECRET', 'JWT_EXPIRES_IN',
        'ADMIN_USER', 'ADMIN_PASSWORD', 'BASE_URL', 'DASHSCOPE_API_KEY')
values = []
for key in keys:
    value = os.environ.get(key, '')
    if '\n' in value or '\r' in value:
        raise SystemExit(f'{key} cannot contain line breaks in a Docker env file')
    values.append(key + '=' + value)
(root / 'app.env').write_text('\n'.join(values) + '\n')
(root / 'app.env').chmod(0o600)
domain = urlparse(os.environ['BASE_URL']).hostname
if not domain:
    raise SystemExit('BASE_URL must contain the deployment domain')
wasm = {}
for name in ('text_engine.js', 'text_engine.wasm', 'image_compressor.js', 'image_compressor.wasm'):
    relative = 'wasm_text_engine/' + name
    wasm[relative] = hashlib.sha256((Path('dist') / relative).read_bytes()).hexdigest()
(root / 'config.json').write_text(json.dumps({'domain': domain, 'wasm': wasm, 'ssl_email': os.environ.get('SSL_EMAIL', ''),
    'version': json.loads(Path('package.json').read_text())['version']}))
for variable, name in [('TLS_KEY', 'tls.key'), ('TLS_PEM', 'tls.pem')]:
    value = os.environ.get(variable)
    if value:
        (root / name).write_text(value + '\n')
        (root / name).chmod(0o600)
