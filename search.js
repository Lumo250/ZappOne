// ================================================================
//  MODULO RICERCA - ZappOne
//  Casella di ricerca, filtro contestuale (canali/EPG), riapplicazione
//  automatica dopo i render.
//
//  Dipendenze attese (devono essere caricate prima di questo file):
//    - normalizeChannelName, hasEPG              (da epg.js)
//    - channels, favoriteChannels, showingFavorites,
//      currentViewMode, getChannelKey            (da zappone.js a runtime)
//    - channelIndexMap, favoriteIndexMap         (da zappone.js a runtime)
//
//  Espone globalmente:
//    - activeSearchQuery
//    - searchChannelFilterActive, searchEpgFilterActive
//    - setupInputBehavior, performSearch,
//      updateSearchFilterToggle, refreshSearchVisualState,
//      clearAllSearchFilters, reapplySearchAfterRender,
//      getCurrentFilterFlag, setCurrentFilterFlag
// ================================================================

// ================================
// STATO
// ================================
let activeSearchQuery = '';

// Due filtri contestuali INDIPENDENTI:
//   searchChannelFilterActive → lista canali, "mostra solo canali con EPG"
//   searchEpgFilterActive     → Full EPG, "mostra solo EPG con canale in playlist"
let searchChannelFilterActive = false;
let searchEpgFilterActive     = false;

// Helper: legge/scrive il flag del filtro rilevante per la vista corrente.
function getCurrentFilterFlag() {
    const fullEpg = document.getElementById('fullEpgContainer');
    if (fullEpg && !fullEpg.classList.contains('hidden')) return searchEpgFilterActive;
    return searchChannelFilterActive;
}
function setCurrentFilterFlag(value) {
    const fullEpg = document.getElementById('fullEpgContainer');
    if (fullEpg && !fullEpg.classList.contains('hidden')) searchEpgFilterActive = value;
    else searchChannelFilterActive = value;
}

let _playlistNormNamesCache = null;
let _searchTimeout = null;

// ================================
// UTILITY: comportamento di un input con X di cancellazione
// ================================
function setupInputBehavior(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // La X non è più sibling immediato: la cerchiamo nel container
    const container = input.closest('.input-container');
    const clearBtn = container ? container.querySelector('.clear-input') : null;
    if (!clearBtn) return;

input.addEventListener('input', () => {
    clearBtn.style.display = input.value ? 'flex' : 'none';
});

    clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        input.value = '';
        input.dispatchEvent(new Event('input'));
        clearBtn.style.display = 'none';
        input.focus();
    });
}

// ================================
// FILTRO CONTESTUALE
// ================================

/**
 * Aggiorna aspetto e tooltip del pulsante di filtro in base alla vista
 * corrente. Nasconde il pulsante in viste dove non ha significato
 * (EPG manager, Playlist manager), ma NON tocca i flag: quando l'utente
 * torna in lista canali o in Full EPG, ritrova l'icona col suo stato.
 */
function updateSearchFilterToggle() {
    const btn = document.getElementById('searchFilterToggle');
    if (!btn) return;

    const fullEpgContainer      = document.getElementById('fullEpgContainer');
    const epgListContainer      = document.getElementById('epgListContainer');
    const playlistListContainer = document.getElementById('playlistListContainer');

    const inFullEPG     = fullEpgContainer && !fullEpgContainer.classList.contains('hidden');
    const inEPGMgr      = epgListContainer && !epgListContainer.classList.contains('hidden');
    const inPlaylistMgr = playlistListContainer && !playlistListContainer.classList.contains('hidden');

    if (inEPGMgr || inPlaylistMgr) {
        // Il filtro non ha significato in queste viste, ma i flag restano
        // in memoria: quando torni in lista canali o Full EPG, l'icona
        // tornerà "accesa" col suo stato originale.
        btn.style.display = 'none';
        refreshSearchVisualState();
        return;
    }

    btn.style.display = '';

    if (inFullEPG) {
        btn.setAttribute('data-filter-context', 'channel');
        btn.title = 'Mostra solo EPG con canale in playlist';
    } else {
        btn.setAttribute('data-filter-context', 'epg');
        btn.title = 'Mostra solo canali con EPG';
    }
    btn.setAttribute('aria-label', btn.title);

    btn.classList.toggle('active', getCurrentFilterFlag());
}

/**
 * Aggiorna la classe is-filtering sull'input di ricerca: attiva quando
 * c'è testo O il filtro contestuale è on.
 */
function refreshSearchVisualState() {
    const container = document.querySelector('.input-container.header-input');
    if (!container) return;
    const input = document.getElementById('searchInput');
    const hasText = !!(input && input.value.trim());
    const isFiltering = hasText || getCurrentFilterFlag();
    container.classList.toggle('is-filtering', isFiltering);
}

/**
 * [FIX 8] Vero se è attiva una ricerca o un filtro (canali / EPG). Il player lo usa per sapere
 * se può evitare la scansione delle righe del DOM: senza filtri tutte le righe sono visibili.
 */
function isAnySearchFilterActive() {
    const input = document.getElementById('searchInput');
    const q = ((input && input.value) || activeSearchQuery || '').trim();
    return !!q || searchChannelFilterActive || searchEpgFilterActive;
}

/**
 * Rimuove tutti i display:none inline applicati da una ricerca precedente.
 */
function clearAllSearchFilters() {
    const containers = ['channelList', 'fullEpgList', 'playlistList', 'epgList'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        container.querySelectorAll('.channel-item, .group-content, .group-header').forEach(el => {
            el.style.display = '';
        });
    });
}

// ================================
// MATCH PER FILTRO EPG
// ================================

function getPlaylistNormNames() {
    if (_playlistNormNamesCache) return _playlistNormNamesCache;
    const list = showingFavorites ? favoriteChannels : channels;
    const names = new Set();
    if (list) {
        for (const ch of list) {
            const n = normalizeChannelName(ch.name);
            if (n) names.add(n);
        }
    }
    _playlistNormNamesCache = names;
    return names;
}

function channelExistsForEPGName(epgName) {
    const list = showingFavorites ? favoriteChannels : channels;
    if (!list || list.length === 0) return false;

    const normEpg = normalizeChannelName(epgName);
    if (!normEpg) return false;

    const candidates = new Set([normEpg]);
    const stripped = epgName.replace(/\s*\(\+\d+\)\s*$/, '');
    if (stripped !== epgName) {
        const normStripped = normalizeChannelName(stripped);
        if (normStripped) candidates.add(normStripped);
    }

    const playlistNames = getPlaylistNormNames();
    for (const c of candidates) {
        if (playlistNames.has(c)) return true;
    }
    return false;
}

/**
 * Recupera un canale dalla chiave usando le mappe indice O(1).
 * Rispetta l'ordine primario/secondario come la versione lineare
 * originale (primario = lista correntemente mostrata). Fallback
 * lineare solo se le mappe sono fuori sync (non dovrebbe accadere).
 */
function findChannelByKey(key) {
    if (!key) return null;

    const primaryMap    = showingFavorites ? favoriteIndexMap : channelIndexMap;
    const primaryList   = showingFavorites ? favoriteChannels : channels;
    const secondaryMap  = showingFavorites ? channelIndexMap : favoriteIndexMap;
    const secondaryList = showingFavorites ? channels : favoriteChannels;

    const idx = primaryMap.get(key);
    if (idx !== undefined) return primaryList[idx] || null;

    const secIdx = secondaryMap.get(key);
    if (secIdx !== undefined) return secondaryList[secIdx] || null;

    // Fallback lineare: solo se le mappe sono fuori sync (non dovrebbe accadere).
    for (const list of [primaryList, secondaryList]) {
        if (!list) continue;
        for (const ch of list) {
            if (getChannelKey(ch) === key) return ch;
        }
    }
    return null;
}

// ================================
// RICERCA PRINCIPALE
// ================================

async function performSearch(search) {
    // [FIX 8] La visibilità delle righe sta per cambiare: la lista di navigazione del player
    // (player.js) va ricalcolata al prossimo uso. performSearch non ha await, quindi invalidare
    // qui all'inizio basta (nessuno può leggere la cache a metà).
    if (typeof invalidateVisiblePlaylistCache === 'function') invalidateVisiblePlaylistCache();

    const query = search.toLowerCase().trim();
    const isGrid = typeof currentViewMode !== 'undefined' && currentViewMode === 'grid';
    const displayValue = isGrid ? 'flex' : '';

    if (query) activeSearchQuery = search;

    if (!query && !searchChannelFilterActive && !searchEpgFilterActive) {
        clearAllSearchFilters();
        return;
    }

    // ── Full EPG ──
    const fullEpgContainer = document.getElementById('fullEpgContainer');
    if (fullEpgContainer && !fullEpgContainer.classList.contains('hidden')) {
        const epgItems = document.querySelectorAll('#fullEpgList .channel-item');
        _playlistNormNamesCache = null;
        epgItems.forEach(item => {
            const name = (item.getAttribute('data-name') || item.textContent || '').toLowerCase();
            const matchesQuery = !query || name.includes(query);
            const matchesFilter = !searchEpgFilterActive ||
                channelExistsForEPGName(item.getAttribute('data-name') || '');
            item.style.display = (matchesQuery && matchesFilter) ? displayValue : 'none';
        });
        _playlistNormNamesCache = null;
        return;
    }

    // ── Lista canali / preferiti ──
    const channelListContainer = document.getElementById('channelListContainer');
    if (channelListContainer && !channelListContainer.classList.contains('hidden')) {
        const channelList = document.getElementById('channelList');
        if (!channelList) return;

        channelList.querySelectorAll('.group-content').forEach(content => {
            let matchFound = false;

            Array.from(content.children).forEach(child => {
                const name = (child.getAttribute('data-name') || child.textContent || '').toLowerCase();
                const matchesQuery = !query || name.includes(query);

                let matchesFilter = true;
                if (searchChannelFilterActive) {
                    const key = child.getAttribute('data-key') || '';
                    const ch = findChannelByKey(key);
                    matchesFilter = !!(ch && typeof hasEPG === 'function' && hasEPG(ch));
                }

                const isMatch = matchesQuery && matchesFilter;
                child.style.display = isMatch ? displayValue : 'none';
                if (isMatch) matchFound = true;
            });

            const header = content.previousElementSibling;
            if (header && header.classList.contains('group-header')) {
                header.style.display = matchFound ? '' : 'none';
            }
            content.style.display = matchFound ? (isGrid ? 'grid' : 'block') : 'none';
        });
        return;
    }

    // ── EPG manager ──
    if (window.isEPGView) {
        const epgList = document.getElementById('epgList');
        if (!epgList) return;

        epgList.querySelectorAll('.group-content').forEach(content => {
            let matchFound = false;

            Array.from(content.children).forEach(child => {
                const url = child.getAttribute('data-url');

                if (url === '#url') {
                    child.style.display = displayValue;
                    matchFound = true;
                    return;
                }

                const name = (child.getAttribute('data-name') || child.textContent || '').toLowerCase();
                const isMatch = !query || name.includes(query);
                child.style.display = isMatch ? displayValue : 'none';
                if (isMatch) matchFound = true;
            });

            const header = content.previousElementSibling;
            if (header && header.classList.contains('group-header')) {
                header.style.display = matchFound ? '' : 'none';
            }
            content.style.display = matchFound ? 'block' : 'none';
        });
        return;
    }

    // ── Playlist manager ──
    if (window.isPlaylistView) {
        const playlistList = document.getElementById('playlistList');
        if (!playlistList) return;

        playlistList.querySelectorAll('.group-content').forEach(content => {
            let matchFound = false;

            Array.from(content.children).forEach(child => {
                const url = child.getAttribute('data-url');

                // La riga "Aggiungi Playlist" resta sempre visibile
                if (url === '#url') {
                    child.style.display = displayValue;
                    matchFound = true;
                    return;
                }

                const name = (child.getAttribute('data-name') || child.textContent || '').toLowerCase();
                const isMatch = !query || name.includes(query);
                child.style.display = isMatch ? displayValue : 'none';
                if (isMatch) matchFound = true;
            });

            const header = content.previousElementSibling;
            if (header && header.classList.contains('group-header')) {
                header.style.display = matchFound ? '' : 'none';
            }
            content.style.display = matchFound ? 'block' : 'none';
        });
    }
}

// ================================
// HOOK chiamato da renderGroupedChannelList dopo il rendering
// ================================
function reapplySearchAfterRender() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput && !searchInput.value && activeSearchQuery) {
        searchInput.value = activeSearchQuery;
    }
    const q = searchInput ? searchInput.value : activeSearchQuery;
    if (!q && !searchChannelFilterActive && !searchEpgFilterActive) return;
    // Sincrono: il chiamante (finalizeRendering) decide quando rendere visibile
    // la lista, quindi qui non serve rimandare con setTimeout.
    performSearch(q || '');
}

// ================================
// WIRING
// ================================
(function setupSearchWiring() {

    // ── Input di ricerca con debounce ──
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const search = e.target.value;
            clearTimeout(_searchTimeout);

            if (!search.trim()) {
                activeSearchQuery = '';
            }

            // Aggiorna subito il bordo, senza aspettare il debounce
            refreshSearchVisualState();

            _searchTimeout = setTimeout(() => performSearch(search), 150);
        });
    }

    // ── Toggle filtro contestuale ──
    const filterBtn = document.getElementById('searchFilterToggle');
    if (filterBtn) {
        filterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            setCurrentFilterFlag(!getCurrentFilterFlag());
            updateSearchFilterToggle();
            refreshSearchVisualState();

            const input = document.getElementById('searchInput');
            performSearch(input ? input.value : '');
        });
    }

    // ── Osservatore contesto: aggiorna l'icona del toggle al cambio vista ──
    const contextIds = ['channelListContainer', 'playlistListContainer', 'epgListContainer', 'fullEpgContainer'];
    const contextObserver = new MutationObserver(() => updateSearchFilterToggle());
    contextIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) contextObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    });
    updateSearchFilterToggle();

    // ── Riapplicazione automatica dopo re-render o cambio vista ──
    const listIds = ['channelList', 'fullEpgList', 'epgList', 'playlistList'];
    let debounceTimer = null;
    let isApplying = false;

    function scheduleReapply() {
        if (isApplying) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;

            const input = document.getElementById('searchInput');
            const q = input ? input.value : '';
            if (!q.trim() && !searchChannelFilterActive && !searchEpgFilterActive) return;

            isApplying = true;
            try {
                performSearch(q);
            } finally {
                setTimeout(() => { isApplying = false; }, 0);
            }
        }, 80);
    }

    const reapplyObserver = new MutationObserver(scheduleReapply);
    listIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) reapplyObserver.observe(el, { childList: true, subtree: true });
    });
    contextIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) reapplyObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
    });

    // ── Comportamento standard dell'input (X di cancellazione) ──
    setupInputBehavior('searchInput');

    // ── Stato iniziale ──
    refreshSearchVisualState();

})();