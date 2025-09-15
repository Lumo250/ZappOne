const CACHE_NAME = 'ZappOne-cache-v2';
const OFFLINE_URL = 'index.html';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const assets = [
      'index.html',
      // aggiungi qui altri asset statici della tua app, se esistono
      // es: 'styles.css', 'app.js', ecc.
    ];

    for (const asset of assets) {
      try {
        await cache.add(asset);
      } catch (err) {
        console.warn('[SW] Failed to cache', asset, err);
      }
    }

    // Cache opzionale per libreria esterna
    try {
      await cache.add(new Request(
        'https://cdn.jsdelivr.net/npm/hls.js@1.5.15',
        { mode: 'no-cors' }
      ));
    } catch (err) {
      console.warn('[SW] Could not cache hls.js (ignored):', err);
    }
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Lista di domini di streaming da escludere
  const streamingHosts = [
    'mediapolis.rai.it',
    'akamaihd.net',
    'cdn.dashjs.org',
    'streaming.example.com'
  ];

  // Pattern nel path tipici dello streaming
  const streamingPatterns = [
    /\/live\//i,
    /\/stream/i,
    /\/hls/i
  ];

  // ⛔️ Non cacheare file media (HLS/DASH/segmenti audio/video)
  if (url.pathname.match(/\.(m3u8|mpd|ts|m4s|key|aac|mp3|mp4)$/i)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ⛔️ Non intercettare host di streaming
  if (streamingHosts.some(host => url.hostname.includes(host))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ⛔️ Non intercettare URL che corrispondono a pattern "streaming"
  if (streamingPatterns.some(rx => rx.test(url.pathname))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ✅ Cache-first con fallback rete e offline
  event.respondWith(
    caches.match(event.request).then(response => {
      return (
        response ||
        fetch(event.request).catch(() => caches.match(OFFLINE_URL))
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.map(name => {
        if (name !== CACHE_NAME) {
          console.log('[SW] Deleting old cache:', name);
          return caches.delete(name);
        }
      })
    );
  })());
});
