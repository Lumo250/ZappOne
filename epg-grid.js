// ================================================================
//  MODULO EPG — VISTA GRIGLIA (palinsesto orizzontale)
//
//  Architettura:
//    #fullEpgGrid (flex column, overflow: hidden)
//      ├── .full-epg-hours-bar          ← riga fissa in alto
//      │     ├── .full-epg-corner       ← 96px, non si muove mai
//      │     └── .full-epg-hours-wrap   ← overflow: hidden
//      │           └── .full-epg-hours-content ← translateX(--full-epg-x)
//      └── .full-epg-scroll-area        ← UNICO overflow-y: auto
//            └── .full-epg-scroll-content
//                  ├── .full-epg-row × N
//                  │     ├── .full-epg-name-cell  ← 96px
//                  │     └── .full-epg-programs-wrap
//                  │           └── .full-epg-programs-content ← translateX(--full-epg-x)
//                  │                 └── barre programmi
//                  └── .full-epg-now-line
//
//  Un solo scroll reale (verticale). Lo spostamento orizzontale è
//  fatto SOLO con transform, pilotato dalla custom property
//  --full-epg-x su #fullEpgGrid. I bottoni ◀ ▶ cambiano --full-epg-x.
//  Nessuno sticky, nessun listener scroll, nessuna sincronizzazione.
// ================================================================

const FULL_EPG_GRID = {
  COL_WIDTH: 96,
  ROW_HEIGHT: 82,
  HEADER_HEIGHT: 32,
  PX_PER_HOUR: 200,
  WINDOW_LEAD_HOURS: 15,
  WINDOW_TAIL_HOURS: 15,
  WINDOW_HOURS: 15 + 24 + 15
};

let fullEpgViewMode = localStorage.getItem('zappone_full_epg_view_mode') || 'list';

let _fullEpgNowTimer = null;
let _fullEpgWindowStartMs = 0;
let _fullEpgScrollX = 0;      // posizione orizzontale corrente (px)
let _fullEpgMinX = 0;
let _fullEpgMaxX = Infinity;

function renderFullEPGGrid() {
  const container = document.getElementById('fullEpgGrid');
  if (!container) return;

  const channelsWithPrograms = (epgDisplayList || [])
    .filter(ch => (ch.programs || []).length > 0);

  container.innerHTML = '';

  if (channelsWithPrograms.length === 0) {
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

  // Finestra: 15h prima di oggi + 24h di oggi + 15h dopo domani.
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setTime(
    windowStart.getTime() - FULL_EPG_GRID.WINDOW_LEAD_HOURS * 3600000
  );
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowStartMs + FULL_EPG_GRID.WINDOW_HOURS * 3600000;
  _fullEpgWindowStartMs = windowStartMs;

  const timelineWidth = FULL_EPG_GRID.WINDOW_HOURS * FULL_EPG_GRID.PX_PER_HOUR;

  container.style.display = 'flex';

  // ── Barra ore (fissa, fuori dallo scroll verticale) ──────────────
  const hoursBar = document.createElement('div');
  hoursBar.className = 'full-epg-hours-bar';

  const corner = document.createElement('div');
  corner.className = 'full-epg-corner';
  hoursBar.appendChild(corner);

  const hoursWrap = document.createElement('div');
  hoursWrap.className = 'full-epg-hours-wrap';

  const hoursContent = document.createElement('div');
  hoursContent.className = 'full-epg-hours-content';
  hoursContent.style.width = timelineWidth + 'px';

  const startHour = windowStart.getHours();
  for (let h = 0; h < FULL_EPG_GRID.WINDOW_HOURS; h++) {
    const hEl = document.createElement('div');
    hEl.className = 'full-epg-hour';
    hEl.style.width = FULL_EPG_GRID.PX_PER_HOUR + 'px';
    hEl.textContent = String((startHour + h) % 24).padStart(2, '0') + ':00';
    hoursContent.appendChild(hEl);
  }
  hoursWrap.appendChild(hoursContent);
  hoursBar.appendChild(hoursWrap);
  container.appendChild(hoursBar);

  // ── Area scrollabile verticalmente ───────────────────────────────
  const scrollArea = document.createElement('div');
  scrollArea.className = 'full-epg-scroll-area';

  const scrollContent = document.createElement('div');
  scrollContent.className = 'full-epg-scroll-content';

  let minProgramStartMs = Infinity;
  let maxProgramEndMs = -Infinity;

  channelsWithPrograms.forEach(epgChannel => {
    const row = document.createElement('div');
    row.className = 'full-epg-row';

    // Cella nome (96px)
    const nameCell = document.createElement('div');
    nameCell.className = 'full-epg-name-cell';

    const logo = document.createElement('img');
    logo.className = 'full-epg-logo';
    logo.dataset.src = sanitizeImageUrl(epgChannel.logo) || EPG_PLACEHOLDER;
    logo.alt = '';
    logo.onerror = function () { this.onerror = null; this.src = EPG_PLACEHOLDER; };
    getSharedObserver().observe(logo);
    nameCell.appendChild(logo);

    const nameText = document.createElement('div');
    nameText.className = 'full-epg-name';
    nameText.textContent = epgChannel.name || 'Sconosciuto';
    nameText.title = epgChannel.name || '';
    nameCell.appendChild(nameText);

    row.appendChild(nameCell);

    // Cella programmi
    const programsWrap = document.createElement('div');
    programsWrap.className = 'full-epg-programs-wrap';

    const programsContent = document.createElement('div');
    programsContent.className = 'full-epg-programs-content';
    programsContent.style.width = timelineWidth + 'px';

    (epgChannel.programs || []).forEach(prog => {
      const startT = new Date(prog.start).getTime();
      const endT = new Date(prog.end).getTime();
      if (isNaN(startT) || isNaN(endT)) return;
      if (endT <= windowStartMs || startT >= windowEndMs) return;

      const clippedStart = Math.max(startT, windowStartMs);
      const clippedEnd = Math.min(endT, windowEndMs);
      const durMs = clippedEnd - clippedStart;
      if (durMs <= 0) return;

      if (clippedStart < minProgramStartMs) minProgramStartMs = clippedStart;
      if (clippedEnd > maxProgramEndMs) maxProgramEndMs = clippedEnd;

      const leftPx = ((clippedStart - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
      const widthPx = (durMs / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;

      const isCurrent = isProgramCurrentlyAiring(prog);
      const showPoster = isCurrent && prog.poster && widthPx >= 150;

      const bar = document.createElement('div');
      bar.className = 'full-epg-program'
        + (isCurrent ? ' current' : '')
        + (showPoster ? ' has-poster' : '');
      bar.style.left = leftPx + 'px';
      bar.style.width = widthPx + 'px';

      if (isCurrent) {
        bar.addEventListener('click', (e) => {
          e.stopPropagation();
          playChannelFromEpgGrid(epgChannel);
        });
      }

      if (showPoster) {
        const posterImg = document.createElement('img');
        posterImg.className = 'full-epg-poster';
        posterImg.loading = 'lazy';
        posterImg.src = sanitizeImageUrl(prog.poster);
        posterImg.alt = '';
        posterImg.onerror = function () {
          this.remove();
          bar.classList.remove('has-poster');
        };
        bar.appendChild(posterImg);
      }

      const titleEl = document.createElement('div');
      titleEl.className = 'full-epg-title';
      titleEl.textContent = prog.title || '';
      bar.appendChild(titleEl);

      const timeEl = document.createElement('div');
      timeEl.className = 'full-epg-time';
      timeEl.textContent = new Date(clippedStart).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      bar.appendChild(timeEl);

      programsContent.appendChild(bar);
    });

    programsWrap.appendChild(programsContent);
    row.appendChild(programsWrap);
    scrollContent.appendChild(row);
  });

  // Linea "Now" — attraversa tutta la timeline
  const nowLine = document.createElement('div');
  nowLine.className = 'full-epg-now-line';
  scrollContent.appendChild(nowLine);

  scrollArea.appendChild(scrollContent);
  container.appendChild(scrollArea);

  // Click sulla colonna nomi → ricentra su "now"
  scrollContent.addEventListener('click', (e) => {
    if (e.target.closest('.full-epg-name-cell')) {
      e.stopPropagation();
      scrollFullEpgToNow();
    }
  });

  // ── Calcola limiti orizzontali ──────────────────────────────────
  const ONE_HOUR_PX = FULL_EPG_GRID.PX_PER_HOUR;
  _fullEpgMinX = 0;
  _fullEpgMaxX = Math.max(0, timelineWidth - scrollArea.clientWidth);
  if (isFinite(minProgramStartMs) && isFinite(maxProgramEndMs)) {
    const minStartPx = ((minProgramStartMs - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    const maxEndPx = ((maxProgramEndMs - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    _fullEpgMinX = Math.max(0, minStartPx - ONE_HOUR_PX);
    _fullEpgMaxX = Math.max(
      _fullEpgMinX,
      Math.min(timelineWidth - scrollArea.clientWidth, maxEndPx + ONE_HOUR_PX - scrollArea.clientWidth)
    );
  }

  // ── Applica la posizione iniziale (now a ~1/3 dello schermo) ────
  const nowPx = ((Date.now() - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
  let startX = Math.max(0, nowPx - scrollArea.clientWidth / 3);
  if (startX < _fullEpgMinX) startX = _fullEpgMinX;
  if (startX > _fullEpgMaxX) startX = _fullEpgMaxX;
  _fullEpgScrollX = startX;
  container.style.setProperty('--full-epg-x', (-startX) + 'px');

  // ── Posizione della linea Now ───────────────────────────────────
  updateFullEpgNowLine();
  if (_fullEpgNowTimer) clearInterval(_fullEpgNowTimer);
  _fullEpgNowTimer = setInterval(updateFullEpgNowLine, 60000);
}

function updateFullEpgNowLine() {
  const container = document.getElementById('fullEpgGrid');
  if (!container) return;
  const nowPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000)
    * FULL_EPG_GRID.PX_PER_HOUR;
  container.style.setProperty('--full-epg-now', nowPx + 'px');
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
    if (_fullEpgNowTimer) {
      clearInterval(_fullEpgNowTimer);
      _fullEpgNowTimer = null;
    }
  }

  const header = document.getElementById('fullEpgHeader');
  if (header) {
    header.setAttribute('data-mode', fullEpgViewMode === 'grid' ? 'grid' : 'list');
  }
}

function setupFullEpgViewToggle() {
  const header = document.getElementById('fullEpgHeader');
  if (!header || header.__toggleInit) return;
  header.__toggleInit = true;

  header.addEventListener('click', (e) => {
    if (e.target.closest('#fullEpgBackBtn')) return;
    fullEpgViewMode = (fullEpgViewMode === 'grid') ? 'list' : 'grid';
    localStorage.setItem('zappone_full_epg_view_mode', fullEpgViewMode);
    if (typeof renderFullEPGList === 'function') {
      renderFullEPGList();
    } else {
      applyFullEpgViewMode();
    }
  });

  header.setAttribute('data-mode', fullEpgViewMode === 'grid' ? 'grid' : 'list');
}

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

/**
 * Applica un nuovo valore di --full-epg-x, clampato ai limiti.
 */
function _applyFullEpgX(newX) {
  const container = document.getElementById('fullEpgGrid');
  if (!container) return;
  if (newX < _fullEpgMinX) newX = _fullEpgMinX;
  if (newX > _fullEpgMaxX) newX = _fullEpgMaxX;
  _fullEpgScrollX = newX;
  container.style.setProperty('--full-epg-x', (-newX) + 'px');
}

function scrollFullEpgByHour(direction) {
  _applyFullEpgX(_fullEpgScrollX + FULL_EPG_GRID.PX_PER_HOUR * direction);
}

function scrollFullEpgToNow() {
  const area = document.querySelector('.full-epg-scroll-area');
  if (!area) return;
  const nowPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000)
    * FULL_EPG_GRID.PX_PER_HOUR;
  _applyFullEpgX(Math.max(0, nowPx - area.clientWidth / 2));
}

function setupFullEpgTimeNav() {
  const prev = document.getElementById('fullEpgTimeNavPrev');
  const next = document.getElementById('fullEpgTimeNavNext');
  if (prev && !prev.__init) {
    prev.__init = true;
    prev.addEventListener('click', (e) => {
      e.stopPropagation();
      scrollFullEpgByHour(-1);
    });
  }
  if (next && !next.__init) {
    next.__init = true;
    next.addEventListener('click', (e) => {
      e.stopPropagation();
      scrollFullEpgByHour(1);
    });
  }
}