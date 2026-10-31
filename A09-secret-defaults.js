// ================================================================
//  A09-secret-defaults.js
//
//  Ponte client per le sorgenti predefinite (playlist / EPG).
//
//  FLUSSO
//  ------
//  1. Ascolta gli eventi dei due bottom sheet (apertura, chiusura
//     con metodo x/annulla/overlay, long-press su Annulla).
//  2. Accumula gli eventi in un buffer LOCALE (zero rete).
//  3. Sul long-press terminale, invia il buffer a check-secret.
//  4. Se il server risponde { match: true, token }, chiama
//     serve-default con quel token monouso.
//  5. Riceve { contentBase64, isGzip }, decodifica base64 (+ gunzip
//     se serve).
//  6. Passa il CONTENUTO (mai l'URL) a window.loadDefaultPlaylist()
//     o window.loadDefaultEPG() (definite in zappone.js §47/§50).
//
//  QUESTO FILE NON CONTIENE LA SEQUENZA. La sequenza "corretta"
//  vive in netlify/functions/_shared/defaults.js (SECRET_SEQUENCES).
//  QUESTO FILE NON CONTIENE GLI URL. Vivono in DEFAULT_SOURCES
//  (stesso file server-side). Il client riceve solo contenuto.
//
//  RETE: zero chiamate durante l'accumulo eventi. Solo sul
//  long-press terminale (check-secret), poi subito serve-default.
//
//  STATO: nessuno. Idempotente: rifare il gesto ricarica.
//  Nessun sessionStorage, nessuna classe CSS da toggle.
// ================================================================

(function setupSecretDefaults() {
  'use strict';

  // Stesso dominio di license.js. Se cambia il backend, va
  // aggiornato qui E in license.js.
  const API_ORIGIN = 'https://zappone.netlify.app';

  const MAX_BUFFER          = 100;      // eventi massimi in memoria
  const BUFFER_TTL_MS       = 60000;    // scarta eventi più vecchi di 60s
  const LONGPRESS_MS        = 800;      // durata minima del long-press
  const DEBOUNCE_MS         = 300;      // attesa post long-press
  const CHECK_TIMEOUT_MS    = 5000;     // check-secret (leggero)
  const SERVEDEF_TIMEOUT_MS = 20000;    // serve-default (scarica EPG/M3U)

  // Buffer per purpose, indipendenti. Nessuno stato persistito.
  const buffers          = { m3u: { events: [], lastTs: 0 }, epg: { events: [], lastTs: 0 } };
  const lastCloseMethod  = { m3u: null, epg: null };
  const validationTimers = { m3u: null, epg: null };

  // ---- Accumulo eventi ----
  function push(purpose, type, id) {
    const buf = buffers[purpose];
    if (!buf) return;
    const now = Date.now();
    if (buf.events.length && now - buf.lastTs > BUFFER_TTL_MS) buf.events.length = 0;
    buf.events.push({ type, id });
    if (buf.events.length > MAX_BUFFER) buf.events.shift();
    buf.lastTs = now;

    // Solo il long-press finale fa partire la chiamata.
    // open/close sono eventi locali: il server non sa che stai navigando.
    if (type === 'longpress') scheduleValidate(purpose);
  }

  function scheduleValidate(purpose) {
    clearTimeout(validationTimers[purpose]);
    validationTimers[purpose] = setTimeout(() => validate(purpose), DEBOUNCE_MS);
  }

  // ---- Fetch con timeout esplicito ----
  // (AbortSignal.timeout non è disponibile ovunque su iOS < 15.4)
  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, Object.assign({}, options, {
        signal: controller.signal,
        cache: 'no-store'
      }));
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Pipeline: check-secret → serve-default → load* ----
  async function validate(purpose, retried = false) {
    const buf = buffers[purpose];
    if (!buf || buf.events.length < 2) return;

    const jwtToken = localStorage.getItem('zappone_jwt');
    if (!jwtToken) return;   // utente demo: nessun gesto, nessuna rete

    // --- 1. check-secret ---
    let res;
    try {
      res = await fetchWithTimeout(
        `${API_ORIGIN}/.netlify/functions/check-secret`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose,
            sequence: buf.events.slice(),
            token: jwtToken
          })
        },
        CHECK_TIMEOUT_MS
      );
    } catch (_) {
      return;   // rete assente / abort: silenzioso
    }

    // 403 = JWT scaduto. Refresh + retry UNA volta sola.
    if (res.status === 403) {
      if (retried) return;
      if (typeof getConfigFromServer === 'function') {
        try { await getConfigFromServer(); } catch (_) { return; }
      } else {
        return;
      }
      return validate(purpose, true);
    }

    if (!res.ok) return;

    const data = await res.json().catch(() => null);
    if (!data || data.match !== true || typeof data.token !== 'string') {
      // match === false: il buffer resta. Decade da solo (BUFFER_TTL_MS)
      // o al prossimo gesto corretto. Nessun retry automatico.
      return;
    }

    // Sequenza corretta: puliamo il buffer prima di procedere.
    buf.events.length = 0;

    // --- 2. serve-default con il token monouso ---
    let res2;
    try {
      res2 = await fetchWithTimeout(
        `${API_ORIGIN}/.netlify/functions/serve-default`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: data.token, purpose })
        },
        SERVEDEF_TIMEOUT_MS
      );
    } catch (_) {
      if (typeof showNotification === 'function') {
        showNotification('Errore di rete durante il caricamento', true);
      }
      return;
    }

    if (!res2.ok) {
      // 401: token già usato o scaduto (60s). L'utente deve rifare il gesto.
      // 5xx: problema server. In entrambi i casi: messaggio generico.
      if (typeof showNotification === 'function') {
        showNotification('Errore caricamento sorgente predefinita', true);
      }
      return;
    }

    const payload = await res2.json().catch(() => null);
    if (!payload || typeof payload.contentBase64 !== 'string') {
      if (typeof showNotification === 'function') {
        showNotification('Risposta server non valida', true);
      }
      return;
    }

    // --- 3. Decodifica base64 → Uint8Array ---
    let bytes;
    try {
      const bin = atob(payload.contentBase64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch (_) {
      if (typeof showNotification === 'function') {
        showNotification('Contenuto non decodificabile', true);
      }
      return;
    }

    // --- 4. Gunzip se serve (EPG .gz, M3U .gz raro) ---
    let text;
    if (payload.isGzip) {
      if (typeof DecompressionStream !== 'function') {
        if (typeof showNotification === 'function') {
          showNotification(
            'Questo dispositivo non supporta la decompressione (serve iOS 16.4+)',
            true
          );
        }
        return;
      }
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(
          new DecompressionStream('gzip')
        );
        text = await new Response(stream).text();
      } catch (_) {
        if (typeof showNotification === 'function') {
          showNotification('Errore decompressione contenuto', true);
        }
        return;
      }
    } else {
      text = new TextDecoder('utf-8').decode(bytes);
    }

    // --- 5. Delega al core (contenuto, non URL) ---
    if (purpose === 'm3u') {
      if (typeof window.loadDefaultPlaylist === 'function') {
        window.loadDefaultPlaylist(text);
      } else {
        console.error('[secret-defaults] window.loadDefaultPlaylist non definita');
      }
    } else {
      if (typeof window.loadDefaultEPG === 'function') {
        window.loadDefaultEPG(text);
      } else {
        console.error('[secret-defaults] window.loadDefaultEPG non definita');
      }
    }
  }

  // ---- Long-press detector generico ----
  // FIX: fired resettato su mouseleave/touchcancel, così un long-press
  // seguito da trascinamento fuori dal pulsante non lascia fired=true
  // (che sopprimerebbe un click futuro legittimo).
  function attachLongPress(el, purpose, idForEvent) {
    if (!el) return;
    let timer = null;
    let fired = false;

    const start = () => {
      fired = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        fired = true;
        push(purpose, 'longpress', idForEvent);
      }, LONGPRESS_MS);
    };

    const stop  = () => { clearTimeout(timer); timer = null; };
    const abort = () => { clearTimeout(timer); timer = null; fired = false; };

    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('mouseup', stop);
    el.addEventListener('touchend', stop);
    el.addEventListener('mouseleave', abort);
    el.addEventListener('touchcancel', abort);

    // Sopprime il click che segue un long-press andato a buon fine.
    // Registrato in capture: scatta prima del listener 'click' che
    // scrive lastCloseMethod[purpose] = 'annulla'. Senza questo,
    // dopo il long-press la chiusura verrebbe erroneamente tracciata
    // come "annulla" e il buffer registrerebbe un evento in più.
    el.addEventListener('click', (e) => {
      if (fired) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fired = false;
      }
    }, true);
  }

  // ---- Setup per uno sheet ----
  function setupSheet(purpose, sheetId, cancelBtnId, overlayId) {
    const sheet = document.getElementById(sheetId);
    if (!sheet) return;
    if (sheet.__secretDefaultsWired) return;   // idempotenza
    sheet.__secretDefaultsWired = true;

    // Fallback coerente con zappone.js §59 (classe EPG-specifica prima).
    const closeBtn  = sheet.querySelector('.bottom-sheet-close-epg')
                   || sheet.querySelector('.bottom-sheet-close');
    const cancelBtn = document.getElementById(cancelBtnId);
    const overlay   = document.getElementById(overlayId);

    // ORDINE IMPORTANTE: il long-press su cancelBtn va registrato PRIMA
    // dei listener lastCloseMethod, così il soppressore del click scatta
    // per primo e blocca la scrittura del metodo in caso di long-press.
    attachLongPress(cancelBtn, purpose, cancelBtnId);

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        lastCloseMethod[purpose] = 'x';
      }, true);
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        lastCloseMethod[purpose] = 'annulla';
      }, true);
    }
    if (overlay) {
      overlay.addEventListener('click', () => {
        lastCloseMethod[purpose] = 'overlay';
      }, true);
    }

    // Apertura/chiusura: osservate via classe .open.
    // Drag-to-dismiss non produce click: il metodo resta null → 'unknown',
    // che è accettato solo da close con id:'any' (nessuno nella sequenza
    // attuale: le chiusure richieste sono esplicitamente 'annulla' e 'x').
    let wasOpen = false;
    new MutationObserver(() => {
      const isOpen = sheet.classList.contains('open');
      if (isOpen && !wasOpen) {
        wasOpen = true;
        push(purpose, 'open', sheetId);
      } else if (!isOpen && wasOpen) {
        wasOpen = false;
        const method = lastCloseMethod[purpose] || 'unknown';
        lastCloseMethod[purpose] = null;
        push(purpose, 'close', method);
      }
    }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    setupSheet('m3u', 'm3uUrlBottomSheet', 'm3uCancelBtn', 'bottomSheetOverlay');
    setupSheet('epg', 'epgUrlBottomSheet', 'epgCancelBtn', 'bottomSheetOverlayEPG');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();