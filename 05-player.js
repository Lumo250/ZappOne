// ============================================================================
// player.js – Riproduzione audio/video e gestione del player (V3 - Anti-Freeze Avanzato)
//
// Funzioni esportate globalmente:
//   updateChannelInfoUI(channel)
//   navigateChannels(direction, fromFavorites)
//   playStream(channel, fromFavorites)
//
// [REWRITE 2026] Fix inclusi:
//   • cleanupHlsInstance: window.hlsInstance azzerato PRIMA del detach
//     (elimina il race hlsCanBeReused durante il detach)
//   • [CLEANUP-ZERO-WAIT] cleanupHlsInstance è ora SINCRONA: detachMedia()
//     rilascia il video element in modo sincrono, l'evento MEDIA_DETACHED
//     è una notifica e non un prerequisito. Il vecchio `await` con timeout
//     150ms veniva pagato per intero ad ogni zapping non-reuse (HLS→altro
//     tipo, HLS→HLS non riusabile, toggle EQ), dominando la latenza di
//     cambio canale. Ora il cleanup è zero-wait.
//   • getVisibleNav: scansione DOM solo se !filtersOff && domMatchesView
//   • _mp4TryRecover livello 2: seek dopo loadedmetadata (non perso)
//   • playWhenReady: distingue pausa utente da pausa programmatica
//   • beginPlaybackSession: accetta anche context = channel object (legacy)
//
// NOTA: per completare il fix di beginPlaybackSession serve modificare i
// chiamanti in zappone.js (`item.onclick`, `tabRenderBtn`) passando
// esplicitamente `{ channel, fromFavorites }`. Qui la funzione è
// difensiva ma non può indovinare il canale.
// ============================================================================



// ---------------------------------------------------------------------------
// Stato watchdog MP4 — a livello di modulo, non più per chiamata.
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

// [REWRITE] Contatore per distinguere pause programmatiche (da noi) da
// pause utente. `playWhenReady` lo consulta via listener 'pause'.
// `cleanupPlayers` e `_mp4TryRecover` (livelli 2 e 4) lo incrementano
// PRIMA di chiamare video.pause()/video.load(). Il decremento avviene
// dopo 200 ms, finestra sufficiente perché l'evento 'pause' (queued)
// venga processato prima del reset.
let _programmaticPauseTimer = 0;
function _markProgrammaticPause() {
  _programmaticPauseTimer++;
  setTimeout(() => {
    if (_programmaticPauseTimer > 0) _programmaticPauseTimer--;
  }, 200);
}

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
    // [REWRITE] Fix: il vecchio codice settava `video.currentTime = saved`
    // subito dopo `video.src = current`, quando readyState è 0: il seek
    // veniva ignorato/clampato a 0 e lo stream ripartiva da capo.
    // Ora il seek avviene su 'loadedmetadata' (quando readyState >= 1),
    // stessa strategia del livello 4.
    const current = video.src;
    const restoreSeek = () => {
      video.removeEventListener('loadedmetadata', restoreSeek);
      if (isStaleRequest(_mp4RequestId)) return;
      try { if (saved > 0) video.currentTime = saved; } catch (e) {}
    };
    video.addEventListener('loadedmetadata', restoreSeek, { once: true });
    _markProgrammaticPause();
    video.src = '';
    video.src = current;
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
  _markProgrammaticPause();
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
// PlaybackSession — modello esplicito del contesto di riproduzione
// ---------------------------------------------------------------------------
let _playbackSession = null;

function beginPlaybackSession(origin, navList, context = {}) {
  // [REWRITE] Difesa: se il chiamante passa direttamente il canale come
  // 3° argomento (vecchia signature) lo trattiamo come context.channel.
  // Non è il fix vero (i chiamanti in zappone.js devono passare
  // `{ channel, fromFavorites }`), ma evita che il contratto dichiarato
  // venga violato silenziosamente per future chiamate.
  let ctx = context;
  if (ctx && typeof ctx === 'object' && ctx.url && ctx.name && !ctx.channel) {
    ctx = { channel: ctx, fromFavorites: false };
  }

  _playbackSession = { origin, navList, context: ctx, startedAt: Date.now() };

  window.playbackSource = (navList === 'feg') ? 'fullEpgGrid' : navList;

  if (window.PlaybackStore) {
    window.PlaybackStore.set({
      channel:       ctx.channel || null,
      channelKey:    ctx.channel ? getChannelKey(ctx.channel) : null,
      epgRef:        ctx.epgChannel
                       ? window.PlaybackStore.makeEpgRef(ctx.epgChannel)
                       : null,
      origin:        origin,
      navList:       navList,
      fromFavorites: !!ctx.fromFavorites,
      startedAt:     Date.now(),
    });
  }

  return _playbackSession;
}

function getPlaybackSession() { return _playbackSession; }
function clearPlaybackSession() { _playbackSession = null; }

// ---------------------------------------------------------------------------
// Lista di navigazione (canali visibili) con cache
// ---------------------------------------------------------------------------
const _navCache = { main: null, fav: null };
let _navDomObserver = null;

function invalidateVisiblePlaylistCache() {
  _navCache.main = null;
  _navCache.fav = null;
}

function _ensureNavObserver() {
  if (_navDomObserver || typeof MutationObserver === 'undefined') return;
  const container = document.getElementById('channelList');
  if (!container) return;
  _navDomObserver = new MutationObserver(invalidateVisiblePlaylistCache);
  _navDomObserver.observe(container, { childList: true, subtree: true });
}

/**
 * Restituisce { list, indexOf, ... } per la navigazione prev/next.
 *
 * @param {boolean} fromFavorites
 */
function getVisibleNav(fromFavorites) {
  const sourceList = fromFavorites ? favoriteChannels : channels;
  const slot = fromFavorites ? 'fav' : 'main';
  _ensureNavObserver();

  const cached = _navCache[slot];
  if (cached && cached.source === sourceList &&
      cached.sourceLen === sourceList.length &&
      cached.favSize === favoriteKeys.size) {
    return cached;
  }

  let list = sourceList;

  const filtersOff = (typeof isAnySearchFilterActive === 'function') && !isAnySearchFilterActive();
  const domMatchesView = (fromFavorites === !!showingFavorites);

  // [REWRITE] Fix: scansionare il DOM solo quando i dati del DOM sono
  // affidabili. Se il DOM mostra un'altra vista (utente ha cambiato
  // showingFavorites ma il rendering non è ancora avvenuto), la scansione
  // restituirebbe canali dell'altra lista. Se non ci sono filtri attivi,
  // tutte le righe sono visibili e non c'è nulla da scansionare.
  // Condizione corretta: !filtersOff && domMatchesView.
  const container = document.getElementById('channelList');
  if (container && !filtersOff && domMatchesView) {
    const indexMap = fromFavorites ? favoriteIndexMap : channelIndexMap;
    let keyToChannel = null;
    const visible = [];
    const items = container.querySelectorAll('.channel-item');
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.style.display === 'none') continue;
      if (item.classList.contains('filter-hidden')) continue;
      const key = item.getAttribute('data-key');

      if (!key) continue;
      const idx = indexMap.get(key);
      let ch = idx !== undefined ? sourceList[idx] : undefined;
      if (!ch || getChannelKey(ch) !== key) {
        if (!keyToChannel) {
          keyToChannel = new Map();
          sourceList.forEach(c => keyToChannel.set(getChannelKey(c), c));
        }
        ch = keyToChannel.get(key);
      }
      if (ch) visible.push(ch);
    }
    if (visible.length > 0) list = visible;
  }

  let indexOf = null;
  if (list !== sourceList) {
    indexOf = new Map();
    for (let i = 0; i < list.length; i++) {
      if (!indexOf.has(list[i])) indexOf.set(list[i], i);
    }
  }
  const entry = { list, indexOf, source: sourceList, sourceLen: sourceList.length, favSize: favoriteKeys.size };
  _navCache[slot] = entry;
  return entry;
}

function getVisiblePlaylist(fromFavorites) {
  return getVisibleNav(fromFavorites).list;
}

function _navIndexOfKey(nav, fromFavorites, key) {
  const source = fromFavorites ? favoriteChannels : channels;
  const map = fromFavorites ? favoriteIndexMap : channelIndexMap;
  let fullIndex = map.get(key);
  if (fullIndex === undefined || !source[fullIndex] || getChannelKey(source[fullIndex]) !== key) {
    fullIndex = source.findIndex(c => getChannelKey(c) === key);
  }
  if (fullIndex === -1) return { index: -1, fullIndex: -1 };
  if (nav.indexOf === null) return { index: fullIndex, fullIndex };
  const pos = nav.indexOf.get(source[fullIndex]);
  return { index: pos === undefined ? -1 : pos, fullIndex };
}

function _runWhenIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 600 });
  else setTimeout(fn, 150);
}




// ---------------------------------------------------------------------------
// Equalizzatore: aggancio condizionale della catena Web Audio
// ---------------------------------------------------------------------------
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
 * Attende il caricamento del primo fotogramma (readyState >= 2)
 * per massimizzare la velocità dello zapping.
 *
 * [REWRITE] Aggiunto listener 'pause': se l'utente mette in pausa PRIMA
 * che `playing` sia scattato (stream lenti, caching iniziale), il timeout
 * di 1.5s non forza più il play. Distinguiamo pausa utente da pausa
 * programmatica tramite `_programmaticPauseTimer`, incrementato da
 * `cleanupPlayers` e `_mp4TryRecover` prima di pause()/load().
 */
function playWhenReady(mediaEl, requestId, label = "media") {
  let started = false;
  let userPaused = false;
  const attemptPlay = () => {
    if (isStaleRequest(requestId)) return;
    safePlay(mediaEl, label);
  };
  const markStarted = () => { started = true; };
  const markUserPaused = () => {
    if (_programmaticPauseTimer > 0) return;
    if (!started) userPaused = true;
  };

  if (mediaEl.readyState >= 2) {
    attemptPlay();
    return;
  }

  mediaEl.addEventListener('playing', markStarted, { once: true });
  mediaEl.addEventListener('pause', markUserPaused);

  const onLoadedData = () => {
    mediaEl.removeEventListener('loadeddata', onLoadedData);
    attemptPlay();
  };
  mediaEl.addEventListener('loadeddata', onLoadedData);

  setTimeout(() => {
    mediaEl.removeEventListener('loadeddata', onLoadedData);
    mediaEl.removeEventListener('playing', markStarted);
    mediaEl.removeEventListener('pause', markUserPaused);
    if (isStaleRequest(requestId)) return;
    if (!started && mediaEl.paused && !userPaused) attemptPlay();
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

function updateNavButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (!prevBtn || !nextBtn) return;

    const backBtn = document.getElementById('backButton');

    const session = getPlaybackSession();
    const navList = session
        ? session.navList
        : (showingFavorites ? 'favorites' : 'channels');

    if (navList === 'feg' && typeof getFegPlaybackNav === 'function') {


        const nav = getFegPlaybackNav();
        const cur = nav.currentIndex;
        const session = getPlaybackSession();
        const isGridOrigin = !session || session.origin === 'fullEpgGrid';

        prevBtn.disabled = cur <= 0;
        nextBtn.disabled = cur === -1 || cur >= nav.list.length - 1;
        prevBtn.title = isGridOrigin
            ? 'Programma precedente (palinsesto)'
            : 'Canale precedente (guida canali)';
        nextBtn.title = isGridOrigin
            ? 'Programma successivo (palinsesto)'
            : 'Canale successivo (guida canali)';
        if (backBtn) {
            backBtn.classList.remove('back-filtered');
            backBtn.classList.add('back-epg');
            backBtn.title = isGridOrigin
                ? 'Torna al palinsesto'
                : 'Torna alla guida canali';
        }
        return;
    }

    const fromFavorites = (navList === 'favorites');
    const key = window.currentChannelUrl;
    const fullList = fromFavorites ? favoriteChannels : channels;

    const nav = getVisibleNav(fromFavorites);
    const visibleList = nav.list;
    const cur = _navIndexOfKey(nav, fromFavorites, key);

    const isShorter = visibleList.length < fullList.length;
    const currentIndex = cur.index;
    const navigatingFiltered = isShorter && currentIndex !== -1;

    if (currentIndex === -1) {
        const fallbackIndex = cur.fullIndex;
        if (fallbackIndex === -1) {
            prevBtn.disabled = true;
            nextBtn.disabled = true;
        } else {
            prevBtn.disabled = fallbackIndex <= 0;
            nextBtn.disabled = fallbackIndex >= fullList.length - 1;
        }
    } else {
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= visibleList.length - 1;
    }

    if (navigatingFiltered) {
        prevBtn.title = 'Canale precedente (lista filtrata)';
        nextBtn.title = 'Canale successivo (lista filtrata)';
    } else {
        prevBtn.title = 'Precedente';
        nextBtn.title = 'Successivo';
    }

    if (backBtn) {
        backBtn.classList.remove('back-epg');
        backBtn.classList.toggle('back-filtered', navigatingFiltered);
        backBtn.title = 'Torna alla lista';
    }
}

// ---------------------------------------------------------------------------
// Pulizia del player (HLS, DASH, audio/video)
// ---------------------------------------------------------------------------

// [CLEANUP-ZERO-WAIT] cleanupHlsInstance è ora SINCRONA.
//
// Razionale tecnico:
//   - `hls.detachMedia()` in HLS.js è sincrono: quando ritorna, il
//     media element è già libero (src revocato, source buffer staccati,
//     listener DOM rimossi). Non c'è lavoro asincrono da attendere.
//   - `Hls.Events.MEDIA_DETACHED` è una NOTIFICA emessa dopo il detach,
//     non un prerequisito: ascoltarla introduce solo latenza.
//   - `hls.destroy()` fa già `stopLoad` + `detachMedia` internamente,
//     ed è fire-and-forget: la sua parte asincrona (terminazione del
//     worker interno) non riguarda il video element, che è già libero.
//
// L'await con timeout 150ms del vecchio codice veniva pagato per intero
// su OGNI zapping non-reuse (HLS→MP4, HLS→audio, HLS→HLS con crossorigin
// cambiato, toggle EQ). Era uno dei tre collo di bottiglia più severi.
//
// Ora: zero attesa. `window.hlsInstance` è azzerato PRIMA del detach,
// così un eventuale play concorrente (race di zapping) non riusa
// un'istanza in fase di distruzione.
function cleanupHlsInstance() {
  const hls = window.hlsInstance;
  if (!hls) return;

  // Null PRIMA del detach: chi legge window.hlsInstance durante il
  // cleanup non deve vedere un'istanza in fase di distruzione.
  window.hlsInstance = null;

  try {
    hls.stopLoad();
  } catch (e) {
    console.debug('HLS stopLoad ignorato:', e);
  }
  try {
    hls.detachMedia();
  } catch (e) {
    console.debug('HLS detachMedia ignorato:', e);
  }
  try {
    hls.destroy();
  } catch (e) {
    console.debug('HLS destroy ignorato:', e);
  }
}

async function cleanupPlayers({ keepVideoVisible = true, preserveHLS = false } = {}) {
  const video = document.getElementById("player");
  const wrapper = document.getElementById("videoWrapper");

  if (window.dashPlayer) {
    try {
      window.dashPlayer.attachSource(null);
      window.dashPlayer.attachView(null);
      window.dashPlayer.reset();
    } catch (e) {}
    window.dashPlayer = null;
  }

  if (!preserveHLS && window.hlsInstance) {
    // [CLEANUP-ZERO-WAIT] Chiamata sincrona: nessun await.
    cleanupHlsInstance();
  }

  const eqActive = (typeof isEqEnabled === 'function') && isEqEnabled();

  if (video) {
    try {
      _markProgrammaticPause();
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
      _nativeClearWatchdog();
    } catch (e) {}

    if (!keepVideoVisible) {
      video.style.display = "none";
      if (wrapper) wrapper.style.display = "none";
    } else {
      video.style.display = "block";
      if (wrapper) wrapper.style.display = "block";
    }
  }

  const audioEl = document.getElementById("audioPlayer");
  if (audioEl) {
    try {
      _markProgrammaticPause();
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
  if (isStaleRequest(requestId)) return;

  const audio = getSharedAudioPlayer();

  const eqActive = (typeof isEqEnabled === 'function') && isEqEnabled();
  if (eqActive) {
    audio.setAttribute('crossorigin', 'anonymous');
  }

  maybeEnsureEq(audio, 'audio');

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

function _playHlsSource(hls, video, url, requestId) {
  if (!hls) return;

  if (hls._zapponeHandlers) {
    try { hls.off(Hls.Events.MANIFEST_PARSED, hls._zapponeHandlers.onManifestParsed); } catch (e) {}
    try { hls.off(Hls.Events.ERROR, hls._zapponeHandlers.onError); } catch (e) {}
    hls._zapponeHandlers = null;
  }

  // [REWRITE] Difesa: se veniamo da un percorso nativo, video.onerror
  // potrebbe puntare a _nativeFail. In HLS gli errori passano da
  // hls.on(ERROR), non da video.onerror: azzeriamo per evitare
  // notifiche spurie se il browser setta video.error.
  video.onerror = null;

  video.onwaiting = () => {
    if (isStaleRequest(requestId)) return;
    document.getElementById('playerContainer')?.classList.add('loading');
  };
  video.onplaying = () => {
    if (isStaleRequest(requestId)) return;
    document.getElementById('playerContainer')?.classList.remove('loading');
  };

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


// [FIX 6a] Gestione errori del percorso video "nativo"
const NATIVE_START_TIMEOUT_MS = 20000;
let _nativeStartTimer = null;

function _nativeClearWatchdog() {
  clearTimeout(_nativeStartTimer);
  _nativeStartTimer = null;
}

function _nativeFail(video, requestId, message) {
  if (isStaleRequest(requestId)) return;
  _nativeClearWatchdog();
  document.getElementById('playerContainer')?.classList.remove('loading');
  if (typeof showNotification === 'function') showNotification(message, true);
}

function _armNativeErrorHandling(video, requestId) {
  _nativeClearWatchdog();

  video.onerror = () => {
    const code = video.error && video.error.code;
    if (code === 1) return;
    _nativeFail(video, requestId, 'Impossibile riprodurre questo canale (stream non disponibile o formato non supportato)');
  };

  video.addEventListener('playing', _nativeClearWatchdog, { once: true });

  _nativeStartTimer = setTimeout(() => {
    if (isStaleRequest(requestId)) return;
    if (video.readyState >= 3 && !video.paused) return;
    _nativeFail(video, requestId, 'Il canale non risponde: riprova o scegline un altro');
  }, NATIVE_START_TIMEOUT_MS);
}

async function playVideoStream(url, requestId = ++playStreamRequestId) {
  if (isStaleRequest(requestId)) return;

  const video = document.getElementById('player');
  const lowerUrl = url.toLowerCase();
  const isSafariIOS = /iP(hone|od|ad).+Version\/\d+.+Safari/i.test(navigator.userAgent);
  const isHLS = lowerUrl.includes('.m3u8') || /\.m3u8(\?|&|$)/i.test(url);
  const isDASH = lowerUrl.endsWith('.mpd') || lowerUrl.includes('.mpd?');
  const isMp4OrMov = lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mov');

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
    _playHlsSource(window.hlsInstance, video, url, requestId);
    return;
  }

  await cleanupPlayers({ keepVideoVisible: true, preserveHLS: false });

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
    _armNativeErrorHandling(video, requestId);
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

  // --- C) HLS.js (istanza fresca) ---
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
    hls._zapponeAttachedVideo = video;

    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (isStaleRequest(requestId)) return;
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

    _armNativeErrorHandling(video, requestId);
    video.src = currentUrl;
    playWhenReady(video, requestId, "Native MP4");
    return;
  }

  // --- E) Fallback generico ---
  _armNativeErrorHandling(video, requestId);
  video.src = url;
  playWhenReady(video, requestId, "Generic Native");
}


// ---------------------------------------------------------------------------
// Navigazione tra i canali (precedente / successivo)
// ---------------------------------------------------------------------------

function navigateChannels(direction) {
    const session = getPlaybackSession();
    const navList = session
        ? session.navList
        : (showingFavorites ? 'favorites' : 'channels');

    if (navList === 'feg' && typeof getFegPlaybackNav === 'function') {
        const nav = getFegPlaybackNav();
        if (!nav.list.length || nav.currentIndex === -1) return;
        const newIndex = direction === 'next'
            ? nav.currentIndex + 1
            : nav.currentIndex - 1;
        if (newIndex < 0 || newIndex >= nav.list.length) return;
        const target = nav.list[newIndex];

        if (session && session.context) {
            session.context.epgChannel    = target.epgChannel;
            session.context.channel       = target.channel;
            session.context.playlistKey   = getChannelKey(target.channel);
            session.context.fromFavorites = target.fromFavorites;
        }

        if (window.PlaybackStore) {
            window.PlaybackStore.set({
                channel:       target.channel,
                channelKey:    getChannelKey(target.channel),
                epgRef:        target.epgChannel
                                 ? window.PlaybackStore.makeEpgRef(target.epgChannel)
                                 : null,
                origin:        session ? session.origin : 'fullEpgGrid',
                navList:       'feg',
                fromFavorites: target.fromFavorites,
            });
        }

        showingFavorites = target.fromFavorites;
        if (typeof updateToggleState === 'function') updateToggleState();

        playStream(target.channel, target.fromFavorites);
        return;
    }

    const fromFavorites = (navList === 'favorites');
    const nav = getVisibleNav(fromFavorites);
    const visibleList = nav.list;
    if (visibleList.length === 0) return;

    const key = window.currentChannelUrl;
    const cur = _navIndexOfKey(nav, fromFavorites, key);
    let currentIndex = cur.index;

    if (currentIndex === -1) {
        const fallbackList = fromFavorites ? favoriteChannels : channels;
        const fallbackIndex = cur.fullIndex;
        if (fallbackIndex === -1) return;

        const newFallbackIndex = direction === 'next' ? fallbackIndex + 1 : fallbackIndex - 1;
        if (newFallbackIndex < 0 || newFallbackIndex >= fallbackList.length) return;
        playStream(fallbackList[newFallbackIndex], fromFavorites);
        return;
    }

    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0 || newIndex >= visibleList.length) return;
    playStream(visibleList[newIndex], fromFavorites);
}


// ---------------------------------------------------------------------------
// Prefetch del canale successivo
// ---------------------------------------------------------------------------
const _prefetchDone = new Set();

function _prefetchPreconnect(origin) {
  if (!origin) return;
  if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
  const pre = document.createElement('link');
  pre.rel = 'preconnect';
  pre.href = origin;
  pre.crossOrigin = 'anonymous';
  document.head.appendChild(pre);
  const dns = document.createElement('link');
  dns.rel = 'dns-prefetch';
  dns.href = origin;
  document.head.appendChild(dns);
}

function prefetchNextChannel(fromFavorites, requestId) {
  try {
    if (!window.currentChannelUrl) return;
    if (localStorage.getItem('zappone_prefetch') === 'false') return;

    setTimeout(() => {
      try {
        if (isStaleRequest(requestId)) return;

        const key = window.currentChannelUrl;
        const nav = getVisibleNav(fromFavorites);
        const cur = _navIndexOfKey(nav, fromFavorites, key);
        let list = nav.list;
        let currentIndex = cur.index;
        if (currentIndex === -1) {
          list = fromFavorites ? favoriteChannels : channels;
          currentIndex = cur.fullIndex;
        }
        if (currentIndex === -1 || currentIndex >= list.length - 1) return;

        const next = list[currentIndex + 1];
        if (!next || !next.url) return;
        const nextUrl = next.url;

        let origin = null;
        try { origin = new URL(nextUrl).origin; } catch (e) { return; }
        _prefetchPreconnect(origin);

        const lower = nextUrl.toLowerCase();
        const isHLS = lower.includes('.m3u8');
        if (isHLS && !_prefetchDone.has(nextUrl)) {
          _prefetchDone.add(nextUrl);
          fetch(nextUrl, {
            method: 'GET',
            mode: 'no-cors',
            credentials: 'omit',
            cache: 'default',
            priority: 'low'
          }).catch(() => {});
        }
      } catch (e) {
      }
    }, 1500);
  } catch (e) {
  }
}

// ----------------------------------------------------------------------------
// playStream(channel, fromFavorites)
// ----------------------------------------------------------------------------
async function playStream(channel, fromFavorites = false) {

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

  window.currentChannelUrl = key;

  setTimeout(() => {
    localStorage.setItem("zappone_last_played", targetChannel.url);
    localStorage.setItem("zappone_last_played_from_favorites", fromFavorites.toString());

    const session = getPlaybackSession();
    if (session && session.origin) {
      localStorage.setItem("zappone_last_played_origin", session.origin);

      const ctx = session.context || {};
      const epgCh = ctx.epgChannel;

      if ((session.origin === 'fullEpgGrid' || session.origin === 'fullEpgList')
          && epgCh) {
        const ref = epgCh.id
          ? ('id:' + epgCh.id)
          : ('name:' + (epgCh.name || ''));
        localStorage.setItem("zappone_last_played_epg_ref", ref);
      } else {
        localStorage.removeItem("zappone_last_played_epg_ref");
      }
    }
  }, 0);

  const playerContainer = document.getElementById('playerContainer');

  requestAnimationFrame(() => {
    document.getElementById('channelListContainer').style.display = 'none';
    playerContainer.style.display = 'block';

    const bottomTabBar = document.getElementById('bottomTabBar');
    if (bottomTabBar) bottomTabBar.classList.add('hidden');
  });

  updateChannelInfoUI(targetChannel);

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
  } else {
    if (epgHeader)    epgHeader.style.display = 'none';
    if (epgContainer) epgContainer.style.display = 'none';
  }

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
  } else {
    if (mh) mh.style.display = 'none';
    if (mc) {
      mc.style.display = 'none';
      mc.classList.remove('expanded');
    }
  }

  try {
    const radioToggle = document.getElementById('radioToggle');
    const isRadioMode = radioToggle ? radioToggle.checked : false;
    let isAudioChannel = isRadioMode;

    if (!isRadioMode) {
      isAudioChannel = await isAudioStream(targetChannel);
    }

    if (isStaleRequest(myRequestId)) return;

    toggleUIElementsForStreamType(isAudioChannel);

    if (isAudioChannel) {
      await playAudioStream(targetChannel.url, myRequestId);
    } else {
      await playVideoStream(targetChannel.url, myRequestId);
    }

    if (isStaleRequest(myRequestId)) return;

    _runWhenIdle(() => {
      if (!isStaleRequest(myRequestId)) updateNavButtons();
    });

    prefetchNextChannel(fromFavorites, myRequestId);

    requestAnimationFrame(() => {
      if (isStaleRequest(myRequestId)) return;

      if (showEPGEnabled && typeof showChannelEPG === 'function') {
        showChannelEPG(targetChannel);
      }

      if (showMetadataEnabled && metadataExpandedNow) {
        const content = document.getElementById('metadataContent');
        if (content && content.children.length > 0) {
          if (typeof updateMetadataValues === 'function') updateMetadataValues(targetChannel);
        } else {
          if (typeof showChannelMetadata === 'function') showChannelMetadata(targetChannel);
        }
      }
    });

  } catch (error) {
    if (isStaleRequest(myRequestId)) return;

    console.error("Errore nella riproduzione:", error);
    document.getElementById('playerContainer')?.classList.remove('loading');
    if (typeof showNotification === 'function')
      showNotification("Errore nella riproduzione del canale", true);
    if (typeof showChannelList === 'function') showChannelList();
  }
}