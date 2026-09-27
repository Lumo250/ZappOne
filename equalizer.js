// ================================================================
//  MODULO EQUALIZZATORE AUDIO - ZappOne
//  Gestisce la catena Web Audio API (bassi/medi/alti) applicata
//  all'elemento video e a quello audio (radio), i 4 preset, e il
//  collegamento con i pulsanti e il toggle nel sidebar.
//
//  La catena si aggancia SOLO se il toggle è attivo. Spegnendolo mentre
//  qualcosa è in riproduzione, l'elemento video/audio viene DISTRUTTO E
//  RICREATO da zero: è l'unico modo pulito per tornare all'audio nativo,
//  perché la Web Audio API non offre un modo per "staccare" un elemento
//  già catturato da createMediaElementSource() — resta agganciato per
//  tutta la sua vita, anche disconnettendo i nodi del grafo.
// ================================================================

let eqAudioContext = null;
const eqStateVideo = { ready: false, failed: false, bass: null, mid: null, treble: null };
const eqStateAudio = { ready: false, failed: false, bass: null, mid: null, treble: null };

const EQ_PRESETS = {
  normale: { bass: 0,  mid: 0,  treble: 0  },
  bassi:   { bass: 14,  mid: -2, treble: -3 },
  parlato: { bass: -3, mid: 6,  treble: -3 },
  film:    { bass: 10,  mid: -2, treble: 8  }
};

// Flag diagnostico: attivalo da console con
//   localStorage.setItem('zappone_eq_debug', 'true')
// per far comparire le notifiche di debug dell'equalizzatore.
// In produzione resta spento e la console rimane pulita.
function isEqDebug() {
  return localStorage.getItem('zappone_eq_debug') === 'true';
}
function eqDebug(msg, isError = false) {
  if (!isEqDebug()) return;
  console.log('[EQ]', msg);
  if (typeof showNotification === 'function') showNotification('[EQ] ' + msg, isError);
}

function isEqEnabled() {
  return localStorage.getItem('zappone_show_equalizer') === 'true';
}

// ================================
// FUNZIONE: crea la catena di filtri per un elemento (una sola volta,
// e solo se l'equalizzatore è attivo)
// ================================
function ensureEqChain(mediaElement, state) {
  if (!isEqEnabled()) return state;
  if (state.ready || state.failed || !mediaElement) return state;

  try {
    if (!eqAudioContext) {
      eqAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const source = eqAudioContext.createMediaElementSource(mediaElement);

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

    // Su iOS l'AudioContext parte suspended e va ripreso dentro un gesto
    // utente. Se il resume fallisce, il grafo resta inerte e l'audio
    // risulta "piatto" (nessuna differenza tra i preset). Il messaggio
    // di debug serve a distinguere questa causa da quella, diversa,
    // del limite di WebKit sull'HLS nativo.
    if (eqAudioContext.state === 'suspended') {
      eqAudioContext.resume()
        .then(() => eqDebug(`resume() ok, stato: ${eqAudioContext.state}`))
        .catch(err => eqDebug(`resume() rifiutata: ${err?.name} — ${err?.message}`, true));
    }

  } catch (err) {
    console.warn('[EQ] Catena audio non disponibile per questo elemento:', err.message);
    state.failed = true;
    eqDebug(`createMediaElementSource fallita: ${err.name} — ${err.message}`, true);
  }
  return state;
}

// ================================
// FUNZIONE: applica un preset (a una catena sola, o a entrambe)
// ================================
function applyEqPreset(presetName, onlyState = null) {
  const preset = EQ_PRESETS[presetName] || EQ_PRESETS.normale;
  const targets = onlyState ? [onlyState] : [eqStateVideo, eqStateAudio];

  targets.forEach(state => {
    if (!state.ready) return;
    const now = eqAudioContext.currentTime;
    // setTargetAtTime invece di assegnare .value direttamente: evita il
    // "click" udibile quando si cambia preset con l'audio in riproduzione.
    state.bass.gain.setTargetAtTime(preset.bass, now, 0.05);
    state.mid.gain.setTargetAtTime(preset.mid, now, 0.05);
    state.treble.gain.setTargetAtTime(preset.treble, now, 0.05);
  });

  if (!onlyState) localStorage.setItem('zappone_eq_preset', presetName);
}

// ================================
// FUNZIONE: ricrea da zero un elemento media (video o audio), sostituendolo
// nel DOM. È l'unico modo per ottenere un elemento mai toccato dalla Web
// Audio API — vedi nota in testa al file.
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
// FUNZIONE: disattiva l'equalizzatore e ripristina l'audio nativo,
// ricreando gli elementi che erano stati effettivamente agganciati e
// riavviando il canale eventualmente in corso.
// ================================
function detachEqualizerAndRestoreNative() {
  const wasVideoReady = eqStateVideo.ready;
  const wasAudioReady = eqStateAudio.ready;
  if (!wasVideoReady && !wasAudioReady) return; // niente era agganciato, nulla da fare

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

  // Il canale era in riproduzione su un elemento appena distrutto: va
  // fatto ripartire sul nuovo elemento. È un breve riavvio visibile,
  // inevitabile per garantire davvero l'audio nativo.
  //
  // NOTA: showingFavorites è dichiarato con `let` in zappone.js, quindi
  // NON è una proprietà di window. Va letto con typeof per non dipendere
  // dallo scope globale e per non confondere "non definito" con "false".
  if (activeChannel && typeof playStream === 'function') {
    const fromFav = (typeof showingFavorites !== 'undefined') ? showingFavorites : false;
    playStream(activeChannel, fromFav);
  }
}

// ================================
// FUNZIONE: collega pulsanti e toggle sidebar (chiamata da setupEventListeners)
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

  toggleEqualizer.onchange = () => {
    const enabled = toggleEqualizer.checked;
    localStorage.setItem('zappone_show_equalizer', enabled);
    if (eqControls) eqControls.style.display = enabled ? 'flex' : 'none';

    if (enabled) {
      const video = document.getElementById('player');
      if (video && !video.paused) ensureEqChain(video, eqStateVideo);
      const audio = document.getElementById('audioPlayer');
      if (audio && !audio.paused) ensureEqChain(audio, eqStateAudio);
      applyEqPreset(localStorage.getItem('zappone_eq_preset') || 'normale');
    } else {
      detachEqualizerAndRestoreNative();
    }
  };
}