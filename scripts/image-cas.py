#!/usr/bin/env python3
"""Offline Docker image transport: gzip each archive member by SHA-256.

rsync --ignore-existing sends only missing objects. The server reconstructs
Docker's archive without extracting it and verifies every byte before use.
Works with both classic Docker and containerd-compatible docker save archives.
"""
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile


def portable_identity(image):
    spec = importlib.util.spec_from_file_location('image_identity', Path(__file__).with_name('sandbox-image-identity.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.identity(json.loads(subprocess.check_output(['docker', 'image', 'inspect', image], stderr=subprocess.DEVNULL)))


def export(directory, image_pairs):
    directory = Path(directory)
    objects = directory / 'objects'
    objects.mkdir(parents=True, exist_ok=True)
    images = dict(pair.split('=', 1) for pair in image_pairs)
    identities = {role: portable_identity(image) for role, image in images.items()}
    layer_ids = {layer for identity in identities.values() for layer in identity['layers']}
    process = subprocess.Popen(['docker', 'save', *images.values()], stdout=subprocess.PIPE)
    members = []
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|') as archive:
            for member in archive:
                if not member.isfile():
                    continue
                digest = hashlib.sha256()
                with tempfile.TemporaryFile() as raw:
                    source = archive.extractfile(member)
                    while chunk := source.read(1024 * 1024):
                        digest.update(chunk)
                        raw.write(chunk)
                    key = digest.hexdigest()
                    target = objects / (key + '.gz')
                    if not target.exists():
                        raw.seek(0)
                        with target.open('wb') as output, gzip.GzipFile(fileobj=output, mode='wb', mtime=0, compresslevel=1) as compressed:
                            shutil.copyfileobj(raw, compressed, length=1024 * 1024)
                    entry = {'name': member.name, 'size': member.size, 'sha256': key, 'mode': member.mode, 'compressed_size': target.stat().st_size}
                    # OCI archives may contain gzip-compressed layer blobs; classic
                    # archives contain raw layer.tar. Record verified expanded IDs
                    # so the server can budget only layers it actually lacks.
                    layer_id, expanded = 'sha256:' + key, member.size
                    if layer_id not in layer_ids:
                        raw.seek(0)
                        if raw.read(2) == b'\x1f\x8b':
                            raw.seek(0); expanded_digest = hashlib.sha256(); expanded = 0
                            with gzip.GzipFile(fileobj=raw, mode='rb') as stream:
                                while chunk := stream.read(1024 * 1024):
                                    expanded_digest.update(chunk); expanded += len(chunk)
                            layer_id = 'sha256:' + expanded_digest.hexdigest()
                    if layer_id in layer_ids:
                        entry.update(layer_diff_id=layer_id, expanded_size=expanded)
                    members.append(entry)
        if process.wait() != 0:
            raise RuntimeError('docker save failed')
    finally:
        if process.poll() is None:
            process.kill()
        process.wait()
    manifest = {'version': 1, 'members': members, 'images': images,
                'identities': identities}
    content = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
    (directory / 'release.json').write_bytes(content)
    (directory / 'release.sha256').write_text(hashlib.sha256(content).hexdigest() + '\n')
    print(f'Exported {len(images)} images as {len(members)} content-addressed objects')


def load(directory, manifest_file):
    objects = Path(directory) / 'objects'
    manifest_file = Path(manifest_file)
    content = manifest_file.read_bytes()
    expected = manifest_file.with_name('release.sha256').read_text().strip()
    if hashlib.sha256(content).hexdigest() != expected:
        raise RuntimeError('Release manifest checksum mismatch')
    manifest = json.loads(content)
    if manifest.get('version') != 1 or set(manifest['images']) not in ({'app', 'print', 'gateway', 'python'}, {'gateway'}):
        raise RuntimeError('Invalid image release manifest')
    try:
        if all(portable_identity(image) == manifest['identities'][role] for role, image in manifest['images'].items()):
            print('Release images already installed and verified; skipping import')
            return
    except (subprocess.CalledProcessError, KeyError):
        pass
    # Validate cached objects before docker load. Remove damaged objects so retry
    # retransmits them; never silently reuse corrupt local cache.
    print(f"Verifying {len(manifest['members'])} cached archive members before Docker import", flush=True)
    for index, member in enumerate(manifest['members'], 1):
        key = member['sha256']
        if len(key) != 64 or any(char not in '0123456789abcdef' for char in key):
            raise RuntimeError('Invalid object digest')
        path = objects / (key + '.gz')
        digest, size = hashlib.sha256(), 0
        try:
            with gzip.open(path, 'rb') as source:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    size += len(chunk)
            if size != member['size'] or digest.hexdigest() != key:
                raise RuntimeError('Object digest mismatch')
        except Exception:
            path.unlink(missing_ok=True)
            raise RuntimeError(f'Image object corrupt or missing: {key}; retry to upload it again')
        if index % 10 == 0 or index == len(manifest['members']):
            print(f"Verified archive members: {index}/{len(manifest['members'])}", flush=True)
    import importlib.util
    spec = importlib.util.spec_from_file_location('deploy_resources', Path(__file__).with_name('deploy-resources.py'))
    resources = importlib.util.module_from_spec(spec); spec.loader.exec_module(resources)
    with resources.import_budget(directory, manifest):
        print('Importing verified archive into Docker', flush=True)
        process = subprocess.Popen(['docker', 'load'], stdin=subprocess.PIPE)
        try:
            with tarfile.open(fileobj=process.stdin, mode='w|') as archive:
                for member in manifest['members']:
                    info = tarfile.TarInfo(member['name'])
                    info.size, info.mode = member['size'], member['mode']
                    with gzip.open(objects / (member['sha256'] + '.gz'), 'rb') as source:
                        archive.addfile(info, source)
            process.stdin.close()
            if process.wait() != 0:
                raise RuntimeError('docker load failed')
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
        print('Docker import finished; verifying executable image identities', flush=True)
        for role, image in manifest['images'].items():
            if portable_identity(image) != manifest['identities'][role]:
                raise RuntimeError(f'Loaded image content mismatch: {role}')
    print('All loaded image layers and runtime configurations verified')


if __name__ == '__main__':
    if sys.argv[1] == 'export':
        export(sys.argv[2], sys.argv[3:])
    elif sys.argv[1] == 'load':
        load(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit('Usage: image-cas.py export DIR ROLE=IMAGE... | load CACHE_DIR RELEASE_JSON')
