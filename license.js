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

async function getConfigFromServer() {
    const deviceId = await getFingerprint();

    // ── Determina la licenza ──
    let license = localStorage.getItem("zappone_license");
    const demoMode = localStorage.getItem("zappone_demo_mode") === "true";

    // Chiedi la licenza SOLO se non ce n'è una e l'utente non ha già scelto Demo
    if (!demoMode && (!license || license === "demo_user")) {
        const input = await promptLicenseElegant();
        if (input) {
            license = input;
            // Persisti SUBITO: se il server risponde demo (licenza scaduta),
            // non vogliamo ripresentare il form ad ogni avvio.
            localStorage.setItem("zappone_license", input);
        } else {
            // L'utente ha scelto "Continua in Demo":
            // ricordiamolo per non richiedere più il form.
            localStorage.setItem("zappone_demo_mode", "true");
            license = "demo_user";
        }
    }
    license = license || "demo_user";

    // ── Contatta il server (identico a prima) ──
    try {
        const res = await fetch(
            `${API_ORIGIN}/api/get-config?license=${encodeURIComponent(license)}&deviceId=${deviceId}`
        );

        if (res.status === 403) {
            const errorData = await res.json();
            if (typeof showNotification === 'function') {
                showNotification(errorData.error || "Accesso negato.", true);
            } else {
                alert(errorData.error || "Accesso negato.");
            }
            localStorage.removeItem("zappone_license");
            return false;
        }

        const data = await res.json();

        if (data.jwt) {
            jwtToken = data.jwt;
            localStorage.setItem('zappone_jwt', data.jwt);
        } else {
            jwtToken = null;
            localStorage.removeItem('zappone_jwt');
        }

        appConfig.status = data.status;
        appConfig.isPremium = (data.status === 'premium');
        appConfig.playlistUrl = data.playlistUrl;
        appConfig.epgUrl = data.epgUrl;
        appConfig.proxies = data.proxies;
        appConfig.devicesCount = data.devicesCount;
        appConfig.maxDevices = data.maxDevices;

        isPremium = appConfig.isPremium;
        DEFAULT_PLAYLIST_URL = appConfig.playlistUrl;
        epgUrl = appConfig.epgUrl;
        M3U_PROXIES = data.proxies;

        // Se ora è premium, cancelliamo il flag demo
        if (appConfig.isPremium) {
            localStorage.removeItem("zappone_demo_mode");
        }
        return true;

    } catch (e) {
        console.error("Errore handshake server:", e.message);
        return false;
    }
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
    setTimeout(() => {
      if (!resolved) {
        console.warn('[splash] promptLicenseElegant timeout → demo');
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