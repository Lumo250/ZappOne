// ================================================================
//  sidebar.js — Modulo SIDEBAR OPZIONI di ZappOne
//
//  Modulo OPZIONALE e AUTONOMO. Contiene:
//    - L'iniezione del DOM della sidebar (clona #sidebarTemplate).
//    - Tutto il wiring: drag, tab, toggle, contenuti, sistema.
//    - Le funzioni che prima stavano in zappone.js §34-§42, §63.
//
//  ON/OFF REALE:
//    - Se questo file NON è caricato, il <template> in index.html
//      resta inerte: nessun elemento #optionsSidebar esiste nel DOM,
//      nessun handle, nessuna sidebar. L'app funziona identica.
//    - Se è caricato, clona il template e attiva tutto.
//
//  CONTRATTO VERSO IL CORE:
//    - Non legge MAI variabili di zappone.js direttamente.
//    - Non chiama MAI funzioni di zappone.js direttamente.
//    - Tutto passa da window.ZappOneCore, esposto da zappone.js.
//    - Se ZappOneCore manca, esce subito con un warn.
//
//  DIPENDENZE GLOBALI (caricate prima in index.html):
//    license.js     -> appConfig
//    db.js          -> getAllM3UUrls, deleteM3UUrl, closeDB, deleteDB, ...
//    m3u-parser.js  -> countChannelsAndGroups, isValidM3UText
//    epg.js         -> renderEPGManager
//    backup.js      -> window.ZappOneBackup
//    zappone.js     -> window.ZappOneCore
//
//  ORDINE IN index.html:
//    <script src="zappone.js"></script>
//    <script src="backup.js"></script>
//    <script src="sidebar.js"></script>   <-- qui
// ================================================================

(function () {
  'use strict';

  // ─── 1. Guardie di caricamento ──────────────────────────────────
  if (typeof window.ZappOneCore === 'undefined') {
    console.warn('[sidebar] window.ZappOneCore non trovato: ' +
                 'sidebar.js deve essere caricato DOPO zappone.js. Sidebar non attivata.');
    return;
  }
  const Core = window.ZappOneCore;

  const tpl = document.getElementById('sidebarTemplate');
  if (!tpl) {
    console.warn('[sidebar] #sidebarTemplate non trovato in index.html. Sidebar non attivata.');
    return;
  }
  if (document.getElementById('optionsSidebar')) {
    console.warn('[sidebar] #optionsSidebar già presente nel DOM: sidebar.js caricato due volte?');
    return;
  }

  // ─── 2. Iniezione del DOM ───────────────────────────────────────
  document.body.appendChild(tpl.content.cloneNode(true));
  // Il template resta nell'HTML (non lo rimuoviamo): può essere ri-clonato,
  // non occupa spazio visivo e non interferisce con nulla.

  // Riferimenti stabili dopo l'iniezione
  const sidebar     = document.getElementById('optionsSidebar');
  const closeBtn    = document.getElementById('closeSidebar');
  const handle      = document.getElementById('sidebarHandle');
  const overlay     = document.getElementById('sidebarOverlay');
  const optionsBtn  = document.getElementById('optionsBtn');   // in index.html, NON nel template
  const epgDrawer   = document.getElementById('channelEpgDrawer');

  // ─── 3. Stato del modulo ────────────────────────────────────────
  let isSidebarOpen          = false;
  let isDraggingSidebar      = false;
  let dragStartXSidebar      = 0;
  let startTranslateSidebar  = 0;
  let sidebarWidth           = Math.max(240, sidebar.offsetWidth || 350);
  let currentTranslateSidebar = sidebarWidth;

  // ─── 4. Apri / chiudi sidebar ───────────────────────────────────
  function setSidebarOpen(open, animate) {
    if (animate === undefined) animate = true;
    isSidebarOpen = open;
    if (!animate) {
      sidebar.style.transition = 'none';
      overlay.style.transition = 'none';
      handle.style.transition  = 'none';
    } else {
      sidebar.style.transition = '';
      overlay.style.transition = '';
      handle.style.transition  = '';
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
      sidebar.style.transform = 'translateX(' + sidebarWidth + 'px)';
      overlay.style.opacity   = '';
      overlay.style.pointerEvents = '';
    }
  }

  // ─── 5. Drag della sidebar ──────────────────────────────────────
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function onTouchMoveSidebar(ev) {
    if (!isDraggingSidebar) return;
    if (ev.touches && ev.touches.length) {
      onDragSidebar(ev.touches[0].clientX);
      ev.preventDefault();
    }
  }

  function onMouseMoveSidebar(e) { onDragSidebar(e.clientX); }
  function onMouseUpSidebar()    { endDragSidebar(); }

  function startDragSidebar(clientX) {
    isDraggingSidebar = true;
    sidebarWidth = sidebar.offsetWidth || sidebarWidth;
    dragStartXSidebar = clientX;
    startTranslateSidebar = isSidebarOpen ? 0 : sidebarWidth;
    sidebar.style.transition = 'none';
    overlay.style.transition = 'none';
    handle.style.transition  = 'none';
    overlay.classList.add('active');
    // touchmove non-passivo registrato solo durante il drag
    document.addEventListener('touchmove', onTouchMoveSidebar, { passive: false });
  }

  function onDragSidebar(clientX) {
    if (!isDraggingSidebar) return;
    const delta = dragStartXSidebar - clientX;
    let newTranslate = clamp(startTranslateSidebar - delta, 0, sidebarWidth);
    currentTranslateSidebar = newTranslate;
    sidebar.style.transform = 'translateX(' + newTranslate + 'px)';
    overlay.style.opacity   = String(1 - (newTranslate / sidebarWidth));
  }

  function endDragSidebar() {
    if (!isDraggingSidebar) return;
    isDraggingSidebar = false;
    const shouldOpen = currentTranslateSidebar < (sidebarWidth / 2);
    if (shouldOpen) setSidebarOpen(true);
    else            setSidebarOpen(false);
    document.removeEventListener('mousemove', onMouseMoveSidebar);
    document.removeEventListener('mouseup',   onMouseUpSidebar);
    document.removeEventListener('touchmove', onTouchMoveSidebar);
  }

  // Aggancio eventi drag
  handle.addEventListener('touchstart', (ev) => {
    if (!ev.touches || !ev.touches.length) return;
    startDragSidebar(ev.touches[0].clientX);
  }, { passive: true });

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDragSidebar(e.clientX);
    document.addEventListener('mousemove', onMouseMoveSidebar);
    document.addEventListener('mouseup',   onMouseUpSidebar);
  });

  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSidebarOpen(!isSidebarOpen);
    }
  });

  document.addEventListener('touchend',    () => { if (isDraggingSidebar) endDragSidebar(); }, { passive: true });
  document.addEventListener('touchcancel', () => { if (isDraggingSidebar) endDragSidebar(); }, { passive: true });

  // Click su X e overlay
  closeBtn.addEventListener('click', () => setSidebarOpen(false));
  overlay.addEventListener('click',  () => setSidebarOpen(false));

  // Apertura dall'esterno (pulsante hidden #optionsBtn cliccato dal pill in header)
  if (optionsBtn) {
    optionsBtn.addEventListener('click', () => {
      sidebarWidth = sidebar.offsetWidth || sidebarWidth;
      updateLicenseDisplay();
      setSidebarOpen(true);
    });
  }

  // Edge-swipe dal bordo destro per aprire/chiudere la sidebar
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
  }, { passive: true });

  window.addEventListener('resize', () => {
    sidebarWidth = sidebar.offsetWidth || sidebarWidth;
    if (!isSidebarOpen) {
      currentTranslateSidebar = sidebarWidth;
      sidebar.style.transform = 'translateX(' + sidebarWidth + 'px)';
    }
  });

  // ─── 6. Drag del drawer EPG (resta accoppiato alla sidebar) ─────
  if (epgDrawer) {
    let isDraggingEPG = false;
    let dragStartXEPG = 0;
    let startTranslateEPG = 0;
    let drawerWidth = epgDrawer.offsetWidth || 350;
    let currentTranslateEPG = 0;

    function onTouchMoveEPG(ev) {
      if (!isDraggingEPG) return;
      if (ev.touches && ev.touches.length) {
        onDragEPG(ev.touches[0].clientX);
        ev.preventDefault();
      }
    }
    function startDragEPG(clientX) {
      isDraggingEPG = true;
      drawerWidth = epgDrawer.offsetWidth || drawerWidth;
      dragStartXEPG = clientX;
      startTranslateEPG = 0;
      epgDrawer.style.transition = 'none';
      document.addEventListener('touchmove', onTouchMoveEPG, { passive: false });
    }
    function onDragEPG(clientX) {
      if (!isDraggingEPG) return;
      const delta = dragStartXEPG - clientX;
      let newTranslate = Math.max(0, Math.min(drawerWidth, startTranslateEPG - delta));
      currentTranslateEPG = newTranslate;
      epgDrawer.style.transform = 'translateX(' + newTranslate + 'px)';
    }
    function endDragEPG() {
      if (!isDraggingEPG) return;
      isDraggingEPG = false;
      document.removeEventListener('touchmove', onTouchMoveEPG);
      const shouldClose = currentTranslateEPG > drawerWidth / 3;
      epgDrawer.style.transition = '';
      if (shouldClose) {
        epgDrawer.classList.remove('open');
        epgDrawer.style.transform = 'translateX(' + drawerWidth + 'px)';
        setTimeout(() => {
          epgDrawer.classList.add('hidden');
          epgDrawer.style.transform = '';
        }, 300);
      } else {
        epgDrawer.style.transform = 'translateX(0)';
      }
    }

    document.addEventListener('touchstart', (ev) => {
      if (!ev.touches) return;
      if (sidebar.classList.contains('open')) return;
      const x = ev.touches[0].clientX;
      const y = ev.touches[0].clientY;
      const headerHeight = 50, edgeWidth = 28;
      if (epgDrawer.classList.contains('open')) {
        const rect = epgDrawer.getBoundingClientRect();
        if (x >= rect.left && x <= rect.left + edgeWidth && y > headerHeight) startDragEPG(x);
      }
    }, { passive: true });

    document.addEventListener('touchend',    () => { if (isDraggingEPG) endDragEPG(); }, { passive: true });
    document.addEventListener('touchcancel', () => { if (isDraggingEPG) endDragEPG(); }, { passive: true });
  }

  // ─── 7. Tab sidebar (Aspetto / Player / Contenuti / Sistema) ───
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = document.getElementById(btn.dataset.tab);
      if (tab) tab.classList.add('active');
      if (btn.dataset.tab === 'tabContenuti') refreshContentsTab();
    });
  });

  // ─── 8. Tab Aspetto: dimensione testo ───────────────────────────
  const fontSizeRange = document.getElementById('fontSizeRange');
  const fontSizeValue = document.getElementById('fontSizeValue');
  if (fontSizeRange && fontSizeValue) {
    fontSizeRange.addEventListener('input', () => {
      const rounded = Math.round(fontSizeRange.value / 5) * 5;
      fontSizeRange.value = rounded;
      Core.applyFontSize(rounded);
      fontSizeValue.textContent = rounded + '%';
    });
    const saved = parseInt(localStorage.getItem('zappone_font_size'), 10);
    const initial = isNaN(saved) ? 100 : Math.round(saved / 5) * 5;
    fontSizeRange.value = initial;
    fontSizeValue.textContent = initial + '%';
    Core.applyFontSize(initial);
  }

  // ─── 9. Tab Aspetto: tema scuro ─────────────────────────────────
  const themeToggleSidebar = document.getElementById('themeToggleSidebar');
  if (themeToggleSidebar) {
    themeToggleSidebar.checked = (localStorage.getItem('theme') || 'dark') === 'dark';
    themeToggleSidebar.addEventListener('change', (e) => {
      Core.applyTheme(!!e.target.checked);
    });
  }

  // ─── 10. Tab Aspetto: mostra URL playlists/EPG ──────────────────
  const showPlaylistUrlToggle = document.getElementById('showPlaylistUrl');
  if (showPlaylistUrlToggle) {
    showPlaylistUrlToggle.checked = localStorage.getItem('zappone_show_playlist_url') === 'true';
    showPlaylistUrlToggle.addEventListener('change', (e) => {
      localStorage.setItem('zappone_show_playlist_url', e.target.checked ? 'true' : 'false');
      // Forza il reload delle viste playlist/EPG al prossimo ingresso
      window.forcePlaylistReload = true;
      window.forceEPGReload = true;
      const plc = document.getElementById('playlistListContainer');
      const epc = document.getElementById('epgListContainer');
      if (plc && !plc.classList.contains('hidden')) Core.renderPlaylistList();
      else if (epc && !epc.classList.contains('hidden')) Core.renderEPGManager();
    });
  }

  // ─── 11. Tab Aspetto: notifiche popup ───────────────────────────
  const popupToggle = document.getElementById('popupNotificationsToggle');
  if (popupToggle) {
    const stored = localStorage.getItem('zappone_popup_notifications');
    popupToggle.checked = stored === null ? true : stored === 'true';
    popupToggle.addEventListener('change', (e) => {
      localStorage.setItem('zappone_popup_notifications', e.target.checked ? 'true' : 'false');
    });
  }

  // ─── 12. Tab Aspetto: intercettazione console ───────────────────
  const consoleToggle = document.getElementById('consoleInterceptToggle');
  if (consoleToggle) {
    const stored = localStorage.getItem('zappone_console_overlay');
    consoleToggle.checked = stored === 'true';
    consoleToggle.addEventListener('change', (e) => {
      const on = !!e.target.checked;
      localStorage.setItem('zappone_console_overlay', on ? 'true' : 'false');
      if (on) enableConsoleIntercept(); else disableConsoleIntercept();
    });
  }

  // ─── 13. Tab Player: toggle pannelli (delega al core) ───────────
  document.getElementById('toggleMetadata')?.addEventListener('change', (e) => {
    localStorage.setItem('zappone_show_metadata', e.target.checked ? 'true' : 'false');
    // forceExpand solo quando l'utente ACCENDE il toggle: spegnendolo
    // non serve, e al bootstrap non si deve forzare.
    Core.applyMetadataVisibility({ forceExpand: e.target.checked });
  });
  document.getElementById('toggleEPG')?.addEventListener('change', (e) => {
    localStorage.setItem('zappone_show_epg', e.target.checked ? 'true' : 'false');
    Core.applyEpgVisibility({ forceExpand: e.target.checked });
  });
  document.getElementById('autoFullscreenToggle')?.addEventListener('change', (e) => {
    localStorage.setItem('zappone_auto_fullscreen', e.target.checked ? 'true' : 'false');
  });
  document.getElementById('radioToggle')?.addEventListener('change', (e) => {
    localStorage.setItem('zappone_radio_mode', e.target.checked ? 'true' : 'false');
    Core.restartStreamForRadioMode(e.target.checked);
  });
  // toggleEqualizer è gestito in equalizer.js (setupEqualizerUI); lo
  // lasciamo lì perché è strettamente legato alla Web Audio API.

  // Stato iniziale dei toggle pannello (letto da localStorage)
  (function initPanelToggles() {
    const mt = document.getElementById('toggleMetadata');
    if (mt) mt.checked = localStorage.getItem('zappone_show_metadata') === 'true';
    const et = document.getElementById('toggleEPG');
    if (et) et.checked = localStorage.getItem('zappone_show_epg') === 'true';
    const fs = document.getElementById('autoFullscreenToggle');
    if (fs) fs.checked = localStorage.getItem('zappone_auto_fullscreen') === 'true';
    const rt = document.getElementById('radioToggle');
    if (rt) rt.checked = localStorage.getItem('zappone_radio_mode') === 'true';
  })();

  // ─── 14. Tab Player: aggiornamento automatico EPG ───────────────
  (function initAutoUpdateEpgToggle() {
    const chk = document.getElementById('autoUpdateEpgToggle');
    if (!chk) return;
    const stored = localStorage.getItem('zappone_auto_update_epg');
    const enabled = stored === null ? true : stored === 'true';
    chk.checked = enabled;
    if (stored === null) localStorage.setItem('zappone_auto_update_epg', 'true');
    chk.addEventListener('change', (e) => {
      localStorage.setItem('zappone_auto_update_epg', e.target.checked ? 'true' : 'false');
    });
  })();

  // ─── 15. Tab Contenuti: sorgenti di riferimento ─────────────────
  const defaultM3UInput = document.getElementById('defaultM3UInput');
  const defaultEPGInput = document.getElementById('defaultEPGInput');

  function isValidSourceUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
  }

  function updateSourceUI(which) {
    const isM3U = which === 'm3u';
    const input    = isM3U ? defaultM3UInput : defaultEPGInput;
    const clearBtn = document.getElementById(isM3U ? 'clearM3UBtn' : 'clearEPGBtn');
    const dot      = document.getElementById(isM3U ? 'm3uStateDot' : 'epgStateDot');
    const key      = isM3U ? 'zappone_default_m3u' : 'zappone_default_epg';
    if (!input) return;
    const personalized = localStorage.getItem(key) !== null;
    if (personalized) {
      input.value = localStorage.getItem(key) || '';
    } else if (document.activeElement !== input) {
      input.value = '';
    }
    if (clearBtn) clearBtn.hidden = !personalized;
    if (dot)      dot.hidden      = !personalized;
  }

  function refreshSourceInputs() {
    updateSourceUI('m3u');
    updateSourceUI('epg');
  }

  function wireSourceInput(input, key, which) {
    if (!input) return;
    input.addEventListener('blur', () => {
      const v = input.value.trim();
      if (!v) {
        localStorage.removeItem(key);
      } else if (!isValidSourceUrl(v)) {
        Core.showNotification('URL non valido: deve iniziare con http:// o https://', true);
      } else if (v !== (localStorage.getItem(key) || '')) {
        localStorage.setItem(key, v);
      }
      updateSourceUI(which);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });
  }
  wireSourceInput(defaultM3UInput, 'zappone_default_m3u', 'm3u');
  wireSourceInput(defaultEPGInput, 'zappone_default_epg', 'epg');

  document.getElementById('clearM3UBtn')?.addEventListener('click', () => {
    localStorage.removeItem('zappone_default_m3u');
    if (defaultM3UInput) defaultM3UInput.value = '';
    updateSourceUI('m3u');
  });
  document.getElementById('clearEPGBtn')?.addEventListener('click', () => {
    localStorage.removeItem('zappone_default_epg');
    if (defaultEPGInput) defaultEPGInput.value = '';
    updateSourceUI('epg');
  });

  function applySourcesGate() {
    const sec = document.getElementById('sourcesSection');
    if (!sec) return;
    const allowed = (typeof appConfig !== 'undefined') && appConfig && appConfig.isPremium === true;
    sec.classList.toggle('hidden', !allowed);
  }

  function isAdvancedVisible() {
    const blocks = document.getElementById('advancedBlocks');
    return !!blocks && !blocks.classList.contains('hidden');
  }

  // ─── 16. Tab Contenuti: toggle avanzate ─────────────────────────
  (function setupAdvancedToggle() {
    const chk    = document.getElementById('advancedToggle');
    const blocks = document.getElementById('advancedBlocks');
    if (!chk || !blocks) return;
    chk.checked = false;
    blocks.classList.add('hidden');
    chk.addEventListener('change', (e) => {
      const on = !!e.target.checked;
      blocks.classList.toggle('hidden', !on);
      if (on) {
        applySourcesGate();
        loadM3UUrlList();
      }
    });
  })();

  // ─── 17. Tab Contenuti: panoramica ──────────────────────────────
  async function idbCountStore(storeName) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction([storeName], 'readonly').objectStore(storeName).count();
      r.onsuccess = () => resolve(r.result);
      r.onerror   = () => reject(r.error);
    });
  }

  let _overviewRun = 0;
  let _coverageCache = null;

  async function computeEpgCoverage(run) {
    const hasEpgPrograms = Array.isArray(epgData) && epgData.length > 0;
    const hasEpgIndex    = (typeof epgByName !== 'undefined') && epgByName && epgByName.size > 0;
    if (!channels.length || !hasEpgPrograms || !hasEpgIndex || typeof hasEPG !== 'function') return null;
    const sig = channels.length + '|' + epgData.length + '|' + epgByName.size;
    if (_coverageCache && _coverageCache.channelsRef === channels &&
        _coverageCache.epgRef === epgData && _coverageCache.sig === sig) {
      return _coverageCache.covered;
    }
    let covered = 0;
    let t0 = performance.now();
    for (let i = 0; i < channels.length; i++) {
      try { if (hasEPG(channels[i])) covered++; } catch (_) {}
      if ((i & 255) === 255 && performance.now() - t0 > 8) {
        await new Promise(r => setTimeout(r, 0));
        if (run !== _overviewRun) return undefined;
        t0 = performance.now();
      }
    }
    _coverageCache = { channelsRef: channels, epgRef: epgData, sig, covered };
    return covered;
  }

  async function refreshOverview() {
    const run = ++_overviewRun;
    const set = (id, text) => {
      if (run !== _overviewRun) return;
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    try {
      set('ovwChannels',  channels.length.toLocaleString('it-IT'));
      set('ovwFavorites', String(favoriteChannels.length));
      const [plCount, epgCount] = await Promise.all([
        idbCountStore('m3uUrls'),
        idbCountStore('epgUrls')
      ]);
      set('ovwPlaylists', plCount === 0 ? 'nessuna' : String(plCount));
      set('ovwEpgs',      epgCount === 0 ? 'nessuno' : String(epgCount));
      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        try {
          const { usage } = await navigator.storage.estimate();
          set('ovwStorage', usage ? (usage / 1024 / 1024).toFixed(1) + ' MB' : '—');
        } catch (_) { set('ovwStorage', '—'); }
      } else { set('ovwStorage', '—'); }
      set('ovwCoverage', '…');
      const covered = await computeEpgCoverage(run);
      if (covered === undefined) return;
      if (covered === null)       set('ovwCoverage', '—');
      else if (covered === 0)     set('ovwCoverage', 'nessuno');
      else {
        const pct = Math.round((covered / channels.length) * 100);
        set('ovwCoverage',
          `${covered.toLocaleString('it-IT')} su ${channels.length.toLocaleString('it-IT')} (${pct}%)`);
      }
    } catch (err) {
      console.warn('refreshOverview failed:', err);
    }
  }

  async function refreshContentsTab() {
    refreshSourceInputs();
    applySourcesGate();
    const tasks = [refreshOverview()];
    if (isAdvancedVisible()) tasks.push(loadM3UUrlList());
    await Promise.all(tasks);
  }

  // ─── 18. Tab Contenuti: aggiorna da remoto ──────────────────────
  const _remoteCountsCache = new Map();
  let _remoteListRun = 0;

  async function loadM3UUrlList() {
    const urlList = document.getElementById('savedM3UList');
    if (!urlList) return;
    if (!isAdvancedVisible()) return;

    const run = ++_remoteListRun;
    const allUrls = (await getAllM3UUrls()) || [];
    if (run !== _remoteListRun) return;

    urlList.innerHTML = '';
    const remoteUrls = allUrls.filter(u => u.url && u.url.startsWith('http'));
    const localCount = allUrls.length - remoteUrls.length;

    if (remoteUrls.length === 0) {
      const li = document.createElement('li');
      li.className = 'remote-empty';
      li.textContent = localCount > 0
        ? 'Le tue playlist sono tutte locali. Per aggiornarle, importa di nuovo il file dal caricamento playlist.'
        : 'Nessuna playlist remota configurata.';
      urlList.appendChild(li);
      return;
    }

    const pendingCounts = [];
    remoteUrls.forEach(item => {
      const meta = { id: item.id, url: item.url, name: item.name };
      const li = document.createElement('li');
      li.className = 'remote-item';
      li.dataset.id = item.id;

      const body = document.createElement('div');
      body.className = 'remote-item-body';

      const name = document.createElement('div');
      name.className = 'remote-item-name';
      name.textContent = item.name || item.url;
      body.appendChild(name);

      let dateText = 'mai aggiornata';
      if (item.lastFetched) {
        const d = new Date(item.lastFetched);
        dateText = d.toLocaleDateString('it-IT') + ' ' +
                   d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const metaEl = document.createElement('div');
      metaEl.className = 'remote-item-meta';
      metaEl.textContent = dateText;
      body.appendChild(metaEl);
      li.appendChild(body);

      if (item.isActive) {
        const badge = document.createElement('span');
        badge.className = 'remote-item-active-badge';
        badge.textContent = 'attiva';
        li.appendChild(badge);
      }

      li.addEventListener('click', () => reloadRemotePlaylist(li, meta));
      urlList.appendChild(li);

      if (item.content) pendingCounts.push({ item, metaEl, dateText });
    });

    if (localCount > 0) {
      const note = document.createElement('li');
      note.className = 'remote-local-note';
      note.textContent = '+ ' + localCount + ' playlist ' +
        (localCount === 1 ? 'locale' : 'locali') + ' (non ricaricabili qui)';
      urlList.appendChild(note);
    }

    for (const p of pendingCounts) {
      if (run !== _remoteListRun) return;
      const key = p.item.id + ':' + (p.item.lastFetched || 0);
      let txt = _remoteCountsCache.get(key);
      if (txt === undefined) {
        try {
          const { channelCount, groupCount } = countChannelsAndGroups(p.item.content);
          txt = channelCount + ' canali, ' + groupCount + ' gruppi';
        } catch (_) { txt = ''; }
        const stale = [];
        for (const k of _remoteCountsCache.keys()) if (k.startsWith(p.item.id + ':')) stale.push(k);
        stale.forEach(k => _remoteCountsCache.delete(k));
        _remoteCountsCache.set(key, txt);
        await new Promise(r => setTimeout(r, 0));
      }
      if (txt && p.metaEl.isConnected) p.metaEl.textContent = p.dateText + ' · ' + txt;
    }
  }

  async function reloadRemotePlaylist(li, meta) {
    if (li.dataset.busy === '1') return;
    const ok = confirm(
      'Ricaricare "' + (meta.name || meta.url) + '" dal server?\n\n' +
      'Se hai rinominato, spostato o eliminato canali in questa playlist, ' +
      'quelle modifiche andranno perse.'
    );
    if (!ok) return;
    li.dataset.busy = '1';
    li.style.opacity = '0.5';
    li.style.pointerEvents = 'none';
    try {
      const text = await fetchM3UWithProxies(meta.url);
      if (!isValidM3UText(text)) throw new Error('contenuto non valido');
      await saveAndActivateM3U({ url: meta.url, name: meta.name, content: text });
      await parseM3U(text, false);
      Core.updateButtons();
      Core.showNotification('Playlist "' + (meta.name || meta.url) + '" aggiornata');
      window.forcePlaylistReload = true;
      await refreshContentsTab();
      if (window.isPlaylistView) Core.renderPlaylistList();
    } catch (err) {
      console.error('Reload remoto fallito:', err);
      Core.showNotification('Aggiornamento fallito', true);
      li.dataset.busy = '';
      li.style.opacity = '';
      li.style.pointerEvents = '';
    }
  }

  // ─── 19. Tab Sistema: updateLicenseDisplay ──────────────────────
  function updateLicenseDisplay() {
    const el = document.getElementById('currentLicenseDisplay');
    if (!el) return;
    const isPremiumNow = typeof appConfig !== 'undefined' && appConfig && appConfig.isPremium;
    if (isPremiumNow) {
      const license = localStorage.getItem('zappone_license') || '—';
      let text = 'Licenza: ' + license;
      if (appConfig.devicesCount != null && appConfig.maxDevices != null) {
        text += ' (' + appConfig.devicesCount + '/' + appConfig.maxDevices + ')';
      }
      el.textContent = text;
    } else {
      const stored = localStorage.getItem('zappone_license');
      el.textContent = (stored && stored !== 'demo_user')
        ? 'Licenza: Demo — la chiave salvata non risulta attiva'
        : 'Licenza: Demo';
    }
  }

  // ─── 20. Tab Sistema: manuale utente ────────────────────────────
  (function setupManual() {
    const btn      = document.getElementById('openManualBtn');
    const manualOv = document.getElementById('manualOverlay');
    const closeBtnM = document.getElementById('closeManualBtn');
    if (!btn || !manualOv || !closeBtnM) return;

    const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const USE_HISTORY = !IS_IOS;

    function destroyFrame() {
      manualOv.querySelectorAll('iframe').forEach(f => f.remove());
    }
    destroyFrame();

    if (location.hash === '#manuale') {
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (_) {}
    }

    function isOpen() { return !manualOv.classList.contains('hidden'); }

    function hookAnchors(frame) {
      let doc;
      try { doc = frame.contentDocument; } catch (_) { return; }
      if (!doc) return;
      doc.addEventListener('click', (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
        if (!a) return;
        e.preventDefault();
        let id = a.getAttribute('href').slice(1);
        try { id = decodeURIComponent(id); } catch (_) {}
        const target = id ? doc.getElementById(id) : null;
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else {
          const scroller = doc.scrollingElement || doc.documentElement;
          if (scroller && scroller.scrollTo) scroller.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    function showOverlay() {
      destroyFrame();
      const frame = document.createElement('iframe');
      frame.id = 'manualFrame';
      frame.title = 'Manuale utente ZappOne';
      frame.addEventListener('load', () => hookAnchors(frame));
      frame.src = 'guida.html';
      manualOv.appendChild(frame);
      manualOv.classList.remove('hidden');
      manualOv.setAttribute('aria-hidden', 'false');
         closeBtn?.click?.(); // chiudi sidebar (no-op se assente)
    }

    function hideOverlay() {
      manualOv.classList.add('hidden');
      manualOv.setAttribute('aria-hidden', 'true');
      destroyFrame();
    }

    function openManual() {
      if (isOpen()) return;
      showOverlay();
      if (USE_HISTORY) history.pushState({ manual: true }, '', '#manuale');
    }
    function closeManual() {
      if (!isOpen()) return;
      hideOverlay();
      if (USE_HISTORY && history.state && history.state.manual) history.back();
    }

    btn.addEventListener('click', openManual);
    closeBtnM.addEventListener('click', closeManual);

    if (USE_HISTORY) {
      window.addEventListener('popstate', (e) => {
        const wantOpen = !!(e.state && e.state.manual);
        if (wantOpen && !isOpen()) showOverlay();
        else if (!wantOpen && isOpen()) hideOverlay();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) closeManual();
    });
  })();

  // ─── 21. Tab Sistema: cambia licenza ────────────────────────────
  document.getElementById('changeLicenseBtn')?.addEventListener('click', () => {
    if (!confirm('Vuoi inserire o cambiare la licenza?\nL\'app si riavvierà e ti chiederà la nuova chiave.')) return;
    ['zappone_license', 'zappone_jwt', 'zappone_demo_mode', 'zappone_config_cache']
      .forEach(k => localStorage.removeItem(k));
    window.location.replace(window.location.origin + window.location.pathname);
  });

  // ─── 22. Tab Sistema: reset settings ────────────────────────────
  document.getElementById('resetListBtn')?.addEventListener('click', async () => {
    const LICENSE_KEYS = ['zappone_license', 'zappone_jwt', 'zappone_device_id', 'zappone_config_cache'];
    Object.keys(localStorage).forEach(key => {
      if (!LICENSE_KEYS.includes(key)) localStorage.removeItem(key);
    });
    localStorage.setItem('zappone_show_metadata', 'false');
    localStorage.setItem('metadataExpanded', 'false');
    localStorage.setItem('zappone_show_epg', 'false');
    localStorage.setItem('zappone_auto_fullscreen', 'false');
    localStorage.setItem('zappone_show_playlist_url', 'false');
    localStorage.setItem('zappone_show_favorites', 'false');
    localStorage.setItem('zappone_view_mode', 'list');
    localStorage.setItem('zappone_popup_notifications', 'true');
    localStorage.setItem('zappone_console_overlay', 'false');
    localStorage.setItem('zappone_radio_mode', 'false');
    localStorage.setItem('zappone_show_equalizer', 'false');
    localStorage.setItem('zappone_eq_preset', 'normale');
    localStorage.setItem('zappone_auto_update_epg', 'true');

    // Aggiorna i controlli della sidebar allo stato di default
    const metaToggle = document.getElementById('toggleMetadata'); if (metaToggle) metaToggle.checked = false;
    const epgToggle  = document.getElementById('toggleEPG');      if (epgToggle)  epgToggle.checked  = false;
    const fsToggle   = document.getElementById('autoFullscreenToggle'); if (fsToggle) fsToggle.checked = false;
    const urlToggle  = document.getElementById('showPlaylistUrl'); if (urlToggle) urlToggle.checked = false;
    const popupTgl   = document.getElementById('popupNotificationsToggle'); if (popupTgl) popupTgl.checked = true;
    const consTgl    = document.getElementById('consoleInterceptToggle');   if (consTgl)  consTgl.checked  = false;
    const radioTgl   = document.getElementById('radioToggle');     if (radioTgl)   radioTgl.checked   = false;
    const eqTgl      = document.getElementById('toggleEqualizer'); if (eqTgl)      eqTgl.checked      = false;
    const autoEpgTgl = document.getElementById('autoUpdateEpgToggle'); if (autoEpgTgl) autoEpgTgl.checked = true;
    const advTgl     = document.getElementById('advancedToggle');  if (advTgl)     advTgl.checked     = false;
    const advBlocks  = document.getElementById('advancedBlocks');  if (advBlocks)  advBlocks.classList.add('hidden');

    const themeToggleSidebar = document.getElementById('themeToggleSidebar');
    if (themeToggleSidebar) themeToggleSidebar.checked = true;
    if (fontSizeRange) fontSizeRange.value = 100;
    if (fontSizeValue) fontSizeValue.textContent = '100%';

    // Applica al core
    Core.applyTheme(true);
    Core.applyFontSize(100);
    disableConsoleIntercept();
    Core.resetRuntimeState({ keepFavorites: true });

    Core.showNotification('Settings resettati');

    window.forcePlaylistReload = true;
    window.forceEPGReload = true;

    await Core.loadRemoteM3U(Core.getDefaultPlaylistUrl(), true);
    Core.refreshPlaylistUIs();
    if (window.isEPGView) Core.renderEPGManager();
    Core.updateButtons();
  });

  // ─── 23. Tab Sistema: hard reset ────────────────────────────────
  document.getElementById('hardReset')?.addEventListener('click', async () => {
    if (!confirm('Sei sicuro di voler eseguire un Hard Reset?\n\nLa licenza resterà salvata su questo dispositivo.')) return;
    try {
      const KEEP_KEYS = ['zappone_license', 'zappone_jwt', 'zappone_device_id', 'zappone_config_cache'];
      const keptValues = KEEP_KEYS.map(k => [k, localStorage.getItem(k)]).filter(([, v]) => v !== null);
      localStorage.clear();
      keptValues.forEach(([k, v]) => localStorage.setItem(k, v));

      if (typeof closeDB === 'function') await closeDB();
      await Promise.all([ deleteDB('ZappOneDB'), deleteDB('M3UPlaylistsDB') ]);

      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        } catch (e) { console.warn('Cache clear failed', e); }
      }
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        } catch (e) { console.warn('SW unregister failed', e); }
      }

      Core.resetRuntimeState({ keepFavorites: false });

      setTimeout(() => {
        window.location.replace(window.location.origin + window.location.pathname);
      }, 300);
    } catch (err) {
      console.error('Hard reset failed:', err);
      alert('Errore durante Hard Reset: vedi console per dettagli.');
    }
  });

  // ─── 24. Intercettazione console ────────────────────────────────
  const originalConsole = {
    log: console.log, error: console.error, warn: console.warn,
    info: console.info, debug: console.debug
  };

  function interceptConsole(method, isError) {
    const original = originalConsole[method];
    console[method] = function (...args) {
      original.apply(console, args);
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg); } catch (e) { return String(arg); }
        }
        return String(arg);
      }).join(' ');
      Core.showNotification(method.toUpperCase() + ': ' + message, !!isError, true);
    };
  }

  function enableConsoleIntercept() {
    interceptConsole('error', true);
    interceptConsole('warn', true);
    interceptConsole('log', false);
    interceptConsole('info', false);
    interceptConsole('debug', false);
    originalConsole.log('Intercettazione console: ENABLED');
  }
  function disableConsoleIntercept() {
    console.log   = originalConsole.log;
    console.error = originalConsole.error;
    console.warn  = originalConsole.warn;
    console.info  = originalConsole.info;
    console.debug = originalConsole.debug;
    originalConsole.log('Intercettazione console: DISABLED');
  }

  // Applica lo stato iniziale dell'intercettazione console
  if (localStorage.getItem('zappone_console_overlay') === 'true') enableConsoleIntercept();

  // ─── 25. Init dipendente dalla config ───────────────────────────
  function _onConfigReady() {
    updateLicenseDisplay();
    refreshSourceInputs();
    applySourcesGate();
  }

  // ─── 26. Stato iniziale della sidebar (chiusa, no animazione) ───
  sidebarWidth = sidebar.offsetWidth || 350;
  setSidebarOpen(false, false);

  // Se la config è già pronta (caso raro: sidebar.js caricato dopo
  // che getConfigFromServer ha già risolto), applichiamo subito.
  if (typeof appConfig !== 'undefined' && appConfig && appConfig.status) {
    _onConfigReady();
  }

  // ─── 27. API pubblica ───────────────────────────────────────────
  window.ZappOneSidebar = {
    _onConfigReady,
    open:  () => setSidebarOpen(true),
    close: () => setSidebarOpen(false),
    isOpen: () => isSidebarOpen,
    updateLicenseDisplay,
    refreshSourceInputs,
    applySourcesGate,
    refreshContentsTab,
    loadM3UUrlList,
    enableConsoleIntercept,
    disableConsoleIntercept,
  };

  console.log('[sidebar] Modulo attivo.');
})();