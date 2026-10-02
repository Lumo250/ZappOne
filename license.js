// ================================================================
//  MODULO LICENZA - ZappOne
//  Gestisce autenticazione, fingerprint e proxy
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
    maxDevices: null
};


let jwtToken = null;

// All'avvio, carica il JWT salvato
jwtToken = localStorage.getItem('zappone_jwt') || null;

// ================================
// COSTANTE: origine del backend Netlify
// ================================
// FIX: unica fonte di verità per il dominio di produzione, usata sia per
// get-config sia per normalizzare i path relativi (vedi resolveApiUrl sotto).
// In precedenza solo getConfigFromServer usava un URL assoluto: fetchM3UWithProxies
// usava invece il path RELATIVO restituito dal server ("/.netlify/functions/..."),
// che il browser risolve sempre rispetto all'origine della PAGINA corrente.
// Su Netlify la pagina e le function condividono la stessa origine, quindi
// "funzionava per caso". Aprendo i file in locale (file://, un altro server locale,
// o qualunque origine diversa da questa) quel path relativo puntava a una risorsa
// inesistente e il download della playlist falliva silenziosamente.
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
// FUNZIONE: OTTIENI CONFIGURAZIONE DAL SERVER
// ================================

// ================================
// COSTANTI: cache config in localStorage
// ================================
const CONFIG_CACHE_KEY = 'zappone_config_cache';
const CONFIG_CACHE_TTL = 6 * 24 * 60 * 60 * 1000; // 6 giorni (< 7 del JWT)

// Applica una config (dal server o dalla cache locale) allo stato globale.
// Unico punto in cui appConfig / isPremium / DEFAULT_PLAYLIST_URL / epgUrl /
// M3U_PROXIES / jwtToken vengono scritti. Evita duplicazioni.
function applyConfig(data) {
    if (data.jwt) {
        jwtToken = data.jwt;
        localStorage.setItem('zappone_jwt', data.jwt);
    } else {
        jwtToken = null;
        localStorage.removeItem('zappone_jwt');
    }

    appConfig.status       = data.status;
    appConfig.isPremium    = (data.status === 'premium');
    appConfig.playlistUrl  = data.playlistUrl;
    appConfig.epgUrl       = data.epgUrl;
    appConfig.proxies      = data.proxies || [];
    appConfig.devicesCount = data.devicesCount;
    appConfig.maxDevices   = data.maxDevices;

    isPremium            = appConfig.isPremium;
    DEFAULT_PLAYLIST_URL = appConfig.playlistUrl;
    epgUrl               = appConfig.epgUrl;
    M3U_PROXIES          = appConfig.proxies;
}

async function getConfigFromServer() {
    const deviceId = await getFingerprint();

    // ── Determina la licenza ──
    let license = localStorage.getItem("zappone_license");
    const demoMode = localStorage.getItem("zappone_demo_mode") === "true";

    if (!demoMode && (!license || license === "demo_user")) {
        const input = await promptLicenseElegant();
        if (input) {
            license = input;
            localStorage.setItem("zappone_license", input);
        } else {
            localStorage.setItem("zappone_demo_mode", "true");
            license = "demo_user";
        }
    }
    license = license || "demo_user";

    // ── FIX BUG GRAVE 2e: applica SUBITO la config in cache (se valida)
    //    prima ancora di tentare la rete. Così l'avvio non resta mai
    //    bloccato e l'utente premium vede la sua config anche con rete
    //    lenta o assente.
    try {
        const raw = localStorage.getItem(CONFIG_CACHE_KEY);
        if (raw) {
            const cached = JSON.parse(raw);
            if (cached.expiresAt > Date.now() && cached.data) {
                applyConfig(cached.data);
            }
        }
    } catch (e) { /* cache corrotta: ignora */ }


    try {
        // FIX: timeout SOLO sul fetch, non su tutto getConfigFromServer.
        // Così se la rete è lenta o assente, non restiamo appesi oltre
        // 8s; ma l'attesa dell'utente per inserire la licenza (gestita
        // da promptLicenseElegant) NON viene toccata da questo timer.
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 8000);

        let res;
        try {
            res = await fetch(
                `${API_ORIGIN}/api/get-config?license=${encodeURIComponent(license)}&deviceId=${deviceId}`,
                { signal: controller.signal }
            );
        } finally {
            clearTimeout(fetchTimeout);
        }


        // ── FIX BUG GRAVE 2d: 403 NON cancella più la licenza ──
        // Un 403 per limite dispositivi è transitorio: cancellare la
        // licenza distruggeva un dato valido e costringeva l'utente
        // a reinserirla. Ora mostriamo solo l'errore.
        if (res.status === 403) {
            let errMsg = "Accesso negato.";
            try {
                const errorData = await res.json();
                errMsg = errorData.error || errMsg;
            } catch (_) {}
            if (typeof showNotification === 'function') {
                showNotification(errMsg, true);
            } else {
                alert(errMsg);
            }
            return false;
        }

        const data = await res.json();

        // ── FIX BUG GRAVE 2c: server ha detto che la chiave è sbagliata ──
        // (vedi get-config.js). Cancelliamo la chiave errata dal localStorage
        // così al prossimo avvio lo splash la richiede di nuovo.
        if (data.invalidLicense) {
            localStorage.removeItem('zappone_license');
            localStorage.removeItem('zappone_demo_mode');
            localStorage.removeItem('zappone_jwt');
            localStorage.removeItem(CONFIG_CACHE_KEY);
            if (typeof showNotification === 'function') {
                showNotification(
                    'Licenza non valida. Reinserisci una chiave corretta o continua in Demo.',
                    true
                );
            }
            return false;
        }

        applyConfig(data);

        // Se ora è premium, cancelliamo il flag demo
        if (appConfig.isPremium) {
            localStorage.removeItem("zappone_demo_mode");
        }

        // ── Cache locale della config valida (solo premium) ──
        // Serve come fallback quando il SW non cacha più le API.
        if (appConfig.isPremium) {
            try {
                localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({
                    data: {
                        status:       data.status,
                        playlistUrl:  data.playlistUrl,
                        epgUrl:       data.epgUrl,
                        proxies:      data.proxies,
                        devicesCount: data.devicesCount,
                        maxDevices:   data.maxDevices,
                        jwt:          data.jwt
                    },
                    expiresAt: Date.now() + CONFIG_CACHE_TTL
                }));
            } catch (e) { /* quota piena: pazienza */ }
        }

        return true;

    } catch (e) {
        // Rete assente / timeout: la cache locale applicata sopra resta
        // in vigore, così il player funziona in modalità "ultima config nota".
        console.error("Errore handshake server:", e.message);
        return false;
    }
}



// Mostra il form licenza dentro lo splash (fase 2).
// Ritorna: stringa → licenza; null → l'utente ha scelto Demo.
function promptLicenseElegant() {
  return new Promise((resolve) => {

    let resolved = false;
    let timeoutId = null;

    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      // FIX BUG GRAVE 2a: annulla il timeout di sicurezza quando
      // l'utente risponde. Senza clearTimeout, l'app entrava in
      // Demo anche se l'utente aveva inserito la chiave al secondo 21.
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      resolve(value);
    };

    // Rete di sicurezza: se il form non compare affatto (HTML rotto),
    // dopo 20s entra in demo. Se l'utente risponde prima, viene
    // annullato da finish().
// timeoutId = setTimeout(() => {
//   if (!resolved) {
//     console.warn('[splash] promptLicenseElegant timeout → demo');
//     finish(null);
//   }
// }, 20000);




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