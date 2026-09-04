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

function generateM3UFromChannels(channels) {
    let m3uContent = '#EXTM3U\n';
    let currentGroup = null;
    
    channels.forEach(channel => {
        if (channel.group !== currentGroup) {
            m3uContent += `#EXTGRP:${channel.group}\n`;
            currentGroup = channel.group;
        }
        
        m3uContent += `#EXTINF:-1 tvg-logo="${channel.logo || ''}" group-title="${channel.group}",${channel.name}\n`;
        m3uContent += `${channel.url}\n`;
    });
    
    return m3uContent;
}

// ================================
// FUNZIONE: Conta canali e gruppi in una playlist M3U
// ================================

function countChannelsAndGroups(content) {
    const lines = content.split('\n');
    let channelCount = 0;
    const groups = new Set();
    let currentGroup = "Generale";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Gestione EXTINF (canale)
        if (line.startsWith('#EXTINF:')) {
            // Cerca il gruppo in TUTTI i formati possibili
            const groupMatch = 
                line.match(/group-title="([^"]*)"/i) || 
                line.match(/tvg-group="([^"]*)"/i) ||
                line.match(/group-title='([^']*)'/i) ||
                line.match(/tvg-group='([^']*)'/i);
            
            if (groupMatch && groupMatch[1]) {
                currentGroup = groupMatch[1].trim();
                if (currentGroup) groups.add(currentGroup);
            } else if (currentGroup) {
                groups.add(currentGroup);
            }

            // Cerca l'URL successivo (salta righe EXTVLCOPT e altri metadati)
            let urlIndex = i + 1;
            while (urlIndex < lines.length) {
                const nextLine = lines[urlIndex].trim();
                if (nextLine && !nextLine.startsWith('#') && nextLine.match(/^https?:\/\//)) {
                    // Trovato URL valido - conta come canale
                    channelCount++;
                    i = urlIndex; // Avanza all'URL
                    break;
                }
                urlIndex++;
                if (urlIndex - i > 5) break; // Timeout di sicurezza
            }
        }
        // Gestione EXTGRP (cambio gruppo esplicito)
        else if (line.startsWith('#EXTGRP:')) {
            currentGroup = line.substring(8).trim() || "Generale";
            if (currentGroup) groups.add(currentGroup);
        }
        // Gestione gruppo nel formato alternativo
        else if (line.startsWith('#EXTGROUP:')) {
            currentGroup = line.substring(10).trim() || "Generale";
            if (currentGroup) groups.add(currentGroup);
        }
    }

    // Se non abbiamo trovato gruppi ma abbiamo canali, aggiungi "Generale"
    if (groups.size === 0 && channelCount > 0) {
        groups.add("Generale");
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
                NAME: /,(.*)$/,
                GROUP: /tvg-group="(.*?)"|group-title="(.*?)"/,
                LOGO: /tvg-logo="(.*?)"/,
                URL: /^https?:\\/\\//,
                EPG: /(?:x-tvg-url|url-tvg)="(.*?)"/i
            };

            function parseM3U(text) {
                const lines = text.split('\\n');
                const headerLine = lines[0] || '';
                const validChannels = [];
                const groupOrder = new Map();
                let currentGroup = "Generale";
                let channelCount = 0;
                let groupCount = 0;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('#EXTzappone-FAV')) continue;

                    if (REGEX.EXTINF.test(line)) {
                        const name = line.match(REGEX.NAME)?.[1]?.trim() || 'Unnamed Channel';
                        const groupMatch = line.match(REGEX.GROUP);
                        const logo = line.match(REGEX.LOGO)?.[1] || null;

                        if (groupMatch) {
                            currentGroup = groupMatch[1] || groupMatch[2] || currentGroup;
                            if (!groupOrder.has(currentGroup)) {
                                groupOrder.set(currentGroup, groupCount++);
                            }
                        }

                        // Gestione robusta EXTVLCOPT (ottimizzata)
                        let urlIndex = i + 1;
                        while (urlIndex < lines.length && REGEX.EXTVLCOPT.test(lines[urlIndex]?.trim())) {
                            urlIndex++;
                        }
                        
                        const url = lines[urlIndex]?.trim();
                        i = urlIndex;

                        if (url && REGEX.URL.test(url)) {
                            validChannels.push({
                                name, logo, url,
                                group: currentGroup,
                                isGroupHeader: false,
                                groupOrder: groupOrder.get(currentGroup) || 0
                            });
                            channelCount++;
                        }
                    } 
                    else if (REGEX.EXTGRP.test(line)) {
                        currentGroup = line.substring(8).trim();
                        if (!groupOrder.has(currentGroup)) {
                            groupOrder.set(currentGroup, groupCount++);
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

        worker.postMessage({ text });
        
        worker.onmessage = function(e) {
            clearTimeout(timeoutId);
            worker.terminate();
            if (e.data.success) {
                resolve(e.data);
            } else {
                reject(new Error(e.data.error));
            }
        };
        
        worker.onerror = function(error) {
            clearTimeout(timeoutId);
            worker.terminate();
            reject(error);
        };
        
        // Timeout di sicurezza
        timeoutId = setTimeout(() => {
            worker.terminate();
            reject(new Error('Timeout nel parsing M3U'));
        }, 30000);
    });
}

// ================================
// FUNZIONE: Parsing playlist M3U (con gestione EPG opzionale)
// ================================

async function parseM3U(text, loadEPG = true, shouldRender = true) {
    try {
        const parsedData = await parseM3UInWorker(text);
        
        // Aggiornamento stato (sempre) - NOTA: channels e groupedChannels
        // sono variabili globali definite in zappone.js
        if (typeof channels !== 'undefined') {
            channels = parsedData.validChannels;
            groupedChannels = groupChannels(channels);
            rebuildIndexMaps();
        } else {
            console.error('channels non definito - assicurati che zappone.js sia caricato');
            return;
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