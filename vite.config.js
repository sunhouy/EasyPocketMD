import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { readFileSync, existsSync, writeFileSync, readFile, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';

const versionPath = join(__dirname, 'version.json');
const packageJsonPath = join(__dirname, 'package.json');
const wasmJsPath = join(__dirname, 'wasm_text_engine', 'dist', 'text_engine.js');
const wasmBinPath = join(__dirname, 'wasm_text_engine', 'dist', 'text_engine.wasm');
const hasWasmTextEngineDist = existsSync(wasmJsPath) && existsSync(wasmBinPath);
const imageCompressorJsPath = join(__dirname, 'wasm_text_engine', 'dist', 'image_compressor.js');
const imageCompressorBinPath = join(__dirname, 'wasm_text_engine', 'dist', 'image_compressor.wasm');
const hasImageCompressorDist = existsSync(imageCompressorJsPath) && existsSync(imageCompressorBinPath);
let cacheVersion = 'v1';
let appPackageVersion = '0.0.0';
if (existsSync(versionPath)) {
  try {
    const versionData = JSON.parse(readFileSync(versionPath, 'utf8'));
    cacheVersion = versionData.version || 'v1';
  } catch (e) {
    console.warn('Failed to read version:', e);
  }
}
if (existsSync(packageJsonPath)) {
  try {
    const packageData = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    appPackageVersion = packageData.version || '0.0.0';
  } catch (e) {
    console.warn('Failed to read package version:', e);
  }
}

const swContent = `const CACHE_NAMESPACE = 'md-editor-cache';
const CACHE_VERSION = 'stable-v1';
const CACHE_NAME = \`\${CACHE_NAMESPACE}-\${CACHE_VERSION}\`;
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest']);
const CACHEABLE_EXTENSION = /\\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|json|txt)$/i;

async function clearAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

function shouldCacheRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.search) return false;
  if (request.mode === 'navigate') return false;

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/screenshots/') ||
    url.pathname.startsWith('/avatars/') ||
    url.pathname.startsWith('/user_files/') ||
    url.pathname.endsWith('/sw.js')
  ) {
    return false;
  }

  if (CACHEABLE_DESTINATIONS.has(request.destination)) return true;
  return CACHEABLE_EXTENSION.test(url.pathname);
}

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key.startsWith(CACHE_NAMESPACE) && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'CLEAR_CACHE_STORAGE') return;

  event.waitUntil((async () => {
    try {
      await clearAllCaches();
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: 'CLEAR_CACHE_ACK', ok: true });
      }
    } catch (error) {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          type: 'CLEAR_CACHE_ACK',
          ok: false,
          message: error && error.message ? error.message : 'clear cache failed'
        });
      }
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!shouldCacheRequest(request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok && networkResponse.type === 'basic') {
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        return new Response('Network error happened', {
          status: 408,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })()
  );
});
`;

export default defineConfig({
  base: '/',
  publicDir: 'public',
  define: {
    __WASM_TEXT_ENGINE_PRESENT__: JSON.stringify(hasWasmTextEngineDist),
    __APP_BUILD_TAG__: JSON.stringify(cacheVersion),
    __APP_PACKAGE_VERSION__: JSON.stringify(appPackageVersion)
  },
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      // '/vditor': {
      //   target: 'http://localhost:3000',
      //   changeOrigin: true
      // }
    }
  },
  preview: {},
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          vditor: ['vditor']
        }
      },
      external: ['node-fetch']
    },
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    include: ['docx']
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/vditor/dist',
          dest: 'vditor'
        },
        {
          src: 'node_modules/echarts/dist/echarts.min.js',
          dest: 'echarts'
        },
        {
          src: 'node_modules/pdfmake-support-chinese-fonts/pdfmake.min.js',
          dest: '.'
        },
        {
          src: 'node_modules/pdfmake-support-chinese-fonts/vfs_fonts.js',
          dest: '.'
        },
        {
          src: 'manifest.webmanifest',
          dest: '.'
        },
        {
          src: 'icon.png',
          dest: '.'
        },
        {
          src: 'node_modules/pdfjs-dist/build/pdf.worker.mjs',
          dest: 'assets'
        },
        ...(hasWasmTextEngineDist ? [{
          src: 'wasm_text_engine/dist/text_engine*',
          dest: 'wasm_text_engine'
        }] : []),
        ...(hasImageCompressorDist ? [{
          src: 'wasm_text_engine/dist/image_compressor*',
          dest: 'wasm_text_engine'
        }] : [])
      ]
    }),
    {
      name: 'copy-vditor-files',
      writeBundle(options) {
        const fs = require('fs');
        const path = require('path');
        const sourceDir = path.join(__dirname, 'node_modules', 'vditor', 'dist');
        const targetDir = path.join(options.dir || 'dist', 'vditor');
        
        try {
          if (fs.existsSync(sourceDir)) {
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            
            function copyDir(src, dest) {
              const entries = fs.readdirSync(src, { withFileTypes: true });
              for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                  if (!fs.existsSync(destPath)) {
                    fs.mkdirSync(destPath, { recursive: true });
                  }
                  copyDir(srcPath, destPath);
                } else {
                  fs.copyFileSync(srcPath, destPath);
                }
              }
            }
            
            copyDir(sourceDir, targetDir);
          }
          
          // 复制 pdfmake 中文支持文件
          const pdfmakeSourceDir = path.join(__dirname, 'node_modules', 'pdfmake-support-chinese-fonts');
          const distDir = options.dir || 'dist';
          
          fs.copyFileSync(
            path.join(pdfmakeSourceDir, 'pdfmake.min.js'),
            path.join(distDir, 'pdfmake.min.js')
          );
          fs.copyFileSync(
            path.join(pdfmakeSourceDir, 'vfs_fonts.js'),
            path.join(distDir, 'vfs_fonts.js')
          );
          
        } catch (error) {
          console.error('Error copying files:', error);
        }
      }
    },
    {
      name: 'generate-sw',
      writeBundle(options, bundle) {
        const fs = require('fs');
        const path = require('path');
        const swPath = path.join(options.dir || 'dist', 'sw.js');
        fs.writeFileSync(swPath, swContent);
      }
    }
  ]
});
