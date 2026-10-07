// ================================================================
//  MODULO EPG — VISTA GRIGLIA (palinsesto orizzontale)
//
//  UN solo scroll container nativo. Sticky nativo per pannelli fissi.
//  Nessuna sincronizzazione JS: il browser muove tutto insieme.
//
//    .feg-scroll                       (overflow: auto, entrambi gli assi)
//      .feg-inner                      (display: flex; width: max-content)
//        .feg-left                     (sticky left)  ← colonna nomi
//          .feg-corner                 (sticky top, dentro .feg-left)
//          .feg-names                  (relative; virtualized)
//        .feg-right                    (flex: 1)
//          .feg-hours                  (sticky top)
//          .feg-timeline               (relative; virtualized)
//
//  Sticky annidati solo su assi ortogonali (left + top): nessuna
//  sovrapposizione, nessun floating.
//
//  touch-action vincola i gesti per area:
//    .feg-names    → pan-y  (solo scroll verticale)
//    .feg-timeline → pan-x  (solo scroll orizzontale)
//
//  Virtualizzazione: solo le righe visibili (+buffer) sono in DOM.
// ================================================================

const FEG = {
  COL_WIDTH: 96,
  ROW_HEIGHT: 82,
  HOURS_HEIGHT: 32,
  PX_PER_HOUR: 200,
  LEAD_HOURS: 15,
  WINDOW_HOURS: 15 + 24 + 15,
  TIMELINE_WIDTH: (15 + 24 + 15) * 200,
  ROW_BUFFER: 4
};

const _fegState = {
  channels: [],
  filterQuery: '',
  filterUseEpg: false,
  windowStartMs: 0,
  totalRows: 0,
  domRefs: null,
  renderedRows: new Set(),
  nowTimer: null,
  scrollRaf: 0
};

let fullEpgViewMode = localStorage.getItem('zappone_full_epg_view_mode') || 'list';


// ============================================================================
// RENDER
// ============================================================================

function renderFullEPGGrid() {
  const container = document.getElementById('fullEpgGrid');
  if (!container) return;

  const _searchInput = document.getElementById('searchInput');
  _fegState.filterQuery = (_searchInput ? _searchInput.value : '').toLowerCase().trim();
  _fegState.filterUseEpg =
    (typeof getCurrentFilterFlag === 'function') && getCurrentFilterFlag();

  _fegState.domRefs = null;
  _fegState.renderedRows.clear();
  if (_fegState.scrollRaf) { cancelAnimationFrame(_fegState.scrollRaf); _fegState.scrollRaf = 0; }
  if (_fegState.nowTimer) { clearInterval(_fegState.nowTimer); _fegState.nowTimer = null; }

  const all = (epgDisplayList || []).filter(ch => (ch.programs || []).length > 0);
  _fegState.channels = applyFilter(all, _fegState.filterQuery);

  container.innerHTML = '';

  if (_fegState.channels.length === 0) {
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    const img = document.createElement('img');
    img.src = 'nofullepg.svg';
    img.alt = 'Nessun EPG disponibile';
    img.className = 'no-epg';
    img.style.maxHeight = '50vh';
    container.appendChild(img);
    return;
  }

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setTime(windowStart.getTime() - FEG.LEAD_HOURS * 3600000);
  _fegState.windowStartMs = windowStart.getTime();
  _fegState.totalRows = _fegState.channels.length;

  container.style.display = 'flex';
  container.style.alignItems = '';
  container.style.justifyContent = '';

  const totalHeight = _fegState.totalRows * FEG.ROW_HEIGHT;

  // ---------- .feg-scroll (UNICO scroll container) ----------
  const scroll = document.createElement('div');
  scroll.className = 'feg-scroll';

  // ---------- .feg-inner (flex orizzontale) ----------
  const inner = document.createElement('div');
  inner.className = 'feg-inner';

  // ---------- colonna sinistra (sticky left) ----------
  const left = document.createElement('div');
  left.className = 'feg-left';

  const corner = document.createElement('div');
  corner.className = 'feg-corner';
  left.appendChild(corner);

  const names = document.createElement('div');
  names.className = 'feg-names';
  names.style.height = totalHeight + 'px';
  left.appendChild(names);

  inner.appendChild(left);

  // ---------- colonna destra ----------
  const right = document.createElement('div');
  right.className = 'feg-right';

  const hours = document.createElement('div');
  hours.className = 'feg-hours';
  hours.style.width = FEG.TIMELINE_WIDTH + 'px';
  const startHour = windowStart.getHours();
  for (let h = 0; h < FEG.WINDOW_HOURS; h++) {
    const el = document.createElement('div');
    el.className = 'feg-hour';
    el.textContent = String((startHour + h) % 24).padStart(2, '0') + ':00';
    hours.appendChild(el);
  }
  right.appendChild(hours);

  const timeline = document.createElement('div');
  timeline.className = 'feg-timeline';
  timeline.style.width = FEG.TIMELINE_WIDTH + 'px';
  timeline.style.height = totalHeight + 'px';

  const nowLine = document.createElement('div');
  nowLine.className = 'feg-now-line';
  timeline.appendChild(nowLine);

  right.appendChild(timeline);
  inner.appendChild(right);

  scroll.appendChild(inner);
  container.appendChild(scroll);

  _fegState.domRefs = { container, scroll, names, timeline, nowLine };

  scroll.addEventListener('scroll', onFegScroll, { passive: true });

  requestAnimationFrame(() => renderVisibleRows());

  updateNowLine();
  _fegState.nowTimer = setInterval(updateNowLine, 60000);

  requestAnimationFrame(() => {
    const nowPx = ((Date.now() - _fegState.windowStartMs) / 3600000) * FEG.PX_PER_HOUR;
    let target = nowPx - scroll.clientWidth / 3;
    const max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    if (target < 0) target = 0;
    if (target > max) target = max;
    scroll.scrollLeft = target;
  });
}


function applyFullEpgViewMode() {
  const listEl = document.getElementById('fullEpgList');
  const gridEl = document.getElementById('fullEpgGrid');
  if (!listEl || !gridEl) return;

  const navPrev = document.getElementById('fullEpgTimeNavPrev');
  const navNext = document.getElementById('fullEpgTimeNavNext');

  if (fullEpgViewMode === 'grid') {
    listEl.classList.add('hidden');
    gridEl.classList.remove('hidden');
    if (navPrev) navPrev.classList.remove('hidden');
    if (navNext) navNext.classList.remove('hidden');
    renderFullEPGGrid();
  } else {
    gridEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    if (navPrev) navPrev.classList.add('hidden');
    if (navNext) navNext.classList.add('hidden');
    if (_fegState.nowTimer) { clearInterval(_fegState.nowTimer); _fegState.nowTimer = null; }
  }

  const header = document.getElementById('fullEpgHeader');
  if (header) header.setAttribute('data-mode', fullEpgViewMode === 'grid' ? 'grid' : 'list');
}


function setupFullEpgViewToggle() {
  const header = document.getElementById('fullEpgHeader');
  if (!header || header.__toggleInit) return;
  header.__toggleInit = true;

  header.addEventListener('click', (e) => {
    if (e.target.closest('#fullEpgBackBtn')) return;
    fullEpgViewMode = (fullEpgViewMode === 'grid') ? 'list' : 'grid';
    localStorage.setItem('zappone_full_epg_view_mode', fullEpgViewMode);
    if (typeof renderFullEPGList === 'function') renderFullEPGList();
    else applyFullEpgViewMode();
  });

  header.setAttribute('data-mode', fullEpgViewMode === 'grid' ? 'grid' : 'list');
}


// ============================================================================
// FILTRO
// ============================================================================

function applyFilter(channels, query) {
  let result = channels;
  if (query) {
    const q = query.toLowerCase().trim();
    if (q) result = result.filter(ch => (ch.name || '').toLowerCase().includes(q));
  }
  if (_fegState.filterUseEpg && typeof channelExistsForEPGName === 'function') {
    result = result.filter(ch => channelExistsForEPGName(ch.name || ''));
  }
  return result;
}

window.epgGridApplyFilter = function(query) {
  const newQ = (query || '').toLowerCase().trim();
  const newEpg = (typeof getCurrentFilterFlag === 'function') && getCurrentFilterFlag();
  if (newQ === _fegState.filterQuery && newEpg === _fegState.filterUseEpg) return;
  _fegState.filterQuery = newQ;
  _fegState.filterUseEpg = newEpg;
  const grid = document.getElementById('fullEpgGrid');
  if (grid && !grid.classList.contains('hidden')) renderFullEPGGrid();
};

(function hookSearchInput() {
  const input = document.getElementById('searchInput');
  if (input && !input.__fegHooked) {
    input.__fegHooked = true;
    let t = null;
    input.addEventListener('input', () => {
      if (fullEpgViewMode !== 'grid') return;
      const grid = document.getElementById('fullEpgGrid');
      if (!grid || grid.classList.contains('hidden')) return;
      clearTimeout(t);
      t = setTimeout(() => window.epgGridApplyFilter(input.value), 160);
    });
  }
  const filterBtn = document.getElementById('searchFilterToggle');
  if (filterBtn && !filterBtn.__fegHooked) {
    filterBtn.__fegHooked = true;
    filterBtn.addEventListener('click', () => {
      if (fullEpgViewMode !== 'grid') return;
      const grid = document.getElementById('fullEpgGrid');
      if (!grid || grid.classList.contains('hidden')) return;
      setTimeout(() => {
        const input = document.getElementById('searchInput');
        window.epgGridApplyFilter(input ? input.value : '');
      }, 0);
    });
  }
})();


// ============================================================================
// VIRTUALIZZAZIONE
// ============================================================================

function onFegScroll() {
  if (_fegState.scrollRaf) return;
  _fegState.scrollRaf = requestAnimationFrame(() => {
    _fegState.scrollRaf = 0;
    renderVisibleRows();
  });
}

function renderVisibleRows() {
  const refs = _fegState.domRefs;
  if (!refs) return;

  const st = refs.scroll.scrollTop;
  const vh = refs.scroll.clientHeight;
  const total = _fegState.totalRows;

  const first = Math.max(0, Math.floor(st / FEG.ROW_HEIGHT) - FEG.ROW_BUFFER);
  const last = Math.min(total - 1, Math.ceil((st + vh) / FEG.ROW_HEIGHT) + FEG.ROW_BUFFER);

  const rendered = _fegState.renderedRows;

  for (const i of rendered) {
    if (i < first || i > last) {
      removeRow(i);
      rendered.delete(i);
    }
  }
  for (let i = first; i <= last; i++) {
    if (!rendered.has(i)) {
      addRow(i);
      rendered.add(i);
    }
  }
}

function removeRow(index) {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const row = refs.timeline.querySelector('.feg-row[data-row="' + index + '"]');
  const cell = refs.names.querySelector('.feg-name-cell[data-row="' + index + '"]');
  if (row) row.remove();
  if (cell) cell.remove();
}

function addRow(index) {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const channel = _fegState.channels[index];
  if (!channel) return;

  const windowStartMs = _fegState.windowStartMs;
  const windowEndMs = windowStartMs + FEG.WINDOW_HOURS * 3600000;

  // Cella nome
  const cell = document.createElement('div');
  cell.className = 'feg-name-cell';
  cell.dataset.row = index;
  cell.style.top = (index * FEG.ROW_HEIGHT) + 'px';

  const logo = document.createElement('img');
  logo.className = 'feg-name-logo';
  logo.dataset.src = (typeof sanitizeImageUrl === 'function')
    ? (sanitizeImageUrl(channel.logo) || (typeof EPG_PLACEHOLDER !== 'undefined' ? EPG_PLACEHOLDER : ''))
    : (channel.logo || '');
  logo.alt = '';
  logo.onerror = function () {
    this.onerror = null;
    if (typeof EPG_PLACEHOLDER !== 'undefined') this.src = EPG_PLACEHOLDER;
  };
  if (typeof getSharedObserver === 'function') getSharedObserver().observe(logo);
  cell.appendChild(logo);

  const nameText = document.createElement('div');
  nameText.className = 'feg-name-text';
  nameText.textContent = channel.name || 'Sconosciuto';
  nameText.title = channel.name || '';
  cell.appendChild(nameText);

  cell.addEventListener('click', () => scrollFullEpgToNow());

  refs.names.appendChild(cell);

  // Riga programmi
  const row = document.createElement('div');
  row.className = 'feg-row';
  row.dataset.row = index;
  row.style.top = (index * FEG.ROW_HEIGHT) + 'px';

  const programs = channel.programs || [];
  for (let p = 0; p < programs.length; p++) {
    const prog = programs[p];
    const startT = new Date(prog.start).getTime();
    const endT = new Date(prog.end).getTime();
    if (isNaN(startT) || isNaN(endT)) continue;
    if (endT <= windowStartMs || startT >= windowEndMs) continue;

    const clippedStart = Math.max(startT, windowStartMs);
    const clippedEnd = Math.min(endT, windowEndMs);
    const durMs = clippedEnd - clippedStart;
    if (durMs <= 0) continue;

    const leftPx = ((clippedStart - windowStartMs) / 3600000) * FEG.PX_PER_HOUR;
    const widthPx = (durMs / 3600000) * FEG.PX_PER_HOUR;

    const isCurrent = (typeof isProgramCurrentlyAiring === 'function')
      ? isProgramCurrentlyAiring(prog) : false;
    const showPoster = isCurrent && prog.poster && widthPx >= 150;

    const bar = document.createElement('div');
    bar.className = 'feg-prog'
      + (isCurrent ? ' current' : '')
      + (showPoster ? ' has-poster' : '');
    bar.style.left = leftPx + 'px';
    bar.style.width = widthPx + 'px';

    const textWrap = document.createElement('div');
    textWrap.className = 'feg-prog-text';

    const titleEl = document.createElement('div');
    titleEl.className = 'feg-prog-title';
    titleEl.textContent = prog.title || '';
    textWrap.appendChild(titleEl);

    const timeEl = document.createElement('div');
    timeEl.className = 'feg-prog-time';
    timeEl.textContent = new Date(clippedStart).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit'
    });
    textWrap.appendChild(timeEl);
    bar.appendChild(textWrap);

    if (showPoster) {
      const posterImg = document.createElement('img');
      posterImg.className = 'feg-prog-poster';
      posterImg.loading = 'lazy';
      posterImg.src = (typeof sanitizeImageUrl === 'function')
        ? sanitizeImageUrl(prog.poster) : prog.poster;
      posterImg.alt = '';
      posterImg.onerror = function () {
        this.remove();
        bar.classList.remove('has-poster');
      };
      bar.appendChild(posterImg);
    }

    if (isCurrent) {
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        playChannelFromEpgGrid(channel);
      });
    }

    row.appendChild(bar);
  }

  refs.timeline.appendChild(row);
}


// ============================================================================
// LINEA "NOW"
// ============================================================================

function updateNowLine() {
  const refs = _fegState.domRefs;
  if (!refs || !_fegState.windowStartMs) return;
  const nowPx = ((Date.now() - _fegState.windowStartMs) / 3600000) * FEG.PX_PER_HOUR;
  refs.nowLine.style.left = nowPx + 'px';
}


// ============================================================================
// NAVIGAZIONE
// ============================================================================

function scrollFullEpgByHour(direction) {
  const refs = _fegState.domRefs;
  if (!refs) return;
  refs.scroll.scrollBy({ left: (FEG.PX_PER_HOUR / 2) * direction, behavior: 'smooth' });
}

function scrollFullEpgToNow() {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const nowPx = ((Date.now() - _fegState.windowStartMs) / 3600000) * FEG.PX_PER_HOUR;
  const max = Math.max(0, refs.scroll.scrollWidth - refs.scroll.clientWidth);
  let target = nowPx - refs.scroll.clientWidth / 2;
  if (target < 0) target = 0;
  if (target > max) target = max;
  refs.scroll.scrollTo({ left: target, behavior: 'smooth' });
}

function setupFullEpgTimeNav() {
  const prev = document.getElementById('fullEpgTimeNavPrev');
  const next = document.getElementById('fullEpgTimeNavNext');
  if (prev && !prev.__init) {
    prev.__init = true;
    prev.addEventListener('click', (e) => { e.stopPropagation(); scrollFullEpgByHour(-1); });
  }
  if (next && !next.__init) {
    next.__init = true;
    next.addEventListener('click', (e) => { e.stopPropagation(); scrollFullEpgByHour(1); });
  }
}


// ============================================================================
// PLAY DA GRIGLIA
// ============================================================================

async function playChannelFromEpgGrid(epgChannel) {
  if (!epgChannel) return;
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


// ============================================================================
// HOOK su renderFullEPGList (epg.js)
// ============================================================================

(function hookRenderFullEPGList() {
  if (typeof renderFullEPGList !== 'function' || renderFullEPGList.__renderGridHooked) return;
  const original = renderFullEPGList;
  window.renderFullEPGList = function () {
    const result = original.apply(this, arguments);
    try { applyFullEpgViewMode(); }
    catch (err) { console.warn('applyFullEpgViewMode fallita:', err); }
    return result;
  };
  window.renderFullEPGList.__renderGridHooked = true;
})();


// ============================================================================
// RESIZE
// ============================================================================

window.addEventListener('resize', () => {
  if (fullEpgViewMode !== 'grid') return;
  const grid = document.getElementById('fullEpgGrid');
  if (!grid || grid.classList.contains('hidden')) return;
  if (_fegState.scrollRaf) cancelAnimationFrame(_fegState.scrollRaf);
  _fegState.scrollRaf = requestAnimationFrame(() => {
    _fegState.scrollRaf = 0;
    renderVisibleRows();
  });
});