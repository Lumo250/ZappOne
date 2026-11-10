// ================================================================
//  MODULO LICENZA - ZappOne  (v2)
//  Gestisce autenticazione, fingerprint e proxy
//
//  ─── MODELLO ───────────────────────────────────────────────────
//  UNA sola fonte di verità: la chiave localStorage "zappone_lic2"
//  (oggetto JSON, vedi LicenseState.blank()). Le vecchie chiavi
//  zappone_demo_mode / zappone_was_premium / zappone_config_cache
//  vengono migrate al primo avvio e poi cancellate. zappone_license
//  e zappone_jwt restano come SPECCHI in sola scrittura, per i moduli
//  che le leggono ancora (verifica con grep prima di toglierle).
//
//  La decisione "che modalità sono?" è una funzione PURA
//  (LicenseState.apply): verdetto del server → nuovo stato + modalità.
//  Nessuna cancellazione automatica di dati: quando la licenza non è
//  attiva i dati premium restano nel loro database (quarantena) e il
//  database "demo" è un altro (vedi LicenseState.dbName, da usare in db.js).
//
//  Modalità:
//    premium         il server ha confermato in questo avvio
//    premium_cached  server non raggiungibile, copia salvata < 7 giorni
//    demo            scelta esplicita o 3 chiavi sbagliate; nessun form al prossimo avvio
//    locked          licenza nota ma non utilizzabile
//                    (lock = expired | disabled | revoked | device_limit | unverifiable | invalid)
//
//  Contratto col server (get-config.js):
//    200 premium | 200 demo+reason | 403 {reason:'device_limit'|'revoked'} | 503 non verificabile
// ================================================================

// ================================
// Variabili di configurazione
// ================================

let isPremium = false;
let DEFAULT_PLAYLIST_URL = null;
let epgUrl = null;
let M3U_PROXIES = [];

let appConfig = {
    status: 'demo',
    isPremium: false,
    playlistUrl: null,
    epgUrl: null,
    proxies: [],
    devicesCount: null,
    maxDevices: null,
    maxEpgSlots: 1,   // default prudente finché il server non risponde
    canUpload: false  // default: nessun upload/ripristino finché il server non conferma premium
};

let jwtToken = null;

// ================================
// COSTANTI
// ================================

// Unica fonte di verità per il dominio di produzione.
const API_ORIGIN = 'https://zappone.netlify.app';

const CONFIG_TIMEOUT_MS = 10000;
// Proxy di ripiego: se non arriva nessuna config, appConfig.proxies resterebbe vuoto e
// OGNI download fallirebbe in silenzio.
const FALLBACK_PROXIES  = [{ base: '/.netlify/functions/cors-proxy?url=', encode: true }];

// Configurazione demo: identica a config.demo di get-config.js. In demo NON si chiama il server.
const DEMO_CFG = {
    status: 'demo', playlistUrl: null, epgUrl: null,
    canUpload: false, maxEpgSlots: 2, proxies: FALLBACK_PROXIES
};

// Accettazione della licenza d'uso (prova di accettazione, vedi _shared/antiresale.js).
// Lasciala false finché non hai il testo legale e la pagina TOS_URL.
const REQUIRE_TOS = false;
const TOS_VERSION = 1;
const TOS_URL     = 'licenza.html';

// Normalizza un path/URL restituito dal server in un URL assoluto verso il backend
// reale, indipendentemente da dove sono serviti i file statici.
function resolveApiUrl(base) {
    if (!base) return base;
    if (/^https?:\/\//i.test(base)) return base; // già assoluto: non toccare
    if (base.startsWith('/')) return API_ORIGIN + base; // path relativo alla root
    return base; // caso raro/non atteso: lascia invariato
}

// ================================
// STATO LICENZA (logica pura + persistenza)
// ================================

const LicenseState = (function () {
    const STORE_KEY    = 'zappone_lic2';
    const MAX_ATTEMPTS = 3;
    const GRACE_MS     = 7 * 24 * 60 * 60 * 1000;   // copia offline valida 7 giorni

    const MSG = {
        retry:       (n) => `Chiave non riconosciuta (tentativo ${n} di ${MAX_ATTEMPTS}). Controlla di averla copiata per intero e riprova.`,
        exhausted:   'Chiave non riconosciuta dopo 3 tentativi: resto in modalità Demo. Puoi riprovare da Impostazioni › Cambia licenza.',
        changeKept:  'Chiave non riconosciuta per 3 volte: resto con la licenza attuale.',
        expired:     'Licenza scaduta. Rinnovala per riattivare Premium: i tuoi dati restano su questo dispositivo.',
        disabled:    'Licenza non più attiva. I tuoi dati restano su questo dispositivo; se pensi sia un errore contatta il supporto.',
        lost:        'La licenza salvata non risulta più valida. I tuoi dati restano su questo dispositivo.',
        device:      (e) => (e || 'Troppi dispositivi per questa licenza.') + ' I tuoi dati restano su questo dispositivo.',
        unverifiable:'Non riesco a verificare la licenza adesso: Demo temporanea, i tuoi dati sono al sicuro. Riprovo al prossimo avvio.',
        cached:      'Server non raggiungibile: uso la licenza salvata.',
        noForm:      'Non riesco a mostrare il modulo di attivazione. Puoi inserire la licenza da Impostazioni › Cambia licenza.',
        chExpired:   'Questa licenza è scaduta.',
        chDisabled:  'Questa licenza non è più attiva.',
        chDevice:    (e) => e || 'Troppi dispositivi per questa licenza.',
        chUnver:     'Non riesco a verificare la chiave adesso. Controlla la connessione e riprova.'
    };

    function blank() {
        return {
            v: 2,
            key: null,            // chiave associata (digitata o verificata)
            verified: false,      // il server ha già confermato questa chiave almeno una volta
            intent: 'none',       // 'none' | 'license' | 'demo' (demo = SCELTA ESPLICITA o 3 errori)
            demoReason: null,     // 'chosen' | 'invalid_exhausted'
            attempts: 0,          // tentativi falliti consecutivi con una chiave non verificata
            lastStatus: null,     // ultimo verdetto: ok|invalid|expired|disabled|revoked|device_limit|unverifiable
            lastOkAt: 0,          // ms epoch dell'ultima conferma premium del server
            everPremium: false,   // ha avuto premium su questo dispositivo (sostituisce zappone_was_premium)
            jwt: null,
            cfg: null,            // ultima config premium (senza jwt): serve per l'uso offline
            promptNext: false,    // "Cambia licenza" richiesto: mostra il form al prossimo avvio
            tos: 0                // versione della licenza d'uso accettata
        };
    }

    function sanitize(o) {
        const b = blank();
        if (!o || typeof o !== 'object') return b;
        if (typeof o.key === 'string' && o.key) b.key = o.key;
        b.verified    = o.verified === true;
        b.intent      = (o.intent === 'license' || o.intent === 'demo') ? o.intent : 'none';
        b.demoReason  = typeof o.demoReason === 'string' ? o.demoReason : null;
        b.attempts    = (Number.isInteger(o.attempts) && o.attempts > 0) ? Math.min(o.attempts, 99) : 0;
        b.lastStatus  = typeof o.lastStatus === 'string' ? o.lastStatus : null;
        b.lastOkAt    = (Number.isFinite(o.lastOkAt) && o.lastOkAt > 0) ? o.lastOkAt : 0;
        b.everPremium = o.everPremium === true;
        b.jwt         = (typeof o.jwt === 'string' && o.jwt) ? o.jwt : null;
        b.cfg         = (o.cfg && typeof o.cfg === 'object') ? o.cfg : null;
        b.promptNext  = o.promptNext === true;
        b.tos         = (Number.isInteger(o.tos) && o.tos > 0) ? o.tos : 0;
        return b;
    }

    // Costruisce lo stato v2 a partire dalle vecchie chiavi (una tantum).
    function migrateLegacy() {
        const s = blank();
        let key = null, jwt = null, demo = false, wasPremium = false, cache = null;
        try {
            key        = localStorage.getItem('zappone_license');
            jwt        = localStorage.getItem('zappone_jwt');
            demo       = localStorage.getItem('zappone_demo_mode') === 'true';
            wasPremium = localStorage.getItem('zappone_was_premium') === 'true';
            cache      = JSON.parse(localStorage.getItem('zappone_config_cache') || 'null');
        } catch (_) {}
        if (key === 'demo_user') key = null;
        if (key) {
            s.key = key; s.intent = 'license'; s.jwt = jwt || null;
            if (cache && cache.license === key && cache.data) {
                s.verified = true; s.lastStatus = 'ok';
                s.lastOkAt = Number(cache.savedAt) || 0; s.cfg = cache.data;
            } else if (wasPremium) {
                s.verified = true;
            }
        } else if (demo) {
            s.intent = 'demo'; s.demoReason = 'chosen';
        }
        if (wasPremium || s.verified) s.everPremium = true;
        return s;
    }

    function save(s) {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(s));
            // Specchi di compatibilità (sola scrittura).
            if (s.key) localStorage.setItem('zappone_license', s.key); else localStorage.removeItem('zappone_license');
            if (s.jwt) localStorage.setItem('zappone_jwt', s.jwt);     else localStorage.removeItem('zappone_jwt');
        } catch (_) { /* storage pieno o bloccato: si continua con lo stato in memoria */ }
    }

    function load() {
        let raw = null;
        try { raw = localStorage.getItem(STORE_KEY); } catch (_) {}
        if (raw) { try { return sanitize(JSON.parse(raw)); } catch (_) { /* corrotto: si ricostruisce */ } }
        const s = migrateLegacy();
        save(s);
        try {
            ['zappone_demo_mode', 'zappone_was_premium', 'zappone_config_cache']
                .forEach(k => localStorage.removeItem(k));
        } catch (_) {}
        return s;
    }

    // Cosa fare all'avvio, PRIMA di sentire il server.
    //   { action:'demo' }                              demo esplicito: nessuna chiamata
    //   { action:'prompt', reason, prefill, error }    mostra il form (first | retry | change)
    //   { action:'verify', key, fromUrl? }             chiedi al server
    function bootPlan(s, urlKey) {
        if (urlKey) return { action: 'verify', key: urlKey, fromUrl: true };
        if (s.promptNext) return { action: 'prompt', reason: 'change', prefill: '', cancelLabel: 'Annulla' };
        if (s.intent === 'demo') return { action: 'demo' };
        if (!s.key) return { action: 'prompt', reason: 'first', prefill: '' };
        // Chiave digitata, mai confermata, già rifiutata: si ripropone il form (SENZA aspettare il server).
        if (!s.verified && s.lastStatus === 'invalid' && s.attempts > 0 && s.attempts < MAX_ATTEMPTS) {
            return { action: 'prompt', reason: 'retry', prefill: s.key, error: MSG.retry(s.attempts) };
        }
        return { action: 'verify', key: s.key };
    }

    // ── Cuore: verdetto del server → { state, mode, lock, notice, retry, revert } ──
    // opts: { isChange, silent, attempts }
    //   isChange  il form è in modalità "cambia licenza": si committa SOLO su premium
    //   silent    sessione già avviata: mai form, mai tentativi
    //   attempts  tentativi falliti finora (persistiti, oppure locali nel flusso "cambia")
    function apply(base, key, v, now, opts) {
        opts = opts || {};
        const known = base.verified && base.key === key;      // chiave già nota al server come buona
        const out = (state, mode, lock, notice) =>
            ({ state, mode, lock: lock || null, notice: notice || null, retry: null, revert: false });
        const err = (text) => ({ text, isError: true });
        const retry = (error, attempts) =>
            ({ state: base, mode: null, lock: null, notice: null, retry: { error, attempts: attempts || 0 }, revert: false });
        const m = (patch) => Object.assign({}, base, patch);

        switch (v.kind) {

            case 'premium': {
                const cfg = Object.assign({}, v.cfg); delete cfg.jwt;
                return out(m({
                    key, verified: true, intent: 'license', demoReason: null, attempts: 0,
                    lastStatus: 'ok', lastOkAt: now, everPremium: true,
                    jwt: v.jwt || null, cfg, promptNext: false
                }), 'premium');
            }

            case 'unverifiable': {
                const grace = known && base.cfg && base.lastOkAt && (now - base.lastOkAt) <= GRACE_MS;
                if (grace) {
                    return out(m({ lastStatus: 'unverifiable', promptNext: false }), 'premium_cached', null,
                               { text: MSG.cached, isError: false });
                }
                if (opts.isChange) return retry(MSG.chUnver, opts.attempts);
                return out(m({
                    key, intent: 'license', verified: known, lastStatus: 'unverifiable',
                    jwt: known ? base.jwt : null, promptNext: false
                }), 'locked', 'unverifiable', err(MSG.unverifiable));
            }

            case 'invalid': {
                if (known) {   // era buona e ora non lo è più (rimborso, chiave eliminata)
                    return out(m({ lastStatus: 'invalid', jwt: null, cfg: null, promptNext: false }),
                               'locked', 'revoked', err(MSG.lost));
                }
                if (opts.silent) {
                    return out(m({ lastStatus: 'invalid' }), 'locked', 'invalid', err(MSG.exhausted));
                }
                const attempts = (opts.attempts || 0) + 1;
                if (attempts >= MAX_ATTEMPTS) {
                    if (opts.isChange) {
                        const r = out(base, null); r.revert = true; r.notice = err(MSG.changeKept); return r;
                    }
                    return out(m({
                        key: null, verified: false, intent: 'demo', demoReason: 'invalid_exhausted',
                        attempts, lastStatus: 'invalid', jwt: null, cfg: null, promptNext: false
                    }), 'demo', null, err(MSG.exhausted));
                }
                if (opts.isChange) return retry(MSG.retry(attempts), attempts);
                return {
                    state: m({ key, verified: false, intent: 'license', attempts, lastStatus: 'invalid', jwt: null, cfg: null }),
                    mode: null, lock: null, notice: null, retry: { error: MSG.retry(attempts), attempts }, revert: false
                };
            }

            case 'expired':
            case 'disabled':
            case 'revoked': {
                if (opts.isChange) return retry(v.kind === 'expired' ? MSG.chExpired : MSG.chDisabled, opts.attempts);
                return out(m({
                    key, verified: true, intent: 'license', demoReason: null, attempts: 0,
                    lastStatus: v.kind, jwt: null, cfg: null, promptNext: false
                }), 'locked', v.kind, err(v.kind === 'expired' ? MSG.expired : MSG.disabled));
            }

            case 'device_limit': {
                if (opts.isChange) return retry(MSG.chDevice(v.error), opts.attempts);
                return out(m({
                    key, verified: true, intent: 'license', demoReason: null, attempts: 0,
                    lastStatus: 'device_limit', jwt: null, cfg: null, promptNext: false
                }), 'locked', 'device_limit', err(MSG.device(v.error)));
            }

            default:
                return out(m({ lastStatus: 'unverifiable' }), 'locked', 'unverifiable', err(MSG.unverifiable));
        }
    }

    // Scelta esplicita "Continua in Demo" dal form di primo avvio / retry.
    function chooseDemo(s) {
        return Object.assign({}, s, {
            key: s.verified ? s.key : null, intent: 'demo', demoReason: 'chosen',
            attempts: 0, promptNext: false, lastStatus: s.verified ? s.lastStatus : null,
            jwt: s.verified ? s.jwt : null
        });
    }

    // "Cambia licenza": NON cancella nulla. Il form compare al prossimo avvio ed è annullabile.
    function requestChange() {
        const s = load();
        s.promptNext = true;
        save(s);
        return s;
    }

    // ── Stato runtime (per UI e db.js) ──
    const runtime = { mode: 'demo', lock: null, ns: null };

    function setRuntime(mode, lock, freezeNamespace) {
        runtime.mode = mode; runtime.lock = lock || null;
        if (freezeNamespace) runtime.ns = canUsePremiumData() ? 'premium' : 'demo';
    }
    function canUsePremiumData() { return runtime.mode === 'premium' || runtime.mode === 'premium_cached'; }

    // Namespace dei dati, FISSATO all'avvio: non cambia durante la sessione.
    function dbNamespace() { return runtime.ns || 'premium'; }
    // Nome del database da aprire: "ZappOneDB" (premium, invariato) o "ZappOneDB_demo".
    // Se chiamata prima che la licenza sia risolta restituisce il nome premium: meglio dati
    // disponibili che un DB vuoto (il gating è una regola di prodotto, non una barriera di sicurezza).
    function dbName(base) {
        if (!runtime.ns) {
            if (typeof console !== 'undefined') console.warn('[license] dbName() chiamata prima di licenseReady');
            return base;
        }
        return runtime.ns === 'premium' ? base : base + '_demo';
    }

    function maskKey(k) {
        if (!k) return '—';
        return k.length > 8 ? k.slice(0, 4) + '…' + k.slice(-4) : '••••';
    }
    function describe() {
        const s = load();
        return { mode: runtime.mode, lock: runtime.lock, maskedKey: maskKey(s.key),
                 everPremium: s.everPremium, lastStatus: s.lastStatus, demoReason: s.demoReason };
    }

    return {
        STORE_KEY, MAX_ATTEMPTS, GRACE_MS, MSG,
        blank, sanitize, load, save, bootPlan, apply, chooseDemo, requestChange,
        setRuntime, canUsePremiumData, dbNamespace, dbName, describe, maskKey,
        get runtime() { return runtime; }
    };
})();
window.LicenseState = LicenseState;

// Si legge DOPO la definizione di LicenseState (migra le vecchie chiavi se serve).
jwtToken = LicenseState.load().jwt;

// Promessa che si risolve quando la licenza è stata decisa (db.js la attende prima di aprire il DB).
let _resolveReady;
window.licenseReady = new Promise((r) => { _resolveReady = r; });
let _bootDone = false;

// ================================
// FUNZIONE: FINGERPRINT DISPOSITIVO
// ================================
// ID di installazione. Prima era un hash di userAgent/schermo/fuso/CPU: due iPhone uguali
// (stesso modello, stessa versione, stesso fuso) producevano LO STESSO id e occupavano un solo slot.
// Ora è casuale e persistito. Gli id già salvati (z1_…) non vengono toccati.
// Se localStorage non è scrivibile si ripiega sull'hash (stabile tra le sessioni, niente slot "bruciati").

function legacyFingerprint() {
    const data = [
        navigator.userAgent, navigator.language,
        screen.colorDepth, screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 2,
    ].join('|');
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash = hash & hash;
    }
    return 'z1_' + Math.abs(hash);
}

async function getFingerprint() {
    let stored = null;
    try { stored = localStorage.getItem('zappone_device_id'); } catch (_) {}
    if (stored) return stored;

    let id;
    try { id = 'z2_' + crypto.randomUUID().replace(/-/g, ''); }
    catch (_) { id = 'z2_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }

    try {
        localStorage.setItem('zappone_device_id', id);
        if (localStorage.getItem('zappone_device_id') !== id) return legacyFingerprint();
    } catch (_) { return legacyFingerprint(); }
    return id;
}

// ================================
// CONFIG → STATO GLOBALE DELL'APP
// ================================

// Applica una configurazione allo stato globale dell'app.
function applyConfig(data) {
    appConfig.status       = data.status;
    appConfig.isPremium    = (data.status === 'premium');
    appConfig.playlistUrl  = data.playlistUrl;
    appConfig.epgUrl       = data.epgUrl;
    appConfig.proxies      = (data.proxies && data.proxies.length) ? data.proxies : FALLBACK_PROXIES;
    appConfig.devicesCount = data.devicesCount;
    appConfig.maxDevices   = data.maxDevices;
    appConfig.maxEpgSlots  = (typeof data.maxEpgSlots === 'number' && data.maxEpgSlots > 0)
                             ? data.maxEpgSlots
                             : 1;
    appConfig.canUpload    = data.canUpload === true;

    isPremium            = appConfig.isPremium;
    DEFAULT_PLAYLIST_URL = appConfig.playlistUrl;
    epgUrl               = appConfig.epgUrl;
    M3U_PROXIES          = appConfig.proxies;
}

// Applica l'esito di LicenseState.apply (modalità + configurazione + JWT).
function applyOutcome(out, freezeNamespace) {
    const live = out.mode === 'premium' || out.mode === 'premium_cached';
    applyConfig(live && out.state.cfg ? out.state.cfg : DEMO_CFG);
    jwtToken = live ? (out.state.jwt || null) : null;
    LicenseState.setRuntime(out.mode, out.lock, freezeNamespace);
}

// Durante lo splash i toast sono coperti: il messaggio viene mostrato da zappone.js
// appena l'app è visibile (vedi window.__pendingLicenseNotice). Ad app già avviata
// si mostra subito.
function notifyLicense(message, isError) {
    if (document.getElementById('appSplash')) {
        window.__pendingLicenseNotice = { message, isError };
    } else if (typeof showNotification === 'function') {
        showNotification(message, isError);
    }
}

// ================================
// VERIFICA CHIAVE (solo rete: NON modifica lo stato salvato)
// ================================
// Ritorna { kind: 'premium', cfg, jwt } | { kind: 'invalid'|'expired'|'disabled'|'revoked' }
//       | { kind: 'device_limit', error } | { kind: 'unverifiable' }

async function verifyKey(key, state) {
    const deviceId = await getFingerprint();
    const ctrl = new AbortController();
    const timer = setTimeout(
        () => ctrl.abort(new DOMException('Config timeout', 'TimeoutError')),
        CONFIG_TIMEOUT_MS
    );
    try {
        const tos = state && state.tos ? `&tos=${state.tos}` : '';
        const res = await fetch(
            `${API_ORIGIN}/api/get-config?license=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(deviceId)}${tos}`,
            { signal: ctrl.signal, cache: 'no-store' }
        );

        if (res.status === 403) {
            const body = (await res.json().catch(() => null)) || {};
            if (body.reason === 'revoked') return { kind: 'revoked' };
            // 403 prodotto da get-config: { error, reason } (vecchio server: solo { error }).
            if (body.reason === 'device_limit' || body.reason === 'bad_device' || (!body.reason && body.error)) {
                return { kind: 'device_limit', error: body.error };
            }
            // 403 che non viene da noi (WAF, CDN, pagina HTML): non dice nulla sulla licenza.
            return { kind: 'unverifiable' };
        }
        // 503 (licenza non verificabile), 429, 5xx: NON dicono nulla sulla chiave.
        if (!res.ok) return { kind: 'unverifiable' };

        const data = await res.json().catch(() => null);
        if (!data || typeof data !== 'object') return { kind: 'unverifiable' };

        if (data.status === 'premium') {
            const { jwt, ...cfg } = data;
            return { kind: 'premium', cfg, jwt: jwt || null };
        }
        if (data.reason === 'expired' || data.reason === 'disabled') return { kind: data.reason };
        return { kind: 'invalid' };
    } catch (e) {
        console.error('Errore handshake server:', e && e.message);
        return { kind: 'unverifiable' };
    } finally {
        clearTimeout(timer);
    }
}

// ================================
// FORM LICENZA NELLO SPLASH
// ================================
// Il form è quello già presente in #appSplash (nessuna modifica all'HTML). Il controller
// si aggancia UNA volta e può essere riproposto più volte (retry). Se manca un elemento
// o il form non compare, ask() restituisce UNAVAILABLE: è un guasto tecnico e NON una
// scelta dell'utente, quindi non viene mai salvato come "demo esplicito".
//
// ask({ prefill, error, cancelLabel }) →
//    { key, tos }   l'utente ha inserito una chiave
//    null           ha premuto il pulsante secondario
//    UNAVAILABLE    guasto tecnico

const SplashForm = (function () {
    const UNAVAILABLE = { unavailable: true };
    const PHASE1_MS   = 1500;
    const WATCHDOG_MS = 20000;
    let ctl = null;
    let firstShown = false;

    function bind() {
        if (ctl) return ctl;
        const splash = document.getElementById('appSplash');
        if (!splash) { console.warn('[splash] #appSplash non trovato'); return null; }
        const input   = splash.querySelector('#splashLicenseInput');
        const btnOk   = splash.querySelector('.splash-btn-primary');
        const btnDemo = splash.querySelector('.splash-btn-ghost');
        if (!input || !btnOk || !btnDemo) {
            console.error('[splash] elementi form mancanti in #appSplash',
                { input: !!input, btnOk: !!btnOk, btnDemo: !!btnDemo });
            return null;
        }

        // Riga errore: se non esiste nell'HTML la crea sotto il campo.
        let errEl = splash.querySelector('#splashLicenseError');
        if (!errEl) {
            errEl = document.createElement('div');
            errEl.id = 'splashLicenseError';
            errEl.setAttribute('role', 'alert');
            errEl.style.cssText = 'min-height:1.3em;margin:8px 0 0;font-size:13px;line-height:1.35;color:#ff6b6b;text-align:center';
            // Il campo sta dentro .splash-license-input-wrap (bordo a gradiente): la riga va DOPO il
            // contenitore, altrimenti finisce dentro il bordo. Meglio ancora: <div id="splashLicenseError">
            // già nell'HTML (vedi patches/index.html.patch): in quel caso non si crea nulla.
            const anchor = (typeof input.closest === 'function' && input.closest('.splash-license-input-wrap')) || input;
            try { anchor.insertAdjacentElement('afterend', errEl); } catch (_) {
                if (anchor.parentNode) anchor.parentNode.insertBefore(errEl, anchor.nextSibling);
            }
        }

        // Casella di accettazione (solo se REQUIRE_TOS).
        let tosBox = splash.querySelector('#splashTos');
        if (REQUIRE_TOS && !tosBox) {
            try {
                const label = document.createElement('label');
                label.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:12px;line-height:1.35;opacity:.85';
                label.innerHTML = '<input type="checkbox" id="splashTos" style="margin-top:2px"><span>Accetto la ' +
                    '<a href="' + TOS_URL + '" target="_blank" rel="noopener">Licenza d\u2019uso</a>: uso personale, ' +
                    'non trasferibile, nessuna copia o rivendita dell\u2019app.</span>';
                errEl.insertAdjacentElement('afterend', label);
                tosBox = label.querySelector('#splashTos');
            } catch (_) { tosBox = null; }
        }

        ctl = { splash, input, btnOk, btnDemo, errEl, tosBox,
                okLabel: btnOk.textContent, demoLabel: btnDemo.textContent, pending: null };

        const lock = (on) => { btnOk.disabled = on; btnDemo.disabled = on; };

        const submit = () => {
            if (!ctl.pending) return;
            const v = (input.value || '').trim();
            if (!v) { try { input.focus(); } catch (_) {} return; }
            if (REQUIRE_TOS && ctl.tosBox && !ctl.tosBox.checked) {
                errEl.textContent = 'Per continuare accetta la Licenza d\u2019uso.';
                return;
            }
            lock(true);
            btnOk.textContent = 'Verifica…';
            errEl.textContent = '';
            const done = ctl.pending; ctl.pending = null;
            done({ key: v, tos: (REQUIRE_TOS && ctl.tosBox && ctl.tosBox.checked) ? TOS_VERSION : 0 });
        };

        btnOk.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
        btnDemo.addEventListener('click', () => {
            if (!ctl.pending) return;
            lock(true);
            const done = ctl.pending; ctl.pending = null;
            done(null);
        });
        return ctl;
    }

    function ask(opts) {
        opts = opts || {};
        return new Promise((resolve) => {
            let settled = false;
            const settle = (v) => { if (!settled) { settled = true; resolve(v); } };

            const show = () => {
                if (settled) return;
                const c = bind();
                if (!c) { settle(UNAVAILABLE); return; }
                c.pending = settle;
                c.splash.classList.add('splash-phase-license');
                c.input.value = opts.prefill || '';
                c.btnOk.textContent = c.okLabel;
                c.btnDemo.textContent = opts.cancelLabel || c.demoLabel;
                c.errEl.textContent = opts.error || '';
                c.btnOk.disabled = false;
                c.btnDemo.disabled = false;
                setTimeout(() => { try { c.input.focus(); } catch (_) {} }, 550);
            };

            if (firstShown) { show(); return; }
            firstShown = true;

            // Rete di sicurezza: se il form non compare entro 20 s è un guasto tecnico.
            const watchdog = setTimeout(() => {
                console.warn('[splash] form licenza non comparso');
                settle(UNAVAILABLE);
            }, WATCHDOG_MS);

            // Aspetta che la fase 1 dello splash abbia girato un minimo.
            const shownAt = window.__splashShownAt || performance.now();
            const wait = Math.max(0, PHASE1_MS - (performance.now() - shownAt));
            setTimeout(() => { clearTimeout(watchdog); show(); }, wait);
        });
    }

    return { ask, UNAVAILABLE };
})();

// Compatibilità: vecchio nome. Ritorna la chiave digitata, oppure null.
function promptLicenseElegant() {
    return SplashForm.ask().then(r => (r && r.key) ? r.key : null);
}

// ================================
// RISOLUZIONE LICENZA ALL'AVVIO
// ================================
// deps (solo per i test): { verify, ask, now, urlKey }

function readUrlLicense() {
    let v = null;
    try { v = new URLSearchParams(location.search).get('license'); } catch (_) {}
    v = v && v.trim();
    if (!v) return null;
    // Link di Lemon Squeezy: https://zappone.netlify.app/?license=[license_key]
    try { history.replaceState({}, '', location.pathname + location.hash); } catch (_) {}
    return v.slice(0, 200);
}

function finalizeBoot(out, carry) {
    applyOutcome(out, true);
    const n = out.notice || carry;
    if (n) notifyLicense(n.text, n.isError);
    _bootDone = true;
    _resolveReady(true);
    return out.mode === 'premium' || out.mode === 'premium_cached';
}

async function resolveLicense(deps) {
    deps = deps || {};
    const verify = deps.verify || verifyKey;
    const ask    = deps.ask    || SplashForm.ask;
    const now    = deps.now    || Date.now;
    const urlKey = (deps.urlKey !== undefined) ? deps.urlKey : readUrlLicense();
    const MSG    = LicenseState.MSG;

    let s = LicenseState.load();
    let plan = LicenseState.bootPlan(s, urlKey);
    if (urlKey && REQUIRE_TOS && !s.tos) plan = { action: 'prompt', reason: 'first', prefill: urlKey };

    let isChange = false;      // il form è in modalità "cambia licenza" (si committa solo su premium)
    let localAttempts = 0;     // tentativi falliti nel flusso "cambia"
    let carry = null;          // avviso da mostrare se l'esito finale non ne ha uno
    let candidate = null;

    for (let guard = 0; guard < 25; guard++) {

        if (plan.action === 'demo') {
            return finalizeBoot({ state: s, mode: 'demo', lock: null, notice: null }, carry);
        }

        let verdict;

        if (plan.action === 'prompt') {
            const raw = await ask({ prefill: plan.prefill, error: plan.error, cancelLabel: plan.cancelLabel, reason: plan.reason });

            if (raw === SplashForm.UNAVAILABLE) {
                // Guasto tecnico: demo per questa sessione, NIENTE viene salvato (al prossimo avvio si riprova).
                return finalizeBoot({ state: s, mode: 'demo', lock: null, notice: { text: MSG.noForm, isError: true } }, carry);
            }
            if (raw === null || raw === undefined) {               // pulsante secondario
                if (plan.reason === 'change') {                    // "Annulla": tutto resta com'era
                    s = Object.assign({}, s, { promptNext: false });
                    LicenseState.save(s);
                    isChange = false; localAttempts = 0;
                    plan = LicenseState.bootPlan(s, null);
                    continue;
                }
                s = LicenseState.chooseDemo(s);                    // "Continua in Demo": scelta ESPLICITA
                LicenseState.save(s);
                return finalizeBoot({ state: s, mode: 'demo', lock: null, notice: null }, carry);
            }

            const ans = (typeof raw === 'string') ? { key: raw } : raw;
            candidate = String(ans.key || '').trim();
            if (!candidate) continue;
            if (plan.reason === 'change') isChange = true;
            if (ans.tos) s = Object.assign({}, s, { tos: ans.tos });
            verdict = await verify(candidate, s);

        } else {                                                    // 'verify'
            candidate = plan.key;
            if (plan.fromUrl) {
                // Una chiave nuova da link, mentre ne esiste una già confermata, si tratta come "cambia".
                isChange = !!(s.verified && s.key && s.key !== candidate);
                if (!isChange && s.key !== candidate) {
                    s = Object.assign({}, s, {
                        key: candidate, verified: false, intent: 'license', demoReason: null,
                        attempts: 0, lastStatus: null, promptNext: false, jwt: null, cfg: null
                    });
                }
            }
            verdict = await verify(candidate, s);
        }

        const out = LicenseState.apply(s, candidate, verdict, now(),
                                       { isChange, attempts: isChange ? localAttempts : s.attempts });

        if (out.revert) {                                          // 3 errori nel flusso "cambia": si resta come prima
            s = Object.assign({}, s, { promptNext: false });
            LicenseState.save(s);
            isChange = false; localAttempts = 0; carry = out.notice;
            plan = LicenseState.bootPlan(s, null);
            continue;
        }

        if (out.retry) {                                           // si ripropone il form con il motivo
            if (isChange) localAttempts = out.retry.attempts;
            else { s = out.state; LicenseState.save(s); }          // refuso: persistito, sopravvive alla chiusura
            plan = {
                action: 'prompt', reason: isChange ? 'change' : 'retry',
                prefill: candidate, error: out.retry.error,
                cancelLabel: isChange ? 'Annulla' : undefined
            };
            continue;
        }

        LicenseState.save(out.state);
        return finalizeBoot(out, carry);
    }

    // Non dovrebbe mai succedere: si esce in modo sicuro (nessuna cancellazione, nulla salvato).
    return finalizeBoot({ state: s, mode: 'locked', lock: 'unverifiable',
                          notice: { text: MSG.unverifiable, isError: true } }, carry);
}

// ================================
// RINNOVO SILENZIOSO (sessione già avviata)
// ================================
// Single-flight: N richieste che ricevono 403 insieme fanno UNA sola chiamata. Mai form, mai tentativi.

let _refreshing = null;

function refreshLicenseSilently() {
    if (_refreshing) return _refreshing;
    _refreshing = (async () => {
        const s = LicenseState.load();
        if (!s.key) return false;
        const before = LicenseState.runtime.mode;
        const v = await verifyKey(s.key, s);
        const out = LicenseState.apply(s, s.key, v, Date.now(), { silent: true });

        // Errore transitorio con la sessione già premium: non cambio nulla e non disturbo.
        if (out.mode === 'premium_cached' && (before === 'premium' || before === 'premium_cached')) return true;

        // La sessione è partita in demo/locked: i dati premium stanno in un ALTRO database (namespace fissato
        // all'avvio). Attivare premium adesso farebbe scrivere nel database demo. Si salva lo stato, così al
        // prossimo avvio sarà premium, ma a sessione in corso non si cambia nulla.
        const live = out.mode === 'premium' || out.mode === 'premium_cached';
        if (live && LicenseState.runtime.ns === 'demo') {
            LicenseState.save(out.state);
            notifyLicense('Licenza verificata: riavvia l\u2019app per attivare Premium.', false);
            return false;
        }

        LicenseState.save(out.state);
        applyOutcome(out, false);       // il namespace dei dati NON cambia a sessione in corso
        if (out.mode !== before && out.notice) notifyLicense(out.notice.text, out.notice.isError);
        return out.mode === 'premium' || out.mode === 'premium_cached';
    })().finally(() => { _refreshing = null; });
    return _refreshing;
}

// ================================
// FUNZIONE: OTTIENI CONFIGURAZIONE DAL SERVER
// ================================
// Prima chiamata (avvio): flusso completo con eventuale form. Chiamate successive: rinnovo silenzioso.
// Ritorna true se la modalità finale è premium (anche da copia offline).

let _bootPromise = null;

function getConfigFromServer() {
    if (!_bootPromise) {
        _bootPromise = resolveLicense().catch((e) => {
            // Errore imprevisto: nessuna cancellazione, nessun salvataggio, demo per questa sessione.
            console.error('[license] errore imprevisto, modalità sicura:', e);
            applyOutcome({ state: LicenseState.blank(), mode: 'locked', lock: 'unverifiable' }, true);
            _bootDone = true;
            _resolveReady(true);
            return false;
        });
        return _bootPromise;
    }
    return _bootDone ? refreshLicenseSilently() : _bootPromise;
}

// ================================
// FUNZIONE: DOWNLOAD TRAMITE PROXY (CON LICENZA)
// ================================

async function fetchM3UWithProxies(url, returnType = 'text', retry = true) {
    if (!url) return null;
    const license = localStorage.getItem("zappone_license") || "demo";
    const deviceId = await getFingerprint();

    const proxy = appConfig.proxies[0];
    if (!proxy) return null;

    let finalUrl = `${resolveApiUrl(proxy.base)}${encodeURIComponent(url)}&returnType=${encodeURIComponent(returnType)}`;

    // Usa il JWT se disponibile, altrimenti license+deviceId
    if (jwtToken) {
        finalUrl += `&token=${encodeURIComponent(jwtToken)}`;
    } else {
        finalUrl += `&license=${encodeURIComponent(license)}&deviceId=${encodeURIComponent(deviceId)}`;
    }

    try {
        const response = await fetch(finalUrl);
        if (response.status === 403) {
            // JWT scaduto, licenza non più valida o troppi dispositivi: rinnovo SILENZIOSO (mai il form).
            if (retry) {
                const ok = await refreshLicenseSilently();
                if (ok) return fetchM3UWithProxies(url, returnType, false);
            }
            if (typeof showNotification === 'function') {
                showNotification("Licenza non valida o troppi dispositivi", true);
            }
            return null;
        }
        // 503 = licenza non verificabile adesso: errore temporaneo, nessun cambio di stato.
        if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);

        if (returnType === 'arrayBuffer') {
            return await response.arrayBuffer();
        } else {
            return await response.text();
        }
    } catch (error) {
        console.error("Errore download proxy:", error);
        return null;
    }
}

// ================================
// FUNZIONE: WRAPPER PER SCARICARE M3U
// ================================

async function downloadM3U(url) {
    return fetchM3UWithProxies(url);
}

// Esportazione per i test in Node (nel browser `module` non esiste: nessun effetto).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LicenseState, SplashForm, resolveLicense, refreshLicenseSilently, getConfigFromServer,
        verifyKey, fetchM3UWithProxies, getFingerprint, applyConfig, readUrlLicense,
        get appConfig() { return appConfig; },
        get jwtToken() { return jwtToken; },
        DEMO_CFG
    };
}
