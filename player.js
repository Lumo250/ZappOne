// ============================================================================
// player.js – Riproduzione audio/video e gestione del player
//
// Funzioni esportate globalmente:
//   updateChannelInfoUI(channel)
//   navigateChannels(direction, fromFavorites)
//   playStream(channel, fromFavorites)
//
// Tutte le altre funzioni sono helper interni al modulo player.
// ============================================================================

// ---------------------------------------------------------------------------
// Helpers per il tipo di stream
// ---------------------------------------------------------------------------

/**
 * Verifica se l'URL di un canale punta a uno stream solo audio.
 * Salva il risultato in streamTypeCache (globale) per accesso rapido.
 * @param {Object} channel - Oggetto canale { url }
 * @returns {Promise<boolean>}
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
 * Avvia la riproduzione di un elemento <video> o <audio> ignorando l'AbortError
 * generato da un rapido cambio di sorgente.
 * @param {HTMLMediaElement} mediaEl
 * @param {string} label - Etichetta per i log
 */
function safePlay(mediaEl, label = "media") {
  if (!mediaEl) return;
  mediaEl.play().catch(err => {
    if (err.name === "AbortError") {
      console.debug(`${label} play interrotto da un nuovo load (AbortError), ignoro.`);
    } else {
      console.error(`${label} play failed:`, err);
    }
  });
}

// ---------------------------------------------------------------------------
// Interfaccia utente del player
// ---------------------------------------------------------------------------

/**
 * Mostra/nasconde gli elementi dell'interfaccia in base al tipo di stream.
 * Nasconde la lista canali e l'header, mostra il player.
 * @param {boolean} isAudio - true se lo stream è solo audio
 */
function toggleUIElementsForStreamType(isAudio) {
  document.getElementById('channelListContainer').style.display = 'none';
  document.getElementById('playerContainer').style.display = 'block';
  document.getElementById('bottomTabBar')?.classList.add('hidden');
  document.querySelector('.main-header')?.classList.add('hidden');
  document.getElementById('controls')?.classList.add('hidden');

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

/**
 * Aggiorna la barra informativa del canale corrente (logo, nome, gruppo).
 * @param {Object} channel
 */
function updateChannelInfoUI(channel) {
  document.getElementById('currentChannelLogo').src = channel.logo || '';
  document.getElementById('currentChannelName').textContent = channel.name;
  document.getElementById('currentChannelGroup').textContent = channel.group;
}

/**
 * Abilita/disabilita i pulsanti precedente/successivo in base all'indice corrente.
 * @param {boolean} fromFavorites - true se stiamo navigando tra i preferiti
 */
function updateNavButtons(fromFavorites = false) {
  if (fromFavorites) {
    document.getElementById('prevBtn').disabled = currentFavoriteIndex <= 0;
    document.getElementById('nextBtn').disabled = currentFavoriteIndex >= favoriteChannels.length - 1;
  } else {
    const displayList = getCurrentDisplayList();
    document.getElementById('prevBtn').disabled = currentChannelIndex <= 0;
    document.getElementById('nextBtn').disabled = currentChannelIndex >= displayList.length - 1;
  }
}

// ---------------------------------------------------------------------------
// Pulizia del player (HLS, DASH, audio/video)
// ---------------------------------------------------------------------------

/**
 * Distrugge in modo sicuro l'istanza Hls.js corrente.
 * Utile per cleanup forzato (ad esempio Hard Reset).
 */
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
    try { window.hlsInstance.destroy(); } catch (e) { console.warn('hls destroy failed', e); }
  } catch (e) {
    console.warn('cleanupHlsInstance error', e);
    try { window.hlsInstance.destroy(); } catch (_) {}
  } finally {
    window.hlsInstance = null;
  }
}

/**
 * Distrugge qualsiasi player attivo (HLS, DASH, <audio>).
 * @param {Object} options - { keepVideoVisible, preserveHLS }
 */
function cleanupPlayers({ keepVideoVisible = true, preserveHLS = false } = {}) {
  const video = document.getElementById("player");
  const wrapper = document.getElementById("videoWrapper");

  // DASH.js
  if (window.dashPlayer) {
    try {
      window.dashPlayer.attachSource(null);
      window.dashPlayer.attachView(null);
      window.dashPlayer.reset();
    } catch (e) {}
    window.dashPlayer = null;
  }

  // HLS.js (a meno che non venga preservato)
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

  // Rimuove il player <audio> creato dinamicamente
  const oldAudio = document.getElementById("audioPlayer");
  if (oldAudio) {
    try {
      oldAudio.pause();
      oldAudio.src = "";
      oldAudio.load();
    } catch (e) {}
    oldAudio.remove();
  }
}

// ---------------------------------------------------------------------------
// Riproduzione audio
// ---------------------------------------------------------------------------

/**
 * Avvia lo streaming audio (HTML5 o HLS).
 * @param {string} url - URL dello stream
 */
async function playAudioStream(url) {
  const playerContainer = document.getElementById('playerContainer');
  cleanupPlayers({ keepVideoVisible: false, preserveHLS: false });

  const audio = document.createElement("audio");
  audio.id = "audioPlayer";
  audio.controls = true;
  audio.autoplay = true;
  audio.style.width = "100%";
  audio.style.margin = "10px 0 25px 0";
  audio.style.display = "block";

  const lowerUrl = url.toLowerCase();
  const isHLS = lowerUrl.endsWith(".m3u8") || lowerUrl.includes("m3u8");

  if (isHLS && typeof Hls !== 'undefined' && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, maxBufferLength: 30, maxMaxBufferLength: 60 });
    window.hlsInstance = hls;
    hls.loadSource(url);
    hls.attachMedia(audio);
    hls.on(Hls.Events.MANIFEST_PARSED, () => safePlay(audio, "HLS audio"));
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        try { hls.destroy(); } catch (e) {}
        audio.src = url;
        safePlay(audio, "Audio fallback");
      }
    });
  } else {
    audio.src = url;
    safePlay(audio, "Native audio");
  }

  playerContainer.insertBefore(audio, playerContainer.querySelector(".player-controls"));

  audio.onplaying = () => {
    playerContainer.classList.remove("loading");
    audio.dataset.started = "true";
  };

  audio.onerror = () => {
    playerContainer.classList.remove("loading");
    if (audio.dataset.started === "true") return;   // già partito, glitch momentaneo
    if (audio.error && audio.error.code === 4) return; // AbortError
    console.error("Errore streaming audio reale");
    if (typeof showNotification === 'function') showNotification('Canale audio non disponibile', true);
  };
}

// ---------------------------------------------------------------------------
// Riproduzione video
// ---------------------------------------------------------------------------

/**
 * Avvia lo streaming video (HTML5, HLS, DASH) con gestione degli errori.
 * @param {string} url - URL dello stream video
 */
async function playVideoStream(url) {
  const video = document.getElementById('player');
  const lowerUrl = url.toLowerCase();
  const isSafariIOS = /iP(hone|od|ad).+Version\/\d+.+Safari/i.test(navigator.userAgent);
  const isHLS = lowerUrl.includes('.m3u8') || /\.m3u8(\?|&|$)/i.test(url);
  const isDASH = lowerUrl.endsWith('.mpd') || lowerUrl.includes('.mpd?');
  const isMp4OrMov = lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mov');

  // Reset completo
  cleanupPlayers({ keepVideoVisible: true, preserveHLS: false });
  video.removeAttribute('crossorigin');
  video.onwaiting = null;
  video.onplaying = null;
  video.onpause = null;

  // Fullscreen automatico (iOS)
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

  // --- A) Safari iOS nativo HLS ---
  if (isSafariIOS && isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    safePlay(video, "Safari HLS");
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
          if (e.error && e.error.message && e.error.message.includes('SourceBuffer')) return;
          console.error('DASH error:', e);
          dashRetries++;
          if (dashRetries <= DASH_MAX_RETRIES) {
            try { player.attachView(null); player.reset(); } catch (_) {}
            setTimeout(() => createAndInitDash(), DASH_RETRY_DELAY_MS);
          } else {
            if (typeof showNotification === 'function') showNotification('Errore DASH (fallback)', true);
            video.removeAttribute('crossorigin');
            video.src = url;
            safePlay(video, "Fallback");
          }
        });

        player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          safePlay(video, "DASH");
        });

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
      lowLatencyMode: true,
      backBufferLength: 30
    });
    window.hlsInstance = hls;
    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url));
    hls.on(Hls.Events.MANIFEST_PARSED, () => safePlay(video, "HLS.js"));
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else { hls.destroy(); if (typeof showNotification === 'function') showNotification('Errore HLS', true); }
      }
    });
    return;
  }

  // --- D) MP4/MOV con Anti-Freeze ---
  if (isMp4OrMov) {
    let freezeTimer = null;
    const currentUrl = url;
    const resetFreezeTimer = () => { if (freezeTimer) { clearTimeout(freezeTimer); freezeTimer = null; } };

    video.onwaiting = () => {
      resetFreezeTimer();
      freezeTimer = setTimeout(() => {
        if (!video.paused) {
          console.warn("Anti-Freeze: Restarting MP4...");
          const savedTime = video.currentTime;
          video.src = ""; video.load(); video.src = currentUrl;
          video.currentTime = savedTime;
          safePlay(video, "Anti-Freeze Restart");
        }
      }, 3000);
    };
    video.onplaying = resetFreezeTimer;
    video.onpause = resetFreezeTimer;

    video.src = currentUrl;
    safePlay(video, "Native MP4");
    return;
  }

  // --- E) Fallback generico ---
  video.src = url;
  safePlay(video, "Generic Native");
}

// ---------------------------------------------------------------------------
// Navigazione tra i canali (precedente / successivo)
// ---------------------------------------------------------------------------

/**
 * Passa al canale precedente o successivo.
 * @param {'prev'|'next'} direction
 * @param {boolean} fromFavorites - true se stiamo navigando tra i preferiti
 */
function navigateChannels(direction, fromFavorites = false) {
  const displayList = fromFavorites ? favoriteChannels : getCurrentDisplayList();
  let currentIndex = fromFavorites ? currentFavoriteIndex : currentChannelIndex;

  // Ripristina l'indice se non è più valido
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

  // Aggiorna l'indice globale corretto
  if (fromFavorites) currentFavoriteIndex = newIndex;
  else currentChannelIndex = newIndex;

  playStream(displayList[newIndex], fromFavorites);
}

// ---------------------------------------------------------------------------
// Riproduzione principale (orchestratore)
// ---------------------------------------------------------------------------

/**
 * Avvia la riproduzione di un canale (audio o video), gestisce UI, metadati,
 * EPG, e navigazione.
 * @param {Object} channel - Oggetto canale { name, url, group, logo }
 * @param {boolean} fromFavorites - true se proviene dalla lista preferiti
 */
async function playStream(channel, fromFavorites = false) {
  const key = getChannelKey(channel);

  // ---- 1. Individua l'indice nella lista corretta (O(1) tramite mappe) ----
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

  // ---- 2. Salva lo stato globale e l'ultimo canale riprodotto ----
  window.currentChannelUrl = key;
  localStorage.setItem("zappone_last_played", targetChannel.url);
  localStorage.setItem("zappone_last_played_from_favorites", fromFavorites.toString());

  const playerContainer = document.getElementById('playerContainer');

  // ---- 3. Transizione UI immediata (non bloccante) ----
  requestAnimationFrame(() => {
    document.getElementById('channelListContainer').style.display = 'none';
    playerContainer.style.display = 'block';
    playerContainer.classList.add('loading');
    document.getElementById('bottomTabBar')?.classList.add('hidden');
  });

  updateChannelInfoUI(targetChannel);

  // ---- 4. Metadati e EPG in base alle preferenze ----
  const showMetadataEnabled = localStorage.getItem("zappone_show_metadata") !== "false";
  const metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';
  const showEPGEnabled = localStorage.getItem("zappone_show_epg") !== "false";

  if (metadataExpanded) {
    const mc = document.getElementById('metadataContainer');
    if (mc) { mc.style.display = 'block'; mc.classList.add('expanded'); }
  } else {
    const mc = document.getElementById('metadataContainer');
    if (mc) { mc.style.display = 'none'; mc.classList.remove('expanded'); }
  }

  if (showMetadataEnabled) {
    const mh = document.getElementById('metadataHeader');
    if (mh) mh.style.display = "flex";
  }

  if (showMetadataEnabled && metadataExpanded) {
    const mc = document.getElementById('metadataContent');
    if (mc && mc.children.length > 0) {
      if (typeof updateMetadataValues === 'function') updateMetadataValues(targetChannel);
    } else {
      if (typeof showChannelMetadata === 'function') showChannelMetadata(targetChannel);
    }
  }

  if (showEPGEnabled && typeof showChannelEPG === 'function') {
    showChannelEPG(targetChannel);
  }

  // ---- 5. Avvia lo stream (audio o video) ----
  try {
    const isRadioMode = document.getElementById('radioToggle')?.checked;
    let isAudioChannel = isRadioMode;

    if (!isRadioMode) {
      // Riutilizza isAudioStream per evitare duplicazione della cache
      isAudioChannel = await isAudioStream(targetChannel);
    }

    toggleUIElementsForStreamType(isAudioChannel);

    if (isAudioChannel) {
      await playAudioStream(targetChannel.url);
    } else {
      await playVideoStream(targetChannel.url);
    }

    playerContainer.classList.remove('loading');
    updateNavButtons(fromFavorites);

  } catch (error) {
    console.error("Errore nella riproduzione:", error);
    playerContainer.classList.remove('loading');
    if (typeof showNotification === 'function')
      showNotification("Errore nella riproduzione del canale", true);
    if (typeof showChannelList === 'function') showChannelList();
  }
}