// ============================================================
// ZappOne — Service Worker (Versione Ottimizzata Aggiornamento)
// ============================================================

const BUILD_TIME  = '20250327-0001'; // <-- CAMBIA SEMPRE QUESTA CIFRA AD OGNI UPDATE
const CACHE_NAME  = 'ZappOne-cache-' + BUILD_TIME;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/zappone.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon1.png',
  '/favicon-32x32.png',
];

// ── INSTALL: Pre-carica gli asset e FORZA l'attivazione ──────
self.addEventListener('install', event => {
  console.log('[SW] Installing new version:', BUILD_TIME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // <--- IMPORTANTE: Forza il passaggio da 'waiting' ad 'active'
      .catch(err => console.error('[SW] Cache addAll failed:', err))
  );
});

// ── ACTIVATE: Pulizia vecchie cache e controllo immediato ─────
self.addEventListener('activate', event => {
  console.log('[SW] Activating version:', BUILD_TIME);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim()) // <--- IMPORTANTE: Prende il controllo dei client aperti subito
  );
});

// ── FETCH: Gestione intelligente delle richieste ──────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const pathname = url.pathname;

  // 1. STRATEGIA NETWORK FIRST per la pagina principale (index.html)
  // Questo garantisce che se c'è internet, scarichi la versione nuova.
  if (event.request.mode === 'navigate' || pathname === '/' || pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // Aggiorna la cache con la nuova index
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(pathname === '/' ? '/' : '/index.html')) // Se offline, usa cache
    );
    return;
  }

  // 2. STRATEGIA CACHE FIRST per altri asset (CSS, immagini, ecc.)
  const isStaticAsset = STATIC_ASSETS.some(asset =>
    pathname === asset || pathname.endsWith(asset.split('/').pop())
  );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(networkResponse => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. TUTTO IL RESTO (API, Playlist esterne): Solo Rete
  event.respondWith(fetch(event.request));
});