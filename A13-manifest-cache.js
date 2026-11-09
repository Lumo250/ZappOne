// optional/manifest-cache.js
//
// Arricchimento canali (logo, tvg-id, ...) SENZA rete sul percorso di cambio playlist.
//
// Il manifest è un dato GLOBALE e VERSIONATO, non "per playlist":
//   • vive in RAM (Map), caricato UNA volta dall'IndexedDB all'avvio (init → 0 rete);
//   • applicarlo a una playlist è un ciclo sincrono O(n) senza await (enrich);
//   • la rete si tocca solo quando il server annuncia una versione nuova. La versione viaggia
//     nella risposta di get-config (campo manifestVersion): 0 chiamate in più quando non cambia.
//
// Dove agganciarlo nel codice di ZappOne:
//   • avvio:                    await manifest.init()                       (prima di _loadActivePlaylistAndEpg)
//   • dopo get-config:          manifest.onServerVersion(cfg.manifestVersion)   (senza await)
//   • dopo parseM3U (main thread, dopo l'assegnazione di `channels` e PRIMA di groupChannels/rebuildIndexMaps):
//                               manifest.enrich(channels)
//     Il percorso "cambio playlist dal manager" (getM3UById → parseM3U → showChannelList) passa già da
//     lì: non servono modifiche al manager e non c'è nessuna chiamata HTTP.
//   • quando arriva un manifest nuovo a sessione aperta: enrich(channels) + rebuildIndexMaps() + un solo
//     re-render (è un evento raro: una volta per versione).
(function (root) {
  const norm = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  // store: { get(key), set(key, value) }  (IndexedDB)
  // fetchManifest(currentVersion) → { version, entries:[[nome-normalizzato,{logo,tvgId}],...] } | null (304/errore)
  function create({ store, fetchManifest }) {
    let map = null, version = null, loading = null;

    async function init() {
      const rec = await store.get('manifest');
      if (rec && Array.isArray(rec.entries)) { map = new Map(rec.entries); version = rec.version; }
    }

    // SINCRONA. Restituisce quanti canali sono stati arricchiti.
    function enrich(channels) {
      if (!map) return 0;
      let n = 0;
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        const e = map.get(norm(ch.name));
        if (!e) continue;
        if (!ch.logo && e.logo) ch.logo = e.logo;
        if (!ch.tvgId && e.tvgId) ch.tvgId = e.tvgId;
        n++;
      }
      return n;
    }

    // Mai bloccante per il chiamante; una sola richiesta alla volta; errori ignorati (si resta col manifest che c'è).
    function onServerVersion(v) {
      if (!v || v === version) return Promise.resolve(false);
      if (loading) return loading;
      loading = (async () => {
        try {
          const m = await fetchManifest(version);
          if (!m || !Array.isArray(m.entries)) return false;
          map = new Map(m.entries); version = m.version;
          await store.set('manifest', { version, entries: m.entries });
          return true;
        } catch (_) { return false; }
        finally { loading = null; }
      })();
      return loading;
    }

    return { init, enrich, onServerVersion, norm, get version() { return version; }, get ready() { return !!map; } };
  }

  const api = { create, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ManifestCache = api;
})(typeof window !== 'undefined' ? window : globalThis);
