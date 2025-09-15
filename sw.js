const CACHE_NAME = 'ZappOne-cache-v1';
const OFFLINE_URL = 'index.html';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // File locali essenziali
    const assets = [
      'index.html',
      'manifest.json',
      'icon-192.png',
      'icon-512.png'
    ];

    // Prova a cache-are i file essenziali
    for (const asset of assets) {
      try {
        await cache.add(asset);
        console.log('[SW] Cached:', asset);
      } catch (err) {
        console.warn('[SW] Failed to cache', asset, err);
      }
    }

    // Prova a cache-are hls.js ma non bloccare l’install se fallisce
    try {
      await cache.add(new Request(
        'https://cdn.jsdelivr.net/npm/hls.js@1.5.15',
        { mode: 'no-cors' }
      ));
      console.log('[SW] Cached hls.js');
    } catch (err) {
      console.warn('[SW] Could not cache hls.js (ignored):', err);
    }
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ⛔️ NON cache-are segmenti multimediali (streaming)
  if (url.pathname.match(/\.(m3u8|mpd|ts|m4s|key|aac|mp3|mp4)$/i)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ✅ Cache-first con fallback a rete e poi a OFFLINE_URL
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).catch(() => caches.match(OFFLINE_URL));
    })
  );
});

self.addEventListener('activate', event => {
  // Pulizia delle vecchie cache
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    );
    console.log('[SW] Old caches cleared');
  })());
});
