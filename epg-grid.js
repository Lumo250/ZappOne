// ================================================================
//  MODULO EPG — VISTA GRIGLIA (palinsesto orizzontale)
//
//  Architettura nativa iOS su entrambi gli assi:
//    - Scroll verticale: overflow-y: auto su .full-epg-scroll-y
//    - Scroll orizzontale: overflow-x: auto su .full-epg-programs-x
//    - Colonna loghi dentro lo scroll verticale, palinsesto fuori
//      (ma dentro lo stesso contenitore verticale)
//    - Un solo listener scroll (sync header ore)
//    - Nessuno sticky, nessun transform su N nodi
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
let _fullEpgHoursListener = null;

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

  // Finestra: 15h prima + 24h di oggi + 15h dopo.
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setTime(windowStart.getTime() - FULL_EPG_GRID.WINDOW_LEAD_HOURS * 3600000);
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowStartMs + FULL_EPG_GRID.WINDOW_HOURS * 3600000;
  _fullEpgWindowStartMs = windowStartMs;

  const timelineWidth = FULL_EPG_GRID.WINDOW_HOURS * FULL_EPG_GRID.PX_PER_HOUR;

  container.style.display = 'flex';

  // ── Barra ore (fissa sopra, fuori dallo scroll verticale) ────────
  const hoursBar = document.createElement('div');
  hoursBar.className = 'full-epg-hours-bar';

  const corner = document.createElement('div');
  corner.className = 'full-epg-corner';
  hoursBar.appendChild(corner);

  const hoursViewport = document.createElement('div');
  hoursViewport.className = 'full-epg-hours-viewport';

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
  hoursViewport.appendChild(hoursContent);
  hoursBar.appendChild(hoursViewport);
  container.appendChild(hoursBar);

  // ── Body: scroll verticale unico ─────────────────────────────────
  const body = document.createElement('div');
  body.className = 'full-epg-body';

  const scrollY = document.createElement('div');
  scrollY.className = 'full-epg-scroll-y';

  const scrollYContent = document.createElement('div');
  scrollYContent.className = 'full-epg-scroll-y-content';

  // Colonna loghi (dentro scroll verticale)
  const namesCol = document.createElement('div');
  namesCol.className = 'full-epg-names-col';

  // Colonna programmi: SCROLL ORIZZONTALE NATIVO
  const programsX = document.createElement('div');
  programsX.className = 'full-epg-programs-x';

  const programsInner = document.createElement('div');
  programsInner.className = 'full-epg-programs-inner';
  programsInner.style.width = timelineWidth + 'px';

  let minProgramStartMs = Infinity;
  let maxProgramEndMs = -Infinity;

  channelsWithPrograms.forEach(epgChannel => {
    // Cella nome
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

    namesCol.appendChild(nameCell);

    // Riga programmi
    const row = document.createElement('div');
    row.className = 'full-epg-row';
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

      const textWrap = document.createElement('div');
      textWrap.className = 'full-epg-text';

      const titleEl = document.createElement('div');
      titleEl.className = 'full-epg-title';
      titleEl.textContent = prog.title || '';
      textWrap.appendChild(titleEl);

      const timeEl = document.createElement('div');
      timeEl.className = 'full-epg-time';
      timeEl.textContent = new Date(clippedStart).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit'
      });
      textWrap.appendChild(timeEl);

      bar.appendChild(textWrap);
      row.appendChild(bar);
    });

    programsInner.appendChild(row);
  });

  // Linea Now (dentro programs-inner, si muove con lo scroll orizzontale)
  const nowLine = document.createElement('div');
  nowLine.className = 'full-epg-now-line';
  programsInner.appendChild(nowLine);

  programsX.appendChild(programsInner);
  scrollYContent.appendChild(namesCol);
  scrollYContent.appendChild(programsX);
  scrollY.appendChild(scrollYContent);
  body.appendChild(scrollY);
  container.appendChild(body);

  // Click sulla colonna nomi → ricentra su "now"
  namesCol.addEventListener('click', (e) => {
    if (e.target.closest('.full-epg-name-cell')) {
      e.stopPropagation();
      scrollFullEpgToNow();
    }
  });

  // ── Unico listener scroll: sincronizza header ore ────────────────
  if (_fullEpgHoursListener) {
    programsX.removeEventListener('scroll', _fullEpgHoursListener);
  }
  _fullEpgHoursListener = () => {
    hoursContent.style.transform = `translateX(${-programsX.scrollLeft}px)`;
  };
  programsX.addEventListener('scroll', _fullEpgHoursListener, { passive: true });

  // ── Posizione linea Now ──────────────────────────────────────────
  updateFullEpgNowLine();
  if (_fullEpgNowTimer) clearInterval(_fullEpgNowTimer);
  _fullEpgNowTimer = setInterval(updateFullEpgNowLine, 60000);

  // ── Auto-scroll iniziale (centra "now" su programsX) ─────────────
  requestAnimationFrame(() => {
    const nowPx = ((Date.now() - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    let target = nowPx - programsX.clientWidth / 3;
    const minScroll = 0;
    const maxScroll = Math.max(0, timelineWidth - programsX.clientWidth);
    if (target < minScroll) target = minScroll;
    if (target > maxScroll) target = maxScroll;
    programsX.scrollLeft = target;
    hoursContent.style.transform = `translateX(${-target}px)`;
  });
}

function updateFullEpgNowLine() {
  const nowLine = document.querySelector('.full-epg-now-line');
  if (!nowLine) return;
  const nowPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000)
    * FULL_EPG_GRID.PX_PER_HOUR;
  // La linea è dentro programs-inner: la sua left è in coord del contenuto.
  nowLine.style.left = nowPx + 'px';
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

function scrollFullEpgByHour(direction) {
  const programsX = document.querySelector('.full-epg-programs-x');
  if (!programsX) return;
  // Mezz'ora per click.
  programsX.scrollBy({ left: (FULL_EPG_GRID.PX_PER_HOUR / 2) * direction, behavior: 'smooth' });
}

function scrollFullEpgToNow() {
  const programsX = document.querySelector('.full-epg-programs-x');
  if (!programsX) return;
  const nowPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000)
    * FULL_EPG_GRID.PX_PER_HOUR;
  // Centro della finestra visibile = COL_WIDTH + programsX.clientWidth/2.
  // programsX mostra ora a: nowPx - scrollLeft. Vogliamo:
  //   COL_WIDTH + programsX.clientWidth/2 = nowPx - scrollLeft
  // Quindi scrollLeft = nowPx - programsX.clientWidth/2.
  programsX.scrollTo({
    left: Math.max(0, nowPx - programsX.clientWidth / 2),
    behavior: 'smooth'
  });
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