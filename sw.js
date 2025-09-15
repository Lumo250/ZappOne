const CACHE_NAME = 'pwa-cache-v1';

// file statici da mettere in cache subito
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon-32x32.png'
];

// estensioni che vogliamo gestire con il cache
const CACHEABLE_FILE_TYPES = /\.(html|css|js|json|png|jpg|jpeg|svg|webp)$/i;

// Install SW e cache iniziale
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Attiva e pulisci vecchi cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercetta le richieste
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Se la richiesta è per video/streaming => bypass
  if (url.pathname.match(/\.(m3u8|mpd|ts|m4s|key|aac|mp3|mp4)$/i)) {
    return event.respondWith(fetch(event.request));
  }

  // Se NON è un file cacheabile => bypass
  if (!CACHEABLE_FILE_TYPES.test(url.pathname)) {
    return event.respondWith(fetch(event.request));
  }

  // Cache-first strategy per file statici
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return (
        cachedResponse ||
        fetch(event.request).then(networkResponse => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
      );
    })
  );
});
