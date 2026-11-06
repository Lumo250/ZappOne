// ================================================================
//  MODULO LICENZA - ZappOne
//  Gestisce autenticazione, fingerprint e proxy
//
//  [MIGRAZIONE GUMROAD → LEMON SQUEEZY]
//  Il client non parla con nessuna delle due piattaforme: delega tutto
//  a /api/get-config. Le modifiche qui sono solo due:
//    1) Lettura del parametro ?license= dall'URL (link di Lemon Squeezy).
//    2) Timeout handshake portato a 10s + abort con reason leggibile.
//  Il resto (fingerprint, cache offline, proxy, JWT) è invariato.
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

// All'avvio, carica il JWT salvato
jwtToken = localStorage.getItem('zappone_jwt') || null;

// ================================
// COSTANTE: origine del backend Netlify
// ================================
// FIX: unica fonte di verità per il dominio di produzione, usata sia per
// get-config sia per normalizzare i path relativi (vedi resolveApiUrl sotto).
const API_ORIGIN = 'https://zappone.netlify.app';

// Normalizza un path/URL restituito dal server in un URL assoluto verso il backend
// reale, indipendentemente da dove sono serviti i file statici (produzione, file
// locale, un altro dominio di test, ecc.).
function resolveApiUrl(base) {
    if (!base) return base;
    if (/^https?:\/\//i.test(base)) return base; // già assoluto: non toccare
    if (base.startsWith('/')) return API_ORIGIN + base; // path relativo alla root
    return base; // caso raro/non atteso: lascia invariato
}

// ================================
// FUNZIONE: FINGERPRINT DISPOSITIVO
// ================================

async function getFingerprint() {
    const stored = localStorage.getItem('zappone_device_id');
    if (stored) return stored;

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
    const id = 'z1_' + Math.abs(hash);
    localStorage.setItem('zappone_device_id', id);
    return id;
}

// ================================
// [FIX 1] CONFIG IN CACHE LOCALE (modalità offline / server lento)
// ================================
// Conserviamo esplicitamente l'ultima config premium valida per 7 giorni.
// Se il server non risponde (offline, timeout, errore 5xx) usiamo quella.
const CONFIG_CACHE_KEY  = 'zappone_config_cache';
const CONFIG_GRACE_MS   = 7 * 24 * 60 * 60 * 1000;
// [MIGRAZIONE] Timeout portato da 6s a 10s: margine per cold start Netlify
// e per una risposta di Lemon Squeezy più lenta del previsto.
const CONFIG_TIMEOUT_MS = 10000;
// Proxy di ripiego: se non arriva nessuna config, appConfig.proxies resterebbe vuoto e
// OGNI download fallirebbe in silenzio.
const FALLBACK_PROXIES  = [{ base: '/.netlify/functions/cors-proxy?url=', encode: true }];

function saveConfigCache(license, data) {
    try {
        const { jwt, ...rest } = data;            // il JWT ha già la sua chiave (zappone_jwt)
        localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), license, data: rest }));
    } catch (_) {}
}

function loadConfigCache(license) {
    try {
        const raw = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null');
        if (!raw || raw.license !== license) return null;             // vale solo per la stessa licenza
        if (Date.now() - raw.savedAt > CONFIG_GRACE_MS) return null;  // scaduta
        return raw.data;
    } catch (_) { return null; }
}

function clearConfigCache() {
    try { localStorage.removeItem(CONFIG_CACHE_KEY); } catch (_) {}
}

// Applica una configurazione (dal server o dalla cache) allo stato globale dell'app.
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

// Durante lo splash i toast sono coperti: il messaggio viene mostrato da zappone.js
// appena l'app è visibile (vedi window.__pendingLicenseNotice). Ad app già avviata
// (es. rinnovo del token) si mostra subito.
function notifyLicense(message, isError) {
    if (document.getElementById('appSplash')) {
        window.__pendingLicenseNotice = { message, isError };
    } else if (typeof showNotification === 'function') {
        showNotification(message, isError);
    }
}

// ================================
// FUNZIONE: OTTIENI CONFIGURAZIONE DAL SERVER
// ================================

async function getConfigFromServer() {
    const deviceId = await getFingerprint();

    // ── [LICENSE-URL] Licenza passata via URL (link Lemon Squeezy) ──
    // Il link del prodotto è https://zappone.netlify.app/?license=[license_key].
    // Lemon Squeezy sostituisce [license_key] con la chiave al momento
    // dell'acquisto. Qui la leggiamo, la salviamo in localStorage e
    // rimuoviamo il parametro dalla barra degli indirizzi.
    // DEVE stare PRIMA della lettura di license/demoMode, così da
    // sovrascrivere correttamente eventuali valori pregressi e uscire
    // dal flag demo (se presente).
    let urlLicense = null;
    try {
        urlLicense = new URLSearchParams(location.search).get('license');
    } catch (_) {}

    // ── Determina la licenza ──
    let license = localStorage.getItem("zappone_license");
    if (urlLicense && urlLicense.trim()) {
        license = urlLicense.trim();
        try {
            localStorage.setItem("zappone_license", license);
            localStorage.removeItem("zappone_demo_mode");
            // Pulisce l'URL: rimuove ?license=... dalla barra degli indirizzi
            history.replaceState({}, '', location.pathname + location.hash);
        } catch (_) {}
    }

    const demoMode = localStorage.getItem("zappone_demo_mode") === "true";
    let typedNow = false;   // [FIX 1] true se la chiave è stata appena digitata dall'utente

    // Chiedi la licenza SOLO se non ce n'è una e l'utente non ha già scelto Demo
    if (!demoMode && (!license || license === "demo_user")) {
        const input = await promptLicenseElegant();
        if (input) {
            license = input;
            typedNow = true;
            // Persisti SUBITO: se il server risponde demo (licenza scaduta),
            // non vogliamo ripresentare il form ad ogni avvio.
            localStorage.setItem("zappone_license", input);
        } else {
            // L'utente ha scelto "Continua in Demo":
            // ricordiamolo per non richiedere più il form.
            // (Per tornare indietro: Impostazioni › Avanzate › Cambia licenza)
            localStorage.setItem("zappone_demo_mode", "true");
            license = "demo_user";
        }
    }
    license = license || "demo_user";

    // ── Contatta il server ──
    let data = null;
    let usedCache = false;

    try {
        // [MIGRAZIONE] Abort con reason esplicita (in console vedrai
        // "Config timeout" invece di "signal is aborted without reason").
        const ctrl = new AbortController();
        const timer = setTimeout(
            () => ctrl.abort(new DOMException('Config timeout', 'TimeoutError')),
            CONFIG_TIMEOUT_MS
        );
        let res;
        try {
            res = await fetch(
                `${API_ORIGIN}/api/get-config?license=${encodeURIComponent(license)}&deviceId=${encodeURIComponent(deviceId)}`,
                { signal: ctrl.signal, cache: 'no-store' }
            );
        } finally {
            clearTimeout(timer);
        }

        if (res.status === 403) {
            const errorData = await res.json().catch(() => ({}));
            // [FIX 1] Prima qui si faceva removeItem("zappone_license"): con "troppi dispositivi"
            // la chiave (valida!) veniva cancellata e andava digitata di nuovo. Ora resta salvata:
            // l'utente vede il messaggio e per questa sessione l'app resta in Demo.
            notifyLicense(errorData.error || "Accesso negato.", true);
            applyConfig({ status: 'demo', playlistUrl: null, epgUrl: null, proxies: null });
            return false;
        }

        if (!res.ok) throw new Error('HTTP ' + res.status);
        data = await res.json();

    } catch (e) {
        console.error("Errore handshake server:", e.message);
        // [FIX 1] Offline / timeout / errore server: uso l'ultima config premium salvata (max 7 giorni)
        const cached = loadConfigCache(license);
        if (cached) {
            data = cached;
            usedCache = true;
        } else {
            applyConfig({ status: 'demo', playlistUrl: null, epgUrl: null, proxies: null });
            return false;
        }
    }

    // ── Applica la configurazione ──
    if (data.jwt) {
        jwtToken = data.jwt;
        localStorage.setItem('zappone_jwt', data.jwt);
    } else if (!usedCache) {
        jwtToken = null;
        localStorage.removeItem('zappone_jwt');
    }
    // (se arriva dalla cache teniamo il JWT già salvato)

    applyConfig(data);

    if (usedCache) {
        notifyLicense("Server non raggiungibile: uso la licenza salvata.", false);
    } else if (appConfig.isPremium) {
        saveConfigCache(license, data);                 // copia per l'uso offline
        localStorage.removeItem("zappone_demo_mode");   // ora è premium: niente flag demo
    } else {
        clearConfigCache();                             // il server dice "non premium": la copia non vale più
        // [FIX 1] Prima una chiave sbagliata o scaduta finiva in Demo senza alcun avviso.
        if (typedNow) {
            notifyLicense("Licenza non valida o scaduta: modalità Demo. Puoi riprovare da Impostazioni › Avanzate › Cambia licenza.", true);
        }
    }
    return true;
}

// Mostra il form licenza dentro lo splash (fase 2).
// Ritorna: stringa → licenza; null → l'utente ha scelto Demo.
function promptLicenseElegant() {
  return new Promise((resolve) => {

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    // Rete di sicurezza: se per qualunque motivo il form non compare
    // (HTML mancante, elemento rimosso, ecc.), dopo 20s entra in demo.
    const formWatchdog = setTimeout(() => {
      if (!resolved) {
        console.warn('[splash] form licenza non comparso → demo');
        finish(null);
      }
    }, 20000);

    const splash = document.getElementById('appSplash');
    if (!splash) {
      console.warn('[splash] #appSplash non trovato → demo');
      finish(null);
      return;
    }

    // Aspetta che la fase 1 abbia girato un minimo
    const shownAt = window.__splashShownAt || performance.now();
    const PHASE1_MS = 1500;
    const wait = Math.max(0, PHASE1_MS - (performance.now() - shownAt));

    setTimeout(() => {
      splash.classList.add('splash-phase-license');
      clearTimeout(formWatchdog);   // [FIX 1] il form è visibile: da qui in poi aspetta l'utente senza limiti

      const input   = splash.querySelector('#splashLicenseInput');
      const btnOk   = splash.querySelector('.splash-btn-primary');
      const btnDemo = splash.querySelector('.splash-btn-ghost');

      // Se manca uno degli elementi, NON crashare: vai in demo e logga.
      if (!input || !btnOk || !btnDemo) {
        console.error('[splash] elementi form mancanti in #appSplash',
          { input: !!input, btnOk: !!btnOk, btnDemo: !!btnDemo });
        finish(null);
        return;
      }

      setTimeout(() => { try { input.focus(); } catch (_) {} }, 550);

      const submit = () => {
        const v = (input.value || '').trim();
        if (!v) { input.focus(); return; }
        btnOk.disabled = btnDemo.disabled = true;
        btnOk.textContent = 'Verifica…';
        finish(v);
      };

      btnOk.addEventListener('click', submit);
      btnDemo.addEventListener('click', () => {
        btnOk.disabled = btnDemo.disabled = true;
        finish(null);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
    }, wait);
  });
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
        finalUrl += `&license=${license}&deviceId=${deviceId}`;
    }

    try {
        const response = await fetch(finalUrl);
        if (response.status === 403) {
            // Se è la prima volta, prova a rinnovare il token
            if (retry) {
                console.log('JWT scaduto o licenza bloccata, rinnovo...');
                // Rinnova la configurazione (e il JWT)
                await getConfigFromServer();
                // Richiama la stessa funzione con retry=false
                return fetchM3UWithProxies(url, returnType, false);
            } else {
                // Secondo tentativo fallito
                if (typeof showNotification === 'function') {
                    showNotification("Licenza non valida o troppi dispositivi", true);
                }
                return null;
            }
        }
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

// ================================
// ESPORTA (se usi moduli, altrimenti lascia globali)
// ================================

// Se il progetto usa ES Modules, decommenta queste righe:
// export {
//     isPremium,
//     DEFAULT_PLAYLIST_URL,
//     epgUrl,
//     M3U_PROXIES,
//     appConfig,
//     getFingerprint,
//     getConfigFromServer,
//     fetchM3UWithProxies,
//     downloadM3U
// };