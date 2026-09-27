// ================================================================
//  MODULO EQUALIZZATORE AUDIO - ZappOne
//  VERSIONE DIAGNOSTICA — mostra i messaggi a schermo come notifiche.
//  Quando hai finito di testare, va ripristinata la versione normale.
// ================================================================

let eqAudioContext = null;
const eqStateVideo = { ready: false, failed: false, bass: null, mid: null, treble: null };
const eqStateAudio = { ready: false, failed: false, bass: null, mid: null, treble: null };

const EQ_PRESETS = {
  normale: { bass: 0,  mid: 0,  treble: 0  },
  bassi:   { bass: 8,  mid: -1, treble: -2 },
  parlato: { bass: -3, mid: 6,  treble: -3 },
  film:    { bass: 5,  mid: -1, treble: 4  }
};

function isEqEnabled() {
  return localStorage.getItem('zappone_show_equalizer') === 'true';
}

// ---- Diagnostica: notifiche forzate, sempre visibili ----
function eqDebug(msg, isError = false) {
  console.log('[EQ]', msg);
  if (typeof showNotification === 'function') {
    // Il terzo parametro `true` forza la notifica a comparire a prescindere
    // dalle preferenze utente (bypassa "Mostra notifiche").
    showNotification('[EQ] ' + msg, isError, true);
  }
}

// ================================
// Catena di filtri (versione parlante)
// ================================
function ensureEqChain(mediaElement, state) {
  const who = state === eqStateVideo ? 'VIDEO' : 'AUDIO';

  if (!isEqEnabled()) {
    eqDebug(`${who}: saltata (toggle OFF)`);
    return state;
  }
  if (state.ready || state.failed || !mediaElement) {
    eqDebug(`${who}: saltata (ready=${state.ready} failed=${state.failed} el=${!!mediaElement})`);
    return state;
  }

  try {
    if (!eqAudioContext) {
      eqAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      eqDebug(`${who}: AudioContext CREATO, stato=${eqAudioContext.state}`);
    } else {
      eqDebug(`${who}: AudioContext già esistente, stato=${eqAudioContext.state}`);
    }

    const source = eqAudioContext.createMediaElementSource(mediaElement);
    eqDebug(`${who}: createMediaElementSource OK`);

    const bass = eqAudioContext.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 250;

    const mid = eqAudioContext.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 0.7;

    const treble = eqAudioContext.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 4000;

    source.connect(bass).connect(mid).connect(treble).connect(eqAudioContext.destination);

    state.bass = bass;
    state.mid = mid;
    state.treble = treble;
    state.ready = true;

    applyEqPreset(localStorage.getItem('zappone_eq_preset') || 'normale', state);

    eqDebug(`${who}: CATENA OK. Stato ctx finale=${eqAudioContext.state}`);

    if (eqAudioContext.state === 'suspended') {
      eqAudioContext.resume()
        .then(() => eqDebug(`${who}: resume() OK, stato=${eqAudioContext.state}`))
        .catch(err => eqDebug(`${who}: resume() RIFIUTATA — ${err?.name}: ${err?.message}`, true));
    }

  } catch (err) {
    console.warn('[EQ] Errore:', err);
    state.failed = true;
    eqDebug(`${who}: ERRORE ${err.name} — ${err.message}`, true);
  }
  return state;
}

// ================================
// Applica preset
// ================================
function applyEqPreset(presetName, onlyState = null) {
  const preset = EQ_PRESETS[presetName] || EQ_PRESETS.normale;
  const targets = onlyState ? [onlyState] : [eqStateVideo, eqStateAudio];

  targets.forEach(state => {
    if (!state.ready) return;
    const now = eqAudioContext.currentTime;
    state.bass.gain.setTargetAtTime(preset.bass, now, 0.05);
    state.mid.gain.setTargetAtTime(preset.mid, now, 0.05);
    state.treble.gain.setTargetAtTime(preset.treble, now, 0.05);
  });

  if (!onlyState) localStorage.setItem('zappone_eq_preset', presetName);
}

// ================================
// Ricrea elemento media (per detach)
// ================================
function recreateMediaElement(oldEl) {
  if (!oldEl) return null;
  const fresh = document.createElement(oldEl.tagName);
  fresh.id = oldEl.id;
  fresh.controls = oldEl.controls;
  fresh.autoplay = oldEl.autoplay;
  fresh.className = oldEl.className;
  fresh.style.cssText = oldEl.style.cssText;
  oldEl.parentNode.replaceChild(fresh, oldEl);
  return fresh;
}

// ================================
// Detach e ripristino audio nativo
// ================================
function detachEqualizerAndRestoreNative() {
  const wasVideoReady = eqStateVideo.ready;
  const wasAudioReady = eqStateAudio.ready;
  if (!wasVideoReady && !wasAudioReady) {
    eqDebug('Detach: nessuna catena attiva, nulla da fare');
    return;
  }

  eqDebug(`Detach: video=${wasVideoReady} audio=${wasAudioReady}`);

  const activeChannel = (typeof getActiveChannel === 'function') ? getActiveChannel() : null;

  if (wasVideoReady) {
    recreateMediaElement(document.getElementById('player'));
    eqStateVideo.ready = false;
    eqStateVideo.failed = false;
    eqStateVideo.bass = eqStateVideo.mid = eqStateVideo.treble = null;
  }
  if (wasAudioReady) {
    recreateMediaElement(document.getElementById('audioPlayer'));
    eqStateAudio.ready = false;
    eqStateAudio.failed = false;
    eqStateAudio.bass = eqStateAudio.mid = eqStateAudio.treble = null;
  }

  if (eqAudioContext) {
    eqAudioContext.close().catch(() => {});
    eqAudioContext = null;
  }

  eqDebug('Detach completato, audio nativo ripristinato');

  if (activeChannel && typeof playStream === 'function') {
    const fromFav = (typeof showingFavorites !== 'undefined') ? showingFavorites : false;
    playStream(activeChannel, fromFav);
  }
}

// ================================
// Setup UI con diagnosi al toggle
// ================================
function setupEqualizerUI() {
  document.querySelectorAll('#eqControls .eq-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyEqPreset(btn.dataset.preset);
      document.querySelectorAll('#eqControls .eq-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  const savedEqPreset = localStorage.getItem('zappone_eq_preset') || 'normale';
  document.querySelector(`#eqControls .eq-btn[data-preset="${savedEqPreset}"]`)?.classList.add('active');

  const toggleEqualizer = document.getElementById('toggleEqualizer');
  if (!toggleEqualizer) return;

  const eqControls = document.getElementById('eqControls');
  const eqEnabled = isEqEnabled();
  toggleEqualizer.checked = eqEnabled;
  if (eqControls) eqControls.style.display = eqEnabled ? 'flex' : 'none';

  toggleEqualizer.onchange = async () => {
    const enabled = toggleEqualizer.checked;
    localStorage.setItem('zappone_show_equalizer', enabled);
    if (eqControls) eqControls.style.display = enabled ? 'flex' : 'none';

    if (enabled) {
      // ========= DIAGNOSI TOGGLE ON =========
      eqDebug('===== TOGGLE ON: inizio diagnosi =====');

      // Step 1: AudioContext
      try {
        if (!eqAudioContext) {
          eqAudioContext = new (window.AudioContext || window.webkitAudioContext)();
          eqDebug(`Step1: AudioContext creato, stato=${eqAudioContext.state}`);
        } else {
          eqDebug(`Step1: AudioContext esistente, stato=${eqAudioContext.state}`);
        }
      } catch (err) {
        eqDebug(`Step1 ERRORE: ${err.name} — ${err.message}`, true);
      }

      // Step 2: resume() DENTRO il gesto utente (il tap sul toggle)
      if (eqAudioContext && eqAudioContext.state === 'suspended') {
        try {
          await eqAudioContext.resume();
          eqDebug(`Step2: resume() OK, stato=${eqAudioContext.state}`);
        } catch (err) {
          eqDebug(`Step2: resume() RIFIUTATA — ${err.name}: ${err.message}`, true);
        }
      } else if (eqAudioContext) {
        eqDebug(`Step2: resume() non necessaria (stato=${eqAudioContext.state})`);
      }

      // Step 3: elementi in riproduzione
      const video = document.getElementById('player');
      const audio = document.getElementById('audioPlayer');
      const videoPlaying = !!(video && !video.paused && video.readyState > 0);
      const audioPlaying = !!(audio && !audio.paused && audio.readyState > 0);
      eqDebug(`Step3: video in play=${videoPlaying}, audio in play=${audioPlaying}`);

      // Step 4: aggancia catena se qualcosa è in riproduzione
      if (videoPlaying) {
        ensureEqChain(video, eqStateVideo);
      }
      if (audioPlaying) {
        ensureEqChain(audio, eqStateAudio);
      }

      applyEqPreset(localStorage.getItem('zappone_eq_preset') || 'normale');
      eqDebug('===== FINE DIAGNOSI. Ascolta: c\'è differenza tra preset? =====');

    } else {
      detachEqualizerAndRestoreNative();
    }
  };
}