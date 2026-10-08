// ================================================================
//  MODULO EPG — VISTA TIMELINE (lista verticale + finestra temporale)
//
//  Design "state of the art" per mobile:
//    - UNA sola direzione di scroll (verticale, nativa, momentum-safe)
//    - Finestra temporale fissa, navigata con pulsanti ◀ ▶ e con
//      lo scrub orizzontale sul righello delle ore
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
// SCRUB ORIZZONTALE SUL RIGHELLO
// ============================================================================
// Trascinando (o con un long-press seguito da trascinamento) sul righello
// delle ore, la finestra temporale si sposta in continuo seguendo il dito.
// Al rilascio la finestra resta ferma nella posizione raggiunta.
//
// Pattern "swipe or hold" (come i controlli volume iOS):
//   - Se il dito si muove di > 8px entro 300ms → scrub immediato
//   - Se resta fermo 300ms → scrub attivato, poi può muoversi
//   - Tap veloce senza movimento → nessun effetto

function setupRulerScrub(rulerEl) {
  if (!rulerEl || rulerEl.__scrubInit) return;
  rulerEl.__scrubInit = true;

  const LONG_PRESS_MS = 300;
  const MOVE_ACTIVATE_PX = 8;

  let scrubTimer = null;
  let scrubActive = false;
  let scrubStartX = 0;
  let scrubStartWindowMs = 0;
  let initialX = 0;

  function beginScrub(clientX) {
    scrubActive = true;
    scrubStartX = clientX;
    scrubStartWindowMs = _fegState.windowStartMs;
    rulerEl.classList.add('feg-ruler-scrubbing');
  }

  function updateScrub(clientX) {
    if (!scrubActive) return;
    const dx = clientX - scrubStartX;
    // dx > 0 (dito verso destra) → la finestra va indietro nel tempo.
    // dx < 0 (dito verso sinistra) → la finestra va avanti.
    // 1px dito = 1px timeline → conversione naturale tramite pxPerHour.
    const deltaMs = (dx / _fegState.pxPerHour) * 3600000;
    _fegState.windowStartMs = scrubStartWindowMs - deltaMs;
    _fegState.windowIsManual = true;
    // light = true: durante lo scrub riposizioniamo solo le tile esistenti,
    // senza ricostruire il DOM. I poster restano nel DOM (nessun flash).
    rerenderVisibleTimeline(true);
  }

  function endScrub() {
    if (scrubTimer) { clearTimeout(scrubTimer); scrubTimer = null; }
    if (scrubActive) {
      scrubActive = false;
      rulerEl.classList.remove('feg-ruler-scrubbing');
      // Nessun rerender: repositionTimelineContent ha già allineato le
      // tile ad ogni frame di scrub (rimosse quelle fuori, aggiunte
      // quelle entrate). Rifare il giro distruggerebbe e ricreerebbe i
      // poster proprio all'ultimo frame, causando un flash inutile.
    }
  }

  rulerEl.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches.length) return;
    initialX = e.touches[0].clientX;
    scrubTimer = setTimeout(() => {
      scrubTimer = null;
      if (!scrubActive) beginScrub(initialX);
    }, LONG_PRESS_MS);
  }, { passive: true });

  rulerEl.addEventListener('touchmove', (e) => {
    if (!e.touches || !e.touches.length) return;
    const clientX = e.touches[0].clientX;

    if (!scrubActive) {
      // Movimento > 8px prima che scatti il long-press → scrub immediato
      if (Math.abs(clientX - initialX) > MOVE_ACTIVATE_PX) {
        if (scrubTimer) { clearTimeout(scrubTimer); scrubTimer = null; }
        beginScrub(initialX);
      } else {
        return;
      }
    }

    updateScrub(clientX);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  rulerEl.addEventListener('touchend', endScrub, { passive: true });
  rulerEl.addEventListener('touchcancel', endScrub, { passive: true });

  // Supporto desktop/mouse (utile per testare in DevTools)
  let mouseDown = false;
  rulerEl.addEventListener('mousedown', (e) => {
    mouseDown = true;
    beginScrub(e.clientX);
  });
  rulerEl.addEventListener('mousemove', (e) => {
    if (mouseDown) updateScrub(e.clientX);
  });
  rulerEl.addEventListener('mouseup', () => {
    if (mouseDown) { mouseDown = false; endScrub(); }
  });
  rulerEl.addEventListener('mouseleave', () => {
    if (mouseDown) { mouseDown = false; endScrub(); }
  });
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

invalidateFegPlaybackList();

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

  // Attiva lo scrub orizzontale sul righello
  setupRulerScrub(ruler);

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
  rerenderVisibleTimeline(false);
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

  rerenderVisibleTimeline(false);
}

// Centra "ora" nella finestra visibile. Arrotonda a multipli di 5 minuti
// per etichette più pulite (16:45 invece di 16:47), senza perdere la
// centratura visiva della linea.
function gotoNow() {
  const halfWindowMs = (_fegState.visibleHours * 3600000) / 2;
  const fiveMin = 5 * 60 * 1000;
  const now = Date.now();
  const rounded = Math.round(now / fiveMin) * fiveMin;
  _fegState.windowStartMs = rounded - halfWindowMs;
  _fegState.windowIsManual = false;
  rerenderVisibleTimeline(false);
}

// Aggiorna la timeline visibile dopo un cambio di finestra temporale.
//
//   light = false → ricostruisce le tile (usato da shift/zoom/goto: la
//                   finestra si sposta di molto, quindi può cambiare il
//                   set di programmi visibili in modo significativo)
//   light = true  → riposiziona le tile esistenti senza ricostruirle
//                   (usato durante lo scrub: la finestra si sposta di
//                   pochi pixel alla volta, quindi il set di programmi
//                   visibili cambia raramente — e i poster non spariscono)
function rerenderVisibleTimeline(light) {
  const refs = _fegState.domRefs;
  if (!refs) return;

  recalcPxPerHour();
  renderRuler();

  if (light) {
    for (const i of _fegState.renderedRows) {
      repositionRowTimeline(i);
    }
  } else {
    for (const i of _fegState.renderedRows) {
      updateRowTimeline(i);
    }
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

  buildTimelineContent(timeline, channel);

  refs.rowsContainer.appendChild(row);
}


// Crea le tile dei programmi dentro `timelineEl` da zero. Usata da addRow
// (costruzione iniziale della riga) e da updateRowTimeline (rerender
// completo dopo shift/zoom/goto).
function buildTimelineContent(timelineEl, channel) {
  const windowStartMs = _fegState.windowStartMs;
  const windowEndMs = windowStartMs + _fegState.visibleHours * 3600000;

  timelineEl.innerHTML = '';
  timelineEl.style.setProperty('--feg-pph', _fegState.pxPerHour + 'px');

  const programs = channel.programs || [];
  for (let p = 0; p < programs.length; p++) {
    const prog = programs[p];
    const startT = new Date(prog.start).getTime();
    const endT = new Date(prog.end).getTime();
    if (isNaN(startT) || isNaN(endT)) continue;
    if (endT <= windowStartMs || startT >= windowEndMs) continue;

    const tile = createProgramTile(prog, channel, startT, endT);
    if (tile) timelineEl.appendChild(tile);
  }
}


// Crea la tile di un singolo programma. Usata sia dalla costruzione
// completa della timeline (buildTimelineContent) sia dall'aggiunta
// incrementale di programmi durante lo scrub (repositionTimelineContent).
//
// La tile porta su di sé l'orario reale del programma (data-prog-start /
// data-prog-end): così quando la finestra si sposta, si può ricalcolare
// posizione e larghezza senza ricostruire l'elemento (e senza perdere
// il poster, che è un <img> già caricato).
function createProgramTile(prog, channel, startT, endT) {
  const windowStartMs = _fegState.windowStartMs;
  const pxPerHour = _fegState.pxPerHour;
  const nowMs = Date.now();

  // Posizione e larghezza calcolate sull'orario REALE del programma,
  // senza clipping ai bordi della finestra. Se la tile esce dai bordi,
  // è il contenitore .feg-timeline (overflow: hidden) a tagliarla
  // visivamente. Così durante lo scrub la larghezza resta ferma e la
  // tile entra/esce dai bordi in modo naturale.
  const rawLeft = ((startT - windowStartMs) / 3600000) * pxPerHour;
  const rawWidth = ((endT - startT) / 3600000) * pxPerHour;
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

  // Salva l'orario reale del programma sul DOM: serve al riposizionamento
  // in-place durante lo scrub.
  tile.dataset.progStart = String(startT);
  tile.dataset.progEnd = String(endT);

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
    // Orario REALE del programma (startT/endT), non quello del bordo
    // finestra. Resta fisso durante lo scrub.
    time.textContent = fmtHHMM(startT) + ' – ' + fmtHHMM(endT);
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

  return tile;
}


// Riposiziona le tile esistenti di una timeline SENZA ricostruire il DOM.
// Usata durante lo scrub: aggiorna solo left/width e classi di stato, ma
// NON tocca i poster (che sono <img> già caricati) — così durante il drag
// i poster non spariscono.
//
// Gestisce anche l'ingresso/uscita di programmi dalla finestra:
//   - le tile completamente fuori finestra vengono rimosse;
//   - i programmi che ora sono visibili ma non avevano una tile
//     vengono aggiunti.
function repositionTimelineContent(timelineEl, channel) {
  const windowStartMs = _fegState.windowStartMs;
  const windowEndMs = windowStartMs + _fegState.visibleHours * 3600000;
  const pxPerHour = _fegState.pxPerHour;
  const nowMs = Date.now();

  timelineEl.style.setProperty('--feg-pph', pxPerHour + 'px');

  // Set dei programmi già presenti come tile (per start time), così
  // sappiamo cosa manca dopo il riposizionamento.
  const presentStarts = new Set();

  // 1. Riposiziona / rimuovi le tile esistenti
  const tiles = timelineEl.querySelectorAll('.feg-prog');
  tiles.forEach(tile => {
    const startT = parseInt(tile.dataset.progStart, 10);
    const endT = parseInt(tile.dataset.progEnd, 10);
    if (isNaN(startT) || isNaN(endT)) { tile.remove(); return; }

    // Fuori finestra → rimuovi (evita di gonfiare il DOM)
    if (endT <= windowStartMs || startT >= windowEndMs) {
      tile.remove();
      return;
    }

    presentStarts.add(startT);

    // Ricalcola posizione e larghezza in base alla nuova finestra
    const rawLeft = ((startT - windowStartMs) / 3600000) * pxPerHour;
    const rawWidth = ((endT - startT) / 3600000) * pxPerHour;
    const leftPx = rawLeft + FEG.TILE_GAP / 2;
    const widthPx = Math.max(12, rawWidth - FEG.TILE_GAP);

    tile.style.left = leftPx + 'px';
    tile.style.width = widthPx + 'px';

    // Stato (past / current / future): cambia solo se il programma
    // attraversa il confine "ora".
    let status = 'future';
    if (endT <= nowMs) status = 'past';
    else if (startT <= nowMs && nowMs < endT) status = 'current';

    const wantClass = 'feg-prog-' + status;
    if (!tile.classList.contains(wantClass)) {
      tile.classList.remove('feg-prog-past', 'feg-prog-future', 'feg-prog-current');
      tile.classList.add(wantClass);
    }

    // Compattezza (xs / sm / md / lg): cambia solo se la tile ha
    // oltrepassato una soglia di larghezza.
    let sizeClass;
    if (widthPx < 80) sizeClass = 'xs';
    else if (widthPx < 140) sizeClass = 'sm';
    else if (widthPx < 210) sizeClass = 'md';
    else sizeClass = 'lg';

    if (!tile.classList.contains(sizeClass)) {
      tile.classList.remove('xs', 'sm', 'md', 'lg');
      tile.classList.add(sizeClass);
    }
  });

  // 2. Aggiungi le tile mancanti: programmi che ora cadono nella finestra
  //    ma non avevano una tile (perché prima erano fuori).
  const programs = channel.programs || [];
  for (let p = 0; p < programs.length; p++) {
    const prog = programs[p];
    const startT = new Date(prog.start).getTime();
    const endT = new Date(prog.end).getTime();
    if (isNaN(startT) || isNaN(endT)) continue;
    if (endT <= windowStartMs || startT >= windowEndMs) continue;
    if (presentStarts.has(startT)) continue;

    const tile = createProgramTile(prog, channel, startT, endT);
    if (tile) timelineEl.appendChild(tile);
  }
}


// Aggiorna in-place una riga con rerender completo delle tile (usato da
// shift/zoom/goto: la finestra si sposta di molto). Non tocca la colonna
// logo, che resta nel DOM.
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

// Versione "leggera" di updateRowTimeline: riposiziona le tile esistenti
// senza ricostruirle. Usata durante lo scrub per non far sparire i poster.
function repositionRowTimeline(index) {
  const refs = _fegState.domRefs;
  if (!refs) return;
  const row = refs.rowsContainer.querySelector('.feg-row[data-row="' + index + '"]');
  if (!row) return;
  const timeline = row.querySelector('.feg-timeline');
  const channel = _fegState.channels[index];
  if (!timeline || !channel) return;
  repositionTimelineContent(timeline, channel);
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
  rerenderVisibleTimeline(false);
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
  //  DRAG-TO-DISMISS SULL'INTERA FINESTRA (pattern iOS nativo)
  //
  //  IMPORTANTE: i listener su `document` (touchmove/touchend/touchcancel)
  //  NON sono registrati qui in modo permanente. Vengono aggiunti solo
  //  quando il pannello si apre e rimossi alla chiusura. Questo perché un
  //  `touchmove` non-passivo su `document` disabilita l'ottimizzazione
  //  del passive scroll di iOS sull'intera app.
  // ─────────────────────────────────────────────────────────────────

  let touchActive = false;
  let touchFromBody = false;
  let dragStartY = 0;
  let dragStartTime = 0;
  let currentDelta = 0;
  let directionLock = null;   // null | 'drag' | 'scroll'
  let listenersAttached = false;

  function resetDrag() {
    touchActive = false;
    touchFromBody = false;
    currentDelta = 0;
    dragStartY = 0;
    dragStartTime = 0;
    directionLock = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
  }

  function onSheetTouchStart(e) {
    if (!e.touches || !e.touches.length) return;
    if (e.target.closest('.pd-close') || e.target.closest('.no-drag')) return;

    resetDrag();
    touchActive = true;
    touchFromBody = !!e.target.closest('.pd-body');
    dragStartY = e.touches[0].clientY;
    dragStartTime = Date.now();
  }

  function onDocumentTouchMove(e) {
    if (!touchActive) return;
    if (!e.touches || !e.touches.length) return;

    const dy = e.touches[0].clientY - dragStartY;

    if (directionLock === null && Math.abs(dy) > 6) {
      const canDrag = !touchFromBody || body.scrollTop <= 0;
      if (dy > 0 && canDrag) {
        directionLock = 'drag';
        sheet.style.transition = 'none';
      } else {
        directionLock = 'scroll';
      }
    }

    if (directionLock !== 'drag') return;

    currentDelta = Math.max(0, dy);
    sheet.style.transform = 'translateY(' + currentDelta + 'px)';

    const sheetH = sheet.offsetHeight || 400;
    const ratio = Math.min(1, currentDelta / (sheetH * 0.4));
    overlay.style.opacity = String(1 - ratio);

    if (e.cancelable) e.preventDefault();
  }

  function onDocumentTouchEnd() {
    if (!touchActive) return;

    if (directionLock !== 'drag') {
      resetDrag();
      return;
    }

    const elapsed = Math.max(1, Date.now() - dragStartTime);
    const velocity = currentDelta / elapsed;
    const sheetH = sheet.offsetHeight || 400;

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
      detachDragListeners();
    }

    resetDrag();
  }

  function attachDragListeners() {
    if (listenersAttached) return;
    listenersAttached = true;
    document.addEventListener('touchmove', onDocumentTouchMove, { passive: false });
    document.addEventListener('touchend', onDocumentTouchEnd);
    document.addEventListener('touchcancel', onDocumentTouchEnd);
  }

  function detachDragListeners() {
    if (!listenersAttached) return;
    listenersAttached = false;
    document.removeEventListener('touchmove', onDocumentTouchMove);
    document.removeEventListener('touchend', onDocumentTouchEnd);
    document.removeEventListener('touchcancel', onDocumentTouchEnd);
  }

  sheet.addEventListener('touchstart', onSheetTouchStart, { passive: true });

  _progDetailEls = {
    overlay, sheet, hero, body,
    resetDrag, attachDragListeners, detachDragListeners
  };

  // Su rotazione / resize, il contenuto del body può diventare
  // scrollabile o smettere di esserlo (es. landscape → portrait).
  window.addEventListener('resize', () => {
    if (!sheet.classList.contains('open')) return;
    refreshProgDetailScrollability();
  });

  return _progDetailEls;
}

function openProgramDetails(prog, channel) {
  const els = ensureProgramDetailSheet();
  const { overlay, sheet, hero, body, resetDrag, attachDragListeners } = els;

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
  if (typeof attachDragListeners === 'function') {
    attachDragListeners();
  }

  // Se il contenuto del body entra nella finestra, il .pd-body NON è
  // scrollabile. In quel caso iOS, vedendo touch-action: pan-y, cerca
  // un antenato scrollabile (il body dell'app) e lo scrolla — effetto
  // visibile sotto il blur. Se invece il contenuto eccede, lasciamo
  // pan-y: la descrizione scrolla internamente.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const canScroll = body.scrollHeight > body.clientHeight + 1;
      body.style.touchAction = canScroll ? '' : 'none';
    });
  });

  requestAnimationFrame(() => {
    overlay.classList.add('open');
    sheet.classList.add('open');
  });
}

// Rilegge se il .pd-body è scrollabile e imposta touch-action di
// conseguenza. Chiamata all'apertura e su resize/rotazione mentre il
// pannello è aperto.
function refreshProgDetailScrollability() {
  if (!_progDetailEls) return;
  const body = _progDetailEls.body;
  if (!body) return;
  const canScroll = body.scrollHeight > body.clientHeight + 1;
  body.style.touchAction = canScroll ? '' : 'none';
}

function closeProgDetail() {
  if (!_progDetailEls) return;
  if (typeof _progDetailEls.resetDrag === 'function') {
    _progDetailEls.resetDrag();
  }
  if (typeof _progDetailEls.detachDragListeners === 'function') {
    _progDetailEls.detachDragListeners();
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
  const found = findChannelFromEPG(epgChannel);  // ora sincrono
  if (found && found.channel) {
    // Marca il contesto di riproduzione PRIMA di nascondere la griglia,
    // così prev/next e back sanno che stiamo navigando il palinsesto.
    window.playbackSource = 'fullEpgGrid';
    window.epgPlaybackEpgChannel = epgChannel;
    window.epgPlaybackPlaylistKey = getChannelKey(found.channel);

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


// ── Lista di navigazione del palinsesto ─────────────────────────────
// Contiene solo i canali EPG che hanno un corrispettivo in playlist o
// nei preferiti. È la lista usata da prev/next del player quando il
// canale è stato lanciato dalla griglia del palinsesto: canali EPG
// "fantasma" (non riproducibili) sono esclusi a monte, quindi la
// navigazione non incontra mai vicoli ciechi.
//
// La cache è invalidata ad ogni re-render della griglia (cambio filtro
// incluso) e ad ogni cambio della playlist.
let _fegPlaybackList = null;

function invalidateFegPlaybackList() { _fegPlaybackList = null; }


function buildFegPlaybackList() {
  if (_fegPlaybackList) return _fegPlaybackList;
  const result = [];
  const list = _fegState.channels;
  if (!list || !list.length) { _fegPlaybackList = result; return result; }

  for (let i = 0; i < list.length; i++) {
    const epgCh = list[i];
    const found = (typeof findChannelFromEPG === 'function')
      ? findChannelFromEPG(epgCh)
      : null;
    if (found && found.channel) {
      result.push({
        epgChannel: epgCh,
        channel: found.channel,
        fromFavorites: !!found.fromFavorites
      });
    }
  }
  _fegPlaybackList = result;
  return result;
}

// Restituisce { list, currentIndex }. currentIndex è la posizione del
// canale attualmente in riproduzione all'interno della lista EPG
// navigabile, oppure -1 se non trovato.
function getFegPlaybackNav() {
  const list = buildFegPlaybackList();
  const curEpg = window.epgPlaybackEpgChannel;
  const curKey = window.epgPlaybackPlaylistKey || window.currentChannelUrl;
  let idx = -1;

  // 1. Match per riferimento (più preciso).
  if (curEpg) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].epgChannel === curEpg) { idx = i; break; }
    }
    // 2. Fallback: match per id XMLTV.
    if (idx === -1 && curEpg.id) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].epgChannel.id === curEpg.id) { idx = i; break; }
      }
    }
  }
  // 3. Ultimo fallback: match per chiave canale playlist.
  if (idx === -1 && curKey) {
    for (let i = 0; i < list.length; i++) {
      if (getChannelKey(list[i].channel) === curKey) { idx = i; break; }
    }
  }
  return { list, currentIndex: idx };
}

// Porta la riga del canale specificato al centro della griglia EPG.
// Usa il riferimento, poi l'id, poi il nome come fallback.
function scrollFegToChannel(epgChannel) {
  if (!epgChannel || !_fegState.domRefs || !_fegState.domRefs.scroll) return;
  const list = _fegState.channels || [];
  let idx = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === epgChannel) { idx = i; break; }
  }
  if (idx === -1 && epgChannel.id) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === epgChannel.id) { idx = i; break; }
    }
  }
  if (idx === -1 && epgChannel.name) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].name === epgChannel.name) { idx = i; break; }
    }
  }
  if (idx === -1) return;
  const vh = _fegState.domRefs.scroll.clientHeight;
  const targetTop = idx * FEG.ROW_HEIGHT - (vh / 2) + (FEG.ROW_HEIGHT / 2);
  _fegState.domRefs.scroll.scrollTop = Math.max(0, targetTop);
  if (typeof renderVisibleRows === 'function') renderVisibleRows();
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