#!/usr/bin/env bash
# CI only: persistent BuildKit layers, without GitHub-specific cache APIs.
set -euo pipefail
revision="${ATOMGIT_SHA:?ATOMGIT_SHA is required}"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid build revision' >&2; exit 1; }
cache_root=.ci-cache/buildx
mkdir -p "$cache_root"
for target in python app print gateway; do
  cache="$cache_root/$target"
  next="$cache_root/$target-next"
  rm -rf "$next"
  options=()
  if [ -f "$cache/index.json" ]; then options+=(--cache-from "type=local,src=$cache"); fi
  context=.
  file=deploy/Dockerfile
  if [ "$target" = python ]; then
    context=sandbox/python
    file=sandbox/python/Dockerfile
  else
    options+=(--target "$target")
  fi
  docker buildx build --platform linux/amd64 --load --progress plain \
    --file "$file" --tag "easypocketmd-$target:$revision" \
    "${options[@]}" --cache-to "type=local,dest=$next,mode=max" "$context"
  # Replace the previous local cache only after a successful image build.
  rm -rf "$cache"
  mv "$next" "$cache"
done
docker tag "easypocketmd-python:$revision" easypocketmd-python:1
