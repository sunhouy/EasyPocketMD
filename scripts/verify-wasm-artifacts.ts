#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const mode = process.argv[2] || 'source';
const rootDir = process.cwd();

const targets = mode === 'dist'
    ? [
        path.join(rootDir, 'dist', 'wasm_text_engine', 'text_engine.js'),
        path.join(rootDir, 'dist', 'wasm_text_engine', 'text_engine.wasm')
    ]
    : [
        path.join(rootDir, 'wasm_text_engine', 'dist', 'text_engine.js'),
        path.join(rootDir, 'wasm_text_engine', 'dist', 'text_engine.wasm')
    ];

const missing = targets.filter((filePath) => !fs.existsSync(filePath));

if (missing.length > 0) {
    console.error('[verify-wasm-artifacts] Missing files:');
    missing.forEach((filePath) => console.error(' - ' + filePath));
    process.exit(1);
}
