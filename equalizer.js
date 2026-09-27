// ================================================================
//  MODULO EQUALIZZATORE AUDIO - ZappOne
//  Gestisce la catena Web Audio API (bassi/medi/alti) applicata
//  all'elemento video e a quello audio (radio), i 4 preset, e il
//  collegamento con i pulsanti e il toggle nel sidebar.
//  Dipendenza: nessuna diretta. Deve solo essere caricato prima che
//  l'utente avvii un canale — player.js chiama ensureEqChain() dentro
//  playVideoStream/playAudioStream.
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

// ================================
// FUNZIONE: crea la catena di filtri per un elemento (una sola volta)
// ================================
function ensureEqChain(mediaElement, state) {
  if (state.ready || state.failed || !mediaElement) return state;

  try {
    if (!eqAudioContext) {
      eqAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (eqAudioContext.state === 'suspended') {
      eqAudioContext.resume().catch(() => {});
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

  } catch (err) {
    console.warn('[EQ] Catena audio non disponibile per questo elemento:', err.message);
    state.failed = true;
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
// FUNZIONE: collega pulsanti e toggle sidebar (chiamata da setupEventListeners)
// ================================
function setupEqualizerUI() {
  if (typeof showNotification === 'function') {
    showNotification(`[EQ debug] equalizer.js caricato correttamente`);
  }
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
  if (toggleEqualizer) {
    const eqControls = document.getElementById('eqControls');
    const eqEnabled = localStorage.getItem('zappone_show_equalizer') === 'true';
    toggleEqualizer.checked = eqEnabled;
    if (eqControls) eqControls.style.display = eqEnabled ? 'flex' : 'none';

    toggleEqualizer.onchange = () => {
      const enabled = toggleEqualizer.checked;
      localStorage.setItem('zappone_show_equalizer', enabled);
      if (eqControls) eqControls.style.display = enabled ? 'flex' : 'none';
    };
  }
}