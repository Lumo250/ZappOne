// ================================================================
//  A10-demo-mode.js — Contenuto demo auto-generato (v7 - Sintassi Corretta)
//
//  Stream verificati e stabili.
//  Copertura codec: HLS, DASH, MP4 (Test-Videos), Audio (SoundHelix).
//  Loghi: SVG inline come data URI (nessuna dipendenza esterna).
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

  // --- Titoli EPG demo (allineati ai 12 canali) ---
  const DEMO_PROGRAM_TITLES = [
    ['Natura Demo (concluso)', 'Foresta Demo (in onda)', 'Animali Demo', 'Fiaba Demo', 'Musica Demo'],
    ['Fantascienza Demo (concluso)', 'Robot Demo (in onda)', 'Battaglia Demo', 'Distopia Demo', 'Effetti Demo'],
    ['Codec Demo (concluso)', 'HEVC Demo (in onda)', 'Bitrate Demo', 'Provini Demo', 'Test Demo'],
    ['PTS Demo (concluso)', 'Sync Demo (in onda)', 'Stream Demo', 'Pacchetti Demo', 'Saluti Demo'],
    ['Unified Demo (concluso)', 'Streaming Demo (in onda)', 'Cloud Demo', 'Buffer Demo', 'Fine Demo'],
    ['Adaptive Demo (concluso)', 'DASH Demo (in onda)', 'Segmenti Demo', 'Qualità Demo', 'Test Demo'],
    ['BBB DASH Demo (concluso)', '30fps Demo (in onda)', 'Akamai Demo', 'Manifest Demo', 'Chiusura Demo'],
    ['Sintel Demo (concluso)', 'Shaka Demo (in onda)', 'Player Demo', 'Codec Demo', 'Finale Demo'],
    ['Jellyfish Demo (concluso)', 'Meduse H.264 (in onda)', 'Test Bitrate', 'Decoder Demo', 'Fine Demo'],
    ['Animazione Demo (concluso)', 'Cartone Demo (in onda)', 'Bambini Demo', 'Famiglia Demo', 'Risate Demo'],
    ['Audio Demo 1 (concluso)', 'Melodia Demo (in onda)', 'Armonia Demo', 'Suono Demo', 'Ripresa Demo'],
    ['Audio Demo 2 (concluso)', 'Ritmo Demo (in onda)', 'Frequenza Demo', 'Stereo Demo', 'Chiusura Demo']
  ];

  const MIN = 60 * 1000;

  function makePrograms(channelIdx) {
    const now = Date.now();
    const titles = DEMO_PROGRAM_TITLES[channelIdx % DEMO_PROGRAM_TITLES.length];
    const slots = [
      [-120 * MIN, -60 * MIN],
      [-60 * MIN, 0],
      [0, 60 * MIN],
      [60 * MIN, 120 * MIN],
      [120 * MIN, 180 * MIN]
    ];
    return slots.map((slot, i) => {
      const startMs = now + slot[0];
      const endMs = now + slot[1];
      return {
        title: titles[i] || ('Programma Demo ' + (i + 1)),
        subtitle: 'Contenuto dimostrativo',
        description:
          'Questo programma è generato automaticamente dall\'app in modalità demo ' +
          'per mostrare come funziona l\'associazione canale-EPG. Non contiene dati reali.',
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        startMs,
        endMs,
        category: 'Demo',
        poster: ''
      };
    });
  }

  function generateDemoData() {
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
      programs: makePrograms(i)
    }));

    return { channels, epgData };
  }

  window.initDemoMode = function () {
    if (typeof appConfig === 'undefined' || !appConfig) return;
    if (appConfig.isPremium) return;
    console.log('[demo-mode] pronto: initializeApp chiamerà __generateDemoData()');
  };

  window.__generateDemoData = generateDemoData;

  console.log('[demo-mode] modulo caricato (v7 - Sintassi verificata).');
})();