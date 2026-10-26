// ================================================================
//  A10-demo-mode.js — Contenuto demo auto-generato (v8)
//
//  Stream verificati e stabili.
//  Copertura codec: HLS, DASH, MP4 (Test-Videos), Audio (SoundHelix).
//  Loghi: SVG inline come data URI (nessuna dipendenza esterna).
//
//  EPG demo: ogni canale ha un PROPRIO pattern di palinsesto
//  (offset giornaliero, durate e titoli diversi). I confini dei
//  programmi non coincidono tra canali → griglia del palinsesto
//  eterogenea come in un EPG reale.
// ================================================================

(function setupDemoMode() {
  'use strict';

  // --- Helper: logo SVG inline come data URI ---
  function svgLogo(label, bg, fg) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
        '<rect width="120" height="120" rx="20" fill="' + bg + '"/>' +
        '<text x="60" y="72" text-anchor="middle" ' +
            'font-family="Segoe UI, Roboto, sans-serif" ' +
            'font-size="34" font-weight="700" fill="' + fg + '">' +
          label +
        '</text>' +
      '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // --- Canali demo (12 stream pubblici verificati, 4 gruppi) ---
  const DEMO_CHANNELS = [
    // ── Demo HLS ──
    {
      name: 'Demo · Big Buck Bunny (HLS)',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      group: 'Demo HLS',
      logo: svgLogo('BBB', '#8e44ad', '#ffffff'),
      tvgId: 'demo-bbb-hls',
      tvgName: 'Big Buck Bunny (Demo)'
    },
    {
      name: 'Demo · Tears of Steel (HLS)',
      url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
      group: 'Demo HLS',
      logo: svgLogo('ToS', '#2c3e50', '#ffffff'),
      tvgId: 'demo-tos-hls',
      tvgName: 'Tears of Steel (Demo)'
    },
    {
      name: 'Demo · Apple HEVC (HLS)',
      url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8',
      group: 'Demo HLS',
      logo: svgLogo('HEVC', '#e67e22', '#ffffff'),
      tvgId: 'demo-apple-hevc',
      tvgName: 'Apple HEVC (Demo)'
    },
    {
      name: 'Demo · PTS Test (HLS)',
      url: 'https://test-streams.mux.dev/pts/pts.m3u8',
      group: 'Demo HLS',
      logo: svgLogo('PTS', '#c0392b', '#ffffff'),
      tvgId: 'demo-pts-hls',
      tvgName: 'PTS Test (Demo)'
    },
    {
      name: 'Demo · Unified Bunny (HLS)',
      url: 'https://demo.unified-streaming.com/k8s/features/stable/video/big-buck-bunny-1080p.ism/big-buck-bunny-1080p.m3u8',
      group: 'Demo HLS',
      logo: svgLogo('UNIF', '#1a1a2e', '#ffffff'),
      tvgId: 'demo-unified-hls',
      tvgName: 'Unified Bunny (Demo)'
    },

    // ── Demo DASH ──
    {
      name: 'Demo · MultiRes (DASH)',
      url: 'https://dash.akamaized.net/dash264/TestCases/2c/qualcomm/1/MultiResMPEG2.mpd',
      group: 'Demo DASH',
      logo: svgLogo('DASH', '#16a085', '#ffffff'),
      tvgId: 'demo-dash-multires',
      tvgName: 'MultiRes DASH (Demo)'
    },
    {
      name: 'Demo · BBB 30fps (DASH)',
      url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
      group: 'Demo DASH',
      logo: svgLogo('BBB', '#2980b9', '#ffffff'),
      tvgId: 'demo-dash-bbb',
      tvgName: 'BBB DASH (Demo)'
    },
    {
      name: 'Demo · Sintel (DASH)',
      url: 'https://storage.googleapis.com/shaka-demo-assets/sintel/sintel.mpd',
      group: 'Demo DASH',
      logo: svgLogo('SINT', '#d35400', '#ffffff'),
      tvgId: 'demo-dash-sintel',
      tvgName: 'Sintel DASH (Demo)'
    },

    // ── Demo MP4 ──
    {
      name: 'Demo · Jellyfish H.264 (MP4)',
      url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_10MB.mp4',
      group: 'Demo MP4',
      logo: svgLogo('JEL', '#8e44ad', '#ffffff'),
      tvgId: 'demo-jelly-mp4',
      tvgName: 'Jellyfish MP4 (Demo)'
    },
    {
      name: 'Demo · Big Buck Bunny (MP4)',
      url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4',
      group: 'Demo MP4',
      logo: svgLogo('MP4', '#e74c3c', '#ffffff'),
      tvgId: 'demo-bbb-mp4',
      tvgName: 'Big Buck Bunny MP4 (Demo)'
    },

    // ── Demo Audio ──
    {
      name: 'Demo · SoundHelix Track 1 (Audio)',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      group: 'Demo Audio',
      logo: svgLogo('AUD1', '#9b59b6', '#ffffff'),
      tvgId: 'demo-audio-1',
      tvgName: 'SoundHelix 1 (Demo)'
    },
    {
      name: 'Demo · SoundHelix Track 2 (Audio)',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      group: 'Demo Audio',
      logo: svgLogo('AUD2', '#34495e', '#ffffff'),
      tvgId: 'demo-audio-2',
      tvgName: 'SoundHelix 2 (Demo)'
    }
  ];

  // Ordine dei gruppi (0 = primo in lista).
  const DEMO_GROUP_ORDER = {
    'Demo HLS': 0,
    'Demo DASH': 1,
    'Demo MP4': 2,
    'Demo Audio': 3
  };

  // ────────────────────────────────────────────────────────────────
  //  PALINSESTO DEMO — pattern per canale
  // ────────────────────────────────────────────────────────────────
  // Ogni canale ha un PROPRIO ciclo di programmi (durate e titoli
  // diversi dagli altri canali) che si ripete ogni giorno a partire
  // da un offset specifico (minuti dopo la mezzanotte locale).
  // Risultato: i confini dei programmi non coincidono tra canali e
  // il palinsesto appare eterogeneo come in un EPG reale.
  //
  //   offsetMinutes  sfasamento (minuti dopo la mezzanotte) del ciclo
  //   slotMinutes    durata (minuti) del programma i-esimo del ciclo
  //   titles         titolo del programma i-esimo del ciclo
  // ────────────────────────────────────────────────────────────────
  const DEMO_SCHEDULE_PATTERNS = [
    // 0 — Big Buck Bunny (HLS) — canale per bambini
    {
      offsetMinutes: 5,
      slotMinutes:  [30, 20, 45, 25, 40, 30, 35, 25],
      titles: [
        'Cartoni animati',
        'Fiabe della foresta',
        'Avventure nel bosco',
        'Il piccolo coniglio',
        'Giochi e indovinelli',
        'Storie dal prato',
        'La banda del prato',
        'Buonanotte Bunny'
      ]
    },
    // 1 — Tears of Steel (HLS) — cinema di fantascienza
    {
      offsetMinutes: 0,
      slotMinutes:  [95, 30, 120, 45, 60, 30],
      titles: [
        'Tears of Steel — Il film',
        'Making of: i robot',
        'Ologrammi e distopie',
        'Effetti speciali',
        'Amsterdam 2050',
        'Il futuro prossimo'
      ]
    },
    // 2 — Apple HEVC (HLS) — canale tecnico
    {
      offsetMinutes: 15,
      slotMinutes:  [45, 60, 30, 75, 40, 50],
      titles: [
        'Codec HEVC spiegato',
        'Bitrate e qualità',
        'Provini in 4K',
        'Analisi dei flussi',
        'BipBop: dietro le quinte',
        'Confronto codec'
      ]
    },
    // 3 — PTS Test (HLS) — canale test tecnico
    {
      offsetMinutes: 7,
      slotMinutes:  [15, 20, 15, 30, 15, 25, 20, 15],
      titles: [
        'Sincronizzazione PTS',
        'Test pacchetti',
        'Misure di latenza',
        'Stream dimostrativo',
        'Buffer e PTS',
        'Saluti tecnici',
        'Analisi del flusso',
        'Demo conclusa'
      ]
    },
    // 4 — Unified Bunny (HLS) — canale per bambini
    {
      offsetMinutes: 22,
      slotMinutes:  [25, 35, 30, 40, 20, 30, 45, 25],
      titles: [
        'Bunny e gli amici',
        'Il grande prato',
        'Caccia al tesoro',
        'Storie di famiglia',
        'Buonanotte Bunny',
        'Il ritorno di Bunny',
        'Unified avventure',
        'Sogni colorati'
      ]
    },
    // 5 — MultiRes (DASH) — canale tecnico DASH
    {
      offsetMinutes: 10,
      slotMinutes:  [40, 55, 30, 65, 45, 50],
      titles: [
        'Risoluzioni a confronto',
        'Segmenti adattivi',
        'Qualità percepita',
        'Test di rete',
        'MultiRes spiegato',
        'Bitrate variabile'
      ]
    },
    // 6 — BBB 30fps (DASH) — canale per bambini
    {
      offsetMinutes: 33,
      slotMinutes:  [30, 25, 45, 35, 40, 30, 35],
      titles: [
        'Bunny in 30 fotogrammi',
        'Akamai Kids',
        'Il manifest magico',
        'Chiusura dei giochi',
        '30fps avventure',
        'Il bosco digitale',
        'Storie a 30 fotogrammi'
      ]
    },
    // 7 — Sintel (DASH) — cinema fantasy
    {
      offsetMinutes: 0,
      slotMinutes:  [110, 35, 85, 50, 70],
      titles: [
        'Sintel — Il viaggio',
        'Dietro le quinte',
        'Draghi e foreste',
        'La forgiatura',
        'Il ritorno a casa'
      ]
    },
    // 8 — Jellyfish (MP4) — documentari naturalistici
    {
      offsetMinutes: 18,
      slotMinutes:  [50, 30, 60, 40, 45, 55],
      titles: [
        'Meduse degli abissi',
        'H.264 in dettaglio',
        'Test bitrate 10 MB',
        'Il decoder spiegato',
        'Vita marina in HD',
        'Oceani digitali'
      ]
    },
    // 9 — Big Buck Bunny (MP4) — canale per bambini
    {
      offsetMinutes: 12,
      slotMinutes:  [30, 25, 40, 35, 30, 45, 25],
      titles: [
        'Animazione per tutti',
        'Il cartone del pomeriggio',
        'Bambini e famiglia',
        'Risate in 720p',
        'Il grande bosco',
        'Amici del prato',
        'Storie della sera'
      ]
    },
    // 10 — SoundHelix 1 (Audio) — canale musicale
    {
      offsetMinutes: 8,
      slotMinutes:  [45, 60, 30, 55, 40, 50],
      titles: [
        'Melodie SoundHelix',
        'Armonia e ritmo',
        'Suoni sintetici',
        'Ripresa musicale',
        'Tracce elettroniche',
        'Concerto digitale'
      ]
    },
    // 11 — SoundHelix 2 (Audio) — canale musicale
    {
      offsetMinutes: 27,
      slotMinutes:  [60, 40, 75, 50, 45],
      titles: [
        'Album SoundHelix 2',
        'Frequenze e stereo',
        'Chiusura in musica',
        'Nuove sonorità',
        'Ritmi sintetici'
      ]
    }
  ];

  const MIN = 60 * 1000;

  // Finestra temporale coperta dal palinsesto generato:
  // - 4h all'indietro → dà contesto ai programmi "già passati" nella griglia
  // - 8h in avanti   → copre il palinsesto del pomeriggio/sera
  const EPG_WINDOW_PAST_MS   = 4 * 60 * MIN;
  const EPG_WINDOW_FUTURE_MS = 8 * 60 * MIN;
  const EPG_MAX_PROGRAMS     = 500;   // guard anti-loop

  function makePrograms(channelIdx, now) {
    if (now === undefined) now = Date.now();

    const pattern = DEMO_SCHEDULE_PATTERNS[channelIdx % DEMO_SCHEDULE_PATTERNS.length];
    if (!pattern || !Array.isArray(pattern.slotMinutes) || pattern.slotMinutes.length === 0) {
      return [];
    }

    const slots     = pattern.slotMinutes;
    const titles    = pattern.titles || [];
    const slotCount = slots.length;
    const cycleMin  = slots.reduce((a, b) => a + b, 0);
    const cycleMs   = cycleMin * MIN;
    const offsetMs  = (pattern.offsetMinutes || 0) * MIN;

    // Mezzanotte locale di oggi
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const midnightMs = midnight.getTime();

    // Finestra da coprire
    const windowStart = now - EPG_WINDOW_PAST_MS;
    const windowEnd   = now + EPG_WINDOW_FUTURE_MS;

    // Prima partenza del ciclo oggi (mezzanotte + offset del canale)
    const firstCycleStart = midnightMs + offsetMs;

    // Trova il ciclo che contiene o precede immediatamente windowStart.
    // (Math.floor su numeri negativi arrotonda verso -infinito: corretto.)
    const delta = windowStart - firstCycleStart;
    const cyclesOffset = Math.floor(delta / cycleMs);
    let t = firstCycleStart + cyclesOffset * cycleMs;
    let slotIndex = 0;

    const programs = [];
    let guard = 0;

    while (t < windowEnd && guard++ < EPG_MAX_PROGRAMS) {
      const durMs   = slots[slotIndex] * MIN;
      const startMs = t;
      const endMs   = t + durMs;
      const baseTitle = titles[slotIndex] || ('Programma ' + (slotIndex + 1));

      programs.push({
        title: baseTitle,
        subtitle: 'Contenuto dimostrativo',
        description:
          'Programma generato automaticamente in modalità demo per ' +
          'mostrare come funziona l\'associazione canale-EPG. ' +
          'Nessun contenuto reale.',
        start: new Date(startMs).toISOString(),
        end:   new Date(endMs).toISOString(),
        startMs,
        endMs,
        category: 'Demo',
        poster: ''
      });

      t = endMs;
      slotIndex = (slotIndex + 1) % slotCount;
    }

    return programs;
  }

  function generateDemoData() {
    const now = Date.now();

    const channels = DEMO_CHANNELS.map((ch) => ({
      name: ch.name,
      url: ch.url,
      group: ch.group,
      logo: ch.logo,
      tvgId: ch.tvgId,
      tvgName: ch.tvgName,
      groupOrder: DEMO_GROUP_ORDER[ch.group] ?? 0,
      isGroupHeader: false
    }));

    const epgData = DEMO_CHANNELS.map((ch, i) => ({
      id: ch.tvgId,
      name: ch.name,
      logo: ch.logo,
      programs: makePrograms(i, now)
    }));

    return { channels, epgData };
  }

  window.initDemoMode = function () {
    if (typeof appConfig === 'undefined' || !appConfig) return;
    if (appConfig.isPremium) return;
    console.log('[demo-mode] pronto: initializeApp chiamerà __generateDemoData()');
  };

  window.__generateDemoData = generateDemoData;

  console.log('[demo-mode] modulo caricato (v8 - palinsesto per-canale).');
})();