// ================================================================
//  MODULO EPG — VISTA GRIGLIA (palinsesto orizzontale)
//
//  Vista alternativa al Full EPG a lista. Layout a griglia CSS 2×2:
//
//    [corner]  [header ore]
//    [nomi]    [programmi]
//
//  Solo TRE elementi sticky (corner, hours, names): la colonna
//  dei loghi è UN solo blocco sticky che contiene tutte le righe.
//  Questo è essenziale per la performance su iOS WebKit, che
//  ricalcola lo sticky ad ogni frame.
//
//  Finestra: 15h prima di oggi + 24h di oggi + 15h dopo domani
//  = 54h totali. Lo scroll orizzontale è limitato ai limiti reali
//  dei programmi ± 1h, così non si finisce in zona vuota.
//
//  Nessuna immagine nei programmi tranne il poster del programma
//  corrente se la barra è abbastanza larga. Click sul programma
//  corrente → lancia il canale. Click sui programmi futuri/passati:
//  nessuna azione.
// ================================================================

const FULL_EPG_GRID = {
  COL_WIDTH: 96,               // larghezza colonna nomi canali (px)
  ROW_HEIGHT: 82,              // altezza riga canale (px)
  HEADER_HEIGHT: 32,           // altezza header ore (px)
  PX_PER_HOUR: 200,            // scala temporale: 1 ora = 200px
  WINDOW_LEAD_HOURS: 15,       // ore visibili prima di mezzanotte
  WINDOW_TAIL_HOURS: 15,       // ore visibili dopo mezzanotte
  WINDOW_HOURS: 15 + 24 + 15   // = 54 ore totali
};

// Stato modalità vista Full EPG ('list' | 'grid'), persistente.
let fullEpgViewMode = localStorage.getItem('zappone_full_epg_view_mode') || 'list';

// Riferimenti per la linea "Now": aggiornamento leggero ogni minuto,
// senza ri-renderizzare la griglia.
let _fullEpgNowTimer = null;
let _fullEpgWindowStartMs = 0;

/**
 * Disegna la griglia del Full EPG dentro #fullEpgGrid.
 */
function renderFullEPGGrid() {
  const container = document.getElementById('fullEpgGrid');
  if (!container) return;

  const channelsWithPrograms = (epgDisplayList || [])
    .filter(ch => (ch.programs || []).length > 0);

  container.innerHTML = '';

  if (channelsWithPrograms.length === 0) {
    container.style.overflow = 'hidden';
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

  const totalWidth = FULL_EPG_GRID.COL_WIDTH
    + FULL_EPG_GRID.WINDOW_HOURS * FULL_EPG_GRID.PX_PER_HOUR;

  container.style.display = 'block';
  container.style.overflow = 'auto';

  // ── Canvas: CSS Grid 2×2 (corner+hours / names+programs) ────────────
  const canvas = document.createElement('div');
  canvas.className = 'full-epg-grid-canvas';
  canvas.style.width = totalWidth + 'px';

  // ── (1,1) Corner ────────────────────────────────────────────────────
  const corner = document.createElement('div');
  corner.className = 'full-epg-grid-corner';
  canvas.appendChild(corner);

  // ── (1,2) Header ore ────────────────────────────────────────────────
  const hoursWrap = document.createElement('div');
  hoursWrap.className = 'full-epg-grid-hours';
  const startHour = windowStart.getHours();
  for (let h = 0; h < FULL_EPG_GRID.WINDOW_HOURS; h++) {
    const hEl = document.createElement('div');
    hEl.className = 'full-epg-grid-hour';
    hEl.style.width = FULL_EPG_GRID.PX_PER_HOUR + 'px';
    const actualHour = (startHour + h) % 24;
    hEl.textContent = String(actualHour).padStart(2, '0') + ':00';
    hoursWrap.appendChild(hEl);
  }
  canvas.appendChild(hoursWrap);

  // ── (2,1) Colonna loghi — UNA sola sticky per tutte le righe ────────
  const namesCol = document.createElement('div');
  namesCol.className = 'full-epg-grid-names';

  // ── (2,2) Colonna programmi ─────────────────────────────────────────
  const progsCol = document.createElement('div');
  progsCol.className = 'full-epg-grid-programs';

  let minProgramStartMs = Infinity;
  let maxProgramEndMs = -Infinity;

  channelsWithPrograms.forEach(epgChannel => {
    // ── Cella nome (dentro namesCol) ──
    const nameCell = document.createElement('div');
    nameCell.className = 'full-epg-grid-cell-name';
    nameCell.style.height = FULL_EPG_GRID.ROW_HEIGHT + 'px';

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

    namesCol.appendChild(nameCell);

    // ── Riga programmi (dentro progsCol) ──
    const row = document.createElement('div');
    row.className = 'full-epg-grid-row';
    row.style.height = FULL_EPG_GRID.ROW_HEIGHT + 'px';
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

    progsCol.appendChild(row);
  });

  canvas.appendChild(namesCol);
  canvas.appendChild(progsCol);

  // ── Linea "Now" (absolute dentro canvas) ────────────────────────────
  const nowLine = document.createElement('div');
  nowLine.className = 'full-epg-grid-now-line';
  canvas.appendChild(nowLine);

  container.appendChild(canvas);

  updateFullEpgNowLine();
  if (_fullEpgNowTimer) clearInterval(_fullEpgNowTimer);
  _fullEpgNowTimer = setInterval(updateFullEpgNowLine, 60000);

  // ── Limiti dello scroll orizzontale + clamp ─────────────────────────
  const ONE_HOUR_PX = FULL_EPG_GRID.PX_PER_HOUR;
  let minScrollLeft = 0;
  let maxScrollLeft = Infinity;

  if (isFinite(minProgramStartMs) && isFinite(maxProgramEndMs)) {
    const minStartPx = FULL_EPG_GRID.COL_WIDTH
      + ((minProgramStartMs - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    const maxEndPx = FULL_EPG_GRID.COL_WIDTH
      + ((maxProgramEndMs - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    minScrollLeft = Math.max(0, minStartPx - ONE_HOUR_PX);
    maxScrollLeft = Math.max(minScrollLeft, maxEndPx + ONE_HOUR_PX - container.clientWidth);
  }

  if (container.__clampScrollHandler) {
    container.removeEventListener('scroll', container.__clampScrollHandler);
  }
  container.__clampScrollHandler = () => {
    const sl = container.scrollLeft;
    if (sl < minScrollLeft) container.scrollLeft = minScrollLeft;
    else if (sl > maxScrollLeft) container.scrollLeft = maxScrollLeft;
  };
  container.addEventListener('scroll', container.__clampScrollHandler, { passive: true });

  // Auto-scroll iniziale: porta l'ora corrente a ~1/3 dello schermo.
  requestAnimationFrame(() => {
    const nowPx = FULL_EPG_GRID.COL_WIDTH
      + ((Date.now() - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    let target = Math.max(0, nowPx - container.clientWidth / 3);
    if (target < minScrollLeft) target = minScrollLeft;
    if (target > maxScrollLeft) target = maxScrollLeft;
    container.scrollLeft = target;
    container.scrollTop = 0;
  });
}

/**
 * Aggiorna la posizione della linea "Now". Leggera: cambia solo
 * style.left dell'elemento già presente nel DOM.
 */
function updateFullEpgNowLine() {
  const nowLine = document.querySelector('.full-epg-grid-now-line');
  if (!nowLine) return;
  const offsetPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000)
    * FULL_EPG_GRID.PX_PER_HOUR;
  nowLine.style.left = (FULL_EPG_GRID.COL_WIDTH + offsetPx) + 'px';
}

/**
 * Applica la modalità salvata (list/grid). Chiamata dal dispatcher
 * in renderFullEPGList() e dal toggle del titolo.
 */
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

/**
 * Rende cliccabile l'header "EPG Completo" per il toggle lista/griglia.
 * Idempotente.
 */
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

/**
 * Lancia il canale corrispondente a un epgChannel partendo dalla griglia.
 * Stessa sequenza del ▶ nel drawer (fix B10).
 */
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
 * Sposta la timeline di una direzione (-1 / +1) di un'ora per volta.
 */
function scrollFullEpgByHour(direction) {
  const container = document.getElementById('fullEpgGrid');
  if (!container) return;
  const step = FULL_EPG_GRID.PX_PER_HOUR * direction;
  try {
    container.scrollBy({ left: step, behavior: 'smooth' });
  } catch (e) {
    container.scrollLeft += step;
  }
}

/**
 * Collega i bottoni di navigazione temporale e delega il click sulla
 * colonna loghi per ricentrare la timeline su "now". Idempotente.
 */
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

  const grid = document.getElementById('fullEpgGrid');
  if (grid && !grid.__nameClickInit) {
    grid.__nameClickInit = true;
    grid.addEventListener('click', (e) => {
      if (e.target.closest('.full-epg-grid-cell-name')) {
        e.stopPropagation();
        scrollFullEpgToNow();
      }
    });
  }
}

/**
 * Riporta la timeline in posizione centrata su "adesso".
 */
function scrollFullEpgToNow() {
  const container = document.getElementById('fullEpgGrid');
  if (!container) return;

  const nowPx = FULL_EPG_GRID.COL_WIDTH
    + ((Date.now() - _fullEpgWindowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
  const target = Math.max(0, nowPx - container.clientWidth / 2);
  const before = container.scrollLeft;

  try {
    container.scrollTo({ left: target, behavior: 'smooth' });
  } catch (e) {
    container.scrollLeft = target;
    return;
  }
  // iOS/WebKit a volte ignora silenziosamente scrollTo smooth.
  // Fallback: se dopo 80ms non si è mosso, forza il salto.
  setTimeout(() => {
    if (Math.abs(container.scrollLeft - before) < 5) {
      container.scrollLeft = target;
    }
  }, 80);
}