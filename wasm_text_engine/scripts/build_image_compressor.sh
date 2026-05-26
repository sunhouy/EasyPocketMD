#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist"

mkdir -p "$OUT_DIR"

em++ \
  "$ROOT_DIR/src/image_compressor.cpp" \
  "$ROOT_DIR/src/image_compressor_bindings.cpp" \
  -O3 \
  --bind \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT=web,worker,node \
  -s EXPORTED_RUNTIME_METHODS='["UTF8ToString"]' \
  -s USE_LIBJPEG=1 \
  -s USE_LIBPNG=1 \
  -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
  -o "$OUT_DIR/image_compressor.js"

CLIENT_SRC="$ROOT_DIR/js/image_compressor_client.ts"
CLIENT_OUT="$OUT_DIR/image_compressor_client.js"
PROJECT_ROOT="$(cd "$ROOT_DIR/.." && pwd)"

if [[ ! -f "$CLIENT_SRC" ]]; then
  echo "Missing image compressor client source: $CLIENT_SRC" >&2
  exit 1
fi

(
  cd "$PROJECT_ROOT"
  npx esbuild "$CLIENT_SRC" \
    --format=esm \
    --platform=browser \
    --target=es2022 \
    --outfile="$CLIENT_OUT"
)

echo "Built image compressor wasm module at $OUT_DIR/image_compressor.js and $OUT_DIR/image_compressor.wasm"