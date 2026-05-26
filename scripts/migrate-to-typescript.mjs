#!/usr/bin/env node
/**
 * Batch-rename application .js sources to .ts and normalize import paths.
 */
import { readdir, readFile, writeFile, unlink, rename, stat } from 'node:fs/promises';
import { join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));

const INCLUDE_DIRS = ['js', 'api', 'shared', 'tests', 'scripts', 'wasm_text_engine/js'];
const ROOT_FILES = [
  'entry.js',
  'version.js',
  'vite.config.js',
  'jest.config.js',
  'sw.js',
  'patch.js',
  'patch_tauri_bridge.js',
];

const SKIP_FILES = new Set([
  'test-extract.js',
  'test-extract2.js',
  'test-extract3.js',
  'test-regex.js',
]);

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'api-dist') continue;
      await walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function shouldMigrate(absPath) {
  const rel = relative(root, absPath).replace(/\\/g, '/');
  if (SKIP_FILES.has(rel)) return false;
  if (rel.startsWith('node_modules/') || rel.startsWith('dist/')) return false;
  if (INCLUDE_DIRS.some((d) => rel.startsWith(`${d}/`))) return true;
  return ROOT_FILES.includes(rel);
}

function rewriteImports(content) {
  return content
    .replace(/from\s+(['"])([^'"]+)\.js\1/g, "from $1$2$1")
    .replace(/import\s+(['"])([^'"]+)\.js\1/g, "import $1$2$1")
    .replace(/require\s*\(\s*(['"])([^'"]+)\.js\1\s*\)/g, "require($1$2$1)")
    .replace(/import\s*\(\s*(['"])([^'"]+)\.js\1\s*\)/g, "import($1$2$1)");
}

async function migrateFile(jsPath) {
  const tsPath = jsPath.replace(/\.js$/, '.ts');
  if (jsPath === tsPath) return { skipped: true };
  try {
    await stat(tsPath);
    return { skipped: true, reason: 'ts exists' };
  } catch {
    /* continue */
  }
  const content = await readFile(jsPath, 'utf8');
  const updated = rewriteImports(content);
  await writeFile(tsPath, updated, 'utf8');
  await unlink(jsPath);
  return { migrated: true, from: relative(root, jsPath), to: relative(root, tsPath) };
}

async function patchHtmlAndJson() {
  const indexHtml = join(root, 'index.html');
  let html = await readFile(indexHtml, 'utf8');
  const before = html;
  html = html
    .replace(/\/entry\.js/g, '/entry.ts')
    .replace(/\/shared\/([^"']+)\.js/g, '/shared/$1.ts')
    .replace(/\/js\/page\/([^"']+)\.js/g, '/js/page/$1.ts');
  if (html !== before) await writeFile(indexHtml, html, 'utf8');

  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  pkg.scripts = pkg.scripts || {};
  if (pkg.scripts.build?.includes('node version.js')) {
    pkg.scripts.build = pkg.scripts.build.replace('node version.js', 'tsx version.ts');
  }
  if (pkg.scripts['build:web']?.includes('node version.js')) {
    pkg.scripts['build:web'] = pkg.scripts['build:web'].replace('node version.js', 'tsx version.ts');
  }
  if (pkg.scripts.start === 'node api/server.js') {
    pkg.scripts.start = 'tsx api/server.ts';
  }
  if (pkg.scripts['bump-version'] === 'node version.js') {
    pkg.scripts['bump-version'] = 'tsx version.ts';
  }
  if (pkg.scripts['check-deploy'] === 'node scripts/check-deploy.js') {
    pkg.scripts['check-deploy'] = 'tsx scripts/check-deploy.ts';
  }
  if (!pkg.scripts.typecheck) {
    pkg.scripts.typecheck = 'tsc -b && tsc -p tsconfig.api.json --noEmit';
  }
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

async function main() {
  const candidates = [];
  for (const dir of INCLUDE_DIRS) {
    await walk(join(root, dir), candidates);
  }
  for (const f of ROOT_FILES) {
    const p = join(root, f);
    try {
      await stat(p);
      candidates.push(p);
    } catch {
      /* missing */
    }
  }

  const results = [];
  for (const file of candidates.sort()) {
    if (!shouldMigrate(file)) continue;
    results.push(await migrateFile(file));
  }

  await patchHtmlAndJson();
  const migrated = results.filter((r) => r.migrated);
  console.log(`Migrated ${migrated.length} files to TypeScript.`);
  for (const r of migrated.slice(0, 20)) {
    console.log(`  ${r.from} -> ${r.to}`);
  }
  if (migrated.length > 20) console.log(`  ... and ${migrated.length - 20} more`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
