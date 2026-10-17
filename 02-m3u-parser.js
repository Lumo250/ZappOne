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

    channels.forEach((channel) => {
        // [FIX 3] Fallback esplicito: un canale senza `group` finisce in
        // "Generale" invece che sotto la stringa "undefined". Il parser
        // M3U assegna sempre un gruppo, ma canali creati a runtime da
        // moveChannel o saveMetadataChanges potrebbero sfuggire al
        // contratto: qui evitiamo che "undefined" diventi una categoria
        // visibile all'utente.
        const groupName = channel.group || 'Generale';

        if (!groups[groupName]) {
            groups[groupName] = {
                name: groupName,
                logo: null,
                channels: [],
                order: channel.groupOrder !== undefined
                    ? channel.groupOrder
                    : Object.keys(groups).length
            };
        }
        groups[groupName].channels.push(channel);
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
            const groupMatch = line.match(/tvg-group="(.*?)"|group-title="(.*?)"/);
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

function parseM3UInWorker(text) {
    return new Promise((resolve, reject) => {
        // Crea worker inline per evitare file esterni
        const workerCode = `
            const REGEX = {
                EXTINF: /^#EXTINF:/,
                EXTGRP: /^#EXTGRP:/,
                EXTVLCOPT: /^#EXTVLCOPT:/,
                GROUP: /tvg-group="(.*?)"|group-title="(.*?)"/,
                LOGO: /tvg-logo="(.*?)"/,
                // tvg-id e tvg-name: identificatori esatti usati per agganciare
                // il canale al suo EPG senza dipendere dalla normalizzazione del
                // nome. Servono per canali con nomi non latini o con varianti
                // ("Rai 1 HD", "Rai 1 +1") che la normalizzazione per nome
                // non distinguerebbe.
                TVGID: /tvg-id="(.*?)"/,
                TVGNAME: /tvg-name="(.*?)"/,
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

        // [FIX 2] Cattura l'URL del Blob e liberalo su OGNI exit path.
        // Prima l'URL restava vivo finché la pagina non veniva scaricata:
        // ogni caricamento playlist accumulava un URL orfano. Su PWA in
        // kiosk mode questo è un leak reale che cresce con l'uso.
        const blobUrl = URL.createObjectURL(blob);
        const worker = new Worker(blobUrl);

        let timeoutId = null;
        let settled = false;

        // Cleanup idempotente: termina il worker, libera il Blob URL e
        // annulla il timeout. Chiamato da tutti e tre gli exit path.
        const cleanup = () => {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            try { worker.terminate(); } catch (_) {}
            try { URL.revokeObjectURL(blobUrl); } catch (_) {}
        };

        const settle = (action, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            action(value);
        };

        worker.postMessage({ text });

        worker.onmessage = function(e) {
            if (e.data && e.data.success) {
                settle(resolve, e.data);
            } else {
                settle(reject, new Error((e.data && e.data.error) || 'Errore parsing M3U nel worker'));
            }
        };

        worker.onerror = function(event) {
            // [FIX 2] Wrappa l'ErrorEvent in un Error standard per coerenza
            // con il resto del modulo (il catch di parseM3U riceve sempre
            // un Error con .message, non un ErrorEvent).
            const msg = (event && event.message) || 'Worker error';
            settle(reject, new Error(msg));
        };

        // Timeout di sicurezza: 30 s. Su playlist molto grandi (>100k canali)
        // il worker può impiegarci, ma oltre questa soglia è più probabile
        // un problema reale (memoria, parsing bloccato).
        timeoutId = setTimeout(() => {
            settle(reject, new Error('Timeout nel parsing M3U'));
        }, 30000);
    });
}

// ================================
// FUNZIONE: Parsing playlist M3U (con gestione EPG opzionale)
// ================================

async function parseM3U(text, loadEPG = true, shouldRender = true) {
    try {
        const parsedData = await parseM3UInWorker(text);

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
            return false;
        }

        // Render SOLO se richiesto
        if (shouldRender) {
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

        return true;

    } catch (error) {
        // [FIX 1] NON azzerare channels / groupedChannels in caso di errore.
        //
        // Prima: il catch faceva channels = []; groupedChannels = [];
        // e poi renderGroupedChannelList([], ...). Se una playlist precedente
        // era già caricata, questa la distruggeva. E poiché il chiamante
        // (loadPlaylistFromUrl) ha già marcato la nuova playlist come "attiva"
        // in IndexedDB PRIMA di chiamare parseM3U, l'utente restava con:
        //   - playlist nuova marcata attiva in DB
        //   - canali vuoti in memoria
        //   - al reload: parseM3U sulla playlist rotta → di nuovo vuota
        // L'app restava in stato "attivo con zero canali" finché l'utente
        // non eliminava la playlist rotta o ne caricava una funzionante.
        //
        // Ora: lo stato precedente resta INTATTO. L'utente riceve una
        // notifica, la lista che stava già usando continua a funzionare.
        // Il chiamante può controllare il valore di ritorno (false) per
        // decidere se fare rollback (es. rimuovere la marcatura "attiva"
        // dalla playlist rotta in DB) o mostrare un badge di errore nel
        // manager playlist.
        console.error("Errore nel parsing M3U:", error);

        if (typeof showNotification === 'function') {
            const hasPrevious = (typeof channels !== 'undefined' && channels.length > 0);
            showNotification(
                hasPrevious
                    ? "Errore nel parsing della playlist. La lista precedente è ancora disponibile."
                    : "Errore nel parsing della playlist.",
                true
            );
        }

        return false;
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