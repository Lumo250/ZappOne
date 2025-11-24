const CACHE_NAME = 'ZappZen-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/hls.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(console.error)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  if (event.request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  // Gestisci solo asset statici
  const isStaticAsset = STATIC_ASSETS.some(asset => 
    url.pathname === asset || url.pathname.endsWith(asset.split('/').pop())
  );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Aggiorna cache con nuova risposta
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        });
        
        return cached || fetchPromise;
      })
    );
  }

});
