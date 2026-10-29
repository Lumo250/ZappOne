// ================================================================
//  A11-controls-bar.js — Owner unico di #controls
// ================================================================
//
// Gestisce DUE aspetti della barra verde #controls (4px, sotto l'header):
//
//  1. TINT CONTESTUALE (stato persistente, silenzioso)
//     Priorità: delete > search > favorites > default (verde).
//     Polling 500 ms, diff-based. Fermo in background (visibilitychange).
//
//  2. PROGRESSO DI CARICAMENTO (transitorio)
//     API: startProgress() / endProgress() / consumePending().
//     Comparsa dopo 50 ms (filtra i flash); safety 15 s (nessuno spinner
//     eterno). La callback __pendingProgressCallback viene consumata dal
//     renderer (blocco 25 di zappone.js) al primo gruppo visibile.
//
// COESISTENZA: durante .progress-active il CSS (§7) forza il verde e
// mostra l'overlay ::after (sweep animato), mascherando il tint. Al
// termine del progresso il tint riappare senza hook: le classi
// .controls-mode-* restano applicate, il CSS torna a colorarle.
//
// Owner unico: zappone.js (blocco 25) chiama __consumePendingProgressCallback
// che A11 espone come alias di ControlsBar.consumePending. Nient'altro.
// Zero modifiche a 05-player.js, blocco 25, 02-m3u-parser.js (a parte la
// rimozione degli helper locali, vedi sotto).
// ================================================================

(function () {
    'use strict';

    // ════════════════════════════════════════════════════════════════
    // PARTE 1 — TINT CONTESTUALE
    // ════════════════════════════════════════════════════════════════

    const TINT_POLL_MS = 500;
    const TINT_MODES = ['search', 'delete', 'favorites'];

    function getSearchActive() {
        if (typeof isAnySearchFilterActive === 'function') {
            try { return !!isAnySearchFilterActive(); } catch (_) { return false; }
        }
        try { return !!document.querySelector('.search-active'); } catch (_) { return false; }
    }

    function getDeletionActive() {
        return (typeof deletionMode !== 'undefined') && !!deletionMode;
    }

    function getFavoritesActive() {
        return (typeof showingFavorites !== 'undefined') && !!showingFavorites;
    }

    function computeTintMode() {
        if (getDeletionActive()) return 'delete';
        if (getSearchActive())   return 'search';
        if (getFavoritesActive()) return 'favorites';
        return 'default';
    }

    let _lastTintMode = null;

    function applyTintMode(mode) {
        const el = document.getElementById('controls');
        if (!el) return;
        for (let i = 0; i < TINT_MODES.length; i++) {
            const m = TINT_MODES[i];
            el.classList.toggle('controls-mode-' + m, m === mode);
        }
    }

    function refreshTint() {
        const mode = computeTintMode();
        if (mode === _lastTintMode) return;
        _lastTintMode = mode;
        applyTintMode(mode);
    }

    let _tintTimerId = null;

    function startTint() {
        if (_tintTimerId) return;
        _tintTimerId = setInterval(refreshTint, TINT_POLL_MS);
        refreshTint();
    }

    function stopTint() {
        if (!_tintTimerId) return;
        clearInterval(_tintTimerId);
        _tintTimerId = null;
    }

    // ════════════════════════════════════════════════════════════════
    // PARTE 2 — PROGRESSO DI CARICAMENTO
    // ════════════════════════════════════════════════════════════════

    const PROGRESS_START_DELAY_MS = 50;
    const PROGRESS_SAFETY_MS      = 15000;

    let _progressVisible    = false;
    let _progressStartTimer = null;
    let _progressSafetyTimer = null;

    function _cancelProgressTimers() {
        if (_progressStartTimer) {
            clearTimeout(_progressStartTimer);
            _progressStartTimer = null;
        }
        if (_progressSafetyTimer) {
            clearTimeout(_progressSafetyTimer);
            _progressSafetyTimer = null;
        }
    }

    function _progressGetEl() {
        return document.getElementById('controls');
    }

    /**
     * Avvia una sessione di progresso.
     * - La barra diventa visibile dopo PROGRESS_START_DELAY_MS (50 ms).
     * - Se endProgress() viene chiamato prima, la barra non appare mai.
     * - La callback __pendingProgressCallback viene settata qui e consumata
     *   dal renderer (blocco 25) tramite consumePending().
     * - Safety: se nessuno consuma entro PROGRESS_SAFETY_MS dal render,
     *   endProgress() viene chiamato comunque.
     */
    function startProgress() {
        const el = _progressGetEl();
        if (!el) return;

        _cancelProgressTimers();
        _progressVisible = false;
        el.classList.remove('progress-active');

        // Callback che il renderer consumerà. endProgress azzera questa
        // variabile, quindi ogni sessione ha la sua callback e non ci
        // sono callback stantie che sopravvivono.
        window.__pendingProgressCallback = function () {
            endProgress();
        };

        _progressStartTimer = setTimeout(() => {
            _progressStartTimer = null;
            const e = _progressGetEl();
            if (!e) return;

            _progressVisible = true;
            e.classList.add('progress-active');

            _progressSafetyTimer = setTimeout(() => {
                _progressSafetyTimer = null;
                endProgress();
            }, PROGRESS_SAFETY_MS);
        }, PROGRESS_START_DELAY_MS);
    }

    /**
     * Chiude la sessione di progresso. Idempotente.
     * Chiamato da: consumePending() (renderer), safety timer, catch di parseM3U.
     */
    function endProgress() {
        _cancelProgressTimers();

        // Azzera la callback: se era ancora in coda, non verrà consumata.
        if (window.__pendingProgressCallback) {
            window.__pendingProgressCallback = null;
        }

        const el = _progressGetEl();
        if (!el) return;

        _progressVisible = false;
        el.classList.remove('progress-active');
    }

    /**
     * Consuma la callback pendente, se c'è. Idempotente.
     * Chiamato dal blocco 25 (zappone.js) ai 4 punti "lista visibile".
     * Ritorna la callback (che a sua volta chiama endProgress) o null.
     */
    function consumePending() {
        const cb = window.__pendingProgressCallback;
        if (typeof cb === 'function') window.__pendingProgressCallback = null;
        return typeof cb === 'function' ? cb : null;
    }

    // Alias globale usato dal blocco 25: la funzione è la stessa.
    window.__consumePendingProgressCallback = consumePending;

    // ════════════════════════════════════════════════════════════════
    // VISIBILITY: ferma/riavvia il polling del tint
    // ════════════════════════════════════════════════════════════════

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopTint();
        else                 startTint();
    });

    // ════════════════════════════════════════════════════════════════
    // API PUBBLICA
    // ════════════════════════════════════════════════════════════════

    window.ControlsBar = {
        // Progresso
        startProgress,
        endProgress,
        consumePending,
        // Tint
        refreshTint,
        getCurrentTintMode: () => _lastTintMode,
        // Debug
        _computeTintMode: computeTintMode,
    };

    // ════════════════════════════════════════════════════════════════
    // AVVIO
    // ════════════════════════════════════════════════════════════════

    if (!document.hidden) startTint();

    console.log('[ControlsBar] pronto (tint ' + TINT_POLL_MS + 'ms + progresso 50ms/safety 15s).');
})();