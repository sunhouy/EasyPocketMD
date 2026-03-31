#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build-native"

mkdir -p "$BUILD_DIR"

g++ -std=c++17 -O2 \
  "$ROOT_DIR/src/text_engine.cpp" \
  "$ROOT_DIR/tests/smoke_test.cpp" \
  -o "$BUILD_DIR/smoke_test"

"$BUILD_DIR/smoke_test"

