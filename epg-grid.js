// ================================================================
//  MODULO EPG — VISTA TIMELINE (lista verticale + finestra temporale)
//
//  Design "state of the art" per mobile:
//    - UNA sola direzione di scroll (verticale, nativa, momentum-safe)
//    - Finestra temporale fissa, navigata con pulsanti ◀ ▶
//    - Zoom 1h / 2h / 3h
//    - Tile adiacenti con stati past / current / future
//    - Click su "in onda ora" → play
//    - Click su past/future → pannello dettagli programma
//    - Virtualizzazione righe
//
//  Nessuno scroll orizzontale → nessun bug di momentum iOS.
// ================================================================

const FEG = {
  LOGO_WIDTH: 72,
  ROW_HEIGHT: 82,
  RULER_HEIGHT: 40,
  VISIBLE_HOURS_OPTIONS: [1, 2, 3],
  DEFAULT_VISIBLE_HOURS: 2,
  STEP_MINUTES: 30,
  TILE_GAP: 4,
  ROW_BUFFER: 5
};

const _fegState = {
  channels: [],
  filterQuery: '',
  filterUseEpg: false,
  windowStartMs: 0,
  windowIsManual: false,
  visibleHours: 2,
  totalRows: 0,
  pxPerHour: 0,
  domRefs: null,
  renderedRows: new Set(),
  nowTimer: null,
  scrollRaf: 0,
  resizeObs: null
};

let fullEpgViewMode = localStorage.getItem('zappone_full_epg_view_mode') || 'list';


// ============================================================================
// UTILITY TEMPO
// ============================================================================

function fmtHHMM(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDateLong(ms) {
  return new Date(ms).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}


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
  if (_fegState.resizeObs) { _fegState.resizeObs.disconnect(); _fegState.resizeObs = null; }

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

  // Finestra temporale: "ora" ESATTAMENTE al centro, senza arrotondamenti.
  if (!_fegState.windowStartMs || !_fegState.windowIsManual) {
    const halfWindowMs = (_fegState.visibleHours * 3600000) / 2;
    _fegState.windowStartMs = Date.now() - halfWindowMs;
  }
  _fegState.totalRows = _fegState.channels.length;

  container.style.display = 'flex';
  container.style.alignItems = '';
  container.style.justifyContent = '';

  // ===== Barra navigazione tempo =====
  const timeNav = document.createElement('div');
  timeNav.className = 'feg-timenav';

  const btnPrev = document.createElement('button');
  btnPrev.type = 'button';
  btnPrev.className = 'feg-nav-btn';
  btnPrev.setAttribute('aria-label', 'Indietro nel tempo');
  btnPrev.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  btnPrev.addEventListener('click', () => shiftTime(-1));

  const timeLabel = document.createElement('div');
  timeLabel.className = 'feg-time-label';

  const btnNext = document.createElement('button');
  btnNext.type = 'button';
  btnNext.className = 'feg-nav-btn';
  btnNext.setAttribute('aria-label', 'Avanti nel tempo');
  btnNext.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  btnNext.addEventListener('click', () => shiftTime(1));

  const btnZoom = document.createElement('button');
  btnZoom.type = 'button';
  btnZoom.className = 'feg-chip';
  btnZoom.addEventListener('click', cycleZoom);

  const btnNow = document.createElement('button');
  btnNow.type = 'button';
  btnNow.className = 'feg-chip feg-chip-accent';
  btnNow.textContent = 'Ora';
  btnNow.addEventListener('click', () => gotoNow());

  timeNav.appendChild(btnPrev);
  timeNav.appendChild(timeLabel);
  timeNav.appendChild(btnNext);
  timeNav.appendChild(btnZoom);
  timeNav.appendChild(btnNow);
  container.appendChild(timeNav);

  // ===== Righello =====
  const ruler = document.createElement('div');
  ruler.className = 'feg-ruler';

  const rulerCorner = document.createElement('div');
  rulerCorner.className = 'feg-ruler-corner';
  ruler.appendChild(rulerCorner);

  const rulerHours = document.createElement('div');
  rulerHours.className = 'feg-ruler-hours';
  ruler.appendChild(rulerHours);

  container.appendChild(ruler);

  // ===== Scroll =====
  const scroll = document.createElement('div');
  scroll.className = 'feg-scroll';

  const rowsContainer = document.createElement('div');
  rowsContainer.className = 'feg-rows';
  rowsContainer.style.height = (_fegState.totalRows * FEG.ROW_HEIGHT) + 'px';

  const nowLine = document.createElement('div');
  nowLine.className = 'feg-now-line';
  rowsContainer.appendChild(nowLine);

  scroll.appendChild(rowsContainer);
  container.appendChild(scroll);

  _fegState.domRefs = {
    container, timeNav, timeLabel, btnZoom, btnNow, btnPrev, btnNext,
    rulerHours, scroll, rowsContainer, nowLine, nowBadge: null
  };

  if (typeof ResizeObserver !== 'undefined') {
    _fegState.resizeObs = new ResizeObserver(() => onResize());
    _fegState.resizeObs.observe(scroll);
  } else {
    window.addEventListener('resize', onResize);
  }

  scroll.addEventListener('scroll', onFegScroll, { passive: true });

  requestAnimationFrame(() => {
    recalcPxPerHour();
    renderRuler();
    renderVisibleRows();
    updateTimeLabel();
    updateZoomChip();
    updateNowButton();
    updateNowLine();
    _fegState.nowTimer = setInterval(onMinuteTick, 60000);
  });
}


// ============================================================================
// CALCOLI E LABEL
// ============================================================================

function recalcPxPerHour() {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const totalWidth = refs.scroll.clientWidth;
  const timelineWidth = totalWidth - FEG.LOGO_WIDTH;
  _fegState.pxPerHour = Math.max(40, timelineWidth / _fegState.visibleHours);
  refs.rowsContainer.style.setProperty('--feg-pph', _fegState.pxPerHour + 'px');
}

function updateTimeLabel() {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const start = _fegState.windowStartMs;
  const end = start + _fegState.visibleHours * 3600000;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const crossesMidnight = startDate.getDate() !== endDate.getDate();
  const mainText = fmtHHMM(start) + ' → ' + fmtHHMM(end);
  const subText = fmtDateLong(start) + (crossesMidnight ? ' (+1)' : '');

  refs.timeLabel.innerHTML =
    '<span class="feg-time-main">' + mainText + '</span>' +
    '<span class="feg-time-sub">' + subText + '</span>';
}

function updateZoomChip() {
  const refs = _fegState.domRefs;
  if (!refs || !refs.btnZoom) return;
  refs.btnZoom.textContent = _fegState.visibleHours + 'h';
  refs.btnZoom.classList.toggle('feg-chip-accent', _fegState.visibleHours !== FEG.DEFAULT_VISIBLE_HOURS);
}

function updateNowButton() {
  const refs = _fegState.domRefs;
  if (!refs || !refs.btnNow) return;
  const now = Date.now();
  const inWindow = now >= _fegState.windowStartMs &&
                   now < _fegState.windowStartMs + _fegState.visibleHours * 3600000;
  refs.btnNow.disabled = inWindow;
}


// ============================================================================
// RIGHELLO
// ============================================================================

function renderRuler() {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const hours = refs.rulerHours;
  hours.innerHTML = '';
  hours.style.setProperty('--feg-pph', _fegState.pxPerHour + 'px');

  const start = _fegState.windowStartMs;
  const end = start + _fegState.visibleHours * 3600000;

  let cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  if (cursor.getTime() < start) cursor.setTime(cursor.getTime() + 3600000);
  while (cursor.getTime() < end) {
    const seg = document.createElement('div');
    seg.className = 'feg-hour';
    const offsetPx = ((cursor.getTime() - start) / 3600000) * _fegState.pxPerHour;
    seg.style.left = offsetPx + 'px';
    seg.textContent = fmtHHMM(cursor.getTime());
    hours.appendChild(seg);
    cursor.setTime(cursor.getTime() + 3600000);
  }

  const q = 15 * 60 * 1000;
  let tickCursor = Math.ceil(start / q) * q;
  while (tickCursor < end) {
    const tick = document.createElement('div');
    tick.className = 'feg-tick';
    const offsetPx = ((tickCursor - start) / 3600000) * _fegState.pxPerHour;
    tick.style.left = offsetPx + 'px';
    hours.appendChild(tick);
    tickCursor += q;
  }

  const now = Date.now();
  let badge = null;
  if (now >= start && now < end) {
    badge = document.createElement('div');
    badge.className = 'feg-now-badge';
    badge.textContent = fmtHHMM(now);
    const offsetPx = ((now - start) / 3600000) * _fegState.pxPerHour;
    badge.style.left = offsetPx + 'px';
    hours.appendChild(badge);
  }
  _fegState.domRefs.nowBadge = badge;
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
// NAVIGAZIONE TEMPORALE
// ============================================================================

function shiftTime(direction) {
  const delta = direction * FEG.STEP_MINUTES * 60 * 1000;
  _fegState.windowStartMs += delta;
  _fegState.windowIsManual = true;
  rerenderVisibleTimeline();
}

// Cambio zoom: mantiene il CENTRO della finestra corrente.
// Se l'utente non stava navigando manualmente, il centro diventa "ora".
function cycleZoom() {
  const opts = FEG.VISIBLE_HOURS_OPTIONS;
  const idx = opts.indexOf(_fegState.visibleHours);
  const oldHours = _fegState.visibleHours;
  const newHours = opts[(idx + 1) % opts.length];

  const centerMs = _fegState.windowIsManual
    ? _fegState.windowStartMs + (oldHours * 3600000) / 2
    : Date.now();

  _fegState.visibleHours = newHours;
  _fegState.windowStartMs = centerMs - (newHours * 3600000) / 2;

  rerenderVisibleTimeline();
}

// Centra "ora" nella finestra visibile. Arrotonda a multipli di 5 minuti
// per etichette più pulite (16:45 invece di 16:47), senza perdere la
// centratura visiva della linea.
function gotoNow() {
  const halfWindowMs = (_fegState.visibleHours * 3600000) / 2;
  const fiveMin = 5 * 60 * 1000;
  const now = Date.now();
  // Arrotonda "ora" ai 5 minuti più vicini, poi centra
  const rounded = Math.round(now / fiveMin) * fiveMin;
  _fegState.windowStartMs = rounded - halfWindowMs;
  _fegState.windowIsManual = false;
  rerenderVisibleTimeline();
}

function rerenderVisibleTimeline() {
  const refs = _fegState.domRefs;
  if (!refs) return;

  recalcPxPerHour();
  renderRuler();

  // Aggiorna in-place solo il contenuto della timeline di ogni riga
  // già in DOM. La colonna logo (con le immagini lazy) NON viene
  // toccata → nessun flicker durante shift/zoom.
  for (const i of _fegState.renderedRows) {
    updateRowTimeline(i);
  }

  updateTimeLabel();
  updateZoomChip();
  updateNowButton();
  updateNowLine();
}


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
    if (i < first || i > last) { removeRow(i); rendered.delete(i); }
  }
  for (let i = first; i <= last; i++) {
    if (!rendered.has(i)) { addRow(i); rendered.add(i); }
  }
}

function removeRow(index) {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const row = refs.rowsContainer.querySelector('.feg-row[data-row="' + index + '"]');
  if (row) row.remove();
}


// ============================================================================
// COSTRUZIONE RIGA
// ============================================================================

function addRow(index) {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const channel = _fegState.channels[index];
  if (!channel) return;

  const row = document.createElement('div');
  row.className = 'feg-row';
  row.dataset.row = index;
  row.style.top = (index * FEG.ROW_HEIGHT) + 'px';

  // --- Colonna logo (informativa, nessun click) ---
  const logoCol = document.createElement('div');
  logoCol.className = 'feg-logo-col';

  const logo = document.createElement('img');
  logo.className = 'feg-logo-img';
  logo.dataset.src = (typeof sanitizeImageUrl === 'function')
    ? (sanitizeImageUrl(channel.logo) || (typeof EPG_PLACEHOLDER !== 'undefined' ? EPG_PLACEHOLDER : ''))
    : (channel.logo || '');
  logo.alt = '';
  logo.onerror = function () {
    this.onerror = null;
    if (typeof EPG_PLACEHOLDER !== 'undefined') this.src = EPG_PLACEHOLDER;
  };
  if (typeof getSharedObserver === 'function') getSharedObserver().observe(logo);
  logoCol.appendChild(logo);

  const nameText = document.createElement('div');
  nameText.className = 'feg-channel-name';
  nameText.textContent = channel.name || 'Sconosciuto';
  nameText.title = channel.name || '';
  logoCol.appendChild(nameText);

  row.appendChild(logoCol);

  // --- Timeline ---
  const timeline = document.createElement('div');
  timeline.className = 'feg-timeline';
  row.appendChild(timeline);

  // Popolamento in una funzione dedicata: serve anche a rerenderVisibleTimeline
  // per aggiornare solo la timeline senza toccare la colonna logo.
  buildTimelineContent(timeline, channel);

  refs.rowsContainer.appendChild(row);
}


// Crea le tile dei programmi dentro `timelineEl`. Usata sia da addRow
// (costruzione completa della riga) sia da updateRowTimeline (aggiornamento
// in-place quando cambia la finestra temporale). Non tocca la colonna logo.
function buildTimelineContent(timelineEl, channel) {
  const windowStartMs = _fegState.windowStartMs;
  const windowEndMs = windowStartMs + _fegState.visibleHours * 3600000;
  const pxPerHour = _fegState.pxPerHour;
  const nowMs = Date.now();

  timelineEl.innerHTML = '';
  timelineEl.style.setProperty('--feg-pph', pxPerHour + 'px');

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

    const rawLeft = ((clippedStart - windowStartMs) / 3600000) * pxPerHour;
    const rawWidth = (durMs / 3600000) * pxPerHour;
    const leftPx = rawLeft + FEG.TILE_GAP / 2;
    const widthPx = Math.max(12, rawWidth - FEG.TILE_GAP);

    let status = 'future';
    if (endT <= nowMs) status = 'past';
    else if (startT <= nowMs && nowMs < endT) status = 'current';

    const tile = document.createElement('div');
    tile.className = 'feg-prog feg-prog-' + status;

    if (widthPx < 80) tile.classList.add('xs');
    else if (widthPx < 140) tile.classList.add('sm');
    else if (widthPx < 210) tile.classList.add('md');
    else tile.classList.add('lg');

    tile.style.left = leftPx + 'px';
    tile.style.width = widthPx + 'px';

    const showPoster = prog.poster && widthPx >= 100;
    if (showPoster) {
      const poster = document.createElement('img');
      poster.className = 'feg-prog-poster';
      poster.loading = 'lazy';
      poster.src = (typeof sanitizeImageUrl === 'function')
        ? sanitizeImageUrl(prog.poster)
        : prog.poster;
      poster.alt = '';
      poster.onerror = function () {
        this.remove();
        tile.classList.remove('has-poster');
      };
      tile.classList.add('has-poster');
      tile.appendChild(poster);
    }

    const info = document.createElement('div');
    info.className = 'feg-prog-info';

    const title = document.createElement('div');
    title.className = 'feg-prog-title';
    title.textContent = prog.title || '';
    info.appendChild(title);

    if (widthPx >= 68) {
      const time = document.createElement('div');
      time.className = 'feg-prog-time';
      time.textContent = fmtHHMM(clippedStart) + ' – ' + fmtHHMM(clippedEnd);
      info.appendChild(time);
    }

    tile.appendChild(info);

    if (status === 'current') {
      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        playChannelFromEpgGrid(channel);
      });
    } else {
      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        openProgramDetails(prog, channel);
      });
    }

    timelineEl.appendChild(tile);
  }
}


// Aggiorna in-place solo la timeline di una riga già in DOM. Non tocca
// la colonna logo. Chiamata da rerenderVisibleTimeline durante shift/zoom.
function updateRowTimeline(index) {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const row = refs.rowsContainer.querySelector('.feg-row[data-row="' + index + '"]');
  if (!row) return;
  const timeline = row.querySelector('.feg-timeline');
  const channel = _fegState.channels[index];
  if (!timeline || !channel) return;
  buildTimelineContent(timeline, channel);
}


// ============================================================================
// LINEA "ORA" + TICK AL MINUTO
// ============================================================================

function updateNowLine() {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const now = Date.now();
  const windowStart = _fegState.windowStartMs;
  const windowEnd = windowStart + _fegState.visibleHours * 3600000;

  if (now < windowStart || now >= windowEnd) {
    refs.nowLine.style.display = 'none';
    return;
  }
  const rawPx = ((now - windowStart) / 3600000) * _fegState.pxPerHour;
  refs.nowLine.style.display = '';
  refs.nowLine.style.left = (FEG.LOGO_WIDTH + rawPx) + 'px';
}

function onMinuteTick() {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const now = Date.now();
  updateNowLine();

  const badge = refs.nowBadge;
  if (badge) {
    const windowStart = _fegState.windowStartMs;
    const windowEnd = windowStart + _fegState.visibleHours * 3600000;
    if (now < windowStart || now >= windowEnd) {
      badge.style.display = 'none';
    } else {
      const offsetPx = ((now - windowStart) / 3600000) * _fegState.pxPerHour;
      badge.style.display = '';
      badge.style.left = offsetPx + 'px';
      badge.textContent = fmtHHMM(now);
    }
  }
  updateNowButton();
}


// ============================================================================
// RESIZE
// ============================================================================

function onResize() {
  if (fullEpgViewMode !== 'grid') return;
  const refs = _fegState.domRefs;
  if (!refs) return;
  recalcPxPerHour();
  renderRuler();
  rerenderVisibleTimeline();
}


// ============================================================================
// PANNELLO DETTAGLI PROGRAMMA (bottom sheet)
// ============================================================================

let _progDetailEls = null;

function ensureProgramDetailSheet() {
  if (_progDetailEls) return _progDetailEls;

  const overlay = document.createElement('div');
  overlay.className = 'prog-detail-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'prog-detail-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const handle = document.createElement('div');
  handle.className = 'pd-handle';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pd-close';
  close.setAttribute('aria-label', 'Chiudi');
  close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

  const hero = document.createElement('div');
  hero.className = 'pd-hero';

  const body = document.createElement('div');
  body.className = 'pd-body';

  sheet.appendChild(handle);
  sheet.appendChild(close);
  sheet.appendChild(hero);
  sheet.appendChild(body);

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);

  overlay.addEventListener('click', closeProgDetail);
  close.addEventListener('click', closeProgDetail);

  // ─────────────────────────────────────────────────────────────────
  //  DRAG-TO-DISMISS
  //
  //  Architettura robusta:
  //    - touchstart SOLO sull'handle (piccola area, ma con hitbox ::before)
  //    - touchmove/touchend/touchcancel su document, registrati UNA VOLTA
  //      qui e MAI rimossi: controllano il flag `dragging` all'inizio.
  //    - Reset esplicito di tutti gli stati quando il pannello si chiude,
  //      così un'eventuale interruzione non lascia il drag "incastrato".
  //    - Nessun accumulate di listener: se un touchend si perde, al
  //      touchstart successivo lo stato viene comunque resettato.
  // ─────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────
  //  DRAG-TO-DISMISS SULL'INTERA FINESTRA (pattern iOS nativo)
  //
  //  Regola:
  //    - touchstart su QUALSIASI punto dello sheet (tranne il pulsante
  //      di chiusura).
  //    - Alla prima mossa verticale significativa si decide la modalità:
  //        · verso il basso E contenuto già scrollato in cima → drag del
  //          pannello (chiudibile rilasciando)
  //        · qualsiasi altro caso → scroll normale del contenuto
  //    - La decisione viene "bloccata" per il resto del gesto: non si
  //      alterna fra drag e scroll a metà.
  //    - Il touchmove è su document per continuare a ricevere eventi
  //      anche se il dito esce dal pannello.
  // ─────────────────────────────────────────────────────────────────

  let touchActive = false;
  let dragStartY = 0;
  let dragStartTime = 0;
  let currentDelta = 0;
  let directionLock = null; // null | 'drag' | 'scroll'

  function resetDrag() {
    touchActive = false;
    currentDelta = 0;
    dragStartY = 0;
    dragStartTime = 0;
    directionLock = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
  }

  function onSheetTouchStart(e) {
    if (!e.touches || !e.touches.length) return;
    // Esclude il pulsante di chiusura (e futuri controlli marcati .no-drag)
    if (e.target.closest('.pd-close') || e.target.closest('.no-drag')) return;

    resetDrag();
    touchActive = true;
    dragStartY = e.touches[0].clientY;
    dragStartTime = Date.now();
  }

  function onDocumentTouchMove(e) {
    if (!touchActive) return;
    if (!e.touches || !e.touches.length) return;

    const dy = e.touches[0].clientY - dragStartY;

    // Direzione bloccata alla prima mossa significativa (>6px)
    if (directionLock === null && Math.abs(dy) > 6) {
      if (dy > 0 && body.scrollTop <= 0) {
        directionLock = 'drag';
        sheet.style.transition = 'none';
      } else {
        directionLock = 'scroll';
      }
    }

    if (directionLock !== 'drag') return;

    currentDelta = Math.max(0, dy);
    // Movimento 1:1 con il dito. Nessuna resistenza: il pannello segue
    // esattamente il gesto. Il feedback di "quanto manca per chiudere"
    // arriva dalla linea del blur dell'overlay che si attenua man mano.
    sheet.style.transform = 'translateY(' + currentDelta + 'px)';

    // Attenua l'overlay in proporzione al trascinamento: più si scende,
    // più lo sfondo torna visibile. Serve da indicatore visivo di soglia.
    const sheetH = sheet.offsetHeight || 400;
    const ratio = Math.min(1, currentDelta / (sheetH * 0.4));
    overlay.style.opacity = String(1 - ratio);

    if (e.cancelable) e.preventDefault();
  }

  function onDocumentTouchEnd() {
    if (!touchActive) return;

    if (directionLock !== 'drag') {
      // Non era un drag (tap o scroll): reset e stop
      resetDrag();
      return;
    }

    const elapsed = Math.max(1, Date.now() - dragStartTime);
    const velocity = currentDelta / elapsed;   // px/ms
    const sheetH = sheet.offsetHeight || 400;

    // Chiude se:
    //   - ha percorso almeno il 30% dell'altezza del pannello, oppure
    //   - è stato un flick veloce (>0.5 px/ms) anche con poco spazio
    // Altrimenti torna in posizione aperta.
    const shouldClose =
      currentDelta > sheetH * 0.3 ||
      (currentDelta > 30 && velocity > 0.5);

    overlay.style.opacity = '';

    if (shouldClose) {
      sheet.style.transition = '';
      sheet.style.transform = 'translateY(' + currentDelta + 'px)';
      sheet.classList.remove('open');
      void sheet.offsetHeight;
      sheet.style.transform = '';

      overlay.classList.remove('open');
      document.body.classList.remove('pd-open');
    }

    resetDrag();
  }

  // Listener su document, registrati UNA VOLTA: il flag touchActive
  // controlla l'attività. Nessun accumulo possibile.
  document.addEventListener('touchmove', onDocumentTouchMove, { passive: false });
  document.addEventListener('touchend', onDocumentTouchEnd);
  document.addEventListener('touchcancel', onDocumentTouchEnd);

  // touchstart su TUTTO lo sheet: qualsiasi punto della finestra è
  // un possibile punto di partenza del drag.
  sheet.addEventListener('touchstart', onSheetTouchStart, { passive: true });

  _progDetailEls = { overlay, sheet, hero, body, resetDrag };
  return _progDetailEls;
}

function openProgramDetails(prog, channel) {
  const els = ensureProgramDetailSheet();
  const { overlay, sheet, hero, body, resetDrag } = els;

  // Reset di sicurezza: se c'era un drag in corso (o rimasto appeso) lo
  // si annulla prima di riaprire il pannello.
  resetDrag();

  body.scrollTop = 0;

  hero.innerHTML = '';
  hero.className = 'pd-hero';

  const posterUrl = prog.poster
    ? ((typeof sanitizeImageUrl === 'function') ? sanitizeImageUrl(prog.poster) : prog.poster)
    : '';

  if (posterUrl) {
    const bg = document.createElement('div');
    bg.className = 'pd-hero-bg';
    bg.style.backgroundImage = 'url("' + posterUrl.replace(/"/g, '\\"') + '")';
    hero.appendChild(bg);

    const img = document.createElement('img');
    img.className = 'pd-hero-img';
    img.src = posterUrl;
    img.alt = '';
    img.onerror = function () {
      this.remove();
      bg.remove();
      hero.classList.add('no-poster');
    };
    hero.appendChild(img);
  } else {
    hero.classList.add('no-poster');
  }

  body.innerHTML = '';

  const chRow = document.createElement('div');
  chRow.className = 'pd-channel-row';
  if (channel.logo) {
    const chLogo = document.createElement('img');
    chLogo.className = 'pd-channel-logo';
    chLogo.src = (typeof sanitizeImageUrl === 'function') ? sanitizeImageUrl(channel.logo) : channel.logo;
    chLogo.alt = '';
    chLogo.onerror = function () { this.style.display = 'none'; };
    chRow.appendChild(chLogo);
  }
  const chName = document.createElement('div');
  chName.className = 'pd-channel-name';
  chName.textContent = channel.name || '';
  chRow.appendChild(chName);
  body.appendChild(chRow);

  const title = document.createElement('h2');
  title.className = 'pd-title';
  title.textContent = prog.title || 'Programma';
  body.appendChild(title);

  if (prog.subtitle) {
    const sub = document.createElement('div');
    sub.className = 'pd-subtitle';
    sub.textContent = prog.subtitle;
    body.appendChild(sub);
  }

  const meta = document.createElement('div');
  meta.className = 'pd-meta';

  const startT = new Date(prog.start).getTime();
  const endT = new Date(prog.end).getTime();
  const durMin = Math.round((endT - startT) / 60000);
  const nowMs = Date.now();

  let statusLabel = 'In programma';
  let statusClass = '';
  if (endT <= nowMs) statusLabel = 'Concluso';
  else if (startT <= nowMs && nowMs < endT) {
    statusLabel = 'In onda ora';
    statusClass = ' accent';
  }

  const chipTime = document.createElement('span');
  chipTime.className = 'pd-chip';
  chipTime.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>' +
    '<span>' + fmtHHMM(startT) + ' – ' + fmtHHMM(endT) + '</span>';
  meta.appendChild(chipTime);

  const chipDur = document.createElement('span');
  chipDur.className = 'pd-chip';
  chipDur.textContent = durMin + ' min';
  meta.appendChild(chipDur);

  const chipStatus = document.createElement('span');
  chipStatus.className = 'pd-chip' + statusClass;
  chipStatus.textContent = statusLabel;
  meta.appendChild(chipStatus);

  body.appendChild(meta);

  const descText = (prog.description || '').trim();
  if (descText) {
    const desc = document.createElement('p');
    desc.className = 'pd-desc';
    desc.textContent = descText;
    body.appendChild(desc);
  } else {
    const noDesc = document.createElement('div');
    noDesc.className = 'pd-no-desc';
    noDesc.textContent = 'Descrizione non disponibile per questo programma.';
    body.appendChild(noDesc);
  }

  document.body.classList.add('pd-open');
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    sheet.classList.add('open');
  });
}

function closeProgDetail() {
  if (!_progDetailEls) return;
  // Reset del drag: se era in corso, annulla lo stato senza animazione
  // (il pannello si sta chiudendo, non serve un transform parziale).
  if (typeof _progDetailEls.resetDrag === 'function') {
    _progDetailEls.resetDrag();
  }
  _progDetailEls.overlay.classList.remove('open');
  _progDetailEls.sheet.classList.remove('open');
  document.body.classList.remove('pd-open');
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
// MODALITÀ LIST/GRID
// ============================================================================

function applyFullEpgViewMode() {
  const listEl = document.getElementById('fullEpgList');
  const gridEl = document.getElementById('fullEpgGrid');
  if (!listEl || !gridEl) return;

  const navPrev = document.getElementById('fullEpgTimeNavPrev');
  const navNext = document.getElementById('fullEpgTimeNavNext');
  if (navPrev) navPrev.style.display = 'none';
  if (navNext) navNext.style.display = 'none';

  if (fullEpgViewMode === 'grid') {
    listEl.classList.add('hidden');
    gridEl.classList.remove('hidden');
    renderFullEPGGrid();
  } else {
    gridEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    if (_fegState.nowTimer) { clearInterval(_fegState.nowTimer); _fegState.nowTimer = null; }
    if (_fegState.resizeObs) { _fegState.resizeObs.disconnect(); _fegState.resizeObs = null; }
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
// COMPATIBILITÀ CON API PRECEDENTI
// ============================================================================

function setupFullEpgTimeNav() { /* deprecato */ }
function scrollFullEpgByHour(direction) { shiftTime(direction); }
function scrollFullEpgToNow() { gotoNow(); }


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
