#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:---load}"
archive="${2:-sandbox/python/python-sandbox.tar.gz}"
case "$mode" in
  --build|--check) ;;
  --load)
    test -f "$archive" && test -f "$archive.sha256" || { echo 'Missing CI sandbox image archive/checksum; refusing to pull or build on the server.' >&2; exit 1; }
    archive_dir=$(cd "$(dirname "$archive")" && pwd)
    archive_name=$(basename "$archive")
    (cd "$archive_dir" && sha256sum -c "$archive_name.sha256")
    test -f "$archive_dir/python-sandbox.image.json"
    ;;
  *) echo 'Usage: setup-python-sandbox.sh --build | --check | --load [IMAGE_ARCHIVE]' >&2; exit 1 ;;
esac
if ! command -v docker >/dev/null 2>&1; then
  if [ "$(id -u)" != 0 ] || ! command -v apt-get >/dev/null 2>&1; then
    echo 'Python sandbox requires Docker. Install Docker and run scripts/setup-python-sandbox.sh as the backend service user.' >&2
    exit 1
  fi
  apt-get update
  apt-get install -y docker.io
  systemctl enable --now docker
fi
docker info >/dev/null
# The backend service user must have Docker access; no host-Python fallback exists.
image="${PYTHON_SANDBOX_IMAGE:-easypocketmd-python:1}"
if [ "$mode" = --build ]; then
  # Only GitHub Actions (or an explicitly requested developer build) downloads layers.
  docker build --platform=linux/amd64 -t "$image" sandbox/python
elif [ "$mode" = --load ]; then
  docker load --input "$archive"
  # .Id differs between classic/containerd stores; verify executable content instead.
  docker image inspect "$image" | python3 scripts/sandbox-image-identity.py "$archive_dir/python-sandbox.image.json"
fi
printf '%s' '{"code":"import numpy, pandas, scipy, sympy, sklearn, seaborn, PIL, openpyxl; import matplotlib.pyplot as plt; plt.plot([1,2],[3,4]); plt.title(\"中文图表\"); plt.show(); print(\"sandbox ready\")"}' |
  docker run --rm --pull=never -i --network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --memory=512m --memory-swap=512m --pids-limit=64 --cpus=1 \
  --tmpfs=/tmp:rw,noexec,nosuid,size=64m,mode=1777 "${PYTHON_SANDBOX_IMAGE:-easypocketmd-python:1}" |
  python3 -c 'import sys,json; r=json.load(sys.stdin); assert r["success"],r; assert r["images"][0]["mime"]=="image/png"; print("Python sandbox and matplotlib ready")'
