// ============================================================
// ZappOne — Service Worker
//
// VERSIONING AUTOMATICO:
// BUILD_TIME viene sostituito dallo script di deploy con il
// timestamp del momento in cui fai il deploy (es. "20250327-1423").
// Se non usi uno script di deploy, aggiorna BUILD_TIME a mano
// ogni volta che modifichi index.html o zappone.css —
// basta cambiare una cifra per forzare il refresh su tutti i client.
// ============================================================

const BUILD_TIME  = '20250327-0003'; // <-- aggiorna ad ogni deploy
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


// ── INSTALL: pre-carica tutti gli asset statici ──────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.error('[SW] Cache addAll failed:', err))
  );
  // Prende il controllo immediatamente senza aspettare la chiusura
  // delle tab già aperte col vecchio SW
  self.skipWaiting();
});


// ── ACTIVATE: elimina le cache delle versioni precedenti ─────
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
  // Prende il controllo delle tab aperte senza richiedere un reload
  self.clients.claim();
});


// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora richieste non-GET e richieste verso altri domini
  // (es. HLS.js CDN, API Netlify, Gumroad — non devono passare dalla cache)
  if (event.request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  const pathname = url.pathname;

  // ── Strategia 1: NETWORK FIRST per index.html ──────────────
  // index.html contiene i riferimenti a tutti gli altri file.
  // Se viene cachato e poi il sito viene aggiornato, l'utente
  // continuerebbe a vedere la versione vecchia finché non ricarica
  // due volte. Con network-first, vede sempre la versione aggiornata;
  // la cache è solo il fallback per quando è offline.
  if (pathname === '/' || pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // Aggiorna la cache con la risposta fresca
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResponse;
        })
        .catch(() => {
          // Offline: restituisce la versione in cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // ── Strategia 2: CACHE FIRST per gli altri asset statici ───
  // CSS, icone, manifest cambiano solo quando cambia BUILD_TIME,
  // quindi la cache è sempre valida per la versione corrente.
  // Quando viene deployata una nuova versione, BUILD_TIME cambia,
  // CACHE_NAME cambia, e l'activate cancella la cache vecchia:
  // la prima richiesta va in rete e riempie la nuova cache.
  const isStaticAsset = STATIC_ASSETS.some(asset =>
    pathname === asset || pathname.endsWith(asset.split('/').pop())
  );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        // Non in cache: scarica dalla rete e salvala
        return fetch(event.request).then(networkResponse => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResponse;
        });
      })
    );
  }

  // Tutto il resto (stream M3U, API, CDN esterni) viene ignorato:
  // il browser li gestisce direttamente senza passare dal SW.
});