// ================================================================
//  MODULO WATERMARK DEMO - ZappOne
//  Deterrente visivo per la versione demo (badge + pattern a tutta
//  pagina). Espone window.initDemoWatermark() chiamata da zappone.js
//  dopo getConfigFromServer().
//
//  NOTA DI SICUREZZA: questo NON è un sistema di protezione. È un
//  promemoria visivo che la versione è demo. Qualsiasi cosa disegnata
//  lato client è rimovibile da un utente con DevTools. La protezione
//  reale è nel backend: cors-proxy.js risponde 403 per licenze non
//  valide, get-config.js non emette JWT per la demo.
//
//  Deterrenti implementati:
//    1. Badge + pattern a tutta pagina (due elementi distinti)
//    2. Classi con nome casuale per sessione (querySelector non trova)
//    3. MutationObserver che re-inietta se rimossi
//    4. Check periodico ogni 3s come fallback
//
//  Ottimizzazioni (per non toccare il frame rate):
//    - Badge: nessun backdrop-filter (costo GPU reale)
//    - Pattern: will-change + translateZ(0) → layer statico,
//      il browser non lo ridisegna durante scroll/animazioni
//
//  Palette: ambra/oro. Coerente con --favorite-star dell'app e con
//  la convenzione universale per le versioni trial/demo. Niente rosso
//  "allarme": il watermark informa, non spaventa.
//
//  Dipendenze globali attese da altri file:
//    - appConfig  (da license.js)
// ================================================================

(function setupDemoWatermark() {
  const SESSION_ID = Math.random().toString(36).slice(2, 10);
  const BADGE_CLASS = `_zw${SESSION_ID}b`;
  const PATTERN_CLASS = `_zw${SESSION_ID}p`;

  // Palette ambra — coordinata con --favorite-star (#fbc02d / #ffd700)
  const AMBER       = 'rgba(240, 180, 0, 1)';       // #f0b400
  const AMBER_SOFT  = 'rgba(240, 180, 0, 0.14)';    // fondo badge
  const AMBER_LINE  = 'rgba(240, 180, 0, 0.50)';    // bordo badge
  const AMBER_TEXT  = 'rgba(255, 205, 60, 0.95)';   // testo badge
  const AMBER_GLOW  = 'rgba(240, 180, 0, 0.18)';    // ombra badge
  const AMBER_PAT   = 'rgba(240, 180, 0, 0.06)';    // pattern di fondo

  let badgeEl = null;
  let patternEl = null;
  let observer = null;
  let watchdog = null;

  function shouldShow() {
    return typeof appConfig !== 'undefined' && appConfig.isPremium === false;
  }

  function makeBadge() {
    const el = document.createElement('div');
    el.className = BADGE_CLASS;
    el.setAttribute('aria-hidden', 'true');
    // Testo preceduto da un pallino luminoso, come un indicatore di stato
    el.innerHTML = `
      <span style="
        display:inline-block;
        width:6px; height:6px;
        border-radius:50%;
        background:${AMBER};
        box-shadow:0 0 6px ${AMBER};
        margin-right:8px;
        vertical-align:1px;
      "></span>DEMO
    `;
    el.style.cssText = `
      position: fixed;
      bottom: 84px;
      left: 10px;
      z-index: 2147483000;
      display: inline-flex;
      align-items: center;
      padding: 5px 12px 5px 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.24em;
      line-height: 1;
      color: ${AMBER_TEXT};
      background: ${AMBER_SOFT};
      border: 1px solid ${AMBER_LINE};
      border-radius: 999px;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      box-shadow: 0 4px 14px ${AMBER_GLOW};
      will-change: transform;
      transform: translateZ(0);
    `;
    return el;
  }

  function makePattern() {
    const el = document.createElement('div');
    el.className = PATTERN_CLASS;
    el.setAttribute('aria-hidden', 'true');
    // Pattern diagonale di "DEMO" in ambra tenue.
    // Il testo usa due parole ripetute per riempire uniformemente anche
    // su schermi larghi senza lasciare zone vuote.
    const svg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">` +
        `<text x="150" y="105" text-anchor="middle" ` +
              `font-family="-apple-system, Segoe UI, sans-serif" ` +
              `font-size="34" font-weight="800" letter-spacing="6" ` +
              `fill="rgba(240,180,0,0.06)" ` +
              `transform="rotate(-30 150 100)">DEMO</text>` +
      `</svg>`
    );
    el.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147482999;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      background-image: url("data:image/svg+xml;utf8,${svg}");
      background-repeat: repeat;
      background-size: 300px 200px;
      will-change: transform;
      transform: translateZ(0);
    `;
    return el;
  }

  function mount() {
    if (!shouldShow()) return;
    if (!badgeEl || !badgeEl.isConnected) {
      badgeEl = makeBadge();
      document.body.appendChild(badgeEl);
    }
    if (!patternEl || !patternEl.isConnected) {
      patternEl = makePattern();
      document.body.appendChild(patternEl);
    }
  }

  function unmount() {
    if (badgeEl && badgeEl.isConnected) badgeEl.remove();
    if (patternEl && patternEl.isConnected) patternEl.remove();
    badgeEl = null;
    patternEl = null;
  }

  function setupObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (!shouldShow()) return;
      const badgeGone = badgeEl && !badgeEl.isConnected;
      const patternGone = patternEl && !patternEl.isConnected;
      if (badgeGone || patternGone) {
        mount();
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }

  // Esposta globalmente, chiamata da zappone.js dopo getConfigFromServer()
  window.initDemoWatermark = function () {
    if (shouldShow()) {
      mount();
      setupObserver();
      if (!watchdog) {
        watchdog = setInterval(() => {
          if (shouldShow()) {
            if (!badgeEl || !badgeEl.isConnected ||
                !patternEl || !patternEl.isConnected) {
              mount();
            }
          } else {
            unmount();
            clearInterval(watchdog);
            watchdog = null;
          }
        }, 3000);
      }
    } else {
      unmount();
    }
  };
})();