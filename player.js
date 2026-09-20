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

function cleanupPlayers({ keepVideoVisible = true, preserveHLS = false } = {}) {
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

  // Pulizia HLS.js
  if (!preserveHLS && window.hlsInstance) {
    try {
      window.hlsInstance.stopLoad();
      window.hlsInstance.detachMedia();
      window.hlsInstance.destroy();
    } catch (e) {}
    window.hlsInstance = null;
  }

  // Reset tag <video>
  if (video) {
    try {
      video.pause();
      video.removeAttribute('src');
      video.removeAttribute('crossorigin');
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
  cleanupPlayers({ keepVideoVisible: false, preserveHLS: false });

  const audio = getSharedAudioPlayer();
  
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
    hls.loadSource(url);
    hls.attachMedia(audio);
    
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
  } else {
    audio.src = url;
    playWhenReady(audio, requestId, "Native audio");
  }
}

// ---------------------------------------------------------------------------
// Riproduzione video
// ---------------------------------------------------------------------------

let dashRetryTimer = null; 

async function playVideoStream(url, requestId = ++playStreamRequestId) {
  if (isStaleRequest(requestId)) return;

  const video = document.getElementById('player');
  const lowerUrl = url.toLowerCase();
  const isSafariIOS = /iP(hone|od|ad).+Version\/\d+.+Safari/i.test(navigator.userAgent);
  const isHLS = lowerUrl.includes('.m3u8') || /\.m3u8(\?|&|$)/i.test(url);
  const isDASH = lowerUrl.endsWith('.mpd') || lowerUrl.includes('.mpd?');
  const isMp4OrMov = lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mov');

  cleanupPlayers({ keepVideoVisible: true, preserveHLS: false });
  video.removeAttribute('crossorigin');
  clearTimeout(dashRetryTimer);

  const autoFullscreen = localStorage.getItem('zappone_auto_fullscreen') !== 'false';
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

  // Gestione esatta dello Spinner di caricamento legata al motore nativo
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
    video.setAttribute('crossorigin', 'anonymous');

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
            video.removeAttribute('crossorigin');
            video.src = url;
            playWhenReady(video, requestId, "Fallback DASH");
          }
        });

        // dash.js applica l'autoplay nativamente (3° parametro true)
        player.initialize(video, url, true);
      } catch (err) { console.error('DASH fatal:', err); }
    };

    createAndInitDash();
    return;
  }

  // --- C) HLS.js ---
  if (typeof Hls !== 'undefined' && Hls.isSupported() && isHLS) {
    const hls = new Hls({
      enableWorker: !isSafariIOS,
      backBufferLength: 30,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      liveSyncDurationCount: 3,
      startLevel: -1 // Previene rapidi e costosi salti di bitrate al primo avvio
    });
    window.hlsInstance = hls;
    hls.attachMedia(video);
    
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (isStaleRequest(requestId)) return;
      hls.loadSource(url);
    });
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (isStaleRequest(requestId)) return;
      // Affidiamo l'avvio alla conferma di sufficienza dati del browser
      playWhenReady(video, requestId, "HLS.js");
    });

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

    hls.on(Hls.Events.ERROR, (event, data) => {
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
    });

    return;
  }

  // --- D) MP4/MOV con Anti-Freeze Avanzato ---
  if (isMp4OrMov) {
    let freezeTimer = null;
    const currentUrl = url;
    const resetFreezeTimer = () => { if (freezeTimer) { clearTimeout(freezeTimer); freezeTimer = null; } };

    video.onwaiting = () => {
      if (isStaleRequest(requestId)) return;
      document.getElementById('playerContainer')?.classList.add('loading');
      resetFreezeTimer();
      freezeTimer = setTimeout(() => {
        if (isStaleRequest(requestId)) return;
        if (!video.paused) {
          console.warn("Anti-Freeze: Restarting MP4...");
          const savedTime = video.currentTime;
          video.src = ""; video.load(); video.src = currentUrl;
          video.currentTime = savedTime;
          playWhenReady(video, requestId, "Anti-Freeze Restart");
        }
      }, 3000);
    };
    
    video.onplaying = () => {
      if (isStaleRequest(requestId)) return;
      document.getElementById('playerContainer')?.classList.remove('loading');
      resetFreezeTimer();
    };
    
    video.onpause = resetFreezeTimer;

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
  }, 0);

  const playerContainer = document.getElementById('playerContainer');

  requestAnimationFrame(() => {
    document.getElementById('channelListContainer').style.display = 'none';
    playerContainer.style.display = 'block';
    playerContainer.classList.add('loading');
    
    const bottomTabBar = document.getElementById('bottomTabBar');
    if (bottomTabBar) bottomTabBar.classList.add('hidden');
  });

  updateChannelInfoUI(targetChannel);

  const showMetadataEnabled = localStorage.getItem("zappone_show_metadata") !== "false";
  const metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';
  const showEPGEnabled = localStorage.getItem("zappone_show_epg") !== "false";

  const mc = document.getElementById('metadataContainer');
  if (mc) {
    if (metadataExpanded) {
      mc.style.display = 'block'; mc.classList.add('expanded');
    } else {
      mc.style.display = 'none'; mc.classList.remove('expanded');
    }
  }

  if (showMetadataEnabled) {
    const mh = document.getElementById('metadataHeader');
    if (mh) mh.style.display = "flex";
  }

  if (showMetadataEnabled && metadataExpanded) {
    const content = document.getElementById('metadataContent');
    if (content && content.children.length > 0) {
      if (typeof updateMetadataValues === 'function') updateMetadataValues(targetChannel);
    } else {
      if (typeof showChannelMetadata === 'function') showChannelMetadata(targetChannel);
    }
  }

  if (showEPGEnabled && typeof showChannelEPG === 'function') {
    showChannelEPG(targetChannel);
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
    
    // NOTA BENE: Non rimuoviamo più playerContainer.classList.remove('loading') qui!
    // Ora ci pensano gli eventi video.onplaying / video.onwaiting ad agire in modo preciso.

    updateNavButtons(fromFavorites);

  } catch (error) {
    if (isStaleRequest(myRequestId)) return;
    console.error("Errore nella riproduzione:", error);
    document.getElementById('playerContainer')?.classList.remove('loading');
    if (typeof showNotification === 'function')
      showNotification("Errore nella riproduzione del canale", true);
    if (typeof showChannelList === 'function') showChannelList();
  }
}