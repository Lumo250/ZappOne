// ============================================================================
// INDICE DELLE SEZIONI
// ============================================================================
//
// Il file è organizzato in 65 sezioni numerate. Ogni sezione è separata
// da una riga di commento con la forma:
//
//     // ============================================================
//     // NN. TITOLO DELLA SEZIONE
//     // ============================================================
//
// Per cercare una funzione o una zona specifica, usa Ctrl+F (o Cmd+F)
// cercando "NN." con il numero della sezione qui sotto.
//
// ─── STATO GLOBALE ────────────────────────────────────────────────────
//   1.  Stato globale — canali e preferiti
//   2.  Stato globale — collasso gruppi
//   3.  Stato globale — drag & drop
//   4.  Stato globale — vista e gesture
//   5.  Stato globale — cache interne
//   6.  Stato globale — EPG
//   7.  Costanti — chiavi di reset
//   8.  Stato globale — player HLS e riferimenti DOM
//   9.  Stato globale — DB e flag di vista
//  10.  Stato globale — indici per ricerca rapida
//  11.  Stato globale — modalità eliminazione
//  12.  Caricamento stato di collasso da localStorage
//  13.  Riferimenti a moduli esterni
//
// ─── FUNZIONI DI SUPPORTO ─────────────────────────────────────────────
//  14.  Funzioni di supporto — persistenza stato interfaccia
//  15.  Modalità eliminazione — enter / exit / toggle
//
// ─── CARICAMENTO PLAYLIST ─────────────────────────────────────────────
//  16.  Caricamento playlist da URL
//  17.  Utility — nome file di export
//  18.  Utility — input di ricerca
//
// ─── PREFERITI ────────────────────────────────────────────────────────
//  19.  Gestione preferiti
//  20.  Lazy loading immagini
//
// ─── VISTE PRINCIPALI ─────────────────────────────────────────────────
//  21.  Switch tra viste principali
//  22.  Renderer generico per liste "salvate" (playlist, EPG manager)
//  23.  Vista playlist manager
//  24.  Token di render per-container
//  25.  Renderer principale — lista canali / preferiti / altri contesti
//  26.  Show channel list — ritorno alla lista canali
//
// ─── ELIMINAZIONE E RIORDINO ──────────────────────────────────────────
//  27.  Eliminazione canali
//  28.  Drag & drop — delegazione eventi
//  29.  Riordino — gruppi e canali
//  30.  Stato dei pulsanti in header
//
// ─── METADATI CANALE ──────────────────────────────────────────────────
//  31.  Metadati canale — pannello nel player
//
// ─── GESTURE E MODALITÀ VISTA ─────────────────────────────────────────
//  32.  Gesture — swipe per cambiare lista/griglia
//
// ─── NOTIFICHE E CONSOLE ──────────────────────────────────────────────
//  33.  Notifiche a comparsa (toast)
//  34.  Intercettazione console
//
// ─── SIDEBAR E TAB ────────────────────────────────────────────────────
//  35.  Sidebar impostazioni — apertura, chiusura, drag
//  36.  Tab sidebar (aspetto / player / contenuti / sistema)
//  37.  Tab aspetto — tema e dimensione testo
//  38.  Tab contenuti — URL predefiniti M3U / EPG
//  39.  Tab sistema — hard reset
//  40.  Tab player — toggle pannelli (EPG, metadati, fullscreen, radio)
//  41.  Tab sistema — toggle notifiche e console
//  42.  Sidebar — lista URL playlist salvate
//
// ─── BOTTOM SHEET ─────────────────────────────────────────────────────
//  43.  Refresh UI playlist
//  44.  Handler "click su playlist" riutilizzabile
//  45.  Bottom sheet M3U — apertura e chiusura
//  46.  Caricamento automatico M3U da URL (bottom sheet)
//  47.  Wiring bottom sheet M3U — campi e pulsanti
//  48.  Wiring bottom sheet EPG — pulsanti
//  49.  Wiring bottom sheet M3U — salva e annulla
//  50.  Wiring bottom sheet EPG — campi e pulsanti rapidi
//  51.  Drag-to-dismiss dei bottom sheet
//
// ─── PILL E PULSANTI IN HEADER ────────────────────────────────────────
//  52.  Pill "preferiti / tutti" — click e long press
//  53.  Pill "vista lista / griglia" — click e long press
//  54.  Espansione gruppi nelle liste playlist / EPG
//  55.  Pill "opzioni / export / back" in header
//  56.  Rinomina playlist ed EPG — long press sulla tile
//
// ─── FILE, RICERCA, LISTENER ──────────────────────────────────────────
//  57.  Caricamento file locali (M3U o EPG)
//  58.  Ricerca in tempo reale
//  59.  Setup event listeners
//
// ─── AVVIO APPLICAZIONE ───────────────────────────────────────────────
//  60.  Splash screen — rimozione
//  61.  Inizializzazione applicazione
//  62.  Registrazione service worker
//  63.  Display licenza nel tab sistema
//  64.  Blocco zoom su iOS
//  65.  Avvio applicazione
//
// ============================================================================
// FINE INDICE
// ============================================================================


// ============================================================================
// zappone.js — Modulo principale dell'applicazione ZappOne
//
// Questo file è il cuore dell'app. Contiene:
//   - lo stato globale dei canali, dei preferiti e dell'interfaccia;
//   - il rendering delle liste (canali, playlist, EPG);
//   - la gestione dei preferiti, dei metadati del canale, delle gesture;
//   - l'inizializzazione dell'app e il wiring di tutti i listener UI.
//
// Dipendenze principali (devono essere già caricate prima di questo file,
// come da ordine in index.html):
//   license.js      -> appConfig, getConfigFromServer, promptLicenseElegant,
//                      fetchM3UWithProxies, downloadM3U, getFingerprint
//   m3u-parser.js   -> getChannelKey, groupChannels, generateM3UFromChannels,
//                      countChannelsAndGroups, parseM3U
//   db.js           -> getDB, saveAndActivateM3U, saveAndActivateEPG,
//                      getAllM3UUrls, getActivePlaylist, getM3UById,
//                      updateM3URecord, deleteM3UUrl, findEPGByUrl, ...
//   epg.js          -> downloadEPG, rebuildEpgMap, hasEPG, getCurrentProgramInfo,
//                      getCurrentProgramFull, getProgramProgress,
//                      renderEPGManager, renderFullEPGList, showChannelEPG,
//                      openChannelEpgDrawer, closeFullEPG, toggleEPG, ...
//   epg-grid.js     -> applyFullEpgViewMode, setupFullEpgViewToggle,
//                      setupFullEpgTimeNav, scrollFullEpgToNow
//   equalizer.js    -> setupEqualizerUI, detachEqualizerAndRestoreNative,
//                      isEqEnabled, ...
//   player.js       -> playStream, playAudioStream, playVideoStream,
//                      cleanupPlayers, navigateChannels, isAudioStream,
//                      toggleUIElementsForStreamType, getActiveChannel (helper)
//
// Convenzioni del file:
//   - Le variabili dichiarate con `let` in cima sono stato globale di modulo.
//     Alcune sono anche lette/scritte da epg.js e player.js attraverso la
//     variabile globale `window` o direttamente (sono nello stesso scope
//     globale perché tutti i file sono script non-module).
//   - Le funzioni sono dichiarate con `function` (hoisting globale) e sono
//     visibili anche agli altri moduli.
//   - I listener UI sono agganciati in setupEventListeners() chiamata da
//     DOMContentLoaded; le IIFE in fondo al file riguardano componenti
//     specifici (sidebar, pill, rename, drag bottom sheet).
// ============================================================================


// ============================================================================
// 1. STATO GLOBALE — CANALI E PREFERITI
// ============================================================================

// Array piatto di tutti i canali della playlist attiva, nell'ordine in cui
// compaiono nel file M3U dopo eventuali riordini drag & drop.
let channels = [];

// Stessa lista di `channels` ma raggruppata per categoria (group-title).
// Ogni voce è { name, logo, channels: [...], order }. È quello che il
// renderer usa per disegnare gli header di gruppo.
let groupedChannels = [];

// Array piatto dei canali marcati come preferiti dall'utente. Viene
// popolato da loadFavorites() all'avvio e aggiornato da toggleFavorite()
// e dalle operazioni di delete/rinomina sui preferiti.
let favoriteChannels = [];

// Stessa lista di favoriteChannels ma raggruppata, per il rendering della
// vista "Preferiti".
let groupedFavoriteChannels = [];

// Flag che riflette la vista corrente: true = lista preferiti, false =
// lista completa dei canali. È il valore che pilota updateToggleState()
// e le scelte di rendering in renderGroupedChannelList/renderPlaylistList.
let showingFavorites = false;

// Indici del canale attualmente in riproduzione rispettivamente nella lista
// completa e nella lista preferiti. Usati da prev/next per muoversi
// nella lista giusta a seconda da dove è partita la riproduzione.
let currentChannelIndex = -1;
let currentFavoriteIndex = -1;


// ============================================================================
// 2. STATO GLOBALE — COLLASSO GRUPPI
// ============================================================================
//
// Ogni gruppo della lista canali può essere espanso o collassato cliccando
// sul suo header. Lo stato è per-gruppo e viene persistito su localStorage
// per essere ripristinato al prossimo avvio.
//
// Le due mappe sono separate perché i preferiti e la lista completa possono
// avere gruppi con lo stesso nome ma stato di collasso indipendente.

let groupCollapseState = {};
let favoriteGroupCollapseState = {};


// ============================================================================
// 3. STATO GLOBALE — DRAG & DROP
// ============================================================================
//
// Variabili condivise tra i vari eventi (dragstart, dragover, drop) per
// ricordare cosa si sta trascinando. Il drag & drop è attivo solo sui
// canali della lista principale e dei preferiti, non su playlist/EPG.
//
// I listener veri e propri sono agganciati una sola volta da
// setupDragAndDropDelegation() con event delegation su #channelList.

let draggedItem = null;                // elemento DOM .channel-item in corso di drag
let draggedItemOriginalGroup = null;   // indice del gruppo di partenza
let draggedItemOriginalUrl = null;     // url del canale trascinato
let draggedItemIsFavorite = false;     // true se il drag avviene nella vista Preferiti
let draggedGroupIndex = null;          // indice del gruppo in corso di drag (drag di header)
let draggedGroupIsFavorite = false;    // true se il gruppo trascinato è nei preferiti


// ============================================================================
// 4. STATO GLOBALE — VISTA E GESTURE
// ============================================================================

// Modalità di visualizzazione della lista canali: 'list' o 'grid'.
// Playlist ed EPG sono sempre in list-view: currentViewMode è applicato
// solo quando context === 'channels' in renderGroupedChannelList.
let currentViewMode = 'list';

// Coordinate di inizio/fine per il riconoscimento dello swipe orizzontale
// che alterna list/grid. Usate sia per il touch che per il mouse.
let touchStartX = 0;
let touchEndX   = 0;
let mouseDownX  = 0;
let mouseUpX    = 0;


// Stato della ricerca e del filtro contestuale.
//   activeSearchQuery       ultima query non vuota digitata dall'utente.
//                           Serve a riapplicare il filtro dopo i re-render
//                           (es. tornando dal player alla lista canali).
//   searchEPGFilterActive   true se il toggle filtro contestuale è attivo.
//                           Il significato del filtro dipende dalla vista:
//                           vedi updateSearchFilterToggle().



// ============================================================================
// 5. STATO GLOBALE — CACHE INTERNE
// ============================================================================

// Cache del tipo di stream per URL: { [url]: true|false }
// true = audio, false = video. Popolata da isAudioStream() per evitare
// di ripetere il test ad ogni play.
let streamTypeCache = {};


// Stato espansione del pannello "Metadati Canale". Rispecchia
// localStorage.metadataExpanded per non rileggerlo ad ogni render.
let metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';


// ============================================================================
// 6. STATO GLOBALE — EPG
// ============================================================================
//
// Lo stato e tutte le funzioni EPG vivono in epg.js. Qui teniamo solo il
// riferimento per chiarezza di chi legge:
//
//   epg.js esporta (variabili globali condivise con questo file):
//     epgData, epgByName, epgDisplayList, lastRenderedEpgData,
//     _epgPlaybackOverride
//
//   epg.js esporta (funzioni richiamate da questo file):
//     normalizeChannelName, parseXMLTVDate, isProgramCurrentlyAiring,
//     getProgramProgress, formatTime, downloadEPG, parseXMLTV,
//     handleEPGLoading, autoLoadEPG, rebuildEpgMap, hasEPG,
//     getCurrentProgramInfo, getCurrentProgramFull, findChannelFromEPG,
//     renderEPGManager, renderFullEPGList, showChannelEPG,
//     openChannelEpgDrawer, toggleEPG, closeFullEPG,
//     openEPGBottomSheet, closeEPGBottomSheet
//
// Lo stato qui sotto è ciò che è strettamente necessario a zappone.js.


// ============================================================================
// 7. COSTANTI — CHIAVI DI RESET
// ============================================================================



// ============================================================================
// 8. STATO GLOBALE — PLAYER HLS E RIFERIMENTI DOM
// ============================================================================

// Chiave univoca (getChannelKey) del canale attualmente in riproduzione.
// È la fonte di verità per: evidenziazione della tile attiva, ripristino
// dell'ultimo canale, ricerca del canale corrente nei metadati.
window.currentChannelUrl = null;

// Riferimento all'istanza HLS.js attiva (gestita in player.js). Qui è
// dichiarata solo per evitare che altri file la vedano come undefined.
window.hlsInstance = null;


// ============================================================================
// 9. STATO GLOBALE — DB E FLAG DI VISTA
// ============================================================================

// Set delle chiavi dei preferiti (getChannelKey). È la struttura O(1) che
// sostituisce le scansioni lineari di favoriteChannels: chiunque debba
// sapere "è preferito?" usa favoriteKeys.has(key), non .some().
const favoriteKeys = new Set();

// Flag booleani di contesto: dicono in quale vista siamo (EPG manager,
// playlist manager, lista canali). Usati da funzioni che non ricevono
// il context come parametro e devono capirlo dal contesto globale.
window.isEPGView = false;
window.isPlaylistView = false;


// ============================================================================
// 10. STATO GLOBALE — INDICI PER RICERCA RAPIDA
// ============================================================================
//
// Mappe aggiornate da rebuildIndexMaps() ogni volta che channels o
// favoriteChannels cambiano. Servono a:
//   - trovare l'indice di un canale in O(1) senza findIndex O(N);
//   - trovare un canale a partire dal suo URL in O(1).
//
// La chiave delle mappe di indice è getChannelKey(ch).
let channelIndexMap = new Map();       // getChannelKey -> index in channels
let favoriteIndexMap = new Map();      // getChannelKey -> index in favoriteChannels
let channelUrlMap = new Map();         // url -> channel
let favoriteUrlMap = new Map();        // url -> canale preferito


// ============================================================================
// 11. STATO GLOBALE — MODALITÀ ELIMINAZIONE
// ============================================================================
//
// La modalità cancellazione si attiva con un long-press sul pill "Preferiti"
// e mostra i cestini accanto a ogni riga nelle liste canali/playlist/EPG.
// Si disattiva con un secondo long-press (o con un tap normale sul pill).

let deletionMode = false;
let _pillLongPressTimer = null;


// ============================================================================
// 12. CARICAMENTO STATO DI COLLASSO DA LOCALSTORAGE
// ============================================================================

groupCollapseState = JSON.parse(
  localStorage.getItem('zappone_group_collapse') || '{}'
);

favoriteGroupCollapseState = JSON.parse(
  localStorage.getItem('zappone_fav_group_collapse') || '{}'
);


// ============================================================================
// 13. RIFERIMENTI A MODULI ESTERNI
// ============================================================================
//
// Le funzioni elencate sotto vivono in m3u-parser.js e sono già globali.
// L'elenco è solo di riferimento per chi legge:
//
//   getChannelKey, groupChannels, generateM3UFromChannels,
//   countChannelsAndGroups, parseM3UInWorker, parseM3U,
//   getFilteredGroupedChannels
//
// Un unico observer IntersectionObserver condiviso da tutte le liste
// (canali, EPG, playlist) per il lazy-loading delle immagini. Condividerlo
// evita di istanziare decine di observer e riduce drasticamente la memoria
// quando ci sono liste molto lunghe.
let sharedChannelObserver = null;

// Riferimenti ai due container dei metadati del player. Vengono letti in
// vari punti del file; dichiararli una volta sola qui evita getElementById
// ripetuti.
const metadataContainer = document.getElementById('metadataContainer');
const metadataHeader = document.getElementById('metadataHeader');


// ============================================================================
// 14. FUNZIONI DI SUPPORTO — PERSISTENZA STATO INTERFACCIA
// ============================================================================

/**
 * Salva su localStorage lo stato di espansione/collasso di tutti i gruppi,
 * sia per la lista principale sia per la lista preferiti. Viene chiamata
 * ad ogni toggle di un group-header o quando si espandono/comprimono tutti
 * i gruppi con il long-press sul viewModePill.
 *
 * Non ritorna nulla. In caso di quota piena o localStorage disabilitato,
 * logga un warning e prosegue senza eccezioni.
 */
function saveGroupCollapseStates() {
  try {
    localStorage.setItem(
      'zappone_group_collapse',
      JSON.stringify(groupCollapseState || {})
    );
    localStorage.setItem(
      'zappone_fav_group_collapse',
      JSON.stringify(favoriteGroupCollapseState || {})
    );
  } catch (e) {
    console.warn('Cannot save group collapse states', e);
  }
}


/**
 * Ricostruisce le mappe di indice (channelIndexMap, channelUrlMap,
 * favoriteIndexMap, favoriteUrlMap) a partire dagli array channels e
 * favoriteChannels correnti.
 *
 * Va chiamata OGNI VOLTA che:
 *   - si aggiunge/rimuove/rinomina un canale (channels cambia);
 *   - si aggiunge/rimuove/rinomina un preferito (favoriteChannels cambia);
 *   - si riordina con drag & drop (cambia l'ordine, quindi gli indici).
 *
 * Non ritorna nulla. È idempotente: può essere chiamata più volte di
 * seguito senza effetti collaterali.
 */
function rebuildIndexMaps() {
  channelIndexMap.clear();
  channelUrlMap.clear();
  channels.forEach((ch, i) => {
    const key = getChannelKey(ch);
    channelIndexMap.set(key, i);
    channelUrlMap.set(ch.url, ch);
  });
  
  favoriteIndexMap.clear();
  favoriteUrlMap.clear();
  favoriteChannels.forEach((ch, i) => {
    const key = getChannelKey(ch);
    favoriteIndexMap.set(key, i);
    favoriteUrlMap.set(ch.url, ch);
  });
}


// ============================================================================
// 15. MODALITÀ ELIMINAZIONE — ENTER / EXIT / TOGGLE
// ============================================================================
//
// In modalità cancellazione:
//   - le icone cestino dentro le tile diventano visibili (.visible);
//   - il pill "Preferiti" mostra la classe .delete-mode (rosso);
//   - i click sui cestini attivano l'eliminazione.
//
// L'eliminazione è disponibile nelle tre liste: canali, playlist, EPG.
// Le funzioni qui sotto modificano solo lo stato visivo; la logica di
// cancellazione vera e propria sta nei rispettivi handler delle tile.


/**
 * Attiva la modalità cancellazione. Rende visibili tutti i cestini nelle
 * liste correntemente nel DOM. È idempotente: se già attiva, non fa nulla.
 */
function enterDeletionMode() {
  if (deletionMode) return;
  deletionMode = true;
  const pill = document.getElementById('favoritesPill');
  if (pill) pill.classList.add('delete-mode');

  const containers = ['#channelList', '#playlistList', '#epgList'];
  containers.forEach(selector => {
    const container = document.querySelector(selector);
    if (container && container.querySelectorAll) {
      container.querySelectorAll('.channel-item.list .delete-channel').forEach(btn => {
        btn.classList.add('visible');
      });
    }
  });
}


/**
 * Disattiva la modalità cancellazione e nasconde tutti i cestini. È
 * idempotente: se già disattiva, non fa nulla.
 */
function exitDeletionMode() {
  if (!deletionMode) return;
  deletionMode = false;
  const pill = document.getElementById('favoritesPill');
  if (pill) pill.classList.remove('delete-mode');

  document.querySelectorAll('.delete-channel').forEach(btn => {
    btn.classList.remove('visible');
  });
}


/**
 * Alterna la modalità cancellazione. Dopo il cambio, forza il re-render
 * della vista playlist o EPG attualmente aperta, perché i cestini sono
 * creati durante il rendering e non basta toggle-are la classe.
 */
function toggleDeletionMode() {
  if (deletionMode) {
    exitDeletionMode();
  } else {
    enterDeletionMode();
  }
  
  if (window.isPlaylistView && typeof renderPlaylistList === 'function') {
    renderPlaylistList();
  } else if (window.isEPGView && typeof renderEPGManager === 'function') {
    renderEPGManager();
  }
}


// ============================================================================
// 16. CARICAMENTO PLAYLIST DA URL
// ============================================================================

/**
 * Carica una playlist da URL, la salva come attiva e la visualizza.
 *
 * È il punto unico per il caricamento da URL: tutti i flussi (bottomsheet,
 * playlist predefinita, click su playlist salvata, reset) passano da qui.
 * In questo modo la validazione del contenuto è centralizzata: se il
 * download fallisce o restituisce contenuto non plausibile, la playlist
 * non viene salvata e non diventa attiva.
 *
 * @param {string} url           URL della playlist M3U
 * @param {string|null} name     Nome da assegnare alla playlist. Se null
 *                               viene usato il filename dell'URL.
 * @param {Object} [opts]
 * @param {boolean} [opts.closeAfter=false]  Se true, chiude il bottom
 *                               sheet prima di iniziare.
 * @returns {Promise<Object|null>}  Il record salvato o null in caso di
 *                                  errore (in tal caso mostra una notifica).
 */
async function loadPlaylistFromUrl(url, name = null, { closeAfter = false } = {}) {
  if (closeAfter && typeof closeBottomSheet === 'function') closeBottomSheet();

  try {
    const text = await fetchM3UWithProxies(url);

    // [FIX 2b] Non basta "non vuoto": deve essere davvero una playlist M3U (una pagina HTML d'errore
    // o una risposta vuota non va salvata né attivata). La guardia vive qui perché loadRemoteM3U
    // ora delega a questa funzione.
    if (!isValidM3UText(text)) {
      throw new Error('Download playlist fallito (contenuto vuoto, non valido o licenza non valida)');
    }

    const rec = await saveAndActivateM3U({
      url,
      name: name || url.split('/').pop() || 'Playlist',
      content: text
    });

    await parseM3U(rec.content, true);
    showingFavorites = false;
    window.isPlaylistView = false;
    updateButtons?.();
    if (typeof showChannelList === 'function') await showChannelList();
    if (typeof refreshPlaylistUIs === 'function') refreshPlaylistUIs();
    showNotification('Playlist caricata');
    return rec;
  } catch (err) {
    console.error('loadPlaylistFromUrl:', err);
    if (typeof showNotification === 'function') {
      showNotification('Errore nel caricamento playlist: ' + err.message, true);
    }
    return null;
  }
}


/**
 * Wrapper storico di loadPlaylistFromUrl usato dai punti che passano
 * solamente URL e flag closeAfter. Mantiene la stessa semantica: valida,
 * salva, parsa e mostra i canali.
 *
 * @param {string} url
 * @param {boolean} [closeAfter=false]
 * @returns {Promise<Object|null>}
 */
async function loadRemoteM3U(url, closeAfter = false) {
  return await loadPlaylistFromUrl(url, url ? url.split('/').pop() : null, { closeAfter });
}


// ============================================================================
// 17. UTILITY — NOME FILE DI EXPORT
// ============================================================================

/**
 * Costruisce un nome di file "sensato" per l'export della playlist corrente.
 *
 * Il nome viene derivato dal filename/name della playlist attiva su
 * IndexedDB, ripulito da suffissi ("_Tutti", "_Preferiti", " (1)", ".m3u")
 * e completato con il suffisso corrente: "_Preferiti" se stiamo esportando
 * la vista preferiti, "_Tutti" altrimenti.
 *
 * @returns {Promise<string>}  Nome suggerito (senza path)
 */
async function getSuggestedExportFilename() {
  const rec = await getActivePlaylist();

  let baseName = 'zappone';
  if (rec) {
    baseName = rec.filename || rec.name || (rec.url ? rec.url.split('/').pop() : 'zappone');
  }

  baseName = baseName.replace(/_Tutti/gi, '');
  baseName = baseName.replace(/_Preferiti/gi, '');
  baseName = baseName.replace(/\s*\(\d+\)/g, '');
  baseName = baseName.replace(/\.(m3u8?|txt)?$/i, '');

  const suffix = showingFavorites ? '_Preferiti' : '_Tutti';
  return `${baseName}${suffix}.m3u`;
}


// ============================================================================
// 18. UTILITY — INPUT DI RICERCA
// ============================================================================

/**
 * Configura il comportamento di un input testuale con pulsante di
 * cancellazione (X). Il pulsante è il sibling successivo dell'input e viene
 * mostrato automaticamente quando l'input contiene testo.
 *
 * @param {string} inputId  id dell'elemento input
 */
 


// ============================================================================
// 19. GESTIONE PREFERITI
// ============================================================================

/**
 * Salva il nuovo nome del canale digitato nel campo contenteditable del
 * player. È agganciata come handler dell'evento 'blur' su #currentChannelName.
 * Il nome effettivo viene applicato da saveMetadataChanges().
 */
async function saveChannelName() {
  const newName = this.textContent.trim();
  if (!newName) return;

  await saveMetadataChanges(newName);
}


/**
 * Alterna lo stato preferito di un canale e sincronizza UI, memoria e DB.
 *
 * Cosa fa esattamente:
 *   1. Capisce se il canale è già preferito (via favoriteKeys);
 *   2. se lo è, lo rimuove da favoriteChannels, dal DB e dal Set;
 *   3. se non lo è, ne crea una copia, lo aggiunge in coda, lo salva
 *      su IndexedDB con un order crescente, e aggiorna il Set;
 *   4. aggiorna la stella nella tile (classe .inactive e title);
 *   5. se siamo nella vista preferiti e stiamo rimuovendo, nasconde la
 *      riga; se il gruppo resta vuoto, nasconde anche l'header;
 *   6. ricostruisce le mappe di indice e chiama updateButtons().
 *
 * @param {Object} channel      canale (con name, url, group, logo, type)
 * @param {HTMLElement} starElement  la stella dentro la tile (per aggiornare
 *                                   classi e title senza re-render completo)
 */
async function toggleFavorite(channel, starElement) {
    const key = getChannelKey(channel);
    const wasFavorite = isFavorite(channel);

    if (wasFavorite) {
        // Rimozione dai preferiti
        const favIndex = favoriteChannels.findIndex(fav => getChannelKey(fav) === key);
        if (favIndex !== -1) {
            favoriteChannels.splice(favIndex, 1);
            groupedFavoriteChannels = groupChannels(favoriteChannels);
        }
        await idbDeleteFavorite(key);
        favoriteKeys.delete(key);

        starElement.classList.add('inactive');
        starElement.title = 'Aggiungi ai preferiti';
    } else {
        // Aggiunta ai preferiti (controllo difensivo contro doppio click)
        if (!isFavorite(channel)) {
            const favChannel = { ...channel };
            favoriteChannels.push(favChannel);
            groupedFavoriteChannels = groupChannels(favoriteChannels);

            // L'order in coda preserva l'ordine cronologico di aggiunta
            const order = favoriteChannels.length - 1;
            await idbPutFavorite({
                key,
                name: favChannel.name,
                url: favChannel.url,
                group: favChannel.group || 'Favorites',
                logo: favChannel.logo || '',
                type: favChannel.type || 'channel',
                order
            });
            favoriteKeys.add(key);

            starElement.classList.remove('inactive');
            starElement.title = 'Rimuovi dai preferiti';
        }
    }

    rebuildIndexMaps();

    // Se siamo nella vista preferiti e stiamo rimuovendo, aggiorna la UI
    // nascondendo la riga appena rimossa e, se il gruppo resta vuoto,
    // nascondendo anche l'header del gruppo.
    if (showingFavorites) {
        const channelElement = starElement.closest('.channel-item');
        if (wasFavorite) {
            channelElement.style.display = 'none';

            const groupContent = channelElement.closest('.group-content');
            const hasVisibleChannels = [...groupContent.children].some(el =>
                el.style.display !== 'none'
            );

            if (!hasVisibleChannels) {
                groupContent.style.display = 'none';
                groupContent.previousElementSibling.style.display = 'none';
            }
        }
    }

    updateButtons();
}


/**
 * Verifica se un canale è nei preferiti.
 *
 * Accetta sia un oggetto canale che una stringa URL. Nel caso stringa,
 * cerca prima il canale in channelUrlMap per ricavarne la chiave.
 *
 * L'uso del Set favoriteKeys rende l'operazione O(1): è il motivo per cui
 * questa funzione può essere chiamata in loop nel rendering senza
 * degradare le prestazioni.
 *
 * @param {Object|string} channel  canale oppure URL
 * @returns {boolean}
 */
function isFavorite(channel) {
    if (!channel) return false;
    let key;
    if (typeof channel === 'string') {
        const ch = channelUrlMap.get(channel);
        if (!ch) return false;
        key = getChannelKey(ch);
    } else {
        key = getChannelKey(channel);
    }
    // [FIX 2c] Lookup immediato nel Set (stessa idea della tua versione). In più: se Set e array
    // dei preferiti risultassero fuori sincronia (dimensioni diverse) il Set viene ricostruito
    // una volta sola, invece di dare risposte sbagliate fino al riavvio.
    if (favoriteKeys.size !== favoriteChannels.length) {
        favoriteKeys.clear();
        favoriteChannels.forEach(fav => favoriteKeys.add(getChannelKey(fav)));
    }
    return favoriteKeys.has(key);
}


/**
 * Carica i preferiti da IndexedDB in memoria. Chiamata una volta in fase
 * di initializeApp, e di nuovo ogni volta che i preferiti vengono
 * ricreati da zero (es. dopo un reset).
 *
 * Dopo il caricamento:
 *   - favoriteChannels contiene i preferiti in ordine;
 *   - favoriteKeys contiene le chiavi dei preferiti;
 *   - groupedFavoriteChannels contiene la versione raggruppata;
 *   - le mappe di indice vengono ricostruite.
 */
async function loadFavorites() {
  const rows = await idbGetAllFavorites();

  // L'ordinamento è per 'order', che è la posizione cronologica di aggiunta
  rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  favoriteChannels = rows.map(r => ({
    name: r.name,
    url: r.url,
    group: r.group || 'Favorites',
    logo: r.logo || '',
    type: r.type || 'channel'
  }));

  favoriteKeys.clear();
  favoriteChannels.forEach(ch => favoriteKeys.add(getChannelKey(ch)));

  groupedFavoriteChannels = groupChannels(favoriteChannels);
  rebuildIndexMaps();
}


/**
 * Crea e appende la stella dei preferiti a una tile canale.
 *
 * Mostrata solo nel contesto 'channels' (compresa la vista Preferiti):
 * playlist ed EPG non hanno una stella perché non sono canali.
 *
 * La stella chiama toggleFavorite() al click con stopPropagation, così
 * cliccare sulla stella non attiva anche il play del canale.
 *
 * @param {Object} channel            canale
 * @param {HTMLElement} item          tile .channel-item a cui appendere la stella
 * @param {Object} [options]
 * @param {string} [options.context]  'channels' | 'playlists' | 'epg';
 *                                    se omesso, viene dedotto dai flag
 *                                    window.isEPGView / window.isPlaylistView.
 */
function addFavoriteStar(channel, item, options = {}) {
  const context = options && options.context
    ? options.context
    : ((!window.isEPGView && !window.isPlaylistView) ? 'channels' : (window.isEPGView ? 'epg' : 'playlists'));

  if (context !== 'channels') return;

  // Evita doppioni se la funzione viene chiamata due volte sulla stessa tile
  if (item.querySelector && item.querySelector('.favorite-star')) return;

  const isFav = isFavorite(channel);

  const star = document.createElement('span');
  star.className = `favorite-star ${isFav ? '' : 'inactive'}`;
  star.innerHTML = '★';
  star.title = isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti';

  star.onclick = (e) => {
    e.stopPropagation();
    toggleFavorite(channel, star);
  };
  item.appendChild(star);
}


// ============================================================================
// 20. LAZY LOADING IMMAGINI
// ============================================================================
//
// Tutte le liste che mostrano immagini (loghi canali, poster EPG, loghi
// playlist) usano un unico IntersectionObserver condiviso per caricare
// le immagini solo quando stanno per entrare nel viewport.
//
// Due pattern supportati:
//   - <img data-src="URL">   -> al primo ingresso, src = data-src
//   - <div data-bg-src="URL">-> al primo ingresso, background-image = URL
//
// Il rootMargin di 300px anticipa il caricamento in modo che l'immagine
// sia già pronta quando l'utente ci arriva scrollando.


/**
 * Restituisce l'observer condiviso, creandolo alla prima chiamata.
 * Il callback gestisce sia le img data-src che i div data-bg-src e
 * sgancia automaticamente l'elemento dopo il caricamento (one-shot).
 *
 * @returns {IntersectionObserver}
 */
function getSharedObserver() {
    if (!sharedChannelObserver) {
        sharedChannelObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const target = entry.target;
                    if (target.tagName === 'IMG' && target.dataset.src) {
                        target.src = target.dataset.src;
                        target.removeAttribute('data-src');
                        obs.unobserve(target);
                    } else if (target.dataset && target.dataset.bgSrc) {
                        target.style.backgroundImage = `url("${target.dataset.bgSrc}")`;
                        target.removeAttribute('data-bg-src');
                        obs.unobserve(target);
                    }
                }
            });
        }, { rootMargin: '300px 0px', threshold: 0.01 });
    }
    return sharedChannelObserver;
}


/**
 * Sgancia dall'observer condiviso SOLO le immagini di un container
 * specifico. Va chiamata prima di svuotare un container con innerHTML=''
 * per rilasciare i riferimenti ai nodi DOM in uscita senza toccare le
 * immagini di altre liste ancora vive (es. canali vs guida EPG).
 *
 * Non disconnette l'observer (che è condiviso da tutte le liste): si
 * limita a chiamare unobserve() su ciascun elemento tracciato.
 *
 * @param {HTMLElement} container
 */
function unobserveContainerImages(container) {
    if (!sharedChannelObserver || !container) return;
    container.querySelectorAll('img[data-src], [data-bg-src]').forEach(el => {
        sharedChannelObserver.unobserve(el);
    });
}


// ============================================================================
// 21. SWITCH TRA VISTE PRINCIPALI
// ============================================================================
//
// L'app ha tre "viste" di primo livello, ciascuna con il suo container:
//   - channels:  #channelListContainer   (lista canali, default)
//   - epgManager:#epgListContainer       (lista degli EPG salvati)
//   - fullEpg:   #fullEpgContainer       (guida programmi completa)
//   - playlists: #playlistListContainer  (lista delle playlist salvate)
//
// switchToView nasconde/mostra i container giusti per la vista richiesta.
// Le playlist usano un percorso separato (renderPlaylistList imposta
// direttamente la visibilità) e non passano da switchToView.

const VIEW_CONTAINERS = {
  epgManager: {
    show: ['epgListContainer'],
    hide: ['channelListContainer', 'playlistListContainer', 'fullEpgContainer']
  },
  fullEpg: {
    show: ['fullEpgContainer'],
    hide: ['channelListContainer', 'playerContainer', 'playlistListContainer', 'epgListContainer']
  }
};

/**
 * Mostra la vista richiesta e nasconde le altre, aggiornando le classi
 * 'hidden' sui container. Non tocca la logica dei pulsanti (che hanno i
 * loro listener specifici) né lo stato globale: chi chiama deve già sapere
 * in quale vista si sta spostando.
 *
 * @param {'epgManager'|'fullEpg'} viewName
 */
function switchToView(viewName) {
  const cfg = VIEW_CONTAINERS[viewName];
  if (!cfg) {
    console.warn(`switchToView: vista "${viewName}" non definita`);
    return;
  }
  cfg.hide.forEach(id => document.getElementById(id)?.classList.add('hidden'));
  cfg.show.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
}

// ============================================================================
// 22. RENDERER GENERICO PER LISTE "SALVATE" (PLAYLIST, EPG MANAGER)
// ============================================================================
//
// Disegna una lista di gruppi/tile in un container, senza sapere cosa sta
// disegnando. Tutto il comportamento specifico (cosa fare al click, quali
// azioni mostrare su ogni riga, come formattare la riga di info sotto il
// nome) arriva dal parametro `config`.
//
// Viene usata da:
//   - renderEPGManager()  -> lista degli EPG salvati
//   - renderPlaylistList()-> lista delle playlist salvate
//
// Non viene usata dalla lista canali né dalla lista preferiti: quelle
// passano da renderGroupedChannelList, che ha esigenze diverse (drag &
// drop, stelle, contesto griglia).
//
// Struttura del parametro `config`:
//   emptyCheck:  (groups) => bool
//                ritorna true quando la lista va considerata vuota anche
//                se contiene l'header "Aggiungi ...". Usato per capire se
//                disegnare lo stato vuoto invece dell'unica riga speciale.
//   emptyState:  { image, alt, onClick }
//                contenuto dello stato vuoto: immagine, alt, e cosa fare
//                al click sull'immagine (aprire il bottom sheet).
//   onItemClick: (itemData, itemEl) => void
//                handler di click sulla riga.
//   itemActions: (itemData) => [{ icon, title, className, onClick }]
//                azioni da appendere a destra di ogni riga (ricarica,
//                elimina, ecc.). `deletionModeGated: true` fa sì che
//                l'icona nasca visibile se siamo già in modalità
//                cancellazione (così dopo un delete la nuova lista
//                non torna in modalità normale).
//   buildInfoLine: (itemData) => string|null
//                testo della seconda riga (sotto il nome). null = niente.
//   onComplete:  () => void
//                chiamata quando il rendering è FINITO davvero, anche se
//                suddiviso in più chunk asincroni. È l'aggancio giusto
//                per salvare la fingerprint del render (evita di
//                ridisegnare la stessa lista due volte).
// ============================================================================

function renderSavedItemsList(containerEl, groups, config = {}) {
  if (!containerEl) return;

  // Prima di svuotare, sgancia le immagini dall'observer condiviso
  unobserveContainerImages(containerEl);

  requestAnimationFrame(() => {
    containerEl.style.opacity = '0';
    containerEl.style.pointerEvents = 'none';
    containerEl.innerHTML = '';
    containerEl.className = 'view-list';

    const currentGroups = groups || [];
    const isEmpty = !currentGroups.length || (config.emptyCheck && config.emptyCheck(currentGroups));

    // ---- Stato vuoto (nessuna playlist/EPG salvata) ----
    if (isEmpty) {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.justifyContent = 'center';
      wrapper.style.alignItems = 'center';
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      wrapper.style.minHeight = '200px';

      const img = document.createElement('img');
      const es = config.emptyState || {};
      img.src = es.image || 'nochannel.svg';
      img.alt = es.alt || '';
      img.style.height = 'auto';
      img.style.maxHeight = '50vh';
      img.style.cursor = es.onClick ? 'pointer' : 'default';
      if (es.onClick) img.onclick = es.onClick;

      wrapper.appendChild(img);
      containerEl.appendChild(wrapper);
      containerEl.style.opacity = '1';
      containerEl.style.pointerEvents = 'auto';
      if (config.onComplete) config.onComplete();
      return;
    }

    // ---- Helper: crea la singola riga ----
    const createItem = (itemData, groupIndex) => {
      const item = document.createElement('div');
      item.className = 'channel-item list';
      if (itemData.url) item.dataset.url = itemData.url;
      if (itemData.name) item.dataset.name = itemData.name.toLowerCase();
      if (itemData.__epgId) item.dataset.epgId = itemData.__epgId;
      item.dataset.groupIndex = groupIndex;

      // Logo (lazy via observer condiviso)
      const img = document.createElement('img');
      img.className = 'channel-logo';
      img.dataset.src = itemData.logo || 'tasto-icon.png';
      img.style.backgroundColor = 'var(--epg-poster-bg)';
      getSharedObserver().observe(img);
      item.appendChild(img);

      // Nome + eventuale riga di info sotto
      const nameContainer = document.createElement('div');
      nameContainer.style.cssText = 'flex: 1; min-width: 0;';
      const name = document.createElement('div');
      name.className = 'channel-name list-name';
      name.textContent = itemData.name || 'Senza nome';
      nameContainer.appendChild(name);

      const infoText = config.buildInfoLine ? config.buildInfoLine(itemData) : null;
      if (infoText) {
        const infoLine = document.createElement('div');
        infoLine.className = 'current-program';
        infoLine.textContent = infoText;
        nameContainer.appendChild(infoLine);
      }
      item.appendChild(nameContainer);

      // Azioni di riga (ricarica, elimina, ecc.)
      if (config.itemActions) {
        config.itemActions(itemData).forEach(action => {
          const iconEl = document.createElement('span');
          iconEl.className = action.className || 'item-action';

          // Se siamo già in modalità cancellazione, l'icona gated nasce
          // già visibile: evita che dopo un delete la lista torni in
          // modalità normale mentre l'utente sta ancora cancellando.
          if (action.deletionModeGated && typeof deletionMode !== 'undefined' && deletionMode) {
            iconEl.classList.add('visible');
          }

          iconEl.innerHTML = action.icon;
          if (action.title) iconEl.title = action.title;
          iconEl.addEventListener('click', (e) => {
            e.stopPropagation();
            action.onClick(itemData, item, iconEl);
          });
          item.appendChild(iconEl);
        });
      }

      if (itemData.__isActive) item.classList.add('active-channel');

      if (config.onItemClick) {
        item.addEventListener('click', () => config.onItemClick(itemData, item));
      }

      return item;
    };

    // ---- Costruzione del fragment in memoria ----
    const masterFragment = document.createDocumentFragment();
    currentGroups.forEach((group, groupIndex) => {
      if (!group.channels || group.channels.length === 0) return;

      const groupHeader = document.createElement('div');
      groupHeader.className = 'group-header';
      groupHeader.dataset.groupIndex = groupIndex;

      const groupTitle = document.createElement('div');
      groupTitle.className = 'group-title';
      const groupName = document.createElement('span');
      groupName.className = 'group-name';
      groupName.textContent = group.name;
      const groupCount = document.createElement('span');
      groupCount.className = 'group-channel-count';
      groupCount.textContent = group.channels.length;
      groupTitle.appendChild(groupName);
      groupTitle.appendChild(groupCount);
      groupHeader.appendChild(groupTitle);

      const groupContent = document.createElement('div');
      groupContent.className = 'group-content list-view';

      const groupFragment = document.createDocumentFragment();
      group.channels.forEach(ch => groupFragment.appendChild(createItem(ch, groupIndex)));
      groupContent.appendChild(groupFragment);

      masterFragment.appendChild(groupHeader);
      masterFragment.appendChild(groupContent);
    });

    // ---- Rendering a blocchi ----
    // Il chunking riduce il tempo di blocco del thread su liste molto
    // lunghe (decine o centinaia di righe). Il budget è di ~10 ms per
    // chunk, con un minimo di nodi per evitare chunk troppo frammentati.
    const allNodes = Array.from(masterFragment.childNodes);
    let currentPos = 0;
    const DYNAMIC_CHUNK_MIN = Math.max(30, Math.ceil(allNodes.length / 10));

    function renderChunk() {
      const startTime = performance.now();
      const chunkFragment = document.createDocumentFragment();
      while (currentPos < allNodes.length) {
        chunkFragment.appendChild(allNodes[currentPos]);
        currentPos++;
        if (currentPos % 10 === 0) {
          const elapsed = performance.now() - startTime;
          if (elapsed > 10 && currentPos > DYNAMIC_CHUNK_MIN) break;
        }
      }
      containerEl.appendChild(chunkFragment);
      if (currentPos > 10) {
        containerEl.style.opacity = '0.7';
        containerEl.style.pointerEvents = 'auto';
      }
      if (currentPos < allNodes.length) {
        requestAnimationFrame(renderChunk);
      } else {
        containerEl.style.opacity = '1';
        containerEl.style.pointerEvents = 'auto';
        if (config.onComplete) config.onComplete();
      }
    }
    renderChunk();
  });
}


// ============================================================================
// 23. VISTA PLAYLIST MANAGER
// ============================================================================

/**
 * Disegna la vista "Playlist salvate".
 *
 * Cosa fa:
 *   1. Imposta lo stato globale (isPlaylistView, isEPGView, showingFavorites);
 *   2. mostra il container delle playlist e nasconde canali ed EPG;
 *   3. legge dal DB la lista delle playlist e quella attiva;
 *   4. se la lista è già disegnata e non c'è un reload forzato, aggiorna
 *      solo l'evidenziazione della playlist attiva (evita un flash inutile
 *      quando si esce e si rientra dal manager);
 *   5. altrimenti disegna la lista con renderGroupedChannelList in
 *      contesto 'playlists' e, dopo il rendering, aggancia i click handler
 *      specifici per playlist.
 *
 * Il flag `window.forcePlaylistReload` viene consumato (messo a false)
 * all'inizio della funzione per non forzare un secondo reload al
 * prossimo ingresso.
 */
async function renderPlaylistList() {
    // ── Stato di vista ──
    showingFavorites = false;
    if (typeof updateToggleState === 'function') updateToggleState();
    if (typeof saveViewModePreference === 'function') saveViewModePreference(currentViewMode);

    window.isPlaylistView = true;
    window.isEPGView = false;

    const playlistListCont = document.getElementById('playlistListContainer');
    const playlistList = document.getElementById('playlistList');
    const channelListCont = document.getElementById('channelListContainer');
    const epgListCont = document.getElementById('epgListContainer');

    if (channelListCont) channelListCont.classList.add('hidden');
    if (epgListCont) epgListCont.classList.add('hidden');
    if (playlistListCont) playlistListCont.classList.remove('hidden');

    if (playlistList) {
        playlistList.style.transition = 'opacity 0.2s ease-in-out';
        playlistList.style.opacity = '0';
        playlistList.style.pointerEvents = 'none';
    }

    // ── Lettura stato dal DB ──
    const playlists = await getAllM3UUrls();
    const activePlaylist = await getActivePlaylist();

    // ── Percorso rapido: lista già disegnata, aggiorno solo l'evidenziazione ──
    // Se la lista ha già figli e non è stato richiesto un reload forzato,
    // saltiamo l'intera ricostruzione del DOM e ci limitiamo a spostare la
    // classe .active-channel sulla playlist giusta.
    if (playlistList && playlistList.children.length > 0 && !window.forcePlaylistReload) {
        console.log("Vista playlist già presente, aggiorno solo l'evidenziazione.");

        playlistList.style.opacity = '1';
        playlistList.style.pointerEvents = 'auto';

        playlistList.querySelectorAll('.channel-item').forEach(item => {
            const plId = item.getAttribute('data-playlist-id');
            item.classList.remove('active-channel');
            if (activePlaylist && plId === String(activePlaylist.id)) {
                item.classList.add('active-channel');
            }
        });

        window.forcePlaylistReload = false;
        return;
    }

    // Consuma il flag per non forzare un altro reload al prossimo ingresso
    window.forcePlaylistReload = false;

    // ── Preparazione dei gruppi ──
    // Gruppo 1: riga "Aggiungi Playlist" (speciale, bordo tratteggiato)
    // Gruppo 2: playlist salvate, mappate dal record DB al def di render
    const localGroup = {
        name: "Aggiungi",
        channels: [
            {
                name: "Aggiungi Playlist",
                logo: "",
                url: "#url",
                __special: true
            }
        ]
    };

    const savedGroup = {
        name: "Playlist Salvate",
        channels: (playlists || []).map(pl => ({
            name: pl.name || 'Playlist senza nome',
            logo: "tasto9-2.svg",
            url: pl.url,
            __playlistId: pl.id,
            __raw: pl,
            __isActive: activePlaylist && pl.id === activePlaylist.id
        }))
    };

    const groups = [localGroup, savedGroup];

    // ── Rendering fisico ──
    renderGroupedChannelList(groups, {
        targetContainer: 'playlistList',
        context: 'playlists'
    });

    // ── Post-processing: click handler specifici delle playlist ──
    // Il rendering è asincrono (chunking via rAF): setTimeout(50) dà il
    // tempo di costruire il DOM prima di andare a toccare le tile.
    setTimeout(() => {
        const list = document.getElementById('playlistList');
        if (!list) return;

        list.querySelectorAll('.channel-item').forEach(item => {
            const url = item.getAttribute('data-url');
            const def = groups
                .flatMap(g => g.channels)
                .find(c => c.url === url || (c.__special && (url === '#local' || url === '#url')));

            if (!def) return;

            // data-playlist-id serve al percorso rapido di sopra
            if (def.__playlistId) {
                item.setAttribute('data-playlist-id', def.__playlistId);
            }

            item.classList.remove('active-channel');
            if (def.__isActive) item.classList.add('active-channel');

            // Pulizia attributi non significativi per le playlist
            item.removeAttribute('draggable');
            item.removeAttribute('data-key');
            item.removeAttribute('data-group-index');

            // --- Riga "Aggiungi Playlist" ---
            if (def.__special && url === "#url") {
                item.onclick = () => {
                    if (typeof openBottomSheet === 'function') openBottomSheet();
                };
            }
            // --- Playlist salvata ---
            else if (def.__playlistId) {
                item.onclick = async () => {
                    try {
                        // Se è già la playlist attiva, cambio solo vista
                        const currentActive = await getActivePlaylist();
                        if (currentActive && currentActive.id === def.__playlistId) {
                            window.isPlaylistView = false;
                            if (typeof showChannelList === 'function') await showChannelList();
                            return;
                        }

                        // Altrimenti: evidenzia subito la nuova playlist,
                        // poi scarica (se serve) e attiva.
                        document.getElementById('playlistList')?.querySelectorAll('.channel-item.active-channel')
                            .forEach(el => el.classList.remove('active-channel'));
                        item.classList.add('active-channel');

                        const channelList = document.getElementById('channelList');
                        if (channelList) channelList.innerHTML = ""; // forza rigenerazione canali

                        // suppressPlaylistRefresh evita che refreshPlaylistUIs()
                        // richiami questo stesso handler in loop durante il parse.
                        window.suppressPlaylistRefresh = true;
                        const rec = await getM3UById(def.__playlistId);
                        let text = rec?.content;

                        if (!text && rec?.url) {
                            if (typeof showNotification === 'function') showNotification("Scaricamento canali...");
                            text = await downloadM3U(rec.url);
                            // [FIX 2b] Prima il record veniva aggiornato anche con text = null, azzerando il contenuto.
                            // Ora si salva solo se il download è una playlist valida.
                            if (isValidM3UText(text)) {
                                await updateM3URecord(rec.id, { content: text, lastFetched: Date.now() });
                            } else {
                                text = null;
                            }
                        }

                        if (!text) throw new Error("Playlist non disponibile");

                        await setOnlyActive(rec.id);
                        await parseM3U(text, false);

                        if (typeof updateButtons === 'function') updateButtons();
                        window.isPlaylistView = false;

                        if (typeof showChannelList === 'function') await showChannelList();

                    } catch (err) {
                        console.error('Errore click playlist:', err);
                    } finally {
                        window.suppressPlaylistRefresh = false;
                        if (typeof refreshPlaylistUIs === 'function') refreshPlaylistUIs();
                    }
                };
            }

            // --- Eliminazione playlist ---
            const del = item.querySelector('.delete-channel') || item.querySelector('.delete-url-btn');
            if (del) {
                del.onclick = async (e) => {
                    e.stopPropagation();
                    if (!confirm('Eliminare questa playlist?')) return;
                    try {
                        await deleteM3UUrl(def.__playlistId);
                        // Se ho cancellato la playlist attiva, devo promuovere
                        // la prima rimasta e attivarla; se non ne restano,
                        // svuoto la lista canali.
                        if (def.__isActive) {
                            const remaining = await getAllM3UUrls();
                            if (remaining.length > 0) {
                                await setOnlyActive(remaining[0].id);
                                const rec = await getM3UById(remaining[0].id);
                                if (rec?.content) await parseM3U(rec.content, true);
                            } else {
                                channels = [];
                                groupedChannels = [];
                                const cl = document.getElementById('channelList');
                                if (cl) cl.innerHTML = "";
                            }
                        }
                        window.forcePlaylistReload = true;
                        await renderPlaylistList();
                        if (typeof refreshPlaylistUIs === 'function') refreshPlaylistUIs();
                    } catch (err) { console.error(err); }
                };
            }

            // --- Riga di info (conteggio canali/gruppi oppure URL) ---
            if (!def.__special) {
                const infoContainer = item.querySelector('.channel-name')?.parentElement || item.children[1];
                if (infoContainer && !infoContainer.querySelector('.current-program')) {
                    const infoLine = document.createElement('div');
                    infoLine.className = 'current-program';
                    const showUrl = localStorage.getItem("zappone_show_playlist_url") === "true";

                    if (showUrl && def.url) {
                        infoLine.textContent = def.url;
                    } else if (def.__raw?.content) {
                        try {
                            const { channelCount, groupCount } = countChannelsAndGroups(def.__raw.content);
                            infoLine.textContent = `${channelCount} canali, ${groupCount} gruppi`;
                        } catch (e) { infoLine.textContent = "Analisi canali..."; }
                    }
                    infoContainer.appendChild(infoLine);
                }
            }
        });
    }, 50);
}


// ============================================================================
// 24. TOKEN DI RENDER PER-CONTAINER
// ============================================================================
//
// Ogni chiamata a renderGroupedChannelList assegna un token crescente al
// container su cui sta disegnando. Tutti i passi successivi (rAF iniziale,
// i chunk, la finalizzazione) verificano di essere ancora il render più
// recente prima di toccare il DOM.
//
// Motivo: parseM3U lancia un render via rAF, e subito dopo il chiamante
// (loadRemoteM3U, sidebar, ecc.) chiama showChannelList() che ne lancia
// un altro. Senza token, due sequenze di rendering sullo stesso container
// si sovrascriverebbero il DOM a vicenda (una fa innerHTML='' mentre
// l'altra sta ancora appendendo i suoi chunk), corrompendo anche
// channels / channelIndexMap nella sincronizzazione finale.
//
// Con il token, solo il render più recente per ciascun container porta a
// termine il lavoro; tutte le sequenze superate escono subito ai
// checkpoint senza toccare nulla.
// ============================================================================
const _renderTokens = new Map();


// ============================================================================
// 25. RENDERER PRINCIPALE — LISTA CANALI / PREFERITI / ALTRI CONTESTI
// ============================================================================
//
// È il renderer "di serie" per ogni lista che debba mostrare gruppi e
// canali. Rispetto a renderSavedItemsList, gestisce in più:
//   - contesto griglia Apple TV (solo per context 'channels');
//   - stelle preferiti;
//   - drag & drop di canali e gruppi (solo context 'channels');
//   - stato attivo (active-channel) sincronizzato con window.currentChannelUrl;
//   - collasso/espansione dei gruppi con stato persistito.
//
// Il parametro `context` è la chiave che seleziona il comportamento:
//   'channels'   -> lista canali / preferiti (griglia + stelle + drag & drop)
//   'playlists'  -> lista playlist (grid mai, niente stelle, niente drag)
//   'epg'        -> lista EPG manager (idem)
//
// Il rendering è suddiviso in chunk per singolo canale: ogni chunk ha un
// budget di tempo (TIME_BUDGET_MS = 8 ms), dopodiché cede il controllo al
// browser con un requestAnimationFrame e riprende dal punto in cui era.
// ============================================================================

function renderGroupedChannelList(groups, options = {}) {

    const targetContainer = options.targetContainer || 'channelList';
    const targetElement = document.getElementById(targetContainer);

    if (!targetElement) {
        console.error(`Container ${targetContainer} non trovato`);
        return;
    }

    const context = options && options.context ? options.context : 'channels';

    // La griglia è consentita SOLO nella lista canali. Playlist, EPG manager
    // e Full EPG sono sempre in list-view: la preferenza utente
    // (currentViewMode) si applica esclusivamente a context === 'channels'.
    const effectiveViewMode = (context === 'channels') ? currentViewMode : 'list';

    targetElement.setAttribute('data-context', context);
    targetElement.setAttribute('data-view-mode', context === 'channels' ? (showingFavorites ? 'favorites' : 'all') : context);

    let currentGroups;
    if (context === 'channels') {
        currentGroups = showingFavorites ? groupedFavoriteChannels : groups;
    } else {
        currentGroups = groups || [];
    }

    // -----------------------------------------------------------------
    // TOKEN DEL RENDER
    // -----------------------------------------------------------------
    // Assegna un token univoco per questo render sul container. Ogni
    // checkpoint successivo verifica di essere ancora il render più recente
    // prima di toccare il DOM o lo stato globale.
    const myToken = (_renderTokens.get(targetContainer) || 0) + 1;
    _renderTokens.set(targetContainer, myToken);
    const isCurrentRender = () => _renderTokens.get(targetContainer) === myToken;

    // Sgancia SOLO le immagini di QUESTO container dall'observer condiviso,
    // lasciando intatte quelle delle altre liste (es. guida EPG).
    unobserveContainerImages(targetElement);

    requestAnimationFrame(() => {
        // Checkpoint 1: se un render più recente ha già preso il controllo
        // di questo container, esci senza toccare nulla.
        if (!isCurrentRender()) return;

        const isGridView = effectiveViewMode === 'grid';
        const viewModeClass = 'view-' + effectiveViewMode;

        // Pulizia iniziale (invisibile per l'utente finché non è pronto)
        targetElement.style.opacity = '0';
        targetElement.style.pointerEvents = 'none';
        targetElement.innerHTML = '';
        targetElement.className = viewModeClass;

        // Ottieni un nuovo observer (dopo lo svuotamento)
        const lazyObserver = getSharedObserver();

        // ---- Gestione lista vuota -----------------------------------
        if (!currentGroups || currentGroups.length === 0 ||
            (context === 'playlists'
                ? (currentGroups.length === 2 && currentGroups[1].channels.length === 0)
                : context === 'epg'
                    ? (currentGroups.length >= 2 && currentGroups[1].channels.length === 0)
                    : (currentGroups.length === 1 && currentGroups[0].channels.length === 0)
            )
        ) {
            // Container flex per centrare l'immagine sia orizzontalmente
            // sia verticalmente.
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'center';
            wrapper.style.alignItems = 'center';
            wrapper.style.width = '100%';
            wrapper.style.height = '100%';
            wrapper.style.minHeight = '200px';

            const img = document.createElement('img');

            if (context === 'channels') {
                img.src = showingFavorites ? "nopref.svg" : "nochannel.svg";
                img.className = showingFavorites ? "no-favorites" : "no-channels";
                img.alt = 'Nessun canale disponibile';
            } else if (context === 'playlists') {
                img.src = "noplaylist.svg";
                img.className = "no-playlists";
                img.alt = 'Carica una playlist';
            } else if (context === 'epg') {
                img.src = "noepg.svg";
                img.className = "no-epg";
                img.alt = 'Carica EPG';
            }

            img.style.height = 'auto';
            img.style.maxHeight = '50vh';
            img.style.cursor = 'pointer';

            // Per playlist/EPG, cliccare lo stato vuoto apre il bottom sheet
            if (context === 'playlists') {
                img.onclick = () => {
                    const firstSpecial = currentGroups[0]?.channels[0];
                    if (firstSpecial && firstSpecial.__special && firstSpecial.url === "#url") {
                        if (typeof openBottomSheet === 'function') openBottomSheet();
                    }
                };
            }

            if (context === 'epg') {
                img.onclick = () => {
                    const firstSpecial = currentGroups[0]?.channels[0];
                    if (firstSpecial && firstSpecial.__special && firstSpecial.url === "#url") {
                        if (typeof openEPGBottomSheet === 'function') openEPGBottomSheet();
                    }
                };
            }

            wrapper.appendChild(img);
            targetElement.appendChild(wrapper);

            targetElement.style.opacity = '1';
            targetElement.style.pointerEvents = 'auto';
            return;
        }

        // ---- Helper interno: crea la singola tile ----
        //
        // Restituisce una tile pronta da appendere. Il comportamento
        // dipende da context ed effectiveViewMode: vedi commenti sotto.
        const createChannelItem = (channel, groupIndex, isFavoriteList) => {
            const isGridView = effectiveViewMode === 'grid';
            const isChannelList = context === 'channels';

            // =========================================================
            // Percorso 1: griglia Apple TV (solo lista canali)
            // =========================================================
            // Tile 16:9 con poster del programma corrente o logo canale
            // come sfondo, e un overlay con nome canale + titolo
            // programma + barra di avanzamento.
            if (isChannelList && isGridView) {
                const item = document.createElement('div');

                item.className = `channel-item ${effectiveViewMode}`;
                if (channel.url) item.dataset.url = channel.url;
                if (channel.name) item.dataset.name = channel.name.toLowerCase();
                if (typeof getChannelKey === 'function') {
                    item.dataset.key = getChannelKey(channel);
                } else {
                    item.dataset.key = `${channel.name || 'item'}_${channel.url || 'no-url'}`;
                }
                item.dataset.groupIndex = groupIndex;
                item.dataset.isFavorite = isFavoriteList || 'false';
                item.draggable = true;
                item.onclick = () => playStream(channel, isFavoriteList);

                // Sfondo: poster del programma corrente se disponibile,
                // altrimenti logo del canale.
                const program = getCurrentProgramFull(channel);
                const hasPoster = program && program.poster;
                const backgroundUrl = hasPoster ? program.poster : (channel.logo || 'tasto-icon.png');

                item.dataset.bgSrc = backgroundUrl;
                item.dataset.bgType = hasPoster ? 'poster' : 'logo';
                item.style.backgroundColor = 'var(--epg-poster-bg)';

                const overlay = document.createElement('div');
                overlay.className = 'grid-overlay';

                const channelNameSpan = document.createElement('div');
                channelNameSpan.className = 'grid-channel-name';
                channelNameSpan.textContent = channel.name || 'Senza nome';

                const programSpan = document.createElement('div');
                programSpan.className = 'grid-program-title';
                programSpan.textContent = program ? program.title : '';

                overlay.appendChild(channelNameSpan);
                overlay.appendChild(programSpan);

                // Barra di avanzamento del programma corrente
                if (program && program.start && program.end) {
                    const progressContainer = document.createElement('div');
                    progressContainer.className = 'grid-progress-bar';

                    const progressFill = document.createElement('div');
                    progressFill.className = 'grid-progress-fill';
                    const progress = getProgramProgress(program.start, program.end);
                    progressFill.style.width = `${progress}%`;

                    progressContainer.appendChild(progressFill);
                    overlay.appendChild(progressContainer);
                }

                item.appendChild(overlay);

                // Lazy load dello sfondo: data-bg-src -> background-image
                const lazyObserver = getSharedObserver();
                lazyObserver.observe(item);

                if (window.currentChannelUrl && item.dataset.key === window.currentChannelUrl) {
                    item.classList.add('active-channel');
                }

                return item;
            }

            // =========================================================
            // Percorso 2: lista standard (canali, preferiti, playlist, EPG)
            // =========================================================
            const item = document.createElement('div');
            item.className = `channel-item ${effectiveViewMode}`;
            item.draggable = context === 'channels';
            if (channel.url) item.dataset.url = channel.url;
            if (channel.name) item.dataset.name = channel.name.toLowerCase();
            if (typeof getChannelKey === 'function') {
                item.dataset.key = getChannelKey(channel);
            } else {
                item.dataset.key = `${channel.name || 'item'}_${channel.url || 'no-url'}`;
            }
            item.dataset.groupIndex = groupIndex;
            item.dataset.isFavorite = isFavoriteList || 'false';

            if (context === 'channels') {
                item.onclick = () => playStream(channel, isFavoriteList);
            }

            const img = document.createElement('img');
            img.className = 'channel-logo';
            img.dataset.src = channel.logo || 'tasto-icon.png';
            img.style.backgroundColor = 'var(--epg-poster-bg)';
            const lazyObserver = getSharedObserver();
            lazyObserver.observe(img);
            item.appendChild(img);

            const nameContainer = document.createElement('div');
            nameContainer.style.cssText = 'flex: 1; min-width: 0;';

            const name = document.createElement('div');
            name.className = `channel-name ${isGridView ? 'grid-name' : 'list-name'}`;
            name.textContent = channel.name || 'Senza nome';
            nameContainer.appendChild(name);

            // Riga "programma in corso" sotto al nome, se disponibile
            if (!isGridView && context === 'channels' && typeof hasEPG === 'function' && hasEPG(channel)) {
                const programInfo = typeof getCurrentProgramInfo === 'function' ? getCurrentProgramInfo(channel) : null;
                if (programInfo) {
                    const programElement = document.createElement('div');
                    programElement.className = 'current-program';
                    programElement.textContent = programInfo.title;
                    nameContainer.appendChild(programElement);
                }
            }
            item.appendChild(nameContainer);

            if (context === 'channels' && typeof addFavoriteStar === 'function') {
                addFavoriteStar(channel, item, { context });
            }

            // Cestino: visibile solo in modalità cancellazione
            if (!channel.__special) {
                const deleteBtn = document.createElement('span');
                deleteBtn.className = 'delete-channel';
                deleteBtn.textContent = '🗑️';
                if (!isGridView && (typeof deletionMode !== 'undefined' && deletionMode)) {
                    deleteBtn.classList.add('visible');
                }
                deleteBtn.onclick = e => {
                    e.stopPropagation();
                    if (context === 'channels' && !deletionMode) return;
                    if (confirm('Eliminare questo elemento?')) {
                        if (context === 'channels') deleteChannel(channel, isFavoriteList);
                    }
                };
                item.appendChild(deleteBtn);
            }

            if (context === 'channels' && window.currentChannelUrl && item.dataset.key === window.currentChannelUrl) {
                item.classList.add('active-channel');
            }

            return item;
        };

        // =============================================================
        // CHUNKING PER SINGOLO CANALE
        // =============================================================
        // Il rendering di un gruppo avviene in due fasi:
        //   1. l'header + il content del gruppo vengono creati e appesi
        //      una sola volta, appena si inizia quel gruppo;
        //   2. i canali del gruppo vengono creati uno alla volta dentro
        //      il content, rispettando il budget di tempo per chunk.
        //
        // Questo elimina il caso patologico "un solo gruppo con 10.000
        // canali" in cui il vecchio chunking per gruppi costruiva tutto
        // in un unico task sincrono.
        // =============================================================

        // Coda dei gruppi NON vuoti, in ordine di apparizione
        const groupQueue = [];
        currentGroups.forEach((group, groupIndex) => {
            if (group.channels && group.channels.length > 0) {
                groupQueue.push({ group, groupIndex });
            }
        });

        let groupQueueIdx       = 0;   // indice del gruppo in lavorazione
        let currentGroupContent = null; // content del gruppo in lavorazione
        let currentGroupIndex   = -1;  // groupIndex del gruppo in lavorazione
        let channelIdxInGroup   = 0;   // prossimo canale da creare nel gruppo corrente

        const TIME_BUDGET_MS = 8;

        /**
         * Finalizza il rendering: rende visibile il container, riaggancia
         * il drag & drop e sincronizza channels/favoriteChannels con i
         * gruppi effettivamente disegnati.
         *
         * Il blocco di sync gira in setTimeout(0) per non bloccare il
         * thread subito dopo il rendering. Grazie al token, viene
         * eseguito solo dal render vincente.
         */


function finalizeRendering() {
    if (!isCurrentRender()) return;

    // Filtro PRIMA di mostrare: la lista non appare mai senza filtro
    if (context === 'channels' && typeof reapplySearchAfterRender === 'function') {
        reapplySearchAfterRender();
    }

    targetElement.style.opacity = '1';
    targetElement.style.pointerEvents = 'auto';

    if (context === 'channels') {
        setupDragAndDropDelegation();
    }

    if (context === 'channels') {
        setTimeout(() => {
            if (!isCurrentRender()) return;
            try {
                const usedGroups = showingFavorites ? groupedFavoriteChannels : (typeof currentGroups !== 'undefined' ? currentGroups : groupedChannels);
                const flat = usedGroups.flatMap(g => g.channels || []);
                if (showingFavorites) favoriteChannels = flat;
                else channels = flat;
                if (typeof rebuildIndexMaps === 'function') rebuildIndexMaps();
            } catch (e) { console.warn("Sync failed", e); }
        }, 0);
    }
}

        /**
         * Ciclo principale del rendering a blocchi. Ad ogni invocazione
         * lavora fino a quando non scade il budget di tempo, poi cede il
         * controllo con requestAnimationFrame e riprende dal punto in cui
         * era (grazie alle closure su groupQueueIdx / channelIdxInGroup).
         */
        function processChunk() {
            if (!isCurrentRender()) return;

            const startTime = performance.now();

            while (groupQueueIdx < groupQueue.length) {
                const { group, groupIndex } = groupQueue[groupQueueIdx];

                // ---- Crea header + content del gruppo (una volta sola) ----
                if (!currentGroupContent) {
                    let isCollapsed = false;
                    if (context === 'channels') {
                        isCollapsed = showingFavorites
                            ? !!favoriteGroupCollapseState[group.name]
                            : !!groupCollapseState[group.name];
                    }

                    const groupHeader = document.createElement('div');
                    groupHeader.className = 'group-header';
                    groupHeader.dataset.groupIndex = groupIndex;
                    groupHeader.dataset.isFavorite = showingFavorites ? 'true' : 'false';

                    if (context === 'channels') {
                        groupHeader.draggable = true;
                        groupHeader.style.cursor = 'grab';
                    }

                    const groupTitle = document.createElement('div');
                    groupTitle.className = 'group-title';

                    const groupName = document.createElement('span');
                    groupName.className = 'group-name';
                    groupName.textContent = group.name;

                    const groupCount = document.createElement('span');
                    groupCount.className = 'group-channel-count';
                    groupCount.textContent = group.channels.length;

                    const groupToggle = document.createElement('span');
                    groupToggle.className = 'group-toggle';
                    groupToggle.textContent = isCollapsed ? '+' : '-';

                    groupTitle.appendChild(groupName);
                    groupTitle.appendChild(groupCount);

                    if (context === 'channels') {
                        const dragHandle = document.createElement('span');
                        dragHandle.className = 'group-drag-handle';
                        dragHandle.textContent = '☰';
                        groupTitle.appendChild(dragHandle);
                    }

                    groupTitle.appendChild(groupToggle);
                    groupHeader.appendChild(groupTitle);

                    const groupContent = document.createElement('div');
                    groupContent.className = `group-content ${effectiveViewMode}-view`;
                    groupContent.style.display = isCollapsed ? 'none' : '';

                    // Toggle espansione/collasso del gruppo (solo lista canali)
                    if (context === 'channels') {
                        groupHeader.addEventListener('click', e => {
                            if (e.target.closest('.group-drag-handle')) return;
                            const collapsed = groupContent.style.display === 'none';
                            groupContent.style.display = collapsed ? '' : 'none';
                            if (showingFavorites) favoriteGroupCollapseState[group.name] = !collapsed;
                            else groupCollapseState[group.name] = !collapsed;
                            groupHeader.querySelector('.group-toggle').textContent = collapsed ? '-' : '+';
                            saveGroupCollapseStates();
                        });
                    }

                    // Header e content vengono appesi subito: il content
                    // si riempirà canale per canale nei prossimi giri.
                    targetElement.appendChild(groupHeader);
                    targetElement.appendChild(groupContent);

                    currentGroupContent = groupContent;
                    currentGroupIndex   = groupIndex;
                    channelIdxInGroup   = 0;
                }

                // ---- Aggiungi canali al gruppo corrente ----
                while (channelIdxInGroup < group.channels.length) {
                    const ch = group.channels[channelIdxInGroup];
                    currentGroupContent.appendChild(
                        createChannelItem(ch, currentGroupIndex, showingFavorites)
                    );
                    channelIdxInGroup++;

                    // Budget esaurito: cedi il controllo al browser.
                    // I dati sono nella closure, quindi al prossimo frame
                    // riprendiamo esattamente da qui.
                    if (performance.now() - startTime > TIME_BUDGET_MS) {
                        requestAnimationFrame(processChunk);
                        return;
                    }
                }

                // ---- Gruppo finito, passa al prossimo ----
                currentGroupContent = null;
                currentGroupIndex   = -1;
                channelIdxInGroup   = 0;
                groupQueueIdx++;
            }

            // Tutti i gruppi processati: finalizza
            finalizeRendering();
        }

        // Feedback visivo durante il rendering progressivo
        targetElement.style.opacity = '0.7';
        targetElement.style.pointerEvents = 'auto';

        // Avvia il primo chunk
        processChunk();
    });
}


/**
 * Restituisce l'array piatto dei canali attualmente visualizzati
 * (preferiti se showingFavorites è true, altrimenti lista completa).
 * Usato da prev/next e da chi deve scorrere la lista corrente.
 */
function getCurrentDisplayList() {
  return showingFavorites ? favoriteChannels : channels;
}


// Ultimo dato disegnato da showChannelList. Serve a decidere se è
// necessario un re-render o basta rendere visibile la lista esistente.
// Cambia riferimento ogni volta che groupedChannels o
// groupedFavoriteChannels vengono riassegnati per intero.
let lastRenderedChannelData = null;


// ============================================================================
// 26. SHOW CHANNEL LIST — RITORNO ALLA LISTA CANALI
// ============================================================================

/**
 * Torna alla vista "lista canali" (o preferiti, a seconda di
 * showingFavorites). Fa quattro cose:
 *   1. Ferma eventuale riproduzione in corso e nasconde il player;
 *   2. mostra il container canali e nasconde playlist/EPG;
 *   3. disegna la lista SOLO SE necessario (evita re-render identici
 *      quando si torna indietro da una vista laterale);
 *   4. evidenzia e porta in vista il canale correntemente in play.
 *
 * La decisione "serve un re-render?" si basa su tre condizioni:
 *   - il container è vuoto;
 *   - la modalità (favorites/all) è cambiata rispetto all'ultimo render;
 *   - il riferimento al dato disegnato è diverso da quello attuale.
 */
async function showChannelList() {
    window.isEPGView = false;
    window.isPlaylistView = false;

    await cleanupPlayers({ keepVideoVisible: false });
    document.getElementById('metadataContainer').style.display = 'none';

    // Chiude eventuale drawer EPG rimasto aperto
    const epgDrawer = document.getElementById('channelEpgDrawer');
    if (epgDrawer && epgDrawer.classList.contains('open')) {
        epgDrawer.classList.remove('open');
        setTimeout(() => epgDrawer.classList.add('hidden'), 300);
    }

    document.getElementById('playerContainer')?.classList.remove('hidden');

    const channelListContainer = document.getElementById('channelListContainer');
    const channelList = document.getElementById('channelList');

    if (channelList) {
        channelList.style.transition = 'opacity 0.2s ease-in-out';
        channelList.style.opacity = '0';
        channelList.style.pointerEvents = 'none';
    }

    document.getElementById('playerContainer').style.display = 'none';
    document.getElementById('playlistListContainer').classList.add('hidden');
    document.getElementById('epgListContainer').classList.add('hidden');

    // playStream / toggleUIElementsForStreamType impostano
    // channelListContainer.style.display = 'none' come stile INLINE.
    // Rimuovere solo la classe 'hidden' non basta: lo stile inline vince
    // sul CSS e il container resterebbe invisibile.
    channelListContainer.classList.remove('hidden');
    channelListContainer.style.display = '';

    document.querySelector('.main-header')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('bottomTabBar')?.classList.remove('hidden');

    // --- Decidi se serve un re-render o basta rendere visibile l'esistente ---
    const currentViewMode = showingFavorites ? 'favorites' : 'all';
    const lastRenderedMode = channelList.getAttribute('data-view-mode');
    const dataToShow = showingFavorites ? groupedFavoriteChannels : groupedChannels;

    if (!channelList || channelList.children.length === 0 || lastRenderedMode !== currentViewMode || dataToShow !== lastRenderedChannelData) {
        console.log(`Rendering necessario: Modalità precedente [${lastRenderedMode}] -> Nuova [${currentViewMode}]`);

        renderGroupedChannelList(dataToShow, { context: 'channels' });

        channelList.setAttribute('data-view-mode', currentViewMode);
        lastRenderedChannelData = dataToShow;
    } else {
        console.log("Switch istantaneo: la lista corretta è già presente nel DOM.");
        channelList.style.opacity = '1';
        channelList.style.pointerEvents = 'auto';
    }

    // Evidenzia e porta in vista il canale correntemente in play
    document.querySelectorAll('.active-channel').forEach(el => el.classList.remove('active-channel'));
    if (window.currentChannelUrl) {
        let target = document.querySelector(`[data-key="${CSS.escape(window.currentChannelUrl)}"]`);
        if (target) {
            target.classList.add('active-channel');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}


// ============================================================================
// 27. ELIMINAZIONE CANALI
// ============================================================================

/**
 * Elimina un canale dalla lista corrente (preferiti o completa).
 * Viene chiamata dal cestino visibile in modalità cancellazione.
 *
 * @param {Object} channel           canale da eliminare
 * @param {boolean} isFavoriteList   true = stiamo eliminando dai preferiti
 */
function deleteChannel(channel, isFavoriteList) {
    const key = getChannelKey(channel);

    if (isFavoriteList) {
        removeFromFavorites(key);
    } else {
        removeFromMainList(key);
    }

    updateUI();
    rebuildIndexMaps();
}


/**
 * Rimuove un canale dai preferiti (memoria + DB + indici) e, se siamo
 * nella vista preferiti, aggiorna anche la UI (nascondendo la riga
 * rimossa; se il gruppo resta vuoto, nasconde anche l'header).
 *
 * Riallinea anche currentFavoriteIndex se il canale eliminato era quello
 * in riproduzione o se era sopra di esso.
 *
 * @param {string} key  chiave getChannelKey del canale da rimuovere
 */
async function removeFromFavorites(key) {
  const favIndex = favoriteChannels.findIndex(c => getChannelKey(c) === key);
  if (favIndex === -1) return;

  await idbDeleteFavorite(key);

  favoriteChannels.splice(favIndex, 1);
  favoriteKeys.delete(key);   // [FIX 2c] prima il Set non veniva aggiornato qui e restava una chiave "fantasma"
  groupedFavoriteChannels = groupChannels(favoriteChannels);

  rebuildIndexMaps();

  // Riallineamento dell'indice di riproduzione: se rimuovo il canale che
  // sto guardando, torno al precedente; se rimuovo un canale che era
  // "sopra" a quello corrente, scalo l'indice di uno.
  if (typeof currentFavoriteIndex !== 'undefined') {
      if (favIndex === currentFavoriteIndex) {
          currentFavoriteIndex = Math.max(0, currentFavoriteIndex - 1);
      } else if (favIndex < currentFavoriteIndex) {
          currentFavoriteIndex--;
      }
  }

  if (showingFavorites) {
    renderGroupedChannelList(groupedFavoriteChannels, { context: 'channels' });
  }
}


/**
 * Rimuove un canale dalla lista completa (memoria + DB + indici).
 *
 * Dopo la rimozione, la playlist attiva viene aggiornata su IndexedDB con
 * il nuovo contenuto M3U rigenerato. Se non esiste una playlist attiva
 * (caso limite, l'utente ha svuotato tutto), non viene creato un record
 * fittizio: la lista vuota resta solo in memoria.
 *
 * @param {string} key  chiave getChannelKey del canale da rimuovere
 */
function removeFromMainList(key) {
    const channelIndex = channels.findIndex(c => getChannelKey(c) === key);
    if (channelIndex === -1) return;

    channels.splice(channelIndex, 1);
    groupedChannels = groupChannels(channels);

    rebuildIndexMaps();

    // Salva il nuovo contenuto M3U su IndexedDB in background
    const m3uContent = generateM3UFromChannels(channels);
    void (async () => {
      const active = await getActivePlaylist();
      if (active) {
        await updateM3URecord(active.id, { content: m3uContent, lastFetched: Date.now() });
      } else if (channels.length > 0) {
        const id = await saveM3UUrl('local', 'Local playlist');
        await updateM3URecord(id, { content: m3uContent, lastFetched: Date.now(), isActive: true });
        await setOnlyActive(id);
      }
      // Se channels è vuoto e non c'è playlist attiva, non creare nulla
    })();
}


/**
 * Ridisegna la lista correntemente visualizzata (preferiti o completa)
 * e aggiorna lo stato dei pulsanti. Chiamata dopo delete / modifiche UI
 * che non richiedono logica di persistenza propria.
 */
function updateUI() {
    renderGroupedChannelList(showingFavorites ? groupedFavoriteChannels : groupedChannels, { context: 'channels' });

    updateButtons();
}


// ============================================================================
// 28. DRAG & DROP — DELEGAZIONE EVENTI
// ============================================================================
//
// Il drag & drop permette di riordinare gruppi e canali all'interno della
// lista principale o dei preferiti (mai tra le due liste).
//
// La strategia è event delegation su #channelList: i listener vengono
// agganciati UNA VOLTA al contenitore stabile e reagiscono ai figli per
// bubbling. Non serve riagganciarli dopo ogni re-render, perché il
// contenitore non cambia mai identità.
//
// La guardia list.__dragDropInitialized impedisce di agganciare gli
// stessi listener più volte, anche se renderGroupedChannelList chiama
// setupDragAndDropDelegation ad ogni finalize.
// ============================================================================

/**
 * Installa (una sola volta) la delegazione di tutti gli eventi di drag &
 * drop su #channelList. Idempotente.
 */
function setupDragAndDropDelegation() {
    const list = document.getElementById('channelList');
    if (!list || list.__dragDropInitialized) return;
    list.__dragDropInitialized = true;

    // ── DRAGSTART ──
    // Salva il tipo di drag (group o channel), l'indice di partenza, e
    // marca l'elemento con .dragging.
    list.addEventListener('dragstart', (e) => {

        // Drag di GRUPPO
        const header = e.target.closest('.group-header[draggable="true"]');
        if (header) {
            draggedGroupIndex    = parseInt(header.dataset.groupIndex);
            draggedGroupIsFavorite = header.dataset.isFavorite === 'true';
            header.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-drag-type', 'group');
            e.dataTransfer.setData('text/plain', String(draggedGroupIndex));
            return;
        }

        // Drag di CANALE
        const item = e.target.closest('.channel-item');
        if (!item) return;

        draggedItem             = item;
        draggedItemOriginalGroup = parseInt(item.dataset.groupIndex);
        draggedItemOriginalUrl  = item.dataset.url;
        draggedItemIsFavorite   = item.dataset.isFavorite === 'true';
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-drag-type', 'channel');
        e.dataTransfer.setData('text/plain', item.dataset.key);
    });

    // ── DRAGEND ──
    // Pulizia visiva universale (dragging, drop-target) e reset dello stato
    // di drag. Viene eseguito anche se il drop non è avvenuto.
    list.addEventListener('dragend', () => {
        list.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        list.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

        draggedItem              = null;
        draggedItemOriginalGroup = null;
        draggedItemOriginalUrl   = null;
        draggedItemIsFavorite    = false;
        draggedGroupIndex        = null;
        draggedGroupIsFavorite   = false;
    });

    // ── DRAGOVER ──
    // Necessario per abilitare il drop: senza preventDefault il browser
    // non considera la zona come valida per il rilascio.
    list.addEventListener('dragover', (e) => {
        if (e.target.closest('.channel-item, .group-header')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });

    // ── DRAGENTER ──
    // Evidenzia il target di drop. Prima rimuove .drop-target dagli altri
    // elementi per evitare che il marker resti su target precedenti in
    // caso di movimento rapido.
    list.addEventListener('dragenter', (e) => {
        const target = e.target.closest('.channel-item, .group-header');
        if (!target) return;
        e.preventDefault();
        list.querySelectorAll('.drop-target').forEach(el => {
            if (el !== target) el.classList.remove('drop-target');
        });
        target.classList.add('drop-target');
    });

    // ── DRAGLEAVE ──
    // Il browser spara dragleave anche quando il cursore entra in un FIGLIO
    // del target (es. passa sul testo dentro .channel-item). Per evitare
    // che .drop-target venga tolto in quel caso, si controlla che il
    // relatedTarget non sia discendente del target.
    list.addEventListener('dragleave', (e) => {
        const target = e.target.closest('.channel-item, .group-header');
        if (!target) return;
        if (target.contains(e.relatedTarget)) return;
        target.classList.remove('drop-target');
    });

    // ── DROP ──
    // Il vero lavoro: capire cosa è stato trascinato e dove, e applicare
    // il riordino chiamando moveGroup/moveChannel. Dopo il riordino,
    // ri-renderizza e persiste l'ordine su IndexedDB.
    list.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const dragType = e.dataTransfer.getData('application/x-drag-type');

        // ── Drop di GRUPPO ──
        if (dragType === 'group') {
            const targetHeader = e.target.closest('.group-header');
            if (!targetHeader || draggedGroupIndex === null) return;

            const targetGroupIndex = parseInt(targetHeader.dataset.groupIndex);
            const targetIsFavorite = targetHeader.dataset.isFavorite === 'true';

            targetHeader.classList.remove('drop-target');

            // Blocca spostamenti cross-list (preferiti ↔ principale)
            if (draggedGroupIsFavorite !== targetIsFavorite) {
                draggedGroupIndex = null;
                return;
            }

            if (draggedGroupIndex !== targetGroupIndex) {
                const success = moveGroup(draggedGroupIndex, targetGroupIndex, draggedGroupIsFavorite);
                if (success) {
                    if (draggedGroupIsFavorite) {
                        persistFavoritesOrder(favoriteChannels).catch(() => {});
                    } else {
                        saveChannelOrder();
                    }
                    renderGroupedChannelList(
                        draggedGroupIsFavorite ? groupedFavoriteChannels : groupedChannels,
                        { context: 'channels' }
                    );
                }
            }

            draggedGroupIndex = null;
            return;
        }

        // ── Drop di CANALE ──
        const targetItem = e.target.closest('.channel-item');
        if (!targetItem || !draggedItem) return;

        const targetGroupIndex  = parseInt(targetItem.dataset.groupIndex);
        const targetChannelUrl  = targetItem.dataset.url;
        const targetIsFavorite  = targetItem.dataset.isFavorite === 'true';

        targetItem.classList.remove('drop-target');

        // Blocca spostamenti cross-list
        if (draggedItemIsFavorite !== targetIsFavorite) return;

        const sourceGroups     = draggedItemIsFavorite ? groupedFavoriteChannels : groupedChannels;
        const fromGroup        = sourceGroups[draggedItemOriginalGroup];
        const fromChannelIndex = fromGroup.channels.findIndex(ch => ch.url === draggedItemOriginalUrl);
        const toGroup          = sourceGroups[targetGroupIndex];
        let   toChannelIndex   = toGroup.channels.findIndex(ch => ch.url === targetChannelUrl);

        // Correzione indice quando si sposta verso il basso nello stesso
        // gruppo: dopo la rimozione dal gruppo sorgente gli elementi
        // successivi scalano di uno, quindi il target index è sfasato.
        if (draggedItemOriginalGroup === targetGroupIndex && fromChannelIndex < toChannelIndex) {
            toChannelIndex--;
        }

        moveChannel(
            draggedItemOriginalGroup,
            fromChannelIndex,
            targetGroupIndex,
            toChannelIndex,
            draggedItemIsFavorite
        );

        renderGroupedChannelList(
            draggedItemIsFavorite ? groupedFavoriteChannels : groupedChannels,
            { context: 'channels' }
        );

        if (draggedItemIsFavorite) {
            persistFavoritesOrder(favoriteChannels).catch(() => {});
        } else {
            saveChannelOrder();
        }
    });
}


// ============================================================================
// 29. RIORDINO — GRUPPI E CANALI
// ============================================================================

/**
 * Sposta un gruppo all'interno della lista (canali o preferiti) dalla
 * posizione fromIndex alla posizione toIndex.
 *
 * Il "toIndex" è interpretato come "vai dove sta attualmente il gruppo
 * toIndex": se si sposta verso il basso, l'indice di inserimento va
 * decrementato di uno perché l'elemento rimosso libera una posizione.
 *
 * Dopo lo spostamento:
 *   - aggiorna il campo .order di tutti i gruppi;
 *   - sincronizza l'array flat (channels o favoriteChannels);
 *   - ricostruisce le mappe di indice.
 *
 * @returns {boolean}  true se lo spostamento è avvenuto, false altrimenti
 */
function moveGroup(fromIndex, toIndex, isFavoriteList = false) {
  if (fromIndex === toIndex) return false;

  const groups = isFavoriteList ? groupedFavoriteChannels : groupedChannels;

  if (!Array.isArray(groups)) return false;

  if (fromIndex < 0 || fromIndex >= groups.length ||
      toIndex < 0 || toIndex >= groups.length) return false;

  const [moved] = groups.splice(fromIndex, 1);
  let insertIndex = toIndex;

  if (fromIndex < toIndex) insertIndex = toIndex - 1;
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > groups.length) insertIndex = groups.length;

  groups.splice(insertIndex, 0, moved);

  // Aggiorna .order di ciascun gruppo in base alla nuova posizione
  groups.forEach((g, idx) => {
    if (g) g.order = idx;
  });

  // Sincronizza l'array flat
  if (isFavoriteList) {
    favoriteChannels = groups.flatMap(g => g.channels || []);
  } else {
    channels = groups.flatMap(g => g.channels || []);
  }

  rebuildIndexMaps();

  return true;
}


/**
 * Sposta un canale all'interno della stessa lista (canali o preferiti),
 * eventualmente cambiando gruppo.
 *
 * Operazioni:
 *   1. rimuove il canale dal gruppo di partenza;
 *   2. aggiorna il suo campo .group al nome del gruppo di arrivo;
 *   3. inserisce il canale nel gruppo di arrivo alla posizione richiesta;
 *   4. sincronizza l'array flat e (se preferiti) la Set favoriteKeys;
 *   5. persiste il nuovo ordine:
 *        - preferiti: persistFavoritesOrder()
 *        - canali:    aggiorna la playlist attiva con il nuovo M3U
 *   6. ricostruisce le mappe di indice.
 *
 * @param {number} fromGroupIndex     indice del gruppo di partenza
 * @param {number} fromChannelIndex   indice del canale nel gruppo di partenza
 * @param {number} toGroupIndex       indice del gruppo di arrivo
 * @param {number} toChannelIndex     posizione di inserimento nel gruppo di arrivo
 * @param {boolean} isFavoriteList    true = stiamo operando sui preferiti
 */
function moveChannel(fromGroupIndex, fromChannelIndex, toGroupIndex, toChannelIndex, isFavoriteList) {
  if (fromGroupIndex === toGroupIndex && fromChannelIndex === toChannelIndex) return;

  const sourceGroups = isFavoriteList ? groupedFavoriteChannels : groupedChannels;

  if (!Array.isArray(sourceGroups) ||
      fromGroupIndex < 0 || fromGroupIndex >= sourceGroups.length ||
      toGroupIndex < 0 || toGroupIndex >= sourceGroups.length) return;

  const fromGroup = sourceGroups[fromGroupIndex];
  const toGroup = sourceGroups[toGroupIndex];

  if (!fromGroup || !toGroup) return;
  if (fromChannelIndex < 0 || fromChannelIndex >= fromGroup.channels.length) return;

  const [movedChannel] = fromGroup.channels.splice(fromChannelIndex, 1);

  if (!movedChannel) return;

  // Salva la vecchia chiave prima di modificare il gruppo
  const oldKey = getChannelKey(movedChannel);

  movedChannel.group = toGroup.name;

  const newKey = getChannelKey(movedChannel);

  // Inserimento con indice validato (clamp al range del gruppo di arrivo)
  let safeToIndex = toChannelIndex;
  if (safeToIndex < 0) safeToIndex = 0;
  if (safeToIndex > toGroup.channels.length) safeToIndex = toGroup.channels.length;

  toGroup.channels.splice(safeToIndex, 0, movedChannel);

  if (isFavoriteList) {
    // Preferiti: sincronizza array flat, Set, e persisti su IndexedDB
    favoriteChannels = groupedFavoriteChannels.flatMap(g => g.channels || []);

    favoriteKeys.delete(oldKey);
    favoriteKeys.add(newKey);

    void (async () => {
      try {
        await persistFavoritesOrder(favoriteChannels);
      } catch (error) {}
    })();
  } else {
    // Canali: sincronizza array flat e aggiorna la playlist attiva
    channels = groupedChannels.flatMap(g => g.channels || []);

    const m3uContent = generateM3UFromChannels(channels);

    void (async () => {
      const active = await getActivePlaylist();
      if (active) {
        await updateM3URecord(active.id, { content: m3uContent, lastFetched: Date.now() });
      } else if (channels.length > 0) {
        const id = await saveM3UUrl('local', 'Local playlist');
        await updateM3URecord(id, { content: m3uContent, lastFetched: Date.now(), isActive: true });
        await setOnlyActive(id);
      }
    })();
  }

  rebuildIndexMaps();
}


/**
 * Recupera un canale a partire dal suo URL, cercando prima nella lista
 * indicata e (se non specificato) in quella dei preferiti.
 *
 * Usa le mappe URL->canale per essere O(1).
 *
 * @param {string} url
 * @param {boolean} [fromFavorites=false]
 * @returns {Object|null}
 */
function getChannelByUrl(url, fromFavorites = false) {
    if (fromFavorites) {
        return favoriteUrlMap.get(url) || null;
    } else {
        return channelUrlMap.get(url) || null;
    }
}


/**
 * Aggiorna groupedChannels dopo che un canale ha cambiato gruppo tramite
 * modifica del campo "Gruppo" nei metadati del player (non tramite drag
 * & drop: quello passa da moveChannel).
 *
 * Cosa fa:
 *   1. rimuove il canale dal vecchio gruppo; se il gruppo resta vuoto,
 *      lo elimina insieme al suo stato di collasso;
 *   2. lo aggiunge al nuovo gruppo, creandolo se non esiste;
 *   3. riordina i gruppi per .order.
 *
 * @param {Object} channel       canale con il NUOVO gruppo già impostato
 * @param {string} oldGroupName  nome del gruppo da cui il canale è uscito
 */
function updateGroupedChannelsAfterGroupChange(channel, oldGroupName) {
  // Rimozione dal vecchio gruppo
  const oldGroup = groupedChannels.find(g => g.name === oldGroupName);
  if (oldGroup) {
    const channelIndex = oldGroup.channels.findIndex(c => getChannelKey(c) === getChannelKey(channel));
    if (channelIndex !== -1) {
      oldGroup.channels.splice(channelIndex, 1);

      if (oldGroup.channels.length === 0) {
        const groupIndex = groupedChannels.findIndex(g => g.name === oldGroupName);
        if (groupIndex !== -1) {
          groupedChannels.splice(groupIndex, 1);
          delete groupCollapseState[oldGroupName];
        }
      }
    }
  }

  // Aggiunta al nuovo gruppo (o creazione)
  let newGroup = groupedChannels.find(g => g.name === channel.group);
  if (!newGroup) {
    newGroup = {
      name: channel.group,
      logo: null,
      channels: [],
      order: groupedChannels.length > 0 ?
             Math.max(...groupedChannels.map(g => g.order)) + 1 :
             0
    };
    groupedChannels.push(newGroup);
    groupCollapseState[channel.group] = false;
  }

  if (!newGroup.channels.find(c => getChannelKey(c) === getChannelKey(channel))) {
    newGroup.channels.push(channel);
  }

  groupedChannels.sort((a, b) => a.order - b.order);
}


/**
 * Persiste su IndexedDB l'ordine corrente dei canali principali,
 * rigenerando l'M3U e aggiornando la playlist attiva (o creandone una
 * "Local playlist" se non esiste una playlist attiva ma ci sono canali).
 *
 * Non fa nulla di visibile all'utente: è una persistenza silenziosa.
 * Viene chiamata dopo drag & drop o riordini di gruppo.
 */
function saveChannelOrder() {
  // Verifica che groupedChannels e channels siano sincronizzati; se non
  // lo sono, riallinea channels a partire dai gruppi (i gruppi sono la
  // fonte di verità dopo un riordino).
  const flatFromGroups = groupedChannels.flatMap(g => g.channels || []);

  if (flatFromGroups.length !== channels.length) {
    channels = flatFromGroups;
  }

  const m3uContent = generateM3UFromChannels(channels);

  void (async () => {
    try {
      const active = await getActivePlaylist();
      if (active) {
        await updateM3URecord(active.id, {
          content: m3uContent,
          lastFetched: Date.now()
        });
      } else if (channels.length > 0) {
        const id = await saveM3UUrl('local', 'Local playlist');
        await updateM3URecord(id, {
          content: m3uContent,
          lastFetched: Date.now(),
          isActive: true
        });
        await setOnlyActive(id);
      }
    } catch (error) {}
  })();
}


// ============================================================================
// 30. STATO DEI PULSANTI IN HEADER
// ============================================================================

/**
 * Aggiorna lo stato dei pulsanti dell'header in base allo stato corrente
 * della lista (canali/preferiti). Al momento l'unico pulsante interessato
 * è quello dei preferiti, che riflette showingFavorites.
 */
function updateButtons() {
      const hasChannels = channels.length > 0;
      const toggle = document.getElementById('favoritesToggle');
      updateToggleState();
    }


/**
 * Sincronizza la classe .active del pulsante #favoritesPill con il valore
 * corrente di showingFavorites. Non tocca la logica del pulsante (che ha
 * il suo proprio listener), solo la classe visiva.
 */
function updateToggleState() {
  const pillButton = document.getElementById('favoritesPill');
  if (pillButton) {
    pillButton.classList.toggle('active', showingFavorites);
  }
}

// ============================================================================
// 31. METADATI CANALE — PANNELLO NEL PLAYER
// ============================================================================
//
// Sotto il player c'è un pannello "Metadati Canale" espandibile che mostra
// nome, gruppo, URL, logo e tipo (video/audio) del canale in riproduzione.
// Nome, gruppo, URL e logo sono modificabili: le modifiche vengono salvate
// su memoria + IndexedDB e riflesse nella lista canali.
//
// Il pannello è attivabile/disattivabile dal toggle "Mostra Metadati" nella
// sidebar; lo stato di espansione/chiusura è persistito su localStorage in
// `metadataExpanded`.
// ============================================================================


/**
 * Aggiorna lo stato visivo del pannello metadati in base alle preferenze
 * salvate (mostra/nascondi header, espandi/comprimi contenuto).
 *
 * Se il pannello è abilitato e deve essere espanso, forza anche
 * l'aggiornamento dei valori mostrati: prende il canale attivo (con un
 * fallback su "ultimo canale riprodotto" se getActiveChannel fallisce)
 * e chiama showChannelMetadata.
 *
 * Se il pannello è disabilitato o collassato, cancella il contenuto DOM
 * per non lasciare valori obsoleti in memoria.
 */
function updateMetadataContainerState() {
  const container = document.getElementById('metadataContainer');
  const header = document.getElementById('metadataHeader');
  const metadataContent = document.getElementById('metadataContent');

  metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';
  const showMetadataEnabled = localStorage.getItem("zappone_show_metadata") !== "false";

  if (showMetadataEnabled) {
    header.style.display = "flex";
    if (metadataExpanded) {
      container.classList.add('expanded');
      container.style.display = 'block';

      // Recupera il canale attivo. Se getActiveChannel() fallisce, prova
      // a ricostruirlo dall'ultimo canale riprodotto in localStorage.
      const currentChannel = getActiveChannel();
      if (!currentChannel) {
        console.warn("getActiveChannel() fallito, tentativo di recupero alternativo");
        const lastPlayedUrl = localStorage.getItem("zappone_last_played");
        if (lastPlayedUrl) {
          const fromFavorites = localStorage.getItem("zappone_last_played_from_favorites") === 'true';
          const searchList = fromFavorites ? favoriteChannels : channels;
          const fallbackChannel = searchList.find(ch => ch.url === lastPlayedUrl);
          if (fallbackChannel) {
            showChannelMetadata(fallbackChannel);
            return;
          }
        }
      } else {
        showChannelMetadata(currentChannel);
      }
    } else {
      // Pannello collassato: svuota il contenuto per evitare dati vecchi
      if (metadataContent) {
        metadataContent.innerHTML = '';
      }
      container.classList.remove('expanded');
      container.style.display = 'none';
    }
  } else {
    // Pannello disabilitato: nascondi tutto e forza lo stato a "collassato"
    header.style.display = "none";
    container.classList.remove('expanded');
    container.style.display = 'none';
    localStorage.setItem('metadataExpanded', 'false');
    metadataExpanded = false;
    if (metadataContent) {
      metadataContent.innerHTML = '';
    }
  }
}


/**
 * Recupera il canale attualmente in riproduzione dallo stato globale.
 * Cerca nella lista giusta (preferiti se showingFavorites, altrimenti
 * completa) usando window.currentChannelUrl come chiave.
 *
 * @returns {Object|null}  il canale o null se non trovato
 */
function getActiveChannel() {
  const key = window.currentChannelUrl;
  const list = showingFavorites ? favoriteChannels : getCurrentDisplayList();
  return list.find(ch => getChannelKey(ch) === key) || null;
}


/**
 * Costruisce la griglia dei metadati del canale nel pannello sotto il
 * player. Se la griglia esiste già, si limita ad aggiornare i valori;
 * altrimenti la costruisce da zero.
 *
 * I campi modificabili sono 4 (nome, gruppo, url, logo) più il tipo
 * (select video/audio). Ogni modifica viene salvata su blur/Enter e
 * passa da saveMetadataChanges.
 *
 * @param {Object} channel  canale di cui mostrare i metadati
 */
function showChannelMetadata(channel) {
  const metadataContent = document.getElementById('metadataContent');

  // Se la griglia è già presente, aggiorna solo i valori
  if (metadataContent.children.length > 0) {
    updateMetadataValues(channel);
    return;
  }

  metadataContent.innerHTML = '';

  const isRadioMode = document.getElementById('radioToggle').checked;
  const metadata = {
    'Nome': channel.name,
    'Gruppo': channel.group,
    'URL': channel.url,
    'Logo': channel.logo || 'N/D',
    'Tipo': isRadioMode ? 'Modalità Radio' :
           (streamTypeCache[channel.url] ? 'Audio' : 'Video')
  };

  for (const [label, value] of Object.entries(metadata)) {
    const labelElement = document.createElement('div');
    labelElement.className = 'metadata-label';
    labelElement.textContent = label + ':';
    labelElement.id = `metadata-label-${label.toLowerCase()}`;

    const valueElement = document.createElement('div');
    valueElement.className = 'metadata-value';
    valueElement.id = `metadata-value-${label.toLowerCase()}`;

    if (label === 'Tipo') {
      // Tipo: select video/audio, disabilitata in modalità radio
      const select = document.createElement('select');
      select.className = 'metadata-input';
      select.setAttribute('data-field', label.toLowerCase());

      if (isRadioMode) {
        select.innerHTML = '<option value="Radio" selected>Modalità Radio</option>';
        select.disabled = true;
        select.title = "Modalità Radio attiva - non modificabile";
      } else {
        select.innerHTML = `
          <option value="Video" ${!streamTypeCache[channel.url] ? 'selected' : ''}>Video</option>
          <option value="Audio" ${streamTypeCache[channel.url] ? 'selected' : ''}>Audio</option>
        `;
      }

      select.addEventListener('change', (e) => {
        if (isRadioMode) return;
        const ch = getActiveChannel();
        if (!ch) return;

        const newType = e.target.value === 'Audio';
        streamTypeCache[ch.url] = newType;
        saveMetadataChanges(ch);

        if (newType) playAudioStream(ch.url);
        else playVideoStream(ch.url);
      });

      valueElement.appendChild(select);
    } else {
      // Campi testuali: input editabile, salva su blur o Enter
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'metadata-input';
      input.setAttribute('data-field', label.toLowerCase());
      input.value = value === 'N/D' ? '' : value;
      input.placeholder = value === 'N/D' ? '' : value;

      input.addEventListener('blur', () => {
        const ch = getActiveChannel();
        if (ch) saveMetadataChanges(ch);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur(); // scatena blur -> salvataggio
        }
      });

      valueElement.appendChild(input);
    }

    metadataContent.appendChild(labelElement);
    metadataContent.appendChild(valueElement);
  }

  metadataContainer.style.display = 'block';
}


/**
 * Aggiorna i valori visualizzati nella griglia metadati senza ricostruire
 * il DOM. Viene chiamata quando il pannello è già disegnato ma il canale
 * attivo è cambiato (es. cambio canale con prev/next).
 *
 * @param {Object} channel
 */
function updateMetadataValues(channel) {
  const isRadioMode = document.getElementById('radioToggle').checked;
  const metadata = {
    'nome': channel.name,
    'gruppo': channel.group,
    'url': channel.url,
    'logo': channel.logo || 'N/D',
    'tipo': isRadioMode ? 'Modalità Radio' :
           (streamTypeCache[channel.url] ? 'Audio' : 'Video')
   };

  for (const [label, value] of Object.entries(metadata)) {
    const valueElement = document.getElementById(`metadata-value-${label}`);
    if (!valueElement) continue;

    if (label === 'tipo') {
      const select = valueElement.querySelector('select');
      if (select) {
        if (isRadioMode) {
          select.innerHTML = '<option value="Radio" selected>Modalità Radio</option>';
          select.disabled = true;
        } else {
          select.innerHTML = `
            <option value="Video" ${!streamTypeCache[channel.url] ? 'selected' : ''}>Video</option>
            <option value="Audio" ${streamTypeCache[channel.url] ? 'selected' : ''}>Audio</option>
          `;
          select.disabled = false;
        }
      }
    } else {
      const input = valueElement.querySelector('input');
      if (input) {
        input.value = value === 'N/D' ? '' : value;
      }
    }
  }
}


/**
 * Salva le modifiche apportate ai metadati del canale attivo.
 *
 * Comportamento:
 *   - se newName è una stringa, aggiorna solo il nome (usato dal campo
 *     contenteditable sopra il player);
 *   - altrimenti legge TUTTI gli input del pannello metadati e applica
 *     i valori (nome, gruppo, url, logo, tipo).
 *
 * Dopo l'aggiornamento in memoria:
 *   - aggiorna l'header del player (updateChannelInfoUI);
 *   - se il gruppo è cambiato e siamo nella lista principale, chiama
 *     updateGroupedChannelsAfterGroupChange per spostare il canale nel
 *     gruppo giusto;
 *   - se stiamo editando un preferito, aggiorna IndexedDB con la nuova
 *     chiave (idbUpdateFavoriteKey);
 *   - altrimenti aggiorna channels e rigenera l'M3U su IndexedDB;
 *   - se la chiave del canale attivo è cambiata, aggiorna
 *     window.currentChannelUrl;
 *   - se il pannello metadati è aperto, lo ridisegna.
 *
 * @param {string|null} [newName=null]  se stringa, aggiorna solo il nome
 */
async function saveMetadataChanges(newName = null) {
  const ch = getActiveChannel();
  if (!ch) return;

  const oldKey = getChannelKey(ch);
  const oldGroup = ch.group;
  const isFavView = !!showingFavorites;

  const metadataContent = document.getElementById('metadataContent');
  const inputs = metadataContent.querySelectorAll('.metadata-input');

  if (typeof newName === 'string') {
    const trimmed = newName.trim();
    if (trimmed) {
      ch.name = trimmed;
    }
  } else {
    inputs.forEach(input => {
      const field = input.getAttribute('data-field');
      const value = (input.value || '').trim();

      switch (field) {
        case 'nome':
          if (value) ch.name = value;
          break;
        case 'gruppo':
          if (value) ch.group = value;
          break;
        case 'url':
          if (value) ch.url = value;
          break;
        case 'logo':
          ch.logo = (value === 'N/D' || value === '') ? null : value;
          break;
        case 'tipo':
          break;
      }
    });
  }

  updateChannelInfoUI(ch);

  // Aggiorna i gruppi solo se siamo nella lista principale
  if (oldGroup !== ch.group && !isFavView) {
    updateGroupedChannelsAfterGroupChange(ch, oldGroup);
  }

  if (isFavView && favoriteKeys.has(oldKey)) {
    // Caso preferito: aggiorna la chiave su IndexedDB e in memoria
    favoriteKeys.delete(oldKey);
    const newKey = getChannelKey(ch);
    favoriteKeys.add(newKey);

    const favIndex = favoriteChannels.findIndex(c => getChannelKey(c) === oldKey);
    await idbUpdateFavoriteKey(oldKey, {
      key: newKey,
      name: ch.name,
      url: ch.url,
      group: ch.group || 'Favorites',
      logo: ch.logo || '',
      type: ch.type || 'channel',
      order: favIndex >= 0 ? favIndex : favoriteChannels.length
    });

    if (favIndex !== -1) {
      favoriteChannels[favIndex] = ch;
    }

    groupedFavoriteChannels = groupChannels(favoriteChannels);
    renderGroupedChannelList(groupedFavoriteChannels, { context: 'channels' });
    rebuildIndexMaps();
  } else {
    // Caso lista principale: aggiorna channels, rigenera M3U, salva su DB
    const mainIndex = channels.findIndex(c => getChannelKey(c) === oldKey);
    if (mainIndex !== -1) {
      channels[mainIndex] = ch;
    }

    groupedChannels = groupChannels(channels);
    renderGroupedChannelList(groupedChannels, { context: 'channels' });
    rebuildIndexMaps();

    try {
      const active = await getActivePlaylist();
      if (active) {
        const newContent = generateM3UFromChannels(channels);
        await updateM3URecord(active.id, { content: newContent, lastFetched: Date.now() });
      }
    } catch (err) {
      console.error('Errore aggiornamento IndexedDB:', err);
      if (typeof showNotification === 'function') {
        showNotification('Impossibile salvare le modifiche nel DB', true);
      }
    }
  }

  // Se ho rinominato il canale attivo, aggiorna la chiave globale
  if (window.currentChannelUrl === oldKey) {
    window.currentChannelUrl = getChannelKey(ch);
  }

  // Riapri pannello metadati se era aperto
  if (metadataExpanded) {
    showChannelMetadata(ch);
  }
}


// ============================================================================
// 32. GESTURE — SWIPE PER CAMBIARE LISTA/GRIGLIA
// ============================================================================
//
// Lo swipe orizzontale alterna list-view e grid-view nella lista canali.
// Funziona sia con touch che con mouse.
//
// Regole:
//   - dx minimo 180 px;
//   - dx deve dominare dy di almeno 2.5x (evita di attivare swipe mentre
//     si scorre verticalmente);
//   - ignora swipe quando sidebar, bottom sheet o EPG drawer sono aperti;
//   - ignora swipe quando la vista canali non è visibile (playlist, EPG,
//     full EPG).
// ============================================================================


/**
 * Aggancia i listener touch/mouse per lo swipe ai container delle liste.
 * Idempotente: usa una guardia su container.__swipeHandlersAttached per
 * non agganciare due volte gli stessi listener.
 */
function setupSwipeHandlers() {
  const channelContainer = document.getElementById('channelListContainer');
  const fullEpgList = document.getElementById('fullEpgList');
  const playlistList = document.getElementById('playlistList');
  const epgList = document.getElementById('epgList');
  const containers = [channelContainer, fullEpgList, playlistList, epgList].filter(Boolean);

  // Area riservata al bordo destro per aprire la sidebar
  const SIDEBAR_EDGE_WIDTH = 28;
  const HEADER_HEIGHT = 50;

  containers.forEach(container => {
    if (container.__swipeHandlersAttached) return;
    container.__swipeHandlersAttached = true;

    container.addEventListener('touchstart', (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const t = e.changedTouches[0];
      touchStartX = t.screenX;
      touchStartY = t.screenY;

      // Ignora se lo swipe parte dentro sidebar, bottom sheet, EPG drawer
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (el && (el.closest('.sidebar') || el.closest('.sidebar-handle') ||
                 el.closest('.bottom-sheet') || el.closest('.bottom-sheet-handle') ||
                 el.closest('#channelEpgDrawer') || el.closest('.bottom-sheet-drag-area'))) {
        container.__ignoreNextTouch = true;
        return;
      }
      container.__ignoreNextTouch = false;

      // Ignora se lo swipe parte nell'area bordo destro (riservata a sidebar)
      if (t.clientX > (window.innerWidth - SIDEBAR_EDGE_WIDTH) && t.clientY > HEADER_HEIGHT) {
        container.__ignoreNextTouch = true;
        return;
      }

      // Ignora se la sidebar è già aperta
      const sidebar = document.querySelector('.sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        container.__ignoreNextTouch = true;
        return;
      }
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      if (container.__ignoreNextTouch) {
        container.__ignoreNextTouch = false;
        return;
      }
      const t = e.changedTouches[0];
      touchEndX = t.screenX;
      touchEndY = t.screenY;
      handleSwipe();
    }, { passive: true });

    // Fallback mouse (desktop)
    container.addEventListener('mousedown', (e) => {
      mouseDownX = e.clientX;
      mouseDownY = e.clientY;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      container.__ignoreNextMouse = el && (el.closest('.sidebar') || el.closest('.sidebar-handle') ||
                                         el.closest('.bottom-sheet') || el.closest('#channelEpgDrawer'));
    });

    container.addEventListener('mouseup', (e) => {
      if (container.__ignoreNextMouse) {
        container.__ignoreNextMouse = false;
        return;
      }
      mouseUpX = e.clientX;
      mouseUpY = e.clientY;
      handleMouseSwipe();
    });
  });
}


/**
 * Calcola dx/dy dallo swipe touch e delega a processSwipe.
 */
function handleSwipe() {
  const dx = touchEndX - touchStartX;
  const dy = (typeof touchEndY !== 'undefined' && typeof touchStartY !== 'undefined') ? (touchEndY - touchStartY) : 0;
  processSwipe(dx, dy);
}


/**
 * Calcola dx/dy dallo swipe mouse e delega a processSwipe.
 */
function handleMouseSwipe() {
  const dx = mouseUpX - mouseDownX;
  const dy = (typeof mouseUpY !== 'undefined' && typeof mouseDownY !== 'undefined') ? (mouseUpY - mouseDownY) : 0;
  processSwipe(dx, dy);
}


/**
 * Interpreta un gesto orizzontale e decide se cambiare modalità di vista.
 * Applica le guardie (distanza, dominanza, overlay aperti, vista canali
 * visibile) prima di agire.
 */
function processSwipe(dx, dy) {
  const MIN_DISTANCE = 180;
  const HORIZONTAL_DOMINANCE = 2.5;

  if (Math.abs(dx) < MIN_DISTANCE) return;
  if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return;

  const sidebar = document.querySelector('.sidebar');
  if (sidebar && sidebar.classList.contains('open')) return;
  if (document.querySelector('.bottom-sheet.open')) return;
  if (document.getElementById('channelEpgDrawer')?.classList.contains('open')) return;

  // Lo swipe cambia list/grid SOLO nella vista canali
  const channelListContainer = document.getElementById('channelListContainer');
  if (!channelListContainer || channelListContainer.classList.contains('hidden')) return;

  if (dx > 0 && currentViewMode === 'grid') {
    switchViewMode('list');
  } else if (dx < 0 && currentViewMode === 'list') {
    switchViewMode('grid');
  }
}


/**
 * Cambia la modalità di vista della lista canali ('list' o 'grid'),
 * aggiorna la preferenza persistita, lo stato del pulsante e ri-renderizza
 * la lista canali.
 *
 * Nota: la nuova modalità è applicata SOLO alla lista canali. Playlist,
 * EPG manager e Full EPG ignorano currentViewMode e restano sempre in
 * list-view.
 *
 * @param {'list'|'grid'} mode
 */
function switchViewMode(mode) {
    currentViewMode = mode;
    if (typeof saveViewModePreference === 'function') {
        saveViewModePreference(mode);
    } else {
        localStorage.setItem('zappone_view_mode', mode);
    }

    // Sincronizza lo stato del pulsante (list-mode/grid-mode/collapse-mode)
    const viewModePill = document.getElementById('viewModePill');
    if (viewModePill) {
        viewModePill.classList.remove('list-mode', 'grid-mode', 'collapse-mode');
        viewModePill.classList.add(mode === 'grid' ? 'grid-mode' : 'list-mode');
    }

    // Ri-renderizza SEMPRE la lista canali, anche se in questo momento è
    // nascosta: così quando l'utente torna alla vista canali è già coerente.
    renderGroupedChannelList(
        showingFavorites ? groupedFavoriteChannels : groupedChannels,
        { context: 'channels' }
    );

    // Se la vista canali è visibile, riporta in vista il canale attivo
    const channelListContainer = document.getElementById('channelListContainer');
    const isChannelsVisible = channelListContainer &&
        !channelListContainer.classList.contains('hidden') &&
        channelListContainer.style.display !== 'none';

    if (isChannelsVisible && window.currentChannelUrl) {
        setTimeout(() => {
            const target = document.querySelector(
                `[data-key="${CSS.escape(window.currentChannelUrl)}"]`
            );
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
}


/**
 * Salva su localStorage la preferenza di visualizzazione (mode e stato
 * dei preferiti) per il prossimo avvio.
 *
 * @param {'list'|'grid'} mode
 */
function saveViewModePreference(mode) {
  localStorage.setItem('zappone_view_mode', mode);
  localStorage.setItem('zappone_show_favorites', showingFavorites);
}


/**
 * Legge da localStorage le preferenze di visualizzazione.
 * @returns {{mode: 'list'|'grid', showFav: boolean}}
 */
function loadViewModePreference() {
  const showFav = localStorage.getItem('zappone_show_favorites');
  return {
    mode: localStorage.getItem('zappone_view_mode') || 'list',
    showFav: showFav === 'true'
  };
}


// ============================================================================
// 33. NOTIFICHE A COMPARSA (TOAST)
// ============================================================================
//
// Le notifiche sono piccoli toast in basso a destra. Ci sono due modalità
// di controllo:
//   - "Mostra notifiche" nella sidebar (zappone_popup_notifications):
//     se disattivato, showNotification() non fa nulla a meno che non
//     venga chiamata con force=true;
//   - "Mostra messaggi console" nella sidebar (zappone_console_overlay):
//     se attivo, ogni console.log/warn/error viene trasformato in una
//     notifica con force=true.
//
// Per evitare loop infiniti (console.error dentro showNotification che
// genera un'altra console.error...), c'è un flag di reentrancy che blocca
// le chiamate ricorsive.
// ============================================================================

let _notifyReentrancyGuard = false;


/**
 * Mostra una notifica toast all'utente.
 *
 * @param {string} message        testo della notifica
 * @param {boolean} [isError=false] se true, applica la variante rossa
 * @param {boolean} [force=false]  se true, ignora la preferenza utente
 *                                 (usato dall'intercettazione console)
 */
function showNotification(message, isError = false, force = false) {
  if (_notifyReentrancyGuard) return;
  _notifyReentrancyGuard = true;

  try {
    if (!force) {
      const pref = localStorage.getItem('zappone_popup_notifications');
      const enabled = pref === null ? true : pref === 'true';
      if (!enabled) return;
    }

    let container = document.getElementById('notification-stack');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-stack';
      document.body.appendChild(container);
    }

    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'error' : 'success'}`;

    // Tronca messaggi lunghi e forza la conversione a stringa (message
    // potrebbe essere un oggetto passato per errore dall'intercettazione
    // console: String() evita TypeError su .length/.substring)
    const maxLength = 150;
    const safeMessage = String(message ?? '');
    notification.textContent = safeMessage.length > maxLength ? safeMessage.substring(0, maxLength) + '...' : safeMessage;

    container.appendChild(notification);

    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    // Rimozione automatica dopo 4 secondi (300ms extra per l'animazione)
    setTimeout(() => {
      notification.classList.remove('show');

      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);

  } catch (e) {
    // Se console.error è intercettato, questa chiamata rientrerebbe in
    // showNotification(): la guardia in cima la blocca subito.
    console.error('showNotification error', e);
  } finally {
    _notifyReentrancyGuard = false;
  }
}


// ============================================================================
// 34. INTERCETTAZIONE CONSOLE
// ============================================================================
//
// Quando il toggle "Mostra messaggi console" è attivo, ogni log/warn/error
// viene trasformato in una notifica toast con force=true. Utile in debug
// su mobile, dove la console non è facilmente accessibile.
//
// originalConsole conserva i riferimenti alle funzioni originali così
// possiamo ripristinarle quando l'intercettazione viene disattivata.
// ============================================================================

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};


/**
 * Sostituisce un metodo di console con una versione che, oltre a
 * chiamare quello originale, mostra anche una notifica toast.
 *
 * @param {string} method     'log' | 'error' | 'warn' | 'info' | 'debug'
 * @param {boolean} isError   se true, la notifica è di tipo errore
 */
function interceptConsole(method, isError = false) {
  const original = originalConsole[method];
  console[method] = function(...args) {
    original.apply(console, args);

    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    showNotification(`${method.toUpperCase()}: ${message}`, isError, true);
  };
}


/**
 * Attiva l'intercettazione di tutti i metodi di console. Idempotente
 * rispetto ai metodi (sovrascrive sempre con la versione intercettata).
 */
function enableConsoleIntercept() {
  interceptConsole('error', true);
  interceptConsole('warn', true);
  interceptConsole('log', false);
  interceptConsole('info', false);
  interceptConsole('debug', false);
  originalConsole.log('Intercettazione console: ENABLED');
}


/**
 * Ripristina i metodi originali di console.
 */
function disableConsoleIntercept() {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
  originalConsole.log('Intercettazione console: DISABLED');
}


// Al caricamento, applica lo stato salvato della preferenza
window.addEventListener('load', () => {
  const enabled = localStorage.getItem('zappone_console_overlay') === 'true';
  if (enabled) enableConsoleIntercept();
  else disableConsoleIntercept();
});


// ============================================================================
// 35. SIDEBAR IMPOSTAZIONI — APERTURA, CHIUSURA, DRAG
// ============================================================================
//
// La sidebar laterale contiene i tab Aspetto / Player / Contenuti / Sistema.
// Si apre trascinando la maniglia a destra, cliccando la maniglia, o
// facendo edge-swipe dal bordo destro. Si chiude cliccando la X, cliccando
// sull'overlay, o trascinando la maniglia verso destra.
//
// Lo stesso IIFE gestisce anche il drawer EPG laterale (#channelEpgDrawer),
// che si apre in modo simile ma con la sua logica.
// ============================================================================

(function() {

  const sidebar = document.getElementById("optionsSidebar");
  const optionsBtn = document.getElementById("optionsBtn");
  const closeBtn = document.getElementById("closeSidebar");
  const handle = document.getElementById("sidebarHandle");
  const overlay = document.getElementById("sidebarOverlay");

  if (sidebar && optionsBtn && closeBtn && handle && overlay) {
    let isSidebarOpen = false;
    let isDraggingSidebar = false;
    let dragStartXSidebar = 0;
    let startTranslateSidebar = 0;
    let sidebarWidth = Math.max(240, sidebar.offsetWidth || 350);
    let currentTranslateSidebar = sidebarWidth;

    /**
     * Apre o chiude la sidebar con o senza animazione.
     *
     * @param {boolean} open
     * @param {boolean} [animate=true]
     */
    function setSidebarOpen(open, animate = true) {
      isSidebarOpen = open;
      if (!animate) {
        sidebar.style.transition = 'none';
        overlay.style.transition = 'none';
        handle.style.transition = 'none';
      } else {
        sidebar.style.transition = '';
        overlay.style.transition = '';
        handle.style.transition = '';
      }

      if (open) {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        requestAnimationFrame(() => {
          currentTranslateSidebar = 0;
          sidebar.style.transform = 'translateX(0)';
        });
      } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        currentTranslateSidebar = sidebarWidth;
        sidebar.style.transform = `translateX(${sidebarWidth}px)`;
        overlay.style.opacity = '';
        overlay.style.pointerEvents = '';
      }
    }

    // Stato iniziale: sidebar chiusa (tradotta fuori schermo)
    sidebar.style.transform = `translateX(${sidebarWidth}px)`;
    overlay.classList.remove('active');

    // Apertura/chiusura dai pulsanti
    optionsBtn.addEventListener('click', () => {
      sidebarWidth = sidebar.offsetWidth || sidebarWidth;
      if (typeof updateLicenseDisplay === 'function') updateLicenseDisplay();
      setSidebarOpen(true);
    });

    closeBtn.addEventListener('click', () => setSidebarOpen(false));
    overlay.addEventListener('click', () => setSidebarOpen(false));

    /**
     * Forza un valore tra min e max.
     */
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /**
     * Inizia il drag della sidebar (touch o mouse).
     */
    function startDragSidebar(clientX) {
      isDraggingSidebar = true;
      sidebarWidth = sidebar.offsetWidth || sidebarWidth;
      dragStartXSidebar = clientX;
      startTranslateSidebar = isSidebarOpen ? 0 : sidebarWidth;
      sidebar.style.transition = 'none';
      overlay.style.transition = 'none';
      handle.style.transition = 'none';
      overlay.classList.add('active');
      // [FIX 6c] Il touchmove "non passivo" (serve a bloccare lo scroll durante il trascinamento)
      // ora si registra solo mentre trascini. Prima restava attivo per sempre su tutto il
      // documento e obbligava il browser ad aspettare il JavaScript a ogni movimento del dito.
      document.addEventListener('touchmove', onTouchMoveSidebar, {passive: false});
    }

    /**
     * Aggiorna la posizione della sidebar durante il drag.
     */
    function onDragSidebar(clientX) {
      if (!isDraggingSidebar) return;
      const delta = dragStartXSidebar - clientX;
      let newTranslate = startTranslateSidebar - delta;
      newTranslate = clamp(newTranslate, 0, sidebarWidth);
      currentTranslateSidebar = newTranslate;
      sidebar.style.transform = `translateX(${newTranslate}px)`;

      overlay.style.opacity = String(1 - (newTranslate / sidebarWidth));
    }

    /**
     * Chiude il drag della sidebar e decide se aprirla o chiuderla in
     * base alla posizione finale.
     */
    function endDragSidebar() {
      if (!isDraggingSidebar) return;
      isDraggingSidebar = false;
      const shouldOpen = currentTranslateSidebar < (sidebarWidth / 2);
      if (shouldOpen) setSidebarOpen(true);
      else setSidebarOpen(false);

      document.removeEventListener('mousemove', onMouseMoveSidebar);
      document.removeEventListener('mouseup', onMouseUpSidebar);
      document.removeEventListener('touchmove', onTouchMoveSidebar);   // [FIX 6c]
    }

    // --- Touch ---
    handle.addEventListener('touchstart', (ev) => {
      if (!ev.touches || ev.touches.length === 0) return;
      startDragSidebar(ev.touches[0].clientX);
    }, {passive: true});

    function onTouchMoveSidebar(ev) {   // [FIX 6c] funzione con nome, così si può rimuovere
      if (!isDraggingSidebar) return;
      if (ev.touches && ev.touches.length) {
        onDragSidebar(ev.touches[0].clientX);
        ev.preventDefault();
      }
    }

    document.addEventListener('touchend', () => { if (isDraggingSidebar) endDragSidebar(); }, {passive: true});

    // --- Mouse ---
    function onMouseMoveSidebar(e) { onDragSidebar(e.clientX); }
    function onMouseUpSidebar() { endDragSidebar(); }

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDragSidebar(e.clientX);
      document.addEventListener('mousemove', onMouseMoveSidebar);
      document.addEventListener('mouseup', onMouseUpSidebar);
    });

    // Accessibilità da tastiera: Enter o Spazio aprono/chiudono
    handle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSidebarOpen(!isSidebarOpen);
      }
    });

    // Edge-swipe dal bordo destro per aprire la sidebar
    document.addEventListener('touchstart', (ev) => {
      if (!ev.touches) return;
      const x = ev.touches[0].clientX;
      const y = ev.touches[0].clientY;
      const headerHeight = 50;
      const edgeWidth = 28;
      const sidebarRect = sidebar.getBoundingClientRect();

      if (!isSidebarOpen) {
        if (x > (window.innerWidth - edgeWidth) && y > headerHeight) startDragSidebar(x);
      } else {
        if (x >= sidebarRect.left && x <= (sidebarRect.left + edgeWidth) && y > headerHeight) startDragSidebar(x);
      }
    }, {passive: true});

    // Aggiorna la larghezza della sidebar al resize
    window.addEventListener('resize', () => {
      sidebarWidth = sidebar.offsetWidth || sidebarWidth;
      if (!isSidebarOpen) {
        currentTranslateSidebar = sidebarWidth;
        sidebar.style.transform = `translateX(${sidebarWidth}px)`;
      }
    });
  }

  // ── Drawer EPG laterale ──
  // Stessa logica della sidebar, ma con edge-swipe dal bordo destro del
  // drawer quando è aperto (che è a sua volta sul bordo destro dello
  // schermo). Bloccato se la sidebar delle opzioni è aperta.
  const epgDrawer = document.getElementById("channelEpgDrawer");
  if (epgDrawer) {
    let isDraggingEPG = false;
    let dragStartXEPG = 0;
    let startTranslateEPG = 0;
    let drawerWidth = epgDrawer.offsetWidth || 350;
    let currentTranslateEPG = 0;

    function startDragEPG(clientX) {
      isDraggingEPG = true;
      drawerWidth = epgDrawer.offsetWidth || drawerWidth;
      dragStartXEPG = clientX;
      startTranslateEPG = 0;
      epgDrawer.style.transition = "none";
      document.addEventListener("touchmove", onTouchMoveEPG, {passive: false});   // [FIX 6c] solo durante il trascinamento
    }

    function onDragEPG(clientX) {
      if (!isDraggingEPG) return;
      const delta = dragStartXEPG - clientX;
      let newTranslate = startTranslateEPG - delta;
      newTranslate = Math.max(0, Math.min(drawerWidth, newTranslate));
      currentTranslateEPG = newTranslate;
      epgDrawer.style.transform = `translateX(${newTranslate}px)`;
    }

    function endDragEPG() {
      if (!isDraggingEPG) return;
      isDraggingEPG = false;
      document.removeEventListener("touchmove", onTouchMoveEPG);   // [FIX 6c]
      const shouldClose = currentTranslateEPG > drawerWidth / 3;
      epgDrawer.style.transition = "";

      if (shouldClose) {
        epgDrawer.classList.remove("open");
        epgDrawer.style.transform = `translateX(${drawerWidth}px)`;
        setTimeout(() => {
          epgDrawer.classList.add("hidden");
          epgDrawer.style.transform = "";
        }, 300);
      } else {
        epgDrawer.style.transform = "translateX(0)";
      }
    }

    document.addEventListener("touchstart", (ev) => {
      if (!ev.touches) return;

      // Se la sidebar opzioni è aperta, blocca lo swipe EPG
      if (sidebar && sidebar.classList.contains("open")) return;

      const x = ev.touches[0].clientX;
      const y = ev.touches[0].clientY;
      const headerHeight = 50;
      const edgeWidth = 28;

      if (epgDrawer.classList.contains("open")) {
        const rect = epgDrawer.getBoundingClientRect();
        if (x >= rect.left && x <= rect.left + edgeWidth && y > headerHeight) {
          startDragEPG(x);
        }
      }
    }, {passive: true});

    function onTouchMoveEPG(ev) {   // [FIX 6c] funzione con nome, così si può rimuovere
      if (!isDraggingEPG) return;
      if (ev.touches && ev.touches.length) {
        onDragEPG(ev.touches[0].clientX);
        ev.preventDefault();
      }
    }

    document.addEventListener("touchend", () => { if (isDraggingEPG) endDragEPG(); }, {passive: true});
  }
})();


// ============================================================================
// 36. TAB SIDEBAR (ASPETTO / PLAYER / CONTENUTI / SISTEMA)
// ============================================================================

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});


// ============================================================================
// 37. TAB ASPETTO — TEMA E DIMENSIONE TESTO
// ============================================================================

// Sincronizza il toggle tema della sidebar con il toggle nascosto
document.getElementById("themeToggleSidebar").onchange = () =>
  document.getElementById("themeToggle").click();

// Font size con step di 5%. Il valore è applicato come font-size su <html>
// così scala tutti i rem/em dell'app.
const fontSizeRange = document.getElementById("fontSizeRange");
const fontSizeValue = document.getElementById("fontSizeValue");

fontSizeRange.addEventListener("input", () => {
  const roundedValue = Math.round(fontSizeRange.value / 5) * 5;
  fontSizeRange.value = roundedValue;

  document.documentElement.style.fontSize = roundedValue + "%";
  fontSizeValue.textContent = roundedValue + "%";
  localStorage.setItem("zappone_font_size", roundedValue);
});

// Ripristina il valore salvato all'avvio
if (localStorage.getItem("zappone_font_size")) {
  const fs = parseInt(localStorage.getItem("zappone_font_size"));
  const roundedFs = Math.round(fs / 5) * 5;
  fontSizeRange.value = roundedFs;
  fontSizeValue.textContent = roundedFs + "%";
  document.documentElement.style.fontSize = roundedFs + "%";
}


// ============================================================================
// 38. TAB CONTENUTI — URL PREDEFINITI M3U / EPG
// ============================================================================
//
// Tre pulsanti per ciascun tipo di contenuto:
//   - Salva:      salva l'URL corrente in localStorage
//   - Reset:      ripristina l'URL di default fornito dal server
//   - Carica:     scarica e attiva il contenuto
//
// I campi vengono precompilati con priorità: valore in localStorage >
// valore di default dal server. A inizio script i valori del server non
// sono ancora arrivati (getConfigFromServer è asincrona), quindi i campi
// vengono rivalorizzati dentro DOMContentLoaded dopo la config.
// ============================================================================

const defaultM3UInput = document.getElementById("defaultM3UInput");
const defaultEPGInput = document.getElementById("defaultEPGInput");

defaultM3UInput.value = localStorage.getItem("zappone_default_m3u") || DEFAULT_PLAYLIST_URL || '';
defaultEPGInput.value = localStorage.getItem("zappone_default_epg") || epgUrl || '';


// Salvataggio URL
document.getElementById("saveM3UDefault").onclick = () => {
  localStorage.setItem("zappone_default_m3u", defaultM3UInput.value);
  showNotification("URL M3U salvato");
};
document.getElementById("saveEPGDefault").onclick = () => {
  localStorage.setItem("zappone_default_epg", defaultEPGInput.value);
  epgUrl = defaultEPGInput.value;
  showNotification("URL EPG salvato");
};


// Caricamento playlist predefinita
document.getElementById("loadM3UDefault").onclick = async () => {
  const url = localStorage.getItem("zappone_default_m3u") || DEFAULT_PLAYLIST_URL;
  await loadRemoteM3U(url, false);
};


// Caricamento EPG predefinito
document.getElementById("loadEPGDefault").onclick = async () => {
  const url = localStorage.getItem("zappone_default_epg") || epgUrl;
  window.forceEPGReload = true;
  await downloadEPG(url, { setActive: true, updateUI: true });
  if (typeof renderEPGManager === 'function') renderEPGManager();
};


// Reset URL M3U al valore di default del server
document.getElementById("resetM3U").onclick = () => {
  localStorage.setItem("zappone_default_m3u", DEFAULT_PLAYLIST_URL);
  defaultM3UInput.value = DEFAULT_PLAYLIST_URL;
  showNotification("URL M3U ripristinato");
};


// Reset URL EPG al valore di default del server
document.getElementById("resetEPG").onclick = () => {
  localStorage.setItem("zappone_default_epg", epgUrl);
  defaultEPGInput.value = epgUrl;
  showNotification("URL EPG ripristinato");
};


// ============================================================================
// 39. TAB SISTEMA — HARD RESET
// ============================================================================
//
// Cancella TUTTO: localStorage, IndexedDB (M3U + ZappOneDB), CacheStorage,
// Service Worker. Riporta l'app allo stato "prima installazione".
//
// Sequenza importante:
//   1. closeDB() prima di deleteDatabase(): senza, il browser risponde
//      con onblocked e il DB non viene cancellato perché la connessione
//      è ancora aperta;
//   2. clear localStorage;
//   3. delete DB (in parallelo);
//   4. clear cache + unregister SW;
//   5. reset dello stato runtime (array, mappe, ecc.);
//   6. reload della pagina.
// ============================================================================

document.getElementById("hardReset").onclick = async () => {
  // [FIX 1] Prima l'Hard Reset cancellava anche licenza e ID dispositivo: bisognava reinserire la
  // chiave e, se l'ID cambiava, si occupava un nuovo slot dispositivo sul server. Ora la licenza
  // resta (come già avviene in "Reset impostazioni"). Per cambiarla c'è "Cambia licenza".
  if (!confirm("Sei sicuro di voler eseguire un Hard Reset?\n\nLa licenza resterà salvata su questo dispositivo.")) return;

  try {
    // 1. Pulisci localStorage (conservando la licenza)
    const KEEP_KEYS = ['zappone_license', 'zappone_jwt', 'zappone_device_id', 'zappone_config_cache'];
    const keptValues = KEEP_KEYS.map(k => [k, localStorage.getItem(k)]).filter(([, v]) => v !== null);
    localStorage.clear();
    keptValues.forEach(([k, v]) => localStorage.setItem(k, v));

    // 2. Chiudi la connessione IndexedDB PRIMA di cancellare i DB
    if (typeof closeDB === 'function') {
      await closeDB();
    }

    // 3. Cancella i database IndexedDB (ZappOneDB non è più usato ma
    //    potrebbe esistere su installazioni vecchie)
    await Promise.all([
      deleteDB("ZappOneDB"),
      deleteDB("M3UPlaylistsDB")
    ]);

    // 4. Cancella la Cache Storage
    if ("caches" in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        console.log("CacheStorage cleared");
      } catch (e) {
        console.warn("Cache clear failed", e);
      }
    }

    // 5. Unregister di tutti i Service Worker
    if ("serviceWorker" in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        console.log("Service workers unregistered");
      } catch (e) {
        console.warn("SW unregister failed", e);
      }
    }

    // 6. Azzera lo stato runtime in memoria
    channels = [];
    groupedChannels = [];
    favoriteChannels = [];
    groupedFavoriteChannels = [];
    epgData = [];
    rebuildEpgMap();
    showingFavorites = false;
    currentViewMode = "list";
    groupCollapseState = {};
    favoriteGroupCollapseState = {};
    window.currentChannelUrl = null;
    window.isPlaylistView = false;
    window.isEPGView = false;
    if (window.hlsInstance) {
      try { window.hlsInstance.destroy(); } catch (e) {}
      window.hlsInstance = null;
    }

    // 7. Reload con replace (evita di lasciare la vecchia pagina in history)
    setTimeout(() => {
      window.location.replace(window.location.origin + window.location.pathname);
    }, 300);

  } catch (err) {
    console.error("Hard reset failed:", err);
    alert("Errore durante Hard Reset: vedi console per dettagli.");
  }
};


// ============================================================================
// 40. TAB PLAYER — TOGGLE PANNELLI (EPG, METADATI, FULLSCREEN, RADIO)
// ============================================================================

// ── Toggle "Mostra Metadati" ──
// Quando attivato, forza l'espansione del pannello e lo popola col canale
// attivo. Quando disattivato, nasconde il pannello e svuota il contenuto.
document.getElementById("toggleMetadata").onchange = e => {
  const enabled = e.target.checked;
  localStorage.setItem("zappone_show_metadata", enabled);

  const header    = document.getElementById("metadataHeader");
  const container = document.getElementById("metadataContainer");

  if (enabled) {
    metadataExpanded = true;
    localStorage.setItem("metadataExpanded", "true");

    header.style.display = "flex";
    container.classList.add("expanded");
    container.style.display = "block";

    const active = (typeof getActiveChannel === 'function') ? getActiveChannel() : null;
    if (active && typeof showChannelMetadata === 'function') {
      showChannelMetadata(active);
    }
  } else {
    header.style.display = "none";
    container.classList.remove("expanded");
    container.style.display = "none";
    metadataExpanded = false;
    localStorage.setItem("metadataExpanded", "false");

    const content = document.getElementById("metadataContent");
    if (content) content.innerHTML = "";
  }
};

// Stato iniziale al caricamento
let saved = localStorage.getItem("zappone_show_metadata");
if (saved === null) {
  saved = "false";
  localStorage.setItem("zappone_show_metadata", "false");
}

if (saved === "true") {
  document.getElementById("toggleMetadata").checked = true;
  document.getElementById("metadataHeader").style.display = "flex";

  if (metadataExpanded) {
    document.getElementById("metadataContainer").classList.add("expanded");
    document.getElementById("metadataContainer").style.display = "block";
  } else {
    document.getElementById("metadataContainer").classList.remove("expanded");
    document.getElementById("metadataContainer").style.display = "none";
  }
} else {
  document.getElementById("metadataHeader").style.display = "none";
  document.getElementById("metadataContainer").style.display = "none";
}


// ── Toggle "Mostra Guida Canali" (EPG) ──
document.getElementById("toggleEPG").onchange = async e => {
  const enabled = e.target.checked;
  localStorage.setItem("zappone_show_epg", String(enabled));

  const epgHeader    = document.getElementById("epgHeader");
  const epgContainer = document.getElementById("epgContainer");
  const epgContent   = document.getElementById('epgContent');
  const arrow        = document.querySelector('#epgHeader .metadata-arrow');

  if (enabled) {
    epgHeader.style.display    = "flex";
    epgContainer.style.display = "block";
    if (epgContent) epgContent.style.display = "block";
    if (arrow) arrow.classList.remove('collapsed');
    localStorage.setItem('epgCollapsed', 'false');

    try {
      const active = (typeof getActiveChannel === 'function') ? getActiveChannel() : null;
      const lastUrl = !active && localStorage.getItem("zappone_last_played")
        ? localStorage.getItem("zappone_last_played")
        : null;
      const channelToShow = active || (lastUrl
        ? (channelUrlMap.get(lastUrl) || favoriteUrlMap.get(lastUrl))
        : null);

      if (channelToShow && typeof showChannelEPG === 'function') {
        showChannelEPG(channelToShow);
      } else if (epgContent) {
        epgContent.innerHTML = `<div class="epg-message"><p>Nessun canale selezionato</p></div>`;
      }
    } catch (err) {
      console.warn('EPG refresh on toggle failed', err);
    }
  } else {
    epgHeader.style.display    = "none";
    epgContainer.style.display = "none";
    if (epgContent) epgContent.innerHTML = '';
    localStorage.setItem('epgCollapsed', 'false');
  }
};

// Stato iniziale al caricamento
let savedEPG = localStorage.getItem("zappone_show_epg");
if (savedEPG === null) {
  savedEPG = "false";
  localStorage.setItem("zappone_show_epg", "false");
}

if (savedEPG === "true") {
  document.getElementById("toggleEPG").checked = true;
  document.getElementById("epgHeader").style.display = "flex";
  document.getElementById("epgContainer").style.display = "block";

  const epgCollapsed = localStorage.getItem('epgCollapsed') === 'true';
  const epgContent = document.getElementById('epgContent');
  const arrow = document.querySelector('#epgHeader .metadata-arrow');
  if (epgContent) epgContent.style.display = epgCollapsed ? 'none' : 'block';
  if (arrow) arrow.classList.toggle('collapsed', epgCollapsed);
} else {
  document.getElementById("epgHeader").style.display = "none";
  document.getElementById("epgContainer").style.display = "none";
}

// ── Toggle "Aggiorna EPG automaticamente" ──
// Se disattivato, handleEPGLoading esce subito senza processare
// nessun URL EPG dell'header della playlist. L'EPG attivo già in
// IndexedDB resta disponibile tramite getActiveEPG().
document.getElementById("autoUpdateEpgToggle").onchange = e => {
  const enabled = e.target.checked;
  localStorage.setItem("zappone_auto_update_epg", String(enabled));
};

// Stato iniziale: default ON (comportamento attuale).
(function initAutoUpdateEpgToggle() {
  const chk = document.getElementById("autoUpdateEpgToggle");
  if (!chk) return;
  const stored = localStorage.getItem("zappone_auto_update_epg");
  const enabled = stored === null ? true : stored === "true";
  chk.checked = enabled;
  if (stored === null) {
    localStorage.setItem("zappone_auto_update_epg", "true");
  }
})();

// ── Toggle "Schermo intero automatico (iOS)" ──
document.getElementById("autoFullscreenToggle").onchange = e => {
  localStorage.setItem("zappone_auto_fullscreen", e.target.checked);
};

if (localStorage.getItem("zappone_auto_fullscreen") === "true") {
  document.getElementById("autoFullscreenToggle").checked = true;
} else {
  document.getElementById("autoFullscreenToggle").checked = false;
  localStorage.setItem("zappone_auto_fullscreen", "false");
}


// ── Toggle "Mostra URL playlists/EPG" ──
// Cambiando il toggle, le liste Playlist/EPG devono essere ridisegnate per
// mostrare o nascondere la riga di URL sotto il nome.
document.getElementById("showPlaylistUrl").onchange = e => {
  localStorage.setItem("zappone_show_playlist_url", e.target.checked);

  window.forcePlaylistReload = true;
  window.forceEPGReload = true;

  const playlistContainer = document.getElementById('playlistListContainer');
  const epgContainer = document.getElementById('epgListContainer');

  if (playlistContainer && !playlistContainer.classList.contains('hidden')) {
      if (typeof renderPlaylistList === 'function') renderPlaylistList();
  }
  else if (epgContainer && !epgContainer.classList.contains('hidden')) {
      if (typeof renderEPGManager === 'function') renderEPGManager();
  }
};

if (localStorage.getItem("zappone_show_playlist_url") === "true") {
  document.getElementById("showPlaylistUrl").checked = true;
} else {
  document.getElementById("showPlaylistUrl").checked = false;
  localStorage.setItem("zappone_show_playlist_url", "false");
}


// ============================================================================
// 41. TAB SISTEMA — TOGGLE NOTIFICHE E CONSOLE
// ============================================================================

// Toggle "Mostra messaggi console" (intercettazione console)
(function setupConsoleInterceptToggle() {
  const chk = document.getElementById('consoleInterceptToggle');
  if (!chk) return;

  const enabled = localStorage.getItem('zappone_console_overlay') === 'true';
  chk.checked = enabled;

  chk.addEventListener('change', (e) => {
    const on = !!e.target.checked;
    localStorage.setItem('zappone_console_overlay', on ? 'true' : 'false');

    if (on) {
      enableConsoleIntercept();
    } else {
      disableConsoleIntercept();
    }
  });
})();


// Toggle "Mostra notifiche" (popup toast). Default: attivo.
(function setupPopupNotificationsToggle() {
  const chk = document.getElementById('popupNotificationsToggle');
  if (!chk) return;

  const stored = localStorage.getItem('zappone_popup_notifications');
  const enabled = stored === null ? true : stored === 'true';
  chk.checked = enabled;

  chk.addEventListener('change', (e) => {
    const on = !!e.target.checked;
    localStorage.setItem('zappone_popup_notifications', on ? 'true' : 'false');
  });
})();


// ============================================================================
// 42. SIDEBAR — LISTA URL PLAYLIST SALVATE
// ============================================================================
//
// La sidebar ha una piccola lista (#savedM3UList) che mostra i nomi delle
// playlist salvate. Cliccare una voce la attiva; il cestino accanto la
// elimina.
//
// Questa lista è INDIPENDENTE dalla vista playlist manager (#playlistList):
// mostra le stesse playlist ma in formato compatto, senza gruppi né
// trascinamento.
// ============================================================================

/**
 * Popola la lista dei URL salvati nella sidebar.
 * Per ogni playlist crea un <li> con link di attivazione e bottone elimina.
 */
async function loadM3UUrlList() {
  const urlList = document.getElementById('savedM3UList');
  urlList.innerHTML = '';

  const urls = await getAllM3UUrls();

  urls.forEach(item => {
    const li = document.createElement('li');
    li.classList.add('saved-url-item');

    const link = document.createElement('a');
    link.href = '#';
    link.textContent = item.name || item.url;
    link.classList.add('saved-url-link');
    link.title = item.url;

    link.dataset.id = item.id;

    // Click sul link: attiva la playlist (scaricandola se necessario)
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const playlistId = e.currentTarget.dataset.id;

      // Validazione ID per evitare l'errore IndexedDB "invalid key"
      if (!playlistId || isNaN(playlistId)) return;

      const rec = await getM3UById(Number(playlistId));
      if (!rec) return;

      const isLocal = !rec.url || !rec.url.startsWith('http');

      if (isLocal) {
        // Playlist locale: il contenuto è già in IndexedDB
        showNotification(`Caricamento locale: ${rec.name}`);

        if (rec.content) {
            await saveAndActivateM3U({ url: rec.url, name: rec.name, content: rec.content });
            await parseM3U(rec.content, false);
            console.log("Playlist locale caricata.");
        } else {
            console.error("Errore: contenuto locale mancante nel DB.");
            return;
        }
      } else {
        // Playlist remota: riscarica il contenuto e aggiorna il DB
        showNotification(`Aggiornamento: ${rec.name}`);
        try {
          const text = await fetchM3UWithProxies(rec.url);

          if (!text) throw new Error("Download fallito o risposta vuota");

          await updateM3URecord(rec.id, { content: text, lastFetched: Date.now() });
          await saveAndActivateM3U({ url: rec.url, name: rec.name, content: text });
          await parseM3U(text, false);

          console.log(`Playlist "${rec.name}" aggiornata con successo.`);
        } catch (err) {
          console.error(`Errore durante l'aggiornamento remoto: ${err.message}`);
          return;
        }
      }

      updateButtons();
      window.isPlaylistView = false;
      if (typeof showChannelList === 'function') showChannelList();
      if (typeof closeBottomSheet === 'function') closeBottomSheet();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.classList.add('delete-url-btn');

    deleteBtn.addEventListener('click', async () => {
      if (confirm('Eliminare questo URL?')) {
        const success = await deleteM3UUrl(item.id);
        if (success) {
          refreshPlaylistUIs();
          showNotification('URL eliminato');
        }
      }
    });

    li.appendChild(link);
    li.appendChild(deleteBtn);
    urlList.appendChild(li);
  });

  if (urls.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Nessun URL salvato';
    li.classList.add('no-url-message');
    urlList.appendChild(li);
  }
}

// ============================================================================
// 43. REFRESH UI PLAYLIST
// ============================================================================

/**
 * Aggiorna contemporaneamente tutte le viste che mostrano le playlist:
 *   - ricarica la lista URL nella sidebar (#savedM3UList);
 *   - se la vista playlist manager è aperta, la ridisegna;
 *   - aggiorna lo stato del pulsante preferiti.
 *
 * Va chiamata dopo ogni operazione che modifica l'insieme delle playlist
 * salvate o la playlist attiva (aggiunta, eliminazione, cambio attivo).
 */
function refreshPlaylistUIs() {
    window.forcePlaylistReload = true;
    loadM3UUrlList();

    if (window.isPlaylistView) {
        renderPlaylistList();
    }

    updateToggleState();
}


/**
 * Placeholder storico per un eventuale refresh esplicito del drag & drop.
 * Non serve implementazione: la delegazione degli eventi è già attiva e
 * permanente su #channelList, non richiede refresh dopo i re-render.
 * Mantenuta per non rompere eventuali controlli `typeof === 'function'`.
 */
function refreshDragAndDrop() {
    // no-op intenzionale
}


// ============================================================================
// 44. HANDLER "CLICK SU PLAYLIST" RIUTILIZZABILE
// ============================================================================

/**
 * Costruisce un handler di click per attivare una playlist già salvata.
 *
 * Nota: la vista playlist manager ha il suo proprio handler inline in
 * renderPlaylistList (con evidenziazione immediata della tile). Questa
 * factory era pensata per essere riutilizzata in contesti diversi, ma
 * al momento non è chiamata da nessuna parte del codice attivo.
 *
 * @param {Object} playlist  record playlist da IndexedDB
 * @returns {Function}       handler async da agganciare come onclick
 */
function handlePlaylistClick(playlist) {
    return async function() {
        const rec = await getM3UById(playlist.id);
        let text = rec?.content;

        if (!text) {
            text = await downloadM3U(rec.url);
            await updateM3URecord(rec.id, { content: text, lastFetched: Date.now() });
        }

        await saveAndActivateM3U({ url: rec.url, name: rec.name, content: text });
        await parseM3U(text, false);
        updateButtons();
        window.isPlaylistView = false;

        if (typeof closeBottomSheet === 'function') closeBottomSheet();
    };
}


// ============================================================================
// 45. BOTTOM SHEET M3U — APERTURA E CHIUSURA
// ============================================================================
//
// Il bottom sheet per caricare una playlist da URL si apre da:
//   - riga "Aggiungi Playlist" nella vista playlist manager;
//   - clic sull'immagine di stato vuoto nella vista playlist manager.
// Contiene due campi (nome, URL), tre pulsanti secondari (locale,
// predefinita, annulla) e il pulsante primario "Carica playlist".
// ============================================================================

/**
 * Apre il bottom sheet per il caricamento M3U da URL, con animazione di
 * scorrimento dal basso. Il focus viene spostato sul campo nome.
 */
function openBottomSheet() {
  const bottomSheet = document.getElementById("m3uUrlBottomSheet");
  const overlay = document.getElementById("bottomSheetOverlay");

  bottomSheet.classList.remove("hidden");
  overlay.classList.remove("hidden");

  setTimeout(() => {
    bottomSheet.classList.add("open");
    overlay.classList.add("open");
  }, 10);

  setTimeout(() => {
    document.getElementById("modalM3UName").focus();
  }, 300);
}


/**
 * Chiude il bottom sheet M3U con animazione di scorrimento verso il basso
 * e nasconde l'overlay dopo la transizione.
 */
function closeBottomSheet() {
  const bottomSheet = document.getElementById("m3uUrlBottomSheet");
  const overlay = document.getElementById("bottomSheetOverlay");

  bottomSheet.classList.remove("open");
  overlay.classList.remove("open");

  setTimeout(() => {
    bottomSheet.classList.add("hidden");
    overlay.classList.add("hidden");
  }, 300);
}


// Guard flags per evitare caricamenti concorrenti (doppio click)
let modalEPGLoadingLock = false;


// ============================================================================
// 46. CARICAMENTO AUTOMATICO M3U DA URL (BOTTOM SHEET)
// ============================================================================


// ============================================================================
// 47. WIRING BOTTOM SHEET M3U — CAMPI E PULSANTI
// ============================================================================

// Campo URL: al paste suggerisce il nome dal filename, ma NON carica
const modalM3UUrlInput = document.getElementById('modalM3UUrl');
if (modalM3UUrlInput) {
  modalM3UUrlInput.addEventListener('paste', (e) => {
    setTimeout(() => {
      const url = modalM3UUrlInput.value.trim();
      if (url) {
        const nameEl = document.getElementById('modalM3UName');
        if (nameEl && !nameEl.value) {
          try {
            const guessed = new URL(url).pathname.split('/').pop();
            if (guessed) nameEl.value = guessed;
          } catch (err) { /* URL invalido durante il paste: ignora */ }
        }
      }
    }, 0);
  });

  // Enter sul campo URL sposta il focus sul pulsante di caricamento
  // invece di inviare il form (comportamento più prevedibile su mobile).
  modalM3UUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const saveBtn = document.getElementById('m3uSaveBtn') || document.getElementById('modalConfirm');
      if (saveBtn) saveBtn.focus();
    }
  });
}


// Pulsante "Locale": apre il file picker M3U
document.getElementById('m3uLocalBtn')?.addEventListener('click', () => {
  document.getElementById('fileInput').click();
});


// Pulsante "Predefinita": carica la playlist di default dal server
// (o quella salvata in localStorage se premium ha personalizzato)
document.getElementById('loadM3UDefaultInSheet')?.addEventListener('click', async () => {
  const url = (appConfig.isPremium && localStorage.getItem("zappone_default_m3u"))
              || appConfig.playlistUrl;

  if (url) {
    await loadRemoteM3U(url, true);
  } else {
    showNotification("URL Playlist non disponibile", true);
  }
});


// ============================================================================
// 48. WIRING BOTTOM SHEET EPG — PULSANTI
// ============================================================================

// Pulsante "Carica EPG" del bottom sheet EPG
document.getElementById('epgSaveBtn')?.addEventListener('click', async (e) => {
  window.forceEPGReload = true;
  const confirmEPG = document.getElementById('modalConfirmEPG');
  if (confirmEPG) {
    confirmEPG.click();
    return;
  }

  // Fallback nel caso il pulsante hidden manchi (non dovrebbe capitare)
  const name = document.getElementById('modalEPGName').value.trim();
  const epgUrlValue = document.getElementById('modalEPGUrl').value.trim();
  if (!name || !epgUrlValue) { alert('Inserisci sia nome che URL.'); return; }
  try {
    const data = await downloadEPG(epgUrlValue);
    const rec = await saveAndActivateEPG({ url: epgUrlValue, name, content: JSON.stringify(data) });
    showNotification('EPG salvato e caricato');
    closeEPGBottomSheet();
    if (typeof renderEPGManager === 'function') renderEPGManager();
  } catch (err) {
    console.error(err);
    alert('Errore nel caricamento EPG da URL.');
  }
});


// Pulsante "Annulla": svuota i campi e chiude il bottom sheet EPG
document.getElementById('epgCancelBtn')?.addEventListener('click', (e) => {
  const urlInput = document.getElementById('modalEPGUrl');
  const nameInput = document.getElementById('modalEPGName');
  if (urlInput) urlInput.value = '';
  if (nameInput) nameInput.value = '';
  closeEPGBottomSheet();
});


// ============================================================================
// 49. WIRING BOTTOM SHEET M3U — SALVA E ANNULLA
// ============================================================================

// Pulsante "Carica playlist" (equivalente al vecchio modalConfirm)
document.getElementById('m3uSaveBtn')?.addEventListener('click', async (e) => {
  window.forcePlaylistReload = true;
  const confirmBtn = document.getElementById('modalConfirm');
  if (confirmBtn) {
    confirmBtn.click();
    return;
  }

  // Fallback nel caso modalConfirm non sia presente
  const name = document.getElementById('modalM3UName').value.trim();
  const playlistUrl = document.getElementById('modalM3UUrl').value.trim();
  if (!name || !playlistUrl) { alert('Inserisci sia nome che URL.'); return; }
  try {
    const text = await downloadM3U(playlistUrl);
    // [FIX 2b] niente salvataggio/attivazione se il download è fallito o non è una playlist
    if (!isValidM3UText(text)) throw new Error('Playlist non valida o non raggiungibile');
    const rec = await saveAndActivateM3U({ url: playlistUrl, name, content: text });
    await parseM3U(rec.content, true);
    showingFavorites = false;
    updateButtons?.();
    refreshPlaylistUIs?.();
    closeBottomSheet();
  } catch (err) {
    console.error(err);
    alert('Errore nel caricamento da URL');
  }
});


// Pulsante "Annulla": svuota i campi e chiude il bottom sheet M3U
document.getElementById('m3uCancelBtn')?.addEventListener('click', (e) => {
  const urlInput = document.getElementById('modalM3UUrl');
  const nameInput = document.getElementById('modalM3UName');
  if (urlInput) urlInput.value = '';
  if (nameInput) nameInput.value = '';
  closeBottomSheet();
});


// ============================================================================
// 50. WIRING BOTTOM SHEET EPG — CAMPI E PULSANTI RAPIDI
// ============================================================================

// Campo URL EPG: al paste suggerisce il nome dal filename
const modalEPGUrlInput = document.getElementById('modalEPGUrl');
if (modalEPGUrlInput) {
  modalEPGUrlInput.addEventListener('paste', () => {
    setTimeout(() => {
      const url = modalEPGUrlInput.value.trim();
      if (url) {
        const nameEl = document.getElementById('modalEPGName');
        if (nameEl && !nameEl.value) {
          try {
            const guessed = new URL(url).pathname.split('/').pop();
            if (guessed) nameEl.value = guessed;
          } catch (err) { /* URL invalido durante il paste: ignora */ }
        }
      }
    }, 0);
  });

  // Enter sul campo URL sposta il focus sul pulsante di caricamento
  modalEPGUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const saveBtn = document.getElementById('epgSaveBtn') || document.getElementById('modalConfirmEPG');
      if (saveBtn) saveBtn.focus();
    }
  });
}


// Pulsante "Locale": apre il file picker EPG
document.getElementById('epgLocalBtn')?.addEventListener('click', () => {
  document.getElementById('epgFileInput').click();
});


// Pulsante "Predefinita": carica l'EPG di default dal server
document.getElementById('loadEPGDefaultInSheet')?.addEventListener('click', async () => {
    const url = (appConfig.isPremium && localStorage.getItem('zappone_default_epg'))
                || appConfig.epgUrl;

    if (url) {
        window.forceEPGReload = true;
        await autoLoadEPG(url, 'Default EPG');

        if (typeof renderEPGManager === 'function') {
            renderEPGManager();
        }
    } else {
        showNotification("URL EPG non disponibile", true);
    }
});


// ============================================================================
// 51. DRAG-TO-DISMISS DEI BOTTOM SHEET
// ============================================================================
//
// Entrambi i bottom sheet (M3U ed EPG) possono essere trascinati verso il
// basso per chiuderli. La maniglia visibile è `.bottom-sheet-handle`, ma
// è disponibile un'area hit più ampia `.bottom-sheet-drag-area` in cima
// allo sheet.
//
// Se il drag supera 1/3 dell'altezza del foglio, si chiude; altrimenti
// torna nella posizione aperta.
// ============================================================================

(function () {

  /**
   * Installa la logica di drag-to-dismiss su un bottom sheet.
   *
   * @param {string} sheetId      id del bottom sheet
   * @param {string} overlayId    id dell'overlay corrispondente
   * @param {Function} openFn     funzione che riapre il foglio (snap back)
   * @param {Function} closeFn    funzione che lo chiude
   */
  function setupBottomSheetDrag(sheetId, overlayId, openFn, closeFn) {
    const sheet = document.getElementById(sheetId);
    const overlay = document.getElementById(overlayId);
    if (!sheet || !overlay) return;

    let handle = sheet.querySelector('.bottom-sheet-handle, .bottom-sheet-drag-area');

    // Se non c'è né maniglia né area di drag, ne crea una al volo
    if (!handle) {
      handle = document.createElement('div');
      handle.className = 'bottom-sheet-handle';
      sheet.insertBefore(handle, sheet.firstChild);
    }

    let isDragging = false;
    let dragStartY = 0;
    let sheetHeight = 0;
    let currentTranslate = 0;

    function startDrag(clientY) {
      isDragging = true;
      dragStartY = clientY;
      sheetHeight = sheet.getBoundingClientRect().height;
      sheet.style.transition = 'none';
      overlay.style.transition = 'none';
    }

    function onDrag(clientY) {
      if (!isDragging) return;
      const delta = clientY - dragStartY;
      currentTranslate = Math.max(0, delta);
      sheet.style.transform = `translateY(${currentTranslate}px)`;
      overlay.style.opacity = String(1 - (currentTranslate / sheetHeight));
    }

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener('touchmove', onTouchMoveSheet);   // [FIX 6c]
      sheet.style.transition = '';
      overlay.style.transition = '';

      if (currentTranslate > sheetHeight / 3) {
        closeFn();
      } else {
        openFn();
      }
      sheet.style.transform = '';
      overlay.style.opacity = '';
    }

    // Touch
    handle.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length === 0) return;
      startDrag(e.touches[0].clientY);
      // [FIX 6c] il touchmove non passivo si registra solo mentre trascini (vedi nota sulla sidebar)
      document.addEventListener('touchmove', onTouchMoveSheet, { passive: false });
      e.preventDefault();
    }, { passive: false });

    function onTouchMoveSheet(e) {   // [FIX 6c] funzione con nome, così si può rimuovere
      if (isDragging) {
        onDrag(e.touches[0].clientY);
        e.preventDefault();
      }
    }

    document.addEventListener('touchend', () => {
      if (isDragging) endDrag();
    }, { passive: false });

    // Mouse
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e.clientY);
      const move = (ev) => onDrag(ev.clientY);
      const up = () => {
        endDrag();
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

    // Click sull'overlay -> chiude
    overlay.addEventListener('click', closeFn);
  }

  setupBottomSheetDrag('m3uUrlBottomSheet', 'bottomSheetOverlay', openBottomSheet, closeBottomSheet);
  setupBottomSheetDrag('epgUrlBottomSheet', 'bottomSheetOverlayEPG', openEPGBottomSheet, closeEPGBottomSheet);
})();


// ============================================================================
// 52. PILL "PREFERITI / TUTTI" — CLICK E LONG PRESS
// ============================================================================
//
// Il pill in header fa due cose diverse:
//   - click normale: alterna tra vista "Tutti" e vista "Preferiti";
//   - long press (>600 ms): attiva la modalità cancellazione.
//
// Dettaglio importante su iOS: dopo un long press viene generato un click
// sintetico che altrimenti interpreterebbe il long press come click. Un
// flag `ignoreNextClick` assorbe questo click fantasma.
// ============================================================================

(function setupFavoritesPill() {
  const pill = document.getElementById('favoritesPill');
  if (!pill) return;

  let ignoreNextClick = false;

  pill.addEventListener('click', async (e) => {
    // Assorbe il click fantasma generato dal long press su iOS
    if (ignoreNextClick) {
      ignoreNextClick = false;
      e.stopPropagation();
      return;
    }

    // Se siamo in modalità cancellazione, il click esce dalla modalità
    if (deletionMode) {
      toggleDeletionMode();
      e.stopPropagation();
      return;
    }

    // Alterna tra vista Tutti e vista Preferiti
    showingFavorites = !showingFavorites;
    saveViewModePreference(currentViewMode);

    // Assicura che siamo nella vista "canali": nascondi playlist, EPG
    // manager e player se erano aperti, e mostra i controlli in alto.
    const channelCont = document.getElementById('channelListContainer');
    const playlistCont = document.getElementById('playlistListContainer');
    const epgCont = document.getElementById('epgListContainer');
    const playerCont = document.getElementById('playerContainer');

    if (playlistCont) playlistCont.classList.add('hidden');
    if (epgCont) epgCont.classList.add('hidden');
    if (playerCont) playerCont.style.display = 'none';
    if (channelCont) channelCont.classList.remove('hidden');

    document.querySelector('.main-header')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('bottomTabBar')?.classList.remove('hidden');

    window.isPlaylistView = false;
    window.isEPGView = false;

    // Ridisegna la lista corretta
    renderGroupedChannelList(
      showingFavorites ? groupedFavoriteChannels : groupedChannels,
      { context: 'channels' }
    );

    updateToggleState();
    closeFullEPG();
  });

  // --- Long press per entrare in modalità cancellazione ---
  const startLongPress = (e) => {
    const isInAnyListView =
        !document.getElementById('channelListContainer').classList.contains('hidden') ||
        !document.getElementById('playlistListContainer').classList.contains('hidden') ||
        !document.getElementById('epgListContainer').classList.contains('hidden');

    if (!isInAnyListView) {
        e.preventDefault();
        return;
    }

    if (window._pillLongPressTimer) clearTimeout(window._pillLongPressTimer);
    window._pillLongPressTimer = setTimeout(() => {
        toggleDeletionMode();
        ignoreNextClick = true;
        window._pillLongPressTimer = null;
    }, 600);
  };

  const cancelLongPress = () => {
    if (window._pillLongPressTimer) {
      clearTimeout(window._pillLongPressTimer);
      window._pillLongPressTimer = null;
    }
  };

  pill.addEventListener('mousedown', startLongPress);
  pill.addEventListener('touchstart', startLongPress, { passive: true });
  pill.addEventListener('mouseup', cancelLongPress);
  pill.addEventListener('mouseleave', cancelLongPress);
  pill.addEventListener('touchend', cancelLongPress);
  pill.addEventListener('touchcancel', cancelLongPress);
})();


// ============================================================================
// 53. PILL "VISTA LISTA / GRIGLIA" — CLICK E LONG PRESS
// ============================================================================
//
// Il pill in header ha due modalità:
//   - viewMode (default): click alterna list-view / grid-view;
//   - collapseExpand:    click espande o comprime TUTTI i gruppi;
//                        si entra con un long press, si esce con un click
//                        fuori dal pill o un secondo long press.
//
// Anche qui c'è il fix del click fantasma iOS dopo il long press.
// ============================================================================

(function setupViewModePill() {
    const viewModePill = document.getElementById('viewModePill');
    if (!viewModePill) return;

    let viewPillMode = 'viewMode';
    let expandState = true;
    let longPressTimer = null;
    const LONG_PRESS_DURATION = 600;
    let longPressFired = false;

    let ignoreNextClick = false;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    /**
     * Aggiorna le classi del pill in base allo stato corrente
     * (viewMode vs collapse-mode, grid vs list, expanded vs collapsed).
     */
    function updateViewModePill() {
        viewModePill.classList.remove('collapse-mode', 'grid-mode', 'list-mode', 'is-collapsed', 'is-expanded');

        if (viewPillMode === 'viewMode') {
            viewModePill.classList.add(currentViewMode === 'grid' ? 'grid-mode' : 'list-mode');
        } else {
            viewModePill.classList.add('collapse-mode');
            viewModePill.classList.add(expandState ? 'is-expanded' : 'is-collapsed');
        }
    }

    /**
     * Espande o comprime tutti i gruppi nelle tre liste (canali, playlist,
     * EPG) e persiste lo stato in localStorage.
     *
     * @param {boolean} expand  true = espandi, false = comprimi
     */
    function toggleAllGroups(expand) {
        const containers = document.querySelectorAll('#channelList, #playlistList, #epgList');

        containers.forEach(container => {
            const groups = container.querySelectorAll('.group-content');
            groups.forEach(group => {
                group.style.display = expand ? '' : 'none';
                const header = group.previousElementSibling;
                if (header && header.classList.contains('group-header')) {
                    const toggleSpan = header.querySelector('.group-toggle');
                    if (toggleSpan) toggleSpan.textContent = expand ? '-' : '+';

                    const titleSpan = header.querySelector('.group-name') || header.querySelector('.group-title > span');
                    if (titleSpan) {
                        const name = titleSpan.textContent.trim();
                        if (showingFavorites) {
                            favoriteGroupCollapseState[name] = !expand;
                        } else {
                            groupCollapseState[name] = !expand;
                        }
                    }
                }
            });
        });
        saveGroupCollapseStates();
        expandState = !!expand;
    }

    // --- Click normale ---
    viewModePill.addEventListener('click', () => {
        // Assorbe il click fantasma generato dal long press su iOS
        if (isTouchDevice && ignoreNextClick) {
            ignoreNextClick = false;
            return;
        }

        if (longPressFired) {
            longPressFired = false;
            return;
        }

        if (viewPillMode === 'viewMode') {
            const newMode = currentViewMode === 'list' ? 'grid' : 'list';
            switchViewMode(newMode);
        } else {
            expandState = !expandState;
            toggleAllGroups(expandState);
        }
        updateViewModePill();
    });

    // --- Long press ---
    function startTimer() {
        longPressFired = false;
        longPressTimer = setTimeout(() => {
            viewPillMode = (viewPillMode === 'viewMode') ? 'collapseExpand' : 'viewMode';

            if (viewPillMode === 'collapseExpand') {
                expandState = false;
                toggleAllGroups(false);
            }
            updateViewModePill();
            longPressFired = true;

            if (isTouchDevice) {
                ignoreNextClick = true;
            }
        }, LONG_PRESS_DURATION);
    }

    function endTimer() { clearTimeout(longPressTimer); }

    viewModePill.addEventListener('mousedown', startTimer);
    viewModePill.addEventListener('mouseup', endTimer);
    viewModePill.addEventListener('mouseleave', endTimer);
    viewModePill.addEventListener('touchstart', startTimer, { passive: true });
    viewModePill.addEventListener('touchend', endTimer);

    // Uscita automatica dal modo collapseExpand quando l'utente
    // interagisce con un group-header o un tab-button fuori dal pill.
    document.addEventListener('click', e => {
        if (viewPillMode === 'collapseExpand' && !e.target.closest('#viewModePill')) {
            if (e.target.closest('.group-header') || e.target.closest('.tab-button')) {
                viewPillMode = 'viewMode';
                updateViewModePill();
            }
        }
    });

    updateViewModePill();
})();


// ============================================================================
// 54. ESPANSIONE GRUPPI NELLE LISTE PLAYLIST / EPG
// ============================================================================
//
// Le liste Playlist ed EPG (renderizzate da renderSavedItemsList) non
// hanno la logica di toggle inline come la lista canali: qui un listener
// globale intercetta il click su un group-header e gestisce il toggle
// direttamente. Il listener è in capture phase (true) per precedere
// eventuali listener di bubbling.
// ============================================================================

document.addEventListener('click', function (e) {
    const header = e.target.closest('.group-header');
    if (!header) return;

    // Solo per playlist/EPG: la lista canali ha già il suo handler
    const isPlaylistOrEpg = header.closest('#playlistList, #epgList, #playlistListContainer, #epgListContainer');

    if (isPlaylistOrEpg) {
        e.preventDefault();
        e.stopPropagation();

        const content = header.nextElementSibling;
        if (content && content.classList.contains('group-content')) {
            const isHidden = content.style.display === 'none' || getComputedStyle(content).display === 'none';

            content.style.display = isHidden ? 'block' : 'none';

            const toggleSpan = header.querySelector('.group-toggle');
            if (toggleSpan) {
                toggleSpan.textContent = isHidden ? '-' : '+';
            }

            const titleSpan = header.querySelector('.group-title span') || header.querySelector('.group-name');
            if (titleSpan) {
                const groupName = titleSpan.textContent.trim();
                groupCollapseState[groupName] = !isHidden;
                saveGroupCollapseStates();
            }
        }
    }

}, true);


// ============================================================================
// 55. PILL "OPZIONI / EXPORT / BACK" IN HEADER
// ============================================================================
//
// Il pill in alto a sinistra ha comportamento contestuale:
//   - in vista canali:          click = apre sidebar, long press = export;
//   - in vista playlist/EPG:    click = torna alla lista canali;
//   - in vista full EPG:        click = torna alla lista EPG manager.
//
// Il contesto è determinato osservando quali container sono visibili.
// Un MutationObserver tiene sincronizzata l'icona al cambio di contesto.
// ============================================================================

(function setupOptionsExportPill() {
  const pill = document.getElementById('optionsExportPill');
  const optionsBtn = document.getElementById('optionsBtn');
  const exportBtn = document.getElementById('exportButton');
  if (!pill || !optionsBtn || !exportBtn) return;

  const LONG_MS = 600;
  let timer = null;
  let longFired = false;
  let preventNextClick = false;

  /**
   * Determina il contesto corrente guardando quale container di primo
   * livello è visibile.
   * @returns {'channels'|'full-epg'|'playlists'|'epg'}
   */
  function getCurrentContext() {
    const fullEpgContainer = document.getElementById('fullEpgContainer');
    if (fullEpgContainer && !fullEpgContainer.classList.contains('hidden')) return 'full-epg';
    const playlistContainer = document.getElementById('playlistListContainer');
    if (playlistContainer && !playlistContainer.classList.contains('hidden')) return 'playlists';
    const epgContainer = document.getElementById('epgListContainer');
    if (epgContainer && !epgContainer.classList.contains('hidden')) return 'epg';
    return 'channels';
  }

  /**
   * Aggiorna icona e action del pill in base al contesto corrente.
   */
  function updatePillIcon() {
    const context = getCurrentContext();
    if (context === 'channels') {
      pill.setAttribute('data-action', 'back-to-playlists');
      pill.title = "Torna alla lista playlist";
      pill.classList.add('back-mode');
    } else if (context === 'full-epg') {
      pill.setAttribute('data-action', 'back-to-epg');
      pill.title = "Torna alla lista EPG";
      pill.classList.add('back-mode');
    } else {
      pill.setAttribute('data-action', 'options');
      pill.title = "Opzioni";
      pill.classList.remove('back-mode');
    }
  }

  updatePillIcon();

  // Osserva i cambi di visibilità dei container per aggiornare l'icona
  const observer = new MutationObserver(() => setTimeout(updatePillIcon, 50));
  ['fullEpgContainer', 'channelListContainer', 'playlistListContainer', 'epgListContainer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  // --- Click ---
  pill.addEventListener('click', function(e) {
    // Se il click è la conseguenza di un long press, ignoralo
    if (preventNextClick) {
      e.stopImmediatePropagation();
      e.preventDefault();
      preventNextClick = false;
      return;
    }
    const action = this.getAttribute('data-action');
    if (action === 'back-to-playlists') {
      if (typeof renderPlaylistList === 'function') renderPlaylistList();
    } else if (action === 'back-to-epg') {
      // Chiudi il drawer del singolo canale prima di tornare alla lista EPG
      const epgDrawer = document.getElementById('channelEpgDrawer');
      if (epgDrawer && epgDrawer.classList.contains('open')) {
          epgDrawer.classList.remove('open');
          setTimeout(() => epgDrawer.classList.add('hidden'), 300);
      }
      if (typeof renderEPGManager === 'function') renderEPGManager();
    } else {
      optionsBtn.click();
    }
  });

  /**
   * Esporta la playlist corrente senza chiudere l'app.
   * Il contenuto dipende dallo stato (preferiti o tutti).
   */
  async function exportWithoutClosing() {
    const exportList = showingFavorites ? favoriteChannels : channels;
    const m3uContent = generateM3UFromChannels(exportList);
    const suggestedName = await getSuggestedExportFilename();
    const userName = prompt("Nome del file da esportare:", suggestedName);
    if (!userName) return;
    const fileName = userName.endsWith('.m3u') ? userName : userName + '.m3u';
    const blob = new Blob([m3uContent], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Long press: solo in vista canali avvia l'export ---
  const start = () => {
    if (getCurrentContext() !== 'channels') return;
    longFired = false;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      longFired = true;
      preventNextClick = true;
      await exportWithoutClosing();
      pill.classList.add('long-fired');
      setTimeout(() => pill.classList.remove('long-fired'), 400);
    }, LONG_MS);
  };

  const stop = () => {
    clearTimeout(timer);
    if (longFired) {
      preventNextClick = true;
      setTimeout(() => (preventNextClick = false), 700);
    }
  };

  pill.addEventListener('mousedown', start);
  pill.addEventListener('touchstart', start, { passive: true });
  pill.addEventListener('mouseup', stop);
  pill.addEventListener('mouseleave', stop);
  pill.addEventListener('touchend', stop);
  pill.addEventListener('touchcancel', stop);
})();


// ============================================================================
// 56. RINOMINA PLAYLIST ED EPG — LONG PRESS SULLA TILE
// ============================================================================
//
// Long press su una tile di playlist/EPG per attivare l'edit inline del
// nome. Funziona solo su #playlistList e #epgList; la riga "Aggiungi
// Playlist/EPG" è esclusa perché ha data-url="#url".
//
// Il salvataggio avviene su IndexedDB via updateM3URecord / updateEPGRecord.
// La lista URL nella sidebar (#savedM3UList) viene riallineata per non
// mostrare il vecchio nome.
//
// Movimenti > 8 px durante il long press annullano l'attivazione, così il
// long press non interferisce con lo scroll.
// ============================================================================

(function setupRenameLongPress() {
  const LONG_PRESS_MS = 600;
  const SCROLL_TOLERANCE_PX = 8;

  let timer = null;
  let longPressFired = false;
  let startX = 0, startY = 0;

  /**
   * Trova la tile di playlist/EPG eleggibile per la rinomina.
   * Ritorna null se la tile non esiste o è la riga "Aggiungi".
   */
  function getEditableItem(target) {
    const item = target?.closest?.('.channel-item');
    if (!item) return null;
    const container = item.closest('#playlistList, #epgList');
    if (!container) return null;
    if (item.dataset.url === '#url') return null;
    return item;
  }

  function cancelPress() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function startPress(e) {
    const item = getEditableItem(e.target);
    if (!item) return;
    longPressFired = false;

    if (e.touches && e.touches[0]) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      longPressFired = true;
      enterRenameMode(item);
    }, LONG_PRESS_MS);
  }

  // Blocca il click sintetico che segue al long press (capture, prima
  // che gli handler delle tile lo intercettino)
  document.addEventListener('click', (e) => {
    if (longPressFired) {
      longPressFired = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  document.addEventListener('touchstart', startPress, { passive: true });
  document.addEventListener('mousedown', startPress);

  document.addEventListener('touchmove', (e) => {
    if (!timer) return;
    const t = e.touches[0];
    if (!t) return;
    if (Math.abs(t.clientX - startX) > SCROLL_TOLERANCE_PX ||
        Math.abs(t.clientY - startY) > SCROLL_TOLERANCE_PX) {
      cancelPress();
    }
  }, { passive: true });

  document.addEventListener('touchend', cancelPress, { passive: true });
  document.addEventListener('touchcancel', cancelPress, { passive: true });
  document.addEventListener('mouseup', cancelPress);
  document.addEventListener('mouseleave', cancelPress);

  /**
   * Salva su IndexedDB il nuovo nome della playlist o dell'EPG.
   *
   * @param {HTMLElement} item
   * @param {string} newName
   */
  async function saveRename(item, newName) {
    const isPlaylist = !!item.closest('#playlistList');
    if (isPlaylist) {
      const id = parseInt(item.dataset.playlistId, 10);
      if (!id) return;
      await updateM3URecord(id, { name: newName });
      // La lista in sidebar è separata: va riallineata per non mostrare
      // il vecchio nome fino al prossimo refresh automatico.
      if (typeof loadM3UUrlList === 'function') {
        await loadM3UUrlList();
      }
    } else {
      const id = parseInt(item.dataset.epgId, 10);
      if (!id) return;
      await updateEPGRecord(id, { name: newName });
    }
    item.dataset.name = newName.toLowerCase();
  }

  /**
   * Attiva l'edit inline del nome di una tile: sostituisce il testo con
   * un input, gestisce Enter/Escape/blur e salva o annulla.
   *
   * @param {HTMLElement} item  tile di playlist/EPG
   */
  function enterRenameMode(item) {
    if (item.querySelector('.rename-input')) return;
    const nameEl = item.querySelector('.channel-name');
    if (!nameEl) return;

    const currentName = nameEl.textContent.trim();

    // Feedback visivo brand durante l'edit
    item.style.transition = 'background 0.2s ease, border-color 0.2s ease';
    item.style.background = 'color-mix(in srgb, var(--brand-blue) 8%, transparent)';
    item.style.borderColor = 'color-mix(in srgb, var(--brand-blue) 45%, transparent)';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = currentName;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.style.cssText = `
      flex: 1;
      min-width: 0;
      margin-left: 10px;
      padding: 6px 10px;
      font: inherit;
      font-size: 1rem;
      font-weight: 500;
      color: var(--text-primary);
      background: var(--input-bg);
      border: 1px solid var(--brand-blue);
      border-radius: 8px;
      outline: none;
      box-sizing: border-box;
    `;

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    // Blocca click sull'item mentre si è in edit
    const stopClick = (ev) => ev.stopPropagation();
    item.addEventListener('click', stopClick, true);

    let finished = false;
    async function finish(save) {
      if (finished) return;
      finished = true;
      item.removeEventListener('click', stopClick, true);

      item.style.background = '';
      item.style.borderColor = '';

      const newName = input.value.trim();
      const finalName = (save && newName) ? newName : currentName;

      // Sostituisci l'input con uno span con le classi originali
      const restored = document.createElement('div');
      restored.className = nameEl.className;
      restored.textContent = finalName;
      input.replaceWith(restored);

      if (save && finalName !== currentName) {
        try {
          await saveRename(item, finalName);
          if (typeof showNotification === 'function') {
            showNotification('Nome aggiornato');
          }
        } catch (err) {
          console.error('Errore rinomina:', err);
          if (typeof showNotification === 'function') {
            showNotification('Errore nel salvataggio', true);
          }
        }
      }
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }
})();


// ============================================================================
// 57. CARICAMENTO FILE LOCALI (M3U O EPG)
// ============================================================================
//
// Gestisce il caricamento di un file locale tramite FileReader.
// Se il file termina in .gz, viene decompresso con DecompressionStream.
//
// Se è un EPG (XMLTV o JSON), viene salvato e parsato.
// Se è un M3U, viene salvato e attivato come playlist corrente,
// e l'EPG in memoria viene svuotato (una nuova playlist porta con sé
// un nuovo set di canali, un EPG precedente non ha più senso).
//
// Il caricamento file locali è riservato agli utenti premium.
// ============================================================================

/**
 * Legge un file locale e lo importa nell'app.
 *
 * @param {File} file
 * @param {boolean} [isEPG=false]  true se il file è un EPG
 * @returns {Promise<void>}
 */
async function handleFileUpload(file, isEPG = false) {

    // Protezione licenza: file locali riservati a premium
    if (!appConfig.isPremium) {
        alert("La funzione di caricamento file locali è riservata agli utenti Premium.");
        return;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const arrayBuffer = e.target.result;
            let text;

            // Decompressione gzip se l'estensione è .gz
            if (file.name.endsWith('.gz')) {
                const blob = new Blob([arrayBuffer]);
                const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
                const decompressedResponse = new Response(decompressedStream);
                text = await decompressedResponse.text();
            } else {
                const decoder = new TextDecoder('utf-8');
                text = decoder.decode(arrayBuffer);
            }

            if (isEPG) {
                // --- Import EPG ---
                if (typeof closeEPGBottomSheet === 'function') closeEPGBottomSheet();

                // Parsa PRIMA, poi salva l'oggetto parsato.
                // (Prima si salvava il testo grezzo: al riavvio l'app
                // provava a rileggerlo e falliva silenziosamente.)


                let parsedData = null;
                try {
                    if (text.trim().startsWith('<') || text.includes('<tv>')) {
                        // Prova il Worker (non blocca l'UI). Se non è
                        // disponibile, ricade su DOMParser automaticamente.
                        parsedData = await parseEPGText(text);
                    } else {
                        parsedData = JSON.parse(text);
                    }
                } catch (err) {
                    console.warn('EPG parsing error:', err);
                }


                if (parsedData) {
                    await saveAndActivateEPG({
                        url: 'file:' + file.name,
                        name: file.name,
                        content: parsedData
                    });
                    epgData = parsedData;
                    rebuildEpgMap();
                    showNotification('EPG locale caricata e salvata.');
                    if (typeof renderEPGManager === 'function') renderEPGManager();
                } else {
                    showNotification('Errore: EPG non parsabile', true);
                }
            } else {
                // --- Import M3U ---
                if (typeof closeBottomSheet === 'function') closeBottomSheet();
                epgData = []; // Reset EPG (nuova playlist -> nuovo set di canali)
                rebuildEpgMap();
                const rec = await saveAndActivateM3U({
                    url: 'file:' + file.name,
                    name: file.name,
                    content: text
                });

                await parseM3U(rec.content, true);
                showingFavorites = false;
                updateButtons();
                window.isPlaylistView = false;

                if (typeof showChannelList === 'function') showChannelList();
                refreshPlaylistUIs();
            }
            resolve();
        };
        reader.readAsArrayBuffer(file);
    });
}


// ============================================================================
// 58. RICERCA — spostata in search.js
// ============================================================================
// Tutta la logica (stato, filtri, hook di riapplicazione) vive nel modulo
// search.js, caricato prima di questo file. zappone.js richiama solo
// reapplySearchAfterRender() dal renderer (vedi finalizeRendering).


// ============================================================================
// 59. SETUP EVENT LISTENERS
// ============================================================================
//
// Aggancia tutti i listener UI principali: file input, ricerca, export,
// reset, preferiti, navigazione player, pannelli EPG/metadati, bottom
// sheet, tab bar inferiore. Chiamata una sola volta da DOMContentLoaded.
//
// I listener che hanno bisogno di un IIFE per gestire stato proprio
// (favoritesPill, viewModePill, optionsExportPill, renameLongPress,
// sidebar, drag bottom sheet) sono già installati all'avvio del modulo,
// non da questa funzione.
// ============================================================================

function setupEventListeners() {

// Click fuori dalla ricerca -> svuota e resetta il filtro
// NOTA: rimosso il vecchio listener "click fuori dal campo svuota la
// ricerca". Era una scorciatoia UX dell'epoca pre-filtro, ma ora rompe
// la persistenza della ricerca: cliccando su un canale per aprirlo,
// il click "fuori dal campo" svuotava la query, e tornando dal player
// la lista mostrava tutti i canali. Ora la ricerca si cancella solo
// esplicitamente, cliccando la X o svuotando manualmente il campo.

// File input M3U locale
document.getElementById('fileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) handleFileUpload(file, false);
});

// File input EPG locale
document.getElementById('epgFileInput')?.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) handleFileUpload(file, true);
});

// Pulsante M3U interno alla finestra Playlist (apre il file picker)
const m3uInsideBtn = document.getElementById("M3UButtonInside");
if (m3uInsideBtn) {
  m3uInsideBtn.addEventListener("click", () => {
    document.getElementById("fileInput").click();
  });
}

// Esporta playlist corrente
document.getElementById('exportButton').addEventListener('click', async () => {
  closeFullEPG();
  const exportList = showingFavorites ? favoriteChannels : channels;
  const m3uContent = generateM3UFromChannels(exportList);

  const suggestedName = await getSuggestedExportFilename();

  const userName = prompt("Nome del file da esportare:", suggestedName);
  if (!userName) return;

  const fileName = userName.endsWith('.m3u') ? userName : userName + '.m3u';
  const blob = new Blob([m3uContent], { type: "audio/x-mpegurl" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();

  URL.revokeObjectURL(url);
});

// --- Reinserisci licenza ---
// [FIX 1] Questa funzione esisteva già nella versione con i fix: è il pulsante «Cambia licenza»
// (id changeLicenseBtn, gestito in updateLicenseDisplay), che fa la stessa cosa senza toccare
// l'ID dispositivo. Il pulsante «Reinserisci licenza» (reenterLicenseBtn) è stato quindi tolto
// da index.html e il suo gestore da qui, per non avere due pulsanti con lo stesso scopo.

// --- Reset settings ---
// Cancella tutti i settings tranne licenza/JWT/device_id, ripristina i
// default espliciti, aggiorna tutti i toggle della sidebar, azzera lo
// stato runtime e ricarica la playlist predefinita.
document.getElementById('resetListBtn').addEventListener('click', async () => {

  const LICENSE_KEYS = ['zappone_license', 'zappone_jwt', 'zappone_device_id', 'zappone_config_cache'];   // [FIX 1] + copia offline

  // Cancella tutti i settings tranne quelli di licenza
  Object.keys(localStorage).forEach(key => {
    if (!LICENSE_KEYS.includes(key)) localStorage.removeItem(key);
  });

  // Default espliciti
  localStorage.setItem("zappone_show_metadata", "false");
  localStorage.setItem("metadataExpanded", "false");
  localStorage.setItem("zappone_show_epg", "false");
  localStorage.setItem("zappone_auto_fullscreen", "false");
  localStorage.setItem("zappone_show_playlist_url", "false");
  localStorage.setItem("zappone_show_favorites", "false");
  localStorage.setItem("zappone_view_mode", "list");
  localStorage.setItem("zappone_popup_notifications", "true");
  localStorage.setItem("zappone_console_overlay", "false");
  localStorage.setItem("zappone_radio_mode", "false");
  localStorage.setItem("zappone_show_equalizer", "false");
  localStorage.setItem("zappone_eq_preset", "normale");
  localStorage.setItem("zappone_auto_update_epg", "true");

  // Metadati: aggiorna toggle + nascondi pannello
  const metaToggle = document.getElementById("toggleMetadata");
  if (metaToggle) metaToggle.checked = false;
  const metaHeader = document.getElementById("metadataHeader");
  const metaContainer = document.getElementById("metadataContainer");
  if (metaHeader) metaHeader.style.display = "none";
  if (metaContainer) {
    metaContainer.style.display = "none";
    metaContainer.classList.remove("expanded");
    const mc = document.getElementById("metadataContent");
    if (mc) mc.innerHTML = "";
  }
  metadataExpanded = false;

  // EPG: aggiorna toggle + nascondi pannello
  const epgToggle = document.getElementById("toggleEPG");
  if (epgToggle) epgToggle.checked = false;
  const epgHeader = document.getElementById("epgHeader");
  const epgContainer = document.getElementById("epgContainer");
  const epgContent = document.getElementById("epgContent");
  if (epgHeader) epgHeader.style.display = "none";
  if (epgContainer) epgContainer.style.display = "none";
  if (epgContent) epgContent.innerHTML = "";

  // Fullscreen iOS
  const fsToggle = document.getElementById("autoFullscreenToggle");
  if (fsToggle) fsToggle.checked = false;

  // Mostra URL playlist/EPG
  const urlToggle = document.getElementById("showPlaylistUrl");
  if (urlToggle) urlToggle.checked = false;

  // Popup notifications
  const popupToggle = document.getElementById("popupNotificationsToggle");
  if (popupToggle) popupToggle.checked = true;

  // Console intercept
  const consoleToggle = document.getElementById("consoleInterceptToggle");
  if (consoleToggle) consoleToggle.checked = false;
  if (typeof disableConsoleIntercept === 'function') disableConsoleIntercept();

  // Radio mode
  const radioToggle = document.getElementById("radioToggle");
  if (radioToggle) radioToggle.checked = false;

  // Equalizzatore
  const eqToggle = document.getElementById("toggleEqualizer");
  if (eqToggle) eqToggle.checked = false;
  const eqControls = document.getElementById("eqControls");
  if (eqControls) eqControls.style.display = "none";

  
  // Aggiorna EPG automaticamente: torna a ON
  const autoEpgToggle = document.getElementById("autoUpdateEpgToggle");
  if (autoEpgToggle) autoEpgToggle.checked = true;


  // Tema (default dark)
  document.documentElement.classList.add('dark-theme');
  localStorage.setItem('theme', 'dark');
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) themeToggle.checked = true;
  const themeToggleSidebar = document.getElementById("themeToggleSidebar");
  if (themeToggleSidebar) themeToggleSidebar.checked = true;

  // Font size
  const fontSizeRange = document.getElementById("fontSizeRange");
  const fontSizeValue = document.getElementById("fontSizeValue");
  if (fontSizeRange) fontSizeRange.value = 100;
  if (fontSizeValue) fontSizeValue.textContent = "100%";
  document.documentElement.style.fontSize = "100%";

  // Azzera lo stato runtime (i preferiti NON vengono toccati)
  showingFavorites = false;
  currentViewMode = 'list';
  groupCollapseState = {};
  favoriteGroupCollapseState = {};
  channels = [];
  groupedChannels = [];

  streamTypeCache = {};
  window.currentChannelUrl = null;

  // Se l'equalizzatore era agganciato a un elemento media, ricrealo.
  // A questo punto currentChannelUrl è già null, quindi non tenterà di
  // riavviare alcun canale.
  if (typeof detachEqualizerAndRestoreNative === 'function') {
    detachEqualizerAndRestoreNative();
  }

  if (typeof updateToggleState === 'function') updateToggleState();

  const viewModePill = document.getElementById('viewModePill');
  if (viewModePill) {
    viewModePill.classList.remove('grid-mode', 'collapse-mode', 'is-collapsed', 'is-expanded');
    viewModePill.classList.add('list-mode');
  }

  showNotification("Settings resettati");

  window.forcePlaylistReload = true;
  window.forceEPGReload = true;

  // Ricarica la playlist predefinita
  await loadRemoteM3U(DEFAULT_PLAYLIST_URL, true);

  // Aggiorna tutte le UI
  if (typeof refreshPlaylistUIs === 'function') refreshPlaylistUIs();
  if (typeof renderEPGManager === 'function' && window.isEPGView) renderEPGManager();
  updateButtons();
});


// --- Toggle modalità radio ---
// Se un canale è in riproduzione, riavvia lo stream in modalità radio
// (l'URL viene riprodotto come audio anche se è video).
// Altrimenti mostra solo una notifica.
document.getElementById('radioToggle').addEventListener('change', function() {
  const isRadioMode = this.checked;

  const video = document.getElementById('player');
  const audio = document.getElementById('audioPlayer');
  const isCurrentlyPlaying = (video && !video.paused) || (audio && !audio.paused);

  if (window.currentChannelUrl && isCurrentlyPlaying) {
    let currentChannel = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    if (!currentChannel && showingFavorites) {
      currentChannel = favoriteChannels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    }

    if (currentChannel) {
      playStream(currentChannel, showingFavorites);
    }
  } else {
    if (isRadioMode) {
      showNotification("Modalità radio attivata", false);
    } else {
      showNotification("Modalità video attivata", false);
    }

    localStorage.setItem('zappone_radio_mode', isRadioMode.toString());
  }
});

// --- Navigazione canali precedente / successivo ---
document.getElementById('prevBtn').addEventListener('click', () => {
    navigateChannels('prev', showingFavorites);
});

document.getElementById('nextBtn').addEventListener('click', () => {
    navigateChannels('next', showingFavorites);
});

// --- Pulsante "back": torna alla lista canali ---
document.getElementById('backButton').addEventListener('click', async () => {
    if (typeof closeFullEPG === 'function') closeFullEPG();

    // Ferma davvero la riproduzione: senza cleanupPlayers() l'audio
    // continuerebbe a suonare anche col player nascosto.
    try {
      if (typeof cleanupPlayers === 'function') {
        await cleanupPlayers({ keepVideoVisible: false });
      }
    } catch (e) {
      console.warn('cleanupPlayers failed on back:', e);
    }
    document.getElementById('playerContainer')?.classList.remove('loading');

    const channelListCont = document.getElementById('channelListContainer');
    const playerCont      = document.getElementById('playerContainer');

    if (channelListCont) {
      channelListCont.classList.remove('hidden');
      channelListCont.style.display = 'block';
    }
    if (playerCont) playerCont.style.display = 'none';

    document.getElementById('playlistListContainer')?.classList.add('hidden');
    document.getElementById('epgListContainer')?.classList.add('hidden');
    document.getElementById('fullEpgContainer')?.classList.add('hidden');

    document.querySelector('.main-header')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('bottomTabBar')?.classList.remove('hidden');

    // Recupera stato: siamo nei preferiti o nella lista completa?
    const lastUrl = localStorage.getItem('zappone_last_played');
    const lastFromFavorites = localStorage.getItem('zappone_last_played_from_favorites') === 'true';

    if (lastUrl) {
      const exists = lastFromFavorites
        ? (window.favoriteUrlMap && favoriteUrlMap.has(lastUrl))
        : (window.channelUrlMap && channelUrlMap.has(lastUrl));

      if (exists) {
        showingFavorites = lastFromFavorites;
        if (typeof updateToggleState === 'function') updateToggleState();
      }
    }

    const channelList = document.getElementById('channelList');
    const currentViewMode = showingFavorites ? 'favorites' : 'all';
    const lastRenderedMode = channelList?.getAttribute('data-view-mode');

    // Percorso rapido: lista già pronta, solo scroll al canale attivo
    if (channelList && channelList.children.length > 0 && lastRenderedMode === currentViewMode) {
      console.log("Back: Lista già presente, eseguo solo scorrimento fluido.");

      window.isPlaylistView = false;
      window.isEPGView = false;

      setTimeout(() => {
        if (window.currentChannelUrl) {
          const escapedKey = CSS.escape(window.currentChannelUrl);
          const target = channelList.querySelector(`[data-key="${escapedKey}"]`);
          if (target) {
            document.querySelectorAll('.active-channel').forEach(el => el.classList.remove('active-channel'));
            target.classList.add('active-channel');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 100);

      return;
    }

    // Fallback: re-render completo
    try {
      window.isPlaylistView = false;
      window.isEPGView = false;

      requestAnimationFrame(() => {
        renderGroupedChannelList(
          showingFavorites ? groupedFavoriteChannels : groupedChannels,
          { context: 'channels' }
        );
      });
    } catch (err) {
      console.error('Errore durante il ritorno alla lista:', err);
      showingFavorites = false;
      if (typeof updateToggleState === 'function') updateToggleState();
      renderGroupedChannelList(groupedChannels, { context: 'channels' });
    }
});

// --- Rinomina canale dal player (contenteditable) ---
document.getElementById('currentChannelName').addEventListener('blur', saveChannelName);
document.getElementById('currentChannelName').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    this.blur();
  }
});

// --- Toggle EPG (clic sull'header della sezione) ---
document.getElementById('epgHeader').addEventListener('click', toggleEPG);

// Clic sul logo del canale nel player -> attiva/disattiva EPG
const logoBtn = document.getElementById('currentChannelLogo');
if (logoBtn) {
  logoBtn.style.cursor = 'pointer';
  logoBtn.addEventListener('click', () => {
    const epgToggle = document.getElementById('toggleEPG');
    if (!epgToggle) return;
    epgToggle.checked = !epgToggle.checked;
    epgToggle.dispatchEvent(new Event('change'));
  });
}

// --- Toggle Metadati (clic sull'header della sezione) ---
document.getElementById('metadataHeader').addEventListener('click', function() {
  metadataExpanded = !metadataExpanded;
  localStorage.setItem('metadataExpanded', metadataExpanded.toString());
  updateMetadataContainerState();

  if (metadataExpanded && window.currentChannelUrl) {
    const currentChannel = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    if (currentChannel) {
      showChannelMetadata(currentChannel);
    }
  }
});

// Clic sul nome del gruppo nel player -> attiva/disattiva metadati
const groupLabel = document.getElementById('currentChannelGroup');
if (groupLabel) {
  groupLabel.style.cursor = 'pointer';
  groupLabel.title = "Mostra/Nascondi dettagli";
  groupLabel.addEventListener('click', () => {
    const metaToggle = document.getElementById('toggleMetadata');
    if (!metaToggle) return;
    metaToggle.checked = !metaToggle.checked;
    metaToggle.dispatchEvent(new Event('change'));
  });
}

// --- Duplica canale corrente ---
document.getElementById('addChannelBtn').addEventListener('click', async function() {
  if (!window.currentChannelUrl) return;

  const targetList = showingFavorites ? favoriteChannels : channels;
  const currentChannel = targetList.find(ch => getChannelKey(ch) === window.currentChannelUrl);
  if (!currentChannel) return;

  // Copia indipendente con URL univoco (aggiunge ?copy=timestamp)
  const newChannel = {
    ...currentChannel,
    name: currentChannel.name + ' ⧉',
    url: currentChannel.url + '?copy=' + Date.now()
  };

  if (showingFavorites) {
    favoriteChannels.push(newChannel);
    groupedFavoriteChannels = groupChannels(favoriteChannels);

    const newKey = getChannelKey(newChannel);
    await idbPutFavorite({
      key: newKey,
      name: newChannel.name,
      url: newChannel.url,
      group: newChannel.group || 'Favorites',
      logo: newChannel.logo || '',
      type: newChannel.type || 'channel',
      order: favoriteChannels.length - 1
    });
    favoriteKeys.add(newKey);

    renderGroupedChannelList(groupedFavoriteChannels, { context: 'channels' });
  } else {
    channels.push(newChannel);
    groupedChannels = groupChannels(channels);

    rebuildIndexMaps();

    // Persisti la nuova lista nella playlist attiva
    const m3uContent = generateM3UFromChannels(channels);
    (async () => {
      const active = await getActivePlaylist();
      if (active) {
        await updateM3URecord(active.id, { content: m3uContent, lastFetched: Date.now() });
      } else {
        const id = await saveM3UUrl('local', 'Local playlist');
        await updateM3URecord(id, { content: m3uContent, lastFetched: Date.now(), isActive: true });
        await setOnlyActive(id);
      }
    })();

    renderGroupedChannelList(groupedChannels, { context: 'channels' });
  }

  showNotification('Canale duplicato con successo!');
  playStream(newChannel, showingFavorites);
});


// --- Gestione tema chiaro/scuro ---
const themeToggle = document.getElementById('themeToggle');
const root = document.documentElement;

// Tema: default dark. Se l'utente ha scelto esplicitamente "light" in
// passato, rispetta la sua scelta; altrimenti dark.
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'dark') {
  root.classList.add('dark-theme');
  if (themeToggle) themeToggle.checked = true;
} else {
  root.classList.remove('dark-theme');
  if (themeToggle) themeToggle.checked = false;
}

// Cambio tema senza flash: blocco temporaneo delle transizioni globali
// per evitare che tutto l'albero animi il cambio di palette.
themeToggle.addEventListener('change', () => {
  const isDark = themeToggle.checked;

  document.documentElement.classList.add('disable-transitions');

  if (isDark) {
    root.classList.add('dark-theme');
  } else {
    root.classList.remove('dark-theme');
  }

  localStorage.setItem('theme', isDark ? 'dark' : 'light');

  requestAnimationFrame(() => {
    document.documentElement.classList.remove('disable-transitions');
  });
});

// Sincronizza il toggle della sidebar con quello nascosto
const themeToggleSidebar = document.getElementById('themeToggleSidebar');
if (themeToggleSidebar) {
  themeToggleSidebar.checked = themeToggle.checked;
  themeToggleSidebar.onchange = () => themeToggle.click();
}


// --- Bottom sheet M3U: chiusura da X e overlay ---
const playlistSheet = document.getElementById('m3uUrlBottomSheet');
const playlistClose = playlistSheet && playlistSheet.querySelector('.bottom-sheet-close, .bottom-sheet-close-epg');
playlistClose?.addEventListener('click', closeBottomSheet);
document.getElementById('bottomSheetOverlay')?.addEventListener('click', closeBottomSheet);


// --- Pulsante "Carica" del bottom sheet M3U ---
document.getElementById("modalConfirm").addEventListener("click", async function() {
    const name = document.getElementById("modalM3UName").value.trim();
    const playlistUrl = document.getElementById("modalM3UUrl").value.trim();

    if (!name || !playlistUrl) {
        alert("Inserisci sia nome che URL.");
        return;
    }

    try {
        const text = await downloadM3U(playlistUrl);

        // [FIX 2b] Prima, se il download falliva (rete, 403, URL errato) `text` era null e la playlist
        // veniva comunque salvata e ATTIVATA vuota: all'avvio dopo l'app risultava senza canali.
        // Ora ci fermiamo qui e la playlist attiva resta quella di prima.
        if (!isValidM3UText(text)) throw new Error('Playlist non valida o non raggiungibile');

        const rec = await saveAndActivateM3U({
            url: playlistUrl,
            name,
            content: text
        });

        await parseM3U(rec.content, true);

        showingFavorites = false;
        window.isPlaylistView = false;

        // Forza il prossimo showChannelList a ri-renderizzare (altrimenti
        // l'euristica "lista già pronta" salterebbe il render).
        const channelList = document.getElementById('channelList');
        if (channelList) {
            channelList.setAttribute('data-view-mode', 'reset');
        }

        if (typeof showChannelList === 'function') {
            await showChannelList();
        }

        updateButtons();
        refreshPlaylistUIs();
        closeBottomSheet();
    } catch (err) {
        // [FIX 2b] messaggio più chiaro quando il problema è l'indirizzo o la rete
        alert(String(err && err.message).includes('non valida')
            ? "Impossibile caricare la playlist: controlla l'indirizzo (deve essere un file M3U raggiungibile). La playlist attiva non è stata modificata."
            : "Errore nel caricamento da URL");
        console.error(err);
    }
});


// --- Bottom sheet EPG: chiusura da X e overlay ---
const epgSheet = document.getElementById('epgUrlBottomSheet');
const epgClose = epgSheet && (epgSheet.querySelector('.bottom-sheet-close-epg') || epgSheet.querySelector('.bottom-sheet-close'));
epgClose?.addEventListener('click', closeEPGBottomSheet);
document.getElementById('bottomSheetOverlayEPG')?.addEventListener('click', closeEPGBottomSheet);





// --- Pulsante "Carica" del bottom sheet EPG ---
document.getElementById("modalConfirmEPG")?.addEventListener("click", async function() {
  const name = document.getElementById("modalEPGName").value.trim();
  const epgUrlValue = document.getElementById("modalEPGUrl").value.trim();
  if (!name || !epgUrlValue) {
    alert("Inserisci sia nome che URL.");
    return;
  }

  try {
    // downloadEPG fa tutto: scarica, parsa (in Worker), salva come array
    // nativo, attiva, e mostra il toast. Non risalvare qui.
    const data = await downloadEPG(epgUrlValue, {
      name: name,
      setActive: true,
      updateUI: true
    });

    if (!data) {
      return;
    }

    closeEPGBottomSheet();
    if (typeof renderEPGManager === 'function') renderEPGManager();

  } catch (err) {
    console.error('Errore caricamento EPG:', err);
    showNotification('Errore nel caricamento EPG da URL.', true);
  }
});


// --- Tab bar inferiore ---

// Wiring opzionale per un vecchio tabAddM3U (non presente nell'HTML attuale)
const tabAddBtn = document.getElementById('tabAddM3U');
if (tabAddBtn) {
  tabAddBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof openBottomSheet === 'function') openBottomSheet();
    else console.warn('openBottomSheet non trovata');
  });
}


// Pulsante Playlists -> apre la vista playlist manager
document.getElementById('playlistsBtn').addEventListener('click', async () => {
    try {
        document.getElementById('fullEpgContainer')?.classList.add('hidden');
        document.getElementById('epgListContainer')?.classList.add('hidden');

        // Chiudi drawer EPG di un singolo canale se aperto
        const epgDrawer = document.getElementById('channelEpgDrawer');
        if (epgDrawer && epgDrawer.classList.contains('open')) {
            epgDrawer.classList.remove('open');
            setTimeout(() => epgDrawer.classList.add('hidden'), 300);
        }

        await renderPlaylistList();
    } catch (err) {
        console.error('renderPlaylistList failed', err);
        await showChannelList();
    }
});


// Pulsante "Canali" -> torna alla lista canali principale
const tabBackBtn = document.getElementById('tabBackToChannels');
if (tabBackBtn) {
  tabBackBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    showingFavorites = false;

    document.getElementById('fullEpgContainer')?.classList.add('hidden');
    document.getElementById('playlistListContainer')?.classList.add('hidden');
    document.getElementById('epgListContainer')?.classList.add('hidden');

    await showChannelList();

    updateToggleState();
  });
}


// Pulsante "Ultimo canale" -> riavvia l'ultimo canale riprodotto
const tabRenderBtn = document.getElementById('tabRenderLastChannel');
if (tabRenderBtn) {
  tabRenderBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    closeFullEPG();
    document.getElementById('fullEpgContainer')?.classList.add('hidden');
    document.getElementById('playlistListContainer')?.classList.add('hidden');
    document.getElementById('epgListContainer')?.classList.add('hidden');
    document.getElementById('channelListContainer')?.classList.add('hidden');
    document.getElementById('playerContainer').style.display = 'block';

    const lastUrl = localStorage.getItem('zappone_last_played');
    const lastWasFavorite = localStorage.getItem('zappone_last_played_from_favorites') === 'true';

    if (!lastUrl) {
      if (typeof showNotification === 'function') showNotification('Nessun canale riprodotto ancora', true);
      return;
    }

    try {
      showingFavorites = lastWasFavorite;
      if (typeof updateToggleState === 'function') updateToggleState();

      // Cerca prima nella lista prevista, poi (fallback) nell'altra
      let found = getChannelByUrl(lastUrl, showingFavorites);
      if (!found) {
        found = getChannelByUrl(lastUrl, !showingFavorites);
        if (found) {
          showingFavorites = !showingFavorites;
          if (typeof updateToggleState === 'function') updateToggleState();
        }
      }

      if (found) {
        playStream(found, showingFavorites);
        return;
      }

      // Fallback estremo: riproduzione diretta dell'URL
      const temp = { url: lastUrl, name: 'Ultimo canale' };
      const isAudio = await isAudioStream(temp).catch(() => false);
      toggleUIElementsForStreamType(isAudio);

      if (isAudio) {
        await playAudioStream(lastUrl);
      } else {
        await playVideoStream(lastUrl);
      }

      window.currentChannelUrl = `external@@${lastUrl}`;

    } catch (err) {
      console.error('Errore avviando ultimo canale:', err);
      if (typeof showNotification === 'function') showNotification('Errore avviando ultimo canale', true);
    }
  });
}


// Pulsante "Carica EPG" -> apre il manager EPG
document.getElementById('downloadEpgBtn').addEventListener('click', async () => {
    try {
        const epgDrawer = document.getElementById('channelEpgDrawer');
        if (epgDrawer && epgDrawer.classList.contains('open')) {
            epgDrawer.classList.remove('open');
            setTimeout(() => epgDrawer.classList.add('hidden'), 300);
        }

        await renderEPGManager();
    } catch (err) {
        console.error('renderEPGManager failed', err);
        await showChannelList();
    }
});


// Pulsante "EPG Completo" -> apre la guida programmi completa
document.getElementById('fullEpgBtn').addEventListener('click', () => {
    localStorage.setItem('lastViewBeforeFullEPG', 'channels');
    renderFullEPGList();
});


// Equalizzatore: pulsanti e toggle sidebar, tutti gestiti in equalizer.js
if (typeof setupEqualizerUI === 'function') setupEqualizerUI();

}  // <-- chiusura setupEventListeners


// ============================================================================
// 60. SPLASH SCREEN — RIMOZIONE
// ============================================================================
//
// Lo splash resta visibile per almeno SPLASH_MIN_MS dall'avvio, così
// l'utente non vede un flash se l'app è pronta subito. Dopo quel minimo,
// l'app aggiunge la classe .splash-hide e rimuove l'elemento dal DOM dopo
// la transizione di fade-out.
// ============================================================================

const SPLASH_MIN_MS  = 800;
const SPLASH_FADE_MS = 600; // >= durata transizione CSS (.55s)

/**
 * Nasconde (con fade) e rimuove dal DOM lo splash screen. Idempotente.
 */
function hideSplashScreen() {
  const el = document.getElementById('appSplash');
  if (!el || el.classList.contains('splash-hide')) return;

  const shownAt = (typeof window.__splashShownAt === 'number')
    ? window.__splashShownAt
    : performance.now();

  const elapsed = performance.now() - shownAt;
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed);

  setTimeout(() => {
    el.classList.add('splash-hide');
    setTimeout(() => el.remove(), SPLASH_FADE_MS);
  }, wait);
}


// ============================================================================
// 61. INIZIALIZZAZIONE APPLICAZIONE
// ============================================================================

/**
 * Inizializza l'app: apre il DB, carica preferiti e lista URL in
 * parallelo, applica le preferenze di vista, disegna la vista playlist
 * come landing, e in background carica la playlist attiva e l'EPG attivo.
 *
 * Le operazioni pesanti (parsing playlist, parsing EPG) vengono ritardate
 * di 50 ms in un setTimeout per non bloccare il primo paint dopo la
 * rimozione dello splash.
 */
async function initializeApp() {
    try {
        // Operazioni parallele di apertura DB e caricamento dati iniziali
        await Promise.all([
            getDB(),
            loadFavorites(),
            loadM3UUrlList()
        ]);

        const preferences = loadViewModePreference();
        currentViewMode = preferences.mode;
        showingFavorites = (favoriteChannels.length > 0) ? preferences.showFav : false;

        // Mostra UI immediatamente
        await renderPlaylistList();

        // Caricamenti in background: playlist attiva + EPG attivo
        setTimeout(async () => {
            try {
                const [activeRec, activeEPG] = await Promise.all([
                    getActivePlaylist(),
                    getActiveEPG()
                ]);

                // Playlist attiva
                if (activeRec?.content) {
                    await parseM3U(activeRec.content, true, false);
                } else {
                    channels.length = 0;
                    groupedChannels.length = 0;
                }

                // EPG attivo
                if (activeEPG?.content) {
                    try {
                        epgData = typeof activeEPG.content === 'string'
                            ? JSON.parse(activeEPG.content)
                            : activeEPG.content;
                        rebuildEpgMap();
                    } catch (e) {
                        console.error('EPG parsing error:', e);
                    }
                }

                rebuildIndexMaps();

            } catch (backgroundError) {
                console.warn("Background loading error:", backgroundError);
            }
        }, 50);

        // UI setup
        const viewModePill = document.getElementById('viewModePill');
        if (viewModePill) {
            viewModePill.classList.toggle('list-mode', currentViewMode === 'list');
            viewModePill.classList.toggle('grid-mode', currentViewMode === 'grid');
        }

        setupDragAndDropDelegation();
        updateButtons();
        setupSwipeHandlers();
        if (typeof setupFullEpgViewToggle === 'function') {
          setupFullEpgViewToggle();
        }
        if (typeof setupFullEpgTimeNav === 'function') {
          setupFullEpgTimeNav();
        }

    } catch (error) {
        console.error('Initialization error:', error);
        await renderPlaylistList();
    }
}


// ============================================================================
// 62. REGISTRAZIONE SERVICE WORKER
// ============================================================================
//
// Il Service Worker abilita il funzionamento offline e la cache degli
// asset statici. Viene registrato al load della pagina, mai bloccante.

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('[SW] Registered successfully:', reg))
            .catch(err => console.error('[SW] Registration failed:', err));
    });
}


// ============================================================================
// 63. DISPLAY LICENZA NEL TAB SISTEMA
// ============================================================================

/**
 * Aggiorna la riga "Licenza: ..." nel pannello Info della sidebar.
 * Se premium, mostra anche il conteggio dispositivi; altrimenti "Demo".
 */
function updateLicenseDisplay() {
    const el = document.getElementById('currentLicenseDisplay');
    if (!el) return;

    const isPremium = typeof appConfig !== 'undefined' && appConfig.isPremium;
    if (isPremium) {
        const license = localStorage.getItem('zappone_license') || '—';
        let text = `Licenza: ${license}`;
        if (appConfig.devicesCount != null && appConfig.maxDevices != null) {
            text += ` (${appConfig.devicesCount}/${appConfig.maxDevices})`;
        }
        el.textContent = text;
    } else {
        // [FIX 1] Se c'è una chiave salvata ma il server non la considera attiva, lo dico:
        // prima compariva solo "Demo" e l'utente non capiva il motivo.
        const stored = localStorage.getItem('zappone_license');
        el.textContent = (stored && stored !== 'demo_user')
            ? 'Licenza: Demo — la chiave salvata non risulta attiva'
            : 'Licenza: Demo';
    }
}

// [FIX 1] Pulsante "Cambia licenza" (Impostazioni › Avanzate). Prima, dopo il primo avvio, non
// esisteva nessun modo per inserire o correggere la chiave se non l'Hard Reset.
// Cancella la chiave, il token e il flag demo e riavvia: parte il form di inserimento licenza.
// L'ID dispositivo NON viene toccato, così non si occupa un nuovo "slot dispositivo".
const changeLicenseBtn = document.getElementById('changeLicenseBtn');
if (changeLicenseBtn) {
    changeLicenseBtn.onclick = () => {
        if (!confirm("Vuoi inserire o cambiare la licenza?\nL'app si riavvierà e ti chiederà la nuova chiave.")) return;
        ['zappone_license', 'zappone_jwt', 'zappone_demo_mode', 'zappone_config_cache']
            .forEach(k => localStorage.removeItem(k));
        window.location.replace(window.location.origin + window.location.pathname);
    };
}


// ============================================================================
// 64. BLOCCO ZOOM SU iOS
// ============================================================================
//
// Il pinch-to-zoom su iOS può rompere il layout fixed. Lo blocchiamo
// globalmente: l'app ha una sua dimensione testo regolabile dal tab Aspetto.

document.addEventListener('gesturestart', (e) => e.preventDefault());


// ============================================================================
// 65. AVVIO APPLICAZIONE
// ============================================================================
//
// Bootstrap completo dell'app, eseguito al DOMContentLoaded:
//   1. setupEventListeners()          aggancia i listener UI;
//   2. getConfigFromServer()          chiama il server per config/licenza;
//   3. initDemoWatermark()            mostra la filigrana DEMO se serve;
//   4. updateLicenseDisplay()         aggiorna la riga licenza in sidebar;
//   5. ricarica i campi URL predefiniti con i valori dal server;
//   6. initializeApp()                apre DB, carica dati, disegna UI;
//   7. hideSplashScreen()             rimuove lo splash;
//   8. feedback finale (Premium/Demo).
//
// getConfigFromServer() gestisce internamente:
//   - prompt per l'inserimento della licenza (con timeout di sicurezza);
//   - fetch verso il server con timeout di 8 s;
//   - cache locale della config premium.
// Quindi lo splash resta visibile finché la licenza non è risolta.






document.addEventListener('DOMContentLoaded', async () => {

    setupEventListeners();

    await getConfigFromServer();

    if (typeof initDemoWatermark === 'function') {
      initDemoWatermark();
    }

    updateLicenseDisplay();

    // Ora che la config è arrivata, i default M3U/EPG hanno valori veri:
    // se l'utente non ha personalizzato nulla in localStorage, i campi
    // mostrano gli URL di default del server.
    if (defaultM3UInput) defaultM3UInput.value = localStorage.getItem("zappone_default_m3u") || DEFAULT_PLAYLIST_URL || '';
    if (defaultEPGInput) defaultEPGInput.value = localStorage.getItem("zappone_default_epg") || epgUrl || '';

    await initializeApp();

    hideSplashScreen();

    // [FIX 1] Avvisi sulla licenza (chiave non valida, troppi dispositivi, uso della copia offline):
    // license.js li mette in coda perché durante lo splash i toast non si vedrebbero.
    if (window.__pendingLicenseNotice) {
        showNotification(window.__pendingLicenseNotice.message, !!window.__pendingLicenseNotice.isError);
        window.__pendingLicenseNotice = null;
    }

    if (appConfig.isPremium) {
        showNotification("ZappOne Premium Attivo! V8.1");
    } else {
        showNotification("Modalità Demo attiva", false);
    }
});