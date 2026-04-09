#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist"

mkdir -p "$OUT_DIR"

em++ \
  "$ROOT_DIR/src/text_engine.cpp" \
  "$ROOT_DIR/src/slash_command_index.cpp" \
  "$ROOT_DIR/src/wasm_bindings.cpp" \
  -O3 \
  --bind \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT=web,worker,node \
  -s EXPORTED_RUNTIME_METHODS='["UTF8ToString"]' \
  -o "$OUT_DIR/text_engine.js"

echo "Built wasm module at $OUT_DIR/text_engine.js and $OUT_DIR/text_engine.wasm"

