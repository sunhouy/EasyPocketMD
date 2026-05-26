#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] || 'source';
const kind = process.argv[3] === 'image' || process.argv[2] === 'image' ? 'image' : 'text';
const resolvedMode = process.argv[2] === 'image' ? 'source' : mode;

const rootDir = process.cwd();

function textTargets(buildMode: string): string[] {
  return buildMode === 'dist'
    ? [
        path.join(rootDir, 'dist', 'wasm_text_engine', 'text_engine.js'),
        path.join(rootDir, 'dist', 'wasm_text_engine', 'text_engine.wasm'),
      ]
    : [
        path.join(rootDir, 'wasm_text_engine', 'dist', 'text_engine.js'),
        path.join(rootDir, 'wasm_text_engine', 'dist', 'text_engine.wasm'),
      ];
}

function imageTargets(buildMode: string): string[] {
  return buildMode === 'dist'
    ? [
        path.join(rootDir, 'dist', 'wasm_text_engine', 'image_compressor.js'),
        path.join(rootDir, 'dist', 'wasm_text_engine', 'image_compressor.wasm'),
        path.join(rootDir, 'dist', 'wasm_text_engine', 'image_compressor_client.js'),
      ]
    : [
        path.join(rootDir, 'wasm_text_engine', 'dist', 'image_compressor.js'),
        path.join(rootDir, 'wasm_text_engine', 'dist', 'image_compressor.wasm'),
        path.join(rootDir, 'wasm_text_engine', 'dist', 'image_compressor_client.js'),
      ];
}

const targets = kind === 'image' ? imageTargets(resolvedMode) : textTargets(resolvedMode);
const missing = targets.filter((filePath) => !fs.existsSync(filePath));

if (missing.length > 0) {
  console.error(`[verify-wasm-artifacts] Missing ${kind} files:`);
  missing.forEach((filePath) => console.error(` - ${filePath}`));
  process.exit(1);
}

console.log(`[verify-wasm-artifacts] OK (${kind}, ${resolvedMode})`);
