// ============================================================================
//  MODULO EPG — VISTA GRIGLIA (palinsesto orizzontale)
//
//  UN SOLO scroll container, sia X che Y. La barra ore è dentro lo stesso
//  contenitore del palinsesto: lo scroll le muove insieme per costruzione.
//  Zero sincronizzazione JS, zero transform, zero delay.
//
//  Struttura:
//    .full-epg-scroll                         (overflow: auto)
//      └── .full-epg-content                  (flex, min-width: max-content)
//            ├── .full-epg-names-col          (sticky left: 0)
//            │     ├── .full-epg-corner       (sticky top: 0)
//            │     └── .full-epg-name-cell × N
//            └── .full-epg-right-col
//                  ├── .full-epg-hours-content (sticky top: 0)
//                  └── .full-epg-programs-inner
//                        ├── .full-epg-row × N
//                        └── .full-epg-now-line
// ============================================================================


const FULL_EPG_GRID = {
  COL_WIDTH:        96,
  ROW_HEIGHT:       82,
  HOURS_BAR_HEIGHT: 32,
  PX_PER_HOUR:      200,
  WINDOW_LEAD_HOURS: 15,
  WINDOW_TAIL_HOURS: 15,
  WINDOW_HOURS:      15 + 24 + 15
};

let fullEpgViewMode = localStorage.getItem('zappone_full_epg_view_mode') || 'list';
let _fullEpgNowTimer = null;
let _fullEpgWindowStartMs = 0;


function applyFullEpgViewMode() {
  const listEl  = document.getElementById('fullEpgList');
  const gridEl  = document.getElementById('fullEpgGrid');
  const header  = document.getElementById('fullEpgHeader');
  const navPrev = document.getElementById('fullEpgTimeNavPrev');
  const navNext = document.getElementById('fullEpgTimeNavNext');
  if (!listEl || !gridEl) return;

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
    if (_fullEpgNowTimer) { clearInterval(_fullEpgNowTimer); _fullEpgNowTimer = null; }
  }
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

function scrollFullEpgByHour(direction) {
  const s = document.querySelector('.full-epg-scroll');
  if (!s) return;
  s.scrollBy({ left: (FULL_EPG_GRID.PX_PER_HOUR / 2) * direction, behavior: 'smooth' });
}


function scrollFullEpgToNow() {
  const s = document.querySelector('.full-epg-scroll');
  if (!s) return;
  const nowPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
  // Scroll X: la colonna nomi (96px) sta a sinistra, quindi la posizione
  // di "now" nello scroll è 96 + nowPx. Vogliamo centrarlo.
  const target = FULL_EPG_GRID.COL_WIDTH + nowPx - s.clientWidth / 2;
  s.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}


function renderFullEPGGrid() {
  const container = document.getElementById('fullEpgGrid');
  if (!container) return;

  if (_fullEpgNowTimer) { clearInterval(_fullEpgNowTimer); _fullEpgNowTimer = null; }
  if (typeof unobserveContainerImages === 'function') unobserveContainerImages(container);
  container.innerHTML = '';

  const channelsWithPrograms = (typeof epgDisplayList !== 'undefined' ? epgDisplayList : [])
    .filter(ch => ch && ch.programs && ch.programs.length > 0);

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
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setTime(windowStart.getTime() - FULL_EPG_GRID.WINDOW_LEAD_HOURS * 3600000);
  const windowStartMs = windowStart.getTime();
  const windowEndMs   = windowStartMs + FULL_EPG_GRID.WINDOW_HOURS * 3600000;
  _fullEpgWindowStartMs = windowStartMs;
  const timelineWidth = FULL_EPG_GRID.WINDOW_HOURS * FULL_EPG_GRID.PX_PER_HOUR;

  // ── UNICO scroll container ──
  const scrollEl = document.createElement('div');
  scrollEl.className = 'full-epg-scroll';

  const content = document.createElement('div');
  content.className = 'full-epg-content';

  // ── Colonna nomi (sticky left) ──
  const namesCol = document.createElement('div');
  namesCol.className = 'full-epg-names-col';

  const corner = document.createElement('div');
  corner.className = 'full-epg-corner';
  namesCol.appendChild(corner);

  // ── Colonna destra (barra ore + palinsesto) ──
  const rightCol = document.createElement('div');
  rightCol.className = 'full-epg-right-col';

  // Barra ore: dentro lo scroll, sticky top:0, larga quanto la timeline.
  // Scorre in X con i programmi (stesso contenitore, stesso scroll),
  // resta in cima in Y grazie allo sticky.
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
  rightCol.appendChild(hoursContent);

  const programsInner = document.createElement('div');
  programsInner.className = 'full-epg-programs-inner';
  programsInner.style.width = timelineWidth + 'px';

  channelsWithPrograms.forEach(epgChannel => {
    const nameCell = document.createElement('div');
    nameCell.className = 'full-epg-name-cell';

    const logo = document.createElement('img');
    logo.className = 'full-epg-logo';
    logo.dataset.src = (typeof sanitizeImageUrl === 'function'
      ? sanitizeImageUrl(epgChannel.logo)
      : epgChannel.logo) || EPG_PLACEHOLDER;
    logo.alt = '';
    logo.onerror = function () { this.onerror = null; this.src = EPG_PLACEHOLDER; };
    if (typeof getSharedObserver === 'function') getSharedObserver().observe(logo);
    nameCell.appendChild(logo);

    const nameText = document.createElement('div');
    nameText.className = 'full-epg-name';
    nameText.textContent = epgChannel.name || 'Sconosciuto';
    nameText.title = epgChannel.name || '';
    nameCell.appendChild(nameText);

    namesCol.appendChild(nameCell);

    const row = document.createElement('div');
    row.className = 'full-epg-row';
    row.dataset.name = (epgChannel.name || '').toLowerCase();

    (epgChannel.programs || []).forEach(prog => {
      const startT = new Date(prog.start).getTime();
      const endT   = new Date(prog.end).getTime();
      if (isNaN(startT) || isNaN(endT)) return;
      if (endT <= windowStartMs || startT >= windowEndMs) return;

      const clippedStart = Math.max(startT, windowStartMs);
      const clippedEnd   = Math.min(endT, windowEndMs);
      const durMs        = clippedEnd - clippedStart;
      if (durMs <= 0) return;

      const leftPx  = ((clippedStart - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
      const widthPx = (durMs / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;

      const isCurrent = isProgramCurrentlyAiring(prog);
      const showPoster = isCurrent && prog.poster && widthPx >= 150;

      const bar = document.createElement('div');
      bar.className = 'full-epg-program'
        + (isCurrent  ? ' current'    : '')
        + (showPoster ? ' has-poster' : '');
      bar.style.left  = leftPx + 'px';
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
        posterImg.src = typeof sanitizeImageUrl === 'function'
          ? sanitizeImageUrl(prog.poster) : prog.poster;
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

  const nowLine = document.createElement('div');
  nowLine.className = 'full-epg-now-line';
  programsInner.appendChild(nowLine);

  rightCol.appendChild(programsInner);
  content.appendChild(namesCol);
  content.appendChild(rightCol);
  scrollEl.appendChild(content);
  container.appendChild(scrollEl);

  namesCol.addEventListener('click', (e) => {
    if (e.target.closest('.full-epg-name-cell')) {
      e.stopPropagation();
      scrollFullEpgToNow();
    }
  });

  updateFullEpgNowLine();
  _fullEpgNowTimer = setInterval(updateFullEpgNowLine, 60000);

  requestAnimationFrame(() => {
    const nowPx = ((Date.now() - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    const target = FULL_EPG_GRID.COL_WIDTH + nowPx - scrollEl.clientWidth / 2;
    scrollEl.scrollLeft = Math.max(0, target);
  });
}


function updateFullEpgNowLine() {
  const nowLine = document.querySelector('.full-epg-now-line');
  if (!nowLine || !_fullEpgWindowStartMs) return;
  const nowPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
  nowLine.style.left = nowPx + 'px';
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
    if (typeof updateToggleState === 'function') updateToggleState();
    playStream(found.channel, !!found.fromFavorites);
  } else {
    if (typeof showNotification === 'function') {
      showNotification('Canale non trovato nella playlist', true);
    }
  }
}