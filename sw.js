// ============================================================
// ZappOne — Service Worker
// ============================================================
//
// COSA FA QUESTO FILE
// -------------------
// 1. Al primo caricamento ("install") scarica e mette in cache
//    tutti gli asset statici (HTML, CSS, JS, icone).
// 2. Ad ogni caricamento successivo, il browser chiede al SW
//    di servire i file. Il SW decide se servirli dalla cache
//    (veloce, offline-safe) o dalla rete (fresco).
// 3. Quando pubblichi una nuova versione (bump di BUILD_TIME),
//    il vecchio SW e la vecchia cache vengono eliminati al
//    primo caricamento della nuova versione.
//
// DUE STRATEGIE DI CACHE
// ----------------------
//   • index.html → STALE-WHILE-REVALIDATE (SWR)
//     Risposta immediata dalla cache. La rete aggiorna in
//     background. Il load successivo serve la versione fresca.
//     Vantaggi: 0ms di attesa, HTML e asset sempre coerenti
//     (snapshot della stessa versione). Costo: dopo un deploy
//     l'utente vede la versione precedente per un load.
//
//   • Asset statici (CSS/JS/icone) → CACHE-FIRST
//     Se è in cache, serve da lì e non tocca la rete. Se non
//     c'è, scarica e salva. Gli asset sono "immutabili" per
//     una data BUILD_TIME, quindi non serve revalidare.
//
//   • API, proxy loghi, CDN esterni, stream video → IGNORATI
//     Il SW non interviene: il browser fa fetch diretto.
//
// VERSIONING
// ----------
// BUILD_TIME identifica la versione della cache. Cambiarlo
// forza l'eliminazione della vecchia cache e il precache della
// nuova. Va aggiornato ad OGNI deploy che tocca uno qualsiasi
// degli STATIC_ASSETS (index.html, zappone.css, JS, icone...).
// Se usi uno script di deploy, sostituiscilo con un timestamp.
// ============================================================


const BUILD_TIME = '20261019-2233';  // <-- bump ad ogni deploy
const CACHE_NAME = 'ZappOne-cache-' + BUILD_TIME;


// ============================================================
// ASSET STATICI — precache all'install
// ============================================================
// Elenco degli asset che il SW deve avere SEMPRE in cache,
// indipendentemente dalla navigazione. Sono i file necessari
// perché l'app funzioni anche offline al primo avvio.
//
// L'ordine non è funzionalmente rilevante (il precache è
// indipendente per file), ma è tenuto allineato all'ordine
// di caricamento in index.html per leggibilità.
// ============================================================

const STATIC_ASSETS = [
  // ── Shell / asset di base ──
  '/',
  '/index.html',
  '/zappone.css',
  '/manifest.json',

  // ── Moduli applicativi (stesso ordine di index.html) ──
  '/00-playback-store.js',
  '/01-license.js',
  '/02-m3u-parser.js',
  '/03-db.js',
  '/04-epg.js',
  '/A01-epg-grid.js',
  '/A02-search.js',
  '/A03-equalizer.js',
  '/A04-watermark.js',
  '/05-player.js',
  '/A08-on-air.js',
  '/zappone.js',
  '/A05-backup.js',
  '/A06-sidebar.js',

  // ── Asset aperti da altri file (worker / iframe) ──
  '/guida.html',
  '/A07-epg-parser-worker.js',

  // ── Icone e immagini ──
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon1.png',
  '/favicon-32x32.png',
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

// Set per il confronto ESATTO del percorso nella strategia 2.
// `pathname.endsWith(fileName)` non funziona perché con '/' il
// nome file è '' e endsWith('') è sempre true: ogni richiesta
// della stessa origine verrebbe trattata come asset statico.
// Il Set rende il confronto O(1) e inequivocabile.
const STATIC_SET = new Set(STATIC_ASSETS);


// ============================================================
// INSTALL — precache degli asset statici
// ============================================================
// Eseguito una sola volta, al primo caricamento del SW o quando
// BUILD_TIME cambia. Scarica tutti gli asset in parallelo e li
// salva nella cache. Poi chiama skipWaiting() per attivarsi
// subito senza aspettare la chiusura delle tab già aperte con
// il vecchio SW.
//
// Uso Promise.allSettled invece di cache.addAll perché
// cache.addAll è "tutto o niente": se un solo file manca (404),
// NESSUN file viene precached. Con allSettled ogni file è
// indipendente: se uno fallisce, gli altri si salvano comunque
// e il fallimento viene loggato.
// ============================================================

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(asset => cache.add(asset)))
        .then(results => {
          results.forEach((r, i) => {
            if (r.status === 'rejected') {
              console.warn(
                '[SW] Precache non riuscito per',
                STATIC_ASSETS[i],
                r.reason && r.reason.message
              );
            }
          });
        })
    )
  );

  // Attiva il nuovo SW immediatamente, senza aspettare che
  // tutte le tab col vecchio SW vengano chiuse. Necessario
  // perché altrimenti l'utente potrebbe restare su una
  // versione vecchia per giorni.
  self.skipWaiting();
});


// ============================================================
// ACTIVATE — pulizia delle cache obsolete
// ============================================================
// Eseguito quando il nuovo SW prende il controllo. Elimina
// tutte le cache con un nome diverso da CACHE_NAME (cioè
// tutte le versioni precedenti). Infine chiama clients.claim()
// per prendere il controllo delle tab già aperte senza
// richiedere un reload manuale.
// ============================================================

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

  // Prende il controllo delle tab aperte con il vecchio SW
  // senza richiedere un reload manuale dell'utente.
  self.clients.claim();
});


// ============================================================
// FETCH — routing delle richieste
// ============================================================
// Ogni richiesta HTTP passa da qui (tranne quelle cross-origin
// e le API, gestite sotto). Il SW sceglie quale strategia
// applicare in base al path.
// ============================================================

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ── Filtro 1: solo GET, solo same-origin ──────────────────
  // Richieste non-GET (POST, PUT, DELETE) non hanno senso in
  // cache. Richieste cross-origin (HLS.js CDN, dash.js CDN,
  // Gumroad, ecc.) non devono passare dal SW: il browser le
  // gestisce direttamente. Il SW è limitato alla stessa
  // origine della pagina.
  if (event.request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  const pathname = url.pathname;

  // ── Filtro 2: API e proxy mai in cache ────────────────────
  // /api/* (licenza, JWT), /.netlify/* (functions), /logo-proxy/*
  // (proxy immagini Sky) hanno la stessa origine della pagina,
  // quindi arriverebbero qui. Ma contengono stato dinamico
  // (licenza, token, immagini di terzi) che deve essere
  // SEMPRE fresco. Il SW non interviene.
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/.netlify/') ||
    pathname.startsWith('/logo-proxy/')
  ) {
    return;
  }

  // ── Strategia 1: STALE-WHILE-REVALIDATE per index.html ────
  //
  // index.html è la "porta d'ingresso" dell'app: referenzia
  // tutti gli altri file. Se lo si serve dalla rete ogni volta
  // (network-first), si crea una finestra di incoerenza dopo
  // ogni deploy: l'HTML nuovo arriva subito, ma il CSS/JS
  // nuovo non è ancora in cache → pagina rotta.
  //
  // Con SWR: l'HTML viene servito SUBITO dalla cache (istantaneo,
  // anche offline) e in background si scarica la versione fresca
  // per il load successivo. HTML e asset sono sempre della
  // stessa "generazione" → nessuna incoerenza.
  //
  // NOTA SULLA SINCRONICITÀ:
  // Sia event.respondWith() sia event.waitUntil() devono essere
  // chiamati SINCRONAMENTE dentro l'handler, prima di qualsiasi
  // await. Altrimenti Safari iOS può lanciare:
  //   "InvalidStateError: The event is no longer active"
  // e il fetch in background non viene atteso. Le due promise
  // (cachedPromise e networkPromise) vengono quindi create
  // subito, e solo DOPO si passano a respondWith/waitUntil.
  if (pathname === '/' || pathname === '/index.html') {

    // Legge dalla cache. Restituisce la Response o undefined.
    const cachedPromise = caches.open(CACHE_NAME)
      .then(cache => cache.match(event.request));

    // Scarica dalla rete e salva in cache (solo se valida:
    // un 404/500 non deve rimpiazzare una copia buona).
    const networkPromise = fetch(event.request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => cache.put(event.request, clone));
      }
      return response;
    });

    // waitUntil SINCRONO: tiene vivo il SW finché il fetch in
    // background non termina, anche se la risposta è già stata
    // servita dalla cache. Il .catch() evita un unhandled
    // rejection quando la rete è assente e la cache ha già
    // risposto: il fallimento del background è silenzioso.
    event.waitUntil(networkPromise.catch(() => {}));

    // respondWith SINCRONO: se la cache ha una copia, servila
    // subito. Altrimenti aspetta la rete (prima visita).
    event.respondWith(
      cachedPromise.then(cached => cached || networkPromise)
    );

    return;
  }

  // ── Filtro 3: solo asset statici elencati ─────────────────
  // Se il path non è in STATIC_ASSETS, il SW non interviene:
  // il browser fa fetch normale. Questo copre:
  //   - stream video (mp4, m3u8, ts, mpd)
  //   - file caricati dall'utente (blob:)
  //   - qualsiasi risorsa non esplicitamente precacheata
  if (!STATIC_SET.has(pathname)) {
    return;
  }

  // ── Strategia 2: CACHE-FIRST per asset statici ────────────
  //
  // Gli asset in STATIC_ASSETS sono "immutabili" per una data
  // BUILD_TIME: se il file cambia, cambia anche BUILD_TIME, e
  // quindi cambia CACHE_NAME. Quindi non serve revalidare:
  // se è in cache, è la versione giusta. Se non c'è, si scarica
  // una volta e resta lì fino al prossimo bump.
  //
  // event.waitUntil sul cache.put: assicura che il salvataggio
  // termini anche se il SW viene terminato dal browser subito
  // dopo aver servito la risposta (comportamento comune su
  // mobile quando l'app va in background).
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, clone))
          );
        }
        return response;
      });
    })
  );

  // Tutto il resto (stream M3U, API, CDN esterni) è già stato
  // ignorato sopra: il browser lo gestisce direttamente.
});
