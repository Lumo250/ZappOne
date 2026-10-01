// ================================================================
//  MODULO EPG — VISTA GRIGLIA (palinsesto orizzontale)
//
//  Architettura anti-sticky per iOS:
//    #fullEpgGrid (flex, overflow: hidden)
//      └── .full-epg-grid-layout (absolute inset: 0, flex row)
//            ├── .full-epg-grid-names-col (96px)
//            │     ├── .full-epg-grid-corner (32px)
//            │     └── .full-epg-grid-names-content ← translateY via JS
//            └── .full-epg-grid-main (flex: 1)
//                  ├── .full-epg-grid-hours-wrap (32px)
//                  │     └── .full-epg-grid-hours-content ← translateX via JS
//                  └── .full-epg-grid-program-area (overflow: auto)
//                        └── .full-epg-grid-canvas
//
//  Solo program-area ha overflow. Colonna nomi e header ore sono
//  fuori dallo scroll e vengono sincronizzati via transform (GPU).
//  Nessun position: sticky.
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
let _fullEpgRafTicking = false;
let _fullEpgScrollListener = null;

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

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setTime(
    windowStart.getTime() - FULL_EPG_GRID.WINDOW_LEAD_HOURS * 3600000
  );
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowStartMs + FULL_EPG_GRID.WINDOW_HOURS * 3600000;
  _fullEpgWindowStartMs = windowStartMs;

  const timelineWidth = FULL_EPG_GRID.WINDOW_HOURS * FULL_EPG_GRID.PX_PER_HOUR;
  const totalHeight = channelsWithPrograms.length * FULL_EPG_GRID.ROW_HEIGHT;

  container.style.display = 'block';

  // ── Layout radice ────────────────────────────────────────────────
  const layout = document.createElement('div');
  layout.className = 'full-epg-grid-layout';

  // ── Colonna nomi ─────────────────────────────────────────────────
  const namesCol = document.createElement('div');
  namesCol.className = 'full-epg-grid-names-col';

  const corner = document.createElement('div');
  corner.className = 'full-epg-grid-corner';
  namesCol.appendChild(corner);

  const namesContent = document.createElement('div');
  namesContent.className = 'full-epg-grid-names-content';
  namesCol.appendChild(namesContent);   // ← FIX: era mancante

  // ── Colonna principale ───────────────────────────────────────────
  const main = document.createElement('div');
  main.className = 'full-epg-grid-main';

  const hoursWrap = document.createElement('div');
  hoursWrap.className = 'full-epg-grid-hours-wrap';

  const hoursContent = document.createElement('div');
  hoursContent.className = 'full-epg-grid-hours-content';

  const startHour = windowStart.getHours();
  for (let h = 0; h < FULL_EPG_GRID.WINDOW_HOURS; h++) {
    const hEl = document.createElement('div');
    hEl.className = 'full-epg-grid-hour';
    hEl.style.width = FULL_EPG_GRID.PX_PER_HOUR + 'px';
    hEl.textContent = String((startHour + h) % 24).padStart(2, '0') + ':00';
    hoursContent.appendChild(hEl);
  }
  hoursWrap.appendChild(hoursContent);
  main.appendChild(hoursWrap);

  const programArea = document.createElement('div');
  programArea.className = 'full-epg-grid-program-area';

  const canvas = document.createElement('div');
  canvas.className = 'full-epg-grid-canvas';
  canvas.style.width = timelineWidth + 'px';
  canvas.style.height = totalHeight + 'px';

  let minProgramStartMs = Infinity;
  let maxProgramEndMs = -Infinity;

  channelsWithPrograms.forEach(epgChannel => {
    // Cella nome
    const nameCell = document.createElement('div');
    nameCell.className = 'full-epg-grid-cell-name';

    const logo = document.createElement('img');
    logo.className = 'full-epg-grid-logo';
    logo.dataset.src = sanitizeImageUrl(epgChannel.logo) || EPG_PLACEHOLDER;
    logo.alt = '';
    logo.onerror = function () { this.onerror = null; this.src = EPG_PLACEHOLDER; };
    getSharedObserver().observe(logo);
    nameCell.appendChild(logo);

    const nameText = document.createElement('div');
    nameText.className = 'full-epg-grid-name';
    nameText.textContent = epgChannel.name || 'Sconosciuto';
    nameText.title = epgChannel.name || '';
    nameCell.appendChild(nameText);

    namesContent.appendChild(nameCell);

    // Riga programmi
    const row = document.createElement('div');
    row.className = 'full-epg-grid-row';
    row.dataset.name = (epgChannel.name || '').toLowerCase();

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
      bar.className = 'full-epg-grid-program'
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
        posterImg.className = 'full-epg-grid-program-poster';
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
      titleEl.className = 'full-epg-grid-program-title';
      titleEl.textContent = prog.title || '';
      bar.appendChild(titleEl);

      const timeEl = document.createElement('div');
      timeEl.className = 'full-epg-grid-program-time';
      timeEl.textContent = new Date(clippedStart).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      bar.appendChild(timeEl);

      row.appendChild(bar);
    });

    canvas.appendChild(row);
  });

  const nowLine = document.createElement('div');
  nowLine.className = 'full-epg-grid-now-line';
  canvas.appendChild(nowLine);

  programArea.appendChild(canvas);
  main.appendChild(programArea);
  layout.appendChild(namesCol);
  layout.appendChild(main);
  container.appendChild(layout);

  // Click sulla colonna nomi → ricentra su now
  namesCol.addEventListener('click', (e) => {
    if (e.target.closest('.full-epg-grid-cell-name')) {
      e.stopPropagation();
      scrollFullEpgToNow();
    }
  });

  // Sincronizzazione scroll → transform
  if (_fullEpgScrollListener) {
    programArea.removeEventListener('scroll', _fullEpgScrollListener);
  }
  _fullEpgScrollListener = () => {
    if (_fullEpgRafTicking) return;
    _fullEpgRafTicking = true;
    requestAnimationFrame(() => {
      namesContent.style.transform = `translateY(${-programArea.scrollTop}px)`;
      hoursContent.style.transform = `translateX(${-programArea.scrollLeft}px)`;
      _fullEpgRafTicking = false;
    });
  };
  programArea.addEventListener('scroll', _fullEpgScrollListener, { passive: true });

  updateFullEpgNowLine();
  if (_fullEpgNowTimer) clearInterval(_fullEpgNowTimer);
  _fullEpgNowTimer = setInterval(updateFullEpgNowLine, 60000);

  // Limiti orizzontali
  const ONE_HOUR_PX = FULL_EPG_GRID.PX_PER_HOUR;
  let minScrollLeft = 0;
  let maxScrollLeft = Infinity;

  if (isFinite(minProgramStartMs) && isFinite(maxProgramEndMs)) {
    const minStartPx = ((minProgramStartMs - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    const maxEndPx = ((maxProgramEndMs - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    minScrollLeft = Math.max(0, minStartPx - ONE_HOUR_PX);
    maxScrollLeft = Math.max(minScrollLeft, maxEndPx + ONE_HOUR_PX - programArea.clientWidth);
  }

  if (programArea.__clampHandler) {
    programArea.removeEventListener('scroll', programArea.__clampHandler);
  }
  programArea.__clampHandler = () => {
    const sl = programArea.scrollLeft;
    if (sl < minScrollLeft) programArea.scrollLeft = minScrollLeft;
    else if (sl > maxScrollLeft) programArea.scrollLeft = maxScrollLeft;
  };
  programArea.addEventListener('scroll', programArea.__clampHandler, { passive: true });

  // Auto-scroll iniziale
  requestAnimationFrame(() => {
    const nowPx = ((Date.now() - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    let target = Math.max(0, nowPx - programArea.clientWidth / 3);
    if (target < minScrollLeft) target = minScrollLeft;
    if (target > maxScrollLeft) target = maxScrollLeft;
    programArea.scrollLeft = target;
    programArea.scrollTop = 0;
    namesContent.style.transform = 'translateY(0)';
    hoursContent.style.transform = `translateX(${-target}px)`;
  });
}

function updateFullEpgNowLine() {
  const nowLine = document.querySelector('.full-epg-grid-now-line');
  if (!nowLine) return;
  const offsetPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000)
    * FULL_EPG_GRID.PX_PER_HOUR;
  nowLine.style.left = offsetPx + 'px';
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
    header.setAttribute(
      'data-mode',
      fullEpgViewMode === 'grid' ? 'grid' : 'list'
    );
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

  header.setAttribute(
    'data-mode',
    fullEpgViewMode === 'grid' ? 'grid' : 'list'
  );
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

function scrollFullEpgByHour(direction) {
  const area = document.querySelector('.full-epg-grid-program-area');
  if (!area) return;
  const step = FULL_EPG_GRID.PX_PER_HOUR * direction;
  try {
    area.scrollBy({ left: step, behavior: 'smooth' });
  } catch (e) {
    area.scrollLeft += step;
  }
}

function scrollFullEpgToNow() {
  const area = document.querySelector('.full-epg-grid-program-area');
  if (!area) return;

  const nowPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000)
    * FULL_EPG_GRID.PX_PER_HOUR;
  const target = Math.max(0, nowPx - area.clientWidth / 2);
  const before = area.scrollLeft;

  try {
    area.scrollTo({ left: target, behavior: 'smooth' });
  } catch (e) {
    area.scrollLeft = target;
    return;
  }
  setTimeout(() => {
    if (Math.abs(area.scrollLeft - before) < 5) {
      area.scrollLeft = target;
    }
  }, 80);
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