// ============================================================================
// INDICE DELLE SEZIONI
// ============================================================================
//
// Il file è organizzato in sezioni numerate. Ogni sezione è separata
// da una riga di commento con la forma:
//
//     // ============================================================
//     // NN. TITOLO DELLA SEZIONE
//     // ============================================================
//
// Per cercare una funzione o una zona specifica, usa Ctrl+F (o Cmd+F)
// cercando "NN." con il numero della sezione qui sotto.
//
// NOTA: le sezioni 34-42 e 63 della versione precedente (sidebar impostazioni,
// intercettazione console, tab sidebar, tab contenuti, hard reset, toggle
// player/sistema, aggiorna da remoto, display licenza) sono state spostate
// nel modulo OPZIONALE sidebar.js. Se sidebar.js non è caricato, la sidebar
// non esiste e l'app funziona identica.
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
//  18.  Utility — input di ricerca (rinvia a search.js)
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
// ─── NOTIFICHE ────────────────────────────────────────────────────────
//  33.  Notifiche a comparsa (toast)
//
// ─── BOTTOM SHEET ─────────────────────────────────────────────────────
//  43.  Refresh UI playlist
//  45.  Bottom sheet M3U — apertura e chiusura
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
//  58.  Ricerca — spostata in search.js
//  59.  Setup event listeners
//
// ─── AVVIO APPLICAZIONE ───────────────────────────────────────────────
//  60.  Splash screen — rimozione
//  61.  Inizializzazione applicazione
//  62.  Registrazione service worker
//  64.  Blocco zoom su iOS
//  65.  Avvio applicazione
//
// ─── API PUBBLICA ─────────────────────────────────────────────────────
//  ZappOneCore — superficie verso sidebar.js (in coda al file)
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
//   - l'inizializzazione dell'app e il wiring di tutti i listener UI;
//   - window.ZappOneCore, l'API pubblica verso i moduli opzionali.
//
// La SIDEBAR IMPOSTAZIONI è stata spostata in sidebar.js (modulo
// OPZIONALE). Se sidebar.js non è caricato, la sidebar non esiste:
// nessun handle, nessun overlay, nessuna tab. L'app funziona identica.
// Tutte le chiamate tra zappone.js e sidebar.js passano da:
//   - window.ZappOneCore     (esposto in coda a questo file)
//   - window.ZappOneSidebar  (esposto da sidebar.js, letto con ?.)
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
//   epg-grid.js     -> applyFullEpgViewMode, setupFullEpgViewToggle, ...
//   equalizer.js    -> setupEqualizerUI, detachEqualizerAndRestoreNative, ...
//   player.js       -> playStream, playAudioStream, playVideoStream,
//                      cleanupPlayers, navigateChannels, isAudioStream, ...
// ============================================================================


// ============================================================================
// 1. STATO GLOBALE — CANALI E PREFERITI
// ============================================================================

// Array piatto di tutti i canali della playlist attiva, nell'ordine in cui
// compaiono nel file M3U dopo eventuali riordini drag & drop.
let channels = [];

// Stessa lista di `channels` ma raggruppata per categoria (group-title).
// Ogni voce è { name, logo, channels: [...], order }.
let groupedChannels = [];

// Array piatto dei canali marcati come preferiti dall'utente.
let favoriteChannels = [];

// Stessa lista di favoriteChannels ma raggruppata.
let groupedFavoriteChannels = [];

// Flag che riflette la vista corrente: true = lista preferiti, false = lista completa.
let showingFavorites = false;

// Indici del canale attualmente in riproduzione.
let currentChannelIndex = -1;
let currentFavoriteIndex = -1;


// ============================================================================
// 2. STATO GLOBALE — COLLASSO GRUPPI
// ============================================================================

// Un solo contenitore, quattro contesti. Ogni vista ha il SUO stato,
// persistito separatamente. Niente più logica "una mappa per tutto".
const collapseStates = {
  channels:  {},
  favorites: {},
  playlists: {},
  epg:       {},
};

// Alias storici: altre parti del codice (render, reset) li usano ancora.
// Essendo riferimenti allo stesso oggetto, ogni mutazione si riflette
// su collapseStates senza dover toccare il resto.
const groupCollapseState         = collapseStates.channels;
const favoriteGroupCollapseState = collapseStates.favorites;

// Vista corrente → chiave di collapseStates da usare.
// Un solo punto di verità: chi legge o scrive stato passa da qui.
function getCurrentCollapseContext() {
  if (window.isPlaylistView) return 'playlists';
  if (window.isEPGView)      return 'epg';
  return showingFavorites ? 'favorites' : 'channels';
}


// ============================================================================
// 3. STATO GLOBALE — DRAG & DROP
// ============================================================================

let draggedItem = null;
let draggedItemOriginalGroup = null;
let draggedItemOriginalUrl = null;
let draggedItemIsFavorite = false;
let draggedGroupIndex = null;
let draggedGroupIsFavorite = false;


// ============================================================================
// 4. STATO GLOBALE — VISTA E GESTURE
// ============================================================================

let currentViewMode = 'list';

let touchStartX = 0;
let touchEndX   = 0;
let touchStartY = 0;
let touchEndY   = 0;
let mouseDownX  = 0;
let mouseUpX    = 0;
let mouseDownY  = 0;
let mouseUpY    = 0;


// ============================================================================
// 5. STATO GLOBALE — CACHE INTERNE
// ============================================================================

// Cache del tipo di stream per URL: { [url]: true|false }
let streamTypeCache = {};

// Stato espansione del pannello "Metadati Canale".
let metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';


// ============================================================================
// 6. STATO GLOBALE — EPG
// ============================================================================
//
// Lo stato EPG vive in epg.js (epgData, epgByName, epgDisplayList, ...).


// ============================================================================
// 7. COSTANTI — CHIAVI DI RESET
// ============================================================================


// ============================================================================
// 8. STATO GLOBALE — PLAYER HLS E RIFERIMENTI DOM
// ============================================================================

window.currentChannelUrl = null;
window.playbackSource = 'channels';


window.hlsInstance = null;


// ============================================================================
// 9. STATO GLOBALE — DB E FLAG DI VISTA
// ============================================================================

const favoriteKeys = new Set();

window.isEPGView = false;
window.isPlaylistView = false;


// ============================================================================
// 10. STATO GLOBALE — INDICI PER RICERCA RAPIDA
// ============================================================================

let channelIndexMap = new Map();
let favoriteIndexMap = new Map();
let channelUrlMap = new Map();
let favoriteUrlMap = new Map();


// ============================================================================
// 11. STATO GLOBALE — MODALITÀ ELIMINAZIONE
// ============================================================================

let deletionMode = false;


// ============================================================================
// 12. CARICAMENTO STATO DI COLLASSO DA LOCALSTORAGE
// ============================================================================

// Le vecchie due chiavi sono mantenute per retrocompatibilità (chi ha
// già usato l'app ritrova il suo collasso preferiti/canali). Per i due
// manager vengono usate chiavi nuove, mai scritte prima.
(function loadCollapseStates() {
  const map = {
    channels:  'zappone_group_collapse',
    favorites: 'zappone_fav_group_collapse',
    playlists: 'zappone_playlist_collapse',
    epg:       'zappone_epg_collapse',
  };
  for (const [ctx, lsKey] of Object.entries(map)) {
    try {
      const data = JSON.parse(localStorage.getItem(lsKey) || '{}');
      if (data && typeof data === 'object') {
        Object.assign(collapseStates[ctx], data);
      }
    } catch (e) {
      console.warn('Collapse state non leggibile per', ctx, e);
    }
  }
})();


// ============================================================================
// 13. RIFERIMENTI A MODULI ESTERNI
// ============================================================================

let sharedChannelObserver = null;

const metadataContainer = document.getElementById('metadataContainer');


// ============================================================================
// 14. FUNZIONI DI SUPPORTO — PERSISTENZA STATO INTERFACCIA
// ============================================================================

/**
 * Salva su localStorage lo stato di espansione/collasso di tutti i gruppi.
 */
function saveGroupCollapseStates() {
  try {
    localStorage.setItem('zappone_group_collapse',     JSON.stringify(collapseStates.channels));
    localStorage.setItem('zappone_fav_group_collapse', JSON.stringify(collapseStates.favorites));
    localStorage.setItem('zappone_playlist_collapse',  JSON.stringify(collapseStates.playlists));
    localStorage.setItem('zappone_epg_collapse',       JSON.stringify(collapseStates.epg));
  } catch (e) {
    console.warn('Cannot save group collapse states', e);
  }
}

/**
 * Ricostruisce le mappe di indice a partire dagli array channels e
 * favoriteChannels correnti.
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

  // [FIX] Cache dei nomi normalizzati (A02-search.js) dipende da entrambe
  // le liste. rebuildIndexMaps è chiamato da ogni scrittura che cambia
  // channels/favoriteChannels (parseM3U, toggleFavorite, loadFavorites,
  // saveMetadataChanges, deleteChannel, moveChannel, removeFrom*,
  // addChannelBtn, resetRuntimeState), quindi è il punto giusto per
  // invalidarla una volta sola.
  if (typeof window.invalidatePlaylistNormNamesCache === 'function') {
    window.invalidatePlaylistNormNamesCache();
  }
}


// ============================================================================
// 15. MODALITÀ ELIMINAZIONE — ENTER / EXIT / TOGGLE
// ============================================================================

/**
 * Attiva la modalità cancellazione.
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
 * Disattiva la modalità cancellazione e nasconde tutti i cestini.
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
 * Alterna la modalità cancellazione.
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
 */
async function loadPlaylistFromUrl(url, name = null, { closeAfter = false } = {}) {
  if (closeAfter && typeof closeBottomSheet === 'function') closeBottomSheet();

  try {
    const text = await fetchM3UWithProxies(url);

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
 * Wrapper storico di loadPlaylistFromUrl.
 */
async function loadRemoteM3U(url, closeAfter = false) {
  return await loadPlaylistFromUrl(url, url ? url.split('/').pop() : null, { closeAfter });
}


// ============================================================================
// 17. UTILITY — NOME FILE DI EXPORT
// ============================================================================

/**
 * Costruisce un nome di file "sensato" per l'export della playlist corrente.
 */
async function getSuggestedExportFilename() {
  const rec = await getActivePlaylistMeta();

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
// 18. UTILITY — INPUT DI RICERCA (vedi search.js)
// ============================================================================


// ============================================================================
// 19. GESTIONE PREFERITI
// ============================================================================

/**
 * Salva il nuovo nome del canale digitato nel campo contenteditable del player.
 */
async function saveChannelName() {
  const newName = this.textContent.trim();
  if (!newName) return;

  await saveMetadataChanges(newName);
}


/**
 * Alterna lo stato preferito di un canale e sincronizza UI, memoria e DB.
 */
async function toggleFavorite(channel, starElement) {
    const key = getChannelKey(channel);
    const wasFavorite = isFavorite(channel);

    if (wasFavorite) {
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
        if (!isFavorite(channel)) {
            const favChannel = { ...channel };
            favoriteChannels.push(favChannel);
            groupedFavoriteChannels = groupChannels(favoriteChannels);

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
    if (favoriteKeys.size !== favoriteChannels.length) {
        favoriteKeys.clear();
        favoriteChannels.forEach(fav => favoriteKeys.add(getChannelKey(fav)));
    }
    return favoriteKeys.has(key);
}


/**
 * Carica i preferiti da IndexedDB in memoria.
 */
async function loadFavorites() {
  const rows = await idbGetAllFavorites();

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
 */
function addFavoriteStar(channel, item, options = {}) {
  const context = options && options.context
    ? options.context
    : ((!window.isEPGView && !window.isPlaylistView) ? 'channels' : (window.isEPGView ? 'epg' : 'playlists'));

  if (context !== 'channels') return;

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

/**
 * Restituisce l'observer condiviso, creandolo alla prima chiamata.
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
 * Sgancia dall'observer condiviso SOLO le immagini di un container specifico.
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
 * Mostra la vista richiesta e nasconde le altre.
 */
function switchToView(viewName) {
  const cfg = VIEW_CONTAINERS[viewName];
  if (!cfg) {
    console.warn(`switchToView: vista "${viewName}" non definita`);
    return;
  }
  cfg.hide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  cfg.show.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      el.style.display = '';
    }
  });
}


// ============================================================================
// 22. RENDERER GENERICO PER LISTE "SALVATE" (PLAYLIST, EPG MANAGER)
// ============================================================================
//
// Usato da renderPlaylistList() e renderEPGManager(). Ogni voce è una riga
// "salvata" (playlist remota o EPG remoto) con azioni a destra (↻ / 🗑️).
//
// Ogni gruppo è collassabile e il suo stato è INDIPENDENTE per contesto
// (collapseStates.playlists vs collapseStates.epg). Le righe-comando
// ("Aggiungi Playlist" / "Aggiungi EPG") NON sono collassabili: contengono
// un'azione, non dei dati, e devono restare sempre visibili.
// ============================================================================

function renderSavedItemsList(containerEl, groups, config = {}) {
  if (!containerEl) return;

  unobserveContainerImages(containerEl);

  requestAnimationFrame(() => {
    containerEl.style.opacity = '0';
    containerEl.style.pointerEvents = 'none';
    containerEl.innerHTML = '';
    containerEl.className = 'view-list';

    const currentGroups = groups || [];
    const isEmpty = !currentGroups.length || (config.emptyCheck && config.emptyCheck(currentGroups));

    // ---- Stato vuoto ----
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
      img.className = 'no-epg';
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

    // ---- Contesto di collasso per questa lista ----
    // Ogni manager ha il SUO stato. Lo deduciamo dall'id del container per
    // non dover passare un parametro extra ai chiamanti (renderPlaylistList
    // e renderEPGManager restano invariati).
    const collapseCtx = containerEl.id === 'epgList'      ? 'epg'
                      : containerEl.id === 'playlistList' ? 'playlists'
                      : null;

    // ---- Helper: la riga è un gruppo-comando? ----
    // "Aggiungi Playlist" / "Aggiungi EPG" hanno come unica voce un item con
    // url === '#url'. Non vanno mai collassate né mostrano la freccia +/-.
    const isCommandGroup = (group) =>
      !!(group.channels && group.channels[0] && group.channels[0].url === '#url');

    // ---- Helper: crea la singola riga ----
    const createItem = (itemData, groupIndex) => {
      const item = document.createElement('div');
      item.className = 'channel-item list';
      if (itemData.url) item.dataset.url = itemData.url;
      if (itemData.name) item.dataset.name = itemData.name.toLowerCase();
      if (itemData.__epgId) item.dataset.epgId = itemData.__epgId;
      item.dataset.groupIndex = groupIndex;

      const img = document.createElement('img');
      img.className = 'channel-logo';
      img.dataset.src = itemData.logo || 'tasto-icon.png';
      img.style.backgroundColor = 'var(--epg-poster-bg)';
      getSharedObserver().observe(img);
      item.appendChild(img);

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

      if (config.itemActions) {
        config.itemActions(itemData).forEach(action => {
          const iconEl = document.createElement('span');
          iconEl.className = action.className || 'item-action';

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

      const commandGroup = isCommandGroup(group);

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

      // Freccia +/- solo per i gruppi collassabili. Il gruppo-comando non
      // ce l'ha: non è un contenitore di dati, è un'azione.
      let groupToggle = null;
      if (!commandGroup) {
        groupToggle = document.createElement('span');
        groupToggle.className = 'group-toggle';
        groupTitle.appendChild(groupToggle);
      }
      groupHeader.appendChild(groupTitle);

      const groupContent = document.createElement('div');
      groupContent.className = 'group-content list-view';

      // Stato iniziale del gruppo letto dalla mappa del contesto corrente.
      // Il gruppo-comando è SEMPRE visibile, per costruzione.
      const isCollapsed = (!commandGroup && collapseCtx)
        ? !!(collapseStates[collapseCtx] && collapseStates[collapseCtx][group.name])
        : false;

      if (groupToggle) groupToggle.textContent = isCollapsed ? '+' : '-';
      if (isCollapsed) groupContent.classList.add('collapsed');

      const groupFragment = document.createDocumentFragment();
      group.channels.forEach(ch => groupFragment.appendChild(createItem(ch, groupIndex)));
      groupContent.appendChild(groupFragment);

      // Click sull'header per comprimere/espandere QUESTO gruppo.
      // Listener per-elemento (non delegato): quando la lista viene
      // ricostruita, il listener muore col DOM e non lascia residui.
      if (!commandGroup && collapseCtx) {
        groupHeader.addEventListener('click', (e) => {
          if (e.target.closest('.reload-epg') ||
              e.target.closest('.delete-channel') ||
              e.target.closest('.delete-url-btn')) {
            return;
          }
          // Durante la ricerca il CSS forza l'apertura dei gruppi con match:
          // un click qui non produrrebbe effetto visibile. No-op silenzioso.
          if (groupHeader.closest('.search-active')) return;

          const wasCollapsed = groupContent.classList.contains('collapsed');
          groupContent.classList.toggle('collapsed', !wasCollapsed);
          if (!collapseStates[collapseCtx]) collapseStates[collapseCtx] = {};
          collapseStates[collapseCtx][group.name] = !wasCollapsed;
          groupToggle.textContent = wasCollapsed ? '-' : '+';
          saveGroupCollapseStates();
        });
      }

      masterFragment.appendChild(groupHeader);
      masterFragment.appendChild(groupContent);
    });

    // ---- Rendering a blocchi ----
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
 */
async function renderPlaylistList() {
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

    const playlists = await getAllM3UUrls();
    const activePlaylist = await getActivePlaylistMeta();

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

    window.forcePlaylistReload = false;

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

    renderGroupedChannelList(groups, {
        targetContainer: 'playlistList',
        context: 'playlists'
    });

    setTimeout(() => {
        const list = document.getElementById('playlistList');
        if (!list) return;

        list.querySelectorAll('.channel-item').forEach(item => {
            const url = item.getAttribute('data-url');
            const def = groups
                .flatMap(g => g.channels)
                .find(c => c.url === url || (c.__special && (url === '#local' || url === '#url')));

            if (!def) return;

            if (def.__playlistId) {
                item.setAttribute('data-playlist-id', def.__playlistId);
            }

            item.classList.remove('active-channel');
            if (def.__isActive) item.classList.add('active-channel');

            item.removeAttribute('draggable');
            item.removeAttribute('data-key');
            item.removeAttribute('data-group-index');

            if (def.__special && url === "#url") {
                item.onclick = () => {
                    if (typeof openBottomSheet === 'function') openBottomSheet();
                };
            }
            else if (def.__playlistId) {
                item.onclick = async () => {
                    try {

                        const currentActive = await getActivePlaylistMeta();

                        if (currentActive && currentActive.id === def.__playlistId) {
                            window.isPlaylistView = false;
                            if (typeof showChannelList === 'function') await showChannelList();
                            return;
                        }

                        document.getElementById('playlistList')?.querySelectorAll('.channel-item.active-channel')
                            .forEach(el => el.classList.remove('active-channel'));
                        item.classList.add('active-channel');

                        const channelList = document.getElementById('channelList');
                        if (channelList) channelList.innerHTML = "";

                        window.suppressPlaylistRefresh = true;
                        const rec = await getM3UById(def.__playlistId);
                        let text = rec?.content;

                        if (!text && rec?.url) {
                            if (typeof showNotification === 'function') showNotification("Scaricamento canali...");
                            text = await downloadM3U(rec.url);
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

            const del = item.querySelector('.delete-channel') || item.querySelector('.delete-url-btn');
            if (del) {
                del.onclick = async (e) => {
                    e.stopPropagation();
                    if (!confirm('Eliminare questa playlist?')) return;
                    try {
                        await deleteM3UUrl(def.__playlistId);
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

            if (!def.__special) {
                const infoContainer = item.querySelector('.channel-name')?.parentElement || item.children[1];
                if (infoContainer && !infoContainer.querySelector('.current-program')) {
                    const infoLine = document.createElement('div');
                    infoLine.className = 'current-program';
                    const showUrl = localStorage.getItem("zappone_show_playlist_url") === "true";

                    if (showUrl && def.url) {
                        infoLine.textContent = def.url;



                                           } else if (typeof def.__raw?.channelCount === 'number') {
                   infoLine.textContent = `${def.__raw.channelCount} canali, ${def.__raw.groupCount || 0} gruppi`;

                                            } else if (def.__playlistId) {
                                              // Conteggi assenti (record creato da una versione precedente): li calcola una volta e li salva.
                   infoLine.textContent = "Analisi canali...";
                   ensurePlaylistCounts(def.__playlistId).then(c => {
                          infoLine.textContent = c ? `${c.channelCount} canali, ${c.groupCount} gruppi` : '';

                                                }).catch(() => { infoLine.textContent = ''; });

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

const _renderTokens = new Map();



// ============================================================================
// [LAZY-GROUP] Helper per il popolamento lazy dei gruppi.
//
// Contesto: `renderGroupedChannelList` crea tutti gli header dei gruppi in
// modo sincrono (sono pochi), ma rimanda il popolamento dei canali di ogni
// gruppo a quando il gruppo entra nel viewport. Un gruppo non ancora
// popolato mostra un placeholder testuale con il conteggio.
//
// Chi ha bisogno di "tutti i gruppi popolati" (es. `performSearch` che
// itera i `.channel-item`, oppure `scrollToCurrentChannelWhenReady` che
// cerca un canale specifico nel DOM) chiama `window.__populateAllGroups()`
// e attende la Promise. È un'operazione costosa (equivalente al render
// completo) ma rara: avviene solo su ricerca esplicita o su scroll-to.
// ============================================================================

let _groupPopObserver = null;
let _groupPopCallbacks = new Map(); // groupContent -> { populate, populated, placeholder }

function _getOrCreateGroupPopObserver() {
  if (_groupPopObserver) return _groupPopObserver;

  _groupPopObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const content = entry.target;
      if (!content.isConnected) {
        _groupPopObserver.unobserve(content);
        return;
      }
      const cb = _groupPopCallbacks.get(content);
      if (!cb || cb.populated) {
        _groupPopObserver.unobserve(content);
        return;
      }
      cb.populated = true;
      _groupPopObserver.unobserve(content);
      try {
        cb.populate();
      } catch (err) {
        console.warn('[lazy-group] popolamento fallito:', err);
      }
    });
  }, {
    // root: null → viewport del browser. IntersectionObserver calcola
    // l'intersezione rispetto agli ancestor scrollabili, quindi funziona
    // sia per #channelList (che ha overflow-y:auto) sia per liste annidate.
    // rootMargin generoso per anticipare il pop di un gruppo che sta per
    // entrare in viewport (evita il flicker "Caricamento..." visibile).
    root: null,
    rootMargin: '300px 0px',
    threshold: 0.01
  });

  return _groupPopObserver;
}

// Popola TUTTI i gruppi rimasti lazy. Ritorna una Promise che si risolve
// quando l'ultimo popolamento chunked ha completato. Usato da:
//   - A02-search.js `performSearch` (la ricerca itera .channel-item nel DOM)
//   - zappone.js `scrollToCurrentChannelWhenReady` (fallback se il canale
//     corrente è in un gruppo non popolato)
//   - zappone.js `tryRestoreScroll` (scrollHeight deve essere stabile)
window.__populateAllGroups = function () {
  return new Promise((resolve) => {
    const entries = [];
    _groupPopCallbacks.forEach((cb, content) => {
      if (cb.populated) return;
      cb.populated = true;
      entries.push({ cb, content });
    });

    // Disconnetti l'observer: nessun nuovo gruppo verrà registrato durante
    // il pop-all (i futuri render resettano observer e callbacks).
    if (_groupPopObserver) {
      _groupPopObserver.disconnect();
      _groupPopObserver = null;
    }

    if (entries.length === 0) {
      resolve();
      return;
    }

    let pending = entries.length;
    entries.forEach(({ cb }) => {
      try {
        cb.populate(() => {
          pending--;
          if (pending === 0) resolve();
        });
      } catch (err) {
        console.warn('[lazy-group] pop-all fallito su un gruppo:', err);
        pending--;
        if (pending === 0) resolve();
      }
    });
  });
};


// ============================================================================
// 25. RENDERER PRINCIPALE — LISTA CANALI / PREFERITI / ALTRI CONTESTI
// ============================================================================

function renderGroupedChannelList(groups, options = {}) {

    const targetContainer = options.targetContainer || 'channelList';
    const targetElement = document.getElementById(targetContainer);

    if (!targetElement) {
        console.error(`Container ${targetContainer} non trovato`);
        return;
    }

    const context = options && options.context ? options.context : 'channels';

    const effectiveViewMode = (context === 'channels') ? currentViewMode : 'list';

    targetElement.setAttribute('data-context', context);
    targetElement.setAttribute('data-view-mode', context === 'channels' ? (showingFavorites ? 'favorites' : 'all') : context);

    let currentGroups;
    if (context === 'channels') {
        currentGroups = showingFavorites ? groupedFavoriteChannels : groups;
    } else {
        currentGroups = groups || [];
    }

    const myToken = (_renderTokens.get(targetContainer) || 0) + 1;
    _renderTokens.set(targetContainer, myToken);
    const isCurrentRender = () => _renderTokens.get(targetContainer) === myToken;

    unobserveContainerImages(targetElement);

    requestAnimationFrame(() => {
        if (!isCurrentRender()) return;

        const isGridView = effectiveViewMode === 'grid';
        const viewModeClass = 'view-' + effectiveViewMode;

        const isFirstRender = targetElement.children.length === 0;

        let savedScrollTop = 0;
        if (options.preserveScroll) {
            savedScrollTop = (typeof targetElement.__pendingScrollTop === 'number')
                ? targetElement.__pendingScrollTop
                : (isFirstRender ? 0 : targetElement.scrollTop);
            targetElement.__pendingScrollTop = savedScrollTop > 0 ? savedScrollTop : null;
        } else {
            targetElement.__pendingScrollTop = null;
        }

        // [LAZY-GROUP] Reset observer e callbacks: ogni render è un nuovo
        // "mondo". Il vecchio observer viene disconnesso, il vecchio Map
        // sostituito. I content del vecchio render (già staccati dal DOM)
        // vengono garbage-collected.
        if (_groupPopObserver) {
            _groupPopObserver.disconnect();
            _groupPopObserver = null;
        }
        _groupPopCallbacks = new Map();

        if (isFirstRender) {
            targetElement.style.opacity = '0';
        } else {
            targetElement.style.opacity = '1';
        }
        targetElement.style.pointerEvents = 'none';
        targetElement.style.visibility = '';
        targetElement.innerHTML = '';
        targetElement.className = viewModeClass;

        const lazyObserver = getSharedObserver();

        // ---- Gestione lista vuota (INVARIATA) ----
        if (!currentGroups || currentGroups.length === 0 ||
            (context === 'playlists'
                ? (currentGroups.length === 2 && currentGroups[1].channels.length === 0)
                : context === 'epg'
                    ? (currentGroups.length >= 2 && currentGroups[1].channels.length === 0)
                    : (currentGroups.length === 1 && currentGroups[0].channels.length === 0)
            )
        ) {
            targetElement.__pendingScrollTop = null;

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

        // =========================================================
        // Helper: crea la singola tile
        //
        // [LAZY-GROUP] Nuovo parametro `isFirstPopulate`: true per il PRIMO
        // batch di un gruppo appena popolato (sincrono o lazy). In quel
        // batch le immagini vengono delegate all'IntersectionObserver
        // condiviso (lazy). Nei batch successivi (chunking interno del
        // gruppo) le immagini vengono settate eager per evitare un burst
        // di observe/unobserve che, su iOS, ha costo non banale.
        // =========================================================
        const createChannelItem = (channel, groupIndex, isFavoriteList, isFirstPopulate) => {
            const isGridView = effectiveViewMode === 'grid';
            const isChannelList = context === 'channels';

            // ---------- Percorso 1: griglia Apple TV ----------
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
                item.__channel = channel;
                item.draggable = true;

item.onclick = () => {
    beginPlaybackSession(
        isFavoriteList ? 'favorites' : 'channels',
        isFavoriteList ? 'favorites' : 'channels',
        { channel, fromFavorites: isFavoriteList }
    );
    playStream(channel, isFavoriteList);
};

                const program = getCurrentProgramFull(channel);
                const hasPoster = !!(program && program.poster);

                const backgroundUrl = hasPoster
                    ? program.poster
                    : (channel.logo || 'tasto-icon.png');

                item.dataset.bgType = hasPoster ? 'poster' : 'logo';
                item.style.backgroundColor = 'var(--epg-poster-bg)';

                if (isFirstPopulate) {
                    item.dataset.bgSrc = backgroundUrl;
                    getSharedObserver().observe(item);
                } else {
                    item.style.backgroundImage = `url("${backgroundUrl}")`;
                }

                const overlay = document.createElement('div');
                overlay.className = 'grid-overlay';

                const metaRow = document.createElement('div');
                metaRow.className = 'grid-meta-row';

                const channelNameSpan = document.createElement('div');
                channelNameSpan.className = 'grid-channel-name';
                channelNameSpan.textContent = channel.name || 'Senza nome';
                metaRow.appendChild(channelNameSpan);

                if (program && program.end) {
                    const endMs = new Date(program.end).getTime();
                    const nowMs = Date.now();
                    const remainingMs = endMs - nowMs;
                    if (!isNaN(remainingMs) && remainingMs > 0) {
                        const totalMinutes = Math.floor(remainingMs / 60000);
                        let label;
                        if (totalMinutes < 1) {
                            label = 'Ora';
                        } else if (totalMinutes < 60) {
                            label = totalMinutes + ' min';
                        } else {
                            const h = Math.floor(totalMinutes / 60);
                            const m = totalMinutes % 60;
                            label = m === 0 ? (h + 'h') : (h + 'h ' + m + 'm');
                        }

                        const timeRemaining = document.createElement('div');
                        timeRemaining.className = 'grid-time-remaining';
                        timeRemaining.textContent = label;
                        metaRow.appendChild(timeRemaining);
                    }
                }

                overlay.appendChild(metaRow);

                const programSpan = document.createElement('div');
                programSpan.className = 'grid-program-title';
                programSpan.textContent = program ? program.title : '';
                overlay.appendChild(programSpan);

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

                if (channel.logo && hasPoster) {
                    const logoBadge = document.createElement('div');
                    logoBadge.className = 'grid-channel-logo';

                    const logoImg = document.createElement('img');
                    logoImg.alt = '';
                    logoImg.decoding = 'async';
                    logoImg.src = channel.logo;
                    logoImg.onerror = function () {
                        this.onerror = null;
                        logoBadge.remove();
                    };

                    logoBadge.appendChild(logoImg);
                    item.appendChild(logoBadge);
                }

                item.appendChild(overlay);

                if (window.currentChannelUrl && item.dataset.key === window.currentChannelUrl) {
                    item.classList.add('active-channel');
                }

                return item;
            }

            // ---------- Percorso 2: lista standard ----------
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
            item.__channel = channel;

if (context === 'channels') {
    item.onclick = () => {
        beginPlaybackSession(
            isFavoriteList ? 'favorites' : 'channels',
            isFavoriteList ? 'favorites' : 'channels',
            { channel, fromFavorites: isFavoriteList }
        );
        playStream(channel, isFavoriteList);
    };
}

            const img = document.createElement('img');
            img.className = 'channel-logo';
            img.style.backgroundColor = 'var(--epg-poster-bg)';
            if (isFirstPopulate) {
                img.dataset.src = channel.logo || 'tasto-icon.png';
                getSharedObserver().observe(img);
            } else {
                img.src = channel.logo || 'tasto-icon.png';
            }
            item.appendChild(img);

            const nameContainer = document.createElement('div');
            nameContainer.style.cssText = 'flex: 1; min-width: 0;';

            const name = document.createElement('div');
            name.className = `channel-name ${isGridView ? 'grid-name' : 'list-name'}`;
            name.textContent = channel.name || 'Senza nome';
            nameContainer.appendChild(name);

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
        // [LAZY-GROUP] Costruzione header + group-content vuoti per tutti
        // i gruppi, poi popolamento sincrono dei primi N e lazy degli altri.
        // =============================================================
        const TIME_BUDGET_MS = 8;
        const RESTORE_BUDGET_MS = 50;

        let scrollPending = savedScrollTop > 0;
        if (scrollPending) targetElement.style.visibility = 'hidden';

        function tryRestoreScroll(force) {
            if (!scrollPending) return;

            // [LAZY-GROUP] Se c'è uno scroll da ripristinare, il
            // scrollHeight deve essere stabile. Forza il pop-all prima di
            // ripristinare: è l'unico modo per garantire che il target
            // scrollTop sia raggiungibile. Costo: il pop-all (equivalente
            // al render completo). Ma questo ramo scatta solo su render
            // con `preserveScroll: true` (back dal player con scroll
            // preservato), non sul primo render.
            if (scrollPending && savedScrollTop > 0 && !window.__lazyPopAllDone) {
                window.__lazyPopAllDone = true;
                window.__populateAllGroups?.().then(() => {
                    force = true;
                    doRestore(force);
                }).catch(() => doRestore(true));
                return;
            }
            doRestore(force);
        }

        function doRestore(force) {
            if (!scrollPending) return;
            const maxTop = targetElement.scrollHeight - targetElement.clientHeight;
            if (force || maxTop >= savedScrollTop) {
                targetElement.scrollTop = savedScrollTop;
                targetElement.style.visibility = '';
                targetElement.__pendingScrollTop = null;
                scrollPending = false;
            }
        }
        // Reset del flag per il prossimo render
        window.__lazyPopAllDone = false;

        // =============================================================
        // Costruisci header + group-content vuoti, e definisci il populate
        // di ciascun gruppo. I primi gruppi (sincroni) e il gruppo che
        // contiene `window.currentChannelUrl` vengono popolati subito;
        // gli altri vanno in lazy.
        // =============================================================
        const populateQueue = []; // { content, group, groupIndex, isCommandGroup }

        currentGroups.forEach((group, groupIndex) => {
            if (!group.channels || group.channels.length === 0) return;

            const isCommandGroup = !!(group.channels[0] && group.channels[0].url === '#url');

            let collapseCtx = null;
            if (!isCommandGroup) {
                if (context === 'channels') {
                    collapseCtx = showingFavorites ? 'favorites' : 'channels';
                } else if (context === 'playlists') {
                    collapseCtx = 'playlists';
                } else if (context === 'epg') {
                    collapseCtx = 'epg';
                }
            }

            const isCollapsed = (collapseCtx && collapseStates[collapseCtx])
                ? !!(collapseStates[collapseCtx][group.name])
                : false;

            // --- Header ---
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

            groupTitle.appendChild(groupName);
            groupTitle.appendChild(groupCount);

            if (context === 'channels') {
                const dragHandle = document.createElement('span');
                dragHandle.className = 'group-drag-handle';
                dragHandle.textContent = '☰';
                groupTitle.appendChild(dragHandle);
            }

            let groupToggle = null;
            if (!isCommandGroup) {
                groupToggle = document.createElement('span');
                groupToggle.className = 'group-toggle';
                groupToggle.textContent = isCollapsed ? '+' : '-';
                groupTitle.appendChild(groupToggle);
            }

            groupHeader.appendChild(groupTitle);

            // --- Content ---
            const groupContent = document.createElement('div');
            groupContent.className = `group-content ${effectiveViewMode}-view`;
            if (isCollapsed) groupContent.classList.add('collapsed');

            if (!isCommandGroup && collapseCtx) {
                groupHeader.addEventListener('click', e => {
                    if (e.target.closest('.group-drag-handle')) return;
                    if (groupHeader.closest('.search-active')) return;

                    const wasCollapsed = groupContent.classList.contains('collapsed');
                    groupContent.classList.toggle('collapsed', !wasCollapsed);
                    if (!collapseStates[collapseCtx]) collapseStates[collapseCtx] = {};
                    collapseStates[collapseCtx][group.name] = !wasCollapsed;
                    if (groupToggle) groupToggle.textContent = wasCollapsed ? '-' : '+';
                    saveGroupCollapseStates();
                });
            }

            targetElement.appendChild(groupHeader);
            targetElement.appendChild(groupContent);

            // --- Popolamento ---
            let populated = false;
            let placeholder = null;

            const populate = (done) => {
                let idx = 0;
                let firstBatch = true;

                const step = () => {
                    if (!isCurrentRender()) { done && done(); return; }
                    if (placeholder && placeholder.parentNode) {
                        placeholder.parentNode.removeChild(placeholder);
                        placeholder = null;
                    }
                    const startTime = performance.now();
                    const frag = document.createDocumentFragment();
                    while (idx < group.channels.length &&
                           performance.now() - startTime < TIME_BUDGET_MS) {
                        frag.appendChild(
                            createChannelItem(group.channels[idx], groupIndex, showingFavorites, firstBatch)
                        );
                        idx++;
                    }
                    firstBatch = false;
                    groupContent.appendChild(frag);
                    if (idx < group.channels.length) {
                        requestAnimationFrame(step);
                    } else {
                        done && done();
                    }
                };
                step();
            };

            // Il placeholder (visibile solo se il gruppo resta lazy)
            const makePlaceholder = () => {
                const ph = document.createElement('div');
                ph.style.cssText = 'padding:14px 12px;text-align:center;color:var(--text-secondary);' +
                                   'font-style:italic;font-size:0.85rem;opacity:0.8;';
                ph.textContent = `Caricamento ${group.channels.length} canali…`;
                return ph;
            };

            // Decisione sincrono vs lazy:
            //   - primo gruppo (indice 0) sempre sincrono: garantisce che
            //     la lista non appaia mai completamente vuota
            //   - gruppi collassati: non hanno contenuto visibile, ma se
            //     l'utente espande deve trovarli già pronti. Li popoliamo
            //     sincrono SOLO se sono tra i primi (altrimenti lazy: al
            //     click l'osservatore non scatterà, ma il CSS mostra il
            //     contenuto se era già nel DOM — bug potenziale).
            //     → Per sicurezza: gruppi collassati sempre lazy.
            //   - gruppo contenente il canale corrente: sincrono (serve
            //     per highlight + scroll)
            //   - gruppi-comando ("Aggiungi playlist"): sincrono (sono 1
            //     item, costo zero)
            //   - resto: lazy
            const containsCurrent = window.currentChannelUrl && group.channels.some(
                c => getChannelKey(c) === window.currentChannelUrl
            );
            const isSync = isCommandGroup || groupIndex === 0 || containsCurrent;

            if (isSync) {
                populated = true;
                populateQueue.push({ populate, isSync: true, content: groupContent, group });
            } else {
                placeholder = makePlaceholder();
                groupContent.appendChild(placeholder);
                _groupPopCallbacks.set(groupContent, { populate, populated: false, placeholder });
                _getOrCreateGroupPopObserver().observe(groupContent);
            }
        });

        // Esegui i popolamenti sincroni (primo gruppo + current + comando)
        let syncPending = populateQueue.length;
        if (syncPending === 0) {
            finalizeRendering();
        } else {
            populateQueue.forEach(({ populate }) => {
                populate(() => {
                    syncPending--;
                    if (syncPending === 0) finalizeRendering();
                });
            });
        }

        function finalizeRendering() {
            if (!isCurrentRender()) return;

            if (context === 'channels' && typeof reapplySearchAfterRender === 'function') {
                reapplySearchAfterRender();
            }

            targetElement.style.opacity = '1';
            targetElement.style.pointerEvents = 'auto';
            tryRestoreScroll(true);

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

        targetElement.style.pointerEvents = 'auto';
    });
}
/**
 * Restituisce l'array piatto dei canali attualmente visualizzati.
 */
function getCurrentDisplayList() {
  return showingFavorites ? favoriteChannels : channels;
}


let lastRenderedChannelData = null;
// ============================================================================
// 26. SHOW CHANNEL LIST — RITORNO ALLA LISTA CANALI
// ============================================================================

/**
 * Torna alla vista "lista canali" (o preferiti).
 */
async function showChannelList() {
    window.isEPGView = false;
    window.isPlaylistView = false;

    await cleanupPlayers({ keepVideoVisible: false });
    document.getElementById('metadataContainer').style.display = 'none';

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

    channelListContainer.classList.remove('hidden');
    channelListContainer.style.display = '';

    document.querySelector('.main-header')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('bottomTabBar')?.classList.remove('hidden');

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

    if (window.currentChannelUrl) {
        setTimeout(async () => {
            const selector = `[data-key="${CSS.escape(window.currentChannelUrl)}"]`;
            const target = await scrollToChannelStable(
                document.getElementById('channelList'),
                selector
            );
            if (target) {
                document.querySelectorAll('.active-channel')
                    .forEach(el => el.classList.remove('active-channel'));
                target.classList.add('active-channel');
            }
        }, 50);
    }
}

// ============================================================================
// 27. ELIMINAZIONE CANALI
// ============================================================================

/**
 * Elimina un canale dalla lista corrente.
 */
function deleteChannel(channel, isFavoriteList) {
    const key = getChannelKey(channel);

    if (isFavoriteList) {
        removeFromFavorites(key);
    } else {
        removeFromMainList(key);
    }

    // [FIX] Se il canale cancellato era quello in riproduzione, verifica
    // se esiste ancora nell'altra lista (es. cancellato dai preferiti ma
    // ancora presente nei canali). Se non esiste più in nessuna delle due,
    // azzera lo stato di playback: prev/next restituiranno -1 (pulsanti
    // disabilitati) finché l'utente non sceglie un altro canale.
    // Il player NON viene fermato: l'utente non ha chiesto di interrompere
    // la riproduzione, e stopparla di forza sarebbe UX peggiore.
    if (window.currentChannelUrl === key) {
        const stillExists =
            channels.some(c => getChannelKey(c) === key) ||
            favoriteChannels.some(c => getChannelKey(c) === key);

        if (!stillExists) {
            window.currentChannelUrl = null;
            if (window.PlaybackStore) window.PlaybackStore.clear();
            if (typeof clearPlaybackSession === 'function') clearPlaybackSession();
        }
    }

    updateUI();
    rebuildIndexMaps();
}


/**
 * Rimuove un canale dai preferiti.
 */
async function removeFromFavorites(key) {
  const favIndex = favoriteChannels.findIndex(c => getChannelKey(c) === key);
  if (favIndex === -1) return;

  await idbDeleteFavorite(key);

  favoriteChannels.splice(favIndex, 1);
  favoriteKeys.delete(key);
  groupedFavoriteChannels = groupChannels(favoriteChannels);

  rebuildIndexMaps();

  if (typeof currentFavoriteIndex !== 'undefined') {
      if (favIndex === currentFavoriteIndex) {
          currentFavoriteIndex = Math.max(0, currentFavoriteIndex - 1);
      } else if (favIndex < currentFavoriteIndex) {
          currentFavoriteIndex--;
      }
  }

  if (showingFavorites) {
    renderGroupedChannelList(groupedFavoriteChannels, { context: 'channels', preserveScroll: true });
  }
}


/**
 * Rimuove un canale dalla lista completa.
 */
function removeFromMainList(key) {
    const channelIndex = channels.findIndex(c => getChannelKey(c) === key);
    if (channelIndex === -1) return;

    channels.splice(channelIndex, 1);
    groupedChannels = groupChannels(channels);

    rebuildIndexMaps();

    const m3uContent = generateM3UFromChannels(channels);
    void (async () => {

            try {
              const active = await getActivePlaylistMeta();
              if (active) {
                await updateM3URecord(active.id, { content: m3uContent, lastFetched: Date.now() });
              } else if (channels.length > 0) {
                const id = await saveM3UUrl('local', 'Local playlist');
                await updateM3URecord(id, { content: m3uContent, lastFetched: Date.now(), isActive: true });
                await setOnlyActive(id);
              }
            } catch (error) {
                 dbReportError(error, 'salvataggio playlist');
      }
    })();
}


/**
 * Ridisegna la lista correntemente visualizzata.
 */
function updateUI() {
    renderGroupedChannelList(showingFavorites ? groupedFavoriteChannels : groupedChannels, { context: 'channels', preserveScroll: true });

    updateButtons();
}


// ============================================================================
// 28. DRAG & DROP — DELEGAZIONE EVENTI
// ============================================================================

/**
 * Installa (una sola volta) la delegazione degli eventi di drag & drop.
 */
function setupDragAndDropDelegation() {
    const list = document.getElementById('channelList');
    if (!list || list.__dragDropInitialized) return;
    list.__dragDropInitialized = true;

    list.addEventListener('dragstart', (e) => {

        const header = e.target.closest('.group-header[draggable="true"]');
        if (header) {
            draggedItem            = null;
            draggedGroupIndex      = parseInt(header.dataset.groupIndex);
            draggedGroupIsFavorite = header.dataset.isFavorite === 'true';
            header.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-drag-type', 'group');
            e.dataTransfer.setData('text/plain', String(draggedGroupIndex));
            return;
        }

        const item = e.target.closest('.channel-item');
        if (!item) return;

        draggedGroupIndex        = null;
        draggedItem              = item;
        draggedItemOriginalGroup = parseInt(item.dataset.groupIndex);
        draggedItemOriginalUrl   = item.dataset.url;
        draggedItemIsFavorite    = item.dataset.isFavorite === 'true';
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-drag-type', 'channel');
        e.dataTransfer.setData('text/plain', item.dataset.key);
    });

    list.addEventListener('dragend', () => {
        clearDragVisuals(list);
        resetDragState();
    });

    const validDropSelector = () =>
        draggedGroupIndex !== null ? '.group-header' : (draggedItem ? '.channel-item' : null);

    list.addEventListener('dragover', (e) => {
        const selector = validDropSelector();
        if (selector && e.target.closest(selector)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });

    list.addEventListener('dragenter', (e) => {
        const selector = validDropSelector();
        const target = selector ? e.target.closest(selector) : null;
        if (!target) return;
        e.preventDefault();
        list.querySelectorAll('.drop-target').forEach(el => {
            if (el !== target) el.classList.remove('drop-target');
        });
        target.classList.add('drop-target');
    });

    list.addEventListener('dragleave', (e) => {
        const selector = validDropSelector();
        const target = selector ? e.target.closest(selector) : null;
        if (!target) return;
        if (target.contains(e.relatedTarget)) return;
        target.classList.remove('drop-target');
    });

    list.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isFavoriteList = draggedGroupIndex !== null ? draggedGroupIsFavorite : draggedItemIsFavorite;

        try {
            if (draggedGroupIndex !== null) handleGroupDrop(list, e);
            else if (draggedItem)           handleChannelDrop(list, e);
        } catch (err) {
            console.error('[DnD] drop non applicato, ridisegno la lista:', err);
            try { redrawChannelListKeepingScroll(isFavoriteList); } catch (_) {}
        } finally {
            clearDragVisuals(list);
            resetDragState();
        }
    });
}


/** Toglie le classi visive del drag. */
function clearDragVisuals(list) {
    list.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    list.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
}

/** Azzera lo stato del drag & drop. */
function resetDragState() {
    draggedItem              = null;
    draggedItemOriginalGroup = null;
    draggedItemOriginalUrl   = null;
    draggedItemIsFavorite    = false;
    draggedGroupIndex        = null;
    draggedGroupIsFavorite   = false;
}

/**
 * Ultima risorsa: ridisegna la lista canali mantenendo la posizione di scroll.
 */
function redrawChannelListKeepingScroll(isFavoriteList) {
    renderGroupedChannelList(
        isFavoriteList ? groupedFavoriteChannels : groupedChannels,
        { context: 'channels', preserveScroll: true }
    );
}

/**
 * Restituisce l'oggetto canale di una tile del DOM.
 */
function getChannelFromItem(el, group) {
    if (!el || !group || !Array.isArray(group.channels)) return null;
    if (el.__channel && group.channels.indexOf(el.__channel) !== -1) return el.__channel;
    const key = el.dataset ? el.dataset.key : null;
    if (!key) return null;
    return group.channels.find(ch => getChannelKey(ch) === key) || null;
}

/**
 * Verifica che il DOM rispecchi il modello (groups) e riallinea gli attributi.
 */
function syncChannelListDom(list, groups) {
    if (!list || !Array.isArray(groups)) return false;

    const kids = list.children;
    if (kids.length % 2 !== 0) return false;
    const blocks = [];
    for (let i = 0; i < kids.length; i += 2) {
        const header  = kids[i];
        const content = kids[i + 1];
        if (!header.classList.contains('group-header') ||
            !content.classList.contains('group-content')) return false;
        blocks.push({ header, content });
    }

    const expected = [];
    groups.forEach((g, gi) => {
        if (g && Array.isArray(g.channels) && g.channels.length > 0) expected.push({ g, gi });
    });
    if (expected.length !== blocks.length) return false;

    for (let b = 0; b < expected.length; b++) {
        const { g, gi } = expected[b];
        const { header, content } = blocks[b];

        const nameEl = header.querySelector('.group-name');
        if (!nameEl || nameEl.textContent !== g.name) return false;
        if (content.children.length !== g.channels.length) return false;

        const gIdx = String(gi);
        if (header.dataset.groupIndex !== gIdx) header.dataset.groupIndex = gIdx;

        const countEl  = header.querySelector('.group-channel-count');
        const countStr = String(g.channels.length);
        if (countEl && countEl.textContent !== countStr) countEl.textContent = countStr;

        for (let c = 0; c < g.channels.length; c++) {
            const el = content.children[c];
            const ch = g.channels[c];
            if (el.__channel !== ch) return false;
            if (el.dataset.groupIndex !== gIdx) el.dataset.groupIndex = gIdx;
            const key = getChannelKey(ch);
            if (el.dataset.key !== key) el.dataset.key = key;
        }
    }
    return true;
}

/** Drop di un CANALE su un altro canale. */
function handleChannelDrop(list, e) {
    const movedEl  = draggedItem;
    const targetEl = e.target.closest('.channel-item');
    if (!movedEl || !targetEl || targetEl === movedEl) return;

    const isFav = draggedItemIsFavorite;

    if (isFav !== (targetEl.dataset.isFavorite === 'true')) return;

    const groups         = isFav ? groupedFavoriteChannels : groupedChannels;
    const fromGroupIndex = draggedItemOriginalGroup;
    const toGroupIndex   = parseInt(targetEl.dataset.groupIndex, 10);
    const fromGroup      = groups[fromGroupIndex];
    const toGroup        = groups[toGroupIndex];

    const movedCh  = getChannelFromItem(movedEl,  fromGroup);
    const targetCh = getChannelFromItem(targetEl, toGroup);
    if (!movedCh || !targetCh) {
        redrawChannelListKeepingScroll(isFav);
        return;
    }

    const fromChannelIndex = fromGroup.channels.indexOf(movedCh);
    let   toChannelIndex   = toGroup.channels.indexOf(targetCh);

    if (fromGroupIndex === toGroupIndex && fromChannelIndex < toChannelIndex) {
        toChannelIndex--;
    }

    const sourceContent = movedEl.parentNode;

    if (!moveChannel(fromGroupIndex, fromChannelIndex, toGroupIndex, toChannelIndex, isFav)) {
        return;
    }

    targetEl.parentNode.insertBefore(movedEl, targetEl);

    if (fromGroup.channels.length === 0 && sourceContent && sourceContent !== movedEl.parentNode) {
        const sourceHeader = sourceContent.previousElementSibling;
        if (sourceHeader && sourceHeader.classList.contains('group-header')) sourceHeader.remove();
        sourceContent.remove();
    }

    if (!syncChannelListDom(list, groups)) redrawChannelListKeepingScroll(isFav);
}

/** Drop di un GRUPPO su un altro gruppo. */
function handleGroupDrop(list, e) {
    const targetHeader = e.target.closest('.group-header');
    if (!targetHeader) return;

    const isFav = draggedGroupIsFavorite;

    if (isFav !== (targetHeader.dataset.isFavorite === 'true')) return;

    const fromIndex = draggedGroupIndex;
    const toIndex   = parseInt(targetHeader.dataset.groupIndex, 10);
    if (Number.isNaN(toIndex) || fromIndex === toIndex) return;

    const groups = isFav ? groupedFavoriteChannels : groupedChannels;

    const movedHeader  = list.querySelector('.group-header.dragging');
    const movedContent = movedHeader ? movedHeader.nextElementSibling : null;

    if (!moveGroup(fromIndex, toIndex, isFav)) return;

    if (isFav) {
        persistFavoritesOrder(favoriteChannels).catch(() => {});
    } else {
        saveChannelOrder();
    }

    if (movedHeader && movedHeader !== targetHeader &&
        movedContent && movedContent.classList.contains('group-content')) {
        list.insertBefore(movedHeader,  targetHeader);
        list.insertBefore(movedContent, targetHeader);
        if (syncChannelListDom(list, groups)) return;
    }
    redrawChannelListKeepingScroll(isFav);
}


// ============================================================================
// 29. RIORDINO — GRUPPI E CANALI
// ============================================================================

/**
 * Sposta un gruppo all'interno della lista.
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

  groups.forEach((g, idx) => {
    if (!g) return;
    g.order = idx;
    if (Array.isArray(g.channels)) g.channels.forEach(ch => { if (ch) ch.groupOrder = idx; });
  });

  if (isFavoriteList) {
    favoriteChannels = groups.flatMap(g => g.channels || []);
  } else {
    channels = groups.flatMap(g => g.channels || []);
  }

  rebuildIndexMaps();

  return true;
}


/**
 * Sposta un canale all'interno della stessa lista.
 */
function moveChannel(fromGroupIndex, fromChannelIndex, toGroupIndex, toChannelIndex, isFavoriteList) {
  if (fromGroupIndex === toGroupIndex && fromChannelIndex === toChannelIndex) return false;

  const sourceGroups = isFavoriteList ? groupedFavoriteChannels : groupedChannels;

  if (!Array.isArray(sourceGroups) ||
      fromGroupIndex < 0 || fromGroupIndex >= sourceGroups.length ||
      toGroupIndex < 0 || toGroupIndex >= sourceGroups.length) return false;

  const fromGroup = sourceGroups[fromGroupIndex];
  const toGroup = sourceGroups[toGroupIndex];

  if (!fromGroup || !toGroup) return false;
  if (fromChannelIndex < 0 || fromChannelIndex >= fromGroup.channels.length) return false;

  const [movedChannel] = fromGroup.channels.splice(fromChannelIndex, 1);

  if (!movedChannel) return false;

  const oldKey = getChannelKey(movedChannel);

  movedChannel.group = toGroup.name;
  if (toGroup.order !== undefined) movedChannel.groupOrder = toGroup.order;

  const newKey = getChannelKey(movedChannel);

  const session = getPlaybackSession();
  const sessionNav = session
      ? session.navList
      : (window.playbackSource === 'favorites' ? 'favorites' : 'channels');
  if (oldKey !== newKey && window.currentChannelUrl === oldKey &&
      !!isFavoriteList === (sessionNav === 'favorites')) {
    window.currentChannelUrl = newKey;
  }

  let safeToIndex = toChannelIndex;
  if (safeToIndex < 0) safeToIndex = 0;
  if (safeToIndex > toGroup.channels.length) safeToIndex = toGroup.channels.length;

  toGroup.channels.splice(safeToIndex, 0, movedChannel);

  if (isFavoriteList) {
    favoriteChannels = groupedFavoriteChannels.flatMap(g => g.channels || []);

    favoriteKeys.delete(oldKey);
    favoriteKeys.add(newKey);

    void (async () => {
      try {
        await persistFavoritesOrder(favoriteChannels);
      } catch (error) {}
    })();
  } else {
    channels = groupedChannels.flatMap(g => g.channels || []);

    const m3uContent = generateM3UFromChannels(channels);

    void (async () => {
      try {


        const active = await getActivePlaylistMeta();

        if (active) {
          await updateM3URecord(active.id, { content: m3uContent, lastFetched: Date.now() });
        } else if (channels.length > 0) {
          const id = await saveM3UUrl('local', 'Local playlist');
          await updateM3URecord(id, { content: m3uContent, lastFetched: Date.now(), isActive: true });
          await setOnlyActive(id);
        }
      } catch (error) {
          dbReportError(error, 'salvataggio ordine');
      }
    })();
  }

  rebuildIndexMaps();
  return true;
}


/**
 * Recupera un canale a partire dal suo URL.
 */
function getChannelByUrl(url, fromFavorites = false) {
    if (fromFavorites) {
        return favoriteUrlMap.get(url) || null;
    } else {
        return channelUrlMap.get(url) || null;
    }
}


/**
 * Aggiorna groupedChannels dopo che un canale ha cambiato gruppo.
 */
function updateGroupedChannelsAfterGroupChange(channel, oldGroupName) {
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
 * Persiste su IndexedDB l'ordine corrente dei canali principali.
 */
function saveChannelOrder() {
  const flatFromGroups = groupedChannels.flatMap(g => g.channels || []);

  if (flatFromGroups.length !== channels.length) {
    channels = flatFromGroups;
  }

  const m3uContent = generateM3UFromChannels(channels);

  void (async () => {
    try {
      const active = await getActivePlaylistMeta();
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
    } catch (error) { dbReportError(error, 'salvataggio ordine'); }
  })();
}


// ============================================================================
// 30. STATO DEI PULSANTI IN HEADER
// ============================================================================

/**
 * Aggiorna lo stato dei pulsanti dell'header.
 */
function updateButtons() {
  updateToggleState();
}


/**
 * Sincronizza la classe .active del pulsante #favoritesPill.
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

/**
 * Aggiorna lo stato visivo del pannello metadati.
 */
function updateMetadataContainerState() {
  const container = document.getElementById('metadataContainer');
  const header = document.getElementById('metadataHeader');
  const metadataContent = document.getElementById('metadataContent');

  metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';
  const showMetadataEnabled = localStorage.getItem("zappone_show_metadata") === "true";

  if (showMetadataEnabled) {
    header.style.display = "flex";
    if (metadataExpanded) {
      container.classList.add('expanded');
      container.style.display = 'block';

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
      if (metadataContent) {
        metadataContent.innerHTML = '';
      }
      container.classList.remove('expanded');
      container.style.display = 'none';
    }
  } else {
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
 */
function getActiveChannel() {
  const key = window.currentChannelUrl;
  const list = showingFavorites ? favoriteChannels : getCurrentDisplayList();
  return list.find(ch => getChannelKey(ch) === key) || null;
}



/**
 * Restituisce true se la modalità Radio è attiva.
 * Legge dal checkbox se la sidebar è caricata, altrimenti da localStorage.
 * Necessaria perché #radioToggle vive nel template della sidebar, che non
 * è nel DOM quando sidebar.js non è caricato.
 */
function isRadioModeActive() {
  const chk = document.getElementById('radioToggle');
  if (chk) return chk.checked;
  return localStorage.getItem('zappone_radio_mode') === 'true';
}



/**
 * Costruisce la griglia dei metadati del canale nel pannello sotto il player.
 */
function showChannelMetadata(channel) {
  const metadataContent = document.getElementById('metadataContent');

  if (metadataContent.children.length > 0) {
    updateMetadataValues(channel);
    return;
  }

  metadataContent.innerHTML = '';

  const isRadioMode = isRadioModeActive();
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
          input.blur();
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
 * Aggiorna i valori visualizzati nella griglia metadati.
 */
function updateMetadataValues(channel) {
  const isRadioMode = isRadioModeActive();
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

  if (oldGroup !== ch.group && !isFavView) {
    updateGroupedChannelsAfterGroupChange(ch, oldGroup);
  }

  if (isFavView && favoriteKeys.has(oldKey)) {
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
    const mainIndex = channels.findIndex(c => getChannelKey(c) === oldKey);
    if (mainIndex !== -1) {
      channels[mainIndex] = ch;
    }

    groupedChannels = groupChannels(channels);
    renderGroupedChannelList(groupedChannels, { context: 'channels' });
    rebuildIndexMaps();

    try {
      const active = await getActivePlaylistMeta();
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

  if (window.currentChannelUrl === oldKey) {
    window.currentChannelUrl = getChannelKey(ch);
  }

  if (metadataExpanded) {
    showChannelMetadata(ch);
  }
}


// ============================================================================
// 32. GESTURE — SWIPE PER CAMBIARE LISTA/GRIGLIA
// ============================================================================

/**
 * Aggancia i listener touch/mouse per lo swipe ai container delle liste.
 */
function setupSwipeHandlers() {
  const channelContainer = document.getElementById('channelListContainer');
  const fullEpgList = document.getElementById('fullEpgList');
  const playlistList = document.getElementById('playlistList');
  const epgList = document.getElementById('epgList');
  const containers = [channelContainer, fullEpgList, playlistList, epgList].filter(Boolean);

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

      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (el && (el.closest('.sidebar') || el.closest('.sidebar-handle') ||
                 el.closest('.bottom-sheet') || el.closest('.bottom-sheet-handle') ||
                 el.closest('#channelEpgDrawer') || el.closest('.bottom-sheet-drag-area'))) {
        container.__ignoreNextTouch = true;
        return;
      }
      container.__ignoreNextTouch = false;

      if (t.clientX > (window.innerWidth - SIDEBAR_EDGE_WIDTH) && t.clientY > HEADER_HEIGHT) {
        container.__ignoreNextTouch = true;
        return;
      }

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


/** Calcola dx/dy dallo swipe touch e delega a processSwipe. */
function handleSwipe() {
  const dx = touchEndX - touchStartX;
  const dy = (typeof touchEndY !== 'undefined' && typeof touchStartY !== 'undefined') ? (touchEndY - touchStartY) : 0;
  processSwipe(dx, dy);
}


/** Calcola dx/dy dallo swipe mouse e delega a processSwipe. */
function handleMouseSwipe() {
  const dx = mouseUpX - mouseDownX;
  const dy = (typeof mouseUpY !== 'undefined' && typeof mouseDownY !== 'undefined') ? (mouseUpY - mouseDownY) : 0;
  processSwipe(dx, dy);
}


/** Interpreta un gesto orizzontale e decide se cambiare modalità di vista. */
function processSwipe(dx, dy) {
  const MIN_DISTANCE = 180;
  const HORIZONTAL_DOMINANCE = 2.5;

  if (Math.abs(dx) < MIN_DISTANCE) return;
  if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return;

  const sidebar = document.querySelector('.sidebar');
  if (sidebar && sidebar.classList.contains('open')) return;
  if (document.querySelector('.bottom-sheet.open')) return;
  if (document.getElementById('channelEpgDrawer')?.classList.contains('open')) return;

  const channelListContainer = document.getElementById('channelListContainer');
  if (!channelListContainer || channelListContainer.classList.contains('hidden')) return;

  if (dx > 0 && currentViewMode === 'grid') {
    switchViewMode('list');
  } else if (dx < 0 && currentViewMode === 'list') {
    switchViewMode('grid');
  }
}


/**
 * Porta il target al centro del container SENZA attraversare i gruppi
 * intermedi. Usa scroll istantaneo (scrollTop += delta) invece di
 * scrollIntoView({behavior:'smooth'}): lo smooth scroll attraversa TUTTI
 * i gruppi tra la posizione corrente e il target, ne fa scattare
 * l'IntersectionObserver e ne causa la crescita (placeholder 40px →
 * altezza reale centinaia di px). Il target "sprofonda" proporzionalmente
 * e atterra fuori centro.
 *
 * Convergenza: lo scroll istantaneo non fa scattare l'IO per i gruppi
 * sopra il target, quindi solo i vicini immediati (dentro rootMargin
 * 300px) si popolano. Si itera finché il target è stabile (<2px per 2
 * frame consecutivi). In pratica 2-3 iterazioni.
 */
async function scrollToChannelStable(container, selector, maxIter = 8) {
    if (!container || !selector) return null;
    const raf = () => new Promise(r => requestAnimationFrame(r));
    let stableCount = 0;
    let populateAttempted = false;

    for (let i = 0; i < maxIter; i++) {
        const target = container.querySelector(selector);

        if (!target) {
            // Caso raro: il gruppo del target non è popolato (containsCurrent
            // dovrebbe garantirlo sync). Fallback: populateAll una volta sola.
            if (!populateAttempted && typeof window.__populateAllGroups === 'function') {
                populateAttempted = true;
                try { await window.__populateAllGroups(); } catch (_) {}
            } else {
                await raf();
            }
            continue;
        }

        const cRect = container.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();
        const delta = (tRect.top + tRect.height / 2) - (cRect.top + cRect.height / 2);

        if (Math.abs(delta) < 2) {
            if (++stableCount >= 2) return target;
        } else {
            stableCount = 0;
            container.scrollTop += delta;   // ISTANTANEO — non smooth
        }
        await raf();
        await raf();    // un frame per il reflow, uno per far scattare IO + populate chunk
    }
    return container.querySelector(selector);
}


/** Cambia la modalità di vista della lista canali. */
function switchViewMode(mode) {
    currentViewMode = mode;
    if (typeof saveViewModePreference === 'function') {
        saveViewModePreference(mode);
    } else {
        localStorage.setItem('zappone_view_mode', mode);
    }

    if (typeof window.__syncViewPillState === 'function') {
        window.__syncViewPillState();
    } else {
        const viewModePill = document.getElementById('viewModePill');
        if (viewModePill) {
            viewModePill.classList.remove('list-mode', 'grid-mode', 'collapse-mode');
            viewModePill.classList.add(mode === 'grid' ? 'grid-mode' : 'list-mode');
        }
    }

    const channelListContainer = document.getElementById('channelListContainer');
    const isChannelsVisible = channelListContainer &&
        !channelListContainer.classList.contains('hidden') &&
        channelListContainer.style.display !== 'none';

    if (!isChannelsVisible) {
        lastRenderedChannelData = null;
        const channelList = document.getElementById('channelList');
        if (channelList) channelList.setAttribute('data-view-mode', 'reset');
        return;
    }

    renderGroupedChannelList(
        showingFavorites ? groupedFavoriteChannels : groupedChannels,
        { context: 'channels' }
    );

    if (window.currentChannelUrl) {
        setTimeout(async () => {
            const selector = `[data-key="${CSS.escape(window.currentChannelUrl)}"]`;
            const target = await scrollToChannelStable(
                document.getElementById('channelList'),
                selector
            );
            if (target) {
                document.querySelectorAll('.active-channel')
                    .forEach(el => el.classList.remove('active-channel'));
                target.classList.add('active-channel');
            }
        }, 50);
    }
}

/** Salva su localStorage la preferenza di visualizzazione. */
function saveViewModePreference(mode) {
  if (localStorage.getItem('zappone_view_mode') !== mode) {
    localStorage.setItem('zappone_view_mode', mode);
  }
  const favStr = String(showingFavorites);
  if (localStorage.getItem('zappone_show_favorites') !== favStr) {
    localStorage.setItem('zappone_show_favorites', favStr);
  }
}


/** Legge da localStorage le preferenze di visualizzazione. */
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

let _notifyReentrancyGuard = false;

/**
 * Mostra una notifica toast all'utente.
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

    const maxLength = 150;
    const safeMessage = String(message ?? '');
    notification.textContent = safeMessage.length > maxLength ? safeMessage.substring(0, maxLength) + '...' : safeMessage;

    container.appendChild(notification);

    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    setTimeout(() => {
      notification.classList.remove('show');

      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);

  } catch (e) {
    console.error('showNotification error', e);
  } finally {
    _notifyReentrancyGuard = false;
  }
}


// ============================================================================
// FINE PARTE 1 — continua nella Parte 2 (sezioni 43–56)
// ============================================================================

// ============================================================================
// 43. REFRESH UI PLAYLIST
// ============================================================================
//
// Aggiorna tutte le viste che mostrano le playlist: sidebar (se presente,
// tramite window.ZappOneSidebar), playlist manager (se aperto), stato del
// pulsante preferiti. La sidebar è opzionale: se sidebar.js non è caricato,
// la riga #savedM3UList semplicemente non esiste e la chiamata è no-op.

function refreshPlaylistUIs() {
    window.forcePlaylistReload = true;
    window.ZappOneSidebar?.loadM3UUrlList?.();

    if (window.isPlaylistView) {
        renderPlaylistList();
    }

    updateToggleState();
}


// ============================================================================
// 45. BOTTOM SHEET M3U — APERTURA E CHIUSURA
// ============================================================================

/**
 * Apre il bottom sheet per il caricamento M3U da URL.
 */
function openBottomSheet() {
  const bottomSheet = document.getElementById("m3uUrlBottomSheet");
  const overlay = document.getElementById("bottomSheetOverlay");
  if (!bottomSheet || !overlay) return;

  bottomSheet.classList.remove("hidden");
  overlay.classList.remove("hidden");

  setTimeout(() => {
    bottomSheet.classList.add("open");
    overlay.classList.add("open");
  }, 10);

  setTimeout(() => {
    document.getElementById("modalM3UName")?.focus();
  }, 300);
}


/**
 * Chiude il bottom sheet M3U con animazione.
 */
function closeBottomSheet() {
  const bottomSheet = document.getElementById("m3uUrlBottomSheet");
  const overlay = document.getElementById("bottomSheetOverlay");
  if (!bottomSheet || !overlay) return;

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
// 47. WIRING BOTTOM SHEET M3U — CAMPI E PULSANTI
// ============================================================================

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


// Funzione globale: caricamento della playlist predefinita.
// Riceve il CONTENUTO (non l'URL, che resta server-side).
// Chiamata da A09-secret-defaults.js dopo serve-default.
window.loadDefaultPlaylist = async function (content) {
  if (typeof content !== 'string' || !content.trim()) {
    showNotification("Contenuto playlist non valido", true);
    return;
  }
  if (typeof isValidM3UText === 'function' && !isValidM3UText(content)) {
    showNotification("Playlist predefinita non valida", true);
    return;
  }
  try {
    // URL simbolico non-http: saveAndActivateM3U lo tratta come locale
    // (cerca per nome tra i record locali → sovrascrive al gesto successivo).
    const rec = await saveAndActivateM3U({
      url: 'default:m3u',
      name: 'Playlist predefinita',
      content
    });
    await parseM3U(rec.content, false);   // false: non auto-scaricare EPG da x-tvg-url
    showingFavorites = false;
    window.isPlaylistView = false;
    updateButtons?.();
    if (typeof showChannelList === 'function') await showChannelList();
    if (typeof refreshPlaylistUIs === 'function') refreshPlaylistUIs();
    showNotification('Playlist predefinita caricata');
  } catch (err) {
    console.error('loadDefaultPlaylist:', err);
    showNotification('Errore caricamento playlist predefinita', true);
  }
};


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


// Funzione globale: caricamento dell'EPG predefinito.
// Riceve il CONTENUTO (testo XML/JSON, già decompresso da A09).
window.loadDefaultEPG = async function (rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    showNotification("Contenuto EPG non valido", true);
    return;
  }
  try {
    let parsedData;
    if (rawText.trim().startsWith('<') || rawText.includes('<tv>')) {
      parsedData = await parseEPGText(rawText);
    } else {
      parsedData = JSON.parse(rawText);
    }
    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      showNotification("EPG non parsabile o vuoto", true);
      return;
    }
    // isDefault: true → db.js tratta il record come "EPG predefinito"
    // e applica il fix 10 (slot liberi) anche senza appConfig.epgUrl.
    await saveAndActivateEPG(
      { url: 'default:epg', name: 'EPG predefinito', content: parsedData },
      { setActive: true, isDefault: true }
    );
    epgData = parsedData;
    if (typeof rebuildEpgMap === 'function') rebuildEpgMap();
    window.forceEPGReload = true;
    if (typeof renderEPGManager === 'function') renderEPGManager();
    showNotification(`EPG predefinito caricato: ${parsedData.length} canali`);
  } catch (err) {
    console.error('loadDefaultEPG:', err);
    showNotification('Errore caricamento EPG predefinito', true);
  }
};

// ============================================================================
// 51. DRAG-TO-DISMISS DEI BOTTOM SHEET
// ============================================================================

(function () {

  function setupBottomSheetDrag(sheetId, overlayId, openFn, closeFn) {
    const sheet = document.getElementById(sheetId);
    const overlay = document.getElementById(overlayId);
    if (!sheet || !overlay) return;

    let handle = sheet.querySelector('.bottom-sheet-handle, .bottom-sheet-drag-area');

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

    function onTouchMoveSheet(e) {
      if (isDragging) {
        onDrag(e.touches[0].clientY);
        e.preventDefault();
      }
    }

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener('touchmove', onTouchMoveSheet);
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

    handle.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length === 0) return;
      startDrag(e.touches[0].clientY);
      document.addEventListener('touchmove', onTouchMoveSheet, { passive: false });
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', () => {
      if (isDragging) endDrag();
    }, { passive: false });
    document.addEventListener('touchcancel', () => { if (isDragging) endDrag(); }, { passive: true });

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

    overlay.addEventListener('click', closeFn);
  }

  setupBottomSheetDrag('m3uUrlBottomSheet', 'bottomSheetOverlay', openBottomSheet, closeBottomSheet);
  setupBottomSheetDrag('epgUrlBottomSheet', 'bottomSheetOverlayEPG', openEPGBottomSheet, closeEPGBottomSheet);
})();


// ============================================================================
// 52. PILL "PREFERITI / TUTTI" — CLICK E LONG PRESS
// ============================================================================

(function setupFavoritesPill() {
  const pill = document.getElementById('favoritesPill');
  if (!pill) return;

  let ignoreNextClick = false;

  pill.addEventListener('click', async (e) => {
    if (ignoreNextClick) {
      ignoreNextClick = false;
      e.stopPropagation();
      return;
    }

    if (deletionMode) {
      toggleDeletionMode();
      e.stopPropagation();
      return;
    }

    showingFavorites = !showingFavorites;
    saveViewModePreference(currentViewMode);

    const channelCont = document.getElementById('channelListContainer');
    const playlistCont = document.getElementById('playlistListContainer');
    const epgCont = document.getElementById('epgListContainer');
    const playerCont = document.getElementById('playerContainer');

    if (playlistCont) playlistCont.classList.add('hidden');
    if (epgCont) epgCont.classList.add('hidden');
    if (playerCont) playerCont.style.display = 'none';
    if (channelCont) {
      channelCont.classList.remove('hidden');
      channelCont.style.display = '';
    }

    document.querySelector('.main-header')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('bottomTabBar')?.classList.remove('hidden');

    window.isPlaylistView = false;
    window.isEPGView = false;

    renderGroupedChannelList(
      showingFavorites ? groupedFavoriteChannels : groupedChannels,
      { context: 'channels' }
    );

    updateToggleState();
    closeFullEPG();
  });

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

(function setupViewModePill() {
    const viewModePill = document.getElementById('viewModePill');
    if (!viewModePill) return;

    let viewPillMode = 'viewMode';
    let longPressTimer = null;
    const LONG_PRESS_DURATION = 600;
    let longPressFired = false;

    let ignoreNextClick = false;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // -------------------------------------------------------------------
    // Lista visibile in questo momento (canali | preferiti | playlist | epg).
    // La pill collapse/expand agisce SOLO su questa: mai su tutte.
    // -------------------------------------------------------------------
    function getVisibleListEl() {
        const pairs = [
            ['channelListContainer',  'channelList'],
            ['playlistListContainer', 'playlistList'],
            ['epgListContainer',      'epgList'],
        ];
        for (const [contId, listId] of pairs) {
            const cont = document.getElementById(contId);
            if (!cont) continue;
            if (cont.classList.contains('hidden')) continue;
            if (cont.style.display === 'none') continue;
            const list = document.getElementById(listId);
            if (list) return list;
        }
        return null;
    }

    // La prima riga dei manager è una riga-comando ("Aggiungi Playlist /
    // Aggiungi EPG"): non è un gruppo normale e non va mai collassata,
    // altrimenti l'utente perde l'accesso alla funzione di aggiunta.
    // La riconosciamo dal primo figlio con data-url="#url".
    function isCommandGroupContent(contentEl) {
        const first = contentEl && contentEl.firstElementChild;
        return !!(first && first.getAttribute && first.getAttribute('data-url') === '#url');
    }

    function getCollapsibleGroups(listEl) {
        if (!listEl) return [];
        return Array.from(listEl.querySelectorAll('.group-content'))
                    .filter(g => !isCommandGroupContent(g));
    }

    // Stato espanso/compresso della lista CORRENTE, letto dal DOM.
    // Niente cache: la pill non può "mentire" perché non ha stato proprio.
    function isCurrentListExpanded() {
        const listEl = getVisibleListEl();
        if (!listEl) return true;
        const groups = getCollapsibleGroups(listEl);
        if (groups.length === 0) return true;
        let expandedCount = 0;
        // Legge .collapsed, non style.display: il filtro scrive .filter-hidden
        // e non deve falsare la lettura dello stato utente.
        groups.forEach(g => { if (!g.classList.contains('collapsed')) expandedCount++; });
        return expandedCount >= groups.length / 2;
    }

    function updateViewModePill() {
        viewModePill.classList.remove(
            'collapse-mode', 'grid-mode', 'list-mode', 'is-collapsed', 'is-expanded'
        );

        if (viewPillMode === 'viewMode') {
            viewModePill.classList.add(currentViewMode === 'grid' ? 'grid-mode' : 'list-mode');
        } else {
            viewModePill.classList.add('collapse-mode');
            viewModePill.classList.add(isCurrentListExpanded() ? 'is-expanded' : 'is-collapsed');
        }
    }

    window.__syncViewPillState = function () {
        if (viewPillMode === 'collapseExpand') {
            viewPillMode = 'viewMode';
        }
        updateViewModePill();
    };

    // -------------------------------------------------------------------
    // Comprimi/espandi SOLO la lista visibile. La riga-comando resta
    // intoccata. Scrive nel contesto corretto (channels/favorites/playlists/epg).
    // -------------------------------------------------------------------
    function toggleCurrentListGroups(expand) {
        const listEl = getVisibleListEl();
        if (!listEl) return;

        const ctx = getCurrentCollapseContext();
        const groups = listEl.querySelectorAll('.group-content');

        groups.forEach(group => {
            if (isCommandGroupContent(group)) return;

            // Scrive .collapsed, non style.display: il filtro resta libero
            // di gestire .filter-hidden in autonomia.
            group.classList.toggle('collapsed', !expand);

            const header = group.previousElementSibling;
            if (header && header.classList.contains('group-header')) {
                const toggleSpan = header.querySelector('.group-toggle');
                if (toggleSpan) toggleSpan.textContent = expand ? '-' : '+';

                const titleSpan = header.querySelector('.group-name')
                               || header.querySelector('.group-title > span');
                if (titleSpan) {
                    const name = titleSpan.textContent.trim();
                    if (!collapseStates[ctx]) collapseStates[ctx] = {};
                    collapseStates[ctx][name] = !expand;
                }
            }
        });

        saveGroupCollapseStates();
    }

    viewModePill.addEventListener('click', () => {
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
            // Legge lo stato reale adesso: il click fa sempre l'opposto
            // di quello che la lista visibile sta mostrando.
            const currentlyExpanded = isCurrentListExpanded();
            toggleCurrentListGroups(!currentlyExpanded);
            updateViewModePill();
        }
    });

    function startTimer() {
        longPressFired = false;
        longPressTimer = setTimeout(() => {
            viewPillMode = (viewPillMode === 'viewMode') ? 'collapseExpand' : 'viewMode';

            if (viewPillMode === 'collapseExpand') {
                // Entrando in modalità collapse: comprimi la lista visibile
                // (non tutte!) e mostra "^" (click → espandi).
                toggleCurrentListGroups(false);
            }
            updateViewModePill();
            longPressFired = true;
            if (isTouchDevice) ignoreNextClick = true;
        }, LONG_PRESS_DURATION);
    }

    function endTimer() { clearTimeout(longPressTimer); }

    viewModePill.addEventListener('mousedown', startTimer);
    viewModePill.addEventListener('mouseup', endTimer);
    viewModePill.addEventListener('mouseleave', endTimer);
    viewModePill.addEventListener('touchstart', startTimer, { passive: true });
    viewModePill.addEventListener('touchend', endTimer);
    viewModePill.addEventListener('touchcancel', endTimer);

    // -------------------------------------------------------------------
    // Riallinea la pill quando:
    //   • cambia la vista (container mostra/nascondi) → class/style sui container;
    //   • la lista viene ricostruita (cambio playlist/preferiti) → childList.
    // -------------------------------------------------------------------
    const syncIfCollapse = () => {
        if (viewPillMode === 'collapseExpand') updateViewModePill();
    };

    ['channelList', 'playlistList', 'epgList'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        new MutationObserver(syncIfCollapse).observe(el, { childList: true });
    });

    ['channelListContainer', 'playlistListContainer', 'epgListContainer'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        new MutationObserver(syncIfCollapse).observe(el, {
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
    });

    // Click su un header di gruppo o su un tab della barra inferiore:
    // esce dalla modalità collapse della pill.
    document.addEventListener('click', e => {
        if (viewPillMode === 'collapseExpand' && !e.target.closest('#viewModePill')) {
            if (e.target.closest('.group-header') || e.target.closest('.tabbar-button')) {
                viewPillMode = 'viewMode';
                updateViewModePill();
            }
        }
    });

    updateViewModePill();
})();



// ============================================================================
// 55. PILL "OPZIONI / EXPORT / BACK" IN HEADER
// ============================================================================
//
// Nota: la voce "options" ora apre la sidebar tramite window.ZappOneSidebar.
// Se sidebar.js non è caricato, il click sul pill in modalità "options" è
// un no-op silenzioso (nessuna sidebar da aprire).

(function setupOptionsExportPill() {
  const pill = document.getElementById('optionsExportPill');
  const exportBtn = document.getElementById('exportButton');
  if (!pill || !exportBtn) return;

  const LONG_MS = 600;
  let timer = null;
  let longFired = false;
  let preventNextClick = false;

  function getCurrentContext() {
    const fullEpgContainer = document.getElementById('fullEpgContainer');
    if (fullEpgContainer && !fullEpgContainer.classList.contains('hidden')) return 'full-epg';
    const playlistContainer = document.getElementById('playlistListContainer');
    if (playlistContainer && !playlistContainer.classList.contains('hidden')) return 'playlists';
    const epgContainer = document.getElementById('epgListContainer');
    if (epgContainer && !epgContainer.classList.contains('hidden')) return 'epg';
    return 'channels';
  }

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

  // Rimandato al primo MutationObserver: al momento dell'IIFE la vista
  // iniziale non è ancora decisa (initializeApp chiamerà renderPlaylistList),
  // quindi valutare subito il contesto produce un flicker "back → opzioni".
  // Il primo MutationObserver scatterà appena channelListContainer verrà
  // nascosto o playlistListContainer mostrato, e allineerà la pill.
  requestAnimationFrame(() => updatePillIcon());

  const observer = new MutationObserver(() => setTimeout(updatePillIcon, 50));
  ['fullEpgContainer', 'channelListContainer', 'playlistListContainer', 'epgListContainer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  });

  pill.addEventListener('click', function(e) {
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
      const epgDrawer = document.getElementById('channelEpgDrawer');
      if (epgDrawer && epgDrawer.classList.contains('open')) {
          epgDrawer.classList.remove('open');
          setTimeout(() => epgDrawer.classList.add('hidden'), 300);
      }
      if (typeof renderEPGManager === 'function') renderEPGManager();
    } else {
      // Apre la sidebar se il modulo opzionale è caricato, no-op altrimenti.
      window.ZappOneSidebar?.open?.();
    }
  });

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

  const start = () => {
    if (getCurrentContext() !== 'channels') return;
    longFired = false;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      longFired = true;
      preventNextClick = true;
      await exportWithoutClosing();
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

(function setupRenameLongPress() {
  const LONG_PRESS_MS = 600;
  const SCROLL_TOLERANCE_PX = 8;

  let timer = null;
  let longPressFired = false;
  let startX = 0, startY = 0;

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

  async function saveRename(item, newName) {
    const isPlaylist = !!item.closest('#playlistList');
    if (isPlaylist) {
      const id = parseInt(item.dataset.playlistId, 10);
      if (!id) return;
      await updateM3URecord(id, { name: newName });
      // La lista in sidebar è opzionale: se il modulo è caricato, riallineala.
      if (typeof window.ZappOneSidebar?.loadM3UUrlList === 'function') {
        await window.ZappOneSidebar.loadM3UUrlList();
      }
    } else {
      const id = parseInt(item.dataset.epgId, 10);
      if (!id) return;
      await updateEPGRecord(id, { name: newName });
    }
    item.dataset.name = newName.toLowerCase();
  }

  function enterRenameMode(item) {
    if (item.querySelector('.rename-input')) return;
    const nameEl = item.querySelector('.channel-name');
    if (!nameEl) return;

    const currentName = nameEl.textContent.trim();

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
// FINE PARTE 2 — continua nella Parte 3 (sezioni 57–65 + ZappOneCore)
// ============================================================================

// ============================================================================
// 57. CARICAMENTO FILE LOCALI (M3U O EPG)
// ============================================================================

/**
 * Legge un file locale e lo importa nell'app.
 */
async function handleFileUpload(file, isEPG = false) {

    // Protezione licenza: file locali riservati a premium
    if (!appConfig.isPremium) {
        alert("La funzione di caricamento file locali è riservata agli utenti Premium.");
        return;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();

        // [FIX] Unico punto di uscita: garantisce resolve() SEMPRE,
        // anche su errore. Il chiamante non resta mai in attesa.
        const done = (msg = null, isError = false) => {
            if (msg && typeof showNotification === 'function') {
                showNotification(msg, isError);
            }
            resolve();
        };

        // [FIX] onerror: senza, un file troppo grande o un reader
        // fallito lasciava la promise pendente per sempre.
        reader.onerror = () => {
            console.error('FileReader error:', reader.error);
            done('Impossibile leggere il file', true);
        };

        reader.onload = async function (e) {
            try {
                const arrayBuffer = e.target.result;
                let text;

                // [FIX] case-insensitive: .gz, .GZ, .Gz
                const lowerName = (file.name || '').toLowerCase();
                if (lowerName.endsWith('.gz')) {
                    if (typeof DecompressionStream === 'undefined') {
                        throw new Error('Decompressione gzip non supportata su questo browser');
                    }
                    const blob = new Blob([arrayBuffer]);
                    const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
                    const decompressedResponse = new Response(decompressedStream);
                    text = await decompressedResponse.text();
                } else {
                    const decoder = new TextDecoder('utf-8');
                    text = decoder.decode(arrayBuffer);
                }

                // ============================================================
                // RAMO EPG
                // ============================================================
                if (isEPG) {
                    let parsedData = null;
                    try {
                        if (text.trim().startsWith('<') || text.includes('<tv>')) {
                            parsedData = await parseEPGText(text);
                        } else {
                            parsedData = JSON.parse(text);
                        }
                    } catch (err) {
                        console.warn('EPG parsing error:', err);
                    }

                    // [FIX] Valida PRIMA di toccare il DB: se il parsing
                    // ha fallito o non è un array non vuoto, usciamo
                    // senza aver modificato nulla.
                    if (!Array.isArray(parsedData) || parsedData.length === 0) {
                        done('Errore: EPG non parsabile o vuoto', true);
                        return;
                    }

                    try {
                        await saveAndActivateEPG({
                            url: 'file:' + file.name,
                            name: file.name,
                            content: parsedData
                        });
                    } catch (err) {
                        console.error('saveAndActivateEPG error:', err);
                        if (err && err.code === 'SLOTS_FULL') {
                            done('Slot EPG pieni. Elimina un EPG dal manager per liberare spazio.', true);
                        } else {
                            done('Errore nel salvataggio EPG: ' + (err && err.message ? err.message : ''), true);
                        }
                        return;
                    }

                    // [FIX] Aggiorna lo stato SOLO dopo salvataggio riuscito.
                    epgData = parsedData;
                    rebuildEpgMap();

                    if (typeof closeEPGBottomSheet === 'function') closeEPGBottomSheet();
                    if (typeof renderEPGManager === 'function') renderEPGManager();
                    done('EPG locale caricata e salvata.');
                    return;
                }

                // ============================================================
                // RAMO M3U
                // ============================================================
                // [FIX] Valida PRIMA di qualsiasi modifica di stato.
                // Se il file non è una playlist M3U, usciamo senza aver
                // azzerato l'EPG né toccato la playlist attiva.
                if (!isValidM3UText(text)) {
                    done('File non valido: non sembra una playlist M3U', true);
                    return;
                }

                // [FIX] Salva e attiva PRIMA di azzerare l'EPG. Se il
                // salvataggio fallisce (SLOTS_FULL, quota), l'EPG
                // corrente resta intatto.
                let rec;
                try {
                    rec = await saveAndActivateM3U({
                        url: 'file:' + file.name,
                        name: file.name,
                        content: text
                    });
                } catch (err) {
                    console.error('saveAndActivateM3U error:', err);
                    if (err && err.code === 'SLOTS_FULL') {
                        done('Slot playlist pieni. Elimina una playlist dal manager per liberare spazio.', true);
                    } else {
                        done('Errore nel salvataggio playlist: ' + (err && err.message ? err.message : ''), true);
                    }
                    return;
                }

                // [FIX] Da qui in poi la playlist è salvata e attiva: è
                // sicuro azzerare l'EPG (la nuova lista può avere canali
                // diversi da quelli dell'EPG precedente).
                epgData = [];
                rebuildEpgMap();

                await parseM3U(rec.content, true);
                showingFavorites = false;
                window.isPlaylistView = false;
                updateButtons();

                if (typeof closeBottomSheet === 'function') closeBottomSheet();
                if (typeof showChannelList === 'function') showChannelList();
                if (typeof refreshPlaylistUIs === 'function') refreshPlaylistUIs();

                // [FIX] Sanity check: se il parse non ha prodotto canali,
                // avvisa l'utente (senza rollback: può ricaricare un'altra
                // playlist, lo stato è recuperabile).
                if (Array.isArray(channels) && channels.length === 0) {
                    done('Playlist salvata ma senza canali validi. Controlla il file.', true);
                } else {
                    done();
                }

            } catch (err) {
                // [FIX] Qualsiasi errore non previsto (decompressione,
                // quota, timeout del worker, ecc.) viene catturato qui.
                // La promise del chiamante viene comunque risolta.
                console.error('handleFileUpload error:', err);
                done('Errore nel caricamento del file: ' + (err && err.message ? err.message : 'sconosciuto'), true);
            }
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
// Aggancia i listener UI del CORE (header, player, tab bar, bottom sheet
// M3U/EPG, file input, ecc.). I listener della sidebar impostazioni vivono
// in sidebar.js e non sono presenti qui.
//
// Chiamata una sola volta da DOMContentLoaded.
// ============================================================================

function setupEventListeners() {

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

// --- Navigazione canali precedente / successivo ---
document.getElementById('prevBtn').addEventListener('click', () => {
    navigateChannels('prev');
});

document.getElementById('nextBtn').addEventListener('click', () => {
    navigateChannels('next');
});


/**
 * Porta in vista il canale correntemente in riproduzione, centrandolo
 * verticalmente nella lista.
 *
 * ── Perché non si può usare semplicemente scrollIntoView ──
 * Le righe della lista hanno `content-visibility: auto` con
 * `contain-intrinsic-size: auto 82px`. Le righe fuori schermo non vengono
 * misurate: il browser ne stima l'altezza a 82px. Se l'altezza reale è
 * diversa (le righe con "programma in corso" sono più alte), l'errore si
 * accumula e la posizione calcolata per il target è sbagliata.
 */
function scrollToCurrentChannelWhenReady(channelList, maxAttempts = 20, intervalMs = 50) {
    if (!channelList || !window.currentChannelUrl) return;
    const selector = `[data-key="${CSS.escape(window.currentChannelUrl)}"]`;
    setTimeout(async () => {
        const target = await scrollToChannelStable(channelList, selector);
        if (target) {
            document.querySelectorAll('.active-channel')
                .forEach(el => el.classList.remove('active-channel'));
            target.classList.add('active-channel');
        }
    }, intervalMs);
}

// --- Pulsante "back": torna alla lista canali ---
document.getElementById('backButton').addEventListener('click', async () => {

    // Legge la sessione UNA volta, poi la azzera: nessun altro ramo
    // del codice deve vedere una sessione vecchia durante gli await.
    const session = getPlaybackSession();
    const origin = session ? session.origin : 'channels';
    const ctx    = (session && session.context) || {};
    clearPlaybackSession();

    // ── Contesto palinsesto (griglia): torna alla griglia EPG ──
    if (origin === 'fullEpgGrid') {
        try {
            if (typeof cleanupPlayers === 'function') {
                await cleanupPlayers({ keepVideoVisible: false });
            }
        } catch (e) {
            console.warn('cleanupPlayers failed on back:', e);
        }
        document.getElementById('playerContainer')?.classList.remove('loading');

        document.getElementById('channelListContainer')?.classList.add('hidden');
        document.getElementById('playlistListContainer')?.classList.add('hidden');
        document.getElementById('epgListContainer')?.classList.add('hidden');
        document.getElementById('playerContainer').style.display = 'none';
        document.getElementById('fullEpgContainer')?.classList.remove('hidden');

        document.querySelector('.main-header')?.classList.remove('hidden');
        document.getElementById('controls')?.classList.remove('hidden');
        document.getElementById('bottomTabBar')?.classList.remove('hidden');

        window.isPlaylistView = false;
        window.isEPGView = false;

        // [REFRACTOR] Unico entry point per centrare il canale corrente.
        // Legge da PlaybackStore e delega a highlightFegChannel /
        // highlightEpgListChannel in base alla modalità attiva.
        if (typeof window.fullEpgFocusCurrentChannel === 'function') {
            window.fullEpgFocusCurrentChannel();
        }
        return;
    }

    // ── Contesto palinsesto (lista Guida canali): torna alla lista EPG ──
    if (origin === 'fullEpgList') {
        try {
            if (typeof cleanupPlayers === 'function') {
                await cleanupPlayers({ keepVideoVisible: false });
            }
        } catch (e) {
            console.warn('cleanupPlayers failed on back:', e);
        }
        document.getElementById('playerContainer')?.classList.remove('loading');

        document.getElementById('channelListContainer')?.classList.add('hidden');
        document.getElementById('playlistListContainer')?.classList.add('hidden');
        document.getElementById('epgListContainer')?.classList.add('hidden');
        document.getElementById('playerContainer').style.display = 'none';
        document.getElementById('fullEpgContainer')?.classList.remove('hidden');

        document.querySelector('.main-header')?.classList.remove('hidden');
        document.getElementById('controls')?.classList.remove('hidden');
        document.getElementById('bottomTabBar')?.classList.remove('hidden');

        window.isPlaylistView = false;
        window.isEPGView = false;

        // Forza la vista lista e rirenderizza (che a sua volta chiama
        // applyFullEpgViewMode → fullEpgFocusCurrentChannel).
        if (typeof fullEpgViewMode !== 'undefined') {
            fullEpgViewMode = 'list';
            localStorage.setItem('zappone_full_epg_view_mode', 'list');
        }
        if (typeof renderFullEPGList === 'function') {
            renderFullEPGList();
        }
        return;
    }

    // ── Contesto playlist (comportamento esistente) ──
    if (typeof closeFullEPG === 'function') closeFullEPG();

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

    // Se la sessione diceva esplicitamente 'favorites'/'channels',
    // allinea showingFavorites PRIMA della lettura da localStorage:
    // la fonte di verità è la sessione, il localStorage è solo fallback.
    if (origin === 'favorites' || origin === 'channels') {
        showingFavorites = (origin === 'favorites');
    } else {
        const lastUrl = localStorage.getItem('zappone_last_played');
        const lastFromFavorites = localStorage.getItem('zappone_last_played_from_favorites') === 'true';
        if (lastUrl) {
          const exists = lastFromFavorites
            ? (window.favoriteUrlMap && favoriteUrlMap.has(lastUrl))
            : (window.channelUrlMap && channelUrlMap.has(lastUrl));
          if (exists) showingFavorites = lastFromFavorites;
        }
    }
    if (typeof updateToggleState === 'function') updateToggleState();

    const channelList = document.getElementById('channelList');
    const currentViewMode = showingFavorites ? 'favorites' : 'all';
    const lastRenderedMode = channelList?.getAttribute('data-view-mode');

    if (channelList && channelList.children.length > 0 && lastRenderedMode === currentViewMode) {
        console.log("Back: Lista già presente, eseguo solo scorrimento fluido.");

        window.isPlaylistView = false;
        window.isEPGView = false;

        scrollToCurrentChannelWhenReady(channelList, 5, 40);
        return;
    }

    try {
        window.isPlaylistView = false;
        window.isEPGView = false;

        requestAnimationFrame(() => {
            renderGroupedChannelList(
                showingFavorites ? groupedFavoriteChannels : groupedChannels,
                { context: 'channels' }
            );
            scrollToCurrentChannelWhenReady(channelList);
        });
    } catch (err) {
        console.error('Errore durante il ritorno alla lista:', err);
        showingFavorites = false;
        if (typeof updateToggleState === 'function') updateToggleState();
        renderGroupedChannelList(groupedChannels, { context: 'channels' });
        scrollToCurrentChannelWhenReady(channelList);
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

// Clic sul logo del canale nel player -> attiva/disattiva EPG.
// Funziona con o senza sidebar: agisce direttamente su localStorage
// e chiama ZappOneCore.applyEpgVisibility. Il checkbox della sidebar,
// se presente, viene solo riallineato (nessun dispatch di 'change',
// che causerebbe un secondo apply).
const logoBtn = document.getElementById('currentChannelLogo');
if (logoBtn) {
  logoBtn.style.cursor = 'pointer';
  logoBtn.addEventListener('click', () => {
    const newState = localStorage.getItem('zappone_show_epg') !== 'true';
    localStorage.setItem('zappone_show_epg', newState ? 'true' : 'false');
    const epgToggle = document.getElementById('toggleEPG');
    if (epgToggle) epgToggle.checked = newState;
    ZappOneCore.applyEpgVisibility({ forceExpand: newState });
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

// Clic sul nome del gruppo nel player -> attiva/disattiva metadati.
// Funziona con o senza sidebar (vedi nota sul logo sopra).
const groupLabel = document.getElementById('currentChannelGroup');
if (groupLabel) {
  groupLabel.style.cursor = 'pointer';
  groupLabel.title = "Mostra/Nascondi dettagli";
  groupLabel.addEventListener('click', () => {
    const newState = localStorage.getItem('zappone_show_metadata') !== 'true';
    localStorage.setItem('zappone_show_metadata', newState ? 'true' : 'false');
    const metaToggle = document.getElementById('toggleMetadata');
    if (metaToggle) metaToggle.checked = newState;
    ZappOneCore.applyMetadataVisibility({ forceExpand: newState });
  });
}

// --- Duplica canale corrente ---
document.getElementById('addChannelBtn').addEventListener('click', async function() {
  if (!window.currentChannelUrl) return;

  const targetList = showingFavorites ? favoriteChannels : channels;
  const currentChannel = targetList.find(ch => getChannelKey(ch) === window.currentChannelUrl);
  if (!currentChannel) return;

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

    const m3uContent = generateM3UFromChannels(channels);


    (async () => {


      try {
        const active = await getActivePlaylistMeta();
        if (active) {
          await updateM3URecord(active.id, { content: m3uContent, lastFetched: Date.now() });
        } else {
          const id = await saveM3UUrl('local', 'Local playlist');
          await updateM3URecord(id, { content: m3uContent, lastFetched: Date.now(), isActive: true });
          await setOnlyActive(id);
        }
      } catch (error) {
        dbReportError(error, 'salvataggio playlist');

      }
    })();

    renderGroupedChannelList(groupedChannels, { context: 'channels' });
  }

showNotification('Canale duplicato con successo!');
beginPlaybackSession(
    showingFavorites ? 'favorites' : 'channels',
    showingFavorites ? 'favorites' : 'channels',
    { channel: newChannel, fromFavorites: showingFavorites }
);
playStream(newChannel, showingFavorites);
});


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

        if (!isValidM3UText(text)) throw new Error('Playlist non valida o non raggiungibile');

        const rec = await saveAndActivateM3U({
            url: playlistUrl,
            name,
            content: text
        });

        await parseM3U(rec.content, true);

        showingFavorites = false;
        window.isPlaylistView = false;

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
    const lastOrigin = localStorage.getItem('zappone_last_played_origin');

    if (!lastUrl) {
      if (typeof showNotification === 'function') showNotification('Nessun canale riprodotto ancora', true);
      return;
    }

    try {
      showingFavorites = lastWasFavorite;
      if (typeof updateToggleState === 'function') updateToggleState();

      let found = getChannelByUrl(lastUrl, showingFavorites);
      if (!found) {
        found = getChannelByUrl(lastUrl, !showingFavorites);
        if (found) {
          showingFavorites = !showingFavorites;
          if (typeof updateToggleState === 'function') updateToggleState();
        }
      }

      // [REFRACTOR] Se l'ultimo stream era nato dall'EPG, ricostruisci la
      // sessione EPG (origin + navList 'feg' + context) via PlaybackStore.
      // Nessuna scrittura manuale di window.*: beginPlaybackSession fa
      // tutto, e la subscription si occupa di riallineare le viste.
      const wasFromEpg = (lastOrigin === 'fullEpgGrid' || lastOrigin === 'fullEpgList');

      if (wasFromEpg && found) {
        const epgRefRaw = localStorage.getItem('zappone_last_played_epg_ref');
        let epgChannel = null;

        if (epgRefRaw && typeof epgDisplayList !== 'undefined' && Array.isArray(epgDisplayList)) {
          const sep = epgRefRaw.indexOf(':');
          const kind = epgRefRaw.substring(0, sep);
          const value = epgRefRaw.substring(sep + 1);
          if (kind === 'id') {
            epgChannel = epgDisplayList.find(c => c.id === value) || null;
          } else if (kind === 'name') {
            epgChannel = epgDisplayList.find(c => c.name === value) || null;
          }
        }

        if (epgChannel) {
          beginPlaybackSession(
            lastOrigin,                        // 'fullEpgGrid' | 'fullEpgList'
            'feg',
            {
              channel: found,
              epgChannel: epgChannel,
              fromFavorites: showingFavorites,
            }
          );
          playStream(found, showingFavorites);
          return;
        }
        // Fallback: il riferimento EPG non è più risolvibile → trattalo
        // come un play da playlist normale.
      }

if (found) {
    beginPlaybackSession(
        showingFavorites ? 'favorites' : 'channels',
        showingFavorites ? 'favorites' : 'channels',
        { channel: found, fromFavorites: showingFavorites }
    );
    playStream(found, showingFavorites);
    return;
}


      const temp = { url: lastUrl, name: 'Ultimo canale' };
      const isAudio = await isAudioStream(temp).catch(() => false);
      toggleUIElementsForStreamType(isAudio);

      beginPlaybackSession('channels', 'channels');

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

const SPLASH_MIN_MS  = 100;
const SPLASH_FADE_MS = 50;

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
 * Inizializza l'app: apre il DB, carica preferiti e lista URL in parallelo,
 * applica le preferenze di vista, disegna la vista playlist come landing,
 * e in background carica la playlist attiva e l'EPG attivo.
 */
async function initializeApp() {
    try {
        await Promise.all([
            getDB(),
            loadFavorites()
        ]);
        // La lista URL in sidebar è opzionale: se sidebar.js non è caricato,
        // window.ZappOneSidebar non esiste e la chiamata è un no-op.
        window.ZappOneSidebar?.loadM3UUrlList?.();

        const preferences = loadViewModePreference();
        currentViewMode = preferences.mode;
        showingFavorites = (favoriteChannels.length > 0) ? preferences.showFav : false;

        await renderPlaylistList();

        setTimeout(async () => {
            try {
                const [activeRec, activeEPG] = await Promise.all([
                    getActivePlaylist(),
                    getActiveEPG()
                ]);

                if (activeRec?.content) {
                    await parseM3U(activeRec.content, true, false);
                } else {
                    channels.length = 0;
                    groupedChannels.length = 0;
                }

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

    } catch (error) {
        console.error('Initialization error:', error);
        await renderPlaylistList();
    }
}


// ============================================================================
// 62. REGISTRAZIONE SERVICE WORKER
// ============================================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('[SW] Registered successfully:', reg))
            .catch(err => console.error('[SW] Registration failed:', err));
    });
}


// ============================================================================
// 64. BLOCCO ZOOM SU iOS
// ============================================================================

document.addEventListener('gesturestart', (e) => e.preventDefault());


// ============================================================================
// ZappOneCore — API PUBBLICA verso sidebar.js
// ============================================================================
// Contratto stabile: sidebar.js non legge MAI variabili di zappone.js
// direttamente. Tutto passa da qui. Questo oggetto è usato anche dal
// bootstrap di zappone.js stesso (applyTheme, applyFontSize, ecc.),
// quindi è sempre attivo, anche se sidebar.js non è caricato.
//
// Va definito PRIMA del bootstrap DOMContentLoaded (che lo usa).
// ============================================================================

function applyTheme(isDark) {
  document.documentElement.classList.add('disable-transitions');
  if (isDark) document.documentElement.classList.add('dark-theme');
  else        document.documentElement.classList.remove('dark-theme');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('disable-transitions');
  });
}

function applyFontSize(percent) {
  const p = Math.max(80, Math.min(120, Math.round(Number(percent) / 5) * 5 || 100));
  document.documentElement.style.fontSize = p + '%';
  localStorage.setItem('zappone_font_size', p);
}

function applyMetadataVisibility(opts) {
  const forceExpand = !!(opts && opts.forceExpand);
  metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';
  const enabled = localStorage.getItem('zappone_show_metadata') === 'true';
  const header    = document.getElementById('metadataHeader');
  const container = document.getElementById('metadataContainer');
  const content   = document.getElementById('metadataContent');
  if (!header || !container) return;

  if (enabled) {
    header.style.display = 'flex';

    // Se l'utente ha appena attivato il toggle, forza l'espansione e
    // popola il pannello: è ciò che faceva il vecchio handler onchange.
    if (forceExpand) {
      metadataExpanded = true;
      localStorage.setItem('metadataExpanded', 'true');
    }

    if (metadataExpanded) {
      container.classList.add('expanded');
      container.style.display = 'block';

      if (forceExpand) {
        const active = (typeof getActiveChannel === 'function') ? getActiveChannel() : null;
        if (active && typeof showChannelMetadata === 'function') {
          showChannelMetadata(active);
        }
      }
    } else {
      container.classList.remove('expanded');
      container.style.display = 'none';
    }
  } else {
    header.style.display = 'none';
    container.classList.remove('expanded');
    container.style.display = 'none';
    localStorage.setItem('metadataExpanded', 'false');
    metadataExpanded = false;
    if (content) content.innerHTML = '';
  }
}

function applyEpgVisibility(opts) {
  const forceExpand = !!(opts && opts.forceExpand);
  const enabled = localStorage.getItem('zappone_show_epg') === 'true';
  const epgHeader    = document.getElementById('epgHeader');
  const epgContainer = document.getElementById('epgContainer');
  const epgContent   = document.getElementById('epgContent');
  const arrow        = document.querySelector('#epgHeader .metadata-arrow');
  if (!epgHeader || !epgContainer) return;

  if (enabled) {
    epgHeader.style.display    = 'flex';
    epgContainer.style.display = 'block';

    let collapsed = localStorage.getItem('epgCollapsed') === 'true';

    // Se l'utente ha appena attivato il toggle, forza l'espansione.
    if (forceExpand) {
      collapsed = false;
      localStorage.setItem('epgCollapsed', 'false');
    }

    if (epgContent) epgContent.style.display = collapsed ? 'none' : 'block';
    if (arrow) arrow.classList.toggle('collapsed', collapsed);

    // Se l'utente ha appena attivato il toggle, popola la guida del
    // canale attivo (o mostra il messaggio "nessun canale selezionato").
    if (forceExpand) {
      const active = (typeof getActiveChannel === 'function') ? getActiveChannel() : null;
      if (active && typeof showChannelEPG === 'function') {
        showChannelEPG(active);
      } else if (epgContent) {
        epgContent.innerHTML = `<div class="epg-message"><p>Nessun canale selezionato</p></div>`;
      }
    }
  } else {
    epgHeader.style.display    = 'none';
    epgContainer.style.display = 'none';
    if (epgContent) epgContent.innerHTML = '';
  }
}
function restartStreamForRadioMode(isRadio) {
  const video = document.getElementById('player');
  const audio = document.getElementById('audioPlayer');
  const isPlaying = (video && !video.paused) || (audio && !audio.paused);

  if (!window.currentChannelUrl || !isPlaying) {
    showNotification(isRadio ? 'Modalità radio attivata' : 'Modalità video attivata', false);
    return;
  }
  let ch = channels.find(c => getChannelKey(c) === window.currentChannelUrl);
  if (!ch && showingFavorites) {
    ch = favoriteChannels.find(c => getChannelKey(c) === window.currentChannelUrl);
  }
  if (ch && typeof playStream === 'function') {
    playStream(ch, showingFavorites);
  }
}

function resetRuntimeState(opts) {
  const keepFavorites = !!(opts && opts.keepFavorites);
  channels = [];
  groupedChannels = [];
  if (!keepFavorites) {
    favoriteChannels = [];
    groupedFavoriteChannels = [];
    if (typeof favoriteKeys !== 'undefined' && favoriteKeys.clear) favoriteKeys.clear();
  }
  epgData = [];
  if (typeof rebuildEpgMap === 'function') rebuildEpgMap();
  showingFavorites = false;
  currentViewMode = 'list';
// Svuota per riferimento, non riassegnando: groupCollapseState e
// favoriteGroupCollapseState sono alias const di collapseStates.*,
// quindi non possono essere riassegnati.
['channels', 'favorites', 'playlists', 'epg'].forEach(ctx => {
    Object.keys(collapseStates[ctx]).forEach(k => delete collapseStates[ctx][k]);
});


try {
    localStorage.removeItem('zappone_group_collapse');
    localStorage.removeItem('zappone_fav_group_collapse');
    localStorage.removeItem('zappone_playlist_collapse');
    localStorage.removeItem('zappone_epg_collapse');
    localStorage.removeItem('zappone_last_played_origin');
    localStorage.removeItem('zappone_last_played_epg_ref');
} catch (_) {}


  streamTypeCache = {};

  window.currentChannelUrl = null;
  window.isPlaylistView = false;
  window.isEPGView = false;
  if (typeof clearPlaybackSession === 'function') clearPlaybackSession();
  // [REFRACTOR] Azzera anche lo store: previene che un reset parziale
  // lasci un epgRef orfano puntato da viste non ancora smontate.
  if (window.PlaybackStore) window.PlaybackStore.clear();

  if (window.hlsInstance) {
    try { window.hlsInstance.destroy(); } catch (e) {}
    window.hlsInstance = null;
  }
  rebuildIndexMaps();
  if (typeof updateToggleState === 'function') updateToggleState();

  const viewModePill = document.getElementById('viewModePill');
  if (viewModePill) {
    viewModePill.classList.remove('grid-mode', 'collapse-mode', 'is-collapsed', 'is-expanded');
    viewModePill.classList.add('list-mode');
  }
  if (typeof detachEqualizerAndRestoreNative === 'function') {
    detachEqualizerAndRestoreNative();
  }
}

window.ZappOneCore = {
  // Notifiche e UI
  showNotification,
  updateButtons,
  updateToggleState,

  // Playlist / EPG
  renderPlaylistList,
  renderEPGManager,
  refreshPlaylistUIs,
  loadRemoteM3U,
  getDefaultPlaylistUrl: () =>
    (typeof appConfig !== 'undefined' && appConfig && appConfig.playlistUrl) || null,

  // Preferenze applicate al DOM
  applyTheme,
  applyFontSize,
  applyMetadataVisibility,
  applyEpgVisibility,
  restartStreamForRadioMode,

  // Reset runtime
  resetRuntimeState,

  // Stato corrente (read-only, per consumo opzionale)
  get channels()          { return channels; },
  get favoriteChannels()  { return favoriteChannels; },
  get epgData()           { return epgData; },
  get showingFavorites()  { return showingFavorites; },

  version: '8.1-core',
};

console.log('[core] window.ZappOneCore pronto.');


// ============================================================================
// 65. AVVIO APPLICAZIONE
// ============================================================================
//
// Bootstrap completo dell'app, eseguito al DOMContentLoaded:
//   1. setupEventListeners()          aggancia i listener UI del core;
//   2. getConfigFromServer()          chiama il server per config/licenza;
//   3. initDemoWatermark()            mostra la filigrana DEMO se serve;
//   4. ZappOneCore.apply*             applica le preferenze al DOM
//                                     (tema, font, pannelli metadati/EPG);
//   5. ZappOneSidebar._onConfigReady  inizializza la sidebar SE caricata;
//   6. initializeApp()                apre DB, carica dati, disegna UI;
//   7. hideSplashScreen()             rimuove lo splash;
//   8. feedback finale (Premium/Demo).
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {

    setupEventListeners();

    await getConfigFromServer();

    if (typeof initDemoWatermark === 'function') {
      initDemoWatermark();
    }

    // Applica le preferenze al DOM. Funziona con o senza sidebar:
    // se sidebar.js non è caricato, la sidebar non esiste ma i pannelli
    // (metadati, EPG), il tema e la dimensione testo restano coerenti.
    ZappOneCore.applyTheme(localStorage.getItem('theme') !== 'light');
    ZappOneCore.applyFontSize(localStorage.getItem('zappone_font_size') || 100);
    ZappOneCore.applyMetadataVisibility();
    ZappOneCore.applyEpgVisibility();

    // Inizializza la sidebar se il modulo è caricato (no-op altrimenti).
    window.ZappOneSidebar?._onConfigReady?.();

    await initializeApp();

    hideSplashScreen();

    // Avvisi sulla licenza in coda (chiave non valida, troppi dispositivi,
    // uso della copia offline): durante lo splash i toast non si vedrebbero.
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
