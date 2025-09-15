const CACHE_NAME = 'ZappOne-cache-v1';
const OFFLINE_URL = 'index.html';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const assets = [
      'index.html',
      'manifest.json',
      'icon-192.png',
      'icon-512.png'
    ];

    // Cache local assets, ignore failures
    for (const asset of assets) {
      try {
        await cache.add(asset);
      } catch (err) {
        console.warn('[SW] Failed to cache', asset, err);
      }
    }

    // Try to cache external hls.js, but don't block install if it fails
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

  // ⛔️ Don't cache HLS/DASH or media segments
  if (url.pathname.match(/\.(m3u8|mpd|ts|m4s|key|aac|mp3|mp4)$/i)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ✅ Cache-first with network fallback and offline fallback
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
  // Cleanup old caches
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
