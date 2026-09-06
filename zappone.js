


// ================================
// Variabili globali 
// ================================

// --- Stato dei canali ---
let channels = [];                     // Tutti i canali caricati
let groupedChannels = [];              // Canali raggruppati per categoria

// --- Preferiti ---
let favoriteChannels = [];             // Canali preferiti
let groupedFavoriteChannels = [];      // Preferiti raggruppati
let showingFavorites = false;          // Flag per mostrare solo preferiti

// Indici per la riproduzione
let currentChannelIndex = -1;          // Canale attualmente in riproduzione
let currentFavoriteIndex = -1;         // Preferito attualmente in riproduzione

// Stato espansione gruppi
let groupCollapseState = {};
let favoriteGroupCollapseState = {};

// --- Drag & Drop (canali e gruppi) ---
let draggedItem = null;
let draggedItemOriginalGroup = null;
let draggedItemOriginalUrl = null;
let draggedItemIsFavorite = false;
let draggedGroupIndex = null;
let draggedGroupIsFavorite = false;

// --- Visualizzazione e gesture ---
let currentViewMode = 'list';          // Modalità: list o grid
let touchStartX = 0;                   // Swipe touch start
let touchEndX   = 0;                   // Swipe touch end
let mouseDownX  = 0;                   // Swipe mouse start
let mouseUpX    = 0;                   // Swipe mouse end

// --- Cache interne ---
let streamTypeCache = {};              // Cache tipo stream
let urlContentTypeCache = {};          // Cache dei content-type
let dragDropInitialized = false;
let metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';

// --- EPG (guida programmi) e URL ---
// Stato e funzioni EPG spostati in epg.js (vedi quel file per: normalizeChannelName, parseXMLTVDate, isProgramCurrentlyAiring, getProgramProgress, formatTime, downloadEPG, parseXMLTV, handleEPGLoading, autoLoadEPG, rebuildEpgMap, hasEPG, getCurrentProgramInfo, getCurrentProgramFull, findChannelFromEPG, renderEPGManager, renderFullEPGList, showChannelEPG, openChannelEpgDrawer, toggleEPG, closeFullEPG, openEPGBottomSheet, closeEPGBottomSheet).

// CHIAVI DA ELIMINARE DURANTE IL RESET
const KEYS_TO_RESET = [
    // Impostazioni UI
    "metadataExpanded",
    "zappone_auto_fullscreen",
    "zappone_show_epg",
    "zappone_show_favorites",
    "zappone_show_metadata",
    "zappone_show_playlist_url",
    "zappone_view_mode",

  // "zappone_license",
    // Aggiungi qui altre chiavi di playlist/EPG se necessario
];

// --- Riproduzione HLS ---
window.currentChannelUrl = null;
window.hlsInstance = null;

// --- Database / storage ---
const favoriteKeys = new Set();

// --- Flag per schermate principali ---
window.isEPGView = false;
window.isPlaylistView = false;

// --- Mappe per ricerca veloce ---
let channelIndexMap = new Map();       // getChannelKey -> index
let favoriteIndexMap = new Map();      // getChannelKey -> index
let channelUrlMap = new Map();         // url -> channel
let favoriteUrlMap = new Map();        // url -> channel preferito

// --- Modalità eliminazione ---
let deletionMode = false;              // Mostra cestini nelle tile
let _pillLongPressTimer = null;
const PILL_LONGPRESS_MS = 600;

// --- Stato di collasso gruppi (caricamento da localStorage) ---
groupCollapseState = JSON.parse(
  localStorage.getItem('zappone_group_collapse') || '{}'
);

favoriteGroupCollapseState = JSON.parse(
  localStorage.getItem('zappone_fav_group_collapse') || '{}'
);


// ================================
// DICHIARAZIONI PER IL MODULO PARSER
// (le funzioni sono definite in m3u-parser.js)
// ================================

// Dichiarazioni globali per evitare errori di riferimento
// getChannelKey, groupChannels, generateM3UFromChannels,
// countChannelsAndGroups, parseM3UInWorker, parseM3U,
// getFilteredGroupedChannels sono definite in m3u-parser.js

// VARIABILI GLOBALE PER L'OSSERVER (Migliora drasticamente la memoria)
let sharedChannelObserver = null;

const metadataContainer = document.getElementById('metadataContainer');
const metadataHeader = document.getElementById('metadataHeader');

// Fine Blocco Variabili globali dell'applicazione


// Inizio Blocco Licenza

// blocco trasferto su license.js

// Fine Blocco Licenza


// ================================
// Funzioni di supporto
// ================================

// Salvataggio stato espansione gruppi
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

// Utility per ricostruire le map (chiamare ogni volta che channels o favoriteChannels cambiano)
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

// blocco utilità deletion mode

function enterDeletionMode() {
  if (deletionMode) return;
  deletionMode = true;
  const pill = document.getElementById('favoritesPill');
  if (pill) pill.classList.add('delete-mode');

  // Mostra i delete-button in TUTTI i container visibili
  const containers = [
    '#channelList',
    '#playlistList', 
    '#epgList'
  ];
  
  containers.forEach(selector => {
    const container = document.querySelector(selector);
    if (container && container.querySelectorAll) {
      container.querySelectorAll('.channel-item.list .delete-channel').forEach(btn => {
        btn.classList.add('visible');
      });
    }
  });
}

function exitDeletionMode() {
  if (!deletionMode) return;
  deletionMode = false;
  const pill = document.getElementById('favoritesPill');
  if (pill) pill.classList.remove('delete-mode');

  // Nascondi i delete-button in TUTTI i container
  document.querySelectorAll('.delete-channel').forEach(btn => {
    btn.classList.remove('visible');
  });

}

function toggleDeletionMode() {
  if (deletionMode) {
    exitDeletionMode();
  } else {
    enterDeletionMode();
  }
  
  // Aggiungi: forza un re-render delle viste aperte per aggiornare i cestini
  if (window.isPlaylistView && typeof renderPlaylistList === 'function') {
    renderPlaylistList();
  } else if (window.isEPGView && typeof renderEPGManager === 'function') {
    renderEPGManager();
  }
}


// ================================
// Funzioni principali
// ================================

// FUNZIONE: Scarica e attiva subito una playlist M3U
async function loadRemoteM3U(url, closeAfter = false) {
 //  Chiudi il bottom sheet se richiesto
    if (closeAfter && typeof closeBottomSheet === 'function') {
      closeBottomSheet();
    }  

try {
    const text = await fetchM3UWithProxies(url);

    // FIX: se il download fallisce, fetchM3UWithProxies restituisce null.
    // Senza questo controllo, un fetch fallito veniva comunque salvato e attivato
    // come playlist corrente (content: null), corrompendo permanentemente lo stato
    // in IndexedDB anche dopo un semplice problema di rete/licenza transitorio.
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('Download playlist fallito: contenuto vuoto o non valido (licenza non valida, rete assente o URL errato).');
    }

    // Salva/aggiorna in IndexedDB e imposta come attiva
    await saveAndActivateM3U({
      url,
      name: url.split('/').pop(),
      content: text
    });

    // Parsing e update UI
    await parseM3U(text, true);
    updateButtons();

    //  CORREZIONE: Esci SEMPRE dalla vista playlist e mostra i canali
    window.isPlaylistView = false;
    if (typeof showChannelList === 'function') {
      showChannelList();
    }

    //  Aggiorna le UI delle playlist
    refreshPlaylistUIs();

    showNotification("Playlist predefinita caricata con successo");

  } catch (err) {
   
    //  Chiudi il bottom sheet anche in caso di errore, se richiesto
    if (closeAfter && typeof closeBottomSheet === 'function') {
      closeBottomSheet();
    }
 console.error("Tutti i proxy hanno fallito:", err);
    showNotification("Errore nel caricamento playlist: impossibile scaricare la lista", true);
  }
}

// FUNZIONE: Genera un nome di file per l'esportazione (robusta)
async function getSuggestedExportFilename() {

  // prendi la playlist attiva da IndexedDB (se esiste)
  const rec = await getActivePlaylist();

  let baseName = 'zappone';
  if (rec) {
    baseName = rec.filename || rec.name || (rec.url ? rec.url.split('/').pop() : 'zappone');
  }

  // pulizia del nome
  baseName = baseName.replace(/_Tutti/gi, '');
  baseName = baseName.replace(/_Preferiti/gi, '');
  baseName = baseName.replace(/\s*\(\d+\)/g, '');
  baseName = baseName.replace(/\.(m3u8?|txt)?$/i, '');

  const suffix = showingFavorites ? '_Preferiti' : '_Tutti';
  return `${baseName}${suffix}.m3u`;
}


// FUNZIONE: Salva il nuovo nome del canale
async function saveChannelName() {
  const newName = this.textContent.trim();
  if (!newName) return;

  await saveMetadataChanges(newName);
}


// FUNZIONE: Configura il comportamento degli input di ricerca
   function setupInputBehavior(inputId) {
      const input = document.getElementById(inputId);
      const clearBtn = input.nextElementSibling;
      
      // Mostra/nascondi il pulsante di cancellazione in base al contenuto
      input.addEventListener('input', () => {
        clearBtn.style.display = input.value ? 'block' : 'none';
      });

      // Gestisce il click sul pulsante di cancellazione
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        input.value = '';
        input.dispatchEvent(new Event('input'));
        clearBtn.style.display = 'none';
        input.focus();
      });
    }


// FUNZIONE: seleziona i canali preferiti tramite la stella
async function toggleFavorite(channel, starElement) {
    const key = getChannelKey(channel);
    const wasFavorite = isFavorite(channel);

    if (wasFavorite) {
        // Rimuovi dai preferiti
        const favIndex = favoriteChannels.findIndex(fav => getChannelKey(fav) === key);
        if (favIndex !== -1) {
            favoriteChannels.splice(favIndex, 1);
            groupedFavoriteChannels = groupChannels(favoriteChannels);
        }
        // Aggiorna IDB
        await idbDeleteFavorite(key);
        favoriteKeys.delete(key); // Rimuovi dalla Set

        starElement.classList.add('inactive');
        starElement.title = 'Aggiungi ai preferiti';
    } else {

        // Controlla se il canale è già nei preferiti (doppio clic)
        if (!isFavorite(channel)) {
            // Aggiungi ai preferiti (crea una copia indipendente)
            const favChannel = { ...channel };
            favoriteChannels.push(favChannel);
            groupedFavoriteChannels = groupChannels(favoriteChannels);

            // Aggiorna IDB (mantieni ordine attuale in coda)
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
            favoriteKeys.add(key); // Aggiungi alla Set

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

// FUNZIONE: Verifica se un canale è tra i preferiti
function isFavorite(channel) {
    const key = typeof channel === 'string' ? 
        channels.find(c => c.url === channel)?.key : 
        getChannelKey(channel);
    return favoriteChannels.some(fav => getChannelKey(fav) === key);
}


// FUNZIONE: Carica i preferiti all'inizializzazione
async function loadFavorites() {
  const rows = await idbGetAllFavorites();

  // Ordina per 'order' se presente
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


// FUNZIONE HELPER per rimuovere stella preferiti 
function addFavoriteStar(channel, item, options = {}) {
  // context: 'channels' (default) | 'playlists' | 'epg'
  const context = options && options.context
    ? options.context
    : ((!window.isEPGView && !window.isPlaylistView) ? 'channels' : (window.isEPGView ? 'epg' : 'playlists'));

  // mostra la stella solo nella vista "channels" (include la vista Preferiti)
  if (context !== 'channels') return;

  // evita duplicati (se la funzione viene chiamata più volte)
  if (item.querySelector && item.querySelector('.favorite-star')) return;

  const star = document.createElement('span');
  star.className = `favorite-star ${isFavorite(channel) ? '' : 'inactive'}`;
  star.innerHTML = '★';
  star.title = isFavorite(channel) ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti';
  star.onclick = (e) => {
    e.stopPropagation();
    toggleFavorite(channel, star);
  };
  item.appendChild(star);
}


// FUNZIONE HELPER per caricamenti lazy 
function getSharedObserver() {
    if (!sharedChannelObserver) {
        sharedChannelObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const target = entry.target;
                    // Load img
                    if (target.tagName === 'IMG' && target.dataset.src) {
                        target.src = target.dataset.src;
                        target.removeAttribute('data-src');
                        obs.unobserve(target);
                    }
                    // Load background image for grid tile
                    else if (target.dataset && target.dataset.bgSrc) {
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


// FUNZIONE: renderPlaylistList completa e ottimizzata
async function renderPlaylistList() {
    // 1. STATI INIZIALI E VISIBILITÀ
    showingFavorites = false;
    if (typeof updateToggleState === 'function') updateToggleState();
    if (typeof saveViewModePreference === 'function') saveViewModePreference(currentViewMode);
    
    window.isPlaylistView = true;
    window.isEPGView = false;

    const playlistListCont = document.getElementById('playlistListContainer');
    const playlistList = document.getElementById('playlistList');
    const channelListCont = document.getElementById('channelListContainer');
    const epgListCont = document.getElementById('epgListContainer');

    // Gestione visibilità container
    if (channelListCont) channelListCont.classList.add('hidden');
    if (epgListCont) epgListCont.classList.add('hidden');
    if (playlistListCont) playlistListCont.classList.remove('hidden');

    // Reset della visibilità (con transizione)
    if (playlistList) {
        playlistList.style.transition = 'opacity 0.2s ease-in-out';
        playlistList.style.opacity = '0';
        playlistList.style.pointerEvents = 'none';
    }

    // 2. RECUPERA DATI DAL DATABASE
    const playlists = await getAllM3UUrls();
    const activePlaylist = await getActivePlaylist();

    // --- OTTIMIZZAZIONE: SE GIÀ RENDERIZZATO, AGGIORNA SOLO EVIDENZIAZIONE ---
    // Se la lista ha già figli e non è stato richiesto un ricaricamento forzato
    if (playlistList && playlistList.children.length > 0 && !window.forcePlaylistReload) {
        console.log("Vista playlist già presente, aggiorno solo l'evidenziazione.");
        
        //  RENDI SUBITO VISIBILE (è già renderizzata)
        playlistList.style.opacity = '1';
        playlistList.style.pointerEvents = 'auto';
        
        playlistList.querySelectorAll('.channel-item').forEach(item => {
            const plId = item.getAttribute('data-playlist-id');
            item.classList.remove('active-channel');
            // Se l'ID coincide con quello della playlist attiva nel DB, evidenzia
            if (activePlaylist && plId === String(activePlaylist.id)) {
                item.classList.add('active-channel');
            }
        });
        
        // Reset del flag per i caricamenti futuri
        window.forcePlaylistReload = false;
        return; // ESCI: Evita di ricostruire tutto il DOM
    }
    
    // Reset del flag per i caricamenti futuri
    window.forcePlaylistReload = false;
    // -----------------------------------------------------------------------

    // 3. PREPARAZIONE GRUPPI (Rendering completo)
    const localGroup = {
        name: "Caricamento",
        channels: [
            {
                name: "Aggiungi Playlist",
                logo: "add-playlist.svg",
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

    // 4. RENDERING FISICO NEL CONTAINER
    renderGroupedChannelList(groups, { 
        targetContainer: 'playlistList',
        context: 'playlists' 
    });

    // 5. POST-PROCESSING (Listener e Logica Click)
    setTimeout(() => {
        const list = document.getElementById('playlistList');
        if (!list) return;
        
        list.querySelectorAll('.channel-item').forEach(item => {
            const url = item.getAttribute('data-url');
            const def = groups
                .flatMap(g => g.channels)
                .find(c => c.url === url || (c.__special && (url === '#local' || url === '#url')));
            
            if (!def) return;

            // Aggiungiamo l'ID per l'ottimizzazione del punto 2
            if (def.__playlistId) {
                item.setAttribute('data-playlist-id', def.__playlistId);
            }

            // Applica classe attiva iniziale
            item.classList.remove('active-channel');
            if (def.__isActive) item.classList.add('active-channel');

            // Pulizia attributi non necessari per le playlist
            item.removeAttribute('draggable');
            item.removeAttribute('data-key');
            item.removeAttribute('data-group-index');

            // --- GESTORE CLICK PLAYLIST SPECIALI (#URL) ---
            if (def.__special && url === "#url") {
                item.onclick = () => {
                    if (typeof openBottomSheet === 'function') openBottomSheet();
                };
            } 
            // --- GESTORE CLICK PLAYLIST SALVATE ---
            else if (def.__playlistId) {
                item.onclick = async () => {
                    try {
                        // A. Se è la playlist già attiva, cambia solo vista senza ricaricare
                        const currentActive = await getActivePlaylist();
                        if (currentActive && currentActive.id === def.__playlistId) {
                            window.isPlaylistView = false;
                            if (typeof showChannelList === 'function') await showChannelList();
                            return;
                        }

                        // B. Se è una playlist DIVERSA, svuota e ricarica
                        const channelList = document.getElementById('channelList');
                        if (channelList) channelList.innerHTML = ""; // Forza rigenerazione canali

                        window.suppressPlaylistRefresh = true;
                        const rec = await getM3UById(def.__playlistId);
                        let text = rec?.content;
                        
                        if (!text && rec?.url) {
                            if (typeof showNotification === 'function') showNotification("Scaricamento canali...");
                            text = await downloadM3U(rec.url);
                            await updateM3URecord(rec.id, { content: text, lastFetched: Date.now() });
                        }

                        if (!text) throw new Error("Playlist non disponibile");

                        await setOnlyActive(rec.id);
                        await parseM3U(text, false);
                        
                        if (typeof updateButtons === 'function') updateButtons();
                        window.isPlaylistView = false;
                        
                        // Mostra i canali (essendo vuoto, showChannelList farà il render)
                        if (typeof showChannelList === 'function') await showChannelList();
                        
                    } catch (err) {
                        console.error('Errore click playlist:', err);
                    } finally {
                        window.suppressPlaylistRefresh = false;
                        if (typeof refreshPlaylistUIs === 'function') refreshPlaylistUIs();
                    }
                };
            }

            // --- GESTORE ELIMINAZIONE PLAYLIST ---
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

            // --- INFO AGGIUNTIVE (Conteggi o URL) ---
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

// FUNZIONE: Renderizzazione della lista dei canali 
function renderGroupedChannelList(groups, options = {}) {
    
    const targetContainer = options.targetContainer || 'channelList';
    const targetElement = document.getElementById(targetContainer);
    
    if (!targetElement) {
        console.error(`Container ${targetContainer} non trovato`);
        return;
    }

    const context = options && options.context ? options.context : 'channels';
    targetElement.setAttribute('data-context', context);
    targetElement.setAttribute('data-view-mode', context === 'channels' ? (showingFavorites ? 'favorites' : 'all') : context);

    let currentGroups;
    if (context === 'channels') {
        currentGroups = showingFavorites ? groupedFavoriteChannels : groups;
    } else {
        currentGroups = groups || [];
    }
    
    // --- FIX MEMORY LEAK: scollega l'observer prima di svuotare il container ---
    if (sharedChannelObserver) {
        sharedChannelObserver.disconnect();
        sharedChannelObserver = null;
    }

    requestAnimationFrame(() => {
        const isGridView = currentViewMode === 'grid';
        const viewModeClass = 'view-' + currentViewMode;
        
        // Pulizia iniziale - INVISIBILE MA PRESENTE NEL DOM
        targetElement.style.opacity = '0';
        targetElement.style.pointerEvents = 'none';
        targetElement.innerHTML = '';
        targetElement.className = viewModeClass;

        // --- OTTIENI UN NUOVO OSSERVATORE (dopo lo svuotamento) ---
        const lazyObserver = getSharedObserver();

        // Gestione lista vuota
        if (!currentGroups || currentGroups.length === 0 || 
            (context === 'playlists' 
                ? (currentGroups.length === 2 && currentGroups[1].channels.length === 0)
                : context === 'epg'
                    ? (currentGroups.length >= 2 && currentGroups[1].channels.length === 0)
                    : (currentGroups.length === 1 && currentGroups[0].channels.length === 0)
            )
        ) {

    // Container flex per centrare l'immagine sia orizzontalmente che verticalmente
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems = 'center';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';  // occupa tutto lo spazio disponibile nel container
    wrapper.style.minHeight = '200px'; // evita che sia troppo piccolo su schermi piccoli

    const img = document.createElement('img');

    // Sorgente e classi
if (context === 'channels') {
    img.src = showingFavorites ? "nopref.svg" : "nochannel.svg";
    img.className = showingFavorites ? "no-favorites" : "no-channels";
    img.alt = 'Nessun canale disponibile';
} else if (context === 'playlists') {
    img.src = "noplaylist.svg";
    img.className = "no-playlists";
    img.alt = 'Carica una playlist';
} else if (context === 'epg') {
    // Qui gestiamo solo l'EPG standard (quella dei tab), NON il Full EPG
    img.src = "noepg.svg";
    img.className = "no-epg";
    img.alt = 'Carica EPG';
}

    // Dimensione naturale, scalabile verticalmente se lo schermo è piccolo
    img.style.height = 'auto';
    img.style.maxHeight = '50vh';
    img.style.cursor = 'pointer';

    // Click sull'immagine per aggiungere playlist
    if (context === 'playlists') {
        img.onclick = () => {
            const firstSpecial = currentGroups[0]?.channels[0];
            if (firstSpecial && firstSpecial.__special && firstSpecial.url === "#url") {
                if (typeof openBottomSheet === 'function') openBottomSheet();
            }
        };
    }

    // Click sull'immagine per aggiungere EPG
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
    return; // Mantiene comportamento originale senza renderizzare gruppi speciali
}

        // Helper interno per creare il singolo item (rimane invariato)
       const createChannelItem = (channel, groupIndex, isFavoriteList) => {
    const isGridView = currentViewMode === 'grid';
    const isChannelList = context === 'channels';

    // Grid mode + channel list → Apple TV style tile
    if (isChannelList && isGridView) {
        const item = document.createElement('div');
        item.className = `channel-item ${currentViewMode}`;
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

        // Get current program info for background and overlay
       const program = getCurrentProgramFull(channel);
    const hasPoster = program && program.poster;        // <-- controllo sul poster
    const backgroundUrl = hasPoster ? program.poster : (channel.logo || 'tasto-icon.png');

// Lazy load background image
 item.dataset.bgSrc = backgroundUrl;
     item.dataset.bgType = hasPoster ? 'poster' : 'logo'; // <-- corretto

// Ensure fallback background color while loading
        item.style.backgroundColor = 'var(--epg-poster-bg)';

        // Create overlay container
        const overlay = document.createElement('div');
        overlay.className = 'grid-overlay';

        // Channel name
        const channelNameSpan = document.createElement('div');
        channelNameSpan.className = 'grid-channel-name';
        channelNameSpan.textContent = channel.name || 'Senza nome';

        // Program title (if current program exists)
        const programSpan = document.createElement('div');
        programSpan.className = 'grid-program-title';
        programSpan.textContent = program ? program.title : '';

        overlay.appendChild(channelNameSpan);
        overlay.appendChild(programSpan);

        // Progress bar for current program
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

        // Observe background image lazy loading
        const lazyObserver = getSharedObserver();
        lazyObserver.observe(item);

if (window.currentChannelUrl && item.dataset.key === window.currentChannelUrl) {
    item.classList.add('active-channel');
}

        return item;
    }

    // ----- Original list mode (or other contexts like playlists) -----
    const item = document.createElement('div');
    item.className = `channel-item ${currentViewMode}`;
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

        // Primo DocumentFragment per raccogliere tutti i blocchi
        const masterFragment = document.createDocumentFragment();

        // Costruzione degli elementi in memoria (veloce perché non ancora nel DOM)
        currentGroups.forEach((group, groupIndex) => {
            if (!group.channels || group.channels.length === 0) return;

            let isCollapsed = false;
            if (context === 'channels') {
                isCollapsed = showingFavorites ? !!favoriteGroupCollapseState[group.name] : !!groupCollapseState[group.name];
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
            groupContent.className = `group-content ${currentViewMode}-view`;
            groupContent.style.display = isCollapsed ? 'none' : '';

            const groupFragment = document.createDocumentFragment();
            group.channels.forEach(ch => {
                groupFragment.appendChild(createChannelItem(ch, groupIndex, showingFavorites));
            });
            groupContent.appendChild(groupFragment);

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

            masterFragment.appendChild(groupHeader);
            masterFragment.appendChild(groupContent);
        });

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

            targetElement.appendChild(chunkFragment);

            // Mostra gradualmente dopo aver caricato un po' di contenuto
            if (currentPos > 10) {
                targetElement.style.opacity = '0.7';
                targetElement.style.pointerEvents = 'auto';
            }

            if (currentPos < allNodes.length) {
                requestAnimationFrame(renderChunk);
            } else {
                finalizeRendering();
            }
        }

        function finalizeRendering() {
            // Rendi completamente visibile e interattivo
            targetElement.style.opacity = '1';
            targetElement.style.pointerEvents = 'auto';


// Drag & drop: la funzione gestisce internamente il flag,
            // la chiamata multipla è sicura e non aggiunge listener doppi.
            if (context === 'channels') {
                setupDragAndDropDelegation();
            }


            if (context === 'channels') {
                // Usiamo queueMicrotask o un timeout 0 per non bloccare il thread principale
                setTimeout(() => {
                    try {
                        const usedGroups = showingFavorites ? groupedFavoriteChannels : (typeof currentGroups !== 'undefined' ? currentGroups : groupedChannels);
                        const flat = usedGroups.flatMap(g => g.channels || []);
                        
                        if (showingFavorites) favoriteChannels = flat;
                        else channels = flat;
                        
                        if (typeof rebuildIndexMaps === 'function') rebuildIndexMaps();
                        
                        // Opzionale: se hai una funzione per rinfrescare lo stato del Drag & Drop, chiamala qui
                        // if (typeof refreshDragAndDrop === 'function') refreshDragAndDrop();
                        
                    } catch (e) { console.warn("Sync failed", e); }
                }, 0);
            }
        }

        renderChunk();

    });
}

// Replacement: return the actual flat array (fast)
function getCurrentDisplayList() {
  return showingFavorites ? favoriteChannels : channels;
}


// FUNZIONE: Mostra lista canali (con cleanup centralizzato)
async function showChannelList() {
    window.isEPGView = false;
    window.isPlaylistView = false;

    cleanupPlayers({ keepVideoVisible: false });
    document.getElementById('metadataContainer').style.display = 'none';

    const channelListContainer = document.getElementById('channelListContainer');
    const channelList = document.getElementById('channelList');

    // Reset della visibilità (con transizione)
    if (channelList) {
        channelList.style.transition = 'opacity 0.2s ease-in-out';
        channelList.style.opacity = '0';
        channelList.style.pointerEvents = 'none';
    }

    // Mostra i container corretti
    document.getElementById('playerContainer').style.display = 'none';
    document.getElementById('playlistListContainer').classList.add('hidden');
    document.getElementById('epgListContainer').classList.add('hidden');
    channelListContainer.classList.remove('hidden');
    
document.querySelector('.main-header')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('bottomTabBar')?.classList.remove('hidden');

    // --- OTTIMIZZAZIONE INTELLIGENTE ---
    // Determiniamo cosa vogliamo vedere ora
    const currentViewMode = showingFavorites ? 'favorites' : 'all';
    // Controlliamo cosa è stato renderizzato l'ultima volta (lo leggiamo da un attributo custom nel DOM)
    const lastRenderedMode = channelList.getAttribute('data-view-mode');

    // Renderizziamo SOLO SE:
    // 1. La lista è vuota
    // 2. OPPURE la modalità è cambiata (es. eravamo su 'favorites' e ora siamo su 'all')
    if (!channelList || channelList.children.length === 0 || lastRenderedMode !== currentViewMode) {
        console.log(`Rendering necessario: Modalità precedente [${lastRenderedMode}] -> Nuova [${currentViewMode}]`);
        
        renderGroupedChannelList(
            showingFavorites ? groupedFavoriteChannels : groupedChannels, 
            { context: 'channels' }
        );

        // Memorizziamo nel DOM cosa abbiamo appena renderizzato
        channelList.setAttribute('data-view-mode', currentViewMode);
    } else {
        console.log("Switch istantaneo: la lista corretta è già presente nel DOM.");
        // RENDI SUBITO VISIBILE (è già renderizzata)
        channelList.style.opacity = '1';
        channelList.style.pointerEvents = 'auto';
    }

    // Gestione evidenziazione canale attivo
    document.querySelectorAll('.active-channel').forEach(el => el.classList.remove('active-channel'));
    if (window.currentChannelUrl) {
        let target = document.querySelector(`[data-key="${CSS.escape(window.currentChannelUrl)}"]`);
        if (target) {
            target.classList.add('active-channel');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}


// FUNZIONE: Elimina un canale (modificata per gestire entrambe le liste)
function deleteChannel(channel, isFavoriteList) {
    const key = getChannelKey(channel);
    
    if (isFavoriteList) {
        removeFromFavorites(key);
    } else {
        removeFromMainList(key);
    }
    
    updateUI();
    rebuildIndexMaps(); // aggiorna le mappe dopo ogni delete
}


// FUNZIONE: Elimina un canale (dai preferiti)
async function removeFromFavorites(key) {
  const favIndex = favoriteChannels.findIndex(c => getChannelKey(c) === key);
  if (favIndex === -1) return;

  // 1. elimina da IndexedDB
  await idbDeleteFavorite(key);

  // 2. aggiorna memoria
  favoriteChannels.splice(favIndex, 1);
  groupedFavoriteChannels = groupChannels(favoriteChannels);

  // 3. Aggiorna le mappe immediatamente
  rebuildIndexMaps();

// --- AGGIUNTA: Riallineamento Indice Corrente ---
  // Se il canale rimosso è precedente o uguale a quello che stiamo guardando, 
  // dobbiamo decrementare l'indice corrente per non perdere il segno.
  if (typeof currentFavoriteIndex !== 'undefined') {
      if (favIndex === currentFavoriteIndex) {
          // Se rimuovi il canale che stai guardando, resetta o vai al precedente
          currentFavoriteIndex = Math.max(0, currentFavoriteIndex - 1);
      } else if (favIndex < currentFavoriteIndex) {
          // Se rimuovi un canale che stava "sopra", scala quello corrente di uno
          currentFavoriteIndex--;
      }
  }

  // 4. se stai visualizzando i preferiti, rinfresca la UI
  if (showingFavorites) {
    renderGroupedChannelList(groupedFavoriteChannels, { context: 'channels' });
  }
}


// FUNZIONE: Elimina un canale (dai lista Tutti)
function removeFromMainList(key) {
    const channelIndex = channels.findIndex(c => getChannelKey(c) === key);
    if (channelIndex === -1) return;
    
    const removedChannel = channels[channelIndex];
    channels.splice(channelIndex, 1);
    groupedChannels = groupChannels(channels);
    
    //  Aggiorna le mappe immediatamente
    rebuildIndexMaps();
    
    const m3uContent = generateM3UFromChannels(channels);
    // Aggiorna IndexedDB in background (fire-and-forget)
    void (async () => {
      const active = await getActivePlaylist();
      if (active) {
        await updateM3URecord(active.id, { content: m3uContent, lastFetched: Date.now() });
      } else if (channels.length > 0) {
        const id = await saveM3UUrl('local', 'Local playlist');
        await updateM3URecord(id, { content: m3uContent, lastFetched: Date.now(), isActive: true });
        await setOnlyActive(id);
     } else {
        // Nessun canale -> non creare playlist 'local'
      }
    })();
}


// FUNZIONE: Elimina un canale (Aggiorna UI dopo eliminazione canale)
function updateUI() {
    renderGroupedChannelList(showingFavorites ? groupedFavoriteChannels : groupedChannels, { context: 'channels' });

    updateButtons();
}

// inizio blocco drag and drop

// FUNZIONE: Inizializza drag & drop con event delegation.
// Va chiamata UNA SOLA VOLTA all'avvio. I listener vengono attaccati al
// contenitore stabile #channelList e intercettano tutti gli eventi dei figli
// tramite bubbling, senza mai doverli riattaccare dopo un re-render.
function setupDragAndDropDelegation() {
    const list = document.getElementById('channelList');
    if (!list || list.__dragDropInitialized) return;
    list.__dragDropInitialized = true;

    // ── DRAGSTART ────────────────────────────────────────────────────────────
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

    // ── DRAGEND ──────────────────────────────────────────────────────────────
    list.addEventListener('dragend', () => {
        // Pulizia visiva universale: rimuove .dragging e .drop-target ovunque
        list.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        list.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

        // Reset stato
        draggedItem              = null;
        draggedItemOriginalGroup = null;
        draggedItemOriginalUrl   = null;
        draggedItemIsFavorite    = false;
        draggedGroupIndex        = null;
        draggedGroupIsFavorite   = false;
    });

    // ── DRAGOVER ─────────────────────────────────────────────────────────────
    list.addEventListener('dragover', (e) => {
        if (e.target.closest('.channel-item, .group-header')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });

    // ── DRAGENTER ────────────────────────────────────────────────────────────
    list.addEventListener('dragenter', (e) => {
        const target = e.target.closest('.channel-item, .group-header');
        if (!target) return;
        e.preventDefault();
        // Rimuovi da tutti gli altri prima di aggiungere al nuovo target:
        // evita che .drop-target rimanga su elementi precedenti in caso di
        // movimento rapido tra elementi vicini.
        list.querySelectorAll('.drop-target').forEach(el => {
            if (el !== target) el.classList.remove('drop-target');
        });
        target.classList.add('drop-target');
    });

    // ── DRAGLEAVE ────────────────────────────────────────────────────────────
    // Il browser spara dragleave quando il cursore entra in un elemento FIGLIO
    // dello stesso target (es. passa sul testo dentro .channel-item).
    // La correzione: rimuovi .drop-target solo se il cursore sta davvero
    // uscendo dall'elemento, cioè se relatedTarget non è un suo discendente.
    list.addEventListener('dragleave', (e) => {
        const target = e.target.closest('.channel-item, .group-header');
        if (!target) return;
        // relatedTarget è l'elemento su cui il cursore sta entrando.
        // Se è dentro target, non stiamo davvero uscendo — ignora.
        if (target.contains(e.relatedTarget)) return;
        target.classList.remove('drop-target');
    });

    // ── DROP ─────────────────────────────────────────────────────────────────
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

        // Correzione indice quando si sposta verso il basso nello stesso gruppo
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

// FUNZIONE: Sposta un gruppo nella lista 
function moveGroup(fromIndex, toIndex, isFavoriteList = false) {
  if (fromIndex === toIndex) return false;
  
  const groups = isFavoriteList ? groupedFavoriteChannels : groupedChannels;
  
  // Validazione robusta
  if (!Array.isArray(groups)) return false;
  
  if (fromIndex < 0 || fromIndex >= groups.length || 
      toIndex < 0 || toIndex >= groups.length) return false;

  // 1. Sposta il gruppo nell'array dei gruppi
  const [moved] = groups.splice(fromIndex, 1);
  let insertIndex = toIndex;
  
  // Regola l'indice di inserimento se si sposta verso il basso
  if (fromIndex < toIndex) insertIndex = toIndex - 1;
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > groups.length) insertIndex = groups.length;
  
  groups.splice(insertIndex, 0, moved);

  // 2. Aggiorna l'ordine dei gruppi
  groups.forEach((g, idx) => { 
    if (g) g.order = idx; 
  });

  // 3. Sincronizza gli array flat
  if (isFavoriteList) {
    favoriteChannels = groups.flatMap(g => g.channels || []);
  } else {
    channels = groups.flatMap(g => g.channels || []);
  }

  // 4. Ricostruisci le mappe di indice
  rebuildIndexMaps();
  
  return true;
}

// FUNZIONE: Sposta un canale tra gruppi (gestione playlist + preferiti su IDB)
function moveChannel(fromGroupIndex, fromChannelIndex, toGroupIndex, toChannelIndex, isFavoriteList) {
  if (fromGroupIndex === toGroupIndex && fromChannelIndex === toChannelIndex) return;

  const sourceGroups = isFavoriteList ? groupedFavoriteChannels : groupedChannels;
  
  // Validazione
  if (!Array.isArray(sourceGroups) || 
      fromGroupIndex < 0 || fromGroupIndex >= sourceGroups.length ||
      toGroupIndex < 0 || toGroupIndex >= sourceGroups.length) return;

  const fromGroup = sourceGroups[fromGroupIndex];
  const toGroup = sourceGroups[toGroupIndex];

  if (!fromGroup || !toGroup) return;
  if (fromChannelIndex < 0 || fromChannelIndex >= fromGroup.channels.length) return;

  // 1. Rimuovi il canale dal gruppo sorgente
  const [movedChannel] = fromGroup.channels.splice(fromChannelIndex, 1);
  
  if (!movedChannel) return;
  
  // Salva la vecchia chiave prima di modificare il gruppo
  const oldKey = getChannelKey(movedChannel);
  
  // 2. Aggiorna il gruppo del canale
  movedChannel.group = toGroup.name;
  
  // 3. Calcola la nuova chiave
  const newKey = getChannelKey(movedChannel);

  // 4. Inserisci nel gruppo destinazione (con validazione indice)
  let safeToIndex = toChannelIndex;
  if (safeToIndex < 0) safeToIndex = 0;
  if (safeToIndex > toGroup.channels.length) safeToIndex = toGroup.channels.length;
  
  toGroup.channels.splice(safeToIndex, 0, movedChannel);

  // 5. Aggiorna array flat e strutture dati
  if (isFavoriteList) {
    // Aggiorna l'array flat dei preferiti
    favoriteChannels = groupedFavoriteChannels.flatMap(g => g.channels || []);

    // Aggiorna la Set delle chiavi
    favoriteKeys.delete(oldKey);
    favoriteKeys.add(newKey);
    
    // Aggiorna IndexedDB con persistFavoritesOrder
    void (async () => {
      try {
        await persistFavoritesOrder(favoriteChannels);
      } catch (error) {}
    })();
  } else {
    // Aggiorna l'array flat principale
    channels = groupedChannels.flatMap(g => g.channels || []);

    // Genera nuovo contenuto M3U
    const m3uContent = generateM3UFromChannels(channels);

    // Aggiorna IndexedDB playlist attiva
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

  // 6. Ricostruisci le mappe di indice
  rebuildIndexMaps();
}


// cancellata ==================>>>>> FUNZIONE: Aggiorna la chiave del canale nei preferiti (IndexedDB)


// Helper per accesso rapido ai canali per URL
function getChannelByUrl(url, fromFavorites = false) {
    if (fromFavorites) {
        return favoriteUrlMap.get(url) || null;
    } else {
        return channelUrlMap.get(url) || null;
    }
}

// FUNZIONE: Aggiorna groupedChannels dopo modifica al gruppo
function updateGroupedChannelsAfterGroupChange(channel, oldGroupName) {
  // 1. Rimuovi il canale dal vecchio gruppo
  const oldGroup = groupedChannels.find(g => g.name === oldGroupName);
  if (oldGroup) {
    const channelIndex = oldGroup.channels.findIndex(c => getChannelKey(c) === getChannelKey(channel));
    if (channelIndex !== -1) {
      oldGroup.channels.splice(channelIndex, 1);
      
      // Se il gruppo è vuoto, rimuovilo
      if (oldGroup.channels.length === 0) {
        const groupIndex = groupedChannels.findIndex(g => g.name === oldGroupName);
        if (groupIndex !== -1) {
          groupedChannels.splice(groupIndex, 1);
          
          // Rimuovi anche dallo stato di collasso
          delete groupCollapseState[oldGroupName];
        }
      }
    }
  }
  
  // 2. Aggiungi il canale al nuovo gruppo
  let newGroup = groupedChannels.find(g => g.name === channel.group);
  if (!newGroup) {
    // Crea un nuovo gruppo se non esiste
    newGroup = {
      name: channel.group,
      logo: null,
      channels: [],
      order: groupedChannels.length > 0 ? 
             Math.max(...groupedChannels.map(g => g.order)) + 1 : 
             0
    };
    groupedChannels.push(newGroup);
    
    // Inizializza lo stato del nuovo gruppo come espanso
    groupCollapseState[channel.group] = false;
  }
  
  // Aggiungi il canale al nuovo gruppo (se non già presente)
  if (!newGroup.channels.find(c => getChannelKey(c) === getChannelKey(channel))) {
    newGroup.channels.push(channel);
  }
  
  // 3. Mantieni l'ordinamento dei gruppi
  groupedChannels.sort((a, b) => a.order - b.order);
}

// FUNZIONE: Salva l'ordine corrente dei canali (VERSIONE ROBUSTA)
function saveChannelOrder() {
  // 1. Verifica che groupedChannels e channels siano sincronizzati
  const flatFromGroups = groupedChannels.flatMap(g => g.channels || []);
  
  if (flatFromGroups.length !== channels.length) {
    channels = flatFromGroups;
  }
  
  // 2. Genera M3U
  const m3uContent = generateM3UFromChannels(channels);
  
  // 3. Salva in IndexedDB
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

// FUNZIONE: Aggiorna lo stato dei pulsanti dell'interfaccia
function updateButtons() {
      const hasChannels = channels.length > 0;
      const toggle = document.getElementById('favoritesToggle');
      updateToggleState();
    }

// FUNZIONE: Sincronizza lo stato del pill button con la variabile
function updateToggleState() {
  const pillButton = document.getElementById('favoritesPill');
  if (pillButton) {
    pillButton.classList.toggle('active', showingFavorites);
  }
}

// inizio blocco metadati

// FUNZIONE: Aggiorna lo stato del container dei metadati (VERSIONE MIGLIORATA)
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
      
      // FORZA AGGIORNAMENTO CON FALLBACK ROBUSTO
      // Rimuovi il setTimeout e aggiorna immediatamente
      const currentChannel = getActiveChannel();
      if (!currentChannel) {
        // Se getActiveChannel() fallisce, prova un approccio più aggressivo
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
      // QUANDO SI CHIUDONO I METADATI, CANCELLA IL CONTENUTO
      if (metadataContent) {
        metadataContent.innerHTML = '';
      }
      container.classList.remove('expanded');
      container.style.display = 'none';
    }
  } else {
    header.style.display = "none";
    container.classList.remove('expanded');
    container.style.display = "none";
    // FORZA LO STATO A FALSE SE DISABILITATO
    localStorage.setItem('metadataExpanded', 'false');
    metadataExpanded = false;
    // Cancella anche il contenuto se i metadati sono disabilitati
    if (metadataContent) {
      metadataContent.innerHTML = '';
    }
  }
}

// HELPER per recuperare sempre il canale attivo al momento dell’evento
function getActiveChannel() {
  const key = window.currentChannelUrl;
  const list = showingFavorites ? favoriteChannels : getCurrentDisplayList();
  return list.find(ch => getChannelKey(ch) === key) || null;
}

// FUNZIONE: Mostra i metadati del canale
function showChannelMetadata(channel) {
  const metadataContent = document.getElementById('metadataContent');

  // Se il contenuto dei metadati è già stato generato, aggiorna solo i valori
  if (metadataContent.children.length > 0) {
    updateMetadataValues(channel);
    return;
  }

  metadataContent.innerHTML = ''; // Pulisci contenuto precedente

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
          input.blur(); // scatena di nuovo blur → salvataggio con canale attivo
        }
      });

      valueElement.appendChild(input);
    }

    metadataContent.appendChild(labelElement);
    metadataContent.appendChild(valueElement);
  }

  metadataContainer.style.display = 'block';
}


// FUNZIONE: Aggiorna solo i valori dei metadati
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


// FUNZIONE: Salva le modifiche ai metadati del canale
async function saveMetadataChanges(newName = null) {
  const ch = getActiveChannel();
  if (!ch) return;

  const oldKey = getChannelKey(ch);
  const oldGroup = ch.group;
  const isFavView = !!showingFavorites;

  const metadataContent = document.getElementById('metadataContent');
  const inputs = metadataContent.querySelectorAll('.metadata-input');

  // Se newName è una stringa non vuota -> aggiorna solo il nome.
  // Altrimenti esegui il comportamento originale che legge dagli input.
  if (typeof newName === 'string') {
    const trimmed = newName.trim();
    if (trimmed) {
      ch.name = trimmed;
    }
  } else {
    // Applica le modifiche direttamente dagli input (comportamento originale)
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

  // Aggiorna gruppi solo se sei in vista principale
  if (oldGroup !== ch.group && !isFavView) {
    updateGroupedChannelsAfterGroupChange(ch, oldGroup);
  }

  // Aggiornamento preferiti solo se in isFavView
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

    // Aggiorna array in memoria direttamente
    if (favIndex !== -1) {
      favoriteChannels[favIndex] = ch;
    }

    // Raggruppa e renderizza
    groupedFavoriteChannels = groupChannels(favoriteChannels);
    renderGroupedChannelList(groupedFavoriteChannels, { context: 'channels' });
  rebuildIndexMaps(); 
  } else {
    // Lista principale
    const mainIndex = channels.findIndex(c => getChannelKey(c) === oldKey);
    if (mainIndex !== -1) {
      channels[mainIndex] = ch;
    }

    groupedChannels = groupChannels(channels);
    renderGroupedChannelList(groupedChannels, { context: 'channels' });
    rebuildIndexMaps();

    // IndexedDB: sempre updateM3URecord
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

  // Aggiorna chiave corrente se necessario
  if (window.currentChannelUrl === oldKey) {
    window.currentChannelUrl = getChannelKey(ch);
  }

  // Riapri pannello metadati se era aperto
  if (metadataExpanded) {
    showChannelMetadata(ch);
  }
}

// Fine blocco metadati

// FUNZIONI GESTIONE SWIPE

function setupSwipeHandlers() {
  const channelContainer = document.getElementById('channelListContainer');
  const fullEpgList = document.getElementById('fullEpgList');
  const containers = [channelContainer, fullEpgList, playlistList, epgList].filter(Boolean);

  // Edge area reserved for sidebar (pixels from right edge)
  const SIDEBAR_EDGE_WIDTH = 28;  // keep in sync with your sidebar edgeWidth constant
  const HEADER_HEIGHT = 50;       // same as other checks in file

  containers.forEach(container => {
    if (container.__swipeHandlersAttached) return;
    container.__swipeHandlersAttached = true;

    // store both X and Y start/end
    container.addEventListener('touchstart', (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const t = e.changedTouches[0];
      touchStartX = t.screenX;
      touchStartY = t.screenY;

      // If started inside sidebar, bottom sheet, epg drawer or their handles -> ignore
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (el && (el.closest('.sidebar') || el.closest('.sidebar-handle') ||
                 el.closest('.bottom-sheet') || el.closest('.bottom-sheet-handle') ||
                 el.closest('#channelEpgDrawer') || el.closest('.bottom-sheet-drag-area'))) {
        // mark so touchend ignores it
        container.__ignoreNextTouch = true;
        return;
      }
      container.__ignoreNextTouch = false;

      // If start is in the right-edge area for sidebar opening, don't use it for view-swipe
      if (t.clientX > (window.innerWidth - SIDEBAR_EDGE_WIDTH) && t.clientY > HEADER_HEIGHT) {
        container.__ignoreNextTouch = true;
        return;
      }

      // Also ignore if sidebar is currently open
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
      handleSwipe(); // now will do angle checks
    }, { passive: true });

    // Mouse fallback (desktop)
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

// Adjusted handlers that compute both dx and dy
function handleSwipe() {
  const dx = touchEndX - touchStartX;
  const dy = (typeof touchEndY !== 'undefined' && typeof touchStartY !== 'undefined') ? (touchEndY - touchStartY) : 0;
  processSwipe(dx, dy);
}

function handleMouseSwipe() {
  const dx = mouseUpX - mouseDownX;
  const dy = (typeof mouseUpY !== 'undefined' && typeof mouseDownY !== 'undefined') ? (mouseUpY - mouseDownY) : 0;
  processSwipe(dx, dy);
}

// More robust: dx must be big AND dominant over dy; avoid edge & UI conflicts
function processSwipe(dx, dy) {
  // min horizontal distance (px)
  const MIN_DISTANCE = 180;
  // horizontal must be at least this factor larger than vertical movement
  const HORIZONTAL_DOMINANCE = 2.5;

  if (Math.abs(dx) < MIN_DISTANCE) return;
  if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return;

  // Prevent accidental when sidebar or bottom-sheet open
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && sidebar.classList.contains('open')) return;
  if (document.querySelector('.bottom-sheet.open')) return;
  if (document.getElementById('channelEpgDrawer')?.classList.contains('open')) return;

  if (dx > 0 && currentViewMode === 'grid') {
    switchViewMode('list');
  } else if (dx < 0 && currentViewMode === 'list') {
    switchViewMode('grid');
  }
}

function switchViewMode(mode) {
    // 1. Evita cicli inutili ma forza l'aggiornamento se il pulsante è "sporco"
    currentViewMode = mode;
    if (typeof saveViewModePreference === 'function') {
        saveViewModePreference(mode);
    } else {
        localStorage.setItem('zappone_view_mode', mode);
    }

    // 2. Sincronizza lo stato del pulsante e rimuovi modalità collasso se attiva
    const viewModePill = document.getElementById('viewModePill');
    if (viewModePill) {
        viewModePill.classList.remove('list-mode', 'grid-mode', 'collapse-mode');
        viewModePill.classList.add(mode === 'grid' ? 'grid-mode' : 'list-mode');
    }

    // 3. Lista di tutti i contenitori che devono rispondere al cambio vista
    const containers = [
        { id: 'channelList', isFullEpg: false },
        { id: 'playlistList', isFullEpg: false },
        { id: 'epgList', isFullEpg: false },
        { id: 'fullEpgList', isFullEpg: true }
    ];

    containers.forEach(c => {
        const el = document.getElementById(c.id);
        if (!el) return;

        // Cambia classe principale al contenitore
        if (c.isFullEpg) {
            el.classList.remove('list-view', 'grid-view');
            el.classList.add(mode + '-view');
        } else {
            el.className = 'view-' + mode;
        }

        // Aggiorna gli elementi figli (tile canali)
        el.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('list', 'grid');
            item.classList.add(mode);
        });

        // Aggiorna i contenitori dei gruppi
        el.querySelectorAll('.group-content').forEach(group => {
            group.classList.remove('list-view', 'grid-view');
            group.classList.add(mode + '-view');
        });
    });

    // --- FIX: RI‑RENDERIZZA LA LISTA CANALI PER RICOSTRUIRE LA STRUTTURA ---
    // Solo se stiamo effettivamente visualizzando i canali (non playlist, EPG o Full EPG)
    if (!window.isEPGView && !window.isPlaylistView &&
        document.getElementById('channelListContainer') &&
        !document.getElementById('channelListContainer').classList.contains('hidden')) {

        // Ricostruisci la lista con la struttura corretta per la nuova modalità
        renderGroupedChannelList(
            showingFavorites ? groupedFavoriteChannels : groupedChannels,
            { context: 'channels' }
        );

        // (Opzionale) Riporta la vista sul canale attivo
        if (window.currentChannelUrl) {
            setTimeout(() => {
                const target = document.querySelector(`[data-key="${CSS.escape(window.currentChannelUrl)}"]`);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }
}
// FUNZIONE: Salva le preferenze di visualizzazione
 function saveViewModePreference(mode) {
      localStorage.setItem('zappone_view_mode', mode);
      localStorage.setItem('zappone_show_favorites', showingFavorites);
    }

// FUNZIONE: Carica le preferenze di visualizzazione
function loadViewModePreference() {
  const showFav = localStorage.getItem('zappone_show_favorites');
  return { 
    mode: localStorage.getItem('zappone_view_mode') || 'list',
    showFav: showFav === 'true' 
  };
}

// FIX: guardia anti-ricorsione. Se enableConsoleIntercept() è attivo, console.error/warn
// richiamano showNotification(); se showNotification() a sua volta fallisce e nel suo
// catch chiama console.error, si innescherebbe un loop infinito (stack overflow).
// Questo flag impedisce a showNotification() di rientrare in se stessa mentre è già
// in esecuzione più in basso nello stack.
let _notifyReentrancyGuard = false;

// FUNZIONE: Mostra una notifica all'utente (versione migliorata)
function showNotification(message, isError = false, force = false) {
  if (_notifyReentrancyGuard) return; // siamo già dentro showNotification: non rientrare
  _notifyReentrancyGuard = true;

  try {
    if (!force) {
      const pref = localStorage.getItem('zappone_popup_notifications');
      const enabled = pref === null ? true : pref === 'true';
      if (!enabled) return;
    }

    // Creiamo o recuperiamo il contenitore "stack"
    let container = document.getElementById('notification-stack');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-stack';
      document.body.appendChild(container);
    }

    // Creazione elemento notifica
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    
    // Limita lunghezza testo
    // FIX: message potrebbe non essere una stringa (es. un oggetto passato per errore
    // dall'intercettazione della console): String(...) evita un TypeError su .length/.substring
    // che altrimenti finirebbe proprio nel catch sottostante.
    const maxLength = 150;
    const safeMessage = String(message ?? '');
    notification.textContent = safeMessage.length > maxLength ? safeMessage.substring(0, maxLength) + '...' : safeMessage;

    // Aggiunta allo stack
    container.appendChild(notification);

    // Attiviamo l'animazione tramite classe CSS dopo un frame
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    // Auto-rimozione dopo 4 secondi
    setTimeout(() => {
      notification.classList.remove('show'); // Inizia animazione sparizione
      
      // Rimuovi dal DOM dopo che l'animazione CSS è finita (300ms)
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);

  } catch (e) {
    // Se console.error è intercettato, questa chiamata rientrerà in showNotification():
    // grazie alla guardia sopra, quel rientro si limiterà a un no-op immediato invece
    // di innescare un loop.
    console.error('showNotification error', e);
  } finally {
    _notifyReentrancyGuard = false;
  }
}

 // Funzione per intercettare i metodi della console
 // Sovrascrittura dei metodi della console
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
  };


// Funzione per intercettare i metodi della console vera e propria
  function interceptConsole(method, isError = false) {
    const original = originalConsole[method];
    console[method] = function(...args) {
      // Chiama la console originale
      original.apply(console, args);
      
      // Converti gli argomenti in una stringa leggibile
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

      // Mostra la notifica
      showNotification(`${method.toUpperCase()}: ${message}`, isError, true);

    };
  }

// Applica l'intercettazione dopo che la pagina è completamente caricata
function enableConsoleIntercept() {
  interceptConsole('error', true);
  interceptConsole('warn', true);
  interceptConsole('log', false);
  interceptConsole('info', false);
  interceptConsole('debug', false);
  originalConsole.log('Intercettazione console: ENABLED');
}

function disableConsoleIntercept() {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
  originalConsole.log('Intercettazione console: DISABLED');
}

// listener
window.addEventListener('load', () => {
  const enabled = localStorage.getItem('zappone_console_overlay') === 'true';
  if (enabled) enableConsoleIntercept();
  else disableConsoleIntercept();
});

// IIFE: Sidebar Ozioni
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
    let currentTranslateSidebar = sidebarWidth; // stato iniziale

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

    // stato iniziale
    sidebar.style.transform = `translateX(${sidebarWidth}px)`;
    overlay.classList.remove('active');

    // open/close via pulsanti
optionsBtn.addEventListener('click', () => {

  sidebarWidth = sidebar.offsetWidth || sidebarWidth;
  setSidebarOpen(true);
});

    closeBtn.addEventListener('click', () => setSidebarOpen(false));
    overlay.addEventListener('click', () => setSidebarOpen(false));

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function startDragSidebar(clientX) {
      isDraggingSidebar = true;
      sidebarWidth = sidebar.offsetWidth || sidebarWidth;
      dragStartXSidebar = clientX;
      startTranslateSidebar = isSidebarOpen ? 0 : sidebarWidth;
      sidebar.style.transition = 'none';
      overlay.style.transition = 'none';
      handle.style.transition = 'none';
      overlay.classList.add('active');
    }

    function onDragSidebar(clientX) {
      if (!isDraggingSidebar) return;
      const delta = dragStartXSidebar - clientX;
      let newTranslate = startTranslateSidebar - delta;
      newTranslate = clamp(newTranslate, 0, sidebarWidth);
      currentTranslateSidebar = newTranslate;
      sidebar.style.transform = `translateX(${newTranslate}px)`;

      overlay.style.opacity = String(1 - (newTranslate / sidebarWidth));
    }

    function endDragSidebar() {
      if (!isDraggingSidebar) return;
      isDraggingSidebar = false;
      const shouldOpen = currentTranslateSidebar < (sidebarWidth / 2);
      if (shouldOpen) setSidebarOpen(true);
      else setSidebarOpen(false);

      // rimuovo listener globali mouse se attivi
      document.removeEventListener('mousemove', onMouseMoveSidebar);
      document.removeEventListener('mouseup', onMouseUpSidebar);
    }

    // --- Touch ---
    handle.addEventListener('touchstart', (ev) => {
      if (!ev.touches || ev.touches.length === 0) return;
      startDragSidebar(ev.touches[0].clientX);
    }, {passive: true});

    document.addEventListener('touchmove', (ev) => {
      if (!isDraggingSidebar) return;
      if (ev.touches && ev.touches.length) {
        onDragSidebar(ev.touches[0].clientX);
        ev.preventDefault();
      }
    }, {passive: false});

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

    // tastiera
    handle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSidebarOpen(!isSidebarOpen);
      }
    });

    // edge swipe per sidebar
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

    // resize
    window.addEventListener('resize', () => {
      sidebarWidth = sidebar.offsetWidth || sidebarWidth;
      if (!isSidebarOpen) {
        currentTranslateSidebar = sidebarWidth;
        sidebar.style.transform = `translateX(${sidebarWidth}px)`;
     
      }
    });
  }

  // Drawer EPG

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

      // se sidebar opzioni aperto, blocco swipe EPG
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

    document.addEventListener("touchmove", (ev) => {
      if (!isDraggingEPG) return;
      if (ev.touches && ev.touches.length) {
        onDragEPG(ev.touches[0].clientX);
        ev.preventDefault();
      }
    }, {passive: false});

    document.addEventListener("touchend", () => { if (isDraggingEPG) endDragEPG(); }, {passive: true});
  }
})();

// Tab switching
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

/* --------- Aspetto --------- */

document.getElementById("themeToggleSidebar").onchange = () =>
  document.getElementById("themeToggle").click();

  // Font size (modificato per step di 5)
  const fontSizeRange = document.getElementById("fontSizeRange");
  const fontSizeValue = document.getElementById("fontSizeValue");

  fontSizeRange.addEventListener("input", () => {
    // Arrotonda al multiplo di 5 più vicino
    const roundedValue = Math.round(fontSizeRange.value / 5) * 5;
    fontSizeRange.value = roundedValue;
    
    document.documentElement.style.fontSize = roundedValue + "%";
    fontSizeValue.textContent = roundedValue + "%";
    localStorage.setItem("zappone_font_size", roundedValue);
  });
  
  // Carica valore salvato all'inizializzazione
  if (localStorage.getItem("zappone_font_size")) {
    const fs = parseInt(localStorage.getItem("zappone_font_size"));
    // Assicurati che sia un multiplo di 5
    const roundedFs = Math.round(fs / 5) * 5;
    fontSizeRange.value = roundedFs;
    fontSizeValue.textContent = roundedFs + "%";
    document.documentElement.style.fontSize = roundedFs + "%";
  }


/* --------- Playlist --------- */
const defaultM3UInput = document.getElementById("defaultM3UInput");
const defaultEPGInput = document.getElementById("defaultEPGInput");

// Precarica valori
defaultM3UInput.value = localStorage.getItem("zappone_default_m3u") || DEFAULT_PLAYLIST_URL;
defaultEPGInput.value = localStorage.getItem("zappone_default_epg") || epgUrl;

// Salvataggi
document.getElementById("saveM3UDefault").onclick = () => {
  localStorage.setItem("zappone_default_m3u", defaultM3UInput.value);
  showNotification("URL M3U salvato");
};
document.getElementById("saveEPGDefault").onclick = () => {
  localStorage.setItem("zappone_default_epg", defaultEPGInput.value);
  epgUrl = defaultEPGInput.value;
  showNotification("URL EPG salvato");
};

// Caricamenti
document.getElementById("loadM3UDefault").onclick = async () => {
  const url = localStorage.getItem("zappone_default_m3u") || DEFAULT_PLAYLIST_URL;
  await loadRemoteM3U(url, false); // false = non chiudere nulla (non c'è bottom sheet aperto)
};


document.getElementById("loadEPGDefault").onclick = async () => {
  const url = localStorage.getItem("zappone_default_epg") || epgUrl;
  window.forceEPGReload = true; // Forza il refresh
  await downloadEPG(url, { setActive: true, updateUI: true });
  if (typeof renderEPGManager === 'function') renderEPGManager();
};

// Reset M3U
document.getElementById("resetM3U").onclick = () => {
  // FIX: prima si scriveva su IndexedDB con setDefaultM3U(), che (a) non veniva mai
  // riletto da nessuno (loadM3UDefault usa localStorage "zappone_default_m3u") quindi
  // il reset non aveva alcun effetto reale, e (b) lasciava nello store 'm3uUrls' un
  // record fittizio {id:"default_m3u"} che compariva come voce fantasma "Playlist
  // senza nome" nel gestore playlist. Allineato a resetEPG, che è corretto.
  localStorage.setItem("zappone_default_m3u", DEFAULT_PLAYLIST_URL);
  defaultM3UInput.value = DEFAULT_PLAYLIST_URL;
  showNotification("URL M3U ripristinato");
};

// Reset EPG - Versione corretta
document.getElementById("resetEPG").onclick = () => {
  // Usa direttamente la variabile epgUrl che contiene il valore dal server
  localStorage.setItem("zappone_default_epg", epgUrl);
  defaultEPGInput.value = epgUrl;
  showNotification("URL EPG ripristinato");
};


// Hard Reset
document.getElementById("hardReset").onclick = async () => {
  if (!confirm("Sei sicuro di voler eseguire un Hard Reset?")) return;

  try {
    // 1. Pulisci localStorage
    localStorage.clear();

    // 2. Cancella i DB
    await Promise.all([
      deleteDB("ZappOneDB"),
      deleteDB("M3UPlaylistsDB")
    ]);

    // 3. Cancella Cache API
    if ("caches" in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        console.log("CacheStorage cleared");
      } catch (e) {
        console.warn("Cache clear failed", e);
      }
    }

    // 4. Unregister Service Workers
    if ("serviceWorker" in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        console.log("Service workers unregistered");
      } catch (e) {
        console.warn("SW unregister failed", e);
      }
    }

    // 5. Azzera memoria runtime
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

    // 6. Reload definitivo (meglio replace per Safari/iOS)
    setTimeout(() => {
      window.location.replace(window.location.origin + window.location.pathname);
    }, 300);

  } catch (err) {
    console.error("Hard reset failed:", err);
    alert("Errore durante Hard Reset: vedi console per dettagli.");
  }
};


// Radio già collegato

// Gestione toggle Mostra Metadati
document.getElementById("toggleMetadata").onchange = e => {
  const enabled = e.target.checked;
  localStorage.setItem("zappone_show_metadata", enabled);

  const header = document.getElementById("metadataHeader");
  const container = document.getElementById("metadataContainer");

  if (enabled) {
    // Mostra solo l'header, il container si gestisce con il suo expand/collapse
    header.style.display = "flex";
    if (metadataExpanded) {
      container.classList.add("expanded");
      container.style.display = "block";
    } else {
      container.classList.remove("expanded");
      container.style.display = "none";
    }
  } else {
    // Nascondi tutto, forzando anche collassato
    header.style.display = "none";
    container.classList.remove("expanded");
    container.style.display = "none";
    metadataExpanded = false;
    localStorage.setItem("metadataExpanded", "false");
  }
};

// Stato iniziale al caricamento
let saved = localStorage.getItem("zappone_show_metadata");

// se non c'è valore salvato, parte di default su false
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
  }
} else {
  document.getElementById("metadataHeader").style.display = "none";
  document.getElementById("metadataContainer").style.display = "none";
}

// Mostra EPG
document.getElementById("toggleEPG").onchange = async e => {
  const enabled = e.target.checked;
  localStorage.setItem("zappone_show_epg", String(enabled));

  const epgHeader = document.getElementById("epgHeader");
  const epgContainer = document.getElementById("epgContainer");
  const epgContent = document.getElementById('epgContent');

  if (enabled) {
    epgHeader.style.display = "flex";
    epgContainer.style.display = "block";

    // --- FORZA l'aggiornamento dell'EPG per il canale corrente ---
    try {
      const active = getActiveChannel && typeof getActiveChannel === 'function'
        ? getActiveChannel()
        : null;

      // fallback: usa l'ultimo URL riprodotto
      const lastUrl = !active && localStorage.getItem("zappone_last_played")
        ? localStorage.getItem("zappone_last_played")
        : null;

      let channelToShow = active || (lastUrl ? (channelUrlMap.get(lastUrl) || favoriteUrlMap.get(lastUrl)) : null);

      if (channelToShow) {
        if (typeof showChannelEPG === 'function') {
          showChannelEPG(channelToShow);
        }
      } else {
        // se non trovi canale attivo, svuota il contenuto per evitare che rimanga il vecchio
        if (epgContent) epgContent.innerHTML = `<div class="epg-message"><p>Nessun canale selezionato</p></div>`;
      }
    } catch (err) {
      console.warn('EPG refresh on toggle failed', err);
    }
  } else {
    epgHeader.style.display = "none";
    epgContainer.style.display = "none";
    // elimina il contenuto per prevenire mostra di dati obsoleti quando si riapre
    if (epgContent) epgContent.innerHTML = '';
  }
};

// Stato iniziale al caricamento (default OFF se mai usato prima)
let savedEPG = localStorage.getItem("zappone_show_epg");
if (savedEPG === null) {
  savedEPG = "false";
  localStorage.setItem("zappone_show_epg", "false");
}

if (savedEPG === "true") {
  document.getElementById("toggleEPG").checked = true;
  document.getElementById("epgHeader").style.display = "flex";
  document.getElementById("epgContainer").style.display = "block";
} else {
  document.getElementById("epgHeader").style.display = "none";
  document.getElementById("epgContainer").style.display = "none";
}

// Full screen su iphone
document.getElementById("autoFullscreenToggle").onchange = e => {
  localStorage.setItem("zappone_auto_fullscreen", e.target.checked);
};

// E carica lo stato salvato all'inizializzazione
if (localStorage.getItem("zappone_auto_fullscreen") === "false") {
  document.getElementById("autoFullscreenToggle").checked = false;
} else {
  // Di default è abilitato
  document.getElementById("autoFullscreenToggle").checked = true;
  localStorage.setItem("zappone_auto_fullscreen", "true");
}

// Mostra URL playlists
// Mostra URL playlists
document.getElementById("showPlaylistUrl").onchange = e => {
  localStorage.setItem("zappone_show_playlist_url", e.target.checked);
  
  window.forcePlaylistReload = true;
  window.forceEPGReload = true;

  // CONTROLLO CORRETTO: Verifica quale container è visibile al momento
  const playlistContainer = document.getElementById('playlistListContainer');
  const epgContainer = document.getElementById('epgListContainer');

  // Se la sezione Playlist è visibile (non ha la classe 'hidden')
  if (playlistContainer && !playlistContainer.classList.contains('hidden')) {
      if (typeof renderPlaylistList === 'function') renderPlaylistList();
  } 
  // Altrimenti se la sezione EPG Manager è visibile
  else if (epgContainer && !epgContainer.classList.contains('hidden')) {
      if (typeof renderEPGManager === 'function') renderEPGManager();
  }
};

// Stato iniziale al caricamento (default OFF)
if (localStorage.getItem("zappone_show_playlist_url") === "true") {
  document.getElementById("showPlaylistUrl").checked = true;
} else {
  // Di default è disabilitato
  document.getElementById("showPlaylistUrl").checked = false;
  localStorage.setItem("zappone_show_playlist_url", "false");
}

// Inizializza il toggle per l'intercettazione console (Tab Info) Attenzione questo è uno snipset
(function setupConsoleInterceptToggle() {
  const chk = document.getElementById('consoleInterceptToggle');
  if (!chk) return;

  // Stato iniziale dal localStorage (default OFF)
  const enabled = localStorage.getItem('zappone_console_overlay') === 'true';
  chk.checked = enabled;

  // Listener per cambiare lo stato a runtime
  chk.addEventListener('change', (e) => {
    const on = !!e.target.checked;
    localStorage.setItem('zappone_console_overlay', on ? 'true' : 'false');

    if (on) {
      // abilita subito l'intercettazione
      enableConsoleIntercept();
    } else {
      // disabilita e ripristina console originale
      disableConsoleIntercept();
    }
  });
})();

// Setup per il toggle delle popup notifications (Tab Info) Attenzione questo é uno snipset
(function setupPopupNotificationsToggle() {
  const chk = document.getElementById('popupNotificationsToggle');
  if (!chk) return;

  // stato iniziale: default ON (se mai non settato)
  const stored = localStorage.getItem('zappone_popup_notifications');
  const enabled = stored === null ? true : stored === 'true';
  chk.checked = enabled;

  chk.addEventListener('change', (e) => {
    const on = !!e.target.checked;
    localStorage.setItem('zappone_popup_notifications', on ? 'true' : 'false');
  });
})();


// FUNZIONE: Carica e visualizza la lista URL (usa licenza)
async function loadM3UUrlList() { 
  const urlList = document.getElementById('savedM3UList');
  urlList.innerHTML = '';
  
  const urls = await getAllM3UUrls();
  
  urls.forEach(item => {
    const li = document.createElement('li');
    li.classList.add('saved-url-item'); // classe CSS

    const link = document.createElement('a');
    link.href = '#';
    link.textContent = item.name || item.url; // mostra il nome breve se presente
    link.classList.add('saved-url-link'); // classe CSS
    link.title = item.url;
    
    link.dataset.id = item.id;

link.addEventListener('click', async (e) => {
  e.preventDefault();
  const playlistId = e.currentTarget.dataset.id;
  
  // Validazione ID per evitare l'errore IndexedDB "invalid key"
  if (!playlistId || isNaN(playlistId)) return;

  const rec = await getM3UById(Number(playlistId));
  if (!rec) return;


  const isLocal = !rec.url || !rec.url.startsWith('http');

  if (isLocal) {
    // CASO LOCALE
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
    // CASO REMOTO
   showNotification(`Aggiornamento: ${rec.name}`);
    try {
      // Chiamata diretta al proxy con licenza
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
    deleteBtn.classList.add('delete-url-btn'); // classe CSS

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
    li.classList.add('no-url-message'); // classe CSS
    urlList.appendChild(li);
  }
}

// ================================
// FUNZIONE: Aggiorna le UI delle playlist
// ================================

function refreshPlaylistUIs() {
 window.forcePlaylistReload = true;  // <-- AGGIUNGI QUESTA RIGA    
// 1. Ricarica la lista nella sidebar (per mostrare le playlist salvate)
    loadM3UUrlList();
    
    // 2. Se la vista playlist è attualmente aperta, rigenerala
    if (window.isPlaylistView) {
        renderPlaylistList();
    }
    
    // 3. Aggiorna anche il toggle dei preferiti (per sicurezza)
    updateToggleState();
}


// ================================
// FUNZIONE: Refresh Drag & Drop (placeholder)
// ================================

function refreshDragAndDrop() {
    // Non serve implementazione: la delegazione degli eventi è già attiva
    // Ma manteniamo la funzione per evitare il controllo 'typeof'
}


// FUNZIONE: funzione per gestire il click sulle playlist (nel sidebar)
function handlePlaylistClick(playlist) {
    return async function() {
        const rec = await getM3UById(playlist.id);
        let text = rec?.content;

        if (!text) {
            text = await downloadM3U(rec.url);
            await updateM3URecord(rec.id, { content: text, lastFetched: Date.now() });
        }

// -> Replacement per tutti i click handler delle playlist
await saveAndActivateM3U({ url: rec.url, name: rec.name, content: text });
await parseM3U(text, false);
updateButtons();
window.isPlaylistView = false;


// CHIUDI il bottom sheet
if (typeof closeBottomSheet === 'function') closeBottomSheet();
       
    };
}

// Blocco EPG Completo
// ---- FULL EPG ----

// Fine Blocco EPG completo

// Gestione Bottom Sheet
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

// guard flags
let modalM3ULoadingLock = false;
let modalEPGLoadingLock = false;


async function autoLoadM3U(url, name = '', closeAfter = true) {
   if (closeAfter && typeof closeBottomSheet === 'function') closeBottomSheet();

 if (!url || modalM3ULoadingLock) return;
  modalM3ULoadingLock = true;

  const loadingEl = document.getElementById('modalM3ULoading');
  const urlInput = document.getElementById('modalM3UUrl');
  const nameInput = document.getElementById('modalM3UName');

  loadingEl.classList.remove('hidden');
  urlInput.disabled = true;
  nameInput.disabled = true;

  try {
    // use your existing proxy-aware fetch
    const text = await fetchM3UWithProxies(url);

    // FIX (stesso bug di loadRemoteM3U): evita di salvare/attivare un contenuto nullo
    // se il download fallisce.
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('Download playlist fallito: contenuto vuoto o non valido.');
    }

    // reuse your existing persistence helper
    const rec = await saveAndActivateM3U({
      url,
      name: name || (new URL(url)).pathname.split('/').pop(),
      content: text
    });

    // parse + update UI (same as current modalConfirm flow)
    await parseM3U(rec.content, true);
    showingFavorites = false;
    updateButtons?.();
 
 showChannelList();
    showNotification('Playlist caricata'); // consistent with other notification

  refreshPlaylistUIs?.();

  } catch (err) {
    console.error('autoLoadM3U error', err);
    showNotification('Errore nel caricamento playlist', true);
  } finally {
    loadingEl.classList.add('hidden');
    urlInput.disabled = false;
    nameInput.disabled = false;
    modalM3ULoadingLock = false;
 showChannelList();
   closeBottomSheet();
  }
}

/* --- Wiring: paste / enter auto-load for M3U --- */
const modalM3UUrlInput = document.getElementById('modalM3UUrl');
if (modalM3UUrlInput) {
  // Non auto-caricare al paste: lasciamo solo popolare il campo e mettere il focus sul nome
  modalM3UUrlInput.addEventListener('paste', (e) => {
    setTimeout(() => {
      const url = modalM3UUrlInput.value.trim();
      if (url) {
        // aggiorna eventualmente il nome suggerito ma NON caricare
        const nameEl = document.getElementById('modalM3UName');
        if (nameEl && !nameEl.value) {
          try {
            const guessed = new URL(url).pathname.split('/').pop();
            if (guessed) nameEl.value = guessed;
          } catch (err) { /* ignore invalid URL while pasting */ }
        }
      }
    }, 0);
  });

  // Premi Enter: non caricare automaticamente — sposta il focus sul bottone Salva
  modalM3UUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const saveBtn = document.getElementById('m3uSaveBtn') || document.getElementById('modalConfirm');
      if (saveBtn) saveBtn.focus();
    }
  });
}


/* quick buttons inside the sheet */
document.getElementById('m3uLocalBtn')?.addEventListener('click', () => {
  // reuse existing local file input button
  document.getElementById('fileInput').click();
});

// Listener per il tasto Playlist Predefinita nel BottomSheet  (Usa Licenza)
document.getElementById('loadM3UDefaultInSheet')?.addEventListener('click', async () => {
  // Se l'utente è premium, può avere una sua preferita in localStorage, 
  // altrimenti usiamo quella data dal server (appConfig)
  const url = (appConfig.isPremium && localStorage.getItem("zappone_default_m3u")) 
              || appConfig.playlistUrl;
              
  if (url) {
      await loadRemoteM3U(url, true); // Continua a usare la tua funzione originale
  } else {
      showNotification("URL Playlist non disponibile", true);
  }
});

// --- New: Save / Cancel wiring for EPG bottom sheet ---
document.getElementById('epgSaveBtn')?.addEventListener('click', async (e) => {
  window.forceEPGReload = true; // <--- AGGIUNGI QUESTA RIGA
  const confirmEPG = document.getElementById('modalConfirmEPG');
  if (confirmEPG) {
    confirmEPG.click();
    return;
  }

  // fallback if modalConfirmEPG missing
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

document.getElementById('epgCancelBtn')?.addEventListener('click', (e) => {
  const urlInput = document.getElementById('modalEPGUrl');
  const nameInput = document.getElementById('modalEPGName');
  if (urlInput) urlInput.value = '';
  if (nameInput) nameInput.value = '';
  closeEPGBottomSheet();
});


// --- New: Save / Cancel wiring for M3U bottom sheet ---
document.getElementById('m3uSaveBtn')?.addEventListener('click', async (e) => {
  window.forcePlaylistReload = true; // <--- AGGIUNGI QUESTA RIGA
  const confirmBtn = document.getElementById('modalConfirm');
  if (confirmBtn) {
    confirmBtn.click();
    return;
  }

  // fallback (if modalConfirm not present for some reason) — do a minimal save:
  const name = document.getElementById('modalM3UName').value.trim();
  const playlistUrl = document.getElementById('modalM3UUrl').value.trim();
  if (!name || !playlistUrl) { alert('Inserisci sia nome che URL.'); return; }
  try {
    const text = await downloadM3U(playlistUrl);
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

document.getElementById('m3uCancelBtn')?.addEventListener('click', (e) => {
  // cancella eventuale contenuto e chiudi
  const urlInput = document.getElementById('modalM3UUrl');
  const nameInput = document.getElementById('modalM3UName');
  if (urlInput) urlInput.value = '';
  if (nameInput) nameInput.value = '';
  closeBottomSheet();
});


/* --- EPG wiring --- */
const modalEPGUrlInput = document.getElementById('modalEPGUrl');
if (modalEPGUrlInput) {
  // Non auto-caricare al paste: solo suggerimento nome e non trigger
  modalEPGUrlInput.addEventListener('paste', () => {
    setTimeout(() => {
      const url = modalEPGUrlInput.value.trim();
      if (url) {
        const nameEl = document.getElementById('modalEPGName');
        if (nameEl && !nameEl.value) {
          try {
            const guessed = new URL(url).pathname.split('/').pop();
            if (guessed) nameEl.value = guessed;
          } catch (err) { /* ignore invalid URL while pasting */ }
        }
      }
    }, 0);
  });

  // Enter dovrebbe focalizzare Salva, non caricare
  modalEPGUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const saveBtn = document.getElementById('epgSaveBtn') || document.getElementById('modalConfirmEPG');
      if (saveBtn) saveBtn.focus();
    }
  });
}

document.getElementById('epgLocalBtn')?.addEventListener('click', () => {
  document.getElementById('epgFileInput').click();
});

// Listener per il tasto EPG Predefinita nel BottomSheet (Usa Licenza)
document.getElementById('loadEPGDefaultInSheet')?.addEventListener('click', async () => {
    const url = (appConfig.isPremium && localStorage.getItem('zappone_default_epg')) 
                || appConfig.epgUrl;
                
    if (url) {
        // 1. Forza il flag di ricaricamento della UI
        window.forceEPGReload = true;

        // 2. Usa 'await' per attendere che il download e il salvataggio siano completi
        // Nota: Assicurati che autoLoadEPG sia asincrona o usa direttamente downloadEPG
        await autoLoadEPG(url, 'Default EPG');

        // 3. Notifica il sistema che deve aggiornare la lista visibile
        // Se sei nel manager EPG, aggiorna la lista; se sei nell'EPG completo, renderizza quello
        if (typeof renderEPGManager === 'function') {
            renderEPGManager(); 
        }      

    } else {
        showNotification("URL EPG non disponibile", true);
    }
});


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

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      sheet.style.transition = '';
      overlay.style.transition = '';

      if (currentTranslate > sheetHeight / 3) {
        closeFn(); // usa le funzioni esistenti
      } else {
        openFn(); // torna allo stato aperto
      }
      sheet.style.transform = ''; // reset
      overlay.style.opacity = '';
    }

    // Touch
    handle.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length === 0) return;
      startDrag(e.touches[0].clientY);
      e.preventDefault(); // necessario su iOS
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (isDragging) {
        onDrag(e.touches[0].clientY);
        e.preventDefault(); // blocca scroll nativo
      }
    }, { passive: false });

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

    // Overlay → chiusura
    overlay.addEventListener('click', closeFn);
  }

  // inizializza per entrambi i bottom sheet usando le funzioni già esistenti
  setupBottomSheetDrag('m3uUrlBottomSheet', 'bottomSheetOverlay', openBottomSheet, closeBottomSheet);
  setupBottomSheetDrag('epgUrlBottomSheet', 'bottomSheetOverlayEPG', openEPGBottomSheet, closeEPGBottomSheet);
})();


// NEW: gestione click + long-press su favoritesPill (fix: evita click dopo longpress)
(function setupFavoritesPill() {
  const pill = document.getElementById('favoritesPill');
  if (!pill) return;

  let ignoreNextClick = false;

  pill.addEventListener('click', async (e) => { // Aggiunto async per coerenza
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
    
    // 1. Cambia lo stato
    showingFavorites = !showingFavorites;
    saveViewModePreference(currentViewMode);

    // 2. --- FIX BUG CONTENITORI ---
    // Quando passiamo ai Preferiti (o torniamo a Tutti), dobbiamo assicurarci
    // di essere nella vista "Canali" e nascondere Playlist o EPG Manager.
    
    const channelCont = document.getElementById('channelListContainer');
    const playlistCont = document.getElementById('playlistListContainer');
    const epgCont = document.getElementById('epgListContainer');
    const playerCont = document.getElementById('playerContainer');

    if (playlistCont) playlistCont.classList.add('hidden');
    if (epgCont) epgCont.classList.add('hidden');
    if (playerCont) playerCont.style.display = 'none'; // Nasconde player se aperto
    if (channelCont) channelCont.classList.remove('hidden');
    
    // Ripristina titoli e controlli se erano nascosti
  document.querySelector('.main-header')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('bottomTabBar')?.classList.remove('hidden');
    
    // Segnala che non siamo più in vista playlist/epg manager
    window.isPlaylistView = false;
    window.isEPGView = false;
    // ------------------------------

    // 3. Renderizza la lista corretta
    renderGroupedChannelList(
      showingFavorites ? groupedFavoriteChannels : groupedChannels, 
      { context: 'channels' }
    );
    
    updateToggleState();
    closeFullEPG();
  });

  // Logica Long Press (Invariata, ma inclusa per completezza)
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
    }, 600); // Assicurati che PILL_LONGPRESS_MS sia definito o usa un valore
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

(function setupViewModePill() {
    const viewModePill = document.getElementById('viewModePill');
    if (!viewModePill) return;

    let viewPillMode = 'viewMode'; // 'viewMode' | 'collapseExpand'
    let expandState = true;
    let longPressTimer = null;
    const LONG_PRESS_DURATION = 600;
    let longPressFired = false;

    // --- AGGIUNTE PER COMPATIBILITÀ IPHONE (Come nel tasto Preferiti) ---
    let ignoreNextClick = false; 
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    function updateViewModePill() {
        // Pulizia totale
        viewModePill.classList.remove('collapse-mode', 'grid-mode', 'list-mode', 'is-collapsed', 'is-expanded');

        if (viewPillMode === 'viewMode') {
            viewModePill.classList.add(currentViewMode === 'grid' ? 'grid-mode' : 'list-mode');
        } else {
            viewModePill.classList.add('collapse-mode');
            viewModePill.classList.add(expandState ? 'is-expanded' : 'is-collapsed');
        }
    }

    function toggleAllGroups(expand) {
        // Seleziona tutti i container possibili
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

    viewModePill.addEventListener('click', () => {
        // --- FIX IPHONE: Se è un click fantasma dopo long press, lo ignoriamo ---
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

            // --- FIX IPHONE: Prepariamo il blocco del click successivo ---
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

    // Reset automatico quando l'utente interagisce con altro
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


// Gestore Universale "Safe" per l'espansione dei gruppi serve per ripristinare il click sui gruppi peg playlist
document.addEventListener('click', function (e) {
    const header = e.target.closest('.group-header');
    if (!header) return;

    // Se il click proviene dai canali, lasciamo che se ne occupi il codice originale
    // Se invece siamo in Playlist o EPG, interveniamo noi
    const isPlaylistOrEpg = header.closest('#playlistList, #epgList, #playlistListContainer, #epgListContainer');

    if (isPlaylistOrEpg) {
        // Blocchiamo altri eventi per evitare doppie attivazioni
        e.preventDefault();
        e.stopPropagation();

        const content = header.nextElementSibling;
        if (content && content.classList.contains('group-content')) {
            // Controlliamo lo stato attuale (tenendo conto del CSS)
            const isHidden = content.style.display === 'none' || getComputedStyle(content).display === 'none';
            
            // Applichiamo il toggle
            content.style.display = isHidden ? 'block' : 'none';

            // Aggiorniamo il simbolo + / -
            const toggleSpan = header.querySelector('.group-toggle');
            if (toggleSpan) {
                toggleSpan.textContent = isHidden ? '-' : '+';
            }

            // Salvataggio stato nel database locale
            const titleSpan = header.querySelector('.group-title span') || header.querySelector('.group-name');
            if (titleSpan) {
                const groupName = titleSpan.textContent.trim();
                groupCollapseState[groupName] = !isHidden;
                saveGroupCollapseStates();
            }
        }
    }

}, true); // Usiamo 'true' per intercettare il click all'inizio

(function setupOptionsExportPill() {
  const pill = document.getElementById('optionsExportPill');
  const optionsBtn = document.getElementById('optionsBtn');
  const exportBtn = document.getElementById('exportButton');
  if (!pill || !optionsBtn || !exportBtn) return;

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

  updatePillIcon();

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
      if (typeof renderEPGManager === 'function') renderEPGManager();
    } else {
      optionsBtn.click();
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


// Aggiungi questa funzione helper per evitare duplicazione (usa licenza)
async function handleFileUpload(file, isEPG = false) {
    
// PROTEZIONE LICENZA: Blocca caricamento se non è premium
if (!appConfig.isPremium) {
        alert("La funzione di caricamento file locali è riservata agli utenti Premium.");
        return;
    }

return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async function(e) {
        const arrayBuffer = e.target.result;
        let text;

        // 1) Se il file è .gz, decomprimilo
        if (file.name.endsWith('.gz')) {
            const blob = new Blob([arrayBuffer]);
            const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
            const decompressedResponse = new Response(decompressedStream);
            text = await decompressedResponse.text();
        } else {
            // 2) Altrimenti, converti normalmente in stringa
            const decoder = new TextDecoder('utf-8');
            text = decoder.decode(arrayBuffer);
        }

if (isEPG) {
                if (typeof closeEPGBottomSheet === 'function') closeEPGBottomSheet();
                await saveAndActivateEPG({ 
                    url: 'file:' + file.name, 
                    name: file.name, 
                    content: text 
                });
                
                try {
                    if (text.trim().startsWith('<') || text.includes('<tv>')) {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(text, "text/xml");
                        epgData = parseXMLTV(xmlDoc);
rebuildEpgMap();
                    } else {
                        epgData = JSON.parse(text);
rebuildEpgMap();
                    }
                } catch (e) {
                    console.warn('EPG parsing error:', e);
                }
                
                showNotification('EPG locale caricata e salvata.');
                if (typeof renderEPGManager === 'function') renderEPGManager();
            } else {
                if (typeof closeBottomSheet === 'function') closeBottomSheet();
                epgData = []; // Reset EPG
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
        reader.readAsArrayBuffer(file);   // invece di reader.readAsText(file)
    });
}


// funzione ricerca con contesto
function performSearch(search) {
    const query = search.toLowerCase().trim();
    const isGrid = typeof currentViewMode !== 'undefined' && currentViewMode === 'grid';
    const displayValue = isGrid ? 'flex' : '';

    // 1. CASO EPG COMPLETO (Vista programmi singolo canale)
    const fullEpgContainer = document.getElementById('fullEpgContainer');
    // Se il contenitore dell'EPG completo non ha la classe 'hidden', cerchiamo lì
    if (fullEpgContainer && !fullEpgContainer.classList.contains('hidden')) {
        const epgItems = document.querySelectorAll('#fullEpgList .channel-item');
        epgItems.forEach(item => {
            const name = (item.getAttribute('data-name') || item.textContent || '').toLowerCase();
            item.style.display = name.includes(query) ? displayValue : 'none';
        });
        return; // Fine, non serve cercare altro
    }

    // 2. CASO CANALI / PLAYLIST / MANAGER EPG (Strutture con gruppi)
    let activeId = 'channelList'; // Default
    if (window.isPlaylistView) activeId = 'playlistList';
    else if (window.isEPGView) activeId = 'epgList';

    const container = document.getElementById(activeId);
    if (!container) return;

    container.querySelectorAll('.group-content').forEach(content => {
        let matchFound = false;
        
        Array.from(content.children).forEach(child => {
            const name = (child.getAttribute('data-name') || child.textContent || '').toLowerCase();
            const isMatch = name.includes(query);
            child.style.display = isMatch ? displayValue : 'none';
            if (isMatch) matchFound = true;
        });

        // Gestione testata del gruppo
        const header = content.previousElementSibling;
        if (header && header.classList.contains('group-header')) {
            header.style.display = matchFound ? '' : 'none';
        }
        content.style.display = matchFound ? (isGrid ? 'grid' : 'block') : 'none';
    });
}


// ================================
// Event listeners 
// ================================

  function setupEventListeners() {

// Listener per click su tutto il documento
document.addEventListener('click', function(event) {
  const searchInput = document.getElementById('searchInput');
  const searchContainer = document.getElementById('headerSearchContainer');
  
  // Se il click NON è dentro il contenitore della ricerca E c'è testo nella ricerca
  if (searchContainer && !searchContainer.contains(event.target) && 
      searchInput && searchInput.value.trim() !== '') {
    
    // Svuota la ricerca
    searchInput.value = '';
    performSearch('');
  }
});

// LISTENER: Caricamento file M3U locale
// Poi sostituisci i listener dei file input:
document.getElementById('fileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) handleFileUpload(file, false);
});


// LISTENER: Caricamento per file input EPG (JS)
document.getElementById('epgFileInput')?.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) handleFileUpload(file, true);
});


// Listener per il nuovo pulsante dentro la finestra Playlist
const m3uInsideBtn = document.getElementById("M3UButtonInside");
if (m3uInsideBtn) {
  m3uInsideBtn.addEventListener("click", () => {
    document.getElementById("fileInput").click();
  });
}


// LISTENER: Esporta playlist
document.getElementById('exportButton').addEventListener('click', async () => {
  // Usa la lista da esportare in base allo stato showingFavorites
  closeFullEPG(); 
 const exportList = showingFavorites ? favoriteChannels : channels;
  const m3uContent = generateM3UFromChannels(exportList);

  //  qui aspetti il risultato
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


// LISTENER: Reset della playlist (modificato per resettare anche i preferiti)
document.getElementById('resetListBtn').addEventListener('click', async () => {
     
// Rimuovi selettivamente solo i settings.
    KEYS_TO_RESET.forEach(key => {
        localStorage.removeItem(key);
    });

// A. GESTIONE METADATI (DEFAULT: SPENTO)
    localStorage.setItem("zappone_show_metadata", "false");
    localStorage.setItem("metadataExpanded", "false");

    const metaToggle = document.getElementById("toggleMetadata");
    if (metaToggle) metaToggle.checked = false;

    const metaHeader = document.getElementById("metadataHeader");
    const metaContainer = document.getElementById("metadataContainer");
    
    if (metaHeader) metaHeader.style.display = "none";
    if (metaContainer) {
        metaContainer.style.display = "none";
        metaContainer.classList.remove("expanded");
        const metaContent = document.getElementById("metadataContent");
        if (metaContent) metaContent.innerHTML = "";
    }

    // Reset variabile globale metadati
    metadataExpanded = false;

// B. GESTIONE EPG (GUIDA CANALI) (DEFAULT: SPENTO)
    localStorage.setItem("zappone_show_epg", "false");

    // Spegni il toggle EPG nella sidebar
    const epgToggle = document.getElementById("toggleEPG");
    if (epgToggle) epgToggle.checked = false;

    // Nascondi fisicamente gli elementi EPG sotto il player
    const epgHeader = document.getElementById("epgHeader");
    const epgContainer = document.getElementById("epgContainer");
    const epgContent = document.getElementById("epgContent");

    if (epgHeader) epgHeader.style.display = "none";
    if (epgContainer) epgContainer.style.display = "none";
    
    // Opzionale: pulisci il contenuto per sicurezza
    if (epgContent) epgContent.innerHTML = "";

// C. GESTIONE SCHERMO INTERO AUTOMATICO (iOS) (DEFAULT: ATTIVATO)
    localStorage.setItem("zappone_auto_fullscreen", "true"); 

    // Aggiorna lo stato visivo del toggle nella sidebar a "acceso"
    const iosFullscreenToggle = document.getElementById("autoFullscreenToggle"); 
    if (iosFullscreenToggle) {
        iosFullscreenToggle.checked = true; // Forza il toggle a "acceso"
    }

// D. GESTIONE MOSTRA URL PLAYLIST/EPG (DEFAULT: SPENTO)
    localStorage.setItem("zappone_show_playlist_url", "false"); 

    // Aggiorna lo stato visivo del toggle nella sidebar a "spento"
    const showUrlToggle = document.getElementById("showPlaylistUrl"); 
    if (showUrlToggle) {
        showUrlToggle.checked = false; 
    }

// E.  RESETTA LO STATO DELL'APPLICAZIONE
    showingFavorites = false;
    currentViewMode = 'list';
    groupCollapseState = {};
    favoriteGroupCollapseState = {};

    // Resetta gli array dei canali
    channels = [];
    groupedChannels = [];
    
    // Resetta canale corrente
    window.currentChannelUrl = null;

    showNotification("Memoria e settings resettati");

    // Prima di ricaricare, segnaliamo che le liste devono essere ricostruite da zero
    window.forcePlaylistReload = true;
    window.forceEPGReload = true;

// F.  Ricarica la playlist remota predefinita
    await loadRemoteM3U(DEFAULT_PLAYLIST_URL, true);
    
    // Forza il ricaricamento delle interfacce (se l'utente è in vista playlist o epg)
    if (typeof refreshPlaylistUIs === 'function') {
        refreshPlaylistUIs();
    }

    updateButtons();
});


// LISTENER: Input di ricerca e pulsante di cancellazione
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
  const search = e.target.value.toLowerCase();
  clearTimeout(searchTimeout);
  
  searchTimeout = setTimeout(() => {
    performSearch(search);
  }, 150); //  Debouncing di 150ms
});


// LISTENER: Toggle modalità radio
document.getElementById('radioToggle').addEventListener('change', function() {
  const isRadioMode = this.checked;
  
  // Solo se c'è un canale ATTIVAMENTE in riproduzione (non solo in memoria)
  const video = document.getElementById('player');
  const audio = document.getElementById('audioPlayer');
  const isCurrentlyPlaying = (video && !video.paused) || (audio && !audio.paused);
  
  if (window.currentChannelUrl && isCurrentlyPlaying) {
    // Cerca il canale sia nella lista principale che nei preferiti
    let currentChannel = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    if (!currentChannel && showingFavorites) {
      currentChannel = favoriteChannels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    }
    
    if (currentChannel) {
      playStream(currentChannel, showingFavorites);
    }
  } else {
    // Altrimenti, solo feedback visivo
    if (isRadioMode) {
      showNotification("Modalità radio attivata", false);
    } else {
      showNotification("Modalità video attivata", false);
    }
    
    // Salva la preferenza per le prossime riproduzioni
    localStorage.setItem('zappone_radio_mode', isRadioMode.toString());
  }
});


// LISTENER: Navigazione canale precedente
document.getElementById('prevBtn').addEventListener('click', () => {
    navigateChannels('prev', showingFavorites);
});


// LISTENER: Navigazione canale successivo
document.getElementById('nextBtn').addEventListener('click', () => {
    navigateChannels('next', showingFavorites);
});


// LISTENER: Torna alla lista dei canali
document.getElementById('backButton').addEventListener('click', () => {
    // 1. Pulizia immediata stati EPG
    if (typeof closeFullEPG === 'function') closeFullEPG();
    
    // 2. CAMBIO UI IMMEDIATO (Percezione di velocità)
    const channelListCont = document.getElementById('channelListContainer');
    const playerCont = document.getElementById('playerContainer');
    
    if (channelListCont) channelListCont.style.display = 'block';
    if (playerCont) playerCont.style.display = 'none';

    // Ripristina la visibilità delle barre di sistema e del titolo
document.querySelector('.main-header')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('bottomTabBar')?.classList.remove('hidden');

    // 3. RECUPERO STATO (Siamo nei preferiti o in tutti i canali?)
    const lastUrl = localStorage.getItem('zappone_last_played');
    const lastFromFavorites = localStorage.getItem('zappone_last_played_from_favorites') === 'true';
    
    // Sincronizziamo la variabile globale 'showingFavorites' basandoci sull'ultimo canale visto
    if (lastUrl) {
        // Verifica se il canale esiste ancora nella mappa corrispondente
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

    // --- LOGICA DI (EARLY RETURN) ---
    // Se la lista è già popolata e la modalità coincide, non ricarichiamo il DOM
    if (channelList && channelList.children.length > 0 && lastRenderedMode === currentViewMode) {
        console.log("Back: Lista già presente, eseguo solo scorrimento fluido.");
        
        window.isPlaylistView = false;
        window.isEPGView = false;

        // Eseguiamo l'evidenziazione e lo scroll dopo un brevissimo delay
        setTimeout(() => {
            if (window.currentChannelUrl) {
                // CSS.escape è fondamentale per gestire i caratteri speciali degli URL nelle query
                const escapedKey = CSS.escape(window.currentChannelUrl);
                const target = channelList.querySelector(`[data-key="${escapedKey}"]`);
                
                if (target) {
                    // Pulizia classi attive precedenti
                    document.querySelectorAll('.active-channel').forEach(el => el.classList.remove('active-channel'));
                    
                    // Nuova evidenziazione
                    target.classList.add('active-channel');
                    
                    // SCORRIMENTO FLUIDO E CENTRATO
                    target.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center' 
                    });
                }
            }
        }, 100);

        return; 
    }

    // LOGICA DI RENDERING COMPLETO (FALLBACK)
    // Se arriviamo qui significa che la lista non c'è o è cambiata
    try {
        window.isPlaylistView = false;
        window.isEPGView = false;

        // Usiamo requestAnimationFrame per non bloccare il thread UI durante il rendering
        requestAnimationFrame(() => {
            renderGroupedChannelList(
                showingFavorites ? groupedFavoriteChannels : groupedChannels, 
                { context: 'channels' }
            );
            
            // In questa modalità lo scroll avverrà all'interno di finalizeRendering 
            // della funzione renderGroupedChannelList
        });

    } catch (err) {
        console.error('Errore durante il ritorno alla lista:', err);
        // Fallback estremo: mostra tutto
        showingFavorites = false;
        if (typeof updateToggleState === 'function') updateToggleState();
        renderGroupedChannelList(groupedChannels, { context: 'channels' });
    }
});


// LISTENER: Modifica nome canale
    document.getElementById('currentChannelName').addEventListener('blur', saveChannelName);
    document.getElementById('currentChannelName').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
      }
    });


// LISTENER: Toggle sezione EPG
document.getElementById('epgHeader').addEventListener('click', toggleEPG);

// Click sul logo del canale → apre/chiude EPG
// Recuperiamo l'elemento logo
const logoBtn = document.getElementById('currentChannelLogo');

// Se l'elemento esiste, impostiamo il cursore e il listener
if (logoBtn) {
  // 1. QUESTA È LA RIGA CHE AGGIUNGE LA MANINA
  logoBtn.style.cursor = 'pointer'; 

  // 2. Aggiungiamo il listener
  logoBtn.addEventListener('click', () => {
    const epgToggle = document.getElementById('toggleEPG');
    const epgContent = document.getElementById('epgContent');

    // Se non trovi elementi, fallback al vecchio comportamento
    if (!epgToggle || !epgContent) {
      toggleEPG();
      return;
    }

    // se il toggle è OFF -> dobbiamo forzarlo ON e ricordarci che l'abbiamo fatto
    if (!epgToggle.checked) {
      // marca che il toggle è stato forzato da click sul logo
      epgToggle.dataset.logoForced = 'true';

      // abilita il toggle (aggiorna localStorage ecc. tramite onchange handler)
      epgToggle.checked = true;
      epgToggle.dispatchEvent(new Event('change'));

      // assicurati che l'EPG sia visibile: se è collassato, aprilo
      if (epgContent.style.display === 'none') {
        // toggleEPG apre il drawer/collasso, quindi chiamiamolo per mostrare il contenuto
        toggleEPG();
      }

      return;
    }

    // se il toggle era già ON -> comportamento normale: apri/chiudi EPG
    toggleEPG();

    // se abbiamo precedentemente forzato il toggle ON con il logo (dataset.logoForced === 'true')
    // e l'EPG risulta ora chiuso, ripristiniamo il toggle nello stato originale (OFF)
    if (epgToggle.dataset.logoForced === 'true') {
      // epgContent.style.display === 'none' significa che abbiamo chiuso l'EPG con questo click
      if (epgContent.style.display === 'none') {
        epgToggle.checked = false;
        epgToggle.dispatchEvent(new Event('change'));
        epgToggle.dataset.logoForced = 'false';
        delete epgToggle.dataset.logoForced;
      }
    }
  });
}


// LISTENER: Toggle sezione metadati
document.getElementById('metadataHeader').addEventListener('click', function() {
  metadataExpanded = !metadataExpanded;
  localStorage.setItem('metadataExpanded', metadataExpanded.toString());
  updateMetadataContainerState();

  if (metadataExpanded && window.currentChannelUrl) {
    const currentChannel = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    if (currentChannel) {
        // Sostituisce sempre i metadati esistenti
        showChannelMetadata(currentChannel);
    }
  }
});

// Click sul NOME DEL GRUPPO → comportamento esteso (analogo al Logo/EPG)
const groupLabel = document.getElementById('currentChannelGroup');

if (groupLabel) {
  // Feedback visivo
  groupLabel.style.cursor = 'pointer';
  groupLabel.title = "Mostra/Nascondi dettagli";

  groupLabel.addEventListener('click', () => {
    const metaToggle = document.getElementById('toggleMetadata');
    
    // Funzione helper per caricare i dati se apriamo il pannello
    const loadDataIfNeeded = () => {
       if (window.currentChannelUrl) {
         let ch = channels.find(c => getChannelKey(c) === window.currentChannelUrl);
         if (!ch && showingFavorites) {
           ch = favoriteChannels.find(c => getChannelKey(c) === window.currentChannelUrl);
         }
         if (ch) showChannelMetadata(ch);
       }
    };

    // CASO 1: Il toggle è SPENTO -> Lo attiviamo temporaneamente
    if (metaToggle && !metaToggle.checked) {
      // 1. Marca che è stato forzato da questo click
      metaToggle.dataset.groupForced = 'true';

      // 2. Abilita il toggle (scatena l'evento change per aggiornare UI header)
      metaToggle.checked = true;
      metaToggle.dispatchEvent(new Event('change'));

      // 3. Se il pannello è chiuso, aprilo subito
      if (!metadataExpanded) {
        metadataExpanded = true;
        localStorage.setItem('metadataExpanded', 'true');
        updateMetadataContainerState();
        loadDataIfNeeded();
      }
      return;
    }

    // CASO 2: Il toggle è già ACCESO -> Comportamento normale (apri/chiudi)
    metadataExpanded = !metadataExpanded;
    localStorage.setItem('metadataExpanded', metadataExpanded.toString());
    updateMetadataContainerState();

    if (metadataExpanded) {
      loadDataIfNeeded();
    }

    // CASO 3: Ripristino (se era stato forzato e ora stiamo chiudendo)
    if (metaToggle && metaToggle.dataset.groupForced === 'true') {
      // Se abbiamo appena chiuso il pannello (!metadataExpanded)
      if (!metadataExpanded) {
        metaToggle.checked = false;
        metaToggle.dispatchEvent(new Event('change'));
        delete metaToggle.dataset.groupForced;
      }
    }
  });
}


// LISTENER: Aggiungi nuovo canale
document.getElementById('addChannelBtn').addEventListener('click', async function() {
  if (!window.currentChannelUrl) return;

  // determine which list is currently visible
  const targetList = showingFavorites ? favoriteChannels : channels;

  // find the current channel in that list by key
  const currentChannel = targetList.find(ch => getChannelKey(ch) === window.currentChannelUrl);
  if (!currentChannel) return;

  // make independent copy and make URL unique
  const newChannel = {
    ...currentChannel,
    name: currentChannel.name + ' ⧉',
    url: currentChannel.url + '?copy=' + Date.now()
  };

  if (showingFavorites) {
    // duplicate inside favorites
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
    // duplicate inside main playlist
    channels.push(newChannel);
    groupedChannels = groupChannels(channels);
    
    rebuildIndexMaps();

    // persist the changed m3u content to the active playlist record
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

    renderGroupedChannelList(groupedChannels, { context: 'playlists' });

  }

  showNotification('Canale duplicato con successo!');
  playStream(newChannel, showingFavorites);
});


// LISTENER Gestione dark light mode
const themeToggle = document.getElementById('themeToggle');
const root = document.documentElement;

const savedTheme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
if (savedTheme === 'dark') {
  root.classList.add('dark-theme');
  if (themeToggle) themeToggle.checked = true;
} else {
  root.classList.remove('dark-theme');
  if (themeToggle) themeToggle.checked = false;
}

// PATCH: Cambio tema istantaneo senza lag ===
themeToggle.addEventListener('change', () => {
  const isDark = themeToggle.checked;

  // disabilita transizioni globali per lo switch
  document.documentElement.classList.add('disable-transitions');

  // applica il tema
  if (isDark) {
    root.classList.add('dark-theme');
  } else {
    root.classList.remove('dark-theme');
  }

  // salva preferenza
  localStorage.setItem('theme', isDark ? 'dark' : 'light');

  // rimuove il blocco transizioni dopo un frame
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('disable-transitions');
  });
});

// se hai un themeToggleSidebar => sincronizzalo
const themeToggleSidebar = document.getElementById('themeToggleSidebar');
if (themeToggleSidebar) {
  themeToggleSidebar.checked = themeToggle.checked;
  themeToggleSidebar.onchange = () => themeToggle.click();
}


// LISTENER: Setup degli event listener per il bottom sheet
const playlistSheet = document.getElementById('m3uUrlBottomSheet');
const playlistClose = playlistSheet && playlistSheet.querySelector('.bottom-sheet-close, .bottom-sheet-close-epg');
playlistClose?.addEventListener('click', closeBottomSheet);
document.getElementById('bottomSheetOverlay')?.addEventListener('click', closeBottomSheet);

// Gestione del pulsante Conferma nel bottom sheet
document.getElementById("modalConfirm").addEventListener("click", async function() {
    const name = document.getElementById("modalM3UName").value.trim();
    const playlistUrl = document.getElementById("modalM3UUrl").value.trim();
    
    if (!name || !playlistUrl) {
        alert("Inserisci sia nome che URL.");
        return;
    }

    try {
        const text = await downloadM3U(playlistUrl);

        const rec = await saveAndActivateM3U({
            url: playlistUrl,
            name,
            content: text
        });

        await parseM3U(rec.content, true);
        
        // --- LOGICA DI RESET PER FORZARE IL RENDERING ---
        showingFavorites = false;
        window.isPlaylistView = false;

        // Reset dell'attributo nel DOM: questo "smonta" l'ottimizzazione di showChannelList
        const channelList = document.getElementById('channelList');
        if (channelList) {
            channelList.setAttribute('data-view-mode', 'reset'); 
            // 'reset' è diverso da 'all', quindi showChannelList renderizzerà sicuramente
        }

        // Ora chiamiamo showChannelList senza modifiche alla funzione stessa
        if (typeof showChannelList === 'function') {
            await showChannelList();
        }
        // ------------------------------------------------

        updateButtons();
        refreshPlaylistUIs();
        closeBottomSheet();
    } catch (err) {
        alert("Errore nel caricamento da URL");
        console.error(err);
    }
});

// setup listeners bottom-sheet EPG
// EPG - bind dentro il foglio epg (cerca entrambe le classi possibili)
const epgSheet = document.getElementById('epgUrlBottomSheet');
const epgClose = epgSheet && (epgSheet.querySelector('.bottom-sheet-close-epg') || epgSheet.querySelector('.bottom-sheet-close'));
epgClose?.addEventListener('click', closeEPGBottomSheet);
document.getElementById('bottomSheetOverlayEPG')?.addEventListener('click', closeEPGBottomSheet);


document.getElementById("modalConfirmEPG")?.addEventListener("click", async function() {
  const name = document.getElementById("modalEPGName").value.trim();
  const epgUrlValue = document.getElementById("modalEPGUrl").value.trim();
  if (!name || !epgUrlValue) { 
    alert("Inserisci sia nome che URL."); 
    return; 
  }
  try {
    // scarica EPG (assegna epgData e restituisce i dati parsati)
    const data = await downloadEPG(epgUrlValue);

    // salva direttamente in IndexedDB
    const rec = await saveAndActivateEPG({ 
      url: epgUrlValue, 
      name, 
      content: JSON.stringify(data) 
    });

    showNotification('EPG salvato e caricato');
    closeEPGBottomSheet();

    // aggiorna la UI se la nuova vista EPG è aperta
    if (typeof renderEPGManager === 'function') renderEPGManager();

  } catch (err) {
    console.error(err);
    alert('Errore nel caricamento EPG da URL.');
  }
});


// Tab bar: wiring dei pulsanti (del bottomsheet?)
const tabAddBtn = document.getElementById('tabAddM3U');
if (tabAddBtn) {
  tabAddBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // usa la funzione già esistente che apre il bottomsheet M3U
    if (typeof openBottomSheet === 'function') openBottomSheet();
    else console.warn('openBottomSheet non trovata');
  });
}


// LISTENER PULSANTI FISSI IN BASSO 

// LISTENER: Pulsante per visualizzare le playlist
document.getElementById('playlistsBtn').addEventListener('click', async () => {
    try {
       
 // Nascondi tutti i container speciali
    document.getElementById('fullEpgContainer')?.classList.add('hidden');
    document.getElementById('epgListContainer')?.classList.add('hidden');

 await renderPlaylistList(); // Questa funzione ora gestisce la visibilità
    } catch (err) {
        console.error('renderPlaylistList failed', err);
        // In caso di errore, torna ai canali
        await showChannelList();
    }
});


// LISTENER PULSANTE Torna alla lista dei canali da qualsiasi schermata
const tabBackBtn = document.getElementById('tabBackToChannels');
if (tabBackBtn) {
  tabBackBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Forza la visualizzazione della lista principale (non preferiti)
    showingFavorites = false;
    
    // Nascondi tutti i container speciali
    document.getElementById('fullEpgContainer')?.classList.add('hidden');
    document.getElementById('playlistListContainer')?.classList.add('hidden');
    document.getElementById('epgListContainer')?.classList.add('hidden');
    
    // Mostra i canali (sempre lista principale)
    await showChannelList();
    
    // Aggiorna lo stato del toggle per riflettere il cambiamento
    updateToggleState();
  });
}


// LISTENER PULSANTE avvia l'ultimo canale riprodotto
const tabRenderBtn = document.getElementById('tabRenderLastChannel');
if (tabRenderBtn) {
  tabRenderBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // --- MODIFICA: Pulizia UI prima di avviare il canale ---
    closeFullEPG();
    document.getElementById('fullEpgContainer')?.classList.add('hidden');
    document.getElementById('playlistListContainer')?.classList.add('hidden');
    document.getElementById('epgListContainer')?.classList.add('hidden');
    document.getElementById('channelListContainer')?.classList.add('hidden');
    // Mostriamo il player container perché stiamo per riprodurre un video
    document.getElementById('playerContainer').style.display = 'block';
    // -------------------------------------------------------

    // 1) prendi ultimo URL e l'informazione se era preferito
const lastUrl = localStorage.getItem('zappone_last_played');
const lastWasFavorite = localStorage.getItem('zappone_last_played_from_favorites') === 'true';

if (!lastUrl) {
    if (typeof showNotification === 'function') showNotification('Nessun canale riprodotto ancora', true);
    return;
}

try {
    // MODIFICA QUI: Sincronizziamo subito lo stato globale
    showingFavorites = lastWasFavorite;
    if (typeof updateToggleState === 'function') updateToggleState();

    // Cerchiamo il canale nella lista corretta
    let found = getChannelByUrl(lastUrl, showingFavorites);
    
    // Se non lo trova nella lista prevista (magari è stato rimosso dai pref), prova l'altra
    if (!found) {
        found = getChannelByUrl(lastUrl, !showingFavorites);
        if (found) {
            showingFavorites = !showingFavorites; // Inverti lo stato se trovato nell'altra lista
            if (typeof updateToggleState === 'function') updateToggleState();
        }
    }

    if (found) {
        playStream(found, showingFavorites); // Ora passa lo stato corretto
        return;
    }

// 4) fallback: riproduzione diretta
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


// LISTENER: Pulsante Download EPG
document.getElementById('downloadEpgBtn').addEventListener('click', async () => {
    try {
        await renderEPGManager(); // Mostra la lista EPG salvati
    } catch (err) {
        console.error('renderEPGManager failed', err);
        // In caso di errore, torna ai canali
        await showChannelList();
    }
});


// LISTENER: Pulsante "EPG Completo"
document.getElementById('fullEpgBtn').addEventListener('click', () => {
    // Salva che stiamo andando al full EPG dalla vista canali
    localStorage.setItem('lastViewBeforeFullEPG', 'channels');
    
    // NASCONDI TUTTI I CONTAINER PRINCIPALI
    document.getElementById('channelListContainer').classList.add('hidden');
    document.getElementById('playerContainer').classList.add('hidden');
    document.getElementById('playlistListContainer').classList.add('hidden'); // AGGIUNTO
    document.getElementById('epgListContainer').classList.add('hidden'); // AGGIUNTO
    
    // Mostra solo il container Full EPG
    document.getElementById('fullEpgContainer').classList.remove('hidden');
    renderFullEPGList();
});


};  // <-- chiusura event listener

// ================================
// INIZIALIZZAZIONE APPLICAZIONE
// ================================

async function initializeApp() {
    try {
        // Operazioni parallele
        await Promise.all([
            getDB(),
            loadFavorites(),
            loadM3UUrlList()
        ]);

        const preferences = loadViewModePreference();
        currentViewMode = preferences.mode;
        showingFavorites = (favoriteChannels.length > 0) ? preferences.showFav : false;

        //  Mostra UI immediatamente
        await renderPlaylistList();

        //  Caricamenti in background con priorità
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

setupInputBehavior('searchInput');
        setupDragAndDropDelegation();   // ← una sola volta, all'avvio
        updateButtons();
        setupSwipeHandlers();

    } catch (error) {
        console.error('Initialization error:', error);
        await renderPlaylistList();
    }
}


// =============================================
// AVVIO APPLICAZIONE
// =============================================

// Service Worker per PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('[SW] Registered successfully:', reg))
            .catch(err => console.error('[SW] Registration failed:', err));
    });
}

// USO: all'avvio dell'app

// Blocca zoom su iOS
document.addEventListener('gesturestart', (e) => e.preventDefault());

document.addEventListener('DOMContentLoaded', async () => {

// 1. Inizializza i pulsanti e i listener
    setupEventListeners();

// 2. Tenta il recupero della configurazione dal server (Licenza/URL)
    await getConfigFromServer();

// 3. Inizializza il database locale, carica i preferiti e l'ultima vista
    await initializeApp();

// 5. Feedback all'utente (usiamo appConfig per sicurezza)
    if (appConfig.isPremium) {
        showNotification("ZappOne Premium Attivo! V24.04");
    } else {
        showNotification("Modalità Demo attiva", false);
    }
});


