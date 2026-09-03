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
    proxies: []
};

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
    let license = localStorage.getItem("zappone_license") || "demo_user";
    const deviceId = await getFingerprint();

    if (license === "demo_user") {
        const input = prompt("Inserisci Licenza (Annulla per Demo):");
        if (input) license = input;
    }

    try {
        const res = await fetch(
            `https://primo-project.netlify.app/.netlify/functions/get-config?license=${encodeURIComponent(license)}&deviceId=${deviceId}`
        );
        
        if (res.status === 403) {
            const errorData = await res.json();
            // Usa showNotification se disponibile, altrimenti alert
            if (typeof showNotification === 'function') {
                showNotification(errorData.error || "Accesso negato.", true);
            } else {
                alert(errorData.error || "Accesso negato.");
            }
            localStorage.removeItem("zappone_license");
            return false;
        }

        const data = await res.json();
        appConfig.status = data.status;
        appConfig.isPremium = (data.status === 'premium');
        appConfig.playlistUrl = data.playlistUrl;
        appConfig.epgUrl = data.epgUrl;
        appConfig.proxies = data.proxies;

        isPremium = appConfig.isPremium;
        DEFAULT_PLAYLIST_URL = appConfig.playlistUrl;
        epgUrl = appConfig.epgUrl;
        M3U_PROXIES = data.proxies;

        if (appConfig.isPremium) {
            localStorage.setItem("zappone_license", license);
        }
        return true;
    } catch (e) {
        console.error("Errore handshake server");
        return false;
    }
}

// ================================
// FUNZIONE: DOWNLOAD TRAMITE PROXY (CON LICENZA)
// ================================

async function fetchM3UWithProxies(url, returnType = 'text') {
    if (!url) return null;
    const license = localStorage.getItem("zappone_license") || "demo";
    const deviceId = await getFingerprint();
    
    const proxy = appConfig.proxies[0];
    if (!proxy) return null;

    const finalUrl = `${proxy.base}${encodeURIComponent(url)}&license=${license}&deviceId=${deviceId}`;

    try {
        const response = await fetch(finalUrl);
        if (response.status === 403) {
            if (typeof showNotification === 'function') {
                showNotification("Licenza non valida o troppi dispositivi", true);
            } else {
                console.warn("Licenza non valida o troppi dispositivi");
            }
            return null;
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