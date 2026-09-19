// ============================================================================
// player.js – Riproduzione audio/video e gestione del player
//
// Funzioni esportate globalmente:
//   updateChannelInfoUI(channel)
//   navigateChannels(direction, fromFavorites)
//   playStream(channel, fromFavorites)
//
// Tutte le altre funzioni sono helper interni al modulo player.
//
// NOTE SUI FIX APPLICATI IN QUESTA VERSIONE:
//
// 1) Guardia anti-sovrapposizione (zapping rapido). Cambiare canale molto
//    rapidamente poteva far sovrapporre più chiamate asincrone a playStream/
//    playVideoStream/playAudioStream: quella "vecchia" poteva completare il
//    proprio setup DOPO quella nuova, lasciando lo stato (video visibile,
//    contatori d'errore, eventi HLS in arrivo) riferito al canale sbagliato.
//    playStreamRequestId è un contatore incrementato ad ogni nuova richiesta;
//    ogni chiamata cattura il proprio numero e, nei punti in cui potrebbe
//    essere stata superata da una più recente, verifica di essere ancora
//    quella "attuale" prima di proseguire (vedi isStaleRequest più sotto).
//
// 2) Limite ai tentativi di recupero errori HLS.js. Prima, un errore fatale
//    NETWORK_ERROR o MEDIA_ERROR richiamava hls.startLoad()/recoverMediaError()
//    senza alcun limite: se la causa dell'errore era persistente, il player
//    restava bloccato in un loop di recupero silenzioso (nessuna notifica),
//    percepito come "schermo nero che si blocca". Ora entrambi i tipi di
//    errore hanno un numero massimo di tentativi ravvicinati (con escalation
//    a swapAudioCodec per i MEDIA_ERROR, come da pratica comune nella
//    community di hls.js), oltre il quale il player si ferma e avvisa
//    l'utente invece di ritentare all'infinito. Il conteggio si resetta se
//    l'ultimo errore risale a più di un minuto fa, per non penalizzare una
//    lunga sessione di visione con solo un paio di intoppi isolati e già
//    recuperati con successo.
//
// 3) L'istanza HLS video ora ha anche maxBufferLength/maxMaxBufferLength
//    (come già aveva quella audio), invece di ereditare il default di
//    hls.js (fino a 600s = 10 minuti di buffer in avanti) che per un
//    canale live non ha senso ed è inutilmente pesante in memoria.
//
// 4) cleanupPlayers() ora azzera anche video.onpause (prima restava quello
//    impostato dal ramo "Anti-Freeze" MP4, seppur con impatto pratico basso).
// ============================================================================

// ---------------------------------------------------------------------------
// Guardia anti-sovrapposizione (zapping rapido) — vedi nota 1) sopra
// ---------------------------------------------------------------------------

let playStreamRequestId = 0;

/**
 * Vero se requestId non è più la richiesta di riproduzione più recente,
 * cioè se nel frattempo playStream() è stata richiamata di nuovo (l'utente
 * ha cambiato canale un'altra volta prima che questa chiamata finisse).
 * @param {number} requestId
 * @returns {boolean}
 */
function isStaleRequest(requestId) {
  return requestId !== playStreamRequestId;
}

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
      video.onpause = null; // FIX 4: prima non veniva azzerato (impostato dal ramo Anti-Freeze MP4)
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
 * @param {number} [requestId] - id della richiesta di riproduzione (vedi FIX 1).
 *   Se omesso (chiamata diretta, non tramite playStream), ne viene generato
 *   uno nuovo: si comporta come una richiesta sempre "attuale" al momento
 *   della chiamata, mantenendo la compatibilità con i chiamanti esterni
 *   esistenti che non conoscono questo meccanismo.
 */
async function playAudioStream(url, requestId = ++playStreamRequestId) {
  // FIX 1: se già superata da una richiesta più recente, non toccare nulla:
  // lo farebbe una chiamata "vecchia" sopra il lavoro di quella nuova.
  if (isStaleRequest(requestId)) return;

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
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (isStaleRequest(requestId)) return;
      safePlay(audio, "HLS audio");
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (isStaleRequest(requestId)) return;
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
 * @param {number} [requestId] - id della richiesta di riproduzione (vedi FIX 1).
 *   Se omesso (chiamata diretta, non tramite playStream), ne viene generato
 *   uno nuovo, per compatibilità con i chiamanti esterni esistenti.
 */
async function playVideoStream(url, requestId = ++playStreamRequestId) {
  // FIX 1: controllo PRIMA di toccare qualunque cosa. Se questa richiesta è
  // già superata, non chiamare nemmeno cleanupPlayers(): lo farebbe una
  // chiamata "vecchia" distruggendo il player che la richiesta più recente
  // ha nel frattempo già creato.
  if (isStaleRequest(requestId)) return;

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
            setTimeout(() => createAndInitDash(), DASH_RETRY_DELAY_MS);
          } else {
            if (typeof showNotification === 'function') showNotification('Errore DASH (fallback)', true);
            video.removeAttribute('crossorigin');
            video.src = url;
            safePlay(video, "Fallback");
          }
        });

        player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          if (isStaleRequest(requestId)) return;
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
      backBufferLength: 30,
      // FIX 3: prima mancavano, quindi si usava il default di hls.js
      // (maxMaxBufferLength: 600s = 10 minuti) — eccessivo per un canale live
      // e inutilmente pesante in memoria su dispositivi con poca RAM.
      maxBufferLength: 30,
      maxMaxBufferLength: 60
    });
    window.hlsInstance = hls;
    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (isStaleRequest(requestId)) return;
      hls.loadSource(url);
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (isStaleRequest(requestId)) return;
      safePlay(video, "HLS.js");
    });

    // FIX 2: "circuito di sicurezza" contro i loop di recupero infiniti.
    //
    // Prima, un NETWORK_ERROR o MEDIA_ERROR fatale richiamava rispettivamente
    // hls.startLoad()/hls.recoverMediaError() senza alcun limite. Se la causa
    // era persistente (rete instabile, frammento corrotto) il player restava
    // bloccato in un loop silenzioso — nessuna notifica veniva mai mostrata
    // per questi due casi — percepito come "schermo nero che si blocca".
    //
    // Qui ogni tipo di errore ha un numero massimo di tentativi ravvicinati.
    // Per i MEDIA_ERROR, dal secondo tentativo si tenta anche uno swap del
    // codec audio prima di recoverMediaError(), come da pratica comune nella
    // community di hls.js per gli errori di decodifica che si ripresentano
    // subito dopo il primo recupero. Il conteggio si azzera se l'ultimo
    // errore dello stesso tipo risale a più di un minuto fa: non vogliamo che
        // un paio di intoppi isolati, già recuperati con successo nell'arco di
    // una sessione di visione lunga, portino il player ad arrendersi.
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
      if (typeof showNotification === 'function') showNotification('Errore HLS: ' + reason, true);
    };

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (isStaleRequest(requestId)) return; // stream ormai superato: non gestirlo più
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
        // Piccola attesa tra un tentativo e l'altro: evita di martellare
        // subito un server/CDN che potrebbe già essere in difficoltà.
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

  // --- D) MP4/MOV con Anti-Freeze ---
  if (isMp4OrMov) {
    let freezeTimer = null;
    const currentUrl = url;
    const resetFreezeTimer = () => { if (freezeTimer) { clearTimeout(freezeTimer); freezeTimer = null; } };

    video.onwaiting = () => {
      if (isStaleRequest(requestId)) return;
      resetFreezeTimer();
      freezeTimer = setTimeout(() => {
        if (isStaleRequest(requestId)) return;
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
 *
 * FIX 1: ogni chiamata cattura un requestId univoco all'inizio (vedi
 * isStaleRequest sopra). Se, dopo un punto di attesa asincrona, risulta che
 * nel frattempo è partita una richiesta più recente (l'utente ha cambiato
 * canale di nuovo), questa chiamata si ferma senza proseguire: evita che una
 * riproduzione "vecchia" si sovrapponga a quella nuova durante uno zapping
 * rapido.
 *
 * @param {Object} channel - Oggetto canale { name, url, group, logo }
 * @param {boolean} fromFavorites - true se proviene dalla lista preferiti
 */
async function playStream(channel, fromFavorites = false) {
  const myRequestId = ++playStreamRequestId;
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

    // FIX 1: se nel frattempo è partita una richiesta più recente, fermati
    // qui: non impostare UI/player per un canale non più attuale.
    if (isStaleRequest(myRequestId)) return;

    toggleUIElementsForStreamType(isAudioChannel);

    if (isAudioChannel) {
      await playAudioStream(targetChannel.url, myRequestId);
    } else {
      await playVideoStream(targetChannel.url, myRequestId);
    }

    if (isStaleRequest(myRequestId)) return; // idem, dopo l'await finale

    playerContainer.classList.remove('loading');
    updateNavButtons(fromFavorites);

  } catch (error) {
    if (isStaleRequest(myRequestId)) return; // errore di una richiesta ormai superata: non toccare la UI attuale
    console.error("Errore nella riproduzione:", error);
    playerContainer.classList.remove('loading');
    if (typeof showNotification === 'function')
      showNotification("Errore nella riproduzione del canale", true);
    if (typeof showChannelList === 'function') showChannelList();
  }
}
