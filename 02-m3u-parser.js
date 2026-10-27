// ================================================================
//  MODULO PARSER M3U - ZappOne
//  Gestisce il parsing di playlist M3U e il raggruppamento
//  Dipendenze: nessuna (autonomo)
// ================================================================

// ================================
// FUNZIONE: Genera chiave univoca per un canale
// ================================

function getChannelKey(channel) {
    return `${channel.name}@@${channel.url}@@${channel.group || ''}`;
}

// Header originale dell'ultima playlist parsata (la riga `#EXTM3U` con
// eventuali attributi tipo `x-tvg-url="..."`). Viene salvato da parseM3U
// e riutilizzato da generateM3UFromChannels: senza questo, dopo ogni
// modifica (sposta/rinomina/elimina) il file rigenerato perdeva l'header
// e di conseguenza il collegamento all'EPG.
let _currentPlaylistHeader = '#EXTM3U';


// ================================
// [PROGRESS] Barra di avanzamento del caricamento playlist
// ================================
// Delay 50 ms: filtra i flash (caricamenti istantanei) ma rende visibile
// la barra a tutto ciò che l'utente percepisce come "sto aspettando".
//
// Fasi:  parse 0→70%  |  render 70→95% (trickle)  |  primo slice 100%+fade
// Consumatore: window.__consumePendingProgressCallback() chiamato dal
// renderer (blocco 25 di zappone.js) in revealOnce / doRestore /
// ramo empty-state / finalizeRendering. Idempotente: il primo scatta.

const PROGRESS_START_DELAY_MS = 50;
const PROGRESS_INITIAL_PCT    = 5;

let _controlsProgressVisible      = false;
let _controlsProgressStartTimer   = null;
let _controlsProgressTrickleTimer = null;
let _controlsProgressSafetyTimer  = null;

function _controlsProgressGetEl() {
    return document.getElementById('controls');
}

function _controlsProgressCancelStartTimer() {
    if (_controlsProgressStartTimer) {
        clearTimeout(_controlsProgressStartTimer);
        _controlsProgressStartTimer = null;
    }
}

// Avvia una sessione di caricamento. Due comportamenti:
//   • ciclo completo < 50 ms (playlist piccolissime) → timer cancellato da
//     endControlsProgress prima che scatti → la barra non appare mai;
//   • ciclo ≥ 50 ms → barra visibile alla % già raggiunta (nessun salto da 0,
//     perché setControlsProgress continua ad aggiornare la scala anche se la
//     classe .progress-active non è ancora applicata).
function startControlsProgress() {
    const el = _controlsProgressGetEl();
    if (!el) return;

    _controlsProgressCancelStartTimer();

    _controlsProgressVisible = false;
    el.classList.remove('progress-active');
    el.style.setProperty('--controls-progress-scale', String(PROGRESS_INITIAL_PCT / 100));

    _controlsProgressStartTimer = setTimeout(() => {
        _controlsProgressStartTimer = null;
        _controlsProgressVisible = true;
        const e = _controlsProgressGetEl();
        if (e) e.classList.add('progress-active');
    }, PROGRESS_START_DELAY_MS);
}

function setControlsProgress(percent) {
    const el = _controlsProgressGetEl();
    if (!el) return;
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    el.style.setProperty('--controls-progress-scale', String(p / 100));
}

function endControlsProgress() {
    _controlsProgressCancelStartTimer();

    const el = _controlsProgressGetEl();
    if (!el) return;

    if (!_controlsProgressVisible) {
        // Mai resa visibile (timer cancellato prima dei 50 ms): reset, niente fade.
        el.classList.remove('progress-active');
        el.style.setProperty('--controls-progress-scale', '0');
        return;
    }

    // Era visibile: pausa breve al 100%, poi fade-out.
    _controlsProgressVisible = false;
    setTimeout(() => {
        if (!el) return;
        el.classList.remove('progress-active');
        setTimeout(() => {
            if (el) el.style.setProperty('--controls-progress-scale', '0');
        }, 350);
    }, 120);
}

// Trickle: avanzamento graduale (ease-out) tra due percentuali in `durationMs`.
// Tick ogni 100 ms. Se stopControlsProgressTrickle() non viene chiamato
// entro la fine + safetyTimeoutMs, fa sparire la barra comunque.
function startControlsProgressTrickle(fromPct, toPct, durationMs, safetyTimeoutMs) {
    stopControlsProgressTrickle();
    const startTime = performance.now();
    const tick = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const eased = 1 - Math.pow(1 - t, 2.5);
        setControlsProgress(fromPct + (toPct - fromPct) * eased);
        if (t < 1) {
            _controlsProgressTrickleTimer = setTimeout(tick, 100);
        } else {
            _controlsProgressTrickleTimer = null;
            _controlsProgressSafetyTimer = setTimeout(() => {
                _controlsProgressSafetyTimer = null;
                endControlsProgress();
            }, safetyTimeoutMs || 3000);
        }
    };
    tick();
}

function stopControlsProgressTrickle() {
    if (_controlsProgressTrickleTimer) {
        clearTimeout(_controlsProgressTrickleTimer);
        _controlsProgressTrickleTimer = null;
    }
    if (_controlsProgressSafetyTimer) {
        clearTimeout(_controlsProgressSafetyTimer);
        _controlsProgressSafetyTimer = null;
    }
}

// Consumata dal renderer (zappone.js) quando i canali sono visibili.
// Passare per un global la fa sopravvivere al supersession dei render
// (parseM3U → showChannelList).
window.__consumePendingProgressCallback = function () {
    const cb = window.__pendingProgressCallback;
    if (typeof cb === 'function') window.__pendingProgressCallback = null;
    return typeof cb === 'function' ? cb : null;
};

window.startControlsProgress        = startControlsProgress;
window.setControlsProgress          = setControlsProgress;
window.endControlsProgress          = endControlsProgress;
window.startControlsProgressTrickle = startControlsProgressTrickle;
window.stopControlsProgressTrickle  = stopControlsProgressTrickle;


// ================================
// [FIX 2b] FUNZIONE: il testo scaricato è davvero una playlist M3U?
// ================================
// Prima una risposta vuota (null) o una pagina HTML d'errore veniva salvata e attivata
// come playlist, lasciando l'app senza canali. Ora basta trovare #EXTM3U o #EXTINF:
// nei primi 64 KB; altrimenti il chiamante deve rifiutare il contenuto.
function isValidM3UText(text) {
    if (typeof text !== 'string' || text.length < 7) return false;
    return /#EXTM3U|#EXTINF:/i.test(text.slice(0, 65536));
}

// ================================
// FUNZIONE: Raggruppa i canali per categoria
// ================================

function groupChannels(channels) {
    const groups = {};
    const groupOrder = {};

    channels.forEach((channel, index) => {
        if (!groups[channel.group]) {
            groups[channel.group] = {
                name: channel.group,
                logo: null,
                channels: [],
                order: channel.groupOrder !== undefined ? channel.groupOrder : Object.keys(groups).length
            };
        }
        groups[channel.group].channels.push(channel);
    });

    // Ordina i gruppi mantenendo l'ordine originale
    return Object.values(groups).sort((a, b) => a.order - b.order);
}

// ================================
// FUNZIONE: Genera contenuto M3U dall'array di canali
// ================================

// Rigenera il contenuto M3U a partire dall'array di canali.
//
// Preserva:
//   - l'header originale (x-tvg-url, url-tvg, ...) dell'ultima playlist
//     parsata, così il collegamento all'EPG non si perde dopo una modifica;
//   - tvg-id e tvg-name quando presenti sul canale (non li inventa);
//   - le #EXTVLCOPT raccolte dal parser (referer, user-agent, ...);
//   - l'ordine di gruppi e canali così com'è nell'array.
function generateM3UFromChannels(channels) {
    let m3uContent = _currentPlaylistHeader || '#EXTM3U';
    if (!m3uContent.endsWith('\n')) m3uContent += '\n';

    let currentGroup = null;

    channels.forEach(channel => {
        if (channel.group !== currentGroup) {
            m3uContent += `#EXTGRP:${channel.group}\n`;
            currentGroup = channel.group;
        }

        const attrs = [];
        if (channel.tvgId)   attrs.push(`tvg-id="${channel.tvgId}"`);
        if (channel.tvgName) attrs.push(`tvg-name="${channel.tvgName}"`);
        if (channel.logo)    attrs.push(`tvg-logo="${channel.logo}"`);
        attrs.push(`group-title="${channel.group || ''}"`);

        m3uContent += `#EXTINF:-1 ${attrs.join(' ')},${channel.name}\n`;

        if (Array.isArray(channel.extvlcopt)) {
            channel.extvlcopt.forEach(opt => {
                m3uContent += `#EXTVLCOPT:${opt}\n`;
            });
        }

        m3uContent += `${channel.url}\n`;
    });

    return m3uContent;
}

// ================================
// FUNZIONE: Conta canali e gruppi in una playlist M3U
// ================================

function countChannelsAndGroups(content) {
    // [FIX 4] Stesse regole del parser nel worker (vedi sotto): così il numero mostrato in
    // "Playlist salvate" coincide con i canali che poi compaiono davvero nella lista.
    const lines = content.split('\n');
    let channelCount = 0;
    const groups = new Set();
    let extgrpGroup = '';   // gruppo "sticky" dichiarato con #EXTGRP

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            // [FIX regex] aggiunto /i: alcuni provider scrivono TVG-GROUP/GROUP-TITLE in maiuscolo.
            const groupMatch = line.match(/tvg-group="(.*?)"|group-title="(.*?)"/i);
            const attrGroup = groupMatch ? (groupMatch[1] || groupMatch[2] || '').trim() : '';

            // Cerca l'URL saltando righe vuote e direttive '#...' (max 10 righe).
            // Se compare un nuovo #EXTINF prima dell'URL, questo canale non ne ha uno.
            let urlIndex = i + 1;
            let url = '';
            for (; urlIndex < lines.length && urlIndex <= i + 10; urlIndex++) {
                const l = lines[urlIndex].trim();
                if (!l) continue;
                if (l.startsWith('#')) {
                    if (l.startsWith('#EXTINF:')) break;
                    if (l.startsWith('#EXTGRP:')) extgrpGroup = l.substring(8).trim() || extgrpGroup;
                    continue;
                }
                url = l;
                break;
            }

            if (url) {
                if (/^https?:\/\//.test(url)) {
                    channelCount++;
                    groups.add(attrGroup || extgrpGroup || "Generale");
                }
                i = urlIndex;
            } else {
                i = urlIndex - 1;
            }
        }
        else if (line.startsWith('#EXTGRP:')) {
            extgrpGroup = line.substring(8).trim();
        }
    }

    return {
        channelCount,
        groupCount: groups.size
    };
}

// ================================
// FUNZIONE: Parsing M3U con Web Worker (non bloccante)
// ================================

function parseM3UInWorker(text, onProgress) {
    return new Promise((resolve, reject) => {
        // Crea worker inline per evitare file esterni
        const workerCode = `
            const REGEX = {
                EXTINF: /^#EXTINF:/,
                EXTGRP: /^#EXTGRP:/,
                EXTVLCOPT: /^#EXTVLCOPT:/,
                // [FIX regex] /i su tutti gli attributi: alcuni provider scrivono
                // TVG-ID, TVG-NAME, TVG-LOGO, GROUP-TITLE in maiuscolo. Senza /i
                // il canale perde l'aggancio all'EPG (matching per id) e finisce
                // nel gruppo "Generale".
                GROUP: /tvg-group="(.*?)"|group-title="(.*?)"/i,
                LOGO: /tvg-logo="(.*?)"/i,
                // tvg-id e tvg-name: identificatori esatti usati per agganciare
                // il canale al suo EPG senza dipendere dalla normalizzazione del
                // nome. Servono per canali con nomi non latini o con varianti
                // ("Rai 1 HD", "Rai 1 +1") che la normalizzazione per nome
                // non distinguerebbe.
                TVGID: /tvg-id="(.*?)"/i,
                TVGNAME: /tvg-name="(.*?)"/i,
                URL: /^https?:\\/\\//,
                EPG: /(?:x-tvg-url|url-tvg)="(.*?)"/i
            };

            // [FIX 4] Nome canale = tutto ciò che segue la PRIMA virgola fuori dalle virgolette.
            // Contando le virgolette, le virgole dentro gli attributi (tvg-logo="a,b.png") vengono ignorate.
            function extractName(line) {
                let inQuotes = false;
                for (let k = 0; k < line.length; k++) {
                    const c = line.charCodeAt(k);
                    if (c === 34) inQuotes = !inQuotes;                               // "
                    else if (c === 44 && !inQuotes) return line.slice(k + 1).trim();  // ,
                }
                // virgolette sbilanciate: ripiego sul vecchio comportamento (ultima virgola)
                const last = line.lastIndexOf(',');
                return last >= 0 ? line.slice(last + 1).trim() : '';
            }

            function parseM3U(text) {
                const lines = text.split('\\n');
                const headerLine = lines[0] || '';
                const validChannels = [];
                const groupOrder = new Map();
                let extgrpGroup = '';      // gruppo "sticky" dichiarato con #EXTGRP
                let channelCount = 0;
                let groupCount = 0;
                let lastReportedChannel = 0;   // [PROGRESS]

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('#EXTzappone-FAV')) continue;

                    if (REGEX.EXTINF.test(line)) {
                        const name = extractName(line) || 'Unnamed Channel';
                        const groupMatch = line.match(REGEX.GROUP);
                        const logo = line.match(REGEX.LOGO)?.[1] || null;
                        const tvgId = line.match(REGEX.TVGID)?.[1] || null;
                        const tvgName = line.match(REGEX.TVGNAME)?.[1] || null;
                        const attrGroup = groupMatch ? (groupMatch[1] || groupMatch[2] || '') : '';



                        // [FIX 4] Cerca l'URL saltando righe vuote e QUALSIASI direttiva "#..."
                        // (#KODIPROP, #EXTVLCOPT, #EXTGRP, ...), fino a 10 righe. Prima bastava
                        // una riga diversa da #EXTVLCOPT per scartare il canale. Se compare un
                        // nuovo #EXTINF prima dell'URL, questo canale non ne ha uno: lo scarto
                        // senza perdere quello successivo.
                        //
                        // Le #EXTVLCOPT incontrate vengono raccolte: sono opzioni VLC
                        // (referer, user-agent, ...) che vanno riemesse quando la playlist
                        // viene rigenerata da generateM3UFromChannels, altrimenti il canale
                        // perde le sue opzioni dopo un qualsiasi riordino/rinomina.
                        const extvlcopt = [];
                        let urlIndex = i + 1;
                        let url = '';
                        for (; urlIndex < lines.length && urlIndex <= i + 10; urlIndex++) {
                            const l = lines[urlIndex].trim();
                            if (!l) continue;
                            if (l.charCodeAt(0) === 35) {                             // '#'
                                if (REGEX.EXTINF.test(l)) break;                      // nuovo canale
                                if (REGEX.EXTGRP.test(l)) extgrpGroup = l.substring(8).trim() || extgrpGroup;
                                if (REGEX.EXTVLCOPT.test(l)) extvlcopt.push(l.substring(11));
                                continue;
                            }
                            url = l;
                            break;
                        }



                        // [FIX 4] Gruppo = group-title/tvg-group del canale; se manca, l'ultimo
                        // #EXTGRP; se manca anche quello, "Generale". Prima un canale senza
                        // group-title "ereditava" il gruppo del canale precedente.
                        const group = attrGroup || extgrpGroup || "Generale";
                        if (!groupOrder.has(group)) groupOrder.set(group, groupCount++);

                        if (url) {
                            if (REGEX.URL.test(url)) {
                                validChannels.push({
                                    name, logo, url,
                                    tvgId, tvgName,
                                    extvlcopt,
                                    group,
                                    isGroupHeader: false,
                                    groupOrder: groupOrder.get(group)
                                });
                                channelCount++;

                                // [PROGRESS] ogni 200 canali validi, riporta
                                // l'avanzamento al main thread. Messaggio SENZA
                                // campo "success": distinguibile dal finale.
                                if (channelCount - lastReportedChannel >= 200) {
                                    lastReportedChannel = channelCount;
                                    self.postMessage({ progress: channelCount });
                                }
                            }

                            i = urlIndex;          // consumo anche la riga dell'URL
                        } else {
                            i = urlIndex - 1;      // nessun URL: riparto dalla riga che ha interrotto la ricerca
                        }


                    }
                    else if (REGEX.EXTGRP.test(line)) {
                        extgrpGroup = line.substring(8).trim();
                        if (extgrpGroup && !groupOrder.has(extgrpGroup)) {
                            groupOrder.set(extgrpGroup, groupCount++);
                        }
                    }
                }

                return {
                    validChannels,
                    channelCount,
                    groupCount,
                    headerLine
                };
            }

            self.addEventListener('message', function(e) {
                try {
                    const result = parseM3U(e.data.text);
                    self.postMessage({ success: true, ...result });
                } catch (error) {
                    self.postMessage({
                        success: false,
                        error: error.message
                    });
                }
            });
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        let timeoutId;
        let settled = false;

        worker.postMessage({ text });

        worker.onmessage = function(e) {
            if (settled) return;
            const d = e.data;
            if (!d) return;

            // [PROGRESS] Messaggio intermedio (senza `success`)
            if (d.success === undefined && typeof d.progress === 'number') {
                if (typeof onProgress === 'function') {
                    try { onProgress(d.progress); } catch (_) {}
                }
                return;
            }

            // Messaggio finale (successo o errore)
            settled = true;
            clearTimeout(timeoutId);
            worker.terminate();
            if (d.success) {
                resolve(d);
            } else {
                reject(new Error(d.error || 'Worker error'));
            }
        };

        worker.onerror = function(error) {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            worker.terminate();
            reject(error);
        };

        // Timeout di sicurezza
        timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            worker.terminate();
            reject(new Error('Timeout nel parsing M3U'));
        }, 30000);
    });
}

// ================================
// FUNZIONE: Parsing playlist M3U (con gestione EPG opzionale)
// ================================

async function parseM3U(text, loadEPG = true, shouldRender = true) {
    // [PROGRESS] Attiva la barra solo se il caricamento è visibile all'utente
    // (shouldRender=true). Il boot in background di _loadActivePlaylistAndEpg
    // passa shouldRender=false e la barra non viene toccata.
    const showProgress = shouldRender
        && typeof text === 'string'
        && typeof window.startControlsProgress        === 'function'
        && typeof window.setControlsProgress          === 'function'
        && typeof window.endControlsProgress          === 'function'
        && typeof window.startControlsProgressTrickle === 'function'
        && typeof window.stopControlsProgressTrickle  === 'function';

    // Fasi:
    //   parsing  → 0..70%  (basata sui canali validi riportati dal worker)
    //   rendering → 70..95% (trickle ease-out, "resta onesto" senza mentire)
    //   visibile  → 100% + fade (callback consumato dal renderer)
    const MAX_PARSE_PCT  = 70;
    const TRICKLE_TO_PCT = 95;
    const TRICKLE_MS     = 8000;
    const SAFETY_MS      = 3000;

    let progressTotal   = 0;
    let progressLastPct = -1;
    let renderScheduled = false;

    if (showProgress) {
        // [PROGRESS] La barra parte SUBITO, prima del regex, per dare
        // feedback immediato. Il regex (O(n) su un testo potenzialmente
        // grande) può durare decine di ms sui file da diversi MB: farlo
        // PRIMA di startControlsProgress lasciava la UI "muta" per quel
        // tempo. Ora il primo frame ha già la barra visibile (o il suo
        // timer a 50 ms avviato).
        window.startControlsProgress();

        const matches = text.match(/#EXTINF:/gi);
        progressTotal = matches ? matches.length : 0;
        if (progressTotal === 0) {
            // Playlist senza #EXTINF: niente da tracciare, chiudi subito.
            window.endControlsProgress();
        }
    }

    try {

        const onProgress = (showProgress && progressTotal > 0)
            ? (channelsProcessed) => {
                const pct = Math.min(
                    MAX_PARSE_PCT,
                    Math.round((channelsProcessed / progressTotal) * MAX_PARSE_PCT)
                );
                if (pct !== progressLastPct) {
                    progressLastPct = pct;
                    window.setControlsProgress(pct);
                }
            }
            : null;

        const parsedData = await parseM3UInWorker(text, onProgress);

        // Parsing completato: fissa al 70% e avvia il trickle verso il 95%.
        if (showProgress && progressTotal > 0) {
            window.setControlsProgress(MAX_PARSE_PCT);
            window.startControlsProgressTrickle(MAX_PARSE_PCT, TRICKLE_TO_PCT, TRICKLE_MS, SAFETY_MS);
        }

        // Memorizza l'header originale (contiene x-tvg-url, url-tvg, ecc.)
        // per generateM3UFromChannels. Senza questo, dopo una qualsiasi
        // modifica alla lista, il file rigenerato perderebbe l'attributo
        // che collega la playlist all'EPG.
        if (parsedData.headerLine) {
            _currentPlaylistHeader = parsedData.headerLine;
        }

        // Aggiornamento stato (sempre) - NOTA: channels e groupedChannels
        // sono variabili globali definite in zappone.js
        if (typeof channels !== 'undefined') {


            channels = parsedData.validChannels;
            groupedChannels = groupChannels(channels);
            rebuildIndexMaps();
if (typeof invalidateFegPlaybackList === 'function') invalidateFegPlaybackList();
        } else {
            console.error('channels non definito - assicurati che zappone.js sia caricato');
            return;
        }

        // [PROGRESS] Registra la callback globale che il renderer consumerà al
        // primo `finalizeRendering` reale (anche quello di showChannelList,
        // che può supersessionare il render di parseM3U). Passare per un global
        // invece che per options.onSyncRendered evita che la barra resti
        // "congelata al 70%" quando il primo render viene scartato dai token.
        if (showProgress && progressTotal > 0) {
            window.__pendingProgressCallback = function () {
                window.stopControlsProgressTrickle();
                window.setControlsProgress(100);
                window.endControlsProgress();
            };
        }

        // Render SOLO se richiesto
        if (shouldRender) {
            renderScheduled = true;
            requestAnimationFrame(() => {
                if (typeof renderGroupedChannelList === 'function') {
                    renderGroupedChannelList(
                        showingFavorites ? getFilteredGroupedChannels() : groupedChannels,
                        { context: 'channels' }
                    );
                }
                if (typeof updateToggleState === 'function') {
                    updateToggleState();
                }
            });
        }

        // Caricamento EPG in background se richiesto
        if (loadEPG && parsedData.headerLine) {
            console.log('Avvio caricamento EPG automatico dalla playlist...');
            // Non await qui - lascia che proceda in background
            if (typeof handleEPGLoading === 'function') {
                handleEPGLoading(parsedData.headerLine).catch(err => {
                    console.error('Errore nel caricamento EPG automatico:', err);
                });
            } else {
                console.warn('handleEPGLoading non definita');
            }
        } else {
            console.log('Nessun EPG da caricare dalla playlist');
        }

    } catch (error) {
        console.error("Errore nel parsing M3U:", error);
        if (typeof showNotification === 'function') {
            showNotification("Errore nel parsing della playlist", true);
        }

        // Fallback: canali vuoti
        if (typeof channels !== 'undefined') {
            channels = [];
            groupedChannels = [];
        }
        if (typeof renderGroupedChannelList === 'function') {
            renderGroupedChannelList(groupedChannels || [], { context: 'channels' });
        }

        // [PROGRESS] Errore prima che un render sia stato schedulato:
        // chiudi la barra subito. Se invece il render era stato schedulato,
        // la callback (o il safety timer) la chiuderà comunque.
        if (showProgress && progressTotal > 0 && !renderScheduled) {
            window.__pendingProgressCallback = null;
            window.stopControlsProgressTrickle();
            window.endControlsProgress();
        }
    }
}

// ================================
// FUNZIONE HELPER: Ottiene i canali filtrati per preferiti
// ================================

function getFilteredGroupedChannels() {
    if (!showingFavorites) return groupedChannels;

    // favoriteKeys è una Set globale popolata da loadFavorites()
    const favSet = favoriteKeys instanceof Set ? favoriteKeys : new Set(Array.from(favoriteKeys || []));

    return groupedChannels
        .map(group => ({
            ...group,
            channels: group.channels.filter(ch => favSet.has(getChannelKey(ch)))
        }))
        .filter(group => group.channels.length > 0);
}

// ================================
// ESPORTA (se usi moduli, altrimenti lascia globali)
// ================================

// Se il progetto usa ES Modules, decommenta queste righe:
// export {
//     getChannelKey,
//     groupChannels,
//     generateM3UFromChannels,
//     countChannelsAndGroups,
//     parseM3UInWorker,
//     parseM3U,
//     getFilteredGroupedChannels
// };