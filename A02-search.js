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

// [FIX] Invalidatore esposto per i moduli che scrivono channels/favoriteChannels.
// La cache di getPlaylistNormNames deve essere azzerata quando cambiano i nomi
// in una delle due liste (toggleFavorite, saveMetadataChanges, loadFavorites,
// parseM3U, deleteChannel, moveChannel, ...). Tutti quei punti passano da
// rebuildIndexMaps in zappone.js, che chiama questa funzione.
window.invalidatePlaylistNormNamesCache = function () {
    _playlistNormNamesCache = null;
};


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
        container.classList.remove('search-active');
        container.querySelectorAll('.filter-hidden').forEach(el => {
            el.classList.remove('filter-hidden');
        });
        // [UNIFIED-EMPTY] L'empty state vive sul view-root, non sulla lista:
        // removeEmptyState risale autonomamente all'host corretto.
        removeEmptyState(container);
    });
}


// ================================
// EMPTY STATE DI RICERCA
// ================================
// Overlay centrato con icona (lente + X) e testo contestuale, mostrato
// sopra #channelList / #fullEpgList quando la ricerca o il filtro attivo
// non produce alcun match. L'icona viene da A12-icons.js (searchEmpty).

function _searchEmptyIcon() {
    return (window.ZappOneIconsRaw && window.ZappOneIconsRaw.searchEmpty) || '';
}

function _searchEmptyMessage(query, container) {
    const q = (query || '').trim();
    // [UNIFIED-EMPTY] Qualsiasi container dentro #fullEpgContainer è
    // "Full EPG": vale sia per #fullEpgList che per #fullEpgGrid.
    const inFullEpg = !!(container && container.closest && container.closest('#fullEpgContainer'));
    const filterActive = inFullEpg ? searchEpgFilterActive : searchChannelFilterActive;

    if (q && filterActive) {
        return {
            title: 'Nessun risultato',
            hint: inFullEpg
                ? `Nessun EPG con canale in playlist corrisponde a "${q}"`
                : `Nessun canale con EPG corrisponde a "${q}"`
        };
    }
    if (q) {
        return {
            title: 'Nessun risultato',
            hint: inFullEpg
                ? `Nessun EPG corrisponde a "${q}"`
                : `Nessun canale corrisponde a "${q}"`
        };
    }
    if (filterActive) {
        return inFullEpg
            ? { title: 'Nessun EPG in playlist', hint: 'Nessun EPG ha una corrispondenza nella playlist.' }
            : { title: 'Nessun canale con EPG', hint: 'Aggiorna o carica un EPG per vedere i canali associati.' };
    }
    return { title: 'Nessun risultato', hint: 'Prova con un termine diverso.' };
}

function _truncateForSvg(str, maxChars) {
    const s = String(str || '');
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars - 1) + '…';
}

// ============================================================
// [UNIFIED-EMPTY] Renderer unico per TUTTI gli empty state dell'app.
// ============================================================
// Sostituisce i tre sistemi precedenti:
//   A) updateSearchEmptyState (search dynamic)
//   B) wrapper inline in renderFullEPGList / renderFullEPGGrid
//   C) wrapper inline in renderGroupedChannelList / renderSavedItemsList
//
// Contratto:
//   - L'empty state è un concetto di VISTA, non di lista: viene montato
//     sempre sul view-root (_getEmptyStateHost) così il flexbox centra
//     a H/2 della vista (invariant per costruzione, vedi CSS).
//   - Una sola funzione carica l'icona da ZappOneIconsRaw (SVG inline):
//     searchEmpty popola <text> dinamici, tutte le altre hanno testo
//     statico già nel markup SVG.
//   - L'header interno della vista (oggi solo #fullEpgHeader) è gestito
//     con hideInternalHeader: nascosto in no-data (nessun contenuto da
//     navigare, coerente con la scelta storica di renderFullEPGList),
//     visibile in filter-empty (il toggle lista/griglia resta accessibile
//     grazie a z-index 10 > 5).
//
// Opzioni:
//   icon                chiave in ZappOneIconsRaw
//                       ('nopref' | 'noChannel' | 'noplaylist' | 'noepg' |
//                        'nofullepg' | 'searchEmpty')
//   alt                 testo alt per a11y
//   title, hint         solo searchEmpty: <text> dinamici
//   onClick             rende l'icona cliccabile (noepg/noplaylist)
//   hideInternalHeader  nasconde .group-header interno (default false)
// ============================================================

function _getEmptyStateHost(container) {
    if (!container) return null;
    // #fullEpgContainer è il view-root della vista Full EPG.
    // Gli altri view-root hanno .view-container.
    // Fallback: container stesso (mai usato oggi, difensivo).
    return container.closest('#fullEpgContainer')
        || container.closest('.view-container')
        || container;
}

function removeEmptyState(container) {
    if (!container) return;
    const host = _getEmptyStateHost(container);
    if (!host) return;
    const el = host.querySelector(':scope > .search-empty-state');
    if (el) el.remove();
    const internalHeader = host.querySelector(':scope > .group-header');
    if (internalHeader) internalHeader.style.display = '';
}

function renderEmptyState(container, opts) {
    if (!container) return null;
    const options = opts || {};
    const host = _getEmptyStateHost(container);
    if (!host) return null;

    const internalHeader = host.querySelector(':scope > .group-header');
    if (internalHeader) {
        internalHeader.style.display = options.hideInternalHeader ? 'none' : '';
    }

    let el = host.querySelector(':scope > .search-empty-state');
    if (!el) {
        el = document.createElement('div');
        el.className = 'search-empty-state';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        host.appendChild(el);
    }

    const iconKey = options.icon || 'searchEmpty';
    const rawSvg = (window.ZappOneIconsRaw && window.ZappOneIconsRaw[iconKey]) || '';
    el.innerHTML = '<div class="search-empty-svg">' + rawSvg + '</div>';
    if (options.alt) el.setAttribute('aria-label', options.alt);

    // Popola i <text> dinamici solo per searchEmpty.
    if (iconKey === 'searchEmpty') {
        const titleEl = el.querySelector('.search-empty-svg-title');
        const hintEl  = el.querySelector('.search-empty-svg-hint');
        const t = options.title ? _truncateForSvg(options.title, 40) : '';
        const h = options.hint  ? _truncateForSvg(options.hint, 44)  : '';
        if (titleEl && titleEl.textContent !== t) titleEl.textContent = t;
        if (hintEl  && hintEl.textContent  !== h) hintEl.textContent  = h;
    }

    // Clickability (noepg/noplaylist: l'utente clicca l'icona per aprire il
    // bottom sheet corrispondente).
    const svgWrapper = el.querySelector('.search-empty-svg');
    if (svgWrapper) {
        if (typeof options.onClick === 'function') {
            svgWrapper.style.pointerEvents = 'auto';
            svgWrapper.style.cursor = 'pointer';
            svgWrapper.onclick = options.onClick;
        } else {
            svgWrapper.style.pointerEvents = '';
            svgWrapper.style.cursor = '';
            svgWrapper.onclick = null;
        }
    }

    return el;
}
window.renderEmptyState = renderEmptyState;
window.removeEmptyState = removeEmptyState;

// Wrapper sottile per la ricerca: mantiene la firma storica usata da
// A02 (performSearch) e A01/04 (renderFullEPGList/Grid). `opts.noData`
// distingue "filtro vuoto" (searchEmpty dinamica) da "nessun EPG
// caricato" (nofullepg + header nascosto).
function updateSearchEmptyState(container, hasVisibleItems, query, opts) {
    if (!container) return;
    const noData = !!(opts && opts.noData);

    if (hasVisibleItems) {
        removeEmptyState(container);
        return;
    }

    if (noData) {
        renderEmptyState(container, {
            icon: 'nofullepg',
            alt: 'Nessun EPG disponibile',
            hideInternalHeader: true,
        });
        return;
    }

    const { title, hint } = _searchEmptyMessage(query, container);
    renderEmptyState(container, {
        icon: 'searchEmpty',
        alt: title,
        title,
        hint,
        hideInternalHeader: false,
    });
}


// ================================
// MATCH PER FILTRO EPG
// ================================

function getPlaylistNormNames() {
    if (_playlistNormNamesCache) return _playlistNormNamesCache;
    // [FIX] Il filtro "EPG con canale in playlist" (in Full EPG) deve
    // rispondere alla stessa domanda di findChannelFromEPG: il canale
    // è riproducibile? La risposta corretta è l'unione di channels e
    // favoriteChannels, non la lista della vista corrente.
    // Prima: usava solo showingFavorites ? favoriteChannels : channels,
    // con la conseguenza che un canale in preferiti (ma non in playlist)
    // spariva se si apriva Full EPG da "tutti i canali", e viceversa.
    const names = new Set();
    for (const ch of channels) {
        const n = normalizeChannelName(ch.name);
        if (n) names.add(n);
    }
    for (const ch of favoriteChannels) {
        const n = normalizeChannelName(ch.name);
        if (n) names.add(n);
    }
    _playlistNormNamesCache = names;
    return names;
}

function channelExistsForEPGName(epgName) {
    const normEpg = normalizeChannelName(epgName);
    if (!normEpg) return false;

    const candidates = new Set([normEpg]);
    const stripped = epgName.replace(/\s*\(\+\d+\)\s*$/, '');
    if (stripped !== epgName) {
        const normStripped = normalizeChannelName(stripped);
        if (normStripped) candidates.add(normStripped);
    }

    const playlistNames = getPlaylistNormNames();
    // [FIX] Early-return spostato: prima era `if (!list || list.length === 0)`,
    // con `list` = la lista della vista corrente. Con l'unione delle due
    // liste, è sbagliato: se sono in preferiti vuoti ma ho canali in
    // `channels`, il filtro deve comunque funzionare. Il check giusto
    // è sull'unione, che è quello che getPlaylistNormNames restituisce.
    if (playlistNames.size === 0) return false;

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
    // [LAZY-GROUP] La ricerca itera i `.channel-item` nel DOM. Con il
    // render lazy dei gruppi, i canali nei gruppi non ancora visibili
    // NON sono nel DOM: la ricerca non li troverebbe. Popoliamo tutto
    // prima di filtrare. È un'operazione costosa ma rara (avviene solo
    // su input esplicito dell'utente).
    if (typeof window.__populateAllGroups === 'function') {
        // Salta il pop-all se non ci sono gruppi lazy residui
        // (idempotente: dopo la prima chiamata è no-op).
        await window.__populateAllGroups();
    }

    if (typeof invalidateVisiblePlaylistCache === 'function') invalidateVisiblePlaylistCache();

    const query = search.toLowerCase().trim();
    if (query) activeSearchQuery = search;

    // Vero quando c'è un criterio attivo. La vista entra in "modalità
    // ricerca": il CSS forza l'apertura dei gruppi con match, ignorando
    // temporaneamente il collapse dell'utente.
const queryActive       = !!query;
const channelFiltering  = queryActive || searchChannelFilterActive;
const epgFiltering      = queryActive || searchEpgFilterActive;

// .search-active SOLO dove ha senso:
//   #channelList  → ricerca testuale O filtro "canali con EPG"
//   #fullEpgList  → ricerca testuale O filtro "EPG con canale"
//   #playlistList → solo ricerca testuale (nessun filtro contestuale)
//   #epgList      → solo ricerca testuale (nessun filtro contestuale)
//
// Impedisce che un filtro attivato nella lista canali renda incomprimibili
// i gruppi dell'EPG manager o del playlist manager (e viceversa): quei
// flag non hanno alcuna relazione con quelle viste.
// ── DOPO ──
const searchActiveMap = {
    channelList:  channelFiltering,
    fullEpgList:  epgFiltering,
    playlistList: false,
    epgList:      false,
};

Object.entries(searchActiveMap).forEach(([id, isActive]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('search-active', isActive);
    // Pulizia difensiva: se questa lista esce dalla modalità ricerca,
    // rimuovi eventuali .filter-hidden residui di una sessione precedente.
    if (!isActive) {
        el.querySelectorAll('.filter-hidden').forEach(c => c.classList.remove('filter-hidden'));
    }
});

// Se NESSUN criterio è attivo su nessuna lista, esci pulito.
if (!channelFiltering && !epgFiltering) {
    clearAllSearchFilters();
    return;
}
    // ── Full EPG ──
    const fullEpgContainer = document.getElementById('fullEpgContainer');
    if (fullEpgContainer && !fullEpgContainer.classList.contains('hidden')) {
        // [UNIFIED-EMPTY] In grid mode il filtraggio è di A01-epg-grid.js
        // (epgGridApplyFilter → renderFullEPGGrid). #fullEpgList è nascosto
        // e i suoi .channel-item sono stale: filtrarli qui produrrebbe uno
        // stato incoerente con la griglia. Separazione dei compiti:
        // A02 gestisce la lista, A01 la griglia.
        const grid = document.getElementById('fullEpgGrid');
        if (grid && !grid.classList.contains('hidden')) {
            return;
        }

        const fullEpgList = document.getElementById('fullEpgList');
        const epgItems = document.querySelectorAll('#fullEpgList .channel-item');




        _playlistNormNamesCache = null;
        let anyVisible = false;
        epgItems.forEach(item => {
            const name = (item.getAttribute('data-name') || item.textContent || '').toLowerCase();
            const matchesQuery = !query || name.includes(query);
            const matchesFilter = !searchEpgFilterActive ||
                channelExistsForEPGName(item.getAttribute('data-name') || '');
            const isMatch = matchesQuery && matchesFilter;
            item.classList.toggle('filter-hidden', !isMatch);
            if (isMatch) anyVisible = true;
        });
        _playlistNormNamesCache = null;
        updateSearchEmptyState(fullEpgList, anyVisible, activeSearchQuery);
        return;
    }

    // ── Lista canali / preferiti ──
    const channelListContainer = document.getElementById('channelListContainer');
    if (channelListContainer && !channelListContainer.classList.contains('hidden')) {
        const channelList = document.getElementById('channelList');
        if (!channelList) return;

        let anyVisible = false;

        channelList.querySelectorAll('.group-content').forEach(content => {
            let matchFound = false;

            Array.from(content.children).forEach(child => {
                // [EMPTY-STATE] L'overlay non è figlio di .group-content, ma
                // la guardia è difensiva contro futuri riordini del DOM.
                if (child.classList.contains('search-empty-state')) return;

                const name = (child.getAttribute('data-name') || child.textContent || '').toLowerCase();
                const matchesQuery = !query || name.includes(query);

                let matchesFilter = true;
                if (searchChannelFilterActive) {
                    const key = child.getAttribute('data-key') || '';
                    const ch = findChannelByKey(key);
                    matchesFilter = !!(ch && typeof hasEPG === 'function' && hasEPG(ch));
                }

                const isMatch = matchesQuery && matchesFilter;
                child.classList.toggle('filter-hidden', !isMatch);
                if (isMatch) { matchFound = true; anyVisible = true; }
            });

            const header = content.previousElementSibling;
            if (header && header.classList.contains('group-header')) {
                header.classList.toggle('filter-hidden', !matchFound);
            }
            content.classList.toggle('filter-hidden', !matchFound);
        });

        updateSearchEmptyState(channelList, anyVisible, activeSearchQuery);
        return;
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