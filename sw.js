const CACHE_NAME = 'ZappZen-cache-v2';
const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Installa e cachea solo i file statici
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Attiva e pulisci vecchie cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

// Intercetta solo richieste di file statici noti
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Se NON è un file della UI → bypass totale
  if (!STATIC_ASSETS.includes(url.pathname)) {
    return; // non facciamo respondWith → va diretto al network
  }

  // Cache-first solo per file statici
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
