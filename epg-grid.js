// ================================================================
//  MODULO EPG — VISTA GRIGLIA (palinsesto orizzontale)
//
//  Architettura: UN SOLO scroll container su entrambi gli assi.
//  Ore, nomi e palinsesto vivono nello stesso albero DOM, così la
//  sincronizzazione orizzontale è garantita dal browser, non da JS.
//
//  Layout (dall'alto verso il basso):
//
//    #fullEpgGrid              (flex column, overflow hidden)
//     └─ .full-epg-body-scroll (UNICO overflow: auto su X e Y)
//          └─ .full-epg-body-inner (display: flex, min-width: max-content)
//               ├─ .full-epg-left-col   (position: sticky; left: 0)
//               │    ├─ .full-epg-corner     (sticky top+left, 32px)
//               │    └─ .full-epg-names-col  (colonna loghi/nomi)
//               └─ .full-epg-right-col
//                    ├─ .full-epg-hours-content (sticky top, 32px)
//                    └─ .full-epg-programs-inner (timeline, position: relative)
//
//  Grazie allo sticky:
//    - la colonna nomi resta visibile durante lo scroll orizzontale;
//    - la barra ore resta visibile durante lo scroll verticale;
//    - l'angolo resta visibile durante entrambi.
//
//  Nessun listener scroll: l'allineamento ore/palinsesto è una
//  conseguenza della struttura DOM, non di un calcolo in JS.
// ================================================================

// Dimensioni base della griglia. PX_PER_HOUR è la scala temporale
// (200 px = 1 ora), usata per posizionare barre programma e linea "now".
const FULL_EPG_GRID = {
  COL_WIDTH: 96,           // larghezza colonna nomi (deve combaciare col CSS)
  ROW_HEIGHT: 82,          // altezza di una riga programma (combacia col CSS)
  HEADER_HEIGHT: 32,       // altezza barra ore (combacia col CSS)
  PX_PER_HOUR: 200,
  WINDOW_LEAD_HOURS: 15,   // quante ore prima di mezzanotte mostrare
  WINDOW_TAIL_HOURS: 15,   // quante ore dopo mezzanotte mostrare
  WINDOW_HOURS: 15 + 24 + 15
};

// Modalità corrente della vista Full EPG: 'list' (default) o 'grid'.
// Persistita su localStorage. Non confonderla con currentViewMode,
// che è la preferenza della lista canali.
let fullEpgViewMode = localStorage.getItem('zappone_full_epg_view_mode') || 'list';

// Timer che aggiorna la posizione della linea "now" ogni minuto.
// Attivo solo in modalità grid.
let _fullEpgNowTimer = null;

// Timestamp (ms) dell'inizio della finestra temporale disegnata.
// Usato da updateFullEpgNowLine per calcolare la posizione della linea.
let _fullEpgWindowStartMs = 0;


// ============================================================================
// Rendering della griglia
// ============================================================================

/**
 * Disegna la vista griglia del Full EPG.
 *
 * Cosa fa:
 *   1. Filtra epgDisplayList tenendo solo i canali con almeno un programma.
 *   2. Se non ci sono canali, mostra lo stato vuoto e ritorna.
 *   3. Calcola la finestra temporale (15h prima di mezzanotte + 24h di
 *      oggi + 15h dopo → 54 ore totali).
 *   4. Costruisce la struttura DOM sticky (left-col, right-col con hours
 *      e programs-inner).
 *   5. Per ogni canale: una .full-epg-name-cell nella colonna sinistra e
 *      una .full-epg-row nella timeline di destra.
 *   6. Aggiunge la linea "now" in cima alla timeline.
 *   7. Avvia il timer che aggiorna la linea ogni minuto.
 *   8. Esegue l'auto-scroll iniziale portando "now" nel primo terzo
 *      del viewport.
 *
 * Viene chiamata da applyFullEpgViewMode() solo quando la modalità è
 * 'grid'. Il DOM viene ricostruito da zero ad ogni chiamata.
 */
function renderFullEPGGrid() {
  const container = document.getElementById('fullEpgGrid');
  if (!container) return;

  const channelsWithPrograms = (epgDisplayList || [])
    .filter(ch => (ch.programs || []).length > 0);

  container.innerHTML = '';

  // ---- Stato vuoto: nessun canale con programmi ----
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

  // ---- Calcolo finestra temporale ----
  // Inizia alle 00:00 del giorno corrente, meno WINDOW_LEAD_HOURS.
  // Copre WINDOW_HOURS ore consecutive (54).
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setTime(windowStart.getTime() - FULL_EPG_GRID.WINDOW_LEAD_HOURS * 3600000);
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowStartMs + FULL_EPG_GRID.WINDOW_HOURS * 3600000;
  _fullEpgWindowStartMs = windowStartMs;

  const timelineWidth = FULL_EPG_GRID.WINDOW_HOURS * FULL_EPG_GRID.PX_PER_HOUR;

  container.style.display = 'flex';

  // ---- Costruzione struttura DOM ----
  const scroll = document.createElement('div');
  scroll.className = 'full-epg-body-scroll';

  const inner = document.createElement('div');
  inner.className = 'full-epg-body-inner';

  // ----- Colonna sinistra (nomi) -----
  const leftCol = document.createElement('div');
  leftCol.className = 'full-epg-left-col';

  const corner = document.createElement('div');
  corner.className = 'full-epg-corner';
  leftCol.appendChild(corner);

  const namesCol = document.createElement('div');
  namesCol.className = 'full-epg-names-col';
  leftCol.appendChild(namesCol);

  // ----- Colonna destra (ore + programmi) -----
  const rightCol = document.createElement('div');
  rightCol.className = 'full-epg-right-col';

  // Barra ore: 54 celle da 200px. Sticky top:0, si muove con lo scroll
  // orizzontale perché è nello stesso albero dei programmi.
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

  // Timeline dei programmi: righe assolute dentro un contenitore largo
  // quanto la finestra temporale.
  const programsInner = document.createElement('div');
  programsInner.className = 'full-epg-programs-inner';
  programsInner.style.width = timelineWidth + 'px';

  channelsWithPrograms.forEach(epgChannel => {
    // --- Cella nome nella colonna sinistra ---
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

    // --- Riga programmi nella timeline ---
    const row = document.createElement('div');
    row.className = 'full-epg-row';
    row.dataset.name = (epgChannel.name || '').toLowerCase();

    (epgChannel.programs || []).forEach(prog => {
      const startT = new Date(prog.start).getTime();
      const endT = new Date(prog.end).getTime();
      if (isNaN(startT) || isNaN(endT)) return;
      if (endT <= windowStartMs || startT >= windowEndMs) return;

      // Clip dei programmi che sforano la finestra temporale
      const clippedStart = Math.max(startT, windowStartMs);
      const clippedEnd = Math.min(endT, windowEndMs);
      const durMs = clippedEnd - clippedStart;
      if (durMs <= 0) return;

      const leftPx = ((clippedStart - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
      const widthPx = (durMs / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;

      const isCurrent = isProgramCurrentlyAiring(prog);
      // Mostra il poster solo per il programma in onda e solo se la barra
      // è abbastanza larga da contenerlo senza schiacciare il testo.
      const showPoster = isCurrent && prog.poster && widthPx >= 150;

      const bar = document.createElement('div');
      bar.className = 'full-epg-program'
        + (isCurrent ? ' current' : '')
        + (showPoster ? ' has-poster' : '');
      bar.style.left = leftPx + 'px';
      bar.style.width = widthPx + 'px';

      // Solo il programma corrente è cliccabile: avvia il canale.
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

  // Linea "now": absolute, dentro programs-inner così si muove
  // automaticamente con lo scroll orizzontale.
  const nowLine = document.createElement('div');
  nowLine.className = 'full-epg-now-line';
  programsInner.appendChild(nowLine);

  rightCol.appendChild(programsInner);

  inner.appendChild(leftCol);
  inner.appendChild(rightCol);
  scroll.appendChild(inner);
  container.appendChild(scroll);

  // Click su una cella nome → ricentra su "now"
  namesCol.addEventListener('click', (e) => {
    if (e.target.closest('.full-epg-name-cell')) {
      e.stopPropagation();
      scrollFullEpgToNow();
    }
  });

  // Aggiorna posizione linea "now" e avvia il timer (una volta al minuto)
  updateFullEpgNowLine();
  if (_fullEpgNowTimer) clearInterval(_fullEpgNowTimer);
  _fullEpgNowTimer = setInterval(updateFullEpgNowLine, 60000);

  // Auto-scroll iniziale: porta "now" nel primo terzo del viewport.
  requestAnimationFrame(() => {
    const nowPx = ((Date.now() - windowStartMs) / 3600000) * FULL_EPG_GRID.PX_PER_HOUR;
    // "now" è a (COL_WIDTH + nowPx) nello scroll-content. Lo vogliamo a
    // scroll.clientWidth/3 dal bordo sinistro del viewport.
    let target = FULL_EPG_GRID.COL_WIDTH + nowPx - scroll.clientWidth / 3;
    const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    if (target < 0) target = 0;
    if (target > maxScroll) target = maxScroll;
    scroll.scrollLeft = target;
  });
}


/**
 * Riposiziona la linea "now" in base all'ora corrente.
 * Chiamata da un setInterval ogni 60 secondi e alla fine del rendering.
 */
function updateFullEpgNowLine() {
  const nowLine = document.querySelector('.full-epg-now-line');
  if (!nowLine) return;
  const nowPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000)
    * FULL_EPG_GRID.PX_PER_HOUR;
  // La linea è dentro programs-inner: left è in coordinate del contenuto,
  // non del viewport. Non cambia con lo scroll.
  nowLine.style.left = nowPx + 'px';
}


// ============================================================================
// Cambio modalità list/grid
// ============================================================================

/**
 * Applica la modalità corrente (fullEpgViewMode) alla vista Full EPG.
 *
 * In 'grid':
 *   - mostra #fullEpgGrid, nasconde #fullEpgList;
 *   - mostra i pulsanti di navigazione temporale;
 *   - chiama renderFullEPGGrid().
 *
 * In 'list':
 *   - mostra #fullEpgList, nasconde #fullEpgGrid;
 *   - nasconde i pulsanti di navigazione temporale;
 *   - ferma il timer della linea "now".
 *
 * In entrambi i casi sincronizza l'attributo data-mode sull'header,
 * che pilota l'icona dell'indicatore.
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
    // Ferma il timer: la linea "now" esiste solo in modalità grid.
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


/**
 * Installa (una sola volta) il toggle list/grid sull'header del Full EPG.
 * Il click sull'header, esclusa la zona del pulsante "back", alterna le
 * due modalità, salva la preferenza e ri-renderizza la vista.
 */
function setupFullEpgViewToggle() {
  const header = document.getElementById('fullEpgHeader');
  if (!header || header.__toggleInit) return;
  header.__toggleInit = true;

  header.addEventListener('click', (e) => {
    // Il pulsante "back" (nascosto via CSS, ma tenuto per sicurezza) non
    // deve far scattare il toggle.
    if (e.target.closest('#fullEpgBackBtn')) return;
    fullEpgViewMode = (fullEpgViewMode === 'grid') ? 'list' : 'grid';
    localStorage.setItem('zappone_full_epg_view_mode', fullEpgViewMode);
    if (typeof renderFullEPGList === 'function') {
      renderFullEPGList();
    } else {
      applyFullEpgViewMode();
    }
  });

  // Sincronizza l'icona con la modalità persistita al primo avvio.
  header.setAttribute('data-mode', fullEpgViewMode === 'grid' ? 'grid' : 'list');
}


// ============================================================================
// Play di un canale dalla griglia
// ============================================================================

/**
 * Avvia un canale partendo da una voce EPG mostrata nella griglia.
 * Stessa logica di openChannelEpgDrawer._drawerPlay:
 *   - se la playlist non è ancora caricata in memoria, la carica;
 *   - cerca il canale M3U corrispondente all'EPG;
 *   - registra l'override _epgPlaybackOverride per la sessione;
 *   - chiama playStream.
 *
 * @param {Object} epgChannel
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


// ============================================================================
// Navigazione temporale
// ============================================================================

/**
 * Scorre la timeline di mezz'ora nella direzione indicata.
 * Mezz'ora = PX_PER_HOUR / 2 pixel. Chiamata dai pulsanti prev/next.
 *
 * @param {number} direction  -1 per indietro, +1 per avanti
 */
function scrollFullEpgByHour(direction) {
  const scroll = document.querySelector('.full-epg-body-scroll');
  if (!scroll) return;
  scroll.scrollBy({
    left: (FULL_EPG_GRID.PX_PER_HOUR / 2) * direction,
    behavior: 'smooth'
  });
}


/**
 * Centra la timeline su "now".
 *
 * Calcolo: nello scroll-content, "now" è a (COL_WIDTH + nowPx) pixel dal
 * bordo sinistro. Il viewport è largo scroll.clientWidth. Per centrare
 * "now", lo scrollLeft deve essere:
 *     scrollLeft = COL_WIDTH + nowPx - clientWidth / 2
 * con clamp tra 0 e maxScroll.
 */
function scrollFullEpgToNow() {
  const scroll = document.querySelector('.full-epg-body-scroll');
  if (!scroll) return;
  const nowPx = ((Date.now() - _fullEpgWindowStartMs) / 3600000)
    * FULL_EPG_GRID.PX_PER_HOUR;
  const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
  let target = FULL_EPG_GRID.COL_WIDTH + nowPx - scroll.clientWidth / 2;
  if (target < 0) target = 0;
  if (target > maxScroll) target = maxScroll;
  scroll.scrollTo({ left: target, behavior: 'smooth' });
}


/**
 * Aggancia i listener dei pulsanti prev/next (una sola volta).
 * Idempotente grazie al flag __init su ciascun pulsante.
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