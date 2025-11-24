

  (function() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark-theme');
    }
  })();



if (!/iP(hone|od|ad).+Version\/\d+.+Safari/i.test(navigator.userAgent)) {
  const script = document.createElement('script');
  script.src = 'https://cdn.dashjs.org/latest/dash.all.min.js';
  script.async = false; // se vuoi mantenerlo parser-blocking come prima
  document.head.appendChild(script);
}





// 1. Variabili globali dell'applicazione

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
let metadataExpanded =
  localStorage.getItem('metadataExpanded') === 'true';

// --- EPG (guida programmi) ---
let epgData = [];
let epgUrl = "https://tvit.leicaflorianrobert.dev/epg/list.xml";

// --- Riproduzione HLS ---
window.currentChannelUrl = null;
window.hlsInstance = null;

// --- Playlist M3U (default) ---
let DEFAULT_PLAYLIST_URL =
  'https://lumo250.github.io/ZappOne/tivustream_list.m3u';

// --- Database / storage ---
const favoriteKeys = new Set();

// --- Proxy CORS per il download delle playlist ---     
const M3U_PROXIES = [
     {  base:    "https://primo-project.netlify.app/.netlify/functions/cors-proxy?url=",  encode: true },
  { base: "https://api.allorigins.win/raw?url=", encode: true },
  { base: "https://cors-anywhere.herokuapp.com/", encode: false },
  { base: "https://api.codetabs.com/v1/proxy/?quest=", encode: false },
  { base: "https://yacdn.org/proxy/", encode: false },
  { base: "https://corsproxy.io/?", encode: true },
  { base: "", encode: false }
];

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

function enterDeletionMode() {
  if (deletionMode) return;
  deletionMode = true;
  const pill = document.getElementById('favoritesPill');
  if (pill) pill.classList.add('delete-mode');

  // mostra tutti i delete-button nella list view
  document.querySelectorAll('#channelList .channel-item.list .delete-channel').forEach(btn => {
    btn.classList.add('visible');
  });
}

function exitDeletionMode() {
  if (!deletionMode) return;
  deletionMode = false;
  const pill = document.getElementById('favoritesPill');
  if (pill) pill.classList.remove('delete-mode');

  // nascondi tutti i delete-button
  document.querySelectorAll('#channelList .channel-item .delete-channel').forEach(btn => {
    btn.classList.remove('visible');
  });
}

function toggleDeletionMode() {
  if (deletionMode) exitDeletionMode();
  else enterDeletionMode();
}


// 2. Funzioni principali

// FUNZIONE: Verifica la licenza tramite API Gumroad (attualmente disabilitata)  
/*
 async function checkLicense(licenseKey) {
    // Chiave di prova accettata sempre
    if (licenseKey === "Siculo4235") {
      return true;
    }

    // Verifica reale con API Gumroad
    try {
      const response = await fetch("https://api.gumroad.com/v2/licenses/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_permalink: "zappone", // Cambia con il tuo permalink prodotto Gumroad
          license_key: licenseKey
        })
      });

      const data = await response.json();
      return data.success === true;
    } catch (e) {
      alert("Errore nella verifica licenza: " + e.message);
      return false;
    }
  }

  async function promptLicenseAndCheck() {
  
let licenseKey = localStorage.getItem("zappone_license");
    if (!licenseKey) {
      licenseKey = prompt("Inserisci il codice licenza Gumroad:");
      if (!licenseKey) {
        alert("Devi inserire un codice licenza per usare l'app.");
        return false;
      }
    }

    const valid = await checkLicense(licenseKey);
    if (valid) {
      localStorage.setItem("zappone_license", licenseKey);
      return true;
    } else {
      alert("Licenza non valida. Riprova.");
      localStorage.removeItem("zappone_license");
      return false;
    }
  }
 
*/


// FUNZIONE BASE: scarica M3U da URL usando proxy multipli
async function fetchM3UWithProxies(url) {
  const requests = M3U_PROXIES.map(proxy => {
    const proxyUrl = proxy.encode
      ? proxy.base + encodeURIComponent(url)
      : proxy.base + url;

    return fetch(proxyUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        if (!text.includes('#EXTM3U') && !text.includes('#EXTINF')) {
          throw new Error('Not a valid M3U file');
        }
        return text;
      });
  });

  return Promise.any(requests);
}


// FUNZIONE: Scarica M3U e restituisce solo il testo
async function downloadM3U(url) {
  return fetchM3UWithProxies(url);
}


// FUNZIONE: Scarica e attiva subito una playlist M3U
async function loadRemoteM3U(url, closeAfter = false) {
 // ✅ Chiudi il bottom sheet se richiesto
    if (closeAfter && typeof closeBottomSheet === 'function') {
      closeBottomSheet();
    }  

try {
    const text = await fetchM3UWithProxies(url);

    // Salva/aggiorna in IndexedDB e imposta come attiva
    await saveAndActivateM3U({
      url,
      name: url.split('/').pop(),
      content: text
    });

    // Parsing e update UI
    await parseM3U(text, true);
    updateButtons();

    // ✅ CORREZIONE: Esci SEMPRE dalla vista playlist e mostra i canali
    window.isPlaylistView = false;
    if (typeof showChannelList === 'function') {
      showChannelList();
    }

    // ✅ Aggiorna le UI delle playlist
    refreshPlaylistUIs();

    showNotification("Playlist predefinita caricata con successo");

  } catch (err) {
   
    // ✅ Chiudi il bottom sheet anche in caso di errore, se richiesto
    if (closeAfter && typeof closeBottomSheet === 'function') {
      closeBottomSheet();

 console.error("Tutti i proxy hanno fallito:", err);
    showNotification("Errore nel caricamento playlist: impossibile scaricare la lista", true);

    }
  }
}


// FUNZIONE: Parsing della playlist M3U (OTTIMIZZATA con Web Worker)
async function parseM3U(text, loadEPG = true, shouldRender = true) {
    try {
        const parsedData = await parseM3UInWorker(text);
        
        // Aggiornamento stato (sempre)
        channels = parsedData.validChannels;
        groupedChannels = groupChannels(channels);
        rebuildIndexMaps();

        // ✅ Render SOLO se richiesto
        if (shouldRender) {
            requestAnimationFrame(() => {
                renderGroupedChannelList(
                    showingFavorites ? getFilteredGroupedChannels() : groupedChannels,
                    { context: 'channels' }
                );
                updateToggleState();
            });
        }

        // ✅ EPG in background COMUNQUE
        if (loadEPG && parsedData.headerLine) {
            await handleEPGLoading(parsedData.headerLine);
        }

    } catch (error) {
        console.error("Errore nel parsing M3U:", error);

        showNotification("Errore nel parsing della playlist", true);
        
        // Fallback: canali vuoti
        channels = [];
        groupedChannels = [];
        renderGroupedChannelList(groupedChannels, { context: 'channels' });
    }
}


// FUNZIONE HELPER: Gestione EPG separata
async function handleEPGLoading(headerLine) {
    const REGEX = { EPG: /x-tvg-url="(.*?)"/i };
    const epgMatch = headerLine.match(REGEX.EPG);
    
    if (epgMatch) {
        const epgUrls = epgMatch[1].split(',').map(u => u.trim());
        
        const results = await Promise.allSettled(epgUrls.map(async epgUrl => {
            const originalShowNotification = window.showNotification;
            
            try {
                // PRIMA controlla se l'EPG è già in IDB
                const existingEPG = await findEPGByUrl(epgUrl);
                if (existingEPG) {
                    console.log(`EPG già presente in IDB: ${epgUrl}`);
                    return { url: epgUrl, success: true, fromCache: true };
                }
                
                // Solo se non esiste in IDB, scarica da remoto
                window.showNotification = () => {};
                await downloadEPG(epgUrl);
                return { url: epgUrl, success: true, fromCache: false };
            } catch (err) {
                return { url: epgUrl, success: false, error: err.message };
            } finally {
                window.showNotification = originalShowNotification;
            }
        }));
        
        const fromDownload = results.filter(r => r.status === 'fulfilled' && r.value.success && !r.value.fromCache).length;
        if (fromDownload > 0) {
            showNotification(`${fromDownload} EPG scaricati automaticamente`);
        }
    }
}


// FUNZIONE: Web Worker per parsing M3U non bloccante
function parseM3UInWorker(text) {
    return new Promise((resolve, reject) => {
        // Crea worker inline per evitare file esterni
        const workerCode = `
            const REGEX = {
                EXTINF: /^#EXTINF:/,
                EXTGRP: /^#EXTGRP:/,
                EXTVLCOPT: /^#EXTVLCOPT:/,
                NAME: /,(.*)$/,
                GROUP: /tvg-group="(.*?)"|group-title="(.*?)"/,
                LOGO: /tvg-logo="(.*?)"/,
                URL: /^https?:\\/\\//,
                EPG: /x-tvg-url="(.*?)"/i
            };

            function parseM3U(text) {
                const lines = text.split('\\n');
                const headerLine = lines[0] || '';
                const validChannels = [];
                const groupOrder = new Map();
                let currentGroup = "Generale";
                let channelCount = 0;
                let groupCount = 0;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('#EXTzappone-FAV')) continue;

                    if (REGEX.EXTINF.test(line)) {
                        const name = line.match(REGEX.NAME)?.[1]?.trim() || 'Unnamed Channel';
                        const groupMatch = line.match(REGEX.GROUP);
                        const logo = line.match(REGEX.LOGO)?.[1] || null;

                        if (groupMatch) {
                            currentGroup = groupMatch[1] || groupMatch[2] || currentGroup;
                            if (!groupOrder.has(currentGroup)) {
                                groupOrder.set(currentGroup, groupCount++);
                            }
                        }

                        // ✅ Gestione robusta EXTVLCOPT (ottimizzata)
                        let urlIndex = i + 1;
                        while (urlIndex < lines.length && REGEX.EXTVLCOPT.test(lines[urlIndex]?.trim())) {
                            urlIndex++;
                        }
                        
                        const url = lines[urlIndex]?.trim();
                        i = urlIndex;

                        if (url && REGEX.URL.test(url)) {
                            validChannels.push({
                                name, logo, url,
                                group: currentGroup,
                                isGroupHeader: false,
                                groupOrder: groupOrder.get(currentGroup) || 0
                            });
                            channelCount++;
                        }
                    } 
                    else if (REGEX.EXTGRP.test(line)) {
                        currentGroup = line.substring(8).trim();
                        if (!groupOrder.has(currentGroup)) {
                            groupOrder.set(currentGroup, groupCount++);
                        }
                    }
                }

                return { 
                    validChannels, 
                    channelCount, 
                    groupCount, 
                    headerLine 
                };
            }

            self.addEventListener('message', function(e) {
                try {
                    const result = parseM3U(e.data.text);
                    self.postMessage({ success: true, ...result });
                } catch (error) {
                    self.postMessage({ 
                        success: false, 
                        error: error.message 
                    });
                }
            });
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        
        worker.postMessage({ text });
        
        worker.onmessage = function(e) {
            worker.terminate();
            if (e.data.success) {
                resolve(e.data);
            } else {
                reject(new Error(e.data.error));
            }
        };
        
        worker.onerror = function(error) {
            worker.terminate();
            reject(error);
        };
        
        // Timeout di sicurezza
        setTimeout(() => {
            worker.terminate();
            reject(new Error('Timeout nel parsing M3U'));
        }, 30000); // 30 secondi timeout
    });
}


// FUNZIONE: Raggruppa i canali per categoria
function groupChannels(channels) {
      const groups = {};
      const groupOrder = {};
      
      channels.forEach((channel, index) => {
        if (!groups[channel.group]) {
          groups[channel.group] = {
            name: channel.group,
            logo: null,
            channels: [],
            order: channel.groupOrder !== undefined ? channel.groupOrder : Object.keys(groups).length
          };
        }
        groups[channel.group].channels.push(channel);
      });
      
      // Ordina i gruppi mantenendo l'ordine originale
      return Object.values(groups).sort((a, b) => a.order - b.order);
    }


// FUNZIONE: Genera chiavi canali
function getChannelKey(channel) {
   return `${channel.name}@@${channel.url}@@${channel.group || ''}`;
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


// FUNZIONE: Filtra i canali in base ai preferiti
function getFilteredGroupedChannels() {
  if (!showingFavorites) return groupedChannels;

  // favoriteKeys è già una Set popolata da loadFavorites()
  const favSet = favoriteKeys instanceof Set ? favoriteKeys : new Set(Array.from(favoriteKeys || []));

  return groupedChannels
    .map(group => ({
      ...group,
      channels: group.channels.filter(ch => favSet.has(getChannelKey(ch)))
    }))
    .filter(group => group.channels.length > 0);
}


// FUNZIONE: Verifica se un canale è tra i preferiti
function isFavorite(channel) {
    const key = typeof channel === 'string' ? 
        channels.find(c => c.url === channel)?.key : 
        getChannelKey(channel);
    return favoriteChannels.some(fav => getChannelKey(fav) === key);
}


// FUNZIONE AGGIUNTA: Inizializzazione corretta dei preferiti
async function initializeFavorites() {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains('favorites')) {
      // Se lo store non esiste, lo creiamo
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('favorites')) {
            db.createObjectStore('favorites', { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    await loadFavorites();
  } catch (error) {
    console.error('Errore inizializzazione preferiti:', error);
    favoriteChannels = [];
    favoriteKeys.clear();
  }
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


// FUNZIONE HELPER Unificata per rimuovere stella preferiti 
// --- REPLACEMENT (sostituire la versione esistente) ---
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


// FUNZIONE: Renderizzazione della lista dei canali (ottimizzata con forEach e groupIndex)
function renderGroupedChannelList(groups, options = {}) {
    // options.context: 'channels' | 'playlists' | 'epg'
    const context = options && options.context ? options.context : 'channels';

    const list = document.getElementById('channelList');
    list.setAttribute('data-context', context);

    const currentGroups = showingFavorites ? groupedFavoriteChannels : groups;

    requestAnimationFrame(() => {
        const isGridView = currentViewMode === 'grid';
        const viewModeClass = 'view-' + currentViewMode;
        const groupContentClass = 'group-content ' + currentViewMode + '-view';

        list.style.visibility = 'hidden';
        list.innerHTML = '';
        list.className = viewModeClass;

        // 🔹 Caso: preferiti vuoti → mostra immagine nopref.png
        if (showingFavorites && (!currentGroups || currentGroups.length === 0)) {
            const img = document.createElement('img');
            img.src = "nopref.png";
            img.alt = "Nessun preferito";
            img.classList.add("no-favorites");
            list.appendChild(img);
            list.style.visibility = 'visible';
            return;
        }

        // 🔹 Caso: lista canali vuota (NON preferiti) → mostra immagine nochannel.png
        if (!showingFavorites && (!currentGroups || currentGroups.length === 0)) {
            const img = document.createElement('img');
            img.src = "nochannel.png";
            img.alt = "Nessun canale disponibile";
            img.classList.add("no-channels");
            list.appendChild(img);
            list.style.visibility = 'visible';
            return;
        }

        const newList = document.createDocumentFragment();

        const createChannelItem = (channel, groupIndex, isFavoriteList) => {
            const item = document.createElement('div');
            item.className = `channel-item ${currentViewMode}`;
            item.setAttribute('draggable', 'true');
            item.setAttribute('data-url', channel.url);
            item.setAttribute('data-name', channel.name.toLowerCase());
            item.setAttribute('data-key', getChannelKey(channel));
            item.setAttribute('data-group-index', groupIndex);
            item.setAttribute('data-is-favorite', isFavoriteList);

            item.onclick = () => playStream(channel, isFavoriteList);

            const img = document.createElement('img');
            img.className = 'channel-logo';
            img.dataset.src = channel.logo || 'tasto-icon.png';
            img.onerror = function() {
                this.src = '';
                this.style.backgroundColor = '#2a2d36';
            };
            item.appendChild(img);

            const nameContainer = document.createElement('div');
            nameContainer.style.flex = '1';
            nameContainer.style.minWidth = '0';

            const name = document.createElement('div');
            name.className = `channel-name ${isGridView ? 'grid-name' : 'list-name'}`;
            name.textContent = channel.name;
            nameContainer.appendChild(name);

            if (!isGridView && hasEPG(channel)) {
                const programInfo = getCurrentProgramInfo(channel);
                if (programInfo) {
                    const programElement = document.createElement('div');
                    programElement.className = 'current-program';
                    programElement.textContent = programInfo.title;
                    programElement.title = `In corso: ${programInfo.title}`;
                    nameContainer.appendChild(programElement);
                }
            }
            item.appendChild(nameContainer);

            // --- stella preferiti (ora passa il context)
            addFavoriteStar(channel, item, { context });

            // --- delete solo in list view e per item non special
            if (!channel.__special) {
                const deleteBtn = document.createElement('span');
                deleteBtn.className = 'delete-channel';
                deleteBtn.textContent = '🗑️';
                deleteBtn.title = 'Elimina canale';
                if (!isGridView && deletionMode) {
                    deleteBtn.classList.add('visible');
                }

                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (!deletionMode) return;
                    if (confirm('Sei sicuro di voler eliminare questo canale?')) {
                        deleteChannel(channel, isFavoriteList);
                    }
                };
                item.appendChild(deleteBtn);
            }

            // --- highlight current channel
            try {
                if (window.currentChannelUrl && getChannelKey(channel) === window.currentChannelUrl) {
                    item.classList.add('active-channel');
                }
            } catch (e) {
                console.warn('Highlight check failed', e);
            }

            return item;
        };

        //  Ottimizzazione: uso forEach con groupIndex
        currentGroups.forEach((group, groupIndex) => {
            if (group.channels.length === 0) return;

            const groupHeader = document.createElement('div');
            groupHeader.className = 'group-header';
            groupHeader.setAttribute('data-group-index', groupIndex);
            groupHeader.setAttribute('data-is-favorite', showingFavorites ? 'true' : 'false');

            // 🔧 Drag nativo abilitato solo in modalità "channels"
            if (context === 'channels') {
                groupHeader.setAttribute('draggable', 'true'); // ✅ ABILITATO
                groupHeader.style.cursor = 'grab';
            } else {
                groupHeader.removeAttribute('draggable');
                groupHeader.style.cursor = 'default';
            }

            groupHeader.innerHTML = `
                <div class="group-title">
                    <span class="group-name">${group.name}</span>
                    <span class="group-channel-count">${group.channels.length}</span>
                    <span class="group-drag-handle" title="Drag to reorder" aria-hidden="true">☰</span>
                    <span class="group-toggle">${
                        showingFavorites
                            ? (favoriteGroupCollapseState[group.name] ? '+' : '-')
                            : (groupCollapseState[group.name] ? '+' : '-')
                    }</span>
                </div>
            `;

            const groupContent = document.createElement('div');
            groupContent.className = groupContentClass;

            const collapsedState = showingFavorites
                ? !!favoriteGroupCollapseState[group.name]
                : !!groupCollapseState[group.name];

            groupContent.style.display = collapsedState ? 'none' : '';

            const toggleSpan = groupHeader.querySelector('.group-toggle');
            if (toggleSpan) toggleSpan.textContent = collapsedState ? '+' : '-';

            const channelFragment = document.createDocumentFragment();
            group.channels.forEach(channel => {
                channelFragment.appendChild(createChannelItem(channel, groupIndex, showingFavorites));
            });
            groupContent.appendChild(channelFragment);

            groupHeader.addEventListener('click', (e) => {
                if (e.target.closest('.group-drag-handle')) return;

                const collapsed = groupContent.style.display === 'none';
                groupContent.style.display = collapsed ? '' : 'none';

                if (showingFavorites) {
                    favoriteGroupCollapseState[group.name] = !collapsed;
                } else {
                    groupCollapseState[group.name] = !collapsed;
                }

                const toggleEl = groupHeader.querySelector('.group-toggle');
                if (toggleEl) toggleEl.textContent = collapsed ? '-' : '+';

                // salva impostazione persistente
                saveGroupCollapseStates();
            });

            newList.appendChild(groupHeader);
            newList.appendChild(groupContent);
        });

        list.appendChild(newList);
        lazyLoadImages();

        if (!dragDropInitialized) {
            setupDragAndDropDelegation();
            dragDropInitialized = true;
        }

        // After render: sincronizza visibilità delete buttons in base a deletionMode e viewMode
        requestAnimationFrame(() => {
            const isGridView = currentViewMode === 'grid';
            document.querySelectorAll('#channelList .channel-item .delete-channel').forEach(btn => {
                if (isGridView) {
                    btn.classList.remove('visible');
                } else {
                    if (deletionMode) btn.classList.add('visible');
                    else btn.classList.remove('visible');
                }
            });
        });

        list.style.visibility = 'visible';
    });

    // --- Sincronizza l'ordine reale dei canali (flat) dopo il render ---
    try {
        const usedGroups = showingFavorites ? groupedFavoriteChannels : (typeof currentGroups !== 'undefined' ? currentGroups : groupedChannels);
        const flat = usedGroups.flatMap(g => g.channels || []);
        if (showingFavorites) {
            favoriteChannels = flat;
        } else {
            channels = flat;
        }
        rebuildIndexMaps();
    } catch (e) {
        console.warn("Sync after grouped render failed", e);
    }
}


// FUNZIONE: Caricamento lazy delle immagini
function lazyLoadImages() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                observer.unobserve(img);
            }
        });
    }, {
        rootMargin: '200px' // Carica 200px prima che entrino nel viewport
    });

    document.querySelectorAll('.channel-logo[data-src]').forEach(img => {
        observer.observe(img);
    });
}


// FUNZIONE: Genera il contenuto M3U dall'array di canali
function generateM3UFromChannels(channels) {
  let m3uContent = '#EXTM3U\n';
  let currentGroup = null;
  
  channels.forEach(channel => {
    if (channel.group !== currentGroup) {
      m3uContent += `#EXTGRP:${channel.group}\n`;
      currentGroup = channel.group;
    }
    
    m3uContent += `#EXTINF:-1 tvg-logo="${channel.logo || ''}" group-title="${channel.group}",${channel.name}\n`;
    m3uContent += `${channel.url}\n`;
  });
  
  return m3uContent;
}

// Replacement: return the actual flat array (fast)
function getCurrentDisplayList() {
  return showingFavorites ? favoriteChannels : channels;
}


// helper: pulisce Hls in modo sicuro (await per MEDIA_DETACHED o timeout)
async function cleanupHlsInstance() {
  if (!window.hlsInstance) return;
  try {
    window.hlsInstance.stopLoad();

    // se possibile, attendiamo MEDIA_DETACHED
    await new Promise((resolve) => {
      let settled = false;
      const onDetached = () => {
        if (settled) return;
        settled = true;
        try { window.hlsInstance.off(Hls.Events.MEDIA_DETACHED, onDetached); } catch(e){/*ignore*/ }
        resolve();
      };
      try {
        window.hlsInstance.on(Hls.Events.MEDIA_DETACHED, onDetached);
        window.hlsInstance.detachMedia();
      } catch (e) {
        // se detach lancia subito, risolviamo subito
        resolve();
      }
      // fallback: se non arriva MEDIA_DETACHED, risolviamo dopo 150ms
      setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 150);
    });

    // ora distruggi
    try { window.hlsInstance.destroy(); } catch(e){ console.warn('hls destroy failed', e); }
  } catch (e) {
    console.warn('cleanupHlsInstance error', e);
    try { window.hlsInstance.destroy(); } catch(_) {}
  } finally {
    window.hlsInstance = null;
  }
}


// FUNZIONE: Mostra lista canali (con cleanup centralizzato)
async function showChannelList() {
  window.isEPGView = false;
  window.isPlaylistView = false;

  // 1) pulizia completa
  cleanupPlayers({ keepVideoVisible: false });

  
  // 3) Nascondi i metadati / UI del player
  document.getElementById('metadataContainer').style.display = 'none';

  // 4) Mostra lista e nascondi player
  document.getElementById('playerContainer').style.display = 'none';
  document.getElementById('channelListContainer').style.display = 'block';
  document.querySelector('h1')?.classList.remove('hidden');
  document.getElementById('controls')?.classList.remove('hidden');
  document.getElementById('bottomTabBar')?.classList.remove('hidden');

  // 5) Evidenzia canale attivo nella lista
  document.querySelectorAll('.active-channel').forEach(el =>
    el.classList.remove('active-channel')
  );

  let target = null;
  if (window.currentChannelUrl) {
    target = document.querySelector(`[data-key="${CSS.escape(window.currentChannelUrl)}"]`);
  }

  if (target) {
    target.classList.add('active-channel');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    rebuildIndexMaps(); // ✅ aggiorna le mappe dopo ogni delete
}


// FUNZIONE: Elimina un canale (dai preferiti)
// 5. Sostituisci la funzione removeFromFavorites con questa versione
async function removeFromFavorites(key) {
  const favIndex = favoriteChannels.findIndex(c => getChannelKey(c) === key);
  if (favIndex === -1) return;

  // 1. elimina da IndexedDB
  await idbDeleteFavorite(key);

  // 2. aggiorna memoria
  favoriteChannels.splice(favIndex, 1);
  groupedFavoriteChannels = groupChannels(favoriteChannels);

  // 3. ✅ Aggiorna le mappe immediatamente
  rebuildIndexMaps();

  // 4. se stai visualizzando i preferiti, rinfresca la UI
  if (showingFavorites) {
    renderGroupedChannelList(groupedFavoriteChannels, { context: 'channels' });
  }
}


// FUNZIONE: Elimina un canale (dai lista Tutti)
// 4. Sostituisci la funzione removeFromMainList con questa versione
function removeFromMainList(key) {
    const channelIndex = channels.findIndex(c => getChannelKey(c) === key);
    if (channelIndex === -1) return;
    
    const removedChannel = channels[channelIndex];
    channels.splice(channelIndex, 1);
    groupedChannels = groupChannels(channels);
    
    // ✅ Aggiorna le mappe immediatamente
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


// FUNZIONE: Configurazione drag & drop (estesa per includere gruppi nativi)
function setupDragAndDropDelegation() {
  const list = document.getElementById('channelList');

  list.addEventListener('dragstart', (e) => {
    // --- DRAG DI GRUPPO (nativo via .group-header[draggable="true"]) ---
    const header = e.target.closest('.group-header[draggable="true"]');
    if (header) {
      // Salva indici e stato
      draggedGroupIndex = parseInt(header.getAttribute('data-group-index'));
      draggedGroupIsFavorite = header.getAttribute('data-is-favorite') === 'true';
      header.classList.add('dragging');

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-drag-type', 'group');
      e.dataTransfer.setData('text/plain', String(draggedGroupIndex)); // per compatibilità

      return; // Previene logica canali
    }

    // --- DRAG DI CANALE (logica originale) ---
    const item = e.target.closest('.channel-item');
    if (!item) return;

    draggedItem = item;
    draggedItemOriginalGroup = parseInt(item.getAttribute('data-group-index'));
    draggedItemOriginalUrl = item.getAttribute('data-url');
    draggedItemIsFavorite = item.getAttribute('data-is-favorite') === 'true';
    item.classList.add('dragging');

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-drag-type', 'channel');
    e.dataTransfer.setData('text/plain', item.getAttribute('data-key'));
  });

  list.addEventListener('dragend', (e) => {
    // Pulizia visiva e dati per entrambi i casi
    const item = e.target.closest('.channel-item');
    const header = e.target.closest('.group-header');

    if (item) item.classList.remove('dragging');
    if (header) header.classList.remove('dragging');

    document.querySelectorAll('.drop-target').forEach(el => {
      el.classList.remove('drop-target');
    });

    draggedItem = null;
    draggedItemOriginalGroup = null;
    draggedItemOriginalUrl = null;
    draggedGroupIndex = null;
  });

  list.addEventListener('dragover', (e) => {
    const targetChannel = e.target.closest('.channel-item');
    const targetHeader = e.target.closest('.group-header');

    // Permetti drop solo su elementi validi
    if (targetChannel || targetHeader) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });

  list.addEventListener('dragenter', (e) => {
    const target = e.target.closest('.channel-item, .group-header');
    if (target) {
      e.preventDefault();
      target.classList.add('drop-target');
    }
  });

  list.addEventListener('dragleave', (e) => {
    const target = e.target.closest('.channel-item, .group-header');
    if (target) {
      e.preventDefault();
      target.classList.remove('drop-target');
    }
  });

  list.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const dragType = e.dataTransfer.getData('application/x-drag-type');

    // --- DROP DI GRUPPO ---
    if (dragType === 'group') {
      const targetHeader = e.target.closest('.group-header');
      if (!targetHeader || draggedGroupIndex === null) return;

      const targetGroupIndex = parseInt(targetHeader.getAttribute('data-group-index'));
      const targetIsFavorite = targetHeader.getAttribute('data-is-favorite') === 'true';

      // Impedisci spostamenti cross-list (preferiti <-> principale)
      if (draggedGroupIsFavorite !== targetIsFavorite) return;

      if (draggedGroupIndex !== targetGroupIndex) {
        moveGroup(draggedGroupIndex, targetGroupIndex, draggedGroupIsFavorite);

        // Se siamo nella vista Preferiti, persisti l'ordine dei preferiti in IDB
        if (draggedGroupIsFavorite) {
          void (async () => {
            try {
              await persistFavoritesOrder(favoriteChannels);
            } catch (err) {
              console.warn('persistFavoritesOrder failed after group move', err);
            }
          })();
        } else {
          // per la lista principale puoi mantenere l'attuale salvataggio M3U
          saveChannelOrder();
        }

        renderGroupedChannelList(
          draggedGroupIsFavorite ? groupedFavoriteChannels : groupedChannels,
          { context: 'channels' }
        );
        rebuildIndexMaps();
      }

      targetHeader.classList.remove('drop-target');
      draggedGroupIndex = null;
      return;
    }

    // --- DROP DI CANALE (logica originale) ---
    const targetItem = e.target.closest('.channel-item');
    if (!targetItem || !draggedItem) return;

    const targetGroupIndex = parseInt(targetItem.getAttribute('data-group-index'));
    const targetChannelUrl = targetItem.getAttribute('data-url');
    const targetIsFavorite = targetItem.getAttribute('data-is-favorite') === 'true';

    // Impedisci spostamenti cross-list
    if (draggedItemIsFavorite !== targetIsFavorite) return;

    const sourceGroups = draggedItemIsFavorite ? groupedFavoriteChannels : groupedChannels;
    const fromGroup = sourceGroups[draggedItemOriginalGroup];
    const fromChannelIndex = fromGroup.channels.findIndex(ch => ch.url === draggedItemOriginalUrl);

    const toGroup = sourceGroups[targetGroupIndex];
    let toChannelIndex = toGroup.channels.findIndex(ch => ch.url === targetChannelUrl);

    // Correzione indice quando si sposta nello stesso gruppo verso il basso
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
    rebuildIndexMaps();
    saveChannelOrder();

    targetItem.classList.remove('drop-target');
  });
}


// Navigazione tra i canali (funziona sia per lista normale che per preferiti)
function navigateChannels(direction, fromFavorites = false) {
  
  // Seleziona la lista corretta in base all'origine
  const displayList = fromFavorites
    ? favoriteChannels
    : getCurrentDisplayList();

  // Indice corrente memorizzato (può non essere valido)
  let currentIndex = fromFavorites
    ? currentFavoriteIndex
    : currentChannelIndex;

  // Se l'indice è fuori range o non valido, tenta una ricostruzione
  if (currentIndex < 0 || currentIndex >= displayList.length) {
    const key = window.currentChannelUrl;

    // Prima prova tramite mappa (veloce)
    currentIndex = fromFavorites
      ? (favoriteIndexMap.get(key) ?? -1)
      : (channelIndexMap.get(key) ?? -1);

    // Se ancora non trovato, ultima risorsa: findIndex sulla lista
    if (currentIndex === -1) {
      currentIndex = displayList.findIndex(ch => getChannelKey(ch) === key);
    }
  }

  // Nessun canale valido trovato → interrompi
  if (currentIndex === -1) return;

  // Calcola il nuovo indice in base alla direzione
  const newIndex =
    direction === 'next'
      ? currentIndex + 1
      : currentIndex - 1;

  // Evita di uscire dai limiti della lista
  if (newIndex < 0 || newIndex >= displayList.length) return;

  // Aggiorna l’indice corrente nella struttura corretta
  if (fromFavorites) {
    currentFavoriteIndex = newIndex;
  } else {
    currentChannelIndex = newIndex;
  }

  // Avvia lo stream del nuovo canale
  playStream(displayList[newIndex], fromFavorites);
}


// FUNZIONE: Gestione evento dragover per riordinamento canali
 function handleDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      return false;
    }


// FUNZIONE: Gestione evento dragenter per riordinamento canali
 function handleDragEnter(e) {
      e.preventDefault();
      this.classList.add('drop-target');
    }


// FUNZIONE: Gestione evento dragleave per riordinamento canali
  function handleDragLeave() {
      this.classList.remove('drop-target');
    }


// FUNZIONE: Gestione evento drop per riordinamento canali
 function handleDrop(e) {
      e.stopPropagation();
      e.preventDefault();
      
      if (draggedItem !== this) {
        const targetGroupIndex = parseInt(this.getAttribute('data-group-index'));
        const targetChannelUrl = this.getAttribute('data-url');
        
        const fromGroup = groupedChannels[draggedItemOriginalGroup];
        const fromChannelIndex = fromGroup.channels.findIndex(ch => ch.url === draggedItemOriginalUrl);
        
        const toGroup = groupedChannels[targetGroupIndex];
        let toChannelIndex = toGroup.channels.findIndex(ch => ch.url === targetChannelUrl);
        
        if (draggedItemOriginalGroup === targetGroupIndex && fromChannelIndex < toChannelIndex) {
          toChannelIndex--;
        }

        moveChannel(draggedItemOriginalGroup, fromChannelIndex, targetGroupIndex, toChannelIndex);
        
        renderGroupedChannelList(groupedChannels, { context: 'playlists' });
rebuildIndexMaps();

        saveChannelOrder();
      }
      
      this.classList.remove('drop-target');
      return false;
    }


// FUNZIONE: Aggiungi questa funzione helper per recuperare un singolo preferito
async function idbGetFavorite(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readonly');
    const store = tx.objectStore('favorites');
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}


// FUNZIONE: Sposta un canale tra gruppi (gestione playlist + preferiti su IDB)
function moveChannel(fromGroupIndex, fromChannelIndex, toGroupIndex, toChannelIndex, isFavoriteList) {
  if (fromGroupIndex === toGroupIndex && fromChannelIndex === toChannelIndex) {
    return;
  }

  const sourceGroups = isFavoriteList ? groupedFavoriteChannels : groupedChannels;
  const fromGroup = sourceGroups[fromGroupIndex];
  const toGroup = sourceGroups[toGroupIndex];

  const [movedChannel] = fromGroup.channels.splice(fromChannelIndex, 1);
  
  // Salva la vecchia chiave prima di modificare il gruppo
  const oldKey = getChannelKey(movedChannel);
  
  // Aggiorna il gruppo del canale
  movedChannel.group = toGroup.name;
  
  // Calcola la nuova chiave
  const newKey = getChannelKey(movedChannel);

  toGroup.channels.splice(toChannelIndex, 0, movedChannel);

  if (isFavoriteList) {
    // Aggiorna l'array flat dei preferiti
    favoriteChannels = [];
    groupedFavoriteChannels.forEach(group => {
      favoriteChannels = favoriteChannels.concat(group.channels);
    });

    // ✅ Ricostruisci subito le mappe
    rebuildIndexMaps();

    // Aggiorna IndexedDB con la nuova chiave
    void (async () => {
      try {
        // Prima recupera il record originale
        const oldRecord = await idbGetFavorite(oldKey);
        if (oldRecord) {
          // Elimina il vecchio record
          await idbDeleteFavorite(oldKey);
          // Aggiungi il record con la nuova chiave
          await idbPutFavorite({
            ...oldRecord,
            key: newKey,
            group: toGroup.name
          });
        }
        
        // Aggiorna la Set delle chiavi
        favoriteKeys.delete(oldKey);
        favoriteKeys.add(newKey);
        
        // Infine salva l'ordine
        await persistFavoritesOrder(favoriteChannels);
      } catch (error) {
        console.error("Errore durante l'aggiornamento dei preferiti:", error);
      }
    })();
  } else {
    // 🔄 Aggiorna l'array flat principale
    channels = [];
    groupedChannels.forEach(group => {
      channels = channels.concat(group.channels);
    });

    // ✅ Ricostruisci subito le mappe
    rebuildIndexMaps();

    const m3uContent = generateM3UFromChannels(channels);

    // 🔥 Aggiorna IndexedDB playlist attiva
    void (async () => {
      const active = await getActivePlaylist();
      if (active) {
        await updateM3URecord(active.id, { content: m3uContent, lastFetched: Date.now() });
      } else if (channels.length > 0) {
        // Salva solo se ci sono canali da salvare
        const id = await saveM3UUrl('local', 'Local playlist');
        await updateM3URecord(id, { content: m3uContent, lastFetched: Date.now(), isActive: true });
        await setOnlyActive(id);
      } else {
        // Nessun canale -> non creare playlist 'local'
      }
    })();
  }
}


// Helper per accesso rapido ai canali per URL
function getChannelByUrl(url, fromFavorites = false) {
    if (fromFavorites) {
        return favoriteUrlMap.get(url) || null;
    } else {
        return channelUrlMap.get(url) || null;
    }
}


function moveGroup(fromIndex, toIndex, isFavoriteList = false) {
  if (fromIndex === toIndex) return;
  const groups = isFavoriteList ? groupedFavoriteChannels : groupedChannels;
  if (!Array.isArray(groups)) return;
  const [moved] = groups.splice(fromIndex, 1);
  let insertIndex = toIndex;
  if (fromIndex < toIndex) insertIndex = toIndex - 1;
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > groups.length) insertIndex = groups.length;
  groups.splice(insertIndex, 0, moved);
  // aggiorna order se lo usi
  groups.forEach((g, idx) => { if (g) g.order = idx; });
  // sincronizza lista piatta dei canali (per salvataggio)
  try {
    if (isFavoriteList) favoriteChannels = groupedFavoriteChannels.flatMap(g => g.channels || []);
    else channels = groupedChannels.flatMap(g => g.channels || []);
  } catch (err) { console.warn('moveGroup sync failed', err); }
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
  
  // Aggiungi il canale al nuovo gruppo
if (!newGroup.channels.find(c => getChannelKey(c) === getChannelKey(channel))) {
  newGroup.channels.push(channel);
}  

  // Mantieni l'ordinamento dei gruppi
  groupedChannels.sort((a, b) => a.order - b.order);
}


// FUNZIONE: Salva l'ordine corrente dei canali
function saveChannelOrder() {
      const updatedChannels = [];
      groupedChannels.forEach(group => {
        group.channels.forEach(channel => {
          updatedChannels.push(channel);
        });
      });
      
      channels = updatedChannels;
      
      const m3uContent = generateM3UFromChannels(channels);
      // Aggiorna IndexedDB in background (fire-and-forget)
void (async () => {
  const active = await getActivePlaylist();
  if (active) {
    await updateM3URecord(active.id, { content: m3uContent, lastFetched: Date.now() });
  } else if (channels.length > 0) {
    // Salva solo se ci sono canali da salvare
    const id = await saveM3UUrl('local', 'Local playlist');
    await updateM3URecord(id, { content: m3uContent, lastFetched: Date.now(), isActive: true });
    await setOnlyActive(id);
  } else {
    // Nessun canale -> non creare playlist 'local'
  }
})();
}


// FUNZIONE: Aggiorna la chiave del canale nei preferiti
// funzione aggiornata per aggiornare i preferiti in memoria e su IndexedDB
async function updateChannelKeyInFavorites(oldKey, channel) {
  const idx = favoriteChannels.findIndex(f => getChannelKey(f) === oldKey);
  if (idx !== -1) {
    // aggiorna in memoria
    favoriteChannels[idx] = {
      ...favoriteChannels[idx],
      name: channel.name,
      url: channel.url,
      group: channel.group,
      logo: channel.logo || null,
      type: channel.type || 'channel'
    };

    // aggiorna raggruppamento
    groupedFavoriteChannels = groupChannels(favoriteChannels);

    // aggiorna su IndexedDB (nuova chiave!)
    const newKey = getChannelKey(channel);
    await idbUpdateFavoriteKey(oldKey, {
      key: newKey,
      name: channel.name,
      url: channel.url,
      group: channel.group,
      logo: channel.logo || null,
      type: channel.type || 'channel',
      order: idx
    });
  }

  // aggiorna currentChannelUrl se necessario
  if (window.currentChannelUrl === oldKey) {
    window.currentChannelUrl = getChannelKey(channel);
  }
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


// FUNZIONE: Riproduzione stream (OTTIMIZZATA per avvio immediato)
async function playStream(channel, fromFavorites = false) {
    const key = getChannelKey(channel);

    // ✅ OTTIMIZZAZIONE: salvataggio batch in un unico task
    requestAnimationFrame(() => {
        localStorage.setItem("zappone_last_played", channel.url);
        localStorage.setItem("zappone_last_played_from_favorites", fromFavorites.toString());
    });

    // ✅ ACCESSO IMMEDIATO O(1) tramite URL maps
    let currentIndex;
    let targetChannel = channel;
    
    if (fromFavorites) {
        const favChannel = favoriteUrlMap.get(channel.url);
        if (favChannel && getChannelKey(favChannel) === key) {
            currentIndex = favoriteIndexMap.get(key);
            currentFavoriteIndex = currentIndex !== undefined ? currentIndex : -1;
        } else {
            currentIndex = favoriteChannels.findIndex(ch => getChannelKey(ch) === key);
            currentFavoriteIndex = currentIndex;
        }
    } else {
        const mainChannel = channelUrlMap.get(channel.url);
        if (mainChannel && getChannelKey(mainChannel) === key) {
            currentIndex = channelIndexMap.get(key);
            currentChannelIndex = currentIndex !== undefined ? currentIndex : -1;
        } else {
            currentIndex = getCurrentDisplayList().findIndex(ch => getChannelKey(ch) === key);
            currentChannelIndex = currentIndex;
        }
    }

    if (currentIndex === -1 && !fromFavorites) {
        const directMatch = channelUrlMap.get(channel.url);
        if (directMatch) {
            targetChannel = directMatch;
            currentChannelIndex = channels.findIndex(ch => ch.url === channel.url);
        } else {
            showChannelList();
            return;
        }
    }

    // ✅ Aggiornamento stato globale
    window.currentChannelUrl = key;
    localStorage.setItem("zappone_last_played", targetChannel.url);

    // ✅ UI NON-BLOCKING
    requestAnimationFrame(() => {
        document.getElementById('channelListContainer').style.display = 'none';
        const playerContainer = document.getElementById('playerContainer');
        playerContainer.style.display = 'block';
        playerContainer.classList.add('loading');

        const tabbar = document.getElementById('bottomTabBar');
        if (tabbar) tabbar.classList.add('hidden');
    });

    // ✅ Aggiorna info canale IMMEDIATAMENTE (prima della riproduzione)
    updateChannelInfoUI(targetChannel);

    // ✅ Gestione metadati
    const metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';
    if (metadataExpanded) {
        metadataContainer.style.display = 'block';
        metadataContainer.classList.add('expanded');
    } else {
        metadataContainer.style.display = 'none';
        metadataContainer.classList.remove('expanded');
    }
    
    const showMetadataEnabled = localStorage.getItem("zappone_show_metadata") !== "false";
    if (showMetadataEnabled) {
        metadataHeader.style.display = "flex";
    }

    // ✅ METADATI E EPG - AGGIORNATI IMMEDIATAMENTE (senza timeout)
    const showMetadataEnabledNow = localStorage.getItem("zappone_show_metadata") !== "false";
    const metadataExpandedNow = localStorage.getItem('metadataExpanded') === 'true';
    
    if (showMetadataEnabledNow && metadataExpandedNow) {
        const metadataContent = document.getElementById('metadataContent');
        if (metadataContent.children.length > 0) {
            updateMetadataValues(targetChannel);
        } else {
            showChannelMetadata(targetChannel);
        }
    }
    
    const showEPGEnabled = localStorage.getItem("zappone_show_epg") !== "false";
    if (showEPGEnabled) {
        showChannelEPG(targetChannel);
    }

    // ✅ RIPRODUZIONE PRINCIPALE 
    try {
        const isRadioMode = document.getElementById('radioToggle').checked;
        const forceAudio = isRadioMode;
        
        // ✅ Cache intelligente per tipo stream
        let isAudioChannel = forceAudio;
        if (!forceAudio) {
            if (streamTypeCache[targetChannel.url] === undefined) {
                const lowerUrl = targetChannel.url.toLowerCase();
                streamTypeCache[targetChannel.url] = !lowerUrl.endsWith('.mpd') && 
                    ['.mp3', '.aac', '.ogg', '.wav', '.m4a', '.flac','.audio'].some(ext => 
                        lowerUrl.endsWith(ext)
                    );
            }
            isAudioChannel = streamTypeCache[targetChannel.url];
        }
        
        toggleUIElementsForStreamType(isAudioChannel);

        if (isAudioChannel) {
            await playAudioStream(targetChannel.url);
        } else {
            await playVideoStream(targetChannel.url);
        }

        playerContainer.classList.remove('loading');
        
        // ✅ Aggiorna pulsanti navigazione
        updateNavButtons(fromFavorites);

    } catch (error) {
        console.error("Errore nella riproduzione:", error);
        playerContainer.classList.remove('loading');
        showNotification("Errore nella riproduzione del canale", true);
        // ✅ Opzionale: mostrare di nuovo la lista canali in caso di errore
        showChannelList();
    }
}

// FUNZIONE: Aggiorna l'UI con le info del canale corrente
 function updateChannelInfoUI(channel) {
      document.getElementById('currentChannelLogo').src = channel.logo || '';
      document.getElementById('currentChannelName').textContent = channel.name;
      document.getElementById('currentChannelGroup').textContent = channel.group;
    }


// FUNZIONE: Determina se uno stream è audio
async function isAudioStream(channel) {
  if (streamTypeCache[channel.url] === undefined) {
    const lowerUrl = channel.url.toLowerCase();
    streamTypeCache[channel.url] = !lowerUrl.endsWith('.mpd') && 
      ['.mp3', '.aac', '.ogg', '.wav', '.m4a', '.flac','.audio'].some(ext => 
        lowerUrl.endsWith(ext)
      );
  }
  return streamTypeCache[channel.url];
}


// FUNZIONE: Mostra/nascondi elementi UI in base al tipo di stream
function toggleUIElementsForStreamType(isAudio) {
  // nasconde la lista canali e mostra il player
  document.getElementById('channelListContainer').style.display = 'none';
  document.getElementById('playerContainer').style.display = 'block';

  // --- NUOVO: nascondi la tab bar inferiore e le righe alte (header <h1> e #controls)
  // usiamo querySelector('h1') perché l'header nel tuo file è un <h1> senza id
  document.getElementById('bottomTabBar')?.classList.add('hidden');
  document.querySelector('h1')?.classList.add('hidden');
  document.getElementById('controls')?.classList.add('hidden');

      const video = document.getElementById('player');
      const playerContainer = document.getElementById('playerContainer');
      
      if (isAudio) {
        playerContainer.classList.add('audio-mode');
        video.style.display = 'none';
      } else {
        playerContainer.classList.remove('audio-mode');
        video.style.display = '';
      }
    }


// FUNCTION  Helper per gestire play() senza warning AbortError
function safePlay(mediaEl, label = "media") {
    if (!mediaEl) return;
    mediaEl.play().catch(err => {
        if (err.name === "AbortError") {
            console.debug(`${label} play interrotto da un nuovo load (AbortError), ignoro.`);
        } else {
            console.error(`${label} play failed:`, err);
        }
    });
}


// FUNCTION Helper per pulire video, audio e player (HLS/DASH) - OTTIMIZZATO
function cleanupPlayers({ keepVideoVisible = true, preserveHLS = false } = {}) {
    const video = document.getElementById("player");
    if (video) {
        try { 
            video.pause(); 
            // ✅ RIMUOVI QUESTE DUE RIGHE CHE CAUSANO IL BLOCCO:
            // video.removeAttribute("src");  // ❌ ELIMINA
            // video.load();                  // ❌ ELIMINA
        } catch(e){}
        if (!keepVideoVisible) video.style.display = "none";
    }

    // ✅ PRESERVA HLS se richiesto (per cambio canale fluido)
    if (!preserveHLS) {
        if (window.hlsInstance) {
            try { window.hlsInstance.destroy(); } catch(e){}
            window.hlsInstance = null;
        }

        if (window.dashPlayer) {
            try { window.dashPlayer.reset(); } catch(e){}
            window.dashPlayer = null;
        }
    }

    const oldAudio = document.getElementById("audioPlayer");
    if (oldAudio) {
        try { oldAudio.pause(); } catch(e){}
        oldAudio.remove();
    }
}


// FUNZIONE: Riproduzione stream audio
async function playAudioStream(url) {
    const playerContainer = document.getElementById('playerContainer');

    // Pulisci prima (nascondi il video)
    cleanupPlayers({ keepVideoVisible: false });

    // Crea un nuovo audio player
    const audio = document.createElement("audio");
    audio.id = "audioPlayer";
    audio.controls = true;
    audio.autoplay = true;
    audio.style.width = "100%";

    const lowerUrl = url.toLowerCase();
    const isHLS = lowerUrl.endsWith(".m3u8") || lowerUrl.includes("m3u8");

    if (isHLS && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, maxBufferLength: 30, maxMaxBufferLength: 60 });
        window.hlsInstance = hls;
        hls.loadSource(url);
        hls.attachMedia(audio);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            safePlay(audio, "HLS audio");
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                try { hls.destroy(); } catch (e) {}
                audio.src = url; // fallback diretto
                safePlay(audio, "Audio fallback");
            }
        });
    } else {
        // Stream audio nativo
        audio.src = url;
        safePlay(audio, "Native audio");
    }

    // Aggiungi al DOM
    playerContainer.insertBefore(audio, playerContainer.querySelector(".player-controls"));

    // Gestione eventi
    audio.onplaying = () => {
        playerContainer.classList.remove("loading");
    };

    audio.onerror = () => {
        console.error("Errore di streaming audio");
        playerContainer.classList.remove("loading");
    };
}


// FUNZIONE: Riproduzione stream video - OTTIMIZZATO
async function playVideoStream(url) {
    const video = document.getElementById('player');
    const lowerUrl = url.toLowerCase();

    // SOFT CLEANUP: preserva HLS per riutilizzo
    cleanupPlayers({ keepVideoVisible: true, preserveHLS: false });
    video.style.display = "block";

    // fullscreen / inline config (come prima)
    const autoFullscreen = localStorage.getItem('zappone_auto_fullscreen') !== 'false';
    if (autoFullscreen) {
        video.removeAttribute('playsinline');
        video.removeAttribute('webkit-playsinline');
    } else {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.removeAttribute("controls");
        video.onclick = () =>
            video.hasAttribute("controls")
                ? video.removeAttribute("controls")
                : video.setAttribute("controls", "true");
    }

    const isSafariIOS = /iP(hone|od|ad).+Version\/\d+.+Safari/i.test(navigator.userAgent);
    const isHLS = lowerUrl.endsWith('.m3u8') || lowerUrl.includes('m3u8') || /\.m3u8(\?|&|$)/i.test(url);
    const isDASH = lowerUrl.endsWith('.mpd');

    // 1) Safari iOS nativo HLS
    if (isSafariIOS && isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        safePlay(video, "Safari HLS");
        return;
    }

    // 2) HLS.js reuse (lasciato invariato)
    if (typeof Hls !== 'undefined' && Hls.isSupported() && (isHLS || !isDASH)) {
        // Applica crossOrigin solo per HLS.js? Forse no, perché HLS.js gestisce le richieste XHR.
        // Ma non impostiamo crossOrigin sul video element per HLS.js perché non necessario.
        if (window.hlsInstance) {
            try {
                console.log("Riutilizzo istanza HLS esistente");
                window.hlsInstance.detachMedia();
                window.hlsInstance.loadSource(url);
                window.hlsInstance.attachMedia(video);
                window.hlsInstance.startLoad();
                return;
            } catch (e) {
                console.warn("Riutilizzo HLS fallito, creo nuova istanza", e);
                try { window.hlsInstance.destroy(); } catch(_) {}
                window.hlsInstance = null;
            }
        }

        if (!window.hlsInstance) {
            window.hlsInstance = new Hls({
                enableWorker: !isSafariIOS,
                lowLatencyMode: true,
                backBufferLength: 90,
                maxBufferLength: 40,
                maxMaxBufferLength: 80
            });
            window.hlsInstance.attachMedia(video);
            window.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => safePlay(video, "HLS.js"));
            window.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            try { window.hlsInstance.startLoad(); } catch(_) {}
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            try { window.hlsInstance.recoverMediaError(); } catch(_) {}
                            break;
                        default:
                            try { window.hlsInstance.destroy(); } catch(_) {}
                            window.hlsInstance = null;
                            console.error('HLS.js fatal error:', data);
                            showNotification('Errore riproduzione HLS', true);
                            break;
                    }
                }
            });
        }

        window.hlsInstance.loadSource(url);
        window.hlsInstance.startLoad();
        return;
    }

    // 3) DASH robusto: distruggi prima, poi ricrea con listener di errore + retry
    if (isDASH && !isSafariIOS && typeof dashjs !== 'undefined') {
        // Imposta crossOrigin solo per DASH? Forse sì, perché DASH potrebbe richiederlo.
        try { video.crossOrigin = 'anonymous'; } catch(e) {}
        try { video.preload = 'auto'; } catch(e) {}

        // forza reset dell'istanza esistente per evitare stati sporchi
        if (window.dashPlayer) {
            try { window.dashPlayer.reset(); } catch(e) { console.warn('dash reset failed', e); }
            window.dashPlayer = null;
        }

        // retry policy semplice
        let dashRetries = 0;
        const DASH_MAX_RETRIES = 3;
        const DASH_RETRY_DELAY_MS = 1200;

        const createAndInitDash = () => {
            try {
                // crea nuova istanza
                const player = dashjs.MediaPlayer().create();
                
                // ✅ CONFIGURAZIONE MIGLIORATA PER DISABILITARE SOTTOTITOLI
                try {
                    player.updateSettings({
                        streaming: {
                            buffer: { 
                                fastSwitchEnabled: true 
                            },
                            // ✅ DISABILITA COMPLETAMENTE I SOTTOTITOLI
                            text: {
                                defaultEnabled: false
                            }
                        },
                        // ✅ RIDUCI LOG LEVEL PER EVITARE MESSAGGI INUTILI
                        debug: {
                            logLevel: dashjs.Debug.LOG_LEVEL_ERROR // Solo errori critici
                        }
                    });
                    
                    // ✅ DISABILITA ESPLICITAMENTE I TEXT TRACKS
                    player.setTextTrack(-1); // Disabilita tutti i sottotitoli
                    player.setTextDefaultEnabled(false);
                    
                } catch(e){ 
                    console.warn('DASH settings non critico:', e);
                }

                // ✅ FILTRA GLI ERRORI NON CRITICI (TTML)
                player.on(dashjs.MediaPlayer.events.ERROR, (e) => {
                    // IGNORA errori TTML non critici
                    if (e.error && e.error.message && 
                        (e.error.message.includes('TTML') || 
                         e.error.message.includes('subtitles') ||
                         e.error.code === 41875)) { // Codice errore specifico TTML
                        console.debug('DASH TTML error (ignorato):', e.error.message);
                        return; // Non contare come retry per errori TTML
                    }
                    
                    console.error('DASH error event critico:', e);
                    // incremento retry solo se sembra un errore di rete/segment
                    dashRetries++;
                    if (dashRetries <= DASH_MAX_RETRIES) {
                        console.warn(`DASH retry ${dashRetries}/${DASH_MAX_RETRIES} in corso...`);
                        try { player.reset(); } catch(_) {}
                        window.dashPlayer = null;
                        setTimeout(() => {
                            createAndInitDash(); // re-create e re-init
                        }, DASH_RETRY_DELAY_MS);
                    } else {
                        try { player.reset(); } catch(_) {}
                        window.dashPlayer = null;
                        showNotification('Errore riproduzione DASH (retry falliti)', true);
                        // fallback: prova a riprodurre nativamente l'URL (ultimo tentativo)
                        try {
                            video.src = url;
                            safePlay(video, "DASH fallback native");
                        } catch(e) { console.error('fallback native failed', e); }
                    }
                });

                // event: quando stream è pronto, play
                player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
                    console.log('DASH stream initialized');
                    
                    // ✅ DISABILITA ULTERIORMENTE I SOTTOTITOLI DOPO INIZIALIZZAZIONE
                    try {
                        player.setTextTrack(-1);
                        if (player.getTextTracks && player.getTextTracks().length > 0) {
                            console.log('Text tracks disponibili ma disabilitati:', player.getTextTracks());
                        }
                    } catch(e) {
                        console.debug('Impossibile disabilitare text tracks:', e);
                    }
                    
                    safePlay(video, "DASH");
                });

                // initialize (autoPlay true)
                player.initialize(video, url, true);

                // salva istanza globale
                window.dashPlayer = player;
            } catch (err) {
                console.error('DASH create/init failed:', err);
                dashRetries++;
                if (dashRetries <= DASH_MAX_RETRIES) {
                    setTimeout(() => createAndInitDash(), DASH_RETRY_DELAY_MS);
                } else {
                    showNotification('Impossibile inizializzare DASH player', true);
                }
            }
        };

        // avvia
        createAndInitDash();
        return;
    }

    // 4) fallback: formati nativi (MP4, WebM, etc.)
    if (!isHLS && !isDASH) {
        // Non impostare crossOrigin per i formati nativi per evitare problemi CORS
        video.src = url;
        safePlay(video, "Native video");
        return;
    }

    // Se arriva qui, nessun metodo ha funzionato
    showNotification('Formato video non supportato', true);
}

// FUNZIONE: Aggiorna i pulsanti di navigazione (modificata per gestire entrambe le liste)
function updateNavButtons(fromFavorites = false) {
    if (fromFavorites) {
        document.getElementById('prevBtn').disabled = currentFavoriteIndex <= 0;
        document.getElementById('nextBtn').disabled = currentFavoriteIndex >= favoriteChannels.length - 1;
    } else {
        const displayList = getCurrentDisplayList();
        document.getElementById('prevBtn').disabled = currentChannelIndex <= 0;
        document.getElementById('nextBtn').disabled = currentChannelIndex >= displayList.length - 1;
    }
}


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
      
      // ✅ FORZA AGGIORNAMENTO CON FALLBACK ROBUSTO
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
      // ✅ QUANDO SI CHIUDONO I METADATI, CANCELLA IL CONTENUTO
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
    // ✅ FORZA LO STATO A FALSE SE DISABILITATO
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


// FUNZIONE: Salva le modifiche ai metadati del canale (VERSIONE ASINCRONA E ROBUSTA) 
// con supporto opzionale per cambio solo nome (minima modifica)
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
  rebuildIndexMaps(); // ✅ aggiunto
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


 // FUNZIONI GESTIONE SWIPE
function setupSwipeHandlers() {
  const channelContainer = document.getElementById('channelListContainer');
  const fullEpgList = document.getElementById('fullEpgList');
  const containers = [channelContainer, fullEpgList].filter(Boolean);

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


// FUNZIONE: Cambia modalità di visualizzazione
function switchViewMode(mode) {
  if (currentViewMode === mode) return;

  const currentGroupsState = {};
  document.querySelectorAll('.group-header').forEach(header => {
    const groupName = header.querySelector('.group-title span').textContent;
    currentGroupsState[groupName] = header.querySelector('.group-toggle').textContent === '+';
  });

  currentViewMode = mode;
  saveViewModePreference(mode);

// Aggiorna il nuovo pulsante "View Mode"
const viewModePill = document.getElementById('viewModePill');
if (viewModePill) {
  viewModePill.classList.toggle('list-mode', mode === 'list');
  viewModePill.classList.toggle('grid-mode', mode === 'grid');
}

  const list = document.getElementById('channelList');
  list.className = 'view-' + mode;

  document.querySelectorAll('.channel-item').forEach(el => {
    el.classList.remove('list', 'grid');
    el.classList.add(mode);
  });

  document.querySelectorAll('.group-content').forEach(el => {
    el.classList.remove('list-view', 'grid-view');
    el.classList.add(mode + '-view');
  });

  document.querySelectorAll('.group-header').forEach(header => {
    const groupName = header.querySelector('.group-title span').textContent;
    const isCollapsed = currentGroupsState[groupName];
    const content = header.nextElementSibling;
    
    if (content && content.classList.contains('group-content')) {
      content.style.display = isCollapsed ? 'none' : '';
      header.querySelector('.group-toggle').textContent = isCollapsed ? '+' : '-';
    }
  });

// Sostituisci quelle righe con:
document.querySelectorAll('.delete-channel').forEach(btn => {
    if (mode === 'grid') {
        btn.classList.remove('visible');
    } else {
        // In list mode, mostra solo se siamo in deletionMode
        if (deletionMode) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    }
});
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
    showFav: showFav === 'true' // Converti direttamente il valore in booleano
  };
}


// FUNZIONE: Download EPG da URL
async function downloadEPG(url = epgUrl) {
  if (window.epgDownloadInProgress) {
    console.log('Download EPG già in corso, skipping...');
    return null;
  }

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    showNotification('URL EPG non valido', true);
    return null;
  }

  const btn = document.getElementById('downloadEpgBtn');
  if (btn) btn.classList.add('loading');
  window.epgDownloadInProgress = true;

  try {
    console.log(`Iniziando download EPG da: ${url}`);
    const proxyErrors = [];

    const requests = M3U_PROXIES.map((proxy, index) => {
      const proxyUrl = proxy.encode ? proxy.base + encodeURIComponent(url) : proxy.base + url;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      return fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 
          'Accept': 'application/xml, application/json, text/xml, */*',
          'User-Agent': 'ZappOne/1.0'
        }
      })
      .then(async response => {
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 20 * 1024 * 1024) {
          throw new Error('EPG troppo grande (>20MB)');
        }
        
        const text = await response.text();
        if (!text || text.trim().length < 100) throw new Error('Contenuto EPG vuoto o corrotto');
        return text;
      })
      .catch(err => {
        clearTimeout(timeoutId);
        const proxyName = proxy.base ? `Proxy ${index + 1}` : 'Direct';
        proxyErrors.push(`${proxyName}: ${err.message}`);
        console.warn(`${proxyName} fallito:`, err.message);
        throw err;
      });
    });

    const responseText = await Promise.any(requests);
    console.log('Download EPG completato, iniziando parsing...');

    // Parsing XML/JSON
    const isXML = responseText.trim().startsWith('<') || responseText.includes('<tv>');
    let data;
    
    try {
      if (isXML) {
        const xmlDoc = new DOMParser().parseFromString(responseText, "text/xml");
        if (xmlDoc.getElementsByTagName("parsererror").length) {
          const errorText = xmlDoc.getElementsByTagName("parsererror")[0]?.textContent || 'XML malformato';
          throw new Error(`EPG XML malformato: ${errorText.substring(0, 100)}`);
        }
        data = parseXMLTV(xmlDoc);
      } else {
        data = JSON.parse(responseText);
      }
    } catch (parseError) {
      throw new Error(`Errore parsing EPG: ${parseError.message}`);
    }

    // ✅ VALIDAZIONE DATI ROBUSTA
    if (!Array.isArray(data)) {
      throw new Error('Struttura EPG non valida: deve essere un array');
    }

    const validChannels = data.filter(ch => ch && ch.name && (ch.id || ch.name.trim()));
    if (validChannels.length === 0) {
      throw new Error('EPG non contiene canali validi');
    }

    console.log(`EPG parsato: ${validChannels.length} canali validi su ${data.length} totali`);

    // ✅ CORREZIONE: SALVA TUTTO IN MODO CONSISTENTE
    // Assegna i dati COMPLETI a epgData
    epgData = data;

    const name = url.split('/').pop() || 'EPG';
    // Salva i dati COMPLETI in IndexedDB
    await saveAndActivateEPG({ url, name, content: JSON.stringify(data) });

    showNotification(`EPG caricato: ${data.length} canali`);

    // Aggiorna UI - le funzioni di visualizzazione filtreranno automaticamente
    if (window.currentChannelUrl) {
      const current = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
      if (current) setTimeout(() => showChannelEPG(current), 100);
    }
    
    requestAnimationFrame(() =>
      renderGroupedChannelList(getFilteredGroupedChannels(), { context: 'channels' })
    );

    // ✅ Ritorna i dati COMPLETI
    return data;
    
  } catch (error) {
    console.error("Errore caricamento EPG:", error);
    
    let errorMessage = "Errore nel caricamento EPG";
    if (error.name === 'AggregateError') {
      const failedCount = error.errors?.length || M3U_PROXIES.length;
      errorMessage = `Tutti i ${failedCount} proxy hanno fallito`;
      console.error("Dettaglio errori proxy:", error.errors);
    } else if (error.message.includes('Timeout') || error.name === 'AbortError') {
      errorMessage = "Timeout - server EPG non risponde";
    } else {
      errorMessage = error.message || "Errore nel caricamento EPG";
    }
    
    showNotification(errorMessage, true);
    return null;
  } finally {
    window.epgDownloadInProgress = false;
    if (btn) btn.classList.remove('loading');
  }
}


// FUNZIONE: Parser XMLTV to JSON
function parseXMLTV(xmlDoc) {
  const channels = Array.from(xmlDoc.getElementsByTagName('channel')).map(channel => {
    return {
      id: channel.getAttribute('id'),
      name: channel.getElementsByTagName('display-name')[0]?.textContent || '',
      logo: channel.getElementsByTagName('icon')[0]?.getAttribute('src') || ''
    };
  });

  const programmes = Array.from(xmlDoc.getElementsByTagName('programme')).map(programme => {
    const channelId = programme.getAttribute('channel');
    const start = programme.getAttribute('start');
    const stop = programme.getAttribute('stop');
    
    return {
      channel: channelId,
      title: programme.getElementsByTagName('title')[0]?.textContent || '',
      description: programme.getElementsByTagName('desc')[0]?.textContent || '',
      start: parseXMLTVDate(start),
      end: parseXMLTVDate(stop),
      category: programme.getElementsByTagName('category')[0]?.textContent || '',
      poster: programme.getElementsByTagName('icon')[0]?.getAttribute('src') || ''
    };
  });

  // Raggruppa i programmi per canale
  return channels.map(channel => {
    return {
      ...channel,
      programs: programmes
        .filter(p => p.channel === channel.id)
        .map(p => ({
          title: p.title,
          description: p.description,
          start: p.start.toISOString(),
          end: p.end.toISOString(),
          category: p.category,
          poster: p.poster
        }))
    };
  });
}


// FUNZIONE: Converti data XMLTV in Date object
function parseXMLTVDate(xmltvDate) {
  // Formato: YYYYMMDDHHMMSS ±ZZZZ (es. 20230801180000 +0200)
  const year = parseInt(xmltvDate.substring(0, 4));
  const month = parseInt(xmltvDate.substring(4, 6)) - 1;
  const day = parseInt(xmltvDate.substring(6, 8));
  const hour = parseInt(xmltvDate.substring(8, 10));
  const minute = parseInt(xmltvDate.substring(10, 12));
  const second = parseInt(xmltvDate.substring(12, 14));
  const tzOffset = xmltvDate.substring(15);
  
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  
  // Aggiusta per il fuso orario
  if (tzOffset) {
    const offsetHours = parseInt(tzOffset.substring(0, 2));
    const offsetMinutes = parseInt(tzOffset.substring(2));
    const offsetMs = (offsetHours * 60 + offsetMinutes) * 60000;
    date.setTime(date.getTime() - offsetMs);
  }
  
  return date;
}


 // FUNZIONE: Mostra una notifica all'utente (versione migliorata)
// showNotification migliorata: rispetta il toggle "popup notifications" a meno che non venga forzata
function showNotification(message, isError = false, force = false) {
  try {
    // se non forzata, controlla la preferenza (default ON se non presente)
    if (!force) {
      const pref = localStorage.getItem('zappone_popup_notifications');
      const enabled = pref === null ? true : pref === 'true';
      if (!enabled) return; // NOTIFICHE DISATTIVATE -> esci senza mostrare nulla
    }

    // Limita la lunghezza del messaggio per evitare notifiche troppo lunghe
    const maxLength = 200;
    const truncatedMessage = message.length > maxLength
      ? message.substring(0, maxLength) + '...'
      : message;

    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.textContent = truncatedMessage;

    document.body.appendChild(notification);

    // Animazione di entrata
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(20px)';

    requestAnimationFrame(() => {
      notification.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      notification.style.opacity = '1';
      notification.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      // Animazione di uscita
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(20px)';

      setTimeout(() => {
        if (notification.parentNode) notification.parentNode.removeChild(notification);
      }, 300);
    }, 4000);
  } catch (e) {
    // se qualcosa va storto non interrompere l'app
    console.error('showNotification error', e);
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



// FUNZIONE: Filtra l'EPG JSON
function filterJSONEPG(data) {
  if (!Array.isArray(data)) return data;

  return data.map(channel => {
    if (Array.isArray(channel.programs)) {
      return {
        ...channel,
        programs: filterPrograms(channel.programs)
      };
    } else {
      return channel;
    }
  });
}


// FUNZIONE: Filtra i programmi EPG (in corso + 2 successivi)
function filterPrograms(programs) {
  const now = new Date();
  const sorted = programs.slice().sort((a,b) => new Date(a.start) - new Date(b.start));

  let startIndex = 0;
  for(let i=0; i < sorted.length; i++) {
    const start = new Date(sorted[i].start);
    const end = new Date(sorted[i].end);
    if (now >= start && now < end) {
      startIndex = i;
      break;
    }
    if (start > now) {
      startIndex = i;
      break;
    }
  }
  return sorted.slice(startIndex, startIndex + 3);
}


// FUNZIONE: Normalizzazione nome canale (centralizzata)
function normalizeChannelName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Rimuove accenti
    .replace(/[^a-z0-9]/g, '') // Tiene solo caratteri alfanumerici
    .replace(/\s+/g, '') // Rimuove spazi
    .replace(/(hd|sd|fhd)$/, ''); // Rimuove suffix qualità
}


// FUNZIONE: Ottiene info sul programma corrente
function getCurrentProgramInfo(channel) {
    if (!epgData || epgData.length === 0) return null;
    
    const channelName = normalizeChannelName(channel.name);
    const channelEPG = epgData.find(c => 
        c.name && normalizeChannelName(c.name) === channelName
    );
    
    if (!channelEPG || !channelEPG.programs) return null;
    
    const now = new Date();
    for (const program of channelEPG.programs) {
        const start = new Date(program.start);
        const end = new Date(program.end);
        if (now >= start && now < end) {
            return {
                title: program.title,
                start: start,
                end: end
            };
        }
    }
    return null;
}


// FUNZIONE: Verifica se un canale ha dati EPG
function hasEPG(channel) {
    if (!epgData || epgData.length === 0) return false;
    
    const channelName = normalizeChannelName(channel.name);
    return epgData.some(epgChannel => 
        epgChannel.name && normalizeChannelName(epgChannel.name) === channelName
    );
}


// FUNZIONE: Mostra l'EPG di un canale
// FUNZIONE: Mostra l'EPG di un canale
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

  const normalizedChannelName = normalizeChannelName(channel.name);
  const channelEPG = epgData.find(c => 
    c.name && normalizeChannelName(c.name) === normalizedChannelName
  );
  
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

  // Trova il programma corrente
  let currentProgramIndex = -1;
  let nextPrograms = [];
  
  for (let i = 0; i < programs.length; i++) {
    const program = programs[i];
    const startTime = new Date(program.start);
    const endTime = new Date(program.end);
    
    if (now >= startTime && now < endTime) {
      // Programma corrente trovato
      currentProgramIndex = i;
      // Prendi i prossimi 2 programmi (se disponibili)
      nextPrograms = programs.slice(i, i + 3); // Corrente + 2 successivi
      break;
    }
  }

  // Se non c'è programma corrente, mostra i prossimi 2 programmi
  if (currentProgramIndex === -1) {
    for (let i = 0; i < programs.length; i++) {
      const startTime = new Date(programs[i].start);
      if (startTime > now) {
        nextPrograms = programs.slice(i, i + 2); // Solo 2 futuri
        break;
      }
    }
  }

  // Se non abbiamo programmi da mostrare
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

  let html = '';
  
  nextPrograms.forEach(program => {
    const startTime = new Date(program.start);
    const endTime = new Date(program.end);
    const isCurrent = now >= startTime && now < endTime;
    const durationMinutes = Math.round((endTime - startTime) / 60000);
    const posterUrl = program.poster || channel.logo || 'placeholder.png';
    
    html += `
      <div class="epg-program ${isCurrent ? 'current' : ''}">
        <div class="epg-poster-container">
          <div class="epg-loader"></div>
          <img class="epg-poster" 
               src="${posterUrl}" 
               alt="${program.title}"
               loading="lazy"
               onload="this.style.opacity=1; this.previousElementSibling.style.display='none'"
               onerror="this.onerror=null; this.src='placeholder.png'; this.previousElementSibling.style.display='none'">
        </div>
        
        <div class="epg-details">
          <div class="epg-title-row">
            <span class="epg-title">${program.title || 'Titolo non disponibile'}</span>
            <span class="epg-time">
              ${startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
              ${endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
          </div>
          
          ${program.subtitle ? `<div class="epg-subtitle">${program.subtitle}</div>` : ''}
          
          ${program.description ? `
            <div class="epg-description">${program.description}</div>
          ` : ''}
          
          <div class="epg-duration">${durationMinutes} min</div>
        </div>
      </div>
    `;
  });

  epgContent.innerHTML = html;
}

// FUNZIONE: Mostra/nasconde l'EPG
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

// IIFE: Sidebar Ozioni
(function() {

  // Sidebar Opzioni

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


document.getElementById("loadEPGDefault").onclick = () => {
  const url = localStorage.getItem("zappone_default_epg") || epgUrl;
  downloadEPG(url);
};

// Reset M3U
document.getElementById("resetM3U").onclick = () => {
setDefaultM3U(DEFAULT_PLAYLIST_URL).then(() => {
  defaultM3UInput.value = DEFAULT_PLAYLIST_URL;
  showNotification("URL M3U ripristinato");
});

};

// Reset EPG
document.getElementById("resetEPG").onclick = () => {
  const defaultEPG = "https://tvit.leicaflorianrobert.dev/epg/list.xml";
  localStorage.setItem("zappone_default_epg", defaultEPG);
  defaultEPGInput.value = defaultEPG;
  epgUrl = defaultEPG;
  showNotification("URL EPG ripristinato");
};

// Helper per cancellare un DB
function deleteDB(name) {
  return new Promise(resolve => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => { console.log(`${name} deleted`); resolve(); };
      req.onerror = () => { console.warn(`${name} delete error`); resolve(); };
      req.onblocked = () => { console.warn(`${name} delete blocked`); resolve(); };
    } catch (e) {
      console.warn(`${name} delete exception`, e);
      resolve();
    }
  });
}

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


/* --------- Riproduzione --------- */
// Radio già collegato


// Mostra metadati
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

// se non c'è valore salvato, parte di default su true
if (saved === null) {
  saved = "true";
  localStorage.setItem("zappone_show_metadata", "true");
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
// Stato iniziale al caricamento (default ON se mai usato prima)
let savedEPG = localStorage.getItem("zappone_show_epg");
if (savedEPG === null) {
  savedEPG = "true";
  localStorage.setItem("zappone_show_epg", "true");
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
document.getElementById("showPlaylistUrl").onchange = e => {
  localStorage.setItem("zappone_show_playlist_url", e.target.checked);
  
  // Ottieni il contesto corrente
  const list = document.getElementById('channelList');
  const context = list ? list.getAttribute('data-context') : 'channels';
  
  // Rigenera la lista corrente in base al contesto
  if (context === 'playlists' && typeof renderPlaylistList === 'function') {
    renderPlaylistList();
  } else if (context === 'epg' && typeof renderEPGManager === 'function') {
    renderEPGManager();
  }
  // Nella vista normale canali non facciamo nulla perché non c'è seconda riga
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

// FUNZIONE: Carica e visualizza la lista URL
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
  const rec = await getM3UById(Number(e.currentTarget.dataset.id));

  // Forza sempre download da remoto
  const text = await downloadM3U(rec.url);

  // aggiorna la cache con la nuova versione
  await updateM3URecord(rec.id, { content: text, lastFetched: Date.now() });

  // salva e attiva il record (IndexedDB)
  await saveAndActivateM3U({ url: rec.url, name: rec.name, content: text });

  await parseM3U(text, false);
  updateButtons();

    window.isPlaylistView = false;
    if (typeof showChannelList === 'function') {
      showChannelList();
    }

  // CHIUDI il bottom sheet dopo che tutto è a posto
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


// FUNZIONE: Aggiungi questa funzione per gestire il click sulle playlist
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

// Funzione robusta per contare canali e gruppi in una playlist M3U
function countChannelsAndGroups(content) {
  const lines = content.split('\n');
  let channelCount = 0;
  const groups = new Set();
  let currentGroup = "Generale";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Gestione EXTINF (canale)
    if (line.startsWith('#EXTINF:')) {
      // Cerca il gruppo in TUTTI i formati possibili
      const groupMatch = 
        line.match(/group-title="([^"]*)"/i) || 
        line.match(/tvg-group="([^"]*)"/i) ||
        line.match(/group-title='([^']*)'/i) ||
        line.match(/tvg-group='([^']*)'/i);
      
      if (groupMatch && groupMatch[1]) {
        currentGroup = groupMatch[1].trim();
        if (currentGroup) groups.add(currentGroup);
      } else if (currentGroup) {
        groups.add(currentGroup);
      }

      // Cerca l'URL successivo (salta righe EXTVLCOPT e altri metadati)
      let urlIndex = i + 1;
      while (urlIndex < lines.length) {
        const nextLine = lines[urlIndex].trim();
        if (nextLine && !nextLine.startsWith('#') && nextLine.match(/^https?:\/\//)) {
          // Trovato URL valido - conta come canale
          channelCount++;
          i = urlIndex; // Avanza all'URL
          break;
        }
        urlIndex++;
        if (urlIndex - i > 5) break; // Timeout di sicurezza
      }
    }
    // Gestione EXTGRP (cambio gruppo esplicito)
    else if (line.startsWith('#EXTGRP:')) {
      currentGroup = line.substring(8).trim() || "Generale";
      if (currentGroup) groups.add(currentGroup);
    }
    // Gestione gruppo nel formato alternativo
    else if (line.startsWith('#EXTGROUP:')) {
      currentGroup = line.substring(10).trim() || "Generale";
      if (currentGroup) groups.add(currentGroup);
    }
  }

  // Se non abbiamo trovato gruppi ma abbiamo canali, aggiungi "Generale"
  if (groups.size === 0 && channelCount > 0) {
    groups.add("Generale");
  }

  return { 
    channelCount, 
    groupCount: groups.size 
  };
}


// FUNZIONE: Modifica la funzione renderPlaylistList per utilizzare renderGroupedChannelList
async function renderPlaylistList() {
    //  Forza l'uscita dalla vista Preferiti
    showingFavorites = false;
    updateToggleState();
    saveViewModePreference(currentViewMode);

    //  Segnala che la vista playlist è aperta
    window.isPlaylistView = true;
    window.isEPGView = false;

    //  Recupera tutte le playlist e quella attiva
    const playlists = await getAllM3UUrls();
    const activePlaylist = await getActivePlaylist();

    //  Gruppo per caricare file locale e da URL
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

    //  Gruppo con playlist salvate - aggiungi il flag __isActive
    const savedGroup = {
        name: "Playlist Salvate",
        channels: (playlists || []).map(pl => ({
            name: pl.name || 'Playlist senza nome',
            logo: "tasto9-2.png",
            url: pl.url,
            __playlistId: pl.id,
            __raw: pl,
            __isActive: activePlaylist && pl.id === activePlaylist.id
        }))
    };

    const groups = [localGroup, savedGroup];

    //  Renderizza usando il renderer esistente
    renderGroupedChannelList(groups, { context: 'playlists' });

    //  Post-processing: gestione click, evidenziazioni e informazioni extra
    setTimeout(() => {
        document.querySelectorAll('#channelList .channel-item').forEach(item => {
            const url = item.getAttribute('data-url');
            const def = groups
                .flatMap(g => g.channels)
                .find(c => c.url === url || (c.__special && (url === '#local' || url === '#url')));
            if (!def) return;

            //  Rimuovi evidenziazioni esistenti
            item.classList.remove('active-channel');

            //  Applica evidenziazione solo alla playlist attiva
            if (def.__isActive) item.classList.add('active-channel');

            //  Disabilita drag & drop
            item.removeAttribute('draggable');
            item.removeAttribute('data-key');
            item.removeAttribute('data-group-index');

            //  Gestore click per playlist speciali o salvate
            if (def.__special) {
                if (url === "#local") {
                    // Apri input file temporaneo
                    item.onclick = () => {
                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.accept = '.m3u,.m3u8';
                        fileInput.style.display = 'none';

                        fileInput.onchange = async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;

                            const reader = new FileReader();
                            reader.onload = async function (e) {
                                const text = e.target.result;

                                // Salva file in IndexedDB
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

                                // Aggiorna le UI
                                refreshPlaylistUIs();

                                document.body.removeChild(fileInput);
                            };

                            reader.readAsText(file);
                        };

                        document.body.appendChild(fileInput);
                        fileInput.click();
                    };
                } else if (url === "#url") {
                    // Apri bottom sheet già definito
                    item.onclick = () => {
                        if (typeof openBottomSheet === 'function') {
                            openBottomSheet();
                        } else {
                            const sheet = document.getElementById('m3uUrlBottomSheet');
                            const overlay = document.getElementById('bottomSheetOverlay');
                            if (sheet) {
                                sheet.classList.remove('hidden');
                                if (overlay) overlay.classList.remove('hidden');
                                setTimeout(() => {
                                    sheet.classList.add('open');
                                    if (overlay) overlay.classList.add('open');
                                }, 10);
                                setTimeout(() => document.getElementById('modalM3UName')?.focus(), 300);
                            }
                        }
                    };
                }
            } else if (def.__playlistId) {
                //  Clic su playlist salvata (versione senza flicker)
                item.onclick = async () => {
                    try {
                        window.suppressPlaylistRefresh = true;

                        const rec = await getM3UById(def.__playlistId);
                        let text = rec?.content;
                        if (!text) {
                            text = await downloadM3U(rec.url);
                            await updateM3URecord(rec.id, { content: text, lastFetched: Date.now() });
                        }

                        await setOnlyActive(rec.id);
                        await parseM3U(text, false);
                        updateButtons();

                        window.isPlaylistView = false;
                        if (typeof showChannelList === 'function') showChannelList();
                    } finally {
                        window.suppressPlaylistRefresh = false;
                        if (typeof refreshPlaylistUIs === 'function') refreshPlaylistUIs();
                    }
                };
            }

            //  Gestione eliminazione playlist
            const del = item.querySelector('.delete-channel') || item.querySelector('.delete-url-btn');
            if (del) {
                del.title = 'Elimina playlist';
                del.onclick = async (e) => {
                    e.stopPropagation();
                    if (!confirm('Eliminare questa playlist salvata?')) return;
                    try {
                        await deleteM3UUrl(def.__playlistId);
                        showNotification('Playlist eliminata');

                        if (def.__isActive) {
                            const remaining = await getAllM3UUrls();
                            if (remaining.length > 0) {
                                await setOnlyActive(remaining[0].id);
                                const rec = await getM3UById(remaining[0].id);
                                if (rec && rec.content) await parseM3U(rec.content, true);
                            } else {
                                channels = [];
                                groupedChannels = [];
                                renderGroupedChannelList(groupedChannels, { context: 'channels' });
                            }
                        }

                        await renderPlaylistList();
                        refreshPlaylistUIs();
                    } catch (err) {
                        console.error('Errore eliminazione playlist', err);
                        alert('Errore durante la cancellazione della playlist.');
                    }
                };
            }

            //  Aggiungi seconda riga con URL o conteggi
            if (!def.__special && def.url) {
                const infoContainer = item.querySelector('.channel-name')?.parentElement || item.children[1];
                if (infoContainer && !infoContainer.querySelector('.current-program')) {
                    const infoLine = document.createElement('div');
                    infoLine.className = 'current-program';

                    const showUrl = localStorage.getItem("zappone_show_playlist_url") === "true";

                    if (showUrl) {
                        infoLine.textContent = def.url;
                    } else {
                        if (def.__raw && def.__raw.content) {
                            try {
                                const { channelCount, groupCount } = countChannelsAndGroups(def.__raw.content);
                                infoLine.textContent = `${channelCount} canali, ${groupCount} gruppi`;
                            } catch (e) {
                                console.error("Errore nel conteggio canali e gruppi:", e);
                                infoLine.textContent = "Dati non disponibili";
                            }
                        } else {
                            infoLine.textContent = "Dati non disponibili";
                        }
                    }

                    infoContainer.appendChild(infoLine);
                }
            }
        });
    }, 50);
}


async function renderEPGManager() {
    // Esci dalla vista playlist se presente
    showingFavorites = false;
    updateToggleState();
    saveViewModePreference(currentViewMode);

    // Segnala vista EPG
    window.isPlaylistView = false;
    window.isEPGView = true;

    const epgs = await getAllEPGUrls();
    const activeEPG = await getActiveEPG();

    const localGroup = {
        name: "Caricamento",
        channels: [
            {
                name: "Aggiungi EPG",
                logo: "add-epg.svg",
                url: "#url",
                __special: true
            }
        ]
    };

    const savedGroup = {
        name: "EPG Salvati",
        channels: (epgs || []).map(e => ({
            name: e.name || 'EPG senza nome',
            logo: "tasto3-1.png",
            url: e.url,
            __epgId: e.id,
            __raw: e,
            __isActive: activeEPG && e.id === activeEPG.id
        }))
    };

    const groups = [localGroup, savedGroup];

    renderGroupedChannelList(groups, { context: 'epg' });

    // Post-processing click handlers
    setTimeout(() => {
        document.querySelectorAll('#channelList .channel-item').forEach(item => {
            const url = item.getAttribute('data-url');
            const def = groups.flatMap(g => g.channels).find(c => c.url === url || (c.__special && (url === '#local' || url === '#url')));
            if (!def) return;

            // --- HIGHLIGHT: evidenzia l'EPG attivo (se impostato) ---
            item.classList.remove('active-channel'); // rimuove eventuali residui
            if (def.__isActive) {
                item.classList.add('active-channel');
            }

            // Rimuovi drag/drop (la stella non viene più creata in modalità EPG)
            item.removeAttribute('draggable');
            item.removeAttribute('data-key');
            item.removeAttribute('data-group-index');

            // Only add reload icon for saved EPG items (skip the 'Caricamento' special entries)
            if (!def.__special && def.__epgId) {
                const reloadIcon = document.createElement('span');
                reloadIcon.className = 'reload-epg';
                reloadIcon.innerHTML = '↻';
                reloadIcon.title = 'Ricarica questo EPG da remoto';

                reloadIcon.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!def || !def.url) return;

                    try {
                        reloadIcon.classList.add('loading');
                        await downloadEPG(def.url);
                        showNotification(`EPG "${def.name}" ricaricato con successo`);
                    } catch (err) {
                        console.error(err);
                        showNotification('Errore nel ricaricare l\'EPG', true);
                    } finally {
                        reloadIcon.classList.remove('loading');
                    }
                });

                const del = item.querySelector('.delete-channel');
                if (del) {
                    // inserisce la freccia subito PRIMA del cestino
                    del.parentNode.insertBefore(reloadIcon, del);
                } else {
                    // se per qualche motivo non c'è il cestino, la metto in fondo
                    item.appendChild(reloadIcon);
                }
            }

            // Click su special (locale/URL)
            if (def.__special) {
                if (url === "#local") {
                    item.onclick = () => document.getElementById('epgFileInput').click();
                } else if (url === "#url") {
                    item.onclick = () => {
                        if (typeof openEPGBottomSheet === 'function') openEPGBottomSheet();
                        else console.warn('openEPGBottomSheet non trovata');
                    };
                }
            }
            // Click su EPG salvato
            else if (def.__epgId) {
                item.onclick = async () => {
                    const rec = await getEPGById(def.__epgId);
                    if (!rec) return;

                    if (rec.content) {
                        try {
                            let data;
                            const responseText = rec.content;
                            if (responseText.trim().startsWith('<') || responseText.includes('<tv>')) {
                                const parser = new DOMParser();
                                const xmlDoc = parser.parseFromString(responseText, "text/xml");
                                data = parseXMLTV(xmlDoc);
                            } else {
                                data = JSON.parse(responseText);
                            }
                            epgData = data;
                            showNotification('EPG caricato da salvataggio');
                        } catch (err) {
                            console.warn('Parsing EPG salvato fallito, provo a scaricare da remoto', err);
                            await downloadEPG(rec.url);
                        }
                    } else {
                        await downloadEPG(rec.url);
                    }

                    await setOnlyActiveEPG(rec.id);

                    // Aggiorna UI
                    if (window.currentChannelUrl) {
                        const currentChannel = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
                        if (currentChannel) showChannelEPG(currentChannel);
                    }

                    // --- Apri direttamente la vista Full EPG e mostra il contenuto appena caricato ---
                    await setOnlyActiveEPG(rec.id);

                    // Nascondi lista/player (comportamento analogo a fullEpgBtn)
                    document.getElementById('channelListContainer')?.classList.add('hidden');
                    document.getElementById('playerContainer')?.classList.add('hidden');

                    // Mostra il container Full EPG
                    document.getElementById('fullEpgContainer')?.classList.remove('hidden');

                    // Renderizza la lista completa EPG usando epgData (già caricato)
                    renderFullEPGList();
                };

                // Pulsante elimina EPG
                const del = item.querySelector('.delete-channel');
                if (del) {
                    del.title = 'Elimina EPG';
                    del.onclick = async (e) => {
                        e.stopPropagation();
                        if (!confirm('Eliminare questo EPG salvato?')) return;
                        try {
                            // leggo lo stato dei record PRIMA della cancellazione
                            const allBefore = await getAllEPGUrls();
                            const idx = allBefore.findIndex(r => r.id === def.__epgId);
                            const wasActive = allBefore.some(r => r.id === def.__epgId && r.isActive);

                            // cancello il record
                            console.log('Deleting EPG, id:', def.__epgId);
                            await deleteEPGUrl(def.__epgId);

                            // lista rimanente
                            const remaining = await getAllEPGUrls();

                            if (!remaining || remaining.length === 0) {
                                // nessun EPG rimanente -> svuoto memoria EPG
                                epgData = [];
                                showNotification('EPG eliminato. Nessun EPG rimasto.');
                                renderEPGManager();
                                if (document.getElementById('fullEpgContainer') && !document.getElementById('fullEpgContainer').classList.contains('hidden')) {
                                    renderFullEPGList();
                                }
                                return;
                            }

                            // se l'EPG eliminato era attivo, ne scelgo uno nuovo (next o previous)
                            if (wasActive) {
                                let candidate = null;
                                if (idx >= 0 && idx < remaining.length) {
                                    candidate = remaining[idx]; // il successivo nella stessa posizione
                                } else {
                                    candidate = remaining[Math.max(0, remaining.length - 1)]; // altrimenti ultimo disponibile
                                }

                                if (candidate) {
                                    // segna il nuovo EPG come attivo in DB
                                    await setOnlyActiveEPG(candidate.id);

                                    // carica il contenuto in memoria (epgData)
                                    const rec = await getEPGById(candidate.id);
                                    if (rec && rec.content) {
                                        try {
                                            let data;
                                            const responseText = rec.content;
                                            if (typeof responseText === 'string' && (responseText.trim().startsWith('<') || responseText.includes('<tv>'))) {
                                                const parser = new DOMParser();
                                                const xmlDoc = parser.parseFromString(responseText, 'text/xml');
                                                data = parseXMLTV(xmlDoc);
                                            } else {
                                                data = JSON.parse(responseText);
                                            }
                                            epgData = data;
                                            showNotification(`EPG attivo: ${rec.name}`);
                                        } catch (errParse) {
                                            console.warn('Parsing EPG salvato fallito, provo a scaricare da remoto', errParse);
                                            try {
                                                await downloadEPG(candidate.url);
                                            } catch (errDown) {
                                                console.error('Download fallback fallito', errDown);
                                                epgData = [];
                                            }
                                        }
                                    } else {
                                        // se non c'è content salvato, provo a scaricarlo
                                        try {
                                            await downloadEPG(candidate.url);
                                        } catch (errDown) {
                                            console.error('Download fallito', errDown);
                                            epgData = [];
                                        }
                                    }
                                }
                            }

                            showNotification('EPG eliminato');
                            renderEPGManager();
                            if (document.getElementById('fullEpgContainer') && !document.getElementById('fullEpgContainer').classList.contains('hidden')) {
                                renderFullEPGList();
                            }
                        } catch (err) {
                            console.error('Errore eliminazione EPG:', err);
                            alert('Errore durante la cancellazione dell\'EPG: ' + (err && err.message ? err.message : err));
                        }
                    };
                }
            }

// Aggiungi seconda riga con URL o info EPG (analogo a renderPlaylistList)
// Aggiungi seconda riga con URL o info EPG (analogo a renderPlaylistList)
if (!def.__special && def.url) {
    const infoContainer = item.querySelector('.channel-name')?.parentElement || item.children[1];
    
    // Rimuovi eventuali second righe esistenti prima di crearne una nuova
    const existingInfoLine = infoContainer.querySelector('.current-program');
    if (existingInfoLine) {
        existingInfoLine.remove();
    }
    
    const infoLine = document.createElement('div');
    infoLine.className = 'current-program';
    
    const showUrl = localStorage.getItem("zappone_show_playlist_url") === "true";
    
    if (showUrl) {
        // Mostra URL
        infoLine.textContent = def.url;
    } else {
        // Mostra info EPG: numero canali e data/ora
        if (def.__raw) {
            try {
                let channelCount = 0;
                let dateInfo = "Data non disponibile";
                let statusPrefix = "Aggiornato il:";
                
                // Conta canali EPG
                if (def.__raw.content) {
                    const epgData = JSON.parse(def.__raw.content);
                    channelCount = Array.isArray(epgData) ? epgData.length : 0;
                }
                
                // Data EPG (usa lastFetched o timestamp)
                const epgDate = def.__raw.lastFetched || def.__raw.timestamp;
                if (epgDate) {
                    const date = new Date(epgDate);
                    const now = new Date();
                    dateInfo = date.toLocaleDateString() + ' ' + 
                              date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    
                    // Controlla se l'EPG è scaduto (più vecchio di 24 ore)
                    const hoursDiff = (now - date) / (1000 * 60 * 60);
                    if (hoursDiff > 24) {
                        statusPrefix = "SCADUTO:";
                        infoLine.classList.add('expired'); // Aggiungi classe per styling
                    }
                }
                
                infoLine.textContent = `${channelCount} canali EPG, ${statusPrefix} ${dateInfo}`;
                infoLine.title = `Ultimo aggiornamento: ${dateInfo}`;
                
            } catch (e) {
                console.error("Errore nel recupero info EPG:", e);
                infoLine.textContent = "Dati EPG non disponibili";
            }
        } else {
            infoLine.textContent = "Dati EPG non disponibili";
        }
    }
    
    infoContainer.appendChild(infoLine);
}
        });
    }, 50);
}



// BLOCCO FUNZIONI PER GESTIONE INDEXEDDB

const IDB_NAME = 'M3UPlaylistsDB';
const IDB_VERSION = 3; // bump per creare lo store 'epgUrls'
const IDB_STORE_NAME = 'm3uUrls';
const IDB_STORE_NAME_EPG = 'epgUrls'; // nuovo store per EPG salvati


async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // store playlist (già presente)
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_active', 'active', { unique: false });
        store.createIndex('by_url', 'url', { unique: false });
      }

      // 🔥 nuovo store per i preferiti
      if (!db.objectStoreNames.contains('favorites')) {
        const fav = db.createObjectStore('favorites', { keyPath: 'key' });
        fav.createIndex('by_order', 'order', { unique: false });
      }

// nuovo store EPG
if (!db.objectStoreNames.contains(IDB_STORE_NAME_EPG)) {
  const epgStore = db.createObjectStore(IDB_STORE_NAME_EPG, { keyPath: 'id', autoIncrement: true });
  epgStore.createIndex('by_url', 'url', { unique: false });
  epgStore.createIndex('by_active', 'isActive', { unique: false });
}

    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}


// FUNZIONE: Inizializza e restituisce l'istanza del database IndexedDB
async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    // Gestisce la creazione dello store se non esiste (durante upgrade)
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
      }

// nuovo store EPG
if (!db.objectStoreNames.contains(IDB_STORE_NAME_EPG)) {
  const epgStore = db.createObjectStore(IDB_STORE_NAME_EPG, { keyPath: 'id', autoIncrement: true });
  epgStore.createIndex('by_url', 'url', { unique: false });
  epgStore.createIndex('by_active', 'isActive', { unique: false });
}

    };
  });
}


// FUNZIONE: Salva un URL M3U con nome breve nel database
async function saveM3UUrl(url, name) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);

  return new Promise((resolve, reject) => {
    // Crea un nuovo record con URL, nome e timestamp
    const request = store.add({ 
      url, 
      name, 
      timestamp: Date.now() 
    });
    
    request.onsuccess = () => resolve(request.result); // Restituisce l'ID auto-generato
    request.onerror = () => reject(request.error);
  });
}


// FUNZIONE: Aggiorna un record esistente nel database con nuovi dati
async function updateM3URecord(id, patch) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);

  // Prima recupera il record esistente
  const rec = await new Promise((res, rej) => {
    const g = store.get(id);
    g.onsuccess = () => res(g.result);
    g.onerror = () => rej(g.error);
  });
  
  if (!rec) return false; // Se il record non esiste, esci

  // Applica le modifiche (merge) al record esistente
  Object.assign(rec, patch);
  
  // Salva il record aggiornato
  store.put(rec);
  return true;
}


// FUNZIONE: Recupera un record specifico dal database usando l'ID
async function getM3UById(id) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readonly');
  const store = tx.objectStore(IDB_STORE_NAME);
  
  return new Promise((res, rej) => {
    const g = store.get(id);
    g.onsuccess = () => res(g.result);
    g.onerror = () => rej(g.error);
  });
}


// FUNZIONE: Recupera tutti gli URL M3U salvati nel database
async function getAllM3UUrls() {
  try {
    const db = await initIndexedDB();
    const transaction = db.transaction([IDB_STORE_NAME], 'readonly');
    const store = transaction.objectStore(IDB_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Errore nel recupero URL:', error);
    return []; // Ritorna array vuoto in caso di errore
  }
}


// FUNZIONE: Elimina un URL M3U dal database usando l'ID
async function deleteM3UUrl(id) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);

  return new Promise((resolve, reject) => {
    // Prima recupera il record per logging (opzionale)
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        console.log("Cancello record:", record); // Log per debug
      }
      
      // Procedi con l'eliminazione
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}


// FUNZIONI AVANZATE PER GESTIONE PLAYLIST ATTIVA
// FUNZIONE: Imposta una playlist come attiva (solo una alla volta può essere attiva)
async function setActivePlaylist(id) {
  const rec = await getM3UById(id);
  if (!rec) return; // Esci se il record non esiste
  
  // Segna questa playlist come attiva
  await updateM3URecord(id, { isActive: true });

  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);
  
  // Scansiona tutti i record e disattiva gli altri
  store.openCursor().onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      // Disattiva tutte le altre playlist attive che non sono questa
      if (cursor.value.id !== id && cursor.value.isActive) {
        cursor.value.isActive = false;
        cursor.update(cursor.value);
      }
      cursor.continue();
    }
  };
}


// FUNZIONE: Trova una playlist nel database usando l'URL
async function findM3UByUrl(url) {
  const all = await getAllM3UUrls();
  return all.find(r => r.url === url) || null;
}


// FUNZIONE: Imposta solo una playlist come attiva (disattivando tutte le altre)
async function setOnlyActive(id) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);

  return new Promise((res, rej) => {
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const rec = cursor.value;
        
        // Attiva la playlist specificata, disattiva tutte le altre
        if (rec.id === id) {
          if (!rec.isActive) { 
            rec.isActive = true; 
            cursor.update(rec); 
          }
        } else if (rec.isActive) {
          rec.isActive = false;
          cursor.update(rec);
        }
        cursor.continue();
      } else {
        res(true); // Operazione completata
      }
    };
    req.onerror = (err) => rej(err.target?.error || err);
  });
}


// FUNZIONE: Salva/aggiorna una playlist e la imposta come attiva (funzione principale)
async function saveAndActivateM3U({ url, name, content }) {
  // Cerca se la playlist esiste già
  let rec = await findM3UByUrl(url);
  
  if (!rec) {
    // Nuova playlist: crea record e imposta come attiva
    const fallbackName = name || (url && url.split('/').pop()) || 'local';
    const id = await saveM3UUrl(url, fallbackName);
    await updateM3URecord(id, { 
      content, 
      lastFetched: Date.now(), 
      name: fallbackName, 
      filename: fallbackName,   // <-- aggiunto
      isActive: true 
    });
    await setOnlyActive(id);
    rec = await getM3UById(id);
  } else {
    // Playlist esistente: aggiorna contenuto e imposta come attiva
    const newName = name || rec.name || (url && url.split('/').pop()) || 'local';
    await updateM3URecord(rec.id, { 
      content, 
      lastFetched: Date.now(), 
      name: newName, 
      filename: newName,   // <-- aggiunto
      isActive: true 
    });
    await setOnlyActive(rec.id);
    rec = await getM3UById(rec.id);
  }

  return rec; // Restituisce il record salvato/aggiornato
}


// FUNZIONE: Recupera la playlist attualmente attiva
async function getActivePlaylist() {
  const all = await getAllM3UUrls();
  if (!all || all.length === 0) return null;
  
  // Cerca prima una playlist esplicitamente contrassegnata come attiva
  let active = all.find(r => r.isActive);
  
  if (!active) {
    // Fallback: usa la playlist più recente (per timestamp)
    const sorted = all.slice().sort((a, b) => (b.lastFetched || 0) - (a.lastFetched || 0));
    active = sorted[0];
  }
  
  return active || null;
}


// FUNZIONE: Utility per gestire l'URL M3U di default (separato dalle playlist utente)
async function setDefaultM3U(url) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);
  
  // Usa un ID fisso per il default per evitare duplicati
  await store.put({ id: "default_m3u", url });
}


// FUNZIONE: Recupera l'URL M3U di default
async function getDefaultM3U() {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readonly');
  const store = tx.objectStore(IDB_STORE_NAME);

  return new Promise(res => {
    const req = store.get("default_m3u");
    req.onsuccess = () => {
      // Fallback alla costante DEFAULT_PLAYLIST_URL se non trovato
      res(req.result?.url || DEFAULT_PLAYLIST_URL);
    };
    req.onerror = () => {
      // Fallback di sicurezza in caso di errore
      res(DEFAULT_PLAYLIST_URL);
    };
  });
}


// FUNZIONE  helper: chiama entrambi i renderer quando cambia DB
// Sostituisci/aggiorna la funzione refreshPlaylistUIs esistente
function refreshPlaylistUIs() {
  // aggiorna la lista nelle impostazioni (sempre)
  if (typeof loadM3UUrlList === 'function') loadM3UUrlList();

  // se è temporaneamente disabilitato, non ricostruire la vista playlists
  if (window.suppressPlaylistRefresh) return;

  // aggiorna la finestra playlists se è aperta
  if (window.isPlaylistView && typeof renderPlaylistList === 'function') {
    renderPlaylistList();
  }
}


// ===== Helpers IDB per Preferiti =====
async function idbGetAllFavorites() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readonly');
    const store = tx.objectStore('favorites');
    const idx = store.index('by_order');
    const results = [];
    idx.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { results.push(cursor.value); cursor.continue(); }
      else resolve(results);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbPutFavorite(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDeleteFavorite(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearFavorites() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbUpdateFavoriteKey(oldKey, newRecord) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    const store = tx.objectStore('favorites');
    store.delete(oldKey);
    store.put(newRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function persistFavoritesOrder(favList) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    const store = tx.objectStore('favorites');
    
    // Prima cancella tutti i record esistenti
    const clearRequest = store.clear();
    
    clearRequest.onsuccess = () => {
      // Poi aggiungi i record aggiornati
      const requests = [];
      favList.forEach((ch, idx) => {
        const key = getChannelKey(ch);
        const rec = { 
          key: key,
          name: ch.name,
          url: ch.url,
          group: ch.group || 'Favorites',
          logo: ch.logo || '',
          type: ch.type || 'channel',
          order: idx
        };
        requests.push(store.put(rec));
      });
      
      // Aspetta che tutte le operazioni siano completate
      Promise.all(requests)
        .then(() => resolve())
        .catch(err => reject(err));
    };
    
    clearRequest.onerror = () => reject(clearRequest.error);
    tx.onerror = () => reject(tx.error);
  });
}


// Helpers per EPG (store: epgUrls)
async function saveEPGUrl(url, name) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((resolve, reject) => {
    const req = store.add({ url, name, timestamp: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}


async function updateEPGRecord(id, patch) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  const rec = await new Promise((res, rej) => {
    const g = store.get(id);
    g.onsuccess = () => res(g.result);
    g.onerror = () => rej(g.error);
  });
  if (!rec) return false;
  Object.assign(rec, patch);
  store.put(rec);
  return true;
}


async function getEPGById(id) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readonly');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((res, rej) => {
    const r = store.get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}


async function getAllEPGUrls() {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readonly');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}


async function deleteEPGUrl(id) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      store.delete(id).onsuccess = () => resolve(true);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}


async function findEPGByUrl(url) {
  const all = await getAllEPGUrls();
  return all.find(r => r.url === url) || null;
}


async function setOnlyActiveEPG(id) {
  const db = await initIndexedDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((res, rej) => {
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const rec = cursor.value;
        if (rec.id === id) {
          if (!rec.isActive) { rec.isActive = true; cursor.update(rec); }
        } else if (rec.isActive) {
          rec.isActive = false; cursor.update(rec);
        }
        cursor.continue();
      } else res(true);
    };
    req.onerror = (err) => rej(err.target?.error || err);
  });
}


async function saveAndActivateEPG({ url, name, content }) {
  // content può essere JSON string (da downloadEPG) o XML/testo
   // Validazione prima di salvare
  if (!content || content === 'null' || content === 'undefined') {
    throw new Error('Contenuto EPG non valido per il salvataggio');
  }

let rec = await findEPGByUrl(url);
  if (!rec) {
    const fallbackName = name || (url && url.split('/').pop()) || 'local';
    const id = await saveEPGUrl(url, fallbackName);
    await updateEPGRecord(id, { content, lastFetched: Date.now(), name: fallbackName, filename: fallbackName, isActive: true });
    await setOnlyActiveEPG(id);
    rec = await getEPGById(id);
  } else {
    const newName = name || rec.name || (url && url.split('/').pop()) || 'local';
    await updateEPGRecord(rec.id, { content, lastFetched: Date.now(), name: newName, filename: newName, isActive: true });
    await setOnlyActiveEPG(rec.id);
    rec = await getEPGById(rec.id);
  }
  return rec;
}


async function getActiveEPG() {
  const all = await getAllEPGUrls();
  if (!all || all.length === 0) return null;
  let active = all.find(r => r.isActive);
  if (!active) {
    const sorted = all.slice().sort((a,b) => (b.lastFetched || 0) - (a.lastFetched || 0));
    active = sorted[0];
  }
  return active || null;
}

// FINE BLOCCO FUNZIONI INDEXEDDB


// Blocco EPG Completo
// ---- FULL EPG ----

// Pulsante per aprire EPG Completo
document.getElementById('fullEpgBtn').addEventListener('click', () => {
  document.getElementById('channelListContainer').classList.add('hidden');
  document.getElementById('playerContainer').classList.add('hidden');
  document.getElementById('fullEpgContainer').classList.remove('hidden');
  renderFullEPGList();
});

// ---------- Helper: chiude la vista Full EPG + drawer dettaglio (copia comportamento "Play") ----------
function closeFullEPG() {
  const drawer = document.getElementById('channelEpgDrawer');
  const fullEpgContainer = document.getElementById('fullEpgContainer');
  const channelEpgDetail = document.getElementById('channelEpgDetail');
  const channelListContainer = document.getElementById('channelListContainer');
  const playerContainer = document.getElementById('playerContainer');

  // 1) chiudi drawer (stessa logica usata dal pulsante Play dentro il drawer)
  if (drawer) {
    drawer.classList.remove('open');
    // manteniamo il delay per permettere la transizione CSS (come nel codice originale)
    setTimeout(() => drawer.classList.add('hidden'), 300);
  }

  // 2) nascondi le viste EPG
  if (fullEpgContainer && !fullEpgContainer.classList.contains('hidden')) {
    fullEpgContainer.classList.add('hidden');
  }
  if (channelEpgDetail && !channelEpgDetail.classList.contains('hidden')) {
    channelEpgDetail.classList.add('hidden');
  }

  // 3) mostra lista canali e player come fa il Play handler
  channelListContainer?.classList.remove('hidden');
  if (playerContainer) {
    playerContainer.classList.remove('hidden');
    // ripristina eventuale display inline che il codice altrove può usare
    playerContainer.style.display = '';
  }

  // 4) stato logico coerente
  window.isEPGView = false;
}


// Pulsante "indietro" dalla vista EPG Completo
const fullEpgBackBtn = document.getElementById('fullEpgBackBtn');
if (fullEpgBackBtn) {
  fullEpgBackBtn.addEventListener('click', () => {
    closeFullEPG();
  });
}


// Render lista canali con programma corrente (EPG completo) - versione aggiornata
function renderFullEPGList() {
  const list = document.getElementById('fullEpgList');
  const header = document.querySelector('#fullEpgContainer .group-header');
  list.innerHTML = '';

  // se non ci sono dati EPG
  if (!epgData || !epgData.length) {

    // nascondi l'header "EPG completo" (back + titolo)
    if (header) header.style.display = 'none';

    // mostra l'immagine placeholder "no-epg.png"
    const img = document.createElement('img');
    img.src = 'no-epg.png';
    img.alt = 'Nessun EPG disponibile';
    img.className = 'no-epg';
    list.appendChild(img);
    return;
  }

  // se ci sono dati -> assicurati che l'header sia visibile
  if (header) header.style.display = '';

  // Applica la classe corretta per la visualizzazione (list-view | grid-view)
  list.className = 'group-content ' + currentViewMode + '-view';

  const isGridView = currentViewMode === 'grid';

  epgData.forEach(epgChannel => {
    const item = document.createElement('div');
    item.className = 'channel-item ' + currentViewMode; // es. "channel-item grid"
    item.setAttribute('data-name', (epgChannel.name || '').toLowerCase());

    // logo
    const logo = document.createElement('img');
    logo.className = 'channel-logo';
    logo.dataset.src = epgChannel.logo || 'img/placeholder.png';
    logo.onerror = function() {
      this.src = '';
      this.style.backgroundColor = '#2a2d36';
    };
    item.appendChild(logo);

    // contenitore del nome
    const nameContainer = document.createElement('div');
    nameContainer.style.flex = '1';
    nameContainer.style.minWidth = '0';

    // titolo canale
    const title = document.createElement('div');
    title.className = 'channel-name ' + (isGridView ? 'grid-name' : 'list-name');
    title.textContent = epgChannel.name || 'Sconosciuto';
    nameContainer.appendChild(title);

    // programma corrente (solo in list view)
    const prog = getCurrentProgramInfo({ name: epgChannel.name }) || {};
    if (!isGridView && prog && prog.title) {
      const cur = document.createElement('div');
      cur.className = 'current-program';
      cur.textContent = prog.title;
      nameContainer.appendChild(cur);
    }

    item.appendChild(nameContainer);

    // click → apre il dettaglio EPG (non riproduce)
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      openChannelEpgDrawer(epgChannel);
    });

    list.appendChild(item);
  });

  // Lazy loading delle immagini (se disponibile)
  if (typeof lazyLoadImages === 'function') lazyLoadImages();
}


// Helper: trova il canale nella playlist partendo dall'epgChannel
async function findChannelFromEPG(epgChannel) {
  if (!epgChannel) return null;
  const epgName = (epgChannel.name || '').trim();
  const normEpg = normalizeChannelName(epgName);
  
  console.log('🔍 Cercando canale EPG:', epgName, 'Normalizzato:', normEpg);

  // 🔥 FORZA la sincronizzazione PRIMA di tutto
  await loadFavorites(); // Ricarica i preferiti dal DB
  rebuildIndexMaps();    // Ricostruisci le mappe

  // 🔥 CERCA PRIMA NELLA LISTA PRINCIPALE (channels) - più probabile
  let foundChannel = null;
  let fromFavorites = false;

  // 1. Cerca nella lista principale
  for (let ch of channels) {
    const normCh = normalizeChannelName(ch.name);
    if (normCh === normEpg) {
      foundChannel = ch;
      fromFavorites = false;
      console.log('✅ Trovato in lista principale:', ch.name);
      break;
    }
  }

  // 2. Se non trovato, cerca nei preferiti
  if (!foundChannel) {
    for (let fav of favoriteChannels) {
      const normFav = normalizeChannelName(fav.name);
      if (normFav === normEpg) {
        foundChannel = fav;
        fromFavorites = true;
        console.log('✅ Trovato nei preferiti:', fav.name);
        break;
      }
    }
  }

  // 3. Se ancora non trovato, prova matching "soft"
  if (!foundChannel) {
    console.log('🔍 Tentativo matching soft...');
    
    // Cerca match parziali in lista principale
    for (let ch of channels) {
      const normCh = normalizeChannelName(ch.name);
      if (normCh.includes(normEpg) || normEpg.includes(normCh)) {
        foundChannel = ch;
        fromFavorites = false;
        console.log('✅ Trovato con matching soft in lista principale:', ch.name);
        break;
      }
    }
    
    // Se ancora nulla, cerca nei preferiti
    if (!foundChannel) {
      for (let fav of favoriteChannels) {
        const normFav = normalizeChannelName(fav.name);
        if (normFav.includes(normEpg) || normEpg.includes(normFav)) {
          foundChannel = fav;
          fromFavorites = true;
          console.log('✅ Trovato con matching soft nei preferiti:', fav.name);
          break;
        }
      }
    }
  }

  if (foundChannel) {
    return { channel: foundChannel, fromFavorites: fromFavorites };
  }

  console.log('❌ Nessun match trovato per:', epgName);
  console.log('Canali disponibili:', channels.map(c => c.name));
  console.log('Preferiti disponibili:', favoriteChannels.map(f => f.name));
  return null;
}


// FUNZIONE Calcolo percentuale avanzamento 
function getProgramProgress(start, end) {
  const now = new Date();
  const startTime = new Date(start);
  const endTime = new Date(end);
  if (now <= startTime) return 0;
  if (now >= endTime) return 100;
  return ((now - startTime) / (endTime - startTime)) * 100;
}


// Vista EPG dettagliata per canale
function openChannelEpgDrawer(epgChannel){
  const drawer = document.getElementById('channelEpgDrawer');
  const title = document.getElementById('drawerChannelTitle');
  const progContainer = document.getElementById('drawerPrograms');
  const closeBtn = document.getElementById('drawerCloseBtn');

  const playerContainer = document.getElementById('playerContainer');
  const fullEpgContainer = document.getElementById('fullEpgContainer');
  const channelEpgDetail = document.getElementById('channelEpgDetail');
  const channelListContainer = document.getElementById('channelListContainer');

  // reset contenuto
  progContainer.innerHTML = '';
  title.textContent = (epgChannel.name || 'Canale') + " — Programmi";

  epgChannel.programs.forEach(pr => {
    const prEl = document.createElement('div');
    prEl.className = 'epg-program' + (isProgramCurrent(pr) ? ' current' : '');

    // calcola la data del programma
    const programDate = new Date(pr.start);
    const dateStr = programDate.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });

    const progressBar = isProgramCurrent(pr) ? `
      <div class="epg-progress-bar-container">
        <div class="epg-progress-bar" style="width: ${getProgramProgress(pr.start, pr.end)}%;"></div>
      </div>
    ` : '';

    prEl.innerHTML = `
      <div class="poster-with-date">
        <div class="epg-poster-container">
          <img class="epg-poster" src="${pr.poster || epgChannel.logo || 'img/placeholder.png'}" alt="">
        </div>
        <div class="epg-time">${dateStr}</div>
        <div class="epg-time">${formatTime(pr.start)} - ${formatTime(pr.end)}</div>
        ${progressBar}
      </div>
      <div class="epg-details">
        <div class="epg-title-row">
          <span class="epg-title">${pr.title || ''}</span>
          ${isProgramCurrent(pr) ? `<button class="play-btn" title="Riproduci programma corrente">▶</button>` : ''}
        </div>
        ${pr.subtitle ? `<div class="epg-subtitle">${pr.subtitle}</div>` : ''}
        ${pr.description ? `<div class="epg-description">${pr.description}</div>` : ''}
      </div>
    `;

    // collegamento pulsante play e resto della logica
    if (isProgramCurrent(pr)) {
      const playBtn = prEl.querySelector('.play-btn');
      if (playBtn) {
 playBtn.addEventListener('click', async (e) => {
          e.stopPropagation();

// 🔥 FORZA lo stato corretto PRIMA di cercare il canale
  const activePlaylist = await getActivePlaylist();
  if (activePlaylist && activePlaylist.content) {
    // Ricarica i canali dalla playlist attiva per sicurezza
    await parseM3U(activePlaylist.content, true, false);
  }
  
  await loadFavorites(); // Ricarica i preferiti
  rebuildIndexMaps();    // Ricostruisci le mappe

          const found = await findChannelFromEPG(epgChannel);
          if (found && found.channel) {

            // -------------------------
            // 1) Chiudi il drawer / full EPG (se necessario)
            //    closeFullEPG() deve evitare side-effect di cleanup aggressivi
            // -------------------------
            try {
              if (typeof closeFullEPG === 'function') closeFullEPG();
              else {
                // fallback: chiudi drawer locale
                drawer.classList.remove('open');
                setTimeout(() => drawer.classList.add('hidden'), 300);
              }
            } catch (err) {
              console.warn('closeFullEPG failed', err);
            }

            // -------------------------
            // 2) Sincronizza lo stato "Mostra Preferiti" SENZA dispatchare l'evento 'change'
            //    (evitiamo di lanciare il listener che può chiamare cleanupPlayers)
            // -------------------------
            try {
              const favToggle = document.getElementById('favoritesToggle');
              const shouldBeChecked = !!found.fromFavorites;

              // aggiorno variabili e UI internamente
              showingFavorites = shouldBeChecked;
              updateToggleState(); // mantiene il checkbox coerente (non scatena listener)
              // aggiorno la lista visibile manualmente per rispecchiare lo stato
              renderGroupedChannelList(showingFavorites ? groupedFavoriteChannels : groupedChannels, { context: 'channels' });
              // evita di dispatchare favToggle.dispatchEvent(new Event('change'))

            } catch (err) {
              console.warn('Fav toggle sync failed', err);
            }

            // -------------------------
            // 3) Avvia la riproduzione DOPO aver stabilizzato lo stato UI
            //    (playStream si occuperà di mostrare il player)
            // -------------------------
            try {
              // è importante chiamare playStream *dopo* aver aggiornato la UI
              playStream(found.channel, !!found.fromFavorites);
            } catch (err) {
              console.error('playStream error', err);
              if (typeof showNotification === 'function') showNotification('Errore avvio riproduzione', true);
            }

            // -------------------------
            // 4) Aggiorna la stella preferiti (sincronizzazione visuale)
            //    con un piccolo delay per lasciare che il DOM si stabilizzi
            // -------------------------
            setTimeout(() => {
              try {
                const key = getChannelKey(found.channel);
                const channelItem = document.querySelector(`#channelList .channel-item[data-key="${CSS.escape(key)}"]`);
                if (channelItem) {
                  const star = channelItem.querySelector('.favorite-star');
                  if (star) {
                    if (found.fromFavorites) {
                      star.classList.remove('inactive');
                      star.title = 'Rimuovi dai preferiti';
                    } else {
                      star.classList.add('inactive');
                      star.title = 'Aggiungi ai preferiti';
                    }
                  }
                }
              } catch (err) {
                console.warn('favorite star sync failed', err);
              }
            }, 120);

          } else {
            const tip = 'Canale non trovato nella playlist. Prova a rinominare il canale nella playlist per far combaciare il nome EPG, oppure carica una playlist che include il canale.';
            if (typeof showNotification === 'function') showNotification(tip, true);
            else alert(tip);
          }
        });
      }
    }

    progContainer.appendChild(prEl);
  });

  // apri drawer
  drawer.classList.remove('hidden');
  drawer.classList.add('open');

  // autoscroll al programma corrente
  requestAnimationFrame(() => {
    const target = progContainer.querySelector('.epg-program.current');
    if (target) {
      const targetPosition = target.offsetTop - progContainer.offsetTop - 12;
      progContainer.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  });

  // chiudi drawer clic sulla X
  closeBtn.onclick = () => {
    drawer.classList.remove('open');
    setTimeout(() => drawer.classList.add('hidden'), 300);
  };
}


function isProgramCurrent(pr){
  const now = Date.now();
  return new Date(pr.start).getTime() <= now && now < new Date(pr.end).getTime();
}


function formatTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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


async function autoLoadEPG(url, name = '', closeAfter = true) {
  if (!url || modalEPGLoadingLock) return;
  
  // Validazione URL di base
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
    const data = await downloadEPG(url);
    if (data === null) {
      if (closeAfter && typeof closeEPGBottomSheet === 'function') {
        closeEPGBottomSheet();
      }
      return;
    }

    // 🔹 Salva e attiva l'EPG come di consueto
    const rec = await saveAndActivateEPG({
      url,
      name: name || (new URL(url)).pathname.split('/').pop(),
      content: JSON.stringify(data)
    });

    epgData = data;
    showNotification('EPG salvato e caricato');

    // 🔹 Mostra direttamente la vista FULL EPG invece della lista
    try {
      if (rec && rec.id && typeof setOnlyActiveEPG === 'function') {
        await setOnlyActiveEPG(rec.id);
      }

      // Nascondi lista canali e player
      document.getElementById('channelListContainer')?.classList.add('hidden');
      document.getElementById('playerContainer')?.classList.add('hidden');

      // Mostra contenitore EPG completo
      const fullEpgContainer = document.getElementById('fullEpgContainer');
      if (fullEpgContainer) fullEpgContainer.classList.remove('hidden');

      // Renderizza l'EPG completo
      if (typeof renderFullEPGList === 'function') {
        renderFullEPGList();
      }

    } catch (uiErr) {
      console.error('Errore aprendo Full EPG dopo salvataggio:', uiErr);
      // fallback: aggiorna lista se qualcosa va storto
      if (typeof renderEPGManager === 'function') renderEPGManager();
    }

    // Chiudi il bottom sheet (dopo aver aperto il full EPG)
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

document.getElementById('loadM3UDefaultInSheet')?.addEventListener('click', async () => {
  const url = localStorage.getItem("zappone_default_m3u") || DEFAULT_PLAYLIST_URL;
  await loadRemoteM3U(url, true); // true = chiudi il bottom sheet dopo il caricamento
});


// --- New: Save / Cancel wiring for EPG bottom sheet ---
document.getElementById('epgSaveBtn')?.addEventListener('click', async (e) => {
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
  // reuse existing modalConfirm handler by invoking click on the hidden fallback button
  // this ensures identical behavior (validation, download, save, parsing)
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

document.getElementById('loadEPGDefaultInSheet')?.addEventListener('click', async () => {
  const url = localStorage.getItem('zappone_default_epg') || epgUrl;
  if (url) autoLoadEPG(url, 'Default EPG');
});

/* small enhancement: when user picks a local M3U file the change handler already parses & saves.
   just close the sheet after it finishes successfully by appending closeBottomSheet at the end
   of the existing fileInput change listener (see below). */


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



// Header search: toggle + focus + close on outside click / ESC
(function() {
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  const headerSearch = document.getElementById('headerSearchContainer');
  const searchInput = document.getElementById('searchInput');
  const clearBtn = headerSearch.querySelector('.clear-input');

  if (!searchToggleBtn || !headerSearch || !searchInput) return;

  function openSearch() {
    headerSearch.classList.add('expanded');
    headerSearch.setAttribute('aria-hidden', 'false');
    searchToggleBtn.setAttribute('aria-pressed', 'true');
    setTimeout(() => searchInput.focus(), 150);
  }

  function closeSearch() {
    // ❗️chiudi solo se il campo è vuoto
    if (searchInput.value.trim() !== '') return;
    headerSearch.classList.remove('expanded');
    headerSearch.setAttribute('aria-hidden', 'true');
    searchToggleBtn.setAttribute('aria-pressed', 'false');
  }

  searchToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (headerSearch.classList.contains('expanded')) closeSearch();
    else openSearch();
  });

  // chiudi se clicco fuori SOLO se campo vuoto
  document.addEventListener('click', (e) => {
    if (!headerSearch.contains(e.target) &&
        !searchToggleBtn.contains(e.target) &&
        headerSearch.classList.contains('expanded')) {
      closeSearch();
    }
  });

  // ESC per chiudere solo se campo vuoto
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
      if (!headerSearch.classList.contains('expanded')) {
        searchToggleBtn.focus();
      }
    }
  });

  // aggiorna visibilità quando l'utente digita o cancella
  searchInput.addEventListener('input', () => {
    if (searchInput.value.trim() !== '') {
      openSearch(); // assicura che resti visibile
    } else {
      closeSearch(); // chiudi se vuoto
    }
  });

  // pulsante × per cancellare
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      searchInput.focus();
    });
  }
})();


// NEW: gestione click + long-press su favoritesPill (fix: evita click dopo longpress)
(function setupFavoritesPill() {
  const pill = document.getElementById('favoritesPill');
  if (!pill) return;

  let ignoreNextClick = false;

  // click singolo: comportamento modificato
  pill.addEventListener('click', (e) => {
    if (ignoreNextClick) {
      ignoreNextClick = false; // reset dopo averlo ignorato
      e.stopPropagation();
      return;
    }
    
    // 👇 MODIFICA: Se siamo in deletionMode, usciamo con un click
    if (deletionMode) {
      toggleDeletionMode(); // Disattiva la deletionMode
      e.stopPropagation();
      return;
    }
    
    // comportamento originale (toggle Preferiti/Tutti)
    showingFavorites = !showingFavorites;
    saveViewModePreference(currentViewMode);
    renderGroupedChannelList(showingFavorites ? groupedFavoriteChannels : groupedChannels, { context: 'channels' });
    updateToggleState();
    closeFullEPG();
  });

  // Long-press implementation (rimane invariato)
  const startLongPress = (e) => {
    if (_pillLongPressTimer) clearTimeout(_pillLongPressTimer);
    _pillLongPressTimer = setTimeout(() => {
      toggleDeletionMode();
      ignoreNextClick = true; // 👈 ignora il click che segue il long press
      _pillLongPressTimer = null;
    }, PILL_LONGPRESS_MS);
  };

  const cancelLongPress = () => {
    if (_pillLongPressTimer) {
      clearTimeout(_pillLongPressTimer);
      _pillLongPressTimer = null;
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
  let expandState = true;        // true = expanded, false = collapsed
  let longPressTimer = null;
  const LONG_PRESS_DURATION = 600; // ms

  // flag per evitare che il click breve segua il longpress
  let longPressFired = false;

  // --- 🔹 Aggiorna lo stato visivo del pill (icona e classi)
  function updateViewModePill() {
    if (viewPillMode === 'viewMode') {
      viewModePill.classList.remove('collapse-mode');

      if (!viewModePill.querySelector('.icon-list') || !viewModePill.querySelector('.icon-grid')) {
        viewModePill.innerHTML = `
          <svg class="icon-list" width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <circle cx="4" cy="6" r="1"></circle>
            <circle cx="4" cy="12" r="1"></circle>
            <circle cx="4" cy="18" r="1"></circle>
          </svg>
          <svg class="icon-grid" width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        `;
      }

      if (currentViewMode === 'grid') {
        viewModePill.classList.add('grid-mode');
        viewModePill.classList.remove('list-mode');
      } else {
        viewModePill.classList.add('list-mode');
        viewModePill.classList.remove('grid-mode');
      }

    } else {
      viewModePill.classList.add('collapse-mode');
      viewModePill.innerHTML = `
        <svg class="icon-expand" width="20" height="24" viewBox="0 0 24 24" 
             fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="${expandState ? '6 15 12 9 18 15' : '6 9 12 15 18 9'}"></polyline>
        </svg>
      `;
      viewModePill.classList.remove('grid-mode', 'list-mode');
    }
  }

  // --- 🔹 Toggle modalità (usato dal long press)
  function togglePillMode() {
    if (viewPillMode === 'viewMode') {
      viewPillMode = 'collapseExpand';
      expandState = false;
      toggleAllGroups(false); // collassa subito
    } else {
      viewPillMode = 'viewMode';
    }

    updateViewModePill();
    longPressFired = true; // segna che il long press è avvenuto
  }

  // --- 🔹 Click breve → azione diversa a seconda della modalità
  viewModePill.addEventListener('click', (e) => {
    if (longPressFired) {
      e.stopImmediatePropagation();
      e.preventDefault();
      longPressFired = false; // resetta il flag subito dopo aver bloccato il click
      return;
    }

    if (viewPillMode === 'viewMode') {
      const newMode = currentViewMode === 'list' ? 'grid' : 'list';
      switchViewMode(newMode);
      updateViewModePill();
    } else {
      expandState = !expandState;
      toggleAllGroups(expandState);
      updateViewModePill();
    }
  });

  // --- 🔹 Long press → cambia modalità
  function startLongPressTimer(e) {
    clearLongPressTimer();
    longPressTimer = setTimeout(() => {
      togglePillMode();
      longPressTimer = null;
    }, LONG_PRESS_DURATION);
  }

  function clearLongPressTimer() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  // --- 🔹 Mouse e touch
  viewModePill.addEventListener('mousedown', startLongPressTimer);
  viewModePill.addEventListener('mouseup', clearLongPressTimer);
  viewModePill.addEventListener('mouseleave', clearLongPressTimer);

  viewModePill.addEventListener('touchstart', startLongPressTimer, { passive: true });
  viewModePill.addEventListener('touchend', clearLongPressTimer);
  viewModePill.addEventListener('touchcancel', clearLongPressTimer);

  // --- 🔹 Collapse / Expand globale
function toggleAllGroups(expand) {
  const channelListContainer = document.getElementById('channelListContainer');
  const fullEpgContainer = document.getElementById('fullEpgContainer');

  if (!channelListContainer || (fullEpgContainer && !fullEpgContainer.classList.contains('hidden'))) {
    return;
  }

  const groups = channelListContainer.querySelectorAll('.group-content');
  groups.forEach(group => {
    group.style.display = expand ? '' : 'none';
    const header = group.previousElementSibling;
    if (header && header.querySelector) {
      const titleSpan = header.querySelector('.group-title > .group-name') || header.querySelector('.group-title > span');
      const toggleSpan = header.querySelector('.group-toggle');
      const name = titleSpan ? titleSpan.textContent.trim() : null;
      if (name) {
        // usa le variabili globali unificate (non window.groupCollapseState)
        groupCollapseState[name] = !expand;
      }
      if (toggleSpan) toggleSpan.textContent = expand ? '-' : '+';
    }
  });

  // se stai mostrando preferiti, applica lo stesso comportamento anche a favoriteGroupCollapseState
  if (showingFavorites) {
    // applica lo stesso valore a favoriteGroupCollapseState per coerenza (se vuoi comportamento diverso, modificalo)
    Object.keys(groupCollapseState).forEach(k => {
      favoriteGroupCollapseState[k] = groupCollapseState[k];
    });
  }

  saveGroupCollapseStates();
  expandState = !!expand;
}


// Monitora i click sui group-header per uscire automaticamente dalla modalità collapse/expand
  // 🔹 Uscita automatica dalla modalità collapseExpand cliccando un header
  // Sostituire l'handler precedente con questo (solo questo pezzo)
 // 🔹 Uscita automatica dalla modalità collapseExpand cliccando un header o cambiando vista
document.addEventListener('click', (e) => {
  // 1) Se clicco su group-header -> esco da collapse/expand (già esistente)
  if (viewPillMode === 'collapseExpand' && e.target.closest('.group-header')) {
    viewPillMode = 'viewMode';
    updateViewModePill();
    return;
  }

  // 2) Se clicco sui bottoni playlist o epg nella tabbar in basso -> esco ANCHE da collapse/expand
  if (
    viewPillMode === 'collapseExpand' && (
      e.target.closest('#playlistsBtn') ||
      e.target.closest('#downloadEpgBtn')
    )
  ) {
    viewPillMode = 'viewMode';
    updateViewModePill();
    return;
  }
});

  // Inizializzazione: mostra stato corretto iniziale
  updateViewModePill();
})();



(function setupOptionsExportPill() {
  const pill = document.getElementById('optionsExportPill');
  const optionsBtn = document.getElementById('optionsBtn');
  const exportBtn  = document.getElementById('exportButton');
  if (!pill || !optionsBtn || !exportBtn) return;

  const LONG_MS = 600;
  let timer = null;
  let longFired = false;
  let preventNextClick = false;

  pill.addEventListener('click', e => {
    if (preventNextClick) {
      e.stopImmediatePropagation();
      e.preventDefault();
      preventNextClick = false;
      return;
    }
    optionsBtn.click();
  });

  const start = () => {
    longFired = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      longFired = true;
      preventNextClick = true;
      exportBtn.click();
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



// 3. Event listeners e inizializzazione

  function setupEventListeners() {

// LISTENER: Caricamento file M3U locale
document.getElementById('fileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    const text = e.target.result;
if (typeof closeBottomSheet === 'function') closeBottomSheet();
    // RESET EPG QUI
epgData = [];

    // salva file in IndexedDB (usa un url fittizio 'file:' + name)
    const rec = await saveAndActivateM3U({
      url: 'file:' + file.name,
      name: file.name,
      content: text
    });

    await parseM3U(rec.content, true);
    showingFavorites = false;
    updateButtons();

  // <-- IMPORTANTISSIMO: esci dalla vista playlists PRIMA di aggiornare le UI
    window.isPlaylistView = false;
    // assicurati che la vista canali sia mostrata
    if (typeof showChannelList === 'function') showChannelList();


    // aggiorna entrambe le UI delle playlist
    refreshPlaylistUIs();

  };

  reader.readAsText(file);
});


// LISTENER: Caricamento per file input EPG (JS)
document.getElementById('epgFileInput')?.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const text = e.target.result;

if (typeof closeBottomSheet === 'function') closeEPGBottomSheet();
    // Salva & attiva record EPG con content testuale (potrebbe essere XML o JSON)
    await saveAndActivateEPG({ url: 'file:' + file.name, name: file.name, content: text });

    // se il salvataggio produce EPG parsata (testo), proviamo a parse e applicare
    try {
      if (text.trim().startsWith('<') || text.includes('<tv>')) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        const data = parseXMLTV(xmlDoc);
        epgData = data;
      } else {
        try {
          const data = JSON.parse(text);
          epgData = data;
        } catch (e) {
          console.warn('EPG locale non JSON/XML valido durante il parsing:', e);
        }
      }
    } catch (e) {
      console.warn('Errore nel parsing EPG locale:', e);
    }

    showNotification('EPG locale caricata e salvata.');
    if (typeof renderEPGManager === 'function') renderEPGManager();
  };
  reader.readAsText(file);
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

  // 🔑 qui aspetti il risultato
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
    // Svuota tutto il localStorage
    localStorage.clear();

    // 🔄 Svuota anche lo store dei preferiti in IndexedDB
    try {
        await idbClearFavorites();
    } catch (e) {
        console.warn("Errore durante la pulizia dei preferiti:", e);
    }

    // Resetta lo stato dell'applicazione
    showingFavorites = false;
    currentViewMode = 'list';
    groupCollapseState = {};
    favoriteGroupCollapseState = {};

    // Resetta gli array dei canali
    channels = [];
    groupedChannels = [];
    favoriteChannels = [];
    groupedFavoriteChannels = [];

    // Resetta i dati EPG in memoria
    epgData = [];

    // Ricarica la playlist remota predefinita
    await loadRemoteM3U(DEFAULT_PLAYLIST_URL,true);
    updateButtons();

    // Resetta l'UI dell'EPG
    document.getElementById('epgContent').innerHTML = '<p>Scarica l\'EPG per vedere la programmazione</p>';
    document.getElementById('epgContent').style.display = 'none';
    document.querySelector('#epgHeader .metadata-arrow').classList.add('collapsed');

    // Forza il refresh della visualizzazione
   renderGroupedChannelList(groupedChannels, { context: 'playlists' });

    // 🔄 Ricarica i preferiti (ora vuoti)
     await loadFavorites();
     groupedFavoriteChannels = groupChannels(favoriteChannels);
});


// LISTENER: Input di ricerca e pulsante di cancellazione
document.getElementById('searchInput').addEventListener('input', () => {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const isGrid = currentViewMode === 'grid';

  // Determiniamo la vista corrente
  const epgContainer = document.getElementById('fullEpgContainer');
  const channelListContainer = document.getElementById('channelListContainer');
  
if (!epgContainer.classList.contains('hidden')) {
  // Siamo nella vista EPG completo
  const isGrid = currentViewMode === 'grid';
  const items = document.querySelectorAll('#fullEpgList .channel-item');
  items.forEach(item => {
    const name = item.getAttribute('data-name') || '';
    const isMatch = name.includes(search);
    // in grid serve mantenere display:flex (le tiles sono flex), in list va bene lasciare '' (default)
    item.style.display = isMatch ? (isGrid ? 'flex' : '') : 'none';
  });
  } else if (window.isPlaylistView) {
    // Siamo nella vista playlist - qui la ricerca è già gestita
    document.querySelectorAll('#channelList .group-content').forEach(content => {
      const children = content.children;
      let matchFound = false;

      for (const child of children) {
        const name = child.getAttribute('data-name') || '';
        const isMatch = name.includes(search);
        child.style.display = isMatch ? (isGrid ? 'flex' : '') : 'none';
        if (isMatch) matchFound = true;
      }

      // Mostra/nascondi i gruppi in base ai risultati
      const groupHeader = content.previousElementSibling;
      groupHeader.style.display = matchFound ? '' : 'none';
      content.style.display = matchFound ? (isGrid ? 'grid' : 'block') : 'none';
    });
  } else {
    // Vista canali normale
    document.querySelectorAll('#channelList .group-content').forEach(content => {
      const children = content.children;
      let matchFound = false;

      for (const child of children) {
        const name = child.getAttribute('data-name') || '';
        const isMatch = name.includes(search);
        child.style.display = isMatch ? (isGrid ? 'flex' : '') : 'none';
        if (isMatch) matchFound = true;
      }

      // Mostra/nascondi i gruppi in base ai risultati
      const groupHeader = content.previousElementSibling;
      groupHeader.style.display = matchFound ? '' : 'none';
      content.style.display = matchFound ? (isGrid ? 'grid' : 'block') : 'none';
    });
  }
});


// LISTENER: Download EPG
document.getElementById('downloadEpgBtn').addEventListener('click', async () => {
    try {
        await renderEPGManager(); // prepara DOM mentre EPG è ancora visibile/chiuso
    } catch (err) {
        console.error('renderEPGManager failed', err);
        // lasciamo procedere comunque a closeFullEPG per non rimanere bloccati
    }
    closeFullEPG(); // mostra il container già popolato -> nessun flicker
});


// LISTENER: Toggle modalità radio
document.getElementById('radioToggle').addEventListener('change', function() {
  if (window.currentChannelUrl) {
    // Cerca il canale sia nella lista principale che nei preferiti
    let currentChannel = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    if (!currentChannel && showingFavorites) {
      currentChannel = favoriteChannels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    }
    
    if (currentChannel) {
      playStream(currentChannel, showingFavorites);
    }
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
  closeFullEPG();
  try {
    const lastUrl = localStorage.getItem('zappone_last_played');
    const lastFromFavorites = localStorage.getItem('zappone_last_played_from_favorites') === 'true';
    
    if (lastUrl) {
      // ✅ OTTIMIZZAZIONE: usa le mappe per ricerca O(1) invece di .some() O(n)
      const channelExists = lastFromFavorites 
        ? favoriteUrlMap.has(lastUrl)
        : channelUrlMap.has(lastUrl);
      
      if (channelExists) {
        showingFavorites = lastFromFavorites;
        updateToggleState();
      }
    }
    
    // Il resto del codice rimane invariato...
    window.isPlaylistView = false;
    window.isEPGView = false;
    
    document.getElementById('channelListContainer').style.display = 'block';
    document.getElementById('playerContainer').style.display = 'none';
    document.querySelector('h1')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('bottomTabBar')?.classList.remove('hidden');
    
    renderGroupedChannelList(
      showingFavorites ? groupedFavoriteChannels : groupedChannels, 
      { context: 'channels' }
    );
    
  } catch (err) {
    console.error('Errore tornando alla lista canali:', err);
    showingFavorites = false;
    updateToggleState();
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

// === 🔧 PATCH: Cambio tema istantaneo senza lag ===
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


// LISTENER: Pulsante Nuovo per visualizzare le playlist
document.getElementById('playlistsBtn').addEventListener('click', async () => {
    try {
        await renderPlaylistList(); // prepara DOM mentre EPG è ancora visibile/chiuso
    } catch (err) {
        console.error('renderPlaylistList failed', err);
        // lasciamo procedere comunque a closeFullEPG per non rimanere bloccati
    }
    closeFullEPG(); // mostra il container già popolato -> nessun flicker
});


// LISTENER: Blocco gesture multitouch su iOS
['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
  document.addEventListener(evt, e => e.preventDefault(), { passive: false });
});

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
    showingFavorites = false;
    updateButtons();
    window.isPlaylistView = false;

  // Aggiungi questa linea alla fine
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


// ---------------- Tab bar: wiring dei pulsanti (aggiungi dentro setupEventListeners)
const tabAddBtn = document.getElementById('tabAddM3U');
if (tabAddBtn) {
  tabAddBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // usa la funzione già esistente che apre il bottomsheet M3U
    if (typeof openBottomSheet === 'function') openBottomSheet();
    else console.warn('openBottomSheet non trovata');
  });
}


// NUOVO: Torna alla lista dei canali da qualsiasi schermata (penultimo tasto)
const tabBackBtn = document.getElementById('tabBackToChannels');
if (tabBackBtn) {
  tabBackBtn.addEventListener('click', async (e) => {
    e.preventDefault();
  closeFullEPG();
    try {
      // Esci da eventuali viste playlist/EPG
      window.isPlaylistView = false;
      window.isEPGView = false;

      // Rendi la lista dei canali coerente con il toggle Preferiti
      // (renderizza i groupedChannels corretti prima di mostrare la lista)
      if (typeof renderGroupedChannelList === 'function') {
        renderGroupedChannelList(showingFavorites ? groupedFavoriteChannels : groupedChannels, { context: 'channels' });
      }

      // Mostra la lista canali (funzione esistente)
      if (typeof showChannelList === 'function') {
        showChannelList();
      } else {
        console.warn('showChannelList non trovata');
      }
    } catch (err) {
      console.error('Errore tornando alla lista canali:', err);
    }
  });
}


// Bottone ✅: avvia l'ultimo canale riprodotto
const tabRenderBtn = document.getElementById('tabRenderLastChannel');
if (tabRenderBtn) {
  tabRenderBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    closeFullEPG();

    // 1) prendi ultimo URL riprodotto
    const lastUrl = localStorage.getItem('zappone_last_played');
    if (!lastUrl) {
      if (typeof showNotification === 'function') showNotification('Nessun canale riprodotto ancora', true);
      else alert('Nessun canale riprodotto ancora');
      return;
    }

    try {
      // 2) ✅ ACCESSO O(1) tramite mappe - MOLTO PIÙ VELOCE
      let found = getChannelByUrl(lastUrl, showingFavorites);
      let fromFavorites = showingFavorites;
      
      // Se non trovato nei preferiti correnti, cerca nella lista principale
      if (!found && showingFavorites) {
        found = getChannelByUrl(lastUrl, false);
        fromFavorites = false;
      }
      
      // Se ancora non trovato, cerca in entrambe le liste complete
      if (!found) {
        found = getChannelByUrl(lastUrl, true) || getChannelByUrl(lastUrl, false);
        fromFavorites = !!getChannelByUrl(lastUrl, true); // true se trovato nei preferiti
      }

      // 3) se trovi il canale => usa la funzione esistente playStream
      if (found) {
        playStream(found, fromFavorites);
        return;
      }

      // 4) fallback: URL non trovato nelle liste. riproduci direttamente l'URL
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

};


  // 3. INIZIALIZZAZIONE APPLICAZIONE (da controllare tutta)

async function initializeApp() {
    try {
        // Inizializza il database IndexedDB
        await openDB();
        
        // Carica i preferiti da IndexedDB (in background)
        await loadFavorites();
        
        // Chiama loadM3UUrlList all'inizializzazione dell'app
        await loadM3UUrlList();

        const preferences = loadViewModePreference();
        currentViewMode = preferences.mode;
        
        // Aggiorna showingFavorites in base ai preferiti caricati
        showingFavorites = (favoriteChannels.length > 0) ? preferences.showFav : false;

        // ✅ MOSTRA SUBITO LA SCHERMATA PLAYLIST (UI leggera)
        await renderPlaylistList();

        // ✅ CARICAMENTI IN BACKGROUND - tutto viene preparato ma non mostrato
        setTimeout(async () => {
            try {
                // 1. Carica playlist attiva in background (senza render)
                const activeRec = await getActivePlaylist();
                if (activeRec && activeRec.content) {
                    await parseM3U(activeRec.content, true, false); // false = no render UI
                    console.log("Playlist attiva caricata in background");
                } else {
                    // Nessuna playlist attiva trovata: inizializza strutture vuote
                    channels = [];
                    groupedChannels = [];
                    rebuildIndexMaps();
                }

                // 2. Carica EPG attivo in background
                const activeEPG = await getActiveEPG();
                if (activeEPG && activeEPG.content) {
                    try {
                        epgData = typeof activeEPG.content === 'string' 
                            ? JSON.parse(activeEPG.content) 
                            : activeEPG.content;

                        // Filtra i programmi per la visualizzazione corrente
                        const filteredData = epgData.map(channel => {
                            if (!channel.programs) return channel;
                            return {
                                ...channel,
                                programs: filterPrograms(channel.programs)
                            };
                        });
                        console.log("EPG attivo caricato in background");

                    } catch (e) {
                        console.error('Errore nel parsing EPG da IndexedDB:', e);
                    }
                }

                // 3. Ricostruisci le mappe per accesso rapido (fondamentale per last channel)
                rebuildIndexMaps();
                
                console.log("Tutti i dati caricati in background - sistema pronto per last channel/EPG");

            } catch (backgroundError) {
                console.warn("Errore nel caricamento background:", backgroundError);
            }
        }, 100); // Piccolo delay per dare priorità all'UI iniziale

// ✅ Sincronizza il nuovo pulsante "View Mode" (per la vista playlist)
const viewModePill = document.getElementById('viewModePill');
if (viewModePill) {
  viewModePill.classList.toggle('list-mode', currentViewMode === 'list');
  viewModePill.classList.toggle('grid-mode', currentViewMode === 'grid');
}

        // ✅ Ripristina stato UI per la vista playlist
        setupInputBehavior('searchInput');   
        updateButtons();
        setupSwipeHandlers();

    } catch (error) {
        console.error('Errore durante l\'inizializzazione:', error);
        // Fallback: mostra comunque la vista playlist
        await renderPlaylistList();
    }
}


// =============================================
// 4. AVVIO APPLICAZIONE
// =============================================

// Service Worker per PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('[SW] Registered successfully:', reg))
            .catch(err => console.error('[SW] Registration failed:', err));
    });
}

// Blocca zoom su iOS
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Avvio
document.addEventListener('DOMContentLoaded', async () => {
     
setupEventListeners(); // Prima i listener


/*
         // Prima verifica la licenza - attualmente disattivata e da attivare con timeout

    const licenseValid = await promptLicenseAndCheck();
    
  if (!licenseValid) {
      // Modalità demo per 1 minuto
      console.warn("Modalità demo attivata - sessione valida 1 minuto");
      alert("Licenza non valida. Modalità demo attivata per 1 minuto.");
      
      // Imposta un timeout per disabilitare l'app dopo 1 minuto (60000 ms)
      setTimeout(() => {
        document.body.innerHTML = `
          <h1 style="color:red;text-align:center;margin-top:50px;">
            Sessione demo scaduta
          </h1>
          <p style="text-align:center;">
            Per continuare a utilizzare l'applicazione, inserisci una licenza valida.
          </p>
        `;
        console.log("Sessione demo terminata");
      }, 60000); // 1 minuto = 60000 millisecondi
    }

*/


await initializeApp(); // Poi l'inizializzazione
  
});


