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

cp "$ROOT_DIR/js/image_compressor_client.js" "$OUT_DIR/image_compressor_client.js"

echo "Built image compressor wasm module at $OUT_DIR/image_compressor.js and $OUT_DIR/image_compressor.wasm"