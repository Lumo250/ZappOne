// ============================================================================
// player.js – Riproduzione audio/video (V10 - Zapping Estremo GPU-Accelerated)
//
// Funzioni esportate globalmente:
//   updateChannelInfoUI(channel)
//   navigateChannels(direction, fromFavorites)
//   playStream(channel, fromFavorites)
// ============================================================================

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
let playStreamRequestId = 0;
let transitionSafetyTimer = null; 

function isStaleRequest(requestId) {
  return requestId !== playStreamRequestId;
}

// ---------------------------------------------------------------------------
// Helpers per Stream e UI
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
    if (err.name !== "AbortError") console.debug(`${label} play wait:`, err);
  });
}

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
    if (video) video.style.display = 'none';
  } else {
    playerContainer.classList.remove('audio-mode');
    if (video) video.style.display = '';
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
// Transition Engine V10 (GPU-Accelerated, Zero-Reflow, Fast-Capture)
// ---------------------------------------------------------------------------

function captureTransitionFrame(videoEl) {
  if (!videoEl || videoEl.readyState < 2 || videoEl.style.display === 'none') return;
  let canvas = document.getElementById('zappone-transition-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'zappone-transition-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '5'; 
    canvas.style.backgroundColor = 'black';
    // GPU Acceleration: Evita il ricalcolo CSS del layout al momento dello stacco
    canvas.style.willChange = 'opacity';
    
    const wrapper = videoEl.parentElement;
    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.insertBefore(canvas, videoEl);
    }
  }
  
  try {
    // Fast-Capture Downscaling: dimezza la risoluzione per non bloccare la CPU
    const scale = 0.5; 
    canvas.width = Math.max(1, Math.floor(videoEl.videoWidth * scale));
    canvas.height = Math.max(1, Math.floor(videoEl.videoHeight * scale));
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    
    canvas.style.filter = 'brightness(0) grayscale(1)';
    // Invece di usare 'display', usiamo l'opacità gestita dalla scheda video
    canvas.style.display = 'block';
    canvas.style.opacity = '1';

    clearTimeout(transitionSafetyTimer);
    transitionSafetyTimer = setTimeout(() => hideTransitionFrame(), 4000);

  } catch (e) {
    canvas.style.opacity = '0';
  }
}

function hideTransitionFrame() {
  clearTimeout(transitionSafetyTimer);
  const canvas = document.getElementById('zappone-transition-canvas');
  if (canvas) {
    // Stacco netto istantaneo via GPU. Zero ricalcoli di layout.
    canvas.style.opacity = '0'; 
    canvas.style.pointerEvents = 'none'; // Sicurezza aggiuntiva
  }
}

// ---------------------------------------------------------------------------
// Pulizia
// ---------------------------------------------------------------------------

async function cleanupHlsInstance() {
  if (!window.hlsInstance) return;
  try {
    window.hlsInstance.stopLoad();
    await new Promise((resolve) => {
      let settled = false;
      const onDetached = () => { if (settled) return; settled = true; try { window.hlsInstance.off(Hls.Events.MEDIA_DETACHED, onDetached); } catch (e) {} resolve(); };
      try { window.hlsInstance.on(Hls.Events.MEDIA_DETACHED, onDetached); window.hlsInstance.detachMedia(); } catch (e) { resolve(); }
      setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 150);
    });
    try { window.hlsInstance.destroy(); } catch (e) {}
  } catch (e) {} finally { window.hlsInstance = null; }
}

function cleanupPlayers({ keepVideoVisible = true, preserveHLS = false } = {}) {
  const video = document.getElementById("player");
  const wrapper = document.getElementById("videoWrapper");

  if (window.dashPlayer) { try { window.dashPlayer.reset(); } catch(e){} window.dashPlayer = null; }
  if (!preserveHLS && window.hlsInstance) { try { window.hlsInstance.destroy(); } catch(e){} window.hlsInstance = null; }

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
      video.ontimeupdate = null; 
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
    try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); audioEl.style.display = "none"; } catch (e) {}
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
// Riproduzione Audio
// ---------------------------------------------------------------------------

async function playAudioStream(url, requestId = ++playStreamRequestId) {
  if (isStaleRequest(requestId)) return;
  const playerContainer = document.getElementById('playerContainer');
  cleanupPlayers({ keepVideoVisible: false, preserveHLS: false });
  hideTransitionFrame(); 
  
  const audio = getSharedAudioPlayer();
  audio.onwaiting = () => { if (!isStaleRequest(requestId)) playerContainer.classList.add('loading'); };
  audio.onplaying = () => { if (!isStaleRequest(requestId)) { playerContainer.classList.remove('loading'); audio.dataset.started = "true"; } };
  audio.onerror = () => {
    if (isStaleRequest(requestId)) return;
    playerContainer.classList.remove("loading");
    if (audio.dataset.started === "true" || (audio.error && audio.error.code === 4)) return; 
    if (typeof showNotification === 'function') showNotification('Canale audio non disponibile', true);
  };

  const lowerUrl = url.toLowerCase();
  if ((lowerUrl.endsWith(".m3u8") || lowerUrl.includes("m3u8")) && typeof Hls !== 'undefined' && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true });
    window.hlsInstance = hls;
    hls.loadSource(url);
    hls.attachMedia(audio);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { if(!isStaleRequest(requestId)) safePlay(audio); });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) { try { hls.destroy(); } catch (e) {} audio.src = url; safePlay(audio); }
    });
  } else {
    audio.src = url;
    safePlay(audio);
  }
}

// ---------------------------------------------------------------------------
// Riproduzione Video (Engine V10: Double rAF Sync)
// ---------------------------------------------------------------------------

async function playVideoStream(url, requestId = ++playStreamRequestId) {
  if (isStaleRequest(requestId)) return;
  const video = document.getElementById('player');
  
  captureTransitionFrame(video);

  const lowerUrl = url.toLowerCase();
  const isSafariIOS = /iP(hone|od|ad).+Version\/\d+.+Safari/i.test(navigator.userAgent);
  const isHLS = lowerUrl.includes('.m3u8') || /\.m3u8(\?|&|$)/i.test(url);
  const isDASH = lowerUrl.endsWith('.mpd') || lowerUrl.includes('.mpd?');
  const isMp4OrMov = lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mov');

  cleanupPlayers({ keepVideoVisible: true, preserveHLS: false });

  const autoFullscreen = localStorage.getItem('zappone_auto_fullscreen') !== 'false';
  if (autoFullscreen) {
    video.removeAttribute('playsinline');
    video.removeAttribute('webkit-playsinline');
  } else {
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.removeAttribute("controls");
    video.onclick = () => video.hasAttribute("controls") ? video.removeAttribute("controls") : video.setAttribute("controls", "true");
  }

  video.style.display = "block";

  video.onerror = () => {
    if (isStaleRequest(requestId)) return;
    hideTransitionFrame(); 
    document.getElementById('playerContainer')?.classList.remove('loading');
  };

  video.onwaiting = () => {
    if (!isStaleRequest(requestId)) document.getElementById('playerContainer')?.classList.add('loading');
  };
  
  // LOGICA DI SGANCIO V10: Sincronizzazione perfetta al compositore dello schermo
  const executeFlawlessRelease = () => {
    if (isStaleRequest(requestId)) return;
    document.getElementById('playerContainer')?.classList.remove('loading');
    hideTransitionFrame();
  };

  video.onplaying = () => {
    if (isStaleRequest(requestId)) return;
    
    if ('requestVideoFrameCallback' in video) {
      // 1. Aspetta che il video decodifichi internamente il nuovo frame
      video.requestVideoFrameCallback(() => {
        // 2. Aspetta il ciclo di disegno del browser
        requestAnimationFrame(() => {
          // 3. Aspetta il ciclo finale in cui i pixel arrivano effettivamente al monitor
          requestAnimationFrame(executeFlawlessRelease);
        });
      });
    } else {
      // Fallback robustissimo per TV vecchie (es. WebOS datato o Tizen)
      let checkTimer = setInterval(() => {
        if (isStaleRequest(requestId)) { clearInterval(checkTimer); return; }
        if (video.currentTime > 0.05) {
          clearInterval(checkTimer);
          requestAnimationFrame(() => requestAnimationFrame(executeFlawlessRelease));
        }
      }, 30);
    }
  };

  if (isSafariIOS && isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    safePlay(video);
    return;
  }

  if (isDASH && typeof dashjs !== 'undefined') {
    video.setAttribute('crossorigin', 'anonymous');
    try {
      const player = dashjs.MediaPlayer().create();
      window.dashPlayer = player;
      player.updateSettings({ 
        streaming: { 
          buffer: { fastSwitchEnabled: true, initialBufferLevel: 0.5 },
          delay: { liveDelay: 2 }
        }, 
        debug: { logLevel: dashjs.Debug.LOG_LEVEL_FATAL } 
      });
      player.on(dashjs.MediaPlayer.events.ERROR, (e) => {
        if (e.error && e.error.message && e.error.message.includes('SourceBuffer')) return;
        hideTransitionFrame();
        video.removeAttribute('crossorigin');
        video.src = url;
        safePlay(video);
      });
      player.initialize(video, url, true);
    } catch (err) { hideTransitionFrame(); }
    return;
  }

  if (typeof Hls !== 'undefined' && Hls.isSupported() && isHLS) {
    const hls = new Hls({
      enableWorker: !isSafariIOS,
      startLevel: 0,                
      lowLatencyMode: true,         
      maxBufferLength: 10,          
      manifestLoadingMaxRetry: 1,   
      manifestLoadingTimeOut: 4000
    });
    window.hlsInstance = hls;
    hls.attachMedia(video);
    
    hls.on(Hls.Events.MEDIA_ATTACHED, () => { if (!isStaleRequest(requestId)) hls.loadSource(url); });
    hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!isStaleRequest(requestId)) safePlay(video); });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (!data.fatal || isStaleRequest(requestId)) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        setTimeout(() => { try { hls.startLoad(); } catch (e) {} }, 1000);
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        try { hls.recoverMediaError(); } catch (e) {}
      } else {
        document.getElementById('playerContainer')?.classList.remove('loading');
        hideTransitionFrame(); 
        try { hls.destroy(); } catch (e) {}
        if (typeof showNotification === 'function') showNotification('Flusso offline o irrecuperabile', true);
      }
    });
    return;
  }

  if (isMp4OrMov) {
    video.src = url;
    safePlay(video);
    return;
  }

  video.src = url;
  safePlay(video);
}

// ---------------------------------------------------------------------------
// Network Prefetch (Carica i canali limitrofi nella Cache del Browser)
// ---------------------------------------------------------------------------

function prefetchAdjacentManifests(currentIndex, displayList) {
  if (displayList.length < 2) return;
  const nextIndex = (currentIndex + 1) % displayList.length;
  const prevIndex = (currentIndex - 1 + displayList.length) % displayList.length;
  
  const preload = (url) => {
    if (url && (url.includes('.m3u8') || url.includes('.mpd'))) {
      fetch(url, { mode: 'no-cors', cache: 'force-cache' }).catch(() => {});
    }
  };

  setTimeout(() => {
    preload(displayList[nextIndex].url);
    preload(displayList[prevIndex].url);
  }, 1000);
}

// ---------------------------------------------------------------------------
// Navigazione e Riproduzione
// ---------------------------------------------------------------------------

function navigateChannels(direction, fromFavorites = false) {
  const displayList = fromFavorites ? favoriteChannels : getCurrentDisplayList();
  let currentIndex = fromFavorites ? currentFavoriteIndex : currentChannelIndex;
  if (currentIndex < 0 || currentIndex >= displayList.length) {
    const key = window.currentChannelUrl;
    currentIndex = fromFavorites ? (favoriteIndexMap.get(key) ?? -1) : (channelIndexMap.get(key) ?? -1);
    if (currentIndex === -1) currentIndex = displayList.findIndex(ch => getChannelKey(ch) === key);
  }
  if (currentIndex === -1) return;
  const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (newIndex < 0 || newIndex >= displayList.length) return;

  if (fromFavorites) currentFavoriteIndex = newIndex;
  else currentChannelIndex = newIndex;
  playStream(displayList[newIndex], fromFavorites);
}

async function playStream(channel, fromFavorites = false) {
  const key = getChannelKey(channel);
  const myRequestId = ++playStreamRequestId;
  let currentIndex;
  
  if (fromFavorites) {
    currentIndex = favoriteIndexMap.get(key);
    if (currentIndex === undefined) {
      currentIndex = favoriteChannels.findIndex(ch => getChannelKey(ch) === key);
      if (currentIndex === -1) return typeof showChannelList === 'function' && showChannelList();
    }
    currentFavoriteIndex = currentIndex;
  } else {
    currentIndex = channelIndexMap.get(key);
    if (currentIndex === undefined) {
      currentIndex = channels.findIndex(ch => getChannelKey(ch) === key);
      if (currentIndex === -1) return typeof showChannelList === 'function' && showChannelList();
    }
    currentChannelIndex = currentIndex;
  }

  const targetChannel = fromFavorites ? favoriteChannels[currentIndex] : channels[currentIndex];
  window.currentChannelUrl = key;
  
  setTimeout(() => {
    localStorage.setItem("zappone_last_played", targetChannel.url);
    localStorage.setItem("zappone_last_played_from_favorites", fromFavorites.toString());
  }, 0);

  document.getElementById('channelListContainer').style.display = 'none';
  document.getElementById('playerContainer').style.display = 'block';
  
  updateChannelInfoUI(targetChannel);

  const showMetadataEnabled = localStorage.getItem("zappone_show_metadata") !== "false";
  const metadataExpanded = localStorage.getItem('metadataExpanded') === 'true';
  const showEPGEnabled = localStorage.getItem("zappone_show_epg") !== "false";

  const mc = document.getElementById('metadataContainer');
  if (mc) {
    if (metadataExpanded) { mc.style.display = 'block'; mc.classList.add('expanded'); } 
    else { mc.style.display = 'none'; mc.classList.remove('expanded'); }
  }
  const mh = document.getElementById('metadataHeader');
  if (mh && showMetadataEnabled) mh.style.display = "flex";

  if (showMetadataEnabled && metadataExpanded) {
    const content = document.getElementById('metadataContent');
    if (content && content.children.length > 0) typeof updateMetadataValues === 'function' && updateMetadataValues(targetChannel);
    else typeof showChannelMetadata === 'function' && showChannelMetadata(targetChannel);
  }
  if (showEPGEnabled && typeof showChannelEPG === 'function') showChannelEPG(targetChannel);

  try {
    const radioToggle = document.getElementById('radioToggle');
    const isRadioMode = radioToggle ? radioToggle.checked : false;
    let isAudioChannel = isRadioMode ? true : await isAudioStream(targetChannel);

    if (isStaleRequest(myRequestId)) return;
    toggleUIElementsForStreamType(isAudioChannel);

    if (isAudioChannel) {
      await playAudioStream(targetChannel.url, myRequestId);
    } else {
      await playVideoStream(targetChannel.url, myRequestId);
      const displayList = fromFavorites ? favoriteChannels : getCurrentDisplayList();
      prefetchAdjacentManifests(currentIndex, displayList);
    }

    updateNavButtons(fromFavorites);
  } catch (error) {
    if (isStaleRequest(myRequestId)) return;
    hideTransitionFrame();
    document.getElementById('playerContainer')?.classList.remove('loading');
    if (typeof showNotification === 'function') showNotification("Errore nella riproduzione", true);
    if (typeof showChannelList === 'function') showChannelList();
  }
}