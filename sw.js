const CACHE_NAME = 'md-editor-cache-v1';

// 可以按需调整需要缓存的静态资源
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/main.js',
  '/js/files.js',
  '/js/auth.js',
  '/js/ui/print.js',
  '/js/ui/render.js',
  '/js/ui/upload.js',
  '/js/ui/file-manager.js',
  '/vditor@3.11.2/dist/index.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => {
      return self.skipWaiting();
    })
  );
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

  // 只处理 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 对 API 请求采用网络优先，避免缓存接口数据
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // 后台更新
        fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }).catch(() => {});
        return cached;
      }

      return fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => cached || Response.error());
    })
  );
});

