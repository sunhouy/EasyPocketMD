#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
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
docker build -t "${PYTHON_SANDBOX_IMAGE:-easypocketmd-python:1}" sandbox/python
printf '%s' '{"code":"import numpy, pandas, scipy, sympy, sklearn, seaborn, PIL, openpyxl; import matplotlib.pyplot as plt; plt.plot([1,2],[3,4]); plt.title(\"中文图表\"); plt.show(); print(\"sandbox ready\")"}' |
  docker run --rm -i --network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --memory=512m --memory-swap=512m --pids-limit=64 --cpus=1 \
  --tmpfs=/tmp:rw,noexec,nosuid,size=64m,mode=1777 "${PYTHON_SANDBOX_IMAGE:-easypocketmd-python:1}" |
  python3 -c 'import sys,json; r=json.load(sys.stdin); assert r["success"],r; assert r["images"][0]["mime"]=="image/png"; print("Python sandbox and matplotlib ready")'
