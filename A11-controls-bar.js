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
// FINE DEL PROGRESSO ≠ FINE DEL RENDER (vedi [SETTLE] sotto): endProgress()
// non spegne la barra subito. Il renderer dichiara "finito" quando il JS ha
// creato le righe; style/layout/paint e caricamento immagini arrivano dopo e
// possono bloccare i tap per secondi. La barra resta quindi accesa finché il
// main thread non è dimostrabilmente reattivo.
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
    const TINT_MODES = ['delete', 'favorites'];

    function getDeletionActive() {
        return (typeof deletionMode !== 'undefined') && !!deletionMode;
    }

    function getFavoritesActive() {
        return (typeof showingFavorites !== 'undefined') && !!showingFavorites;
    }

    function computeTintMode() {
        if (getDeletionActive()) return 'delete';
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

    // [SETTLE] Dopo endProgress() la barra resta accesa finché il main thread
    // non è reattivo: SETTLE_QUIET_MS consecutivi senza un solo frame più
    // lento di SETTLE_GAP_MS (80 ms ≈ 5 frame a 60 Hz: sotto questa soglia un
    // tap viene servito entro un battito di ciglia). Tetto SETTLE_MAX_MS:
    // mai una barra eterna, qualunque cosa succeda.
    const SETTLE_GAP_MS   = 80;
    const SETTLE_QUIET_MS = 700;
    const SETTLE_MAX_MS   = 30000;

    let _progressVisible    = false;
    let _progressStartTimer = null;
    let _progressSafetyTimer = null;
    let _settle = null;   // { t0, last, quietSince, maxGap, raf, cap } | null

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

    function _cancelSettle() {
        if (!_settle) return;
        if (_settle.raf) cancelAnimationFrame(_settle.raf);
        if (_settle.cap) clearTimeout(_settle.cap);
        _settle = null;
    }

    // Spegnimento effettivo della barra (unico punto che toglie .progress-active
    // dopo che la barra è comparsa).
    function _hideProgress(reason) {
        const s = _settle;
        _cancelSettle();
        _progressVisible = false;
        const el = _progressGetEl();
        if (el) el.classList.remove('progress-active');
        if (s) {
            const info = {
                reason: reason,
                waitedMs: Math.round(performance.now() - s.t0),
                maxGapMs: Math.round(s.maxGap)
            };
            if (window.ControlsBar) window.ControlsBar._lastSettle = info;
            console.log('[ControlsBar] barra spenta (' + reason + ') ' + info.waitedMs +
                        ' ms dopo la fine del render; frame più lento: ' + info.maxGapMs + ' ms');
        }
    }

    // Battito su requestAnimationFrame: se il main thread è bloccato i frame
    // arrivano in ritardo e il "periodo di quiete" riparte da zero.
    function _settleTick() {
        const s = _settle;
        if (!s) return;
        s.raf = requestAnimationFrame(() => {
            if (_settle !== s) return;           // sessione sostituita o annullata
            const now = performance.now();
            const gap = now - s.last;
            s.last = now;
            if (gap > s.maxGap) s.maxGap = gap;
            if (gap > SETTLE_GAP_MS) s.quietSince = now;
            if (now - s.quietSince >= SETTLE_QUIET_MS) {
                _hideProgress('quiete');
                return;
            }
            _settleTick();
        });
    }

    function _beginSettle() {
        const now = performance.now();
        _settle = { t0: now, last: now, quietSince: now, maxGap: 0, raf: 0, cap: 0 };
        _settle.cap = setTimeout(() => _hideProgress('tetto'), SETTLE_MAX_MS);
        _settleTick();
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
        _cancelSettle();
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
     *
     * [SETTLE] Se la barra è visibile NON viene spenta subito: resta accesa
     * finché il main thread non è reattivo (vedi SETTLE_* sopra). Se la barra
     * non è mai comparsa (render più rapido di PROGRESS_START_DELAY_MS) non
     * c'è nulla da attendere e non compare affatto.
     */
    function endProgress() {
        _cancelProgressTimers();

        // Azzera la callback: se era ancora in coda, non verrà consumata.
        if (window.__pendingProgressCallback) {
            window.__pendingProgressCallback = null;
        }

        const el = _progressGetEl();
        if (!el) return;

        if (!_progressVisible) {
            el.classList.remove('progress-active');
            return;
        }
        if (_settle) return;      // già in attesa della quiete
        _beginSettle();
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

    console.log('[ControlsBar] pronto (tint ' + TINT_POLL_MS + 'ms + progresso 50ms/safety 15s + attesa quiete ' + SETTLE_QUIET_MS + 'ms/tetto ' + (SETTLE_MAX_MS / 1000) + 's).');
})();