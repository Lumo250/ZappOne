// ============================================================================
//  MODULO EPG - ZappOne
//
//  Contiene tutto ciò che riguarda la Guida Programmi (EPG):
//    - download e parsing di fonti XMLTV e JSON;
//    - indicizzazione per lookup veloce (per nome e per tvg-id);
//    - rendering delle varie viste EPG (manager, full, drawer canale);
//    - aggiornamento periodico automatico in background.
//
//  Dipendenze (devono essere caricate prima di questo file, vedi index.html):
//    license.js
//      -> appConfig, epgUrl
//      -> fetchM3UWithProxies (per il download via proxy firmato)
//    db.js
//      -> findEPGByUrl, saveAndActivateEPG, getAllEPGUrls,
//         getActiveEPG, getEPGById, updateEPGRecord, deleteEPGUrl,
//         setOnlyActiveEPG
//    zappone.js
//      -> channels, groupedChannels, favoriteChannels, showingFavorites,
//         getChannelKey, getFilteredGroupedChannels
//      -> showNotification, updateToggleState, saveViewModePreference
//      -> switchToView, renderSavedItemsList, sharedChannelObserver
//      -> parseM3U, loadFavorites, getActivePlaylist
//      -> playStream, closeFullEPG (via player.js)
//    epg-grid.js
//      -> applyFullEpgViewMode, fullEpgViewMode
//
//  Funzioni esposte a livello globale e usate da altri moduli:
//    player.js       -> showChannelEPG()
//    m3u-parser.js   -> handleEPGLoading()
//    zappone.js      -> tutte le altre (rendering, bottom sheet, drawer)
// ============================================================================

// ============================================================================
//  INDICE DELLE SEZIONI
// ============================================================================
//
//   1.  Stato globale EPG
//   2.  Fingerprint del rendering (EPG manager)
//   3.  Normalizzazione nomi canale
//   4.  Utility date e orari
//   5.  Costanti — placeholder e backend
//   6.  Sanitizzazione URL immagini
//   7.  Download EPG — fetch diretto e fallback proxy
//   8.  downloadEPG — funzione pubblica di caricamento
//   9.  parseXMLTV — parser XMLTV → JSON
//  10.  handleEPGLoading — caricamento automatico da header playlist
//  11.  autoLoadEPG — caricamento manuale da bottom sheet
//  12.  rebuildEpgMap — indicizzazione in memoria
//  13.  Lookup EPG di un canale — helper centrale
//  14.  hasEPG / getCurrentProgramInfo / getCurrentProgramFull
//  15.  findSoftMatchCandidates / findChannelFromEPG
//  16.  renderEPGManager — vista lista EPG salvati
//  17.  renderFullEPGList — vista guida completa (list mode)
//  18.  showChannelEPG — EPG inline sotto al player
//  19.  openChannelEpgDrawer — drawer dettaglio singolo canale
//  20.  toggleEPG — collasso/espansione sezione EPG del player
//  21.  closeFullEPG — chiusura viste EPG + drawer
//  22.  openEPGBottomSheet / closeEPGBottomSheet
// ============================================================================


// ============================================================================
// 1. STATO GLOBALE EPG
// ============================================================================
//
// Tre strutture che vivono per tutta la sessione:
//
//   epgData           array di canali EPG con programs[].
//                     Sorgente di verità. Viene riassegnato per intero
//                     quando si attiva un nuovo EPG.
//
//   epgByName         Map di lookup veloce. Chiavi:
//                       - 'id:<tvg-id>'  per lookup per id (esatto)
//                       - '<nomeNormalizzato>' per lookup per nome
//                     Ricostruita da rebuildEpgMap ad ogni cambio di epgData.
//
//   epgDisplayList    lista piatta pronta per il rendering del Full EPG.
//                     Contiene le voci del primario più le voci "distinte"
//                     quando due canali collidono per nome ma hanno
//                     palinsesti diversi (vengono rinominate con " (+N)").
//                     Vedi rebuildEpgMap per la logica di collisione.

let epgData = [];
let epgByName = new Map();
let epgDisplayList = [];

// Riferimento all'epgData dell'ultima volta che renderFullEPGList ha
// disegnato la lista. Serve a evitare re-render identici: se epgData non
// è cambiato (confronto per riferimento), la lista già nel DOM è valida.
let lastRenderedEpgData = null;

// Override di playback: quando l'utente preme ▶ dal drawer EPG, il canale
// M3U trovato può avere un nome diverso dalla voce EPG cliccata (via soft
// match). In quel caso il lookup per nome in showChannelEPG fallirebbe o
// troverebbe il canale sbagliato. Questo override associa esplicitamente
// la chiave del canale M3U alla voce EPG da usare, per la durata della
// sessione di riproduzione. Azzerato da closeFullEPG.
let _epgPlaybackOverride = null; // { channelKey, epgChannel }


// ============================================================================
// 2. FINGERPRINT DEL RENDERING (EPG MANAGER)
// ============================================================================
//
// L'EPG manager usa un fingerprint testuale (stringa) salvato come
// attributo data-* sul container per capire se la lista già disegnata è
// ancora valida. Il fingerprint è composto da:
//   - stato del toggle "Mostra URL";
//   - id + lastFetched di ciascun EPG salvato.
//
// Se il fingerprint non cambia, renderEPGManager evita di ridisegnare e
// si limita ad aggiornare l'evidenziazione della voce attiva.

/**
 * Legge il fingerprint corrente dal container.
 * @param {HTMLElement} container
 * @returns {string}
 */
function getRenderFingerprint(container) {
    return container ? container.dataset.renderFingerprint || '' : '';
}

/**
 * Salva il fingerprint corrente sul container.
 * @param {HTMLElement} container
 * @param {string} fingerprint
 */
function setRenderFingerprint(container, fingerprint) {
    if (container) container.dataset.renderFingerprint = fingerprint;
}


// ============================================================================
// 3. NORMALIZZAZIONE NOMI CANALE
// ============================================================================

/**
 * Normalizza il nome di un canale per il matching EPG.
 *
 * Trasformazioni applicate:
 *   - lowercase;
 *   - rimozione dei diacritici (à → a, ü → u, ...);
 *   - rimozione di tutto ciò che non è a-z, 0-9 o punto;
 *   - rimozione degli spazi;
 *   - rimozione del suffisso di qualità finale (hd, sd, fhd).
 *
 * Esempio: "Rai 1 HD" → "rai1", "Città 24" → "citta24".
 *
 * @param {string} name
 * @returns {string}  nome normalizzato, o stringa vuota se input invalido
 */
function normalizeChannelName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\s+/g, '')
    .replace(/(hd|sd|fhd)$/, '');
}


// ============================================================================
// 4. UTILITY DATE E ORARI
// ============================================================================

/**
 * Converte una data XMLTV (formato "YYYYMMDDHHMMSS ±ZZZZ") in Date.
 *
 * Il formato è standard XMLTV: 14 cifre per data+ora locale, un separatore
 * opzionale, e un offset di fuso orario. La funzione costruisce prima la
 * data come se fosse UTC, poi applica l'offset per ottenere il vero UTC.
 *
 * Ritorna null in modo controllato per qualsiasi input invalido:
 *   - null / non stringa / stringa più corta di 14 caratteri;
 *   - componenti non numeriche (es. "abcd...");
 *   - data risultante NaN.
 *
 * Il chiamante (parseXMLTV) scarta le voci con start/end null senza far
 * fallire l'intero parsing.
 *
 * @param {string} xmltvDate
 * @returns {Date|null}
 */
function parseXMLTVDate(xmltvDate) {
  if (!xmltvDate || typeof xmltvDate !== 'string' || xmltvDate.length < 14) {
    return null;
  }

  const year = parseInt(xmltvDate.substring(0, 4));
  const month = parseInt(xmltvDate.substring(4, 6)) - 1;
  const day = parseInt(xmltvDate.substring(6, 8));
  const hour = parseInt(xmltvDate.substring(8, 10));
  const minute = parseInt(xmltvDate.substring(10, 12));
  const second = parseInt(xmltvDate.substring(12, 14));
  const tzOffset = xmltvDate.substring(15).replace(':', '');

  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (isNaN(date.getTime())) return null;

  // Applica l'offset di fuso orario: +0200 significa "l'ora locale è UTC+2",
  // quindi per ottenere UTC bisogna SOTTRARRE 2 ore. Viceversa per -.
  if (tzOffset && tzOffset.length >= 5) {
    const sign = tzOffset[0];
    const offsetHours = parseInt(tzOffset.substring(1, 3));
    const offsetMinutes = parseInt(tzOffset.substring(3, 5));
    if (!isNaN(offsetHours) && !isNaN(offsetMinutes)) {
      const offsetMs = (offsetHours * 60 + offsetMinutes) * 60000;

      if (sign === '+') {
        date.setTime(date.getTime() - offsetMs);
      } else if (sign === '-') {
        date.setTime(date.getTime() + offsetMs);
      }
    }
  }

  return date;
}

/**
 * Verifica se un programma è attualmente in onda.
 *
 * Oltre al confronto temporale, scarta i programmi con dati anomali
 * (durata <= 0 o > 12 ore): le fonti EPG aggregate contengono a volte
 * voci corrotte che altrimenti farebbero apparire come "in onda"
 * programmi impossibili.
 *
 * @param {Object} program  con campi start e end (ISO string o Date)
 * @returns {boolean}
 */
function isProgramCurrentlyAiring(program) {
    if (!program || !program.start || !program.end) return false;

    const now = new Date();
    const start = new Date(program.start);
    const end = new Date(program.end);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

    const duration = end - start;
    if (duration <= 0 || duration > 43200000) return false; // 12 ore

    return start <= now && now < end;
}

/**
 * Calcola la percentuale di avanzamento di un programma rispetto a ora.
 * Ritorna 0 se non ancora iniziato, 100 se già finito, il valore
 * proporzionale se in corso. Usata per le barre di progresso.
 *
 * @param {string|Date} start
 * @param {string|Date} end
 * @returns {number}  valore tra 0 e 100
 */
function getProgramProgress(start, end) {
  const now = new Date();
  const startTime = new Date(start);
  const endTime = new Date(end);
  if (now <= startTime) return 0;
  if (now >= endTime) return 100;
  return ((now - startTime) / (endTime - startTime)) * 100;
}

/**
 * Formatta un timestamp ISO in orario locale "HH:MM".
 *
 * @param {string} iso
 * @returns {string}
 */
function formatTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}


// ============================================================================
// 5. COSTANTI — PLACEHOLDER E BACKEND
// ============================================================================

// Origine del backend Netlify. Deve coincidere con API_ORIGIN di license.js.
// Se cambi dominio Netlify, aggiorna entrambi.
const ZAPPONE_BACKEND_ORIGIN = 'https://zappone.netlify.app';

// Placeholder SVG inline per immagini EPG mancanti o rotte.
// Inline invece di file esterno: nessuna richiesta HTTP, nessun 404,
// funziona anche quando l'app è aperta da file://.
const EPG_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
  '<defs>' +
    '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2e3440"/>' +
      '<stop offset="1" stop-color="#161922"/>' +
    '</linearGradient>' +
    '<linearGradient id="scr" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#404a5c"/>' +
      '<stop offset="1" stop-color="#232834"/>' +
    '</linearGradient>' +
  '</defs>' +
  '<rect width="120" height="120" fill="url(#bg)"/>' +
  '<path d="M42 30 L60 42 L78 30" fill="none" stroke="#5c6678" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<rect x="20" y="42" width="80" height="56" rx="9" fill="url(#scr)" stroke="#4c5566" stroke-width="2"/>' +
  '<circle cx="60" cy="70" r="15" fill="none" stroke="#a8b0be" stroke-width="2" opacity="0.85"/>' +
  '<path d="M55 62 L70 70 L55 78 Z" fill="#a8b0be" opacity="0.95"/>' +
  '<rect x="54" y="102" width="12" height="3" rx="1.5" fill="#4c5566"/>' +
  '<rect x="44" y="105" width="32" height="3" rx="1.5" fill="#3a4150"/>' +
  '</svg>'
);


// ============================================================================
// 6. SANITIZZAZIONE URL IMMAGINI
// ============================================================================

/**
 * Sanifica un URL immagine per il rendering.
 *
 * Due problemi noti del mondo EPG italiano:
 *   1. Alcune fonti (Sky, principalmente) generano URL con un secondo "?"
 *      invece di "&" per i parametri successivi al primo. Safari iOS
 *      rifiuta di parsare questi URL a livello di rendering.
 *   2. Le immagini di guidatv.sky.it non si caricano direttamente su iOS
 *      perché il server non invia gli header CORS giusti per i domini
 *      dell'app. Vanno instradate via il proxy Netlify logo-proxy.
 *
 * @param {string} url
 * @returns {string}  URL sanificato, o l'input invariato se non è una stringa
 */
function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return url;

  // Fix del doppio '?': mantiene il primo, sostituisce i successivi con '&'
  let fixed = url;
  const firstQ = fixed.indexOf('?');
  if (firstQ !== -1) {
    fixed = fixed.slice(0, firstQ + 1)
          + fixed.slice(firstQ + 1).replace(/\?/g, '&');
  }

  // Rewrite guidatv.sky.it verso il proxy Netlify
  try {
    const u = new URL(fixed);
    if (u.hostname === 'guidatv.sky.it') {
      return `${ZAPPONE_BACKEND_ORIGIN}/logo-proxy/guidatv.sky.it${u.pathname}${u.search}`;
    }
  } catch (e) { /* URL relativo o malformato: lascia stare */ }

  return fixed;
}


// ============================================================================
// 7. DOWNLOAD EPG — FETCH DIRETTO E FALLBACK PROXY
// ============================================================================
//
// Il download prova prima il percorso diretto e ricade sul proxy Netlify
// solo se necessario.
//
// Motivo del doppio tentativo: il proxy è una Netlify Function che
// restituisce il contenuto in base64 (per trasportare anche binari GZip).
// Netlify limita le risposte "bufferizzate" a 6 MB totali: con la
// codifica base64 (~+33%), la soglia utile scende a ~4.5 MB di contenuto
// reale. Molti EPG italiani in .gz superano quella soglia. Un fetch
// diretto, quando il server sorgente invia gli header CORS, è più veloce,
// illimitato in dimensione e non consuma invocazioni della function.
// Fallisce in caso di CORS bloccato, rete assente o timeout: in quei casi
// si ricade sul proxy.

/**
 * Tenta un fetch diretto con timeout. Ritorna l'ArrayBuffer se la risposta
 * è ok, altrimenti null. Non solleva eccezioni.
 *
 * @param {string} url
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<ArrayBuffer|null>}
 */
async function tryDirectFetch(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch (e) {
    // Fallimento CORS, di rete o timeout: si prosegue col proxy.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Scarica il binario di un EPG: prima fetch diretto, poi proxy come
 * fallback. Ritorna un ArrayBuffer (o null se anche il proxy fallisce).
 *
 * @param {string} targetUrl
 * @returns {Promise<ArrayBuffer|null>}
 */
async function fetchEPGBinary(targetUrl) {
  const direct = await tryDirectFetch(targetUrl);
  if (direct) {
    console.log('EPG scaricato direttamente (CORS ok): nessun proxy necessario.');
    return direct;
  }
  console.log('Fetch diretto EPG non disponibile (CORS/rete): uso il proxy.');
  return await fetchM3UWithProxies(targetUrl, 'arrayBuffer');
}


// ============================================================================
// 8. DOWNLOAD EPG — FUNZIONE PUBBLICA
// ============================================================================

/**
 * Scarica un EPG da URL, lo parsa, lo salva in IndexedDB e (opzionalmente)
 * lo attiva come EPG corrente.
 *
 * Flusso:
 *   1. valida l'URL (usa appConfig.epgUrl se il parametro è nullo);
 *   2. scarica i byte grezzi (fetch diretto o proxy);
 *   3. decomprime se GZip (magic number 0x1f 0x8b);
 *   4. limita la dimensione del testo a 100 MB (guardia contro freeze);
 *   5. riconosce XML/XMLTV vs JSON e parsa di conseguenza;
 *   6. valida che il risultato sia un array non vuoto;
 *   7. salva con saveAndActivateEPG (che gestisce setActive);
 *   8. se setActive, aggiorna epgData in memoria e ri-renderizza la lista
 *      canali (per mostrare la riga "programma in corso").
 *
 * @param {string} [url]                URL dell'EPG. Default: appConfig.epgUrl
 * @param {Object} [options]
 * @param {boolean} [options.setActive=true]   attiva l'EPG appena scaricato
 * @param {boolean} [options.updateUI=true]    aggiorna la UI dopo l'attivazione
 * @param {boolean} [options.silent=false]     sopprime notifiche e spinner
 * @param {string|null} [options.name=null]    nome da assegnare (null = preserva il nome esistente)
 * @returns {Promise<Array|null>}  l'array dei canali EPG, o null in caso di errore
 */
async function downloadEPG(url = appConfig.epgUrl, options = {}) {
  const { setActive = true, updateUI = true, silent = false, name = null } = options;

  const targetUrl = url || appConfig.epgUrl;
  if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
    if (!silent) showNotification('URL EPG non valido o non configurato', true);
    return null;
  }

  const btn = document.getElementById('downloadEpgBtn');
  if (btn) btn.classList.add('loading');

  try {
    console.log(`Iniziando download EPG sicuro da: ${targetUrl}`);

    const buffer = await fetchEPGBinary(targetUrl);
    if (!buffer) throw new Error("Impossibile recuperare i dati (Licenza non valida o errore server)");

    let responseText;

    // GZip: il magic number 0x1f 0x8b identifica lo stream compresso.
    // Viene decompresso prima della decodifica UTF-8.
    const view = new Uint8Array(buffer);
    if (view.length > 1 && view[0] === 0x1f && view[1] === 0x8b) {
        const blob = new Blob([buffer]);
        const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        responseText = await new Response(decompressedStream).text();
    } else {
        const decoder = new TextDecoder('utf-8');
        responseText = decoder.decode(buffer);
    }

    // Limite di dimensione: un EPG di 200+ MB bloccherebbe il thread
    // principale per decine di secondi durante il parsing.
    const MAX_EPG_TEXT_LENGTH = 100 * 1024 * 1024;
    if (responseText.length > MAX_EPG_TEXT_LENGTH) {
      throw new Error(
        `EPG troppo grande (${(responseText.length / 1024 / 1024).toFixed(1)} MB): ` +
        `limite ${MAX_EPG_TEXT_LENGTH / 1024 / 1024} MB.`
      );
    }

    // Riconoscimento formato: XMLTV inizia con '<' o contiene '<tv>',
    // altrimenti si assume JSON.
    const isXML = responseText.trim().startsWith('<') || responseText.includes('<tv>');
    let data;

    try {
      if (isXML) {
        const xmlDoc = new DOMParser().parseFromString(responseText, "text/xml");
        if (xmlDoc.getElementsByTagName("parsererror").length) {
          throw new Error('XML malformato');
        }
        data = parseXMLTV(xmlDoc);
      } else {
        data = JSON.parse(responseText);
      }
    } catch (parseError) {
      throw new Error(`Errore parsing EPG: ${parseError.message}`);
    }

    if (!Array.isArray(data)) throw new Error('Struttura EPG non valida');
    const validChannels = data.filter(ch => ch && ch.name);
    if (validChannels.length === 0) throw new Error('EPG vuoto');

    // Il nome viene passato esplicitamente solo dal form di salvataggio
    // manuale. Sul reload dalla freccia ↻ name resta null e
    // saveAndActivateEPG preserva il nome esistente.
    await saveAndActivateEPG({
      url: targetUrl,
      name: name || undefined,
      content: JSON.stringify(data)
    }, { setActive: setActive });

    if (setActive) {
      epgData = data;
      rebuildEpgMap();

      if (updateUI && !silent) {
        showNotification(`EPG caricato: ${data.length} canali`);

        // Aggiorna l'EPG inline sotto il player se c'è un canale attivo
        if (window.currentChannelUrl) {
          const current = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
          if (current) setTimeout(() => showChannelEPG(current), 100);
        }

        // Ri-renderizza la lista canali: le righe "programma in corso"
        // sono disegnate durante il render, quindi serve un refresh.
        requestAnimationFrame(() => renderGroupedChannelList(getFilteredGroupedChannels(), { context: 'channels' }));
      }
    }

    return data;

  } catch (error) {
    console.error("Errore caricamento EPG:", error);
    if (!silent) showNotification(error.message, true);
    return null;
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}


// ============================================================================
// 9. PARSER XMLTV → JSON
// ============================================================================

/**
 * Converte un documento XMLTV (già parsato in DOM) nel formato JSON
 * interno dell'app.
 *
 * Struttura di output: array di canali
 *   { id, name, logo, programs: [ { title, subtitle, description, start, end, category, poster } ] }
 *
 * Il parsing avviene in due fasi:
 *   1. Estrae tutti i <channel> e tutti i <programme> in array piatti;
 *   2. Costruisce un indice Map<channelId, programmi[]> in una sola passata
 *      sui programmi, poi assegna ciascun gruppo al canale corrispondente.
 *      Costo totale O(P) + O(C) invece del precedente O(C×P) (filtrava
 *      tutti i programmi per ogni canale).
 *
 * I <programme> con start/stop mancanti, non parsabili, o con durata
 * anomala (<= 0 o > 12 ore) vengono scartati in fase di mappatura: una
 * voce corrotta non deve far fallire l'intero parsing.
 *
 * @param {Document} xmlDoc  documento XMLTV parsato da DOMParser
 * @returns {Array}          array di canali con programs[]
 */
function parseXMLTV(xmlDoc) {
  const channels = Array.from(xmlDoc.getElementsByTagName('channel')).map(channel => ({
    id:   channel.getAttribute('id'),
    name: channel.getElementsByTagName('display-name')[0]?.textContent || '',
    logo: channel.getElementsByTagName('icon')[0]?.getAttribute('src') || ''
  }));

  const programmes = Array.from(xmlDoc.getElementsByTagName('programme')).map(p => ({
    channel:     p.getAttribute('channel'),
    title:       p.getElementsByTagName('title')[0]?.textContent || '',
    subtitle:    p.getElementsByTagName('sub-title')[0]?.textContent || '',
    description: p.getElementsByTagName('desc')[0]?.textContent || '',
    start:       parseXMLTVDate(p.getAttribute('start')),
    end:         parseXMLTVDate(p.getAttribute('stop')),
    category:    p.getElementsByTagName('category')[0]?.textContent || '',
    poster:      p.getElementsByTagName('icon')[0]?.getAttribute('src') || ''
  })).filter(p =>
    p.start instanceof Date && !isNaN(p.start.getTime()) &&
    p.end   instanceof Date && !isNaN(p.end.getTime())   &&
    (p.end - p.start) > 0 && (p.end - p.start) < 43200000
  );

  // Indice Map<channelId, programmi[]>: una passata invece di C filtri.
  const byChannel = new Map();
  for (const p of programmes) {
    let arr = byChannel.get(p.channel);
    if (!arr) { arr = []; byChannel.set(p.channel, arr); }
    arr.push(p);
  }

  return channels.map(channel => ({
    ...channel,
    programs: (byChannel.get(channel.id) || []).map(p => ({
      title:       p.title,
      subtitle:    p.subtitle,
      description: p.description,
      start:       p.start.toISOString(),
      end:         p.end.toISOString(),
      category:    p.category,
      poster:      p.poster
    }))
  }));
}


// ============================================================================
// 10. CARICAMENTO AUTOMATICO EPG DA HEADER PLAYLIST
// ============================================================================

/**
 * Legge l'header di una playlist M3U per trovare URL di EPG associati
 * (attributo x-tvg-url o url-tvg) e li scarica automaticamente.
 *
 * Regole:
 *   - un EPG è "fresco" se ha meno di 24 ore: in quel caso non viene
 *     riscaricato. Oltre le 24 ore viene ri-scaricato per mantenere la
 *     guida aggiornata (senza questo controllo l'EPG restava per sempre
 *     quello del primo download).
 *   - massimo 2 download in parallelo: con 3+ EPG il caricamento
 *     sequenziale bloccava il boot per decine di secondi.
 *   - se nessun EPG è attivo e almeno uno è stato scaricato, il primo
 *     scaricato con successo diventa attivo.
 *
 * Non solleva eccezioni: errori sui singoli EPG vengono raccolti e
 * mostrati come messaggio riassuntivo.
 *
 * @param {string} headerLine  prima riga della playlist (contiene #EXTM3U e attributi)
 */
async function handleEPGLoading(headerLine) {
    const REGEX = { EPG: /(?:x-tvg-url|url-tvg)="(.*?)"/i };
    const epgMatch = headerLine.match(REGEX.EPG);

    if (!epgMatch) return;

    const epgUrls = epgMatch[1].split(',').map(u => u.trim()).filter(u => u);
    if (epgUrls.length === 0) return;

    console.log(`Trovati ${epgUrls.length} URL EPG nella playlist:`, epgUrls);

    const EPG_STALE_MS = 24 * 60 * 60 * 1000; // 24 ore

    /**
     * Esegue fn su items con al massimo `limit` in parallelo.
     * @template T, R
     * @param {T[]} items
     * @param {number} limit
     * @param {(item: T, index: number) => Promise<R>} fn
     * @returns {Promise<R[]>}
     */
    async function parallelLimit(items, limit, fn) {
        const results = new Array(items.length);
        let idx = 0;
        async function worker() {
            while (idx < items.length) {
                const i = idx++;
                results[i] = await fn(items[i], i);
            }
        }
        await Promise.all(
            Array.from({ length: Math.min(limit, items.length) }, worker)
        );
        return results;
    }

    const downloadResults = await parallelLimit(epgUrls, 2, async (epgUrl) => {
        try {
            const existingEPG = await findEPGByUrl(epgUrl);

            // EPG fresco: skip download
            if (existingEPG?.lastFetched
                && (Date.now() - existingEPG.lastFetched) < EPG_STALE_MS
                && existingEPG.content) {
                console.log(`EPG fresco in IDB: ${epgUrl}`);
                return { url: epgUrl, success: true, fromCache: true, name: existingEPG.name };
            }

            // EPG mancante o stantio: riscarica
            const data = await downloadEPG(epgUrl, {
                setActive: false,
                updateUI: false,
                silent: true
            });

            if (data) {
                console.log(`EPG scaricato: ${epgUrl}`);
                return {
                    url: epgUrl, success: true, fromCache: false,
                    name: epgUrl.split('/').pop() || 'EPG',
                    channelCount: data.length
                };
            }
            return { url: epgUrl, success: false, fromCache: false, error: 'Download fallito o dati vuoti' };
        } catch (error) {
            return { url: epgUrl, success: false, fromCache: false, error: error.message };
        }
    });

    const successfulDownloads = downloadResults.filter(r => r.success && !r.fromCache);
    const fromCache           = downloadResults.filter(r => r.success && r.fromCache);
    const failedDownloads     = downloadResults.filter(r => !r.success);

    console.log(`Risultati EPG: ${successfulDownloads.length} nuovi, ${fromCache.length} cache, ${failedDownloads.length} falliti`);

    // Se non c'è un EPG attivo e almeno uno è stato scaricato, attiva il primo
    const activeEPG = await getActiveEPG();
    if (!activeEPG && successfulDownloads.length > 0) {
        const firstSuccess = successfulDownloads[0];
        const epgRec = await findEPGByUrl(firstSuccess.url);
        if (epgRec) {
            await setOnlyActiveEPG(epgRec.id);
            if (epgRec.content) {
                try {
                    epgData = JSON.parse(epgRec.content);
                    rebuildEpgMap();
                    console.log(`EPG attivo: ${firstSuccess.url}`);
                } catch (err) {
                    console.warn('Errore caricamento EPG attivo:', err);
                }
            }
        }
    }

    if (window.isEPGView && typeof renderEPGManager === 'function') {
        renderEPGManager();
    }

    // Notifica riassuntiva (nessun override di showNotification: le
    // notifiche per i singoli download sono già soppresse da silent:true)
    let notificationMessage = '';
    if (successfulDownloads.length > 0) notificationMessage += `${successfulDownloads.length} EPG scaricati`;
    if (fromCache.length > 0) {
        if (notificationMessage) notificationMessage += ', ';
        notificationMessage += `${fromCache.length} dalla cache`;
    }
    if (failedDownloads.length > 0) {
        if (notificationMessage) notificationMessage += ', ';
        notificationMessage += `${failedDownloads.length} falliti`;
    }
    if (notificationMessage && typeof showNotification === 'function') {
        showNotification(notificationMessage);
    }
}


// ============================================================================
// 11. CARICAMENTO MANUALE EPG DA BOTTOM SHEET
// ============================================================================

/**
 * Carica un EPG da URL mostrando lo spinner nel bottom sheet, lo salva,
 * lo attiva e apre direttamente la vista Full EPG.
 *
 * Usato dal pulsante "Carica EPG" del bottom sheet e dal pulsante
 * "Predefinita" che propone l'URL di default.
 *
 * @param {string} url
 * @param {string} [name='']
 * @param {boolean} [closeAfter=true]
 */
async function autoLoadEPG(url, name = '', closeAfter = true) {
  if (!url || modalEPGLoadingLock) return;

  if (!url.startsWith('http')) {
    showNotification('URL EPG non valido', true);
    if (closeAfter && typeof closeEPGBottomSheet === 'function') {
      closeEPGBottomSheet();
    }
    return;
  }

  modalEPGLoadingLock = true;
  const loadingEl = document.getElementById('modalEPGLoading');
  const urlInput = document.getElementById('modalEPGUrl');
  const nameInput = document.getElementById('modalEPGName');

  loadingEl.classList.remove('hidden');
  urlInput.disabled = true;
  nameInput.disabled = true;

  try {
    const data = await downloadEPG(url, { setActive: true, updateUI: true });
    if (data === null) {
      if (closeAfter && typeof closeEPGBottomSheet === 'function') {
        closeEPGBottomSheet();
      }
      return;
    }

    showNotification('EPG salvato e caricato');

    // Apre direttamente il Full EPG: l'utente che ha appena caricato un
    // EPG vuole vederlo, non tornare alla lista canali.
    try {
      document.getElementById('channelListContainer')?.classList.add('hidden');
      document.getElementById('playerContainer')?.classList.add('hidden');

      const fullEpgContainer = document.getElementById('fullEpgContainer');
      if (fullEpgContainer) fullEpgContainer.classList.remove('hidden');

      if (typeof renderFullEPGList === 'function') {
        renderFullEPGList();
      }
    } catch (uiErr) {
      console.error('Errore aprendo Full EPG dopo salvataggio:', uiErr);
      // Fallback: se l'apertura del Full EPG fallisce, almeno la lista
      // del manager EPG deve essere aggiornata.
      window.forceEPGReload = true;
      if (typeof renderEPGManager === 'function') renderEPGManager();
    }

    if (closeAfter && typeof closeEPGBottomSheet === 'function') {
      closeEPGBottomSheet();
    }

  } catch (err) {
    console.error('autoLoadEPG error', err);
    if (!err.message?.includes('proxy') && !err.message?.includes('Timeout')) {
      showNotification('Errore imprevisto nel caricamento EPG', true);
    }
  } finally {
    loadingEl.classList.add('hidden');
    urlInput.disabled = false;
    nameInput.disabled = false;
    modalEPGLoadingLock = false;
  }
}


// ============================================================================
// 12. INDICIZZAZIONE IN MEMORIA — rebuildEpgMap
// ============================================================================

/**
 * Confronta due voci EPG e determina se hanno lo stesso palinsesto.
 * Confronto per (start, end, title) nell'ordine in cui appaiono.
 *
 * Usato da rebuildEpgMap per distinguere:
 *   - canali "duplicati" (stesso palinsesto): una voce viene scartata;
 *   - canali realmente distinti (palinsesto diverso): la voce in eccesso
 *     viene tenuta con un suffisso " (+N)" in epgDisplayList.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
function programsAreIdentical(a, b) {
    const pa = (a && a.programs) || [];
    const pb = (b && b.programs) || [];
    if (pa.length !== pb.length) return false;
    for (let i = 0; i < pa.length; i++) {
        if (pa[i].start !== pb[i].start) return false;
        if (pa[i].end   !== pb[i].end)   return false;
        if (pa[i].title !== pb[i].title) return false;
    }
    return true;
}

/**
 * Ricostruisce epgByName e epgDisplayList a partire da epgData.
 *
 * Per ogni voce di epgData:
 *   1. Se ha un id, viene indicizzata come "id:<id>" in epgByName. Il
 *      lookup per id è esatto e funziona anche per nomi non latini (per
 *      cui la normalizzazione per nome produrrebbe stringa vuota).
 *   2. Se ha un nome normalizzabile, viene indicizzata per nome:
 *      - se la chiave non esiste ancora, è il "primario" per quel nome;
 *      - se la chiave esiste già ed i programmi sono identici, si tiene
 *        la voce con più programmi (scarto silenzioso dell'altra);
 *      - se la chiave esiste già ed i programmi sono diversi, la voce
 *        viene aggiunta a epgDisplayList con nome suffissato " (+N)".
 *        Sono canali realmente distinti che l'utente vuole vedere.
 *
 * epgDisplayList è la lista che il Full EPG disegna direttamente; può
 * contenere sia voci "primarie" che voci rinominate per suffisso.
 *
 * Non ritorna nulla. Va chiamata ogni volta che epgData cambia.
 */
function rebuildEpgMap() {
    epgByName.clear();
    epgDisplayList = [];
    if (!epgData || !epgData.length) return;

    const distinctCounters = new Map();

    epgData.forEach(ch => {
        // Indice per id (esatto): sempre indicizzato se presente
        if (ch.id) {
            const idKey = 'id:' + ch.id;
            if (!epgByName.has(idKey)) epgByName.set(idKey, ch);
        }

        if (!ch.name) return;
        const key = normalizeChannelName(ch.name);
        if (!key) return;

        const existing = epgByName.get(key);

        if (!existing) {
            // Prima voce per questa chiave: è il primario
            epgByName.set(key, ch);
            epgDisplayList.push(ch);
            distinctCounters.set(key, 1);
            return;
        }

        if (programsAreIdentical(existing, ch)) {
            // Stesso palinsesto: si tiene quella con più programmi
            const existingCount = (existing.programs || []).length;
            const newCount = (ch.programs || []).length;
            console.warn(
                `EPG: collisione identica su "${key}" tra "${existing.name}" (${existingCount} programmi) e "${ch.name}" (${newCount} programmi). Tengo quella con più dati.`
            );
            if (newCount > existingCount) {
                epgByName.set(key, ch);
                const idx = epgDisplayList.indexOf(existing);
                if (idx !== -1) epgDisplayList[idx] = ch;
            }
            return;
        }

        // Palinsesto diverso: canale distinto, aggiunto con suffisso
        const n = distinctCounters.get(key) || 1;
        distinctCounters.set(key, n + 1);
        console.warn(
            `EPG: collisione con programmi diversi su "${key}" tra "${existing.name}" e "${ch.name}". Aggiungo "${ch.name} (+${n})" come canale separato.`
        );
        const renamed = Object.assign({}, ch, { name: `${ch.name} (+${n})` });
        epgDisplayList.push(renamed);
    });
}


// ============================================================================
// 13. LOOKUP EPG DI UN CANALE — HELPER CENTRALE
// ============================================================================

/**
 * Risolve la voce EPG associata a un canale della playlist.
 *
 * Ordine di lookup:
 *   1. per tvg-id (esatto, se presente);
 *   2. per nome normalizzato (fallback).
 *
 * Questo helper è usato da hasEPG, getCurrentProgramInfo,
 * getCurrentProgramFull e showChannelEPG. Centralizzare la logica evita
 * che le varie funzioni divergano: se una cerca con criteri diversi dalle
 * altre, la lista e la griglia mostrano informazioni incoerenti per lo
 * stesso canale.
 *
 * @param {Object} channel  canale della playlist (con name, tvgId opzionale)
 * @returns {Object|null}   voce EPG corrispondente, o null
 */
function _resolveEpgChannel(channel) {
    if (!channel || !epgData || !epgData.length) return null;
    if (channel.tvgId) {
        const byId = epgByName.get('id:' + channel.tvgId);
        if (byId) return byId;
    }
    return epgByName.get(normalizeChannelName(channel.name)) || null;
}


// ============================================================================
// 14. CONSULTAZIONE EPG PER UN CANALE
// ============================================================================

/**
 * Verifica se un canale della playlist ha una voce EPG associata.
 * Usata in fase di rendering per decidere se mostrare la riga
 * "programma in corso" sotto al nome del canale.
 *
 * @param {Object} channel
 * @returns {boolean}
 */
function hasEPG(channel) {
    return !!_resolveEpgChannel(channel);
}

/**
 * Ritorna il programma attualmente in onda per un canale (versione
 * compatta, senza poster). Usata in rendering lista per la riga
 * secondaria sotto al nome del canale.
 *
 * @param {Object} channel
 * @returns {{title: string, start: Date, end: Date}|null}
 */
function getCurrentProgramInfo(channel) {
    const channelEPG = _resolveEpgChannel(channel);
    if (!channelEPG || !channelEPG.programs) return null;

    for (const program of channelEPG.programs) {
        if (isProgramCurrentlyAiring(program)) {
            return {
                title: program.title,
                start: new Date(program.start),
                end:   new Date(program.end)
            };
        }
    }
    return null;
}

/**
 * Ritorna il programma attualmente in onda per un canale (versione
 * completa, con poster e tutti i campi). Usata in rendering griglia per
 * lo sfondo della tile e la barra di avanzamento.
 *
 * @param {Object} channel
 * @returns {Object|null}  il programma intero, o null
 */
function getCurrentProgramFull(channel) {
    const channelEPG = _resolveEpgChannel(channel);
    if (!channelEPG || !channelEPG.programs) return null;
    return channelEPG.programs.find(p => isProgramCurrentlyAiring(p)) || null;
}


// ============================================================================
// 15. RICERCA CANALE NELLA PLAYLIST A PARTIRE DALL'EPG
// ============================================================================

/**
 * Trova tutti i canali della lista il cui nome normalizzato contiene (o
 * è contenuto in) il nome EPG normalizzato.
 *
 * Ritorna TUTTI i candidati, non solo il primo: un match per sottostringa
 * senza questo controllo produce falsi positivi (un EPG "Sport" combacia
 * con "Sky Sport 1", "Eurosport", "DAZN Sport HD"...). Il chiamante
 * accetta il match solo se è univoco.
 *
 * @param {Object[]} list     lista di canali (channels o favoriteChannels)
 * @param {string} normEpg    nome EPG normalizzato
 * @returns {Object[]}        array di candidati
 */
function findSoftMatchCandidates(list, normEpg) {
  return list.filter(item => {
    const normItem = normalizeChannelName(item.name);
    return normItem && (normItem.includes(normEpg) || normEpg.includes(normItem));
  });
}

/**
 * Trova il canale della playlist corrispondente a una voce EPG.
 *
 * Ordine di ricerca:
 *   1. match esatto per nome normalizzato nei preferiti (priorità utente);
 *   2. match esatto per nome normalizzato nella lista principale;
 *   3. soft match (sottostringa) nei preferiti, accettato SOLO se univoco;
 *   4. soft match (sottostringa) nella lista principale, idem.
 *
 * I passi 3 e 4 scartano il risultato in caso di più candidati: meglio
 * un "canale non trovato" esplicito che aprire il canale sbagliato.
 *
 * @param {Object} epgChannel  voce EPG (con name)
 * @returns {Promise<{channel: Object, fromFavorites: boolean}|null>}
 */
async function findChannelFromEPG(epgChannel) {
  if (!epgChannel) return null;
  const epgName = (epgChannel.name || '').trim();
  const normEpg = normalizeChannelName(epgName);

  console.log(' Cercando canale EPG:', epgName, 'Normalizzato:', normEpg);

  let foundChannel = null;
  let fromFavorites = false;

  // 1. Match esatto nei preferiti
  for (let fav of favoriteChannels) {
    const normFav = normalizeChannelName(fav.name);
    if (normFav === normEpg) {
      foundChannel = fav;
      fromFavorites = true;
      console.log(' Trovato NEI PREFERITI (Priorità):', fav.name);
      break;
    }
  }

  // 2. Match esatto nella lista principale
  if (!foundChannel) {
    for (let ch of channels) {
      const normCh = normalizeChannelName(ch.name);
      if (normCh === normEpg) {
        foundChannel = ch;
        fromFavorites = false;
        console.log(' Trovato in lista principale:', ch.name);
        break;
      }
    }
  }

  // 3. Soft match (solo se univoco)
  if (!foundChannel) {
    console.log(' Tentativo matching soft...');

    const favMatches = findSoftMatchCandidates(favoriteChannels, normEpg);
    if (favMatches.length === 1) {
      foundChannel = favMatches[0];
      fromFavorites = true;
      console.log(' Trovato con matching soft NEI PREFERITI:', foundChannel.name);
    } else if (favMatches.length > 1) {
      console.log(` Matching soft ambiguo nei preferiti (${favMatches.length} candidati, scartato):`, favMatches.map(f => f.name));
    }

    if (!foundChannel) {
      const chMatches = findSoftMatchCandidates(channels, normEpg);
      if (chMatches.length === 1) {
        foundChannel = chMatches[0];
        fromFavorites = false;
        console.log(' Trovato con matching soft in lista principale:', foundChannel.name);
      } else if (chMatches.length > 1) {
        console.log(` Matching soft ambiguo in lista principale (${chMatches.length} candidati, scartato):`, chMatches.map(c => c.name));
      }
    }
  }

  if (foundChannel) {
    return { channel: foundChannel, fromFavorites: fromFavorites };
  }

  console.log(' Nessun match trovato per:', epgName);
  return null;
}


// ============================================================================
// 16. VISTA EPG MANAGER — LISTA EPG SALVATI
// ============================================================================

/**
 * Disegna la vista "EPG salvati" (manager).
 *
 * Cosa fa:
 *   1. imposta i flag di vista (isEPGView true, isPlaylistView false);
 *   2. passa a switchToView('epgManager') che gestisce la visibilità dei
 *      container;
 *   3. legge da DB la lista degli EPG e quello attivo;
 *   4. calcola un fingerprint (stato toggle URL + id:lastFetched per EPG)
 *      e, se coincide con quello dell'ultimo render, aggiorna solo
 *      l'evidenziazione della voce attiva senza ridisegnare;
 *   5. altrimenti disegna due gruppi (riga "Aggiungi EPG" + lista salvati)
 *      con renderSavedItemsList, configurando azioni di riga (ricarica,
 *      elimina) e handler di click.
 */
async function renderEPGManager() {
    showingFavorites = false;
    if (typeof updateToggleState === 'function') updateToggleState();
    if (typeof saveViewModePreference === 'function') saveViewModePreference(currentViewMode);

    window.isPlaylistView = false;
    window.isEPGView = true;
    localStorage.setItem('currentView', 'epgManager');

    switchToView('epgManager');

    const epgList = document.getElementById('epgList');
    if (epgList) epgList.style.transition = 'opacity 0.2s ease-in-out';

    // --- Fingerprint ---
    // Include lo stato del toggle URL: senza, cambiare il toggle non
    // modifica il fingerprint (basato su id/lastFetched) e la lista
    // resterebbe con gli URL visibili dopo la disattivazione.
    const epgs = await getAllEPGUrls();
    const activeEPG = await getActiveEPG();
    const showUrlMode = localStorage.getItem("zappone_show_playlist_url") === "true";

    const fingerprint = `url:${showUrlMode ? 1 : 0}|${(epgs || []).map(e => `${e.id}:${e.lastFetched || 0}`).join('|')}`;

    // Lista già disegnata e dati invariati: aggiorna solo l'evidenziazione
    if (epgList && epgList.children.length > 0 && getRenderFingerprint(epgList) === fingerprint) {
        console.log("EPG Manager: nessuna modifica ai dati, aggiorno solo l'evidenziazione.");
        epgList.style.opacity = '1';
        epgList.style.pointerEvents = 'auto';
        epgList.querySelectorAll('.channel-item').forEach(item => {
            const url = item.dataset.url;
            const matched = (epgs || []).find(e => e.url === url);
            item.classList.toggle('active-channel', !!(matched && activeEPG && matched.id === activeEPG.id));
        });
        return;
    }

    // --- Preparazione gruppi ---
    const groups = [
        { name: "Aggiungi", channels: [
            { name: "Aggiungi EPG", logo: "", url: "#url", __special: true }
        ]},
        { name: "EPG Salvati", channels: (epgs || []).map(e => ({
            name: e.name || 'EPG senza nome',
            logo: "tasto3-1.svg",
            url: e.url,
            __epgId: e.id,
            __raw: e,
            __isActive: !!(activeEPG && e.id === activeEPG.id)
        }))}
    ];

    // --- Rendering ---
    renderSavedItemsList(epgList, groups, {
        emptyCheck: (g) => g.length >= 2 && g[1].channels.length === 0,
        emptyState: {
            image: 'noepg.svg',
            alt: 'Carica EPG',
            onClick: () => { if (typeof openEPGBottomSheet === 'function') openEPGBottomSheet(); }
        },

        // Riga info sotto al nome: URL o conteggio canali + data aggiornamento
        buildInfoLine: (def) => {
            if (def.__special) return null;
            if (localStorage.getItem("zappone_show_playlist_url") === "true") return def.url;
            try {
                let channelCount = 0;
                if (def.__raw?.content) {
                    const parsed = JSON.parse(def.__raw.content);
                    channelCount = Array.isArray(parsed) ? parsed.length : 0;
                }
                const epgDate = def.__raw?.lastFetched;
                let dateInfo = "Mai aggiornato";
                if (epgDate) {
                    const d = new Date(epgDate);
                    dateInfo = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }
                return `${channelCount} canali, Aggiornato il: ${dateInfo}`;
            } catch (e) { return "Dati EPG non disponibili"; }
        },

        // Azioni di riga: ricarica da remoto + elimina
        itemActions: (def) => {
            if (def.__special || !def.__epgId) return [];
            return [
                {
                    icon: '↻',
                    title: 'Ricarica questo EPG da remoto',
                    className: 'reload-epg',
                    onClick: async (itemData, itemEl, iconEl) => {
                        try {
                            iconEl.classList.add('loading');
                            await downloadEPG(itemData.url, { setActive: itemData.__isActive, updateUI: true });
                            // Rilegge il nome dal DB: itemData.name è quello
                            // catturato al render e non riflette eventuali
                            // rinomine fatte dopo.
                            const rec = await getEPGById(itemData.__epgId);
                            const displayName = rec?.name || itemData.name;
                            showNotification(`EPG "${displayName}" aggiornato`);
                            await renderEPGManager();
                        } catch (err) {
                            showNotification('Errore aggiornamento', true);
                        } finally {
                            iconEl.classList.remove('loading');
                        }
                    }
                },

                {
                    icon: '🗑️',
                    className: 'delete-channel',
                    deletionModeGated: true,
                    onClick: async (itemData) => {
                        if (!confirm('Eliminare questo EPG?')) return;
                        await deleteEPGUrl(itemData.__epgId);
                        await renderEPGManager();
                    }
                }
            ];
        },

        // Click su una riga EPG: la attiva (o apre il Full EPG se già attiva)
        onItemClick: async (def, itemEl) => {
            if (def.__special) {
                if (typeof openEPGBottomSheet === 'function') openEPGBottomSheet();
                return;
            }
            if (!def.__epgId) return;

            // Già attivo e in memoria: passa direttamente al Full EPG
            const currentActive = await getActiveEPG();
            if (currentActive && currentActive.id === def.__epgId && epgData && epgData.length > 0) {
                if (typeof renderFullEPGList === 'function') renderFullEPGList();
                return;
            }

            // Evidenzia subito l'elemento cliccato, prima di qualsiasi
            // operazione asincrona: così se l'utente torna al manager
            // ritrova già l'evidenziazione corretta.
            if (itemEl) {
                document.getElementById('epgList')?.querySelectorAll('.channel-item.active-channel')
                    .forEach(el => el.classList.remove('active-channel'));
                itemEl.classList.add('active-channel');
            }

            const rec = await getEPGById(def.__epgId);

            if (!rec) return;

            // Se il contenuto è già in DB lo usa direttamente,
            // altrimenti lo scarica da remoto.
            if (rec.content) {
                try {
                    const data = JSON.parse(rec.content);
                    await setOnlyActiveEPG(rec.id);
                    epgData = data;
                    rebuildEpgMap();
                } catch (err) {
                    await downloadEPG(rec.url, { setActive: true, updateUI: true });
                }
            } else {
                await downloadEPG(rec.url, { setActive: true, updateUI: true });
            }

            if (typeof renderFullEPGList === 'function') renderFullEPGList();
        },

        onComplete: () => setRenderFingerprint(epgList, fingerprint)
    });
}


// ============================================================================
// 17. VISTA FULL EPG — GUIDA COMPLETA
// ============================================================================

/**
 * Disegna la vista Full EPG (guida completa di tutti i canali con
 * programma corrente).
 *
 * Prima di disegnare:
 *   - se la vista griglia è attiva (fullEpgViewMode === 'grid'), delega
 *     ad applyFullEpgViewMode e ritorna: la lista non è di competenza di
 *     questa funzione;
 *   - se epgData è invariato rispetto all'ultimo render (confronto per
 *     riferimento) e la lista ha già figli, non ridisegna.
 *
 * Il rendering disegna una voce per ciascun canale di epgDisplayList che
 * abbia almeno un programma. Ogni voce mostra logo, nome e titolo del
 * programma in onda in questo momento. Il click apre il drawer EPG del
 * canale (openChannelEpgDrawer), non avvia la riproduzione.
 */
function renderFullEPGList() {
  const fullEpgCont = document.getElementById('fullEpgContainer');
  const list = document.getElementById('fullEpgList');
  const header = document.querySelector('#fullEpgContainer .group-header');

  switchToView('fullEpg');

  // Dispatcher griglia: se la modalità griglia è attiva, la gestisce
  // applyFullEpgViewMode (che chiama renderFullEPGGrid di epg-grid.js)
  if (typeof applyFullEpgViewMode === 'function') {
    applyFullEpgViewMode();
    if (typeof fullEpgViewMode !== 'undefined' && fullEpgViewMode === 'grid') {
      return;
    }
  }

  // Nessun re-render se i dati sono invariati
  if (list && list.children.length > 0 && epgData === lastRenderedEpgData) {
    console.log('Full EPG: nessuna modifica ai dati, nessun ridisegno.');
    return;
  }

  if (epgData && epgData.length) {
    rebuildEpgMap();
  }

  if (list) {
    list.style.transition = 'opacity 0.2s ease-in-out';
    list.style.opacity = '0';
    list.style.pointerEvents = 'none';
  }

  if (fullEpgCont) fullEpgCont.scrollTop = 0;

  // Sgancia le immagini tracciate prima di svuotare la lista
  if (sharedChannelObserver && list) {
    list.querySelectorAll('img').forEach(img => {
      try { sharedChannelObserver.unobserve(img); } catch (_) {}
    });
  }

  list.innerHTML = '';
  lastRenderedEpgData = epgData;

  // --- Stato vuoto ---
  if (!epgData || !epgData.length) {
    if (header) header.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems = 'center';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.minHeight = '200px';

    const img = document.createElement('img');
    img.src = 'nofullepg.svg';
    img.alt = 'Nessun EPG disponibile';
    img.className = 'no-epg';
    img.style.height = 'auto';
    img.style.maxHeight = '50vh';
    img.style.cursor = 'pointer';

    wrapper.appendChild(img);
    list.appendChild(wrapper);

    list.style.position = 'relative';
    list.style.height = '100%';
    list.style.opacity = '1';
    list.style.pointerEvents = 'auto';
    return;
  }

  if (header) header.style.display = '';

  // Full EPG è sempre in list-view: la preferenza list/grid dell'utente
  // vale solo per la lista canali.
  list.className = 'group-content list-view';

  const isGridView = false;

  // Una voce per ciascun canale con almeno un programma
  epgDisplayList
    .filter(ch => (ch.programs || []).length > 0)
    .forEach(epgChannel => {
    const item = document.createElement('div');
    item.className = 'channel-item list';
    item.setAttribute('data-name', (epgChannel.name || '').toLowerCase());

    const logo = document.createElement('img');
    logo.className = 'channel-logo';
    logo.dataset.src = sanitizeImageUrl(epgChannel.logo) || EPG_PLACEHOLDER;
    const lazyObserver = getSharedObserver();
    lazyObserver.observe(logo);
    logo.onerror = function() {
      this.src = '';
      this.style.backgroundColor = 'var(--epg-poster-bg)';
    };
    item.appendChild(logo);

    const nameContainer = document.createElement('div');
    nameContainer.style.flex = '1';
    nameContainer.style.minWidth = '0';

    const title = document.createElement('div');
    title.className = 'channel-name ' + (isGridView ? 'grid-name' : 'list-name');
    title.textContent = epgChannel.name || 'Sconosciuto';
    nameContainer.appendChild(title);

    // Riga "programma in corso". Non usa getCurrentProgramInfo perché per
    // una voce rinominata ("Rai 1 HD (+1)") la normalizzazione tornerebbe
    // alla chiave del primario e mostrerebbe il programma sbagliato.
    // Si usano direttamente i programmi della voce stessa.
    const prog = (epgChannel.programs || []).find(p => isProgramCurrentlyAiring(p)) || {};
    if (!isGridView && prog && prog.title) {
      const cur = document.createElement('div');
      cur.className = 'current-program';
      cur.textContent = prog.title;
      nameContainer.appendChild(cur);
    }

    item.appendChild(nameContainer);

    // Click → drawer dettaglio EPG (non riproduce)
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      openChannelEpgDrawer(epgChannel);
    });

    list.appendChild(item);
  });

  setTimeout(() => {
    list.style.opacity = '1';
    list.style.pointerEvents = 'auto';
  }, 50);
}


// ============================================================================
// 18. EPG INLINE SOTTO AL PLAYER
// ============================================================================

/**
 * Mostra i programmi (corrente + prossimi) del canale in riproduzione
 * nella sezione collassabile sotto al player (#epgContent).
 *
 * Mostra fino a 3 programmi a partire da quello in onda. Se non c'è
 * un programma in onda, mostra i prossimi 2 futuri. Se non c'è nulla da
 * mostrare, mostra un messaggio.
 *
 * Se il canale è stato avviato dal ▶ di una voce EPG (override attivo),
 * usa quella voce invece del lookup per nome: il canale M3U potrebbe avere
 * un nome diverso da quello EPG, e l'override è ciò che l'utente si
 * aspetta di vedere.
 *
 * @param {Object} channel  canale della playlist
 */
function showChannelEPG(channel) {
  const epgContent = document.getElementById('epgContent');

  if (!epgData || epgData.length === 0) {
    epgContent.innerHTML = `
      <div class="epg-message-container">
        <div class="epg-message">
          <p>Nessun dato EPG disponibile. Scarica prima l'EPG.</p>
        </div>
      </div>
    `;
    return;
  }

  // Priorità all'override di playback se corrisponde al canale
  let channelEPG;
  if (_epgPlaybackOverride && _epgPlaybackOverride.channelKey === getChannelKey(channel)) {
    channelEPG = _epgPlaybackOverride.epgChannel;
  } else {
    channelEPG = _resolveEpgChannel(channel);
  }

  if (!channelEPG || !channelEPG.programs || channelEPG.programs.length === 0) {
    epgContent.innerHTML = `
      <div class="epg-message-container">
        <div class="epg-message">
          <p>EPG non disponibile</p>
        </div>
      </div>
    `;
    return;
  }

  const now = new Date();
  const programs = channelEPG.programs;

  // Trova il programma corrente e i 2 successivi
  let currentProgramIndex = -1;
  let nextPrograms = [];

  for (let i = 0; i < programs.length; i++) {
    const program = programs[i];

    if (isProgramCurrentlyAiring(program)) {
      currentProgramIndex = i;
      nextPrograms = programs.slice(i, i + 3);
      break;
    }
  }

  // Nessun programma in onda: mostra i prossimi 2 futuri
  if (currentProgramIndex === -1) {
    for (let i = 0; i < programs.length; i++) {
      const startTime = new Date(programs[i].start);
      if (startTime > now) {
        nextPrograms = programs.slice(i, i + 2);
        break;
      }
    }
  }

  if (nextPrograms.length === 0) {
    epgContent.innerHTML = `
      <div class="epg-message-container">
        <div class="epg-message">
          <p>Nessun programma in onda o in programmazione</p>
        </div>
      </div>
    `;
    return;
  }

  epgContent.innerHTML = '';

  nextPrograms.forEach(program => {
    const startTime = new Date(program.start);
    const endTime = new Date(program.end);
    const isCurrent = isProgramCurrentlyAiring(program);
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    const wrapper = document.createElement('div');
    wrapper.className = 'epg-program' + (isCurrent ? ' current' : '');

    const posterContainer = document.createElement('div');
    posterContainer.className = 'epg-poster-container';

    const img = document.createElement('img');
    img.className = 'epg-poster';
    img.src = sanitizeImageUrl(program.poster) || sanitizeImageUrl(channel.logo) || EPG_PLACEHOLDER;
    img.alt = '';
    posterContainer.appendChild(img);

    const details = document.createElement('div');
    details.className = 'epg-details';

    const titleRow = document.createElement('div');
    titleRow.className = 'epg-title-row';

    const title = document.createElement('span');
    title.className = 'epg-title';
    title.textContent = program.title || 'Titolo non disponibile';

    const time = document.createElement('span');
    time.className = 'epg-time';
    time.textContent =
      startTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) +
      ' - ' +
      endTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

    titleRow.appendChild(title);
    titleRow.appendChild(time);

    details.appendChild(titleRow);

    if (program.subtitle) {
      const sub = document.createElement('div');
      sub.className = 'epg-subtitle';
      sub.textContent = program.subtitle;
      details.appendChild(sub);
    }

    if (program.description) {
      const desc = document.createElement('div');
      desc.className = 'epg-description';
      desc.textContent = program.description;
      details.appendChild(desc);
    }

    const dur = document.createElement('div');
    dur.className = 'epg-duration';
    dur.textContent = durationMinutes + ' min';

    details.appendChild(dur);

    wrapper.appendChild(posterContainer);
    wrapper.appendChild(details);

    epgContent.appendChild(wrapper);
  });
}


// ============================================================================
// 19. DRAWER DETTAGLIO EPG DI UN SINGOLO CANALE
// ============================================================================

/**
 * Apre il drawer laterale con la guida programmi completa di un canale EPG.
 *
 * Contenuto:
 *   - header con nome canale;
 *   - blocco "In onda ora" con poster, titolo, orari, progress bar e
 *     pulsante ▶ che avvia il canale M3U corrispondente;
 *   - lista programmi, uno per voce, con poster, data, orari e descrizione;
 *   - autoscroll al programma corrente.
 *
 * Il pulsante ▶ usa findChannelFromEPG per trovare il canale M3U
 * corrispondente e registra l'override _epgPlaybackOverride per la
 * sessione di riproduzione.
 *
 * @param {Object} epgChannel  voce EPG di cui mostrare il palinsesto
 */
function openChannelEpgDrawer(epgChannel){
  const drawer = document.getElementById('channelEpgDrawer');
  const title = document.getElementById('drawerChannelTitle');
  const progContainer = document.getElementById('drawerPrograms');
  const closeBtn = document.getElementById('drawerCloseBtn');

  // Reset del contenuto precedente (sgancia anche le immagini lazy)
  unobserveContainerImages(progContainer);
  progContainer.innerHTML = '';
  title.textContent = epgChannel.name || 'Canale';

  /**
   * Trova e avvia il canale M3U corrispondente alla voce EPG.
   * Se la playlist non è ancora caricata in memoria, la carica prima.
   * Registra l'override EPG per la durata della riproduzione.
   */
  async function _drawerPlay(epgChannel) {
    if (!channels || channels.length === 0) {
      const activePlaylist = await getActivePlaylist();
      if (activePlaylist && activePlaylist.content) {
        await parseM3U(activePlaylist.content, false, false);
      }
      await loadFavorites();
    }
    const found = await findChannelFromEPG(epgChannel);
    if (found && found.channel) {
      if (typeof closeFullEPG === 'function') closeFullEPG();
      _epgPlaybackOverride = {
        channelKey: getChannelKey(found.channel),
        epgChannel: epgChannel
      };
      showingFavorites = !!found.fromFavorites;
      updateToggleState();
      playStream(found.channel, !!found.fromFavorites);
    } else {
      showNotification('Canale non trovato nella playlist', true);
    }
  }

  // ─── Blocco "In onda ora" ─────────────────────────────────────────────
  const nowPlayingEl = document.getElementById('drawerNowPlaying');
  const nowPlaying = (epgChannel.programs || []).find(p => isProgramCurrentlyAiring(p));

  if (nowPlayingEl) {
    if (nowPlaying) {
      nowPlayingEl.classList.remove('hidden');
      nowPlayingEl.innerHTML = '';

      // Poster
      const poster = document.createElement('div');
      poster.className = 'drawer-now-poster';
      const posterImg = document.createElement('img');
      posterImg.dataset.src = sanitizeImageUrl(nowPlaying.poster)
        || sanitizeImageUrl(epgChannel.logo)
        || EPG_PLACEHOLDER;
      posterImg.alt = '';
      posterImg.onerror = function () {
        this.onerror = null;
        this.src = EPG_PLACEHOLDER;
      };
      getSharedObserver().observe(posterImg);
      poster.appendChild(posterImg);
      nowPlayingEl.appendChild(poster);

      // Info testuali
      const info = document.createElement('div');
      info.className = 'drawer-now-info';

      const label = document.createElement('div');
      label.className = 'drawer-now-label';
      label.textContent = 'In onda ora';
      info.appendChild(label);

      const titleNow = document.createElement('div');
      titleNow.className = 'drawer-now-title';
      titleNow.textContent = nowPlaying.title || 'Programma';
      info.appendChild(titleNow);

      const timeNow = document.createElement('div');
      timeNow.className = 'drawer-now-time';
      timeNow.textContent = formatTime(nowPlaying.start) + ' - ' + formatTime(nowPlaying.end);
      info.appendChild(timeNow);

      const progressBar = document.createElement('div');
      progressBar.className = 'drawer-now-progress';
      const progressFill = document.createElement('div');
      progressFill.className = 'drawer-now-progress-fill';
      progressFill.style.width = getProgramProgress(nowPlaying.start, nowPlaying.end) + '%';
      progressBar.appendChild(progressFill);
      info.appendChild(progressBar);

      nowPlayingEl.appendChild(info);

      // Pulsante ▶
      const playNowBtn = document.createElement('button');
      playNowBtn.type = 'button';
      playNowBtn.className = 'drawer-now-play';
      playNowBtn.title = 'Riproduci programma corrente';
      playNowBtn.textContent = '▶';
      playNowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _drawerPlay(epgChannel);
      });
      nowPlayingEl.appendChild(playNowBtn);

    } else {
      // Nessun programma in onda: nasconde il blocco
      nowPlayingEl.classList.add('hidden');
      nowPlayingEl.innerHTML = '';
    }
  }

  // ─── Lista completa dei programmi ─────────────────────────────────────
  epgChannel.programs.forEach(pr => {
    const prEl = document.createElement('div');

    const isCurrent = isProgramCurrentlyAiring(pr);
    prEl.className = 'epg-program' + (isCurrent ? ' current' : '');

    const programDate = new Date(pr.start);
    const dateStr = programDate.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });

    // Poster + data + orari (+ progress bar se corrente)
    const posterWrap = document.createElement('div');
    posterWrap.className = 'poster-with-date';

    const posterContainer = document.createElement('div');
    posterContainer.className = 'epg-poster-container';

    const img = document.createElement('img');
    img.className = 'epg-poster';
    img.dataset.src = sanitizeImageUrl(pr.poster) || sanitizeImageUrl(epgChannel.logo) || EPG_PLACEHOLDER;
    img.alt = '';

    img.onerror = function () {
      this.onerror = null;
      this.src = EPG_PLACEHOLDER;
    };

    getSharedObserver().observe(img);

    posterContainer.appendChild(img);
    posterWrap.appendChild(posterContainer);

    const dateEl = document.createElement('div');
    dateEl.className = 'epg-time';
    dateEl.textContent = dateStr;
    posterWrap.appendChild(dateEl);

    const timeEl = document.createElement('div');
    timeEl.className = 'epg-time';
    timeEl.textContent = formatTime(pr.start) + ' - ' + formatTime(pr.end);
    posterWrap.appendChild(timeEl);

    if (isCurrent) {
      const progressContainer = document.createElement('div');
      progressContainer.className = 'epg-progress-bar-container';

      const progressBar = document.createElement('div');
      progressBar.className = 'epg-progress-bar';
      progressBar.style.width = getProgramProgress(pr.start, pr.end) + '%';

      progressContainer.appendChild(progressBar);
      posterWrap.appendChild(progressContainer);
    }

    // Testi: titolo, subtitle, description
    const details = document.createElement('div');
    details.className = 'epg-details';

    const titleRow = document.createElement('div');
    titleRow.className = 'epg-title-row';

    const programTitle = document.createElement('span');
    programTitle.className = 'epg-title';
    programTitle.textContent = pr.title || '';
    titleRow.appendChild(programTitle);

    // Il ▶ è nel blocco "In onda ora": qui non serve duplicarlo
    details.appendChild(titleRow);

    if (pr.subtitle) {
      const sub = document.createElement('div');
      sub.className = 'epg-subtitle';
      sub.textContent = pr.subtitle;
      details.appendChild(sub);
    }

    if (pr.description) {
      const desc = document.createElement('div');
      desc.className = 'epg-description';
      desc.textContent = pr.description;
      details.appendChild(desc);
    }

    prEl.appendChild(posterWrap);
    prEl.appendChild(details);

    progContainer.appendChild(prEl);
  });

  // Apri drawer
  drawer.classList.remove('hidden');
  drawer.classList.add('open');

  // Autoscroll al programma corrente
  requestAnimationFrame(() => {
    const target = progContainer.querySelector('.epg-program.current');
    if (target) {
      const targetPosition = target.offsetTop - progContainer.offsetTop - 12;
      progContainer.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  });

  // Chiusura con la X
  closeBtn.onclick = () => {
    drawer.classList.remove('open');
    setTimeout(() => drawer.classList.add('hidden'), 300);
  };
}


// ============================================================================
// 20. TOGGLE EPG — COLLASSO/ESPANSIONE SEZIONE
// ============================================================================

/**
 * Mostra/nasconde il contenuto della sezione EPG collassabile sotto al
 * player. Salva lo stato di collasso in localStorage.epgCollapsed.
 * Se viene espansa con un canale attivo, ne aggiorna i programmi.
 */
function toggleEPG() {
  const content = document.getElementById('epgContent');
  const arrow = document.querySelector('#epgHeader .metadata-arrow');
  const isCollapsed = content.style.display === 'none';

  content.style.display = isCollapsed ? 'block' : 'none';
  arrow.classList.toggle('collapsed', !isCollapsed);
  localStorage.setItem('epgCollapsed', String(!isCollapsed));

  if (!isCollapsed && window.currentChannelUrl) {
    const currentChannel = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    if (currentChannel) showChannelEPG(currentChannel);
  }
}


// ============================================================================
// 21. CHIUSURA VISTE EPG + DRAWER
// ============================================================================

/**
 * Chiude la vista Full EPG, il drawer dettaglio (se aperti) e l'override
 * di playback. Decide quale vista mostrare al ritorno in base al contesto:
 *   - se si proveniva dall'EPG manager, torna lì;
 *   - altrimenti torna alla vista canali.
 *
 * Il contesto è registrato in localStorage.lastViewBeforeFullEPG da chi
 * apre la vista Full EPG.
 *
 * Viene chiamata da tutti i punti che "escono" dalla vista EPG: Back del
 * player, cambio vista, cambio playlist, ecc.
 */
function closeFullEPG() {
    _epgPlaybackOverride = null;

    const drawer = document.getElementById('channelEpgDrawer');
    const fullEpgContainer = document.getElementById('fullEpgContainer');
    const channelEpgDetail = document.getElementById('channelEpgDetail');

    // Chiudi drawer
    if (drawer) {
        drawer.classList.remove('open');
        setTimeout(() => drawer.classList.add('hidden'), 300);
    }

    // Nascondi le viste EPG
    if (fullEpgContainer && !fullEpgContainer.classList.contains('hidden')) {
        fullEpgContainer.classList.add('hidden');
    }
    if (channelEpgDetail && !channelEpgDetail.classList.contains('hidden')) {
        channelEpgDetail.classList.add('hidden');
    }

    // Torna alla vista di provenienza
    const wasInEpgManager = localStorage.getItem('lastViewBeforeFullEPG') === 'epgManager';

    if (wasInEpgManager) {
        document.getElementById('epgListContainer').classList.remove('hidden');
        document.getElementById('channelListContainer').classList.add('hidden');
        document.getElementById('playerContainer').classList.add('hidden');
        window.isEPGView = true;
    } else {
        document.getElementById('channelListContainer').classList.remove('hidden');
        document.getElementById('playerContainer').classList.remove('hidden');
        window.isEPGView = false;
    }

    localStorage.removeItem('lastViewBeforeFullEPG');
}


// ============================================================================
// 22. BOTTOM SHEET EPG — APERTURA E CHIUSURA
// ============================================================================

/**
 * Apre il bottom sheet per il caricamento EPG da URL.
 * Sposta il focus sul campo nome dopo la transizione.
 */
function openEPGBottomSheet() {
  const bottomSheet = document.getElementById("epgUrlBottomSheet");
  const overlay = document.getElementById("bottomSheetOverlayEPG");
  bottomSheet.classList.remove("hidden");
  overlay.classList.remove("hidden");
  setTimeout(() => {
    bottomSheet.classList.add("open");
    overlay.classList.add("open");
  }, 10);
  setTimeout(() => {
    document.getElementById("modalEPGName")?.focus();
  }, 300);
}

/**
 * Chiude il bottom sheet EPG con animazione di scorrimento verso il basso
 * e nasconde l'overlay dopo la transizione.
 */
function closeEPGBottomSheet() {
  const bottomSheet = document.getElementById("epgUrlBottomSheet");
  const overlay = document.getElementById("bottomSheetOverlayEPG");
  bottomSheet.classList.remove("open");
  overlay.classList.remove("open");
  setTimeout(() => {
    bottomSheet.classList.add("hidden");
    overlay.classList.add("hidden");
  }, 300);
}