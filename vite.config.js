import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { readFileSync, existsSync, writeFileSync, readFile, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';

const versionPath = join(__dirname, 'version.json');
let cacheVersion = 'v1';
if (existsSync(versionPath)) {
  try {
    const versionData = JSON.parse(readFileSync(versionPath, 'utf8'));
    cacheVersion = versionData.version || 'v1';
  } catch (e) {
    console.warn('Failed to read version:', e);
  }
}

const swContent = `const CACHE_VERSION = '${cacheVersion}';
const CACHE_NAME = \`md-editor-cache-\${CACHE_VERSION}\`;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      try {
        const networkResponse = await fetch(request);
        await cache.put(request, networkResponse.clone());
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
  base: './',
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/vditor': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
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
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/vditor/dist',
          dest: 'vditor'
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
          src: 'icon-192.png',
          dest: '.'
        },
        {
          src: 'icon-512.png',
          dest: '.'
        }
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
            console.log('Copying Vditor files from:', sourceDir);
            console.log('To:', targetDir);
            
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
            console.log('Vditor files copied successfully!');
          }
        } catch (error) {
          console.error('Error copying Vditor files:', error);
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
