// ============================================================================
// A08-on-air.js — Modulo OPZIONALE: "Ora in onda" inline nel player
// ============================================================================
//
// Tre hook indipendenti per garantire che l'aggiornamento avvenga SEMPRE
// al cambio canale:
//   1. PlaybackStore.subscribe (se disponibile)
//   2. MutationObserver su #currentChannelName
//   3. Evento 'play' (capture) su video/audio
// + refresh ogni 30s per il cambio programma dentro lo stesso canale.
//
// Se questo file non è caricato, l'app funziona identica: 05-player.js
// non lo chiama, e la riga semplicemente non compare.
// ============================================================================

(function () {
  'use strict';

  var REFRESH_MS = 30000;
  var _refreshTimer = null;

  function findChannelByKey(key) {
    if (!key) return null;
    var favs = (typeof favoriteChannels !== 'undefined' && Array.isArray(favoriteChannels)) ? favoriteChannels : [];
    var all  = (typeof channels !== 'undefined' && Array.isArray(channels)) ? channels : [];
    var hit = null;
    for (var i = 0; i < all.length; i++) {
      if (getChannelKey(all[i]) === key) { hit = all[i]; break; }
    }
    if (!hit) {
      for (var j = 0; j < favs.length; j++) {
        if (getChannelKey(favs[j]) === key) { hit = favs[j]; break; }
      }
    }
    return hit;
  }

  function ensureEl() {
    var info = document.getElementById('currentChannelInfo');
    if (!info) return null;
    var el = document.getElementById('nowOnAir');
    if (el && el.parentElement === info) return el;
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'nowOnAir';
    el.className = 'now-on-air';
    info.appendChild(el);
    return el;
  }

  function updateNowOnAir(channel) {
    var el = ensureEl();
    if (!el) return;

    var prog = (channel && typeof getCurrentProgramInfo === 'function')
      ? getCurrentProgramInfo(channel)
      : null;

    if (!prog || prog.end.getTime() <= Date.now()) {
      el.textContent = '';
      el.title = '';
      return;
    }

    var remainingMs = prog.end.getTime() - Date.now();
    var totalMinutes = Math.floor(remainingMs / 60000);
    var remainingLabel;
    if (totalMinutes < 1) {
      remainingLabel = 'ora';
    } else if (totalMinutes < 60) {
      remainingLabel = totalMinutes + ' min';
    } else {
      var h = Math.floor(totalMinutes / 60);
      var m = totalMinutes % 60;
      remainingLabel = (m === 0) ? (h + 'h') : (h + 'h ' + m + 'm');
    }

    var startLabel = prog.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var line = startLabel + ' · ' + (prog.title || '') + ' · ' + remainingLabel;

    el.textContent = line;
    el.title = line;
  }

  window.updateNowOnAir = updateNowOnAir;

  // ── Hook 1: PlaybackStore.subscribe ─────────────────────────────────────
  // Usa state.channel (autorevole), NON window.currentChannelUrl: al
  // momento in cui subscribe scatta (dentro beginPlaybackSession),
  // currentChannelUrl non è ancora stato aggiornato da playStream.
  function bindToPlaybackStore() {
    if (typeof window.PlaybackStore === 'undefined' ||
        !window.PlaybackStore ||
        typeof window.PlaybackStore.subscribe !== 'function') {
      return false;
    }
    window.PlaybackStore.subscribe(function () {
      var state = window.PlaybackStore.get();
      updateNowOnAir(state && state.channel ? state.channel : null);
    });
    var initial = window.PlaybackStore.get();
    if (initial && initial.channel) updateNowOnAir(initial.channel);
    return true;
  }

  // ── Hook 2: MutationObserver su #currentChannelName ─────────────────────
  // playStream chiama updateChannelInfoUI (che scrive il nome) DOPO aver
  // settato window.currentChannelUrl. Quindi qui currentChannelUrl è già
  // quello nuovo.
  function bindToNameObserver() {
    var nameEl = document.getElementById('currentChannelName');
    if (!nameEl || typeof MutationObserver === 'undefined') return false;
    var last = nameEl.textContent;
    new MutationObserver(function () {
      var now = nameEl.textContent;
      if (now === last) return;
      last = now;
      var ch = findChannelByKey(window.currentChannelUrl);
      if (ch) updateNowOnAir(ch);
    }).observe(nameEl, { childList: true, characterData: true, subtree: true });
    return true;
  }

  // ── Hook 3: evento 'play' (capture) su document ────────────────────────
  // Scatta quando video.play() o audio.play() parte per il nuovo stream.
  // Copre anche HLS retry e fallback nativi, che non passano da
  // PlaybackStore.set.
  function bindToPlayEvent() {
    document.addEventListener('playing', function () {
      var ch = findChannelByKey(window.currentChannelUrl);
      if (ch) updateNowOnAir(ch);
    }, true);
  }

  // ── Refresh periodico: cambio programma dentro lo stesso canale ────────
  function refresh() {
    var player = document.getElementById('playerContainer');
    if (!player || player.style.display === 'none') return;
    var ch = findChannelByKey(window.currentChannelUrl);
    if (ch) updateNowOnAir(ch);
  }

  function startRefreshTimer() {
    if (_refreshTimer) clearInterval(_refreshTimer);
    _refreshTimer = setInterval(refresh, REFRESH_MS);
  }

  function init() {
    // TUTTI gli hook: ogni hook è idempotente (stesso risultato se
    // chiamato più volte per lo stesso cambio), quindi la ridondanza
    // non ha costo. Se uno smette di funzionare in un browser o in un
    // flusso, gli altri due coprono.
    bindToPlaybackStore();
    bindToNameObserver();
    bindToPlayEvent();
    startRefreshTimer();
  }

  window.ZappOneNowOnAir = {
    update: updateNowOnAir,
    refresh: refresh,
    init: init,
    version: '1.1'
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();