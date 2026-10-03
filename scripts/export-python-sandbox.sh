#!/usr/bin/env bash
# Run only on the CI/build machine, after sandbox tests pass.
set -euo pipefail
output_dir="${1:?Usage: export-python-sandbox.sh OUTPUT_DIRECTORY}"
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)
image="${PYTHON_SANDBOX_IMAGE:-easypocketmd-python:1}"
docker image inspect "$image" --format '{{.Id}}' > "$output_dir/python-sandbox.image-id"
docker save "$image" | gzip -1 > "$output_dir/python-sandbox.tar.gz"
(cd "$output_dir" && sha256sum python-sandbox.tar.gz > python-sandbox.tar.gz.sha256)
echo 'Python sandbox image exported with checksum and image ID'
