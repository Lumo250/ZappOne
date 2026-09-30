// ============================================================================
// player.js – Riproduzione audio/video e gestione del player (V3 - Anti-Freeze Avanzato)
//
// Funzioni esportate globalmente:
//   updateChannelInfoUI(channel)
//   navigateChannels(direction, fromFavorites)
//   playStream(channel, fromFavorites)
//
// ============================================================================



// ---------------------------------------------------------------------------
// Stato watchdog MP4 — a livello di modulo, non più per chiamata.
//
// Prima queste variabili vivevano dentro playVideoStream, insieme a listener
// anonimi aggiunti con addEventListener('progress', () => ...) mai rimossi.
// Ogni riproduzione MP4 accumulava un nuovo listener sullo stesso <video>,
// ognuno con la sua closure: dopo N canali MP4 c'erano N listener che
// sparavano ad ogni evento, tutti inutili tranne l'ultimo.
//
// Ora lo stato è condiviso e i listener sono funzioni nominate, così
// possono essere rimossi e riagganciati in modo idempotente.
// ---------------------------------------------------------------------------
let _mp4Watchdog = null;
let _mp4LastTime = 0;
let _mp4LastProgressAt = 0;
let _mp4StallLevel = 0;
let _mp4LastRecoveryAt = 0;
let _mp4RequestId = 0;

const MP4_CHECK_MS = 2000;
const MP4_STALL_AFTER_MS = 8000;
const MP4_RECOVERY_COOLDOWN = 5000;

function _mp4ClearWatchdog() {
  if (_mp4Watchdog) { clearInterval(_mp4Watchdog); _mp4Watchdog = null; }
}

function _mp4OnProgress() {
  _mp4LastProgressAt = Date.now();
}

function _mp4OnEmptied() {
  _mp4ClearWatchdog();
}

function _mp4TryRecover(video) {
  const now = Date.now();
  if (now - _mp4LastRecoveryAt < MP4_RECOVERY_COOLDOWN) return;
  _mp4LastRecoveryAt = now;
  _mp4StallLevel++;
  const saved = video.currentTime;
  console.warn(`MP4 stall, recovery livello ${_mp4StallLevel}`);

  if (_mp4StallLevel === 1) {
    try { video.currentTime = saved + 0.001; } catch (e) {}
    return;
  }
  if (_mp4StallLevel === 2) {
    const current = video.src;
    video.src = '';
    video.src = current;
    try { video.currentTime = saved; } catch (e) {}
    playWhenReady(video, _mp4RequestId, "MP4 src reassegnato");
    return;
  }
  if (_mp4StallLevel === 3) {
    try { video.currentTime = Math.max(0, saved - 3); } catch (e) {}
    return;
  }
  // Livello 4: reset completo, ultimo resort
  const restoreSeek = () => {
    video.removeEventListener('loadedmetadata', restoreSeek);
    if (isStaleRequest(_mp4RequestId)) return;
    try { if (saved > 0) video.currentTime = saved; } catch (e) {}
  };
  video.addEventListener('loadedmetadata', restoreSeek, { once: true });
  try { video.load(); } catch (e) {}
  playWhenReady(video, _mp4RequestId, "MP4 reset");
}





// ---------------------------------------------------------------------------
// Guardia anti-sovrapposizione (zapping rapido)
// ---------------------------------------------------------------------------
let playStreamRequestId = 0;

/**
 * Vero se requestId non è più la richiesta di riproduzione più recente.
 * @param {number} requestId
 * @returns {boolean}
 */
function isStaleRequest(requestId) {
  return requestId !== playStreamRequestId;
}



// ---------------------------------------------------------------------------
// Equalizzatore: aggancio condizionale della catena Web Audio
// ---------------------------------------------------------------------------
// ensureEqChain() chiama createMediaElementSource(), che è IRREVERSIBILE:
// da quel momento l'elemento media è instradato attraverso il grafo Web
// Audio e non è più possibile tornare all'audio nativo del browser.
//
// Il parametro whichState è una STRINGA ('video' | 'audio'), non il
// riferimento allo stato: evita ReferenceError quando equalizer.js non è
// caricato. Se il modulo non è presente, la funzione è un no-op silenzioso.
function maybeEnsureEq(mediaElement, whichState) {
  if (typeof ensureEqChain !== 'function') return;
  if (typeof eqStateVideo === 'undefined' || typeof eqStateAudio === 'undefined') return;
  if (typeof isEqEnabled === 'function' && !isEqEnabled()) return;
  const state = (whichState === 'video') ? eqStateVideo : eqStateAudio;
  ensureEqChain(mediaElement, state);
}




// ---------------------------------------------------------------------------
// Helpers per il tipo di stream e avvio sicuro
// ---------------------------------------------------------------------------

/**
 * Verifica se l'URL di un canale punta a uno stream solo audio.
 * Salva il risultato in streamTypeCache (globale) per accesso rapido.
 */
async function isAudioStream(channel) {
  if (streamTypeCache[channel.url] === undefined) {
    const lowerUrl = channel.url.toLowerCase();
    streamTypeCache[channel.url] =
      !lowerUrl.endsWith('.mpd') &&
      ['.mp3', '.aac', '.ogg', '.wav', '.m4a', '.flac', '.audio'].some(ext =>
        lowerUrl.endsWith(ext)
      );
  }
  return streamTypeCache[channel.url];
}

/**
 * Avvia la riproduzione ignorando l'AbortError generato dai rapidi cambi sorgente.
 */



function safePlay(mediaEl, label = "media") {
  if (!mediaEl) return;
  mediaEl.play().catch(err => {
    if (err.name === "AbortError") {
      console.debug(`${label} play interrotto da un nuovo load (AbortError), ignoro.`);
    } else {
      console.error(`${label} play failed:`, err);
      document.getElementById('playerContainer')?.classList.remove('loading');
    }
  });
}


/**
 * Attende che il media abbia accumulato abbastanza dati nel buffer nativo 
 * prima di forzare l'avvio. Evita il "micro-freeze" per buffer starvation iniziale.
 */
/**
 * Attende il caricamento del primo fotogramma (readyState >= 2) 
 * per massimizzare la velocità dello zapping.
 */


function playWhenReady(mediaEl, requestId, label = "media") {
  let started = false;
  const attemptPlay = () => {
    if (isStaleRequest(requestId)) return;
    safePlay(mediaEl, label);
  };
  const markStarted = () => { started = true; };

  // readyState >= 2 (HAVE_CURRENT_DATA): ha decodificato il primo frame
  if (mediaEl.readyState >= 2) {
    attemptPlay();
    return;
  }

  mediaEl.addEventListener('playing', markStarted, { once: true });

  const onLoadedData = () => {
    mediaEl.removeEventListener('loadeddata', onLoadedData);
    attemptPlay();
  };
  mediaEl.addEventListener('loadeddata', onLoadedData);

  // Fallback di sicurezza ridotto a 1.5s per velocizzare i casi limite.
  // La rimozione dei listener avviene PRIMA del controllo "stale", cosi non
  // restano mai appesi al <video> condiviso durante lo zapping rapido. Il
  // flag "started" evita di forzare il play se l'utente ha già messo in
  // pausa volontariamente dopo un avvio riuscito.
  setTimeout(() => {
    mediaEl.removeEventListener('loadeddata', onLoadedData);
    mediaEl.removeEventListener('playing', markStarted);
    if (isStaleRequest(requestId)) return;
    if (!started && mediaEl.paused) attemptPlay();
  }, 1500);
}



// ---------------------------------------------------------------------------
// Interfaccia utente del player
// ---------------------------------------------------------------------------

function toggleUIElementsForStreamType(isAudio) {
  document.getElementById('channelListContainer').style.display = 'none';
  document.getElementById('playerContainer').style.display = 'block';
  
  const bottomTabBar = document.getElementById('bottomTabBar');
  if (bottomTabBar) bottomTabBar.classList.add('hidden');
  
  const mainHeader = document.querySelector('.main-header');
  if (mainHeader) mainHeader.classList.add('hidden');
  
  const controls = document.getElementById('controls');
  if (controls) controls.classList.add('hidden');

  const video = document.getElementById('player');
  const playerContainer = document.getElementById('playerContainer');

  if (isAudio) {
    playerContainer.classList.add('audio-mode');
    video.style.display = 'none';
  } else {
    playerContainer.classList.remove('audio-mode');
    video.style.display = '';
  }
}

function updateChannelInfoUI(channel) {
  const logoEl = document.getElementById('currentChannelLogo');
  if (logoEl) logoEl.src = channel.logo || '';
  
  const nameEl = document.getElementById('currentChannelName');
  if (nameEl) nameEl.textContent = channel.name;
  
  const groupEl = document.getElementById('currentChannelGroup');
  if (groupEl) groupEl.textContent = channel.group;
}

function updateNavButtons(fromFavorites = false) {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (!prevBtn || !nextBtn) return;

  if (fromFavorites) {
    prevBtn.disabled = currentFavoriteIndex <= 0;
    nextBtn.disabled = currentFavoriteIndex >= favoriteChannels.length - 1;
  } else {
    const displayList = getCurrentDisplayList();
    prevBtn.disabled = currentChannelIndex <= 0;
    nextBtn.disabled = currentChannelIndex >= displayList.length - 1;
  }
}

// ---------------------------------------------------------------------------
// Pulizia del player (HLS, DASH, audio/video)
// ---------------------------------------------------------------------------

async function cleanupHlsInstance() {
  if (!window.hlsInstance) return;
  try {
    window.hlsInstance.stopLoad();
    await new Promise((resolve) => {
      let settled = false;
      const onDetached = () => {
        if (settled) return;
        settled = true;
        try { window.hlsInstance.off(Hls.Events.MEDIA_DETACHED, onDetached); } catch (e) {}
        resolve();
      };
      try {
        window.hlsInstance.on(Hls.Events.MEDIA_DETACHED, onDetached);
        window.hlsInstance.detachMedia();
      } catch (e) {
        resolve();
      }
      setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 150);
    });
    try { window.hlsInstance.destroy(); } catch (e) { console.debug('HLS destroy ignorato:', e); }
  } catch (e) {
    console.debug('cleanupHlsInstance error:', e);
    try { window.hlsInstance.destroy(); } catch (_) {}
  } finally {
    window.hlsInstance = null;
  }
}

async function cleanupPlayers({ keepVideoVisible = true, preserveHLS = false } = {}) {
  const video = document.getElementById("player");
  const wrapper = document.getElementById("videoWrapper");

  // Pulizia DASH.js
  if (window.dashPlayer) {
    try {
      window.dashPlayer.attachSource(null);
      window.dashPlayer.attachView(null);
      window.dashPlayer.reset();
    } catch (e) {}
    window.dashPlayer = null;
  }

  // Pulizia HLS.js — async: attende realmente il MEDIA_DETACHED prima di
  // distruggere l'istanza. Il precedente detach+destroy sincrono lasciava la
  // vecchia istanza in fase di smontaggio mentre il nuovo canale iniziava a
  // usare lo stesso <video>, causando micro-freeze / primo frame nero.
  if (!preserveHLS && window.hlsInstance) {
    await cleanupHlsInstance();
  }

  // Se l'EQ è attivo, il <video>/<audio> è già agganciato al grafo Web Audio.
  // In quel caso NON va rimosso crossorigin: l'attributo è ciò che rende il
  // source node "CORS-aware". Rimuoverlo (anche momentaneamente) fa sì che
  // il browser consideri il media "tainted" e il source node emetta silenzio,
  // cioè i gain dei filtri smettono di avere effetto pur sentendo l'audio
  // riprodotto nativamente dall'elemento.
  //
  // load() invece va SEMPRE chiamato: è ciò che permette di sostituire la
  // sorgente in modo pulito tra un canale e l'altro senza micro-freeze.
  const eqActive = (typeof isEqEnabled === 'function') && isEqEnabled();

  // Reset tag <video>
  if (video) {
    try {
      video.pause();
      video.removeAttribute('src');
      if (!eqActive) {
        video.removeAttribute('crossorigin');
      }
      video.load();
      video.onwaiting = null;
      video.onplaying = null;
      video.onpause = null;
      video.onerror = null;
    } catch (e) {}

    if (!keepVideoVisible) {
      video.style.display = "none";
      if (wrapper) wrapper.style.display = "none";
    } else {
      video.style.display = "block";
      if (wrapper) wrapper.style.display = "block";
    }
  }

  // Reset player <audio> condiviso
  const audioEl = document.getElementById("audioPlayer");
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.removeAttribute('src');
      if (!eqActive) {
        audioEl.removeAttribute('crossorigin');
      }
      audioEl.load();
      audioEl.onwaiting = null;
      audioEl.onplaying = null;
      audioEl.onerror = null;
      audioEl.style.display = "none";
    } catch (e) {}
  }
}


function getSharedAudioPlayer() {
  let audio = document.getElementById("audioPlayer");
  if (!audio) {
    audio = document.createElement("audio");
    audio.id = "audioPlayer";
    audio.controls = true;
    audio.autoplay = true;
    audio.style.width = "100%";
    audio.style.margin = "10px 0 25px 0";
    
    const playerContainer = document.getElementById('playerContainer');
    const controls = playerContainer.querySelector(".player-controls");
    playerContainer.insertBefore(audio, controls);
  }
  audio.style.display = "block";
  return audio;
}

// ---------------------------------------------------------------------------
// Riproduzione audio
// ---------------------------------------------------------------------------

async function playAudioStream(url, requestId = ++playStreamRequestId) {
  if (isStaleRequest(requestId)) return;

  const playerContainer = document.getElementById('playerContainer');
  await cleanupPlayers({ keepVideoVisible: false, preserveHLS: false });
if (isStaleRequest(requestId)) return;   // ← MANCA

  const audio = getSharedAudioPlayer();

  // L'elemento è stato ripulito (load() eseguito). Ora, se l'EQ è attivo,
  // ci assicuriamo che crossorigin sia presente PRIMA di agganciare la
  // catena: il source node cattura lo stato CORS al momento della creazione.
  const eqActive = (typeof isEqEnabled === 'function') && isEqEnabled();
  if (eqActive) {
    audio.setAttribute('crossorigin', 'anonymous');
  }

  maybeEnsureEq(audio, 'audio');

  // Gestione dinamica Spinner basata sugli eventi hardware
  audio.onwaiting = () => {
    if (isStaleRequest(requestId)) return;
    playerContainer.classList.add('loading');
  };
  audio.onplaying = () => {
    if (isStaleRequest(requestId)) return;
    playerContainer.classList.remove('loading');
    audio.dataset.started = "true";
  };
  audio.onerror = () => {
    if (isStaleRequest(requestId)) return;
    playerContainer.classList.remove("loading");
    if (audio.dataset.started === "true") return;
    if (audio.error && audio.error.code === 4) return;
    console.error("Errore streaming audio reale");
    if (typeof showNotification === 'function') showNotification('Canale audio non disponibile', true);
  };

  const lowerUrl = url.toLowerCase();
  const isHLS = lowerUrl.endsWith(".m3u8") || lowerUrl.includes("m3u8");

  if (isHLS && typeof Hls !== 'undefined' && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, maxBufferLength: 30, maxMaxBufferLength: 60 });
    window.hlsInstance = hls;

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (isStaleRequest(requestId)) return;
      hls.loadSource(url);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (isStaleRequest(requestId)) return;
      playWhenReady(audio, requestId, "HLS audio");
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (isStaleRequest(requestId)) return;
      if (data.fatal) {
        try { hls.destroy(); } catch (e) {}
        audio.src = url;
        playWhenReady(audio, requestId, "Audio fallback");
      }
    });

    hls.attachMedia(audio);

  } else {
    audio.src = url;
    playWhenReady(audio, requestId, "Native audio");
  }
}


// ---------------------------------------------------------------------------
// Riproduzione video
// ---------------------------------------------------------------------------

let dashRetryTimer = null;

// ---------------------------------------------------------------------------
// Avvia una nuova sorgente HLS su un'istanza HLS.js GIÀ ATTACCATA al <video>.
//
// PERCHÉ ESISTE: distruggere e ricreare l'istanza ad ogni cambio canale costa
// 150ms di detach + ~100-200ms di ricreazione Worker/buffer. Inoltre
// detachMedia()/attachMedia() ripetuti sono il momento in cui la MediaSource
// cambia sotto i piedi al source node dell'equalizzatore (rischio "gain
// inefficaci"). Riusando l'istanza, la MediaSource resta la stessa e il
// problema non si pone mai.
//
// COSA FA:
//  1. rimuove gli handler (MANIFEST_PARSED, ERROR) della sessione precedente
//  2. registra nuovi handler legati al requestId corrente
//  3. chiama hls.loadSource(url): questo internamente fa stopLoad() + reset
//     dello stato interno + fetch del nuovo manifest. NON tocca la MediaSource.
//
// NON chiamare questa funzione se hls non è viva o se hls.media !== video.
// ---------------------------------------------------------------------------
function _playHlsSource(hls, video, url, requestId) {
  if (!hls) return;

  // 1. Rimuovi handler vecchi (se presenti)
  if (hls._zapponeHandlers) {
    try { hls.off(Hls.Events.MANIFEST_PARSED, hls._zapponeHandlers.onManifestParsed); } catch (e) {}
    try { hls.off(Hls.Events.ERROR, hls._zapponeHandlers.onError); } catch (e) {}
    hls._zapponeHandlers = null;
  }

  // 2. Riallinea gli handler del <video> al nuovo requestId
  video.onwaiting = () => {
    if (isStaleRequest(requestId)) return;
    document.getElementById('playerContainer')?.classList.add('loading');
  };
  video.onplaying = () => {
    if (isStaleRequest(requestId)) return;
    document.getElementById('playerContainer')?.classList.remove('loading');
  };

  // 3. Handler HLS per questa sessione (stessa logica dell'istanza fresca,
  //    ma con i suoi contatori locali per non "trascinare" errori vecchi)
  const HLS_ERROR_RESET_WINDOW_MS = 60000;
  const HLS_MEDIA_MAX_ATTEMPTS = 3;
  const HLS_NETWORK_MAX_ATTEMPTS = 5;
  const HLS_NETWORK_RETRY_DELAY_MS = 2000;

  let mediaErrorCount = 0;
  let mediaErrorSwappedCodec = false;
  let lastMediaErrorAt = 0;
  let networkErrorCount = 0;
  let lastNetworkErrorAt = 0;
  let networkRetryTimer = null;

  const giveUpOnStream = (reason) => {
    clearTimeout(networkRetryTimer);
    try { hls.destroy(); } catch (e) {}
    if (window.hlsInstance === hls) window.hlsInstance = null;
    document.getElementById('playerContainer')?.classList.remove('loading');
    if (typeof showNotification === 'function') showNotification('Errore HLS: ' + reason, true);
  };

  const onManifestParsed = () => {
    if (isStaleRequest(requestId)) return;
    playWhenReady(video, requestId, "HLS.js (reuse)");
  };

  const onError = (event, data) => {
    if (isStaleRequest(requestId)) return;
    if (!data.fatal) return;
    const now = Date.now();

    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      if (now - lastNetworkErrorAt > HLS_ERROR_RESET_WINDOW_MS) networkErrorCount = 0;
      lastNetworkErrorAt = now;
      networkErrorCount++;
      if (networkErrorCount > HLS_NETWORK_MAX_ATTEMPTS) {
        giveUpOnStream('rete non disponibile');
        return;
      }
      clearTimeout(networkRetryTimer);
      networkRetryTimer = setTimeout(() => {
        if (isStaleRequest(requestId)) return;
        try { hls.startLoad(); } catch (e) {}
      }, HLS_NETWORK_RETRY_DELAY_MS);
    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      if (now - lastMediaErrorAt > HLS_ERROR_RESET_WINDOW_MS) {
        mediaErrorCount = 0;
        mediaErrorSwappedCodec = false;
      }
      lastMediaErrorAt = now;
      mediaErrorCount++;
      if (mediaErrorCount > HLS_MEDIA_MAX_ATTEMPTS) {
        giveUpOnStream('flusso non recuperabile');
        return;
      }
      if (mediaErrorCount >= 2 && !mediaErrorSwappedCodec) {
        mediaErrorSwappedCodec = true;
        try { hls.swapAudioCodec(); } catch (e) {}
      }
      try { hls.recoverMediaError(); } catch (e) {}
    } else {
      giveUpOnStream('errore non recuperabile');
    }
  };

  hls._zapponeHandlers = { onManifestParsed, onError };
  hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
  hls.on(Hls.Events.ERROR, onError);

  // 4. Avvia la nuova sorgente sulla STESSA istanza.
  //    hls.loadSource() internamente fa stopLoad() + reset, senza toccare
  //    la MediaSource già attaccata al <video>. È il cuore del fix.
  try {
    hls.loadSource(url);
  } catch (e) {
    console.error('[HLS reuse] loadSource ha lanciato, distruggo e notifico:', e);
    try { hls.destroy(); } catch (_) {}
    if (window.hlsInstance === hls) window.hlsInstance = null;
    document.getElementById('playerContainer')?.classList.remove('loading');
    if (typeof showNotification === 'function') showNotification('Errore avvio flusso HLS', true);
  }
}


async function playVideoStream(url, requestId = ++playStreamRequestId) {
  if (isStaleRequest(requestId)) return;

  const video = document.getElementById('player');
  const lowerUrl = url.toLowerCase();
  const isSafariIOS = /iP(hone|od|ad).+Version\/\d+.+Safari/i.test(navigator.userAgent);
  const isHLS = lowerUrl.includes('.m3u8') || /\.m3u8(\?|&|$)/i.test(url);
  const isDASH = lowerUrl.endsWith('.mpd') || lowerUrl.includes('.mpd?');
  const isMp4OrMov = lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mov');

  // ============================================================
  // FAST PATH: riuso dell'istanza HLS.js esistente
  // ============================================================
  // Riusiamo SOLO quando TUTTE queste condizioni sono vere:
  //   - la sorgente è HLS
  //   - non è Safari iOS (che usa HLS nativo, non hls.js)
  //   - hls.js è caricato e supportato
  //   - esiste un'istanza HLS.js viva
  //   - l'istanza è attaccata a QUESTO stesso <video> (se il video è
  //     stato ricreato dal toggle eq, hls.media punta altrove → no reuse)
  //   - se eq è attivo, il <video> ha già crossorigin="anonymous"
  //     (altrimenti il source node risultava tainted: in quel caso
  //     preferiamo il percorso completo che sistema tutto)
  const eqActive = (typeof isEqEnabled === 'function') && isEqEnabled();
  const eqCrossOriginOK = !eqActive || video.getAttribute('crossorigin') === 'anonymous';

  const hlsCanBeReused =
    isHLS &&
    !isSafariIOS &&
    typeof Hls !== 'undefined' &&
    Hls.isSupported() &&
    window.hlsInstance &&
    window.hlsInstance._zapponeAttachedVideo === video &&
    eqCrossOriginOK;

  if (hlsCanBeReused) {
    // Nessuna pulizia, nessun detach, nessuna ricreazione: la MediaSource
    // resta agganciata al <video>, l'equalizzatore resta intatto.
    _playHlsSource(window.hlsInstance, video, url, requestId);
    return;
  }

  // ============================================================
  // SLOW PATH: pulizia completa + scelta player (invariato)
  // ============================================================
  await cleanupPlayers({ keepVideoVisible: true, preserveHLS: false });

  // Race condition: se durante l'await è partita una nuova richiesta,
  // non toccare il DOM.
  if (isStaleRequest(requestId)) return;

  if (eqActive) {
    video.setAttribute('crossorigin', 'anonymous');
  }

  maybeEnsureEq(video, 'video');

  clearTimeout(dashRetryTimer);

    const autoFullscreen = localStorage.getItem('zappone_auto_fullscreen') === 'true';
  if (autoFullscreen) {
    video.removeAttribute('playsinline');
    video.removeAttribute('webkit-playsinline');
  } else {
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.removeAttribute("controls");
    video.onclick = () =>
      video.hasAttribute("controls")
        ? video.removeAttribute("controls")
        : video.setAttribute("controls", "true");
  }

  video.style.display = "block";

  video.onwaiting = () => {
    if (isStaleRequest(requestId)) return;
    document.getElementById('playerContainer')?.classList.add('loading');
  };
  video.onplaying = () => {
    if (isStaleRequest(requestId)) return;
    document.getElementById('playerContainer')?.classList.remove('loading');
  };

  // --- A) Safari iOS nativo HLS ---
  if (isSafariIOS && isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    playWhenReady(video, requestId, "Safari HLS");
    return;
  }

  // --- B) DASH.js ---
  if (isDASH && typeof dashjs !== 'undefined') {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (eqActive) video.setAttribute('crossorigin', 'anonymous');

    let dashRetries = 0;
    const DASH_MAX_RETRIES = 3;
    const DASH_RETRY_DELAY_MS = 1200;

    const createAndInitDash = () => {
      if (isStaleRequest(requestId)) return;

      if (window.dashPlayer) {
        try {
          window.dashPlayer.attachSource(null);
          window.dashPlayer.attachView(null);
          window.dashPlayer.reset();
        } catch (e) {}
      }
      window.dashPlayer = null;

      try {
        const player = dashjs.MediaPlayer().create();
        window.dashPlayer = player;
        player.updateSettings({
          streaming: { buffer: { fastSwitchEnabled: true }, text: { defaultEnabled: false } },
          debug: { logLevel: dashjs.Debug.LOG_LEVEL_FATAL }
        });

        player.on(dashjs.MediaPlayer.events.ERROR, (e) => {
          if (isStaleRequest(requestId)) return;
          if (e.error && e.error.message && e.error.message.includes('SourceBuffer')) return;
          console.error('DASH error:', e);
          dashRetries++;
          if (dashRetries <= DASH_MAX_RETRIES) {
            try { player.attachView(null); player.reset(); } catch (_) {}
            clearTimeout(dashRetryTimer);
            dashRetryTimer = setTimeout(() => createAndInitDash(), DASH_RETRY_DELAY_MS);
          } else {
            document.getElementById('playerContainer')?.classList.remove('loading');
            if (typeof showNotification === 'function') showNotification('Errore DASH (fallback)', true);
            video.src = url;
            playWhenReady(video, requestId, "Fallback DASH");
          }
        });

        player.initialize(video, url, true);
      } catch (err) { console.error('DASH fatal:', err); }
    };

    createAndInitDash();
    return;
  }

  // --- C) HLS.js (istanza fresca: prima volta, o dopo un non-HLS, o dopo un eq toggle) ---
  if (typeof Hls !== 'undefined' && Hls.isSupported() && isHLS) {
    const hls = new Hls({
      enableWorker: !isSafariIOS,
      backBufferLength: 30,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      liveSyncDurationCount: 3,
      startLevel: -1
    });
    window.hlsInstance = hls;
    // Marchiamo l'elemento video a cui questa istanza è agganciata:
    // serve al check di riuso per distinguere "stesso video" da
    // "video ricreato dall'eq toggle".
    hls._zapponeAttachedVideo = video;

    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (isStaleRequest(requestId)) return;
      // Da qui in poi il percorso è identico a quello del riuso:
      // stessi handler, stesso loadSource, stessa logica di errore.
      _playHlsSource(hls, video, url, requestId);
    });
    return;
  }

  // --- D) MP4/MOV con watchdog reattivo ---
  if (isMp4OrMov) {
    const currentUrl = url;

    _mp4ClearWatchdog();
    _mp4StallLevel = 0;
    _mp4LastRecoveryAt = 0;
    _mp4RequestId = requestId;

    video.removeEventListener('progress', _mp4OnProgress);
    video.removeEventListener('emptied', _mp4OnEmptied);
    video.addEventListener('progress', _mp4OnProgress);
    video.addEventListener('emptied', _mp4OnEmptied);

    video.onwaiting = () => {
      if (isStaleRequest(requestId)) return;
      document.getElementById('playerContainer')?.classList.add('loading');
    };

    video.onplaying = () => {
      if (isStaleRequest(requestId)) return;
      document.getElementById('playerContainer')?.classList.remove('loading');
      _mp4StallLevel = 0;
      _mp4LastProgressAt = Date.now();
    };

    _mp4LastTime = video.currentTime;
    _mp4LastProgressAt = Date.now();

    _mp4Watchdog = setInterval(() => {
      if (isStaleRequest(requestId)) { _mp4ClearWatchdog(); return; }
      if (video.paused || video.ended) return;

      const advanced = video.currentTime - _mp4LastTime;
      const sinceProgress = Date.now() - _mp4LastProgressAt;

      if (advanced > 0.2) {
        _mp4LastTime = video.currentTime;
        _mp4StallLevel = 0;
        return;
      }
      if (sinceProgress < MP4_STALL_AFTER_MS) return;

      console.warn(`MP4 bloccato: no progress da ${sinceProgress}ms`);
      _mp4TryRecover(video);
      _mp4LastTime = video.currentTime;
    }, MP4_CHECK_MS);

    video.src = currentUrl;
    playWhenReady(video, requestId, "Native MP4");
    return;
  }

  // --- E) Fallback generico ---
  video.src = url;
  playWhenReady(video, requestId, "Generic Native");
}


// ---------------------------------------------------------------------------
// Navigazione tra i canali (precedente / successivo)
// ---------------------------------------------------------------------------

function navigateChannels(direction, fromFavorites = false) {
  const displayList = fromFavorites ? favoriteChannels : getCurrentDisplayList();
  let currentIndex = fromFavorites ? currentFavoriteIndex : currentChannelIndex;

  if (currentIndex < 0 || currentIndex >= displayList.length) {
    const key = window.currentChannelUrl;
    currentIndex = fromFavorites
      ? (favoriteIndexMap.get(key) ?? -1)
      : (channelIndexMap.get(key) ?? -1);
    if (currentIndex === -1)
      currentIndex = displayList.findIndex(ch => getChannelKey(ch) === key);
  }

  if (currentIndex === -1) return;

  const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (newIndex < 0 || newIndex >= displayList.length) return;

  if (fromFavorites) currentFavoriteIndex = newIndex;
  else currentChannelIndex = newIndex;

  playStream(displayList[newIndex], fromFavorites);
}

// ---------------------------------------------------------------------------
// Riproduzione principale (orchestratore)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Patch 5 — Prefetch del canale successivo
// ---------------------------------------------------------------------------
// Scopo: quando l'utente preme "next", la connessione al server del canale
// successivo è già stabilita (DNS + TCP + TLS) e, per HLS, il manifest è
// già in cache HTTP. Così il primo segmento arriva prima.
//
// Note importanti:
//  - Gira in modo silenzioso e "best-effort": qualsiasi errore viene ignorato.
//  - È ritardata di 1.5s e controllata con isStaleRequest(): durante zapping
//    rapido NON parte, per non rubare banda al canale che l'utente sta
//    effettivamente cercando.
//  - Prefetcha SOLO il manifest HLS (.m3u8), mai i segmenti (.ts, .m4s):
//    sarebbero diversi MB e sprecherebbero traffico.
const _prefetchDone = new Set();   // URL già prefetchati in questa sessione

function _prefetchPreconnect(origin) {
  if (!origin) return;
  // Evita duplicati: se il <link> esiste già, non riaggiungerlo.
  if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
  const pre = document.createElement('link');
  pre.rel = 'preconnect';
  pre.href = origin;
  pre.crossOrigin = 'anonymous';
  document.head.appendChild(pre);
  // Per browser vecchi che non supportano preconnect: fallback a dns-prefetch.
  const dns = document.createElement('link');
  dns.rel = 'dns-prefetch';
  dns.href = origin;
  document.head.appendChild(dns);
}

function prefetchNextChannel(fromFavorites, requestId) {
  try {
    const displayList = fromFavorites ? favoriteChannels : getCurrentDisplayList();
    const currentIndex = fromFavorites ? currentFavoriteIndex : currentChannelIndex;
    if (currentIndex < 0 || currentIndex >= displayList.length - 1) return;

    const next = displayList[currentIndex + 1];
    if (!next || !next.url) return;

    // Ritardo 1.5s: se nel frattempo l'utente cambia canale, la richiesta è
    // stale e saltiamo il prefetch. Senza questo delay, zappando veloce
    // lanceremmo N prefetch concorrenti che rubano banda al canale attuale.
    setTimeout(() => {
      if (isStaleRequest(requestId)) return;

      const nextUrl = next.url;

      // 1. Preconnect verso l'origine (DNS + TCP + TLS).
      let origin = null;
      try { origin = new URL(nextUrl).origin; } catch (e) { return; }
      _prefetchPreconnect(origin);

      // 2. Warm cache HTTP del manifest HLS (solo se non già fatto).
      const lower = nextUrl.toLowerCase();
      const isHLS = lower.includes('.m3u8');
      if (isHLS && !_prefetchDone.has(nextUrl)) {
        _prefetchDone.add(nextUrl);
        // mode:'no-cors' apre comunque la connessione anche se l'origine non
        // espone header CORS; il body resta opaco ma la cache TCP/TLS è calda.
        fetch(nextUrl, {
          method: 'GET',
          mode: 'no-cors',
          credentials: 'omit',
          cache: 'default',
          // 'priority' è supportato solo su alcuni browser; se ignorato, non
          // è un problema: il prefetch avviene comunque a bassa priorità
          // perché parte dopo 1.5s di inattività e non blocca nulla.
          priority: 'low'
        }).catch(() => {});
      }
    }, 1500);
  } catch (e) {
    // Prefetch best-effort: qualsiasi errore è silenzioso.
  }
}

// ----------------------------------------------------------------------------
// playStream(channel, fromFavorites)
//
// Orchestratore principale della riproduzione.
//
// Compiti:
//   1. Risolve l'indice del canale nella lista corretta (preferiti o principale)
//   2. Aggiorna lo stato globale (window.currentChannelUrl, localStorage)
//   3. Aggiorna la UI del player (logo, nome, gruppo)
//   4. Prepara la visibilità dei container EPG/metadati sotto il player
//   5. Avvia lo stream audio o video (playAudioStream / playVideoStream)
//   6. Dopo l'avvio: aggiorna i pulsanti di navigazione, prefetcha il canale
//      successivo, e differisce il render delle UI pesanti (EPG/metadati)
//
// Anti-race: ogni chiamata incrementa playStreamRequestId e propaga
// myRequestId a tutte le sotto-funzioni. Chiunque controlli isStaleRequest
// può abortire se nel frattempo è partito un altro canale.
// ----------------------------------------------------------------------------
async function playStream(channel, fromFavorites = false) {

  // 1. RISOLUZIONE INDICE DEL CANALE
  // Prende l'indice del canale nella lista corretta, usando la mappa veloce
  // (channelIndexMap / favoriteIndexMap) e con fallback a findIndex se la
  // mappa non è allineata. Se il canale non esiste proprio, torna alla lista.
  const myRequestId = ++playStreamRequestId;
  const key = getChannelKey(channel);

  let currentIndex;
  if (fromFavorites) {
    currentIndex = favoriteIndexMap.get(key);
    if (currentIndex === undefined) {
      currentIndex = favoriteChannels.findIndex(ch => getChannelKey(ch) === key);
      if (currentIndex === -1) {
        if (typeof showChannelList === 'function') showChannelList();
        return;
      }
    }
    currentFavoriteIndex = currentIndex;
  } else {
    currentIndex = channelIndexMap.get(key);
    if (currentIndex === undefined) {
      currentIndex = channels.findIndex(ch => getChannelKey(ch) === key);
      if (currentIndex === -1) {
        if (typeof showChannelList === 'function') showChannelList();
        return;
      }
    }
    currentChannelIndex = currentIndex;
  }

  const targetChannel = fromFavorites
    ? favoriteChannels[currentIndex]
    : channels[currentIndex];

  // 2. AGGIORNAMENTO STATO GLOBALE
  // window.currentChannelUrl è la chiave univoca usata da getActiveChannel()
  // e da tutta la logica di evidenziazione. Le due chiavi localStorage sono
  // per il ripristino dell'ultimo canale al riavvio dell'app: le scriviamo in
  // un setTimeout(0) per non bloccare il thread con una I/O sincrona.
  window.currentChannelUrl = key;

  setTimeout(() => {
    localStorage.setItem("zappone_last_played", targetChannel.url);
    localStorage.setItem("zappone_last_played_from_favorites", fromFavorites.toString());
  }, 0);

  // 3. SWITCH VISIVO IMMEDIATO (lista -> player)
  // Nascondiamo la lista canali e mostriamo il player. Lo facciamo in un rAF
  // per dare la sensazione di risposta immediata al tap, senza aspettare
  // il caricamento dello stream.
  const playerContainer = document.getElementById('playerContainer');

  requestAnimationFrame(() => {
    document.getElementById('channelListContainer').style.display = 'none';
    playerContainer.style.display = 'block';

    const bottomTabBar = document.getElementById('bottomTabBar');
    if (bottomTabBar) bottomTabBar.classList.add('hidden');
  });

  // 4. INFO CANALE (logo, nome, gruppo) — economico, subito
  updateChannelInfoUI(targetChannel);

  // 5. VISIBILITÀ DEI CONTENITORI SOTTO IL PLAYER (EPG e METADATI)
  // Qui gestiamo SOLO la visibilità (display, classi, frecce). Il render
  // vero e proprio del contenuto (showChannelEPG, updateMetadataValues) è
  // differito dopo l'avvio dello stream — vedi blocco Fix #3 in fondo.

  // --- Blocco EPG ---
  const showEPGEnabled = localStorage.getItem("zappone_show_epg") === "true";
  const epgHeader      = document.getElementById('epgHeader');
  const epgContainer   = document.getElementById('epgContainer');
  const epgContent     = document.getElementById('epgContent');
  const epgArrow       = document.querySelector('#epgHeader .metadata-arrow');

  if (showEPGEnabled) {
    if (epgHeader)    epgHeader.style.display = 'flex';
    if (epgContainer) epgContainer.style.display = 'block';

    const epgCollapsed = localStorage.getItem('epgCollapsed') === 'true';
    if (epgContent) epgContent.style.display = epgCollapsed ? 'none' : 'block';
    if (epgArrow)   epgArrow.classList.toggle('collapsed', epgCollapsed);

    // Fix #3: showChannelEPG() è differita dopo l'avvio dello stream (vedi
    // in fondo). Era la causa principale del mini-freeze: parsing date +
    // scansione programmi + costruzione DOM avvenivano PRIMA di
    // playVideoStream/playAudioStream.
  } else {
    if (epgHeader)    epgHeader.style.display = 'none';
    if (epgContainer) epgContainer.style.display = 'none';
  }

  // --- Blocco Metadati ---
  const showMetadataEnabled = localStorage.getItem("zappone_show_metadata") === "true";
  const metadataExpandedNow = localStorage.getItem('metadataExpanded') === 'true';
  const mh = document.getElementById('metadataHeader');
  const mc = document.getElementById('metadataContainer');

  if (showMetadataEnabled) {
    if (mh) mh.style.display = 'flex';
    if (mc) {
      if (metadataExpandedNow) {
        mc.style.display = 'block';
        mc.classList.add('expanded');
      } else {
        mc.style.display = 'none';
        mc.classList.remove('expanded');
      }
    }
    // Fix #3: updateMetadataValues/showChannelMetadata sono differite dopo
    // l'avvio dello stream (vedi in fondo). Anche qui, costruzione DOM sincrona.
  } else {
    if (mh) mh.style.display = 'none';
    if (mc) {
      mc.style.display = 'none';
      mc.classList.remove('expanded');
    }
  }

  // 6. AVVIO DELLO STREAM (audio o video)
  try {
    // 6a. Decide se audio o video.
    // Se la modalità Radio è attiva, tutto è trattato come audio.
    // Altrimenti si guarda l'estensione/URL del canale (isAudioStream usa
    // una cache per evitare di ripetere il test ad ogni play).
    const radioToggle = document.getElementById('radioToggle');
    const isRadioMode = radioToggle ? radioToggle.checked : false;
    let isAudioChannel = isRadioMode;

    if (!isRadioMode) {
      isAudioChannel = await isAudioStream(targetChannel);
    }

    // 6b. Check anti-race prima di toccare il DOM del player
    if (isStaleRequest(myRequestId)) return;

    // 6c. Adatta la UI al tipo di stream
    // Nasconde/mostra <video>, applica la classe .audio-mode, ecc.
    toggleUIElementsForStreamType(isAudioChannel);

    // 6d. Avvia lo stream vero e proprio.
    // Da qui in poi il caricamento del flusso parte. Le due funzioni sono
    // async e ritornano quando l'elemento media ha iniziato il fetch, non
    // quando il primo frame è pronto.
    if (isAudioChannel) {
      await playAudioStream(targetChannel.url, myRequestId);
    } else {
      await playVideoStream(targetChannel.url, myRequestId);
    }

    // 6e. Check anti-race dopo l'avvio
    if (isStaleRequest(myRequestId)) return;

    // NOTA BENE: Non rimuoviamo più playerContainer.classList.remove('loading')
    // qui! Ora ci pensano gli eventi video.onplaying / video.onwaiting ad
    // agire in modo preciso.

    // 6f. Aggiorna i pulsanti prev/next
    updateNavButtons(fromFavorites);

    // 6g. Prefetch del canale successivo.
    // Patch 5 — best-effort, ritardato di 1.5s, annullato se l'utente cambia
    // canale prima che scatti (grazie al check isStaleRequest al suo interno).
    prefetchNextChannel(fromFavorites, myRequestId);

    // Fix #3 — RENDER DIFFERITO DELLE UI PESANTI (EPG e METADATI)
    //
    // showChannelEPG e updateMetadataValues sono sincrone e bloccano il
    // thread principale (parsing date, scansione programmi EPG, costruzione
    // DOM). Eseguirle PRIMA dell'avvio dello stream ritardava play() di
    // centinaia di ms, generando il mini-freeze percepito ad ogni cambio
    // canale. Ora girano in un rAF successivo, quando il caricamento del
    // flusso è già partito.
    //
    // Il check isStaleRequest garantisce che durante zapping rapido non
    // venga renderizzato l'EPG di un canale già superato.
    requestAnimationFrame(() => {
      if (isStaleRequest(myRequestId)) return;

      // EPG del canale corrente (solo se il toggle è attivo)
      if (showEPGEnabled && typeof showChannelEPG === 'function') {
        showChannelEPG(targetChannel);
      }

      // Metadati del canale (solo se il toggle è attivo E il pannello è espanso)
      if (showMetadataEnabled && metadataExpandedNow) {
        const content = document.getElementById('metadataContent');
        if (content && content.children.length > 0) {
          // Il contenitore esiste già: basta aggiornare i valori
          if (typeof updateMetadataValues === 'function') updateMetadataValues(targetChannel);
        } else {
          // Prima apertura: costruisci l'intera griglia di metadati
          if (typeof showChannelMetadata === 'function') showChannelMetadata(targetChannel);
        }
      }
    });

  // 7. GESTIONE ERRORI
  } catch (error) {
    // Se nel frattempo è partito un altro canale, l'errore non ci riguarda:
    // non toccare la UI del player (che ora è di un altro canale) e non
    // mostrare notifiche.
    if (isStaleRequest(myRequestId)) return;

    console.error("Errore nella riproduzione:", error);
    document.getElementById('playerContainer')?.classList.remove('loading');
    if (typeof showNotification === 'function')
      showNotification("Errore nella riproduzione del canale", true);
    if (typeof showChannelList === 'function') showChannelList();
  }
}