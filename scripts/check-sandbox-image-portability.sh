#!/usr/bin/env bash
# CI only: import into a separate classic image store, without registry access.
set -euo pipefail
archive_dir=$(cd "${1:?Usage: check-sandbox-image-portability.sh ARTIFACT_DIRECTORY}" && pwd)
engine="epmd-sandbox-compat-${GITHUB_RUN_ID:-$$}"
trap 'docker rm -f "$engine" >/dev/null 2>&1 || true' EXIT
# The CI host may use containerd. Docker 27 defaults to the classic image store.
# Privilege is confined to this disposable CI compatibility engine, never user code.
docker run -d --privileged --network=none --name "$engine" \
  -e DOCKER_TLS_CERTDIR= -v "$archive_dir:/artifact:ro" docker:27-dind >/dev/null
ready=false
for _ in $(seq 1 60); do
  if docker exec "$engine" docker info >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then docker logs "$engine" >&2; exit 1; fi
docker exec "$engine" sh -c 'cd /artifact && sha256sum -c python-sandbox.tar.gz.sha256'
docker exec "$engine" docker load --input /artifact/python-sandbox.tar.gz
docker exec "$engine" docker image inspect "${PYTHON_SANDBOX_IMAGE:-easypocketmd-python:1}" |
  python3 "$(dirname "$0")/sandbox-image-identity.py" "$archive_dir/python-sandbox.image.json"
printf '%s' '{"code":"import matplotlib.pyplot as plt; plt.plot([1,2],[3,4]); plt.show(); print(\"portable sandbox ready\")"}' |
  docker exec -i "$engine" docker run --rm --pull=never -i --network=none --read-only \
  --cap-drop=ALL --security-opt=no-new-privileges --memory=512m --memory-swap=512m \
  --pids-limit=64 --cpus=1 --tmpfs=/tmp:rw,noexec,nosuid,size=64m,mode=1777 \
  "${PYTHON_SANDBOX_IMAGE:-easypocketmd-python:1}" |
  python3 -c 'import sys,json; r=json.load(sys.stdin); assert r["success"],r; assert r["images"][0]["mime"]=="image/png"; print("Cross-engine Python sandbox and matplotlib ready")'
