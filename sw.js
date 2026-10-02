// ============================================================
// ZappOne — Service Worker
//
// FIX (bug grave 1): la vecchia regola isStaticAsset usava
// endsWith(asset.split('/').pop()) su ogni elemento di
// STATIC_ASSETS. Poiché STATIC_ASSETS contiene '/', pop() di '/'
// restituisce '' e pathname.endsWith('') è SEMPRE true. Così
// TUTTE le GET same-origin (incluse /api/get-config e
// /.netlify/functions/cors-proxy) finivano in cache-first.
// Ora si confronta con un Set di path ESATTI, e si cachano
// SOLO risposte ok() e basic (non opache/redirect/errori).
// ============================================================

const BUILD_TIME  = '20261002-9002'; // <-- bump ad ogni deploy
const CACHE_NAME  = 'ZappOne-cache-' + BUILD_TIME;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/zappone.css',
  '/zappone.js',
  '/license.js',
  '/m3u-parser.js',
  '/epg.js',
  '/epg-grid.js',
  '/db.js',
  '/equalizer.js',
  '/watermark.js',
  '/player.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon1.png',
  '/favicon-32x32.png',
];

// Set precalcolato: confronto per pathname ESATTO, non endsWith.
const STATIC_SET = new Set(STATIC_ASSETS);

// Helper: una risposta va salvata in cache SOLO se è 2xx non-opaca.
function isCacheable(res) {
  return res && res.ok && res.type === 'basic';
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.error('[SW] Cache addAll failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando cache obsoleta:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora richieste non-GET e richieste cross-origin
  if (event.request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  const pathname = url.pathname;

  // ── Strategia 1: NETWORK FIRST per index.html ──────────────
  if (pathname === '/' || pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (isCacheable(networkResponse)) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ── Strategia 2: CACHE FIRST per asset statici ───
  // Confronto ESATTO sul pathname. Niente più endsWith.
  const isStaticAsset = STATIC_SET.has(pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request).then(networkResponse => {
          if (isCacheable(networkResponse)) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        });
      })
    );
  }

  // Tutto il resto (stream M3U, API, CDN esterni) NON passa dal SW.
});
