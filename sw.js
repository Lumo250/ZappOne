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

// [FIX 1] BUILD_TIME cambiato apposta: al nuovo "activate" la vecchia cache viene
// eliminata, e conteneva risposte di API/proxy (anche errori 403/500) salvate per sbaglio.
const BUILD_TIME  = '20261004-1050'; // <-- aggiorna ad ogni deploy (bump per: nuovo file epg-grid.js)
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
  '/search.js',
  '/db.js',
  '/equalizer.js',
  '/watermark.js',
  '/player.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon1.png',
  '/favicon-32x32.png',
  // [FIX 1] Prima questi file finivano in cache solo "per caso" (il SW salvava TUTTO).
  // Ora il SW salva solo i file di questa lista, quindi vanno elencati qui.
  '/nochannel.svg',
  '/noepg.svg',
  '/nofullepg.svg',
  '/noplaylist.svg',
  '/nopref.svg',
  '/add-playlist.svg',
  '/tasto3-1.svg',
  '/tasto9-2.svg',
  '/tasto-icon.png',
  '/placeholder.png',
];

// [FIX 1] Set per il confronto ESATTO del percorso (vedi strategia 2 più sotto).
const STATIC_SET = new Set(STATIC_ASSETS);


// ── INSTALL: pre-carica tutti gli asset statici ──────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // [FIX 1] Prima: cache.addAll() è "tutto o niente". Bastava UN file mancante (404)
      // per non precaricare nulla, e il catch nascondeva l'errore. Ora ogni file è
      // indipendente: se uno manca, gli altri vengono salvati e il problema è nel log.
      Promise.allSettled(STATIC_ASSETS.map(asset => cache.add(asset))).then(results => {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.warn('[SW] Precache non riuscito per', STATIC_ASSETS[i], r.reason && r.reason.message);
          }
        });
      })
    )
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
  // (es. HLS.js CDN, Gumroad — non devono passare dalla cache)
  if (event.request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  const pathname = url.pathname;

  // [FIX 1] API, funzioni Netlify e proxy loghi hanno la STESSA origine della pagina,
  // quindi arrivavano fin qui. Non devono MAI essere servite dalla cache del SW:
  // contengono stato licenza, JWT e playlist, che devono essere sempre freschi.
  if (pathname.startsWith('/api/') ||
      pathname.startsWith('/.netlify/') ||
      pathname.startsWith('/logo-proxy/')) {
    return;
  }

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
          // [FIX 1] Salva solo risposte valide: un 404/500 non deve rimpiazzare la copia buona.
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline: restituisce la versione in cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // ── Strategia 2: CACHE FIRST, ma SOLO per i file elencati ──
  // [FIX 1] Prima la regola era pathname.endsWith(nome_file) su tutta la lista; con
  // l'elemento '/' il nome file è '' e endsWith('') è SEMPRE vero: ogni richiesta
  // della stessa origine veniva trattata da "asset statico" e salvata per sempre.
  // Ora il confronto è esatto: se il percorso non è in STATIC_ASSETS, il SW non interviene.
  if (!STATIC_SET.has(pathname)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Non in cache: scarica dalla rete e salvala (solo se la risposta è valida)
      return fetch(event.request).then(networkResponse => {
        if (networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      });
    })
  );

  // Tutto il resto (stream M3U, API, CDN esterni) viene ignorato:
  // il browser li gestisce direttamente senza passare dal SW.
});
