const CACHE_NAME = 'ZappOne-cache-v2'; // Ho corretto Zen in One per coerenza
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/zappone.css',      // ← aggiungere
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon1.png',   // <-- AGGIUNGI QUESTO
  '/favicon-32x32.png',       // <-- AGGIUNGI QUESTO (se lo hai)
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
                    
                    // 🚀 FIX: CLONA LA RISPOSTA IMMEDIATAMENTE (PRIMA di restituire l'originale)
                    const responseToCache = networkResponse.clone(); // <-- Clonazione immediata e sincrona

                    // Aggiorna cache con la NUOVA RISPOSTA CLONATA
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    
                    // Restituisce la risposta ORIGINALE al client
                    return networkResponse;
                });
                
                return cached || fetchPromise;
            })
        );
    }
});


