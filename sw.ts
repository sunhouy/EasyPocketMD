const CACHE_NAMESPACE = 'md-editor-cache';
const CACHE_VERSION = 'stable-v1';
const CACHE_NAME = `${CACHE_NAMESPACE}-${CACHE_VERSION}`;
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest']);
const CACHEABLE_EXTENSION = /\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|json|txt)$/i;

async function clearAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

function shouldCacheRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  // Skip dynamic/query requests to prevent duplicate cached variants.
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

