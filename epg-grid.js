// ================================================================
//  MODULO EPG — VISTA GRIGLIA (palinsesto orizzontale)
//
//  Vista alternativa al Full EPG a lista. Mostra una griglia
//  temporale: colonna fissa a sinistra con i canali (logo sopra,
//  nome sotto), header sticky in alto con le ore, barre orizzontali
//  proporzionali alla durata dei programmi, finestra di 24 ore
//  (mezzanotte → mezzanotte), linea "Now" verticale che attraversa
//  tutte le righe.
//
//  Nessuna immagine nei programmi. Click sul programma corrente →
//  lancia il canale (stessa logica del ▶ nel drawer). Click sui
//  programmi futuri/passati: nessuna azione.
//
//  Dipendenze: epgDisplayList, sanitizeImageUrl, EPG_PLACEHOLDER,
//  getSharedObserver, isProgramCurrentlyAiring, findChannelFromEPG,
//  parseM3U, loadFavorites, getActivePlaylist, getChannelKey,
//  updateToggleState, playStream, closeFullEPG, showNotification,
//  _epgPlaybackOverride (variabile globale di epg.js)
// ================================================================

const FULL_EPG_GRID = {
  COL_WIDTH: 96,           // larghezza colonna nomi canali (px) — più stretta, in linea con la lista
  ROW_HEIGHT: 82,          // altezza riga canale (px) — pari a #fullEpgList .channel-item.list
  HEADER_HEIGHT: 32,       // altezza header ore (px)
  PX_PER_HOUR: 200,        // scala temporale: 1 ora = 200px
  WINDOW_HOURS: 24         // finestra visibile (mezzanotte → mezzanotte)
};

// Stato modalità vista Full EPG ('list' | 'grid'), persistente.
let fullEpgViewMode = localStorage.getItem('zappone_full_epg_view_mode') || 'list';

// Riferimenti per la linea "Now": aggiornamento leggero ogni minuto,
// senza ri-renderizzare la griglia.
let _fullEpgNowTimer = null;
let _fullEpgWindowStartMs = 0;

/**
 * Disegna la griglia del Full EPG dentro #fullEpgGrid.
 * Mostra i programmi che cadono nella finestra di 24 ore corrente
 * (dalla mezzanotte di oggi alla mezzanotte di domani).
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

  // Finestra sempre mezzanotte → mezzanotte del giorno corrente.
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowStartMs + FULL_EPG_GRID.WINDOW_HOURS * 3600000;
  _fullEpgWindowStartMs = windowStartMs;

  const totalWidth = FULL_EPG_GRID.COL_WIDTH
    + FULL_EPG_GRID.WINDOW_HOURS * FULL_EPG_GRID.PX_PER_HOUR;

  container.style.display = 'block';
  container.style.overflow = 'auto';

  const canvas = document.createElement('div');
  canvas.className = 'full-epg-grid-canvas';
  canvas.style.width = totalWidth + 'px';

  // ── Header ore (sticky in alto) ────────────────────────────────
  const header = document.createElement('div');
  header.className = 'full-epg-grid-header';
  header.style.height = FULL_EPG_GRID.HEADER_HEIGHT + 'px';

  const corner = document.createElement('div');
  corner.className = 'full-epg-grid-corner';
  corner.style.width = FULL_EPG_GRID.COL_WIDTH + 'px';
  header.appendChild(corner);

  const hoursWrap = document.createElement('div');
  hoursWrap.className = 'full-epg-grid-hours';
  for (let h = 0; h < FULL_EPG_GRID.WINDOW_HOURS; h++) {
    const hEl = document.createElement('div');
    hEl.className = 'full-epg-grid-hour';
    hEl.style.width = FULL_EPG_GRID.PX_PER_HOUR + 'px';
    hEl.textContent = String(h).padStart(2, '0') + ':00';
    hoursWrap.appendChild(hEl);
  }
  header.appendChild(hoursWrap);
  canvas.appendChild(header);

  // ── Body: una riga per canale ──────────────────────────────────
  const body = document.createElement('div');
  body.className = 'full-epg-grid-body';

  channelsWithPrograms.forEach(epgChannel => {
    const row = document.createElement('div');
    row.className = 'full-epg-grid-row';
    row.style.height = FULL_EPG_GRID.ROW_HEIGHT + 'px';
    row.dataset.name = (epgChannel.name || '').toLowerCase();

    // Cella nome (sticky left): logo sopra, nome sotto
    const nameCell = document.createElement('div');
    nameCell.className = 'full-epg-grid-cell-name';
    nameCell.style.width = FULL_EPG_GRID.COL_WIDTH + 'px';

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

    row.appendChild(nameCell);

    // Cella programmi (barre assolute)
    const progCell = document.createElement('div');
    progCell.className = 'full-epg-grid-cell-programs';

    (epgChannel.programs || []).forEach(prog => {
      const startT = new Date(prog.start).getTime();
      const endT = new Date(prog.end).getTime();
      if (isNaN(startT) || isNaN(endT)) return;

      if (endT <= windowStartMs || startT >= windowEndMs) return;

      const clippedStart = Math.max(startT, windowStartMs);
      const clippedEnd = Math.min(endT, windowEndMs);
      const durMs = clippedEnd - clippedStart;
      if (durMs <= 0) return;

      const leftPx = ((clippedStart - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
      const widthPx = (durMs / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;





      const isCurrent = isProgramCurrentlyAiring(prog);
      // Poster solo sul programma corrente, e solo se la barra è
      // abbastanza larga da contenerlo senza schiacciare il testo.
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

      progCell.appendChild(bar);
    });

    row.appendChild(progCell);
    body.appendChild(row);
  });

  canvas.appendChild(body);

  // ── Linea "Now" verticale ──────────────────────────────────────
  const nowLine = document.createElement('div');
  nowLine.className = 'full-epg-grid-now-line';
  nowLine.style.height =
    (channelsWithPrograms.length * FULL_EPG_GRID.ROW_HEIGHT) + 'px';
  canvas.appendChild(nowLine);

  container.appendChild(canvas);

  updateFullEpgNowLine();

  if (_fullEpgNowTimer) clearInterval(_fullEpgNowTimer);
  _fullEpgNowTimer = setInterval(updateFullEpgNowLine, 60000);

  // Auto-scroll orizzontale: porta l'ora corrente a ~1/3 dello schermo.
  requestAnimationFrame(() => {
    const nowPx = FULL_EPG_GRID.COL_WIDTH
      + ((Date.now() - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    const visibleWidth = container.clientWidth;
    container.scrollLeft = Math.max(0, nowPx - visibleWidth / 3);
    container.scrollTop = 0;
  });
}

/**
 * Aggiorna la posizione della linea "Now". Leggera: cambia solo style.left
 * dell'elemento già presente nel DOM, non ricostruisce nulla.
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
 * Va chiamata una sola volta all'avvio dell'app.
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
 * Stessa sequenza del ▶ nel drawer (fix B10): carica la playlist se
 * manca, cerca il canale M3U, registra l'override EPG, avvia playStream.
 * closeFullEPG() chiude la vista Full EPG prima di entrare nel player.
 */
async function playChannelFromEpgGrid(epgChannel) {
  if (!epgChannel) return;

  // 1) Carica la playlist SOLO se non è già in memoria.
  if (!channels || channels.length === 0) {
    const activePlaylist = await getActivePlaylist();
    if (activePlaylist && activePlaylist.content) {
      await parseM3U(activePlaylist.content, false, false);
    }
    await loadFavorites();
  }

  // 2) Cerca il canale corrispondente nella playlist.
  const found = await findChannelFromEPG(epgChannel);
  if (found && found.channel) {
    if (typeof closeFullEPG === 'function') closeFullEPG();

    // 3) Registra l'override EPG per la sessione di riproduzione.
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
 * Sposta la timeline del Full EPG di una direzione (-1 = indietro,
 * +1 = avanti), di un'ora per volta. Usa scrollBy con smooth per
 * un'animazione fluida; su iOS 15.4+ è supportato nativamente.
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
 * Collega i due bottoni di navigazione temporale. Idempotente:
 * chiamata più volte non aggiunge listener duplicati.
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
}
