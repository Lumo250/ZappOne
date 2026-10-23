// ================================================================
//  PLAYBACK STORE — SSOT (Single Source of Truth) dello stato di
//  riproduzione. Ogni scrittura passa da qui; ogni vista si iscrive
//  e reagisce ai cambi.
//
//  Questo modulo sostituisce le seguenti copie di stato che erano
//  sparse in epg.js, epg-grid.js, player.js e zappone.js:
//
//      window.epgPlaybackEpgChannel
//      window.epgPlaybackPlaylistKey
//      _epgPlaybackOverride
//      _playbackSession.context.epgChannel
//      _playbackSession.context.playlistKey
//
//  Contratto pubblico:
//
//      PlaybackStore.get()                    → stato corrente (read-only)
//      PlaybackStore.set(patch)               → scrive ed emette se cambia
//      PlaybackStore.clear()                  → azzera
//      PlaybackStore.subscribe(fn)            → iscrizione, ritorna unsub
//      PlaybackStore.makeEpgRef(epgChannel)   → { id, name } stabile
//
//  Lo stato è un oggetto con campi:
//
//      channel        oggetto canale playlist (o null)
//      channelKey     getChannelKey(channel) — chiave stabile per lookup
//      epgRef         { id?, name? } — riferimento STABILE, non oggetto
//      origin         'channels' | 'favorites' | 'fullEpgList' | 'fullEpgGrid'
//      navList        'channels' | 'favorites' | 'feg'
//      fromFavorites  boolean
//      startedAt      timestamp di inizio sessione
//
//  Perché il riferimento è STABILE e non un oggetto:
//  quando l'EPG viene ricaricato (rebuildEpgMap), epgDisplayList viene
//  ricostruito e i vecchi oggetti diventano orfani. Con { id, name } la
//  risoluzione è sempre fresca tramite resolveEpgRef() in epg.js.
// ================================================================

(function () {
  'use strict';

  const state = {
    channel:       null,
    channelKey:    null,
    epgRef:        null,
    origin:        null,
    navList:       null,
    fromFavorites: false,
    startedAt:     0,
  };

  const listeners = new Set();

  function makeEpgRef(epgChannel) {
    if (!epgChannel) return null;
    return {
      id:   epgChannel.id   || null,
      name: epgChannel.name || null,
    };
  }

  // Confronto shallow di due epgRef. Ritorna true se rappresentano lo
  // stesso canale EPG (id uguale, oppure stessa name in mancanza di id).
  function epgRefEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    const aId = a.id || null;
    const bId = b.id || null;
    if (aId && bId) return aId === bId;
    return (a.name || null) === (b.name || null);
  }

  function set(patch) {
    const prevRef   = state.epgRef;
    const prevKey   = state.channelKey;
    const prevOrig  = state.origin;

    Object.assign(state, patch);

    const refChanged    = !epgRefEqual(prevRef, state.epgRef);
    const keyChanged    = (prevKey !== state.channelKey);
    const originChanged = (prevOrig !== state.origin);

    if (!refChanged && !keyChanged && !originChanged) return;

    // Copia difensiva: se un listener mutasse lo stato, gli altri non
    // vedrebbero un ibrido tra vecchio e nuovo.
    const snapshot = Object.freeze({
      ...state,
      epgRef: state.epgRef ? Object.freeze({ ...state.epgRef }) : null,
    });

    listeners.forEach(fn => {
      try {
        fn(snapshot);
      } catch (err) {
        console.error('[PlaybackStore] listener ha lanciato:', err);
      }
    });
  }

  function clear() {
    const had = !!(state.channelKey || state.epgRef);

    state.channel       = null;
    state.channelKey    = null;
    state.epgRef        = null;
    state.origin        = null;
    state.navList       = null;
    state.fromFavorites = false;
    state.startedAt     = 0;

    if (!had) return;

    const snapshot = Object.freeze({
      ...state,
      epgRef: null,
    });

    listeners.forEach(fn => {
      try {
        fn(snapshot);
      } catch (err) {
        console.error('[PlaybackStore] listener ha lanciato:', err);
      }
    });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function get() {
    return state;
  }

  window.PlaybackStore = {
    get,
    set,
    clear,
    subscribe,
    makeEpgRef,
  };

  console.log('[PlaybackStore] pronto.');
})();