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
  COL_WIDTH: 96,           // larghezza colonna nomi canali (px)
  ROW_HEIGHT: 82,          // altezza riga canale (px) — pari a #fullEpgList .channel-item.list
  HEADER_HEIGHT: 32,       // altezza header ore (px)
  PX_PER_HOUR: 200,        // scala temporale: 1 ora = 200px
  WINDOW_LEAD_HOURS: 15,   // ore visibili prima della mezzanotte di oggi
  WINDOW_TAIL_HOURS: 15,   // ore visibili dopo la mezzanotte di domani
  WINDOW_HOURS: 15 + 24 + 15  // = 54 ore totali
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

  // Finestra estesa: 15h prima di oggi + 24h di oggi + 15h dopo domani.
  // Così l'utente può scorrere oltre la mezzanotte in entrambe le
  // direzioni senza finire in zona vuota.
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
  // L'ora iniziale della finestra non è più mezzanotte: calcoliamo
  // l'ora reale partendo dall'ora di windowStart e ciclando su 24.
  const startHour = windowStart.getHours();
  for (let h = 0; h < FULL_EPG_GRID.WINDOW_HOURS; h++) {
    const hEl = document.createElement('div');
    hEl.className = 'full-epg-grid-hour';
    hEl.style.width = FULL_EPG_GRID.PX_PER_HOUR + 'px';
    const actualHour = (startHour + h) % 24;
    hEl.textContent = String(actualHour).padStart(2, '0') + ':00';
    hoursWrap.appendChild(hEl);
  }
  header.appendChild(hoursWrap);
  canvas.appendChild(header);

  // ── Body: una riga per canale ──────────────────────────────────
  const body = document.createElement('div');
  body.className = 'full-epg-grid-body';

  // Limiti reali dei programmi (clippati alla finestra): servono a
  // limitare lo scroll orizzontale in modo che l'utente non finisca
  // in zone vuote a destra o sinistra della timeline.
  let minProgramStartMs = Infinity;
  let maxProgramEndMs = -Infinity;

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

      // Traccia i limiti (min start, max end) su tutti i canali.
      if (clippedStart < minProgramStartMs) minProgramStartMs = clippedStart;
      if (clippedEnd > maxProgramEndMs) maxProgramEndMs = clippedEnd;

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

  // ── Limite dello scroll orizzontale alla zona popolata ────────────
  // Un'ora di margine su ciascun lato per non tagliare bruscamente.
  const ONE_HOUR_MS = 3600000;
  const ONE_HOUR_PX = FULL_EPG_GRID.PX_PER_HOUR;

  let minScrollLeft = 0;
  let maxScrollLeft = Infinity;

  if (isFinite(minProgramStartMs) && isFinite(maxProgramEndMs)) {
    const minStartPx = FULL_EPG_GRID.COL_WIDTH
      + ((minProgramStartMs - windowStartMs) / ONE_HOUR_MS) * FULL_EPG_GRID.PX_PER_HOUR;
    const maxEndPx = FULL_EPG_GRID.COL_WIDTH
      + ((maxProgramEndMs - windowStartMs) / ONE_HOUR_MS) * FULL_EPG_GRID.PX_PER_HOUR;

    minScrollLeft = Math.max(0, minStartPx - ONE_HOUR_PX);
    // Lo scrollLeft massimo è tale per cui il bordo destro della viewport
    // arriva al massimo a maxEndPx + 1h. Se il contenuto è più stretto
    // della viewport, maxScrollLeft risulta negativo → lo forziamo a
    // minScrollLeft, così non si scrolla affatto in orizzontale.
    maxScrollLeft = Math.max(
      minScrollLeft,
      maxEndPx + ONE_HOUR_PX - container.clientWidth
    );
  }

  // Rimuovi listener precedente (idempotente, evita accumuli in caso
  // di re-render).
  if (container.__clampScrollHandler) {
    container.removeEventListener('scroll', container.__clampScrollHandler);
  }
  container.__clampScrollHandler = () => {
    const sl = container.scrollLeft;
    if (sl < minScrollLeft) {
      container.scrollLeft = minScrollLeft;
    } else if (sl > maxScrollLeft) {
      container.scrollLeft = maxScrollLeft;
    }
  };
  container.addEventListener('scroll', container.__clampScrollHandler, { passive: true });

  // Auto-scroll orizzontale: porta l'ora corrente a ~1/3 dello schermo,
  // rispettando i limiti appena calcolati.
  requestAnimationFrame(() => {
    const nowPx = FULL_EPG_GRID.COL_WIDTH
      + ((Date.now() - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    const visibleWidth = container.clientWidth;
    let target = Math.max(0, nowPx - visibleWidth / 3);
    // Clamp al range popolato.
    if (target < minScrollLeft) target = minScrollLeft;
    if (target > maxScrollLeft) target = maxScrollLeft;
    container.scrollLeft = target;
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

  // Click sulla colonna loghi → timeline ricentrata su "now".
  // Delegato al container (idempotente), così funziona anche dopo
  // i re-render della griglia senza dover riagganciare 300 listener.
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
 * Chiamata quando l'utente clicca sulla colonna dei loghi.
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

  // iOS/WebKit a volte ignora silenziosamente scrollTo con behavior
  // smooth, soprattutto su elementi sticky o con touch-action.
  // Verifica dopo 80ms: se scrollLeft non si è mosso, forza il salto.
  setTimeout(() => {
    if (Math.abs(container.scrollLeft - before) < 5) {
      container.scrollLeft = target;
    }
  }, 80);
}
