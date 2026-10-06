// ================================================================
//  MODULO EPG - ZappOne
//  Download, parsing (XML/XMLTV e JSON), indicizzazione e rendering.
// ================================================================

// ================================
// STATO GLOBALE EPG
// ================================
let epgData = [];
let epgByName = new Map();
let epgDisplayList = [];
let lastRenderedEpgData = null;
let _epgPlaybackOverride = null;

// Chiave del canale attualmente mostrato nel drawer EPG laterale.
// Serve a saltare la ricostruzione quando si riclicca lo stesso canale.
let _openDrawerChannelKey = null;

function getRenderFingerprint(container) {
    return container ? container.dataset.renderFingerprint || '' : '';
}
function setRenderFingerprint(container, fingerprint) {
    if (container) container.dataset.renderFingerprint = fingerprint;
}

function normalizeChannelName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\s+/g, '')
    .replace(/(hd|sd|fhd)$/, '');
}

function parseXMLTVDate(xmltvDate) {
  if (!xmltvDate || typeof xmltvDate !== 'string' || xmltvDate.length < 14) {
    return null;
  }
  const year = parseInt(xmltvDate.substring(0, 4));
  const month = parseInt(xmltvDate.substring(4, 6)) - 1;
  const day = parseInt(xmltvDate.substring(6, 8));
  const hour = parseInt(xmltvDate.substring(8, 10));
  const minute = parseInt(xmltvDate.substring(10, 12));
  const second = parseInt(xmltvDate.substring(12, 14));
  const tzOffset = xmltvDate.substring(14).trim().replace(/:/g, '');
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (isNaN(date.getTime())) return null;
  if (tzOffset && tzOffset.length >= 5) {
    const sign = tzOffset[0];
    const offsetHours = parseInt(tzOffset.substring(1, 3));
    const offsetMinutes = parseInt(tzOffset.substring(3, 5));
    if (!isNaN(offsetHours) && !isNaN(offsetMinutes)) {
      const offsetMs = (offsetHours * 60 + offsetMinutes) * 60000;
      if (sign === '+') date.setTime(date.getTime() - offsetMs);
      else if (sign === '-') date.setTime(date.getTime() + offsetMs);
    }
  }
  return date;
}

function isProgramCurrentlyAiring(program) {
    if (!program || !program.start || !program.end) return false;
    const now = new Date();
    const start = new Date(program.start);
    const end = new Date(program.end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    const duration = end - start;
    if (duration <= 0 || duration > 43200000) return false;
    return start <= now && now < end;
}

function getProgramProgress(start, end) {
  const now = new Date();
  const startTime = new Date(start);
  const endTime = new Date(end);
  if (now <= startTime) return 0;
  if (now >= endTime) return 100;
  return ((now - startTime) / (endTime - startTime)) * 100;
}

function formatTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ZAPPONE_BACKEND_ORIGIN = 'https://zappone.netlify.app';

const EPG_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
  '<defs>' +
    '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2e3440"/>' +
      '<stop offset="1" stop-color="#161922"/>' +
    '</linearGradient>' +
    '<linearGradient id="scr" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#404a5c"/>' +
      '<stop offset="1" stop-color="#232834"/>' +
    '</linearGradient>' +
  '</defs>' +
  '<rect width="120" height="120" fill="url(#bg)"/>' +
  '<path d="M42 30 L60 42 L78 30" fill="none" stroke="#5c6678" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<rect x="20" y="42" width="80" height="56" rx="9" fill="url(#scr)" stroke="#4c5566" stroke-width="2"/>' +
  '<circle cx="60" cy="70" r="15" fill="none" stroke="#a8b0be" stroke-width="2" opacity="0.85"/>' +
  '<path d="M55 62 L70 70 L55 78 Z" fill="#a8b0be" opacity="0.95"/>' +
  '<rect x="54" y="102" width="12" height="3" rx="1.5" fill="#4c5566"/>' +
  '<rect x="44" y="105" width="32" height="3" rx="1.5" fill="#3a4150"/>' +
  '</svg>'
);

function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let fixed = url;
  const firstQ = fixed.indexOf('?');
  if (firstQ !== -1) {
    fixed = fixed.slice(0, firstQ + 1)
          + fixed.slice(firstQ + 1).replace(/\?/g, '&');
  }
  try {
    const u = new URL(fixed);
    if (u.hostname === 'guidatv.sky.it') {
      return `${ZAPPONE_BACKEND_ORIGIN}/logo-proxy/guidatv.sky.it${u.pathname}${u.search}`;
    }
  } catch (e) { }
  return fixed;
}

async function tryDirectFetch(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchEPGBinary(targetUrl) {
  const direct = await tryDirectFetch(targetUrl);
  if (direct) {
    console.log('EPG scaricato direttamente (CORS ok): nessun proxy necessario.');
    return direct;
  }
  console.log('Fetch diretto EPG non disponibile (CORS/rete): uso il proxy.');
  return await fetchM3UWithProxies(targetUrl, 'arrayBuffer');
}

// ---------------------------------------------------------------------------
// Parsing di un testo XMLTV.
// Prova il Worker (epg-parser-worker.js). Se non è disponibile o fallisce,
// ricade su DOMParser sul main thread.
// ---------------------------------------------------------------------------
async function parseEPGText(xmlText) {
  let worker = null;
  try {
    worker = new Worker('epg-parser-worker.js');
    const workerTimeoutMs = 120000;

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Worker timeout (' + (workerTimeoutMs / 1000) + 's)'));
      }, workerTimeoutMs);

      worker.onmessage = function (e) {
        clearTimeout(timer);
        if (e.data && e.data.ok) resolve(e.data.data);
        else reject(new Error((e.data && e.data.error) || 'Worker error'));
      };
      worker.onerror = function (err) {
        clearTimeout(timer);
        reject(new Error((err && err.message) || 'Worker load error'));
      };
      worker.postMessage({ xml: xmlText });
    });

    if (!Array.isArray(result)) {
      throw new Error('Worker output non è un array');
    }
    if (result.length > 0) {
      const first = result[0];
      if (!first || typeof first !== 'object' ||
          typeof first.name !== 'string' ||
          !Array.isArray(first.programs)) {
        throw new Error('Worker output non ha la struttura attesa');
      }
    }

    console.log('[EPG] Parsing in Worker: ok (' + result.length + ' canali)');
    return result;
  } catch (workerErr) {
    console.warn('[EPG] Worker non disponibile, uso DOMParser sul main thread:', workerErr.message);
  } finally {
    if (worker) {
      try { worker.terminate(); } catch (_) {}
    }
  }

  const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (xmlDoc.getElementsByTagName("parsererror").length) {
    throw new Error('XML malformato');
  }
  return parseXMLTV(xmlDoc);
}

async function downloadEPG(url = appConfig.epgUrl, options = {}) {
  const { setActive = true, updateUI = true, silent = false, name = null } = options;

  const targetUrl = url || appConfig.epgUrl;
  if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
    if (!silent) showNotification('URL EPG non valido o non configurato', true);
    return null;
  }

  const btn = document.getElementById('downloadEpgBtn');
  if (btn) btn.classList.add('loading');

  try {
    console.log(`Iniziando download EPG sicuro da: ${targetUrl}`);

    const buffer = await fetchEPGBinary(targetUrl);
    if (!buffer) throw new Error("Impossibile recuperare i dati (Licenza non valida o errore server)");

    let responseText;
    const view = new Uint8Array(buffer);
    if (view.length > 1 && view[0] === 0x1f && view[1] === 0x8b) {
        const blob = new Blob([buffer]);
        const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        responseText = await new Response(decompressedStream).text();
    } else {
        const decoder = new TextDecoder('utf-8');
        responseText = decoder.decode(buffer);
    }

    const MAX_EPG_TEXT_LENGTH = 100 * 1024 * 1024;
    if (responseText.length > MAX_EPG_TEXT_LENGTH) {
      throw new Error(
        `EPG troppo grande (${(responseText.length / 1024 / 1024).toFixed(1)} MB): ` +
        `limite ${MAX_EPG_TEXT_LENGTH / 1024 / 1024} MB.`
      );
    }

    const isXML = responseText.trim().startsWith('<') || responseText.includes('<tv>');
    let data;

    try {
      if (isXML) {
        data = await parseEPGText(responseText);
      } else {
        data = JSON.parse(responseText);
      }
    } catch (parseError) {
      throw new Error(`Errore parsing EPG: ${parseError.message}`);
    }

    if (!Array.isArray(data)) throw new Error('Struttura EPG non valida');
    const validChannels = data.filter(ch => ch && ch.name);
    if (validChannels.length === 0) throw new Error('EPG vuoto');

    await saveAndActivateEPG({
      url: targetUrl,
      name: name || undefined,
      content: data
    }, { setActive: setActive });

    if (setActive) {
      epgData = data;
      rebuildEpgMap();

      if (updateUI && !silent) {
        showNotification(`EPG caricato: ${data.length} canali`);
        if (window.currentChannelUrl) {
          const current = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
          if (current) setTimeout(() => showChannelEPG(current), 100);
        }
        requestAnimationFrame(() => renderGroupedChannelList(getFilteredGroupedChannels(), { context: 'channels' }));
      }
    }

    return data;

  } catch (error) {
    console.error("Errore caricamento EPG:", error);
    if (!silent) {
      if (error && error.code === 'SLOTS_FULL') {
        showNotification('Slot EPG pieni. Elimina un EPG dal manager per liberare spazio.', true);
      } else {
        showNotification(error.message, true);
      }
    }
    return null;
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

function parseXMLTV(xmlDoc) {
  const channels = Array.from(xmlDoc.getElementsByTagName('channel')).map(channel => {
    return {
      id: channel.getAttribute('id'),
      name: channel.getElementsByTagName('display-name')[0]?.textContent || '',
      logo: channel.getElementsByTagName('icon')[0]?.getAttribute('src') || ''
    };
  });

  const programmes = Array.from(xmlDoc.getElementsByTagName('programme')).map(programme => {
    const channelId = programme.getAttribute('channel');
    const start = programme.getAttribute('start');
    const stop = programme.getAttribute('stop');
    return {
      channel: channelId,
      title: programme.getElementsByTagName('title')[0]?.textContent || '',
      subtitle: programme.getElementsByTagName('sub-title')[0]?.textContent || '',
      description: programme.getElementsByTagName('desc')[0]?.textContent || '',
      start: parseXMLTVDate(start),
      end: parseXMLTVDate(stop),
      category: programme.getElementsByTagName('category')[0]?.textContent || '',
      poster: programme.getElementsByTagName('icon')[0]?.getAttribute('src') || ''
    };
  })
  .filter(p => p.start instanceof Date && !isNaN(p.start.getTime()) && p.end instanceof Date && !isNaN(p.end.getTime()));

  const programmesByChannel = new Map();
  for (const p of programmes) {
    let list = programmesByChannel.get(p.channel);
    if (!list) { list = []; programmesByChannel.set(p.channel, list); }
    list.push(p);
  }

  return channels.map(channel => {
    return {
      ...channel,
      programs: (programmesByChannel.get(channel.id) || [])
        .filter(p => {
           const duration = p.end - p.start;
           return duration > 0 && duration < 43200000;
        })
        .map(p => ({
          title: p.title,
          subtitle: p.subtitle,
          description: p.description,
          start: p.start.toISOString(),
          end: p.end.toISOString(),
          category: p.category,
          poster: p.poster
        }))
    };
  });
}

async function handleEPGLoading(headerLine) {
    if (localStorage.getItem("zappone_auto_update_epg") === "false") {
        console.log("Auto-update EPG OFF: salto la sincronizzazione degli EPG dall'header della playlist.");
        return;
    }
    const REGEX = { EPG: /(?:x-tvg-url|url-tvg)="(.*?)"/i };
    const epgMatch = headerLine.match(REGEX.EPG);

    if (epgMatch) {
        const allEpgUrls = epgMatch[1].split(',').map(u => u.trim()).filter(u => u);

        console.log(`Trovati ${allEpgUrls.length} URL EPG nella playlist:`, allEpgUrls);

        if (allEpgUrls.length === 0) return;

        // --- Pre-check dello spazio disponibile ---
        const maxSlots = (typeof appConfig !== 'undefined' && appConfig.maxEpgSlots)
                         ? appConfig.maxEpgSlots
                         : 1;

        const existingAll = await getAllEPGUrls();
        const existingUrlSet = new Set(existingAll.map(r => r.url));
        const alreadyCount = existingAll.length;
        let freeSlots = Math.max(0, maxSlots - alreadyCount);

        const epgUrls = [];
        let skippedForSlots = 0;
        for (const url of allEpgUrls) {
            if (existingUrlSet.has(url)) {
                epgUrls.push(url);
            } else if (freeSlots > 0) {
                epgUrls.push(url);
                freeSlots--;
            } else {
                skippedForSlots++;
            }
        }

        console.log(`EPG da processare: ${epgUrls.length} (${skippedForSlots} saltati per slot pieni, ${alreadyCount}/${maxSlots} già in DB)`);

        if (epgUrls.length === 0) {
            if (skippedForSlots > 0) {
                showNotification(
                    `Slot EPG pieni (${alreadyCount}/${maxSlots}). Elimina un EPG dal manager per liberare spazio.`,
                    true
                );
            }
            return;
        }

        if (skippedForSlots > 0) {
            showNotification(
                `${skippedForSlots} EPG ignorati (slot pieni: ${alreadyCount}/${maxSlots})`,
                false
            );
        }

        const EPG_STALE_MS = 24 * 60 * 60 * 1000;

        async function parallelLimit(items, limit, fn) {
            const results = new Array(items.length);
            let idx = 0;
            async function worker() {
                while (idx < items.length) {
                    const i = idx++;
                    results[i] = await fn(items[i], i);
                }
            }
            await Promise.all(
                Array.from({ length: Math.min(limit, items.length) }, worker)
            );
            return results;
        }

        const downloadResults = await parallelLimit(epgUrls, 2, async (epgUrl) => {
            try {
                console.log(`Processando EPG: ${epgUrl}`);

                const existingEPG = await findEPGByUrl(epgUrl);

                if (existingEPG?.lastFetched
                    && (Date.now() - existingEPG.lastFetched) < EPG_STALE_MS) {
                    console.log(`EPG processato di recente, salto: ${epgUrl}`);
                    return {
                        url: epgUrl,
                        success: true,
                        fromCache: true,
                        name: existingEPG.name
                    };
                }

                const data = await downloadEPG(epgUrl, {
                    setActive: false,
                    updateUI: false,
                    silent: true
                });

                if (data) {
                    console.log(`EPG scaricato: ${epgUrl}`);
                    return {
                        url: epgUrl,
                        success: true,
                        fromCache: false,
                        name: epgUrl.split('/').pop() || 'EPG',
                        channelCount: data.length
                    };
                }
                return { url: epgUrl, success: false, fromCache: false, error: 'Download fallito o dati vuoti' };
            } catch (error) {
                return { url: epgUrl, success: false, fromCache: false, error: error.message };
            }
        });

        const successfulDownloads = downloadResults.filter(r => r.success && !r.fromCache);
        const fromCache           = downloadResults.filter(r => r.success && r.fromCache);
        const failedDownloads     = downloadResults.filter(r => !r.success);

        console.log(`Risultati EPG: ${successfulDownloads.length} nuovi, ${fromCache.length} cache, ${failedDownloads.length} falliti`);

        // Attiva il primo EPG disponibile se non ce n'è già uno attivo
        const activeEPG = await getActiveEPG();
        if (!activeEPG && successfulDownloads.length > 0) {
            const firstSuccess = successfulDownloads[0];
            const epgRec = await findEPGByUrl(firstSuccess.url);
            if (epgRec && epgRec.content) {
                await setOnlyActiveEPG(epgRec.id);
                epgData = epgRec.content;
                rebuildEpgMap();
                console.log(`EPG attivo: ${firstSuccess.url}`);
            }
        }

        if (window.isEPGView && typeof renderEPGManager === 'function') {
            renderEPGManager();
        }

        let notificationMessage = '';
        if (successfulDownloads.length > 0) notificationMessage += `${successfulDownloads.length} EPG scaricati`;
        if (fromCache.length > 0) {
            if (notificationMessage) notificationMessage += ', ';
            notificationMessage += `${fromCache.length} dalla cache`;
        }
        if (failedDownloads.length > 0) {
            if (notificationMessage) notificationMessage += ', ';
            notificationMessage += `${failedDownloads.length} falliti`;
        }
        if (notificationMessage && typeof showNotification === 'function') {
            showNotification(notificationMessage);
        }
    }
}

async function autoLoadEPG(url, name = '', closeAfter = true) {
  if (!url || modalEPGLoadingLock) return;

  if (!url.startsWith('http')) {
    showNotification('URL EPG non valido', true);
    if (closeAfter && typeof closeEPGBottomSheet === 'function') {
      closeEPGBottomSheet();
    }
    return;
  }

  modalEPGLoadingLock = true;
  const loadingEl = document.getElementById('modalEPGLoading');
  const urlInput = document.getElementById('modalEPGUrl');
  const nameInput = document.getElementById('modalEPGName');

  loadingEl.classList.remove('hidden');
  urlInput.disabled = true;
  nameInput.disabled = true;

  try {
    const data = await downloadEPG(url, { setActive: true, updateUI: true });
    if (data === null) {
      if (closeAfter && typeof closeEPGBottomSheet === 'function') {
        closeEPGBottomSheet();
      }
      return;
    }

    showNotification('EPG salvato e caricato');

    try {
      document.getElementById('channelListContainer')?.classList.add('hidden');
      document.getElementById('playerContainer')?.classList.add('hidden');
      const fullEpgContainer = document.getElementById('fullEpgContainer');
      if (fullEpgContainer) fullEpgContainer.classList.remove('hidden');
      if (typeof renderFullEPGList === 'function') {
        renderFullEPGList();
      }
    } catch (uiErr) {
      console.error('Errore aprendo Full EPG dopo salvataggio:', uiErr);
      window.forceEPGReload = true;
      if (typeof renderEPGManager === 'function') renderEPGManager();
    }

    if (closeAfter && typeof closeEPGBottomSheet === 'function') {
      closeEPGBottomSheet();
    }

  } catch (err) {
    console.error('autoLoadEPG error', err);
    if (!err.message?.includes('proxy') && !err.message?.includes('Timeout')) {
      showNotification('Errore imprevisto nel caricamento EPG', true);
    }
  } finally {
    loadingEl.classList.add('hidden');
    urlInput.disabled = false;
    nameInput.disabled = false;
    modalEPGLoadingLock = false;
  }
}

function programsAreIdentical(a, b) {
    const pa = (a && a.programs) || [];
    const pb = (b && b.programs) || [];
    if (pa.length !== pb.length) return false;
    for (let i = 0; i < pa.length; i++) {
        if (pa[i].start !== pb[i].start) return false;
        if (pa[i].end   !== pb[i].end)   return false;
        if (pa[i].title !== pb[i].title) return false;
    }
    return true;
}

function rebuildEpgMap() {
    epgByName.clear();
    epgDisplayList = [];
    if (!epgData || !epgData.length) return;

    const distinctCounters = new Map();

    epgData.forEach(ch => {
        if (ch.id) {
            const idKey = 'id:' + ch.id;
            if (!epgByName.has(idKey)) epgByName.set(idKey, ch);
        }

        if (!ch.name) return;
        const key = normalizeChannelName(ch.name);
        if (!key) return;

        const existing = epgByName.get(key);
        if (!existing) {
            epgByName.set(key, ch);
            epgDisplayList.push(ch);
            distinctCounters.set(key, 1);
            return;
        }

        if (programsAreIdentical(existing, ch)) {
            const existingCount = (existing.programs || []).length;
            const newCount = (ch.programs || []).length;
            if (newCount > existingCount) {
                epgByName.set(key, ch);
                const idx = epgDisplayList.indexOf(existing);
                if (idx !== -1) epgDisplayList[idx] = ch;
            }
            return;
        }

        const n = distinctCounters.get(key) || 1;
        distinctCounters.set(key, n + 1);
        const renamed = Object.assign({}, ch, { name: `${ch.name} (+${n})` });
        epgDisplayList.push(renamed);
    });
}

function hasEPG(channel) {
    if (!epgData || epgData.length === 0) return false;
    if (channel.tvgId && epgByName.has('id:' + channel.tvgId)) return true;
    return epgByName.has(normalizeChannelName(channel.name));
}

function getCurrentProgramInfo(channel) {
    if (!epgData || epgData.length === 0) return null;
    let channelEPG = null;
    if (channel.tvgId) channelEPG = epgByName.get('id:' + channel.tvgId);
    if (!channelEPG)  channelEPG = epgByName.get(normalizeChannelName(channel.name));
    if (!channelEPG || !channelEPG.programs) return null;
    for (const program of channelEPG.programs) {
        if (isProgramCurrentlyAiring(program)) {
            return {
                title: program.title,
                start: new Date(program.start),
                end: new Date(program.end)
            };
        }
    }
    return null;
}

function getCurrentProgramFull(channel) {
    if (!epgData) return null;
    let channelEPG = null;
    if (channel.tvgId) channelEPG = epgByName.get('id:' + channel.tvgId);
    if (!channelEPG)  channelEPG = epgByName.get(normalizeChannelName(channel.name));
    if (!channelEPG || !channelEPG.programs) return null;
    return channelEPG.programs.find(p => isProgramCurrentlyAiring(p)) || null;
}

function findSoftMatchCandidates(list, normEpg) {
  return list.filter(item => {
    const normItem = normalizeChannelName(item.name);
    return normItem && (normItem.includes(normEpg) || normEpg.includes(normItem));
  });
}

async function findChannelFromEPG(epgChannel) {
  if (!epgChannel) return null;
  const epgName = (epgChannel.name || '').trim();
  const normEpg = normalizeChannelName(epgName);

  let foundChannel = null;
  let fromFavorites = false;

  for (let fav of favoriteChannels) {
    const normFav = normalizeChannelName(fav.name);
    if (normFav === normEpg) { foundChannel = fav; fromFavorites = true; break; }
  }

  if (!foundChannel) {
    for (let ch of channels) {
      const normCh = normalizeChannelName(ch.name);
      if (normCh === normEpg) { foundChannel = ch; fromFavorites = false; break; }
    }
  }

  if (!foundChannel) {
    const favMatches = findSoftMatchCandidates(favoriteChannels, normEpg);
    if (favMatches.length === 1) { foundChannel = favMatches[0]; fromFavorites = true; }
    if (!foundChannel) {
      const chMatches = findSoftMatchCandidates(channels, normEpg);
      if (chMatches.length === 1) { foundChannel = chMatches[0]; fromFavorites = false; }
    }
  }

  if (foundChannel) return { channel: foundChannel, fromFavorites: fromFavorites };
  return null;
}

async function renderEPGManager() {
    showingFavorites = false;
    if (typeof updateToggleState === 'function') updateToggleState();
    if (typeof saveViewModePreference === 'function') saveViewModePreference(currentViewMode);

    window.isPlaylistView = false;
    window.isEPGView = true;
    localStorage.setItem('currentView', 'epgManager');

    switchToView('epgManager');

    const epgList = document.getElementById('epgList');
    if (epgList) epgList.style.transition = 'opacity 0.2s ease-in-out';

    const epgs = await getAllEPGUrls();
    const activeEPG = await getActiveEPG();
    const showUrlMode = localStorage.getItem("zappone_show_playlist_url") === "true";

    // La fingerprint include anche il numero di canali in content: se cambia,
    // il manager ri-renderizza. Senza questo, la riga restava con il vecchio
    // conteggio (es. "0 canali") anche dopo un aggiornamento riuscito.
    const fingerprint = `url:${showUrlMode ? 1 : 0}|${(epgs || []).map(e => {
        const cnt = Array.isArray(e.content) ? e.content.length : (typeof e.content === 'string' ? 'str' : '0');
        return `${e.id}:${e.lastFetched || 0}:${cnt}`;
    }).join('|')}`;

    if (epgList && epgList.children.length > 0 && getRenderFingerprint(epgList) === fingerprint) {
        epgList.style.opacity = '1';
        epgList.style.pointerEvents = 'auto';
        epgList.querySelectorAll('.channel-item').forEach(item => {
            const url = item.dataset.url;
            const matched = (epgs || []).find(e => e.url === url);
            item.classList.toggle('active-channel', !!(matched && activeEPG && matched.id === activeEPG.id));
        });
        return;
    }

    const groups = [
        { name: "Aggiungi", channels: [
            { name: "Aggiungi EPG", logo: "", url: "#url", __special: true }
        ]},
        { name: "EPG Salvati", channels: (epgs || []).map(e => ({
            name: e.name || 'EPG senza nome',
            logo: "tasto3-1.svg",
            url: e.url,
            __epgId: e.id,
            __raw: e,
            __isActive: !!(activeEPG && e.id === activeEPG.id)
        }))}
    ];

    renderSavedItemsList(epgList, groups, {
        emptyCheck: (g) => g.length >= 2 && g[1].channels.length === 0,
        emptyState: {
            image: 'noepg.svg',
            alt: 'Carica EPG',
            onClick: () => { if (typeof openEPGBottomSheet === 'function') openEPGBottomSheet(); }
        },

        buildInfoLine: (def) => {
            if (def.__special) return null;
            if (localStorage.getItem("zappone_show_playlist_url") === "true") return def.url;
            try {
                const content = def.__raw?.content;
                let channelCount = 0;
                if (Array.isArray(content)) channelCount = content.length;
                const epgDate = def.__raw?.lastFetched;
                let dateInfo = "Mai aggiornato";
                if (epgDate) {
                    const d = new Date(epgDate);
                    dateInfo = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }
                return `${channelCount} canali, Aggiornato il: ${dateInfo}`;
            } catch (e) { return "Dati EPG non disponibili"; }
        },

        itemActions: (def) => {
            if (def.__special || !def.__epgId) return [];
            return [
                {
                    icon: '↻',
                    title: 'Ricarica questo EPG da remoto',
                    className: 'reload-epg',
                    onClick: async (itemData, itemEl, iconEl) => {
                        try {
                            iconEl.classList.add('loading');
                            await downloadEPG(itemData.url, { setActive: itemData.__isActive, updateUI: true });
                            const rec = await getEPGById(itemData.__epgId);
                            const displayName = rec?.name || itemData.name;
                            showNotification(`EPG "${displayName}" aggiornato`);
                            await renderEPGManager();
                        } catch (err) {
                            showNotification('Errore aggiornamento', true);
                        } finally {
                            iconEl.classList.remove('loading');
                        }
                    }
                },
                {
                    icon: '🗑️',
                    className: 'delete-channel',
                    deletionModeGated: true,
                    onClick: async (itemData) => {
                        if (!confirm('Eliminare questo EPG?')) return;
                        await deleteEPGUrl(itemData.__epgId);
                        await renderEPGManager();
                    }
                }
            ];
        },

        onItemClick: async (def, itemEl) => {
            if (def.__special) {
                if (typeof openEPGBottomSheet === 'function') openEPGBottomSheet();
                return;
            }
            if (!def.__epgId) return;

            const currentActive = await getActiveEPG();
            if (currentActive && currentActive.id === def.__epgId && epgData && epgData.length > 0) {
                if (typeof renderFullEPGList === 'function') renderFullEPGList();
                return;
            }

            if (itemEl) {
                document.getElementById('epgList')?.querySelectorAll('.channel-item.active-channel')
                    .forEach(el => el.classList.remove('active-channel'));
                itemEl.classList.add('active-channel');
            }

            const rec = await getEPGById(def.__epgId);
            if (!rec) return;

            if (rec.content && Array.isArray(rec.content)) {
                await setOnlyActiveEPG(rec.id);
                epgData = rec.content;
                rebuildEpgMap();
            } else {
                // Non dovrebbe capitare (tutti i record hanno content), ma
                // se per qualche motivo manca, lo scarichiamo.
                await downloadEPG(rec.url, { setActive: true, updateUI: true });
            }

            if (typeof renderFullEPGList === 'function') renderFullEPGList();
        },

        onComplete: () => setRenderFingerprint(epgList, fingerprint)
    });
}

function renderFullEPGList() {
  const fullEpgCont = document.getElementById('fullEpgContainer');
  const list = document.getElementById('fullEpgList');
  const header = document.querySelector('#fullEpgContainer .group-header');

  switchToView('fullEpg');

  if (typeof applyFullEpgViewMode === 'function') {
    applyFullEpgViewMode();
    if (typeof fullEpgViewMode !== 'undefined' && fullEpgViewMode === 'grid') {
      return;
    }
  }

  if (list && list.children.length > 0 && epgData === lastRenderedEpgData) {
    return;
  }

  if (epgData && epgData.length) {
    rebuildEpgMap();
  }

  if (list) {
    list.style.transition = 'opacity 0.2s ease-in-out';
    list.style.opacity = '0';
    list.style.pointerEvents = 'none';
  }

  if (fullEpgCont) fullEpgCont.scrollTop = 0;

  if (sharedChannelObserver && list) {
    list.querySelectorAll('img').forEach(img => {
      try { sharedChannelObserver.unobserve(img); } catch (_) {}
    });
  }

  list.innerHTML = '';
  lastRenderedEpgData = epgData;

  if (!epgData || !epgData.length) {
    if (header) header.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems = 'center';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.minHeight = '200px';

    const img = document.createElement('img');
    img.src = 'nofullepg.svg';
    img.alt = 'Nessun EPG disponibile';
    img.className = 'no-epg';
    img.style.height = 'auto';
    img.style.maxHeight = '50vh';
    img.style.cursor = 'pointer';

    wrapper.appendChild(img);
    list.appendChild(wrapper);

    list.style.position = 'relative';
    list.style.height = '100%';
    list.style.opacity = '1';
    list.style.pointerEvents = 'auto';
    return;
  }

  if (header) header.style.display = '';

  list.className = 'group-content list-view';
  const isGridView = false;

  epgDisplayList
    .filter(ch => (ch.programs || []).length > 0)
    .forEach(epgChannel => {
    const item = document.createElement('div');
    item.className = 'channel-item list';
    item.setAttribute('data-name', (epgChannel.name || '').toLowerCase());

    const logo = document.createElement('img');
    logo.className = 'channel-logo';
    logo.dataset.src = sanitizeImageUrl(epgChannel.logo) || EPG_PLACEHOLDER;
    const lazyObserver = getSharedObserver();
    lazyObserver.observe(logo);
    logo.onerror = function() {
      this.onerror = null;
      this.src = EPG_PLACEHOLDER;
      this.style.backgroundColor = 'var(--epg-poster-bg)';
    };
    item.appendChild(logo);

    const nameContainer = document.createElement('div');
    nameContainer.style.flex = '1';
    nameContainer.style.minWidth = '0';

    const title = document.createElement('div');
    title.className = 'channel-name ' + (isGridView ? 'grid-name' : 'list-name');
    title.textContent = epgChannel.name || 'Sconosciuto';
    nameContainer.appendChild(title);

    const prog = (epgChannel.programs || []).find(p => isProgramCurrentlyAiring(p)) || {};
    if (!isGridView && prog && prog.title) {
      const cur = document.createElement('div');
      cur.className = 'current-program';
      cur.textContent = prog.title;
      nameContainer.appendChild(cur);
    }

    item.appendChild(nameContainer);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      openChannelEpgDrawer(epgChannel);
    });

    list.appendChild(item);
  });

  setTimeout(() => {
    list.style.opacity = '1';
    list.style.pointerEvents = 'auto';
  }, 50);
}

function showChannelEPG(channel) {
  const epgContent = document.getElementById('epgContent');

  if (!epgData || epgData.length === 0) {
    epgContent.innerHTML = `<div class="epg-message-container"><div class="epg-message"><p>Nessun dato EPG disponibile. Scarica prima l'EPG.</p></div></div>`;
    return;
  }

  let channelEPG;
  if (_epgPlaybackOverride && _epgPlaybackOverride.channelKey === getChannelKey(channel)) {
    channelEPG = _epgPlaybackOverride.epgChannel;
  } else {
    if (channel.tvgId) channelEPG = epgByName.get('id:' + channel.tvgId);
    if (!channelEPG)  channelEPG = epgByName.get(normalizeChannelName(channel.name));
  }

  if (!channelEPG || !channelEPG.programs || channelEPG.programs.length === 0) {
    epgContent.innerHTML = `<div class="epg-message-container"><div class="epg-message"><p>EPG non disponibile</p></div></div>`;
    return;
  }

  const now = new Date();
  const programs = channelEPG.programs;
  let currentProgramIndex = -1;
  let nextPrograms = [];

  for (let i = 0; i < programs.length; i++) {
    const program = programs[i];
    if (isProgramCurrentlyAiring(program)) {
      currentProgramIndex = i;
      nextPrograms = programs.slice(i, i + 3);
      break;
    }
  }

  if (currentProgramIndex === -1) {
    for (let i = 0; i < programs.length; i++) {
      const startTime = new Date(programs[i].start);
      if (startTime > now) {
        nextPrograms = programs.slice(i, i + 2);
        break;
      }
    }
  }

  if (nextPrograms.length === 0) {
    epgContent.innerHTML = `<div class="epg-message-container"><div class="epg-message"><p>Nessun programma in onda o in programmazione</p></div></div>`;
    return;
  }

  epgContent.innerHTML = '';

  nextPrograms.forEach(program => {
    const startTime = new Date(program.start);
    const endTime = new Date(program.end);
    const isCurrent = isProgramCurrentlyAiring(program);
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    const wrapper = document.createElement('div');
    wrapper.className = 'epg-program' + (isCurrent ? ' current' : '');

    const posterContainer = document.createElement('div');
    posterContainer.className = 'epg-poster-container';

    const img = document.createElement('img');
    img.className = 'epg-poster';
    img.src = sanitizeImageUrl(program.poster) || sanitizeImageUrl(channel.logo) || EPG_PLACEHOLDER;
    img.alt = '';
    posterContainer.appendChild(img);

    const details = document.createElement('div');
    details.className = 'epg-details';

    const titleRow = document.createElement('div');
    titleRow.className = 'epg-title-row';

    const title = document.createElement('span');
    title.className = 'epg-title';
    title.textContent = program.title || 'Titolo non disponibile';

    const time = document.createElement('span');
    time.className = 'epg-time';
    time.textContent =
      startTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) +
      ' - ' +
      endTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

    titleRow.appendChild(title);
    titleRow.appendChild(time);
    details.appendChild(titleRow);

    if (program.subtitle) {
      const sub = document.createElement('div');
      sub.className = 'epg-subtitle';
      sub.textContent = program.subtitle;
      details.appendChild(sub);
    }

    if (program.description) {
      const desc = document.createElement('div');
      desc.className = 'epg-description';
      desc.textContent = program.description;
      details.appendChild(desc);
    }

    const dur = document.createElement('div');
    dur.className = 'epg-duration';
    dur.textContent = durationMinutes + ' min';
    details.appendChild(dur);

    wrapper.appendChild(posterContainer);
    wrapper.appendChild(details);
    epgContent.appendChild(wrapper);
  });
}

function openChannelEpgDrawer(epgChannel){
  const drawer = document.getElementById('channelEpgDrawer');
  const title = document.getElementById('drawerChannelTitle');
  const progContainer = document.getElementById('drawerPrograms');
  const closeBtn = document.getElementById('drawerCloseBtn');

  // Se il drawer è già aperto sullo stesso canale, il contenuto è già
  // quello giusto: ricostruirlo produce solo un flicker (innerHTML='' +
  // ricreazione nodi + scroll smooth verso il programma corrente).
  // Non ci sono dati nuovi da mostrare mentre resta aperto sullo stesso
  // canale, quindi usciamo subito.
  const sameChannelKey = epgChannel.id || epgChannel.name;
  if (drawer.classList.contains('open') && _openDrawerChannelKey === sameChannelKey) {
    return;
  }
  _openDrawerChannelKey = sameChannelKey;

  unobserveContainerImages(progContainer);
  progContainer.innerHTML = '';
  title.textContent = epgChannel.name || 'Canale';

  async function _drawerPlay(epgChannel) {
    if (!channels || channels.length === 0) {
      const activePlaylist = await getActivePlaylist();
      if (activePlaylist && activePlaylist.content) {
        await parseM3U(activePlaylist.content, false, false);
      }
      await loadFavorites();
    }
    const found = await findChannelFromEPG(epgChannel);
    if (found && found.channel) {
      if (typeof closeFullEPG === 'function') closeFullEPG();
      _epgPlaybackOverride = {
        channelKey: getChannelKey(found.channel),
        epgChannel: epgChannel
      };
      showingFavorites = !!found.fromFavorites;
      updateToggleState();
      playStream(found.channel, !!found.fromFavorites);
    } else {
      showNotification('Canale non trovato nella playlist', true);
    }
  }

  const nowPlayingEl = document.getElementById('drawerNowPlaying');
  const nowPlaying = (epgChannel.programs || []).find(p => isProgramCurrentlyAiring(p));

  if (nowPlayingEl) {
    if (nowPlaying) {
      nowPlayingEl.classList.remove('hidden');
      nowPlayingEl.innerHTML = '';

      const poster = document.createElement('div');
      poster.className = 'drawer-now-poster';
      const posterImg = document.createElement('img');
      posterImg.dataset.src = sanitizeImageUrl(nowPlaying.poster)
        || sanitizeImageUrl(epgChannel.logo)
        || EPG_PLACEHOLDER;
      posterImg.alt = '';
      posterImg.onerror = function () {
        this.onerror = null;
        this.src = EPG_PLACEHOLDER;
      };
      getSharedObserver().observe(posterImg);
      poster.appendChild(posterImg);
      nowPlayingEl.appendChild(poster);

      const info = document.createElement('div');
      info.className = 'drawer-now-info';

      const label = document.createElement('div');
      label.className = 'drawer-now-label';
      label.textContent = 'In onda ora';
      info.appendChild(label);

      const titleNow = document.createElement('div');
      titleNow.className = 'drawer-now-title';
      titleNow.textContent = nowPlaying.title || 'Programma';
      info.appendChild(titleNow);

      const timeNow = document.createElement('div');
      timeNow.className = 'drawer-now-time';
      timeNow.textContent = formatTime(nowPlaying.start) + ' - ' + formatTime(nowPlaying.end);
      info.appendChild(timeNow);

      const progressBar = document.createElement('div');
      progressBar.className = 'drawer-now-progress';
      const progressFill = document.createElement('div');
      progressFill.className = 'drawer-now-progress-fill';
      progressFill.style.width = getProgramProgress(nowPlaying.start, nowPlaying.end) + '%';
      progressBar.appendChild(progressFill);
      info.appendChild(progressBar);

      nowPlayingEl.appendChild(info);

      const playNowBtn = document.createElement('button');
      playNowBtn.type = 'button';
      playNowBtn.className = 'drawer-now-play';
      playNowBtn.title = 'Riproduci programma corrente';
      playNowBtn.textContent = '▶';
      playNowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _drawerPlay(epgChannel);
      });
      nowPlayingEl.appendChild(playNowBtn);

    } else {
      nowPlayingEl.classList.add('hidden');
      nowPlayingEl.innerHTML = '';
    }
  }

  epgChannel.programs.forEach(pr => {
    const prEl = document.createElement('div');
    const isCurrent = isProgramCurrentlyAiring(pr);
    prEl.className = 'epg-program' + (isCurrent ? ' current' : '');

    const programDate = new Date(pr.start);
    const dateStr = programDate.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });

    const posterWrap = document.createElement('div');
    posterWrap.className = 'poster-with-date';

    const posterContainer = document.createElement('div');
    posterContainer.className = 'epg-poster-container';

    const img = document.createElement('img');
    img.className = 'epg-poster';
    img.dataset.src = sanitizeImageUrl(pr.poster) || sanitizeImageUrl(epgChannel.logo) || EPG_PLACEHOLDER;
    img.alt = '';
    img.onerror = function () {
      this.onerror = null;
      this.src = EPG_PLACEHOLDER;
    };
    getSharedObserver().observe(img);

    posterContainer.appendChild(img);
    posterWrap.appendChild(posterContainer);

    const dateEl = document.createElement('div');
    dateEl.className = 'epg-time';
    dateEl.textContent = dateStr;
    posterWrap.appendChild(dateEl);

    const timeEl = document.createElement('div');
    timeEl.className = 'epg-time';
    timeEl.textContent = formatTime(pr.start) + ' - ' + formatTime(pr.end);
    posterWrap.appendChild(timeEl);

    if (isCurrent) {
      const progressContainer = document.createElement('div');
      progressContainer.className = 'epg-progress-bar-container';
      const progressBar = document.createElement('div');
      progressBar.className = 'epg-progress-bar';
      progressBar.style.width = getProgramProgress(pr.start, pr.end) + '%';
      progressContainer.appendChild(progressBar);
      posterWrap.appendChild(progressContainer);
    }

    const details = document.createElement('div');
    details.className = 'epg-details';

    const titleRow = document.createElement('div');
    titleRow.className = 'epg-title-row';

    const programTitle = document.createElement('span');
    programTitle.className = 'epg-title';
    programTitle.textContent = pr.title || '';
    titleRow.appendChild(programTitle);

    details.appendChild(titleRow);

    if (pr.subtitle) {
      const sub = document.createElement('div');
      sub.className = 'epg-subtitle';
      sub.textContent = pr.subtitle;
      details.appendChild(sub);
    }

    if (pr.description) {
      const desc = document.createElement('div');
      desc.className = 'epg-description';
      desc.textContent = pr.description;
      details.appendChild(desc);
    }

    prEl.appendChild(posterWrap);
    prEl.appendChild(details);
    progContainer.appendChild(prEl);
  });

  drawer.classList.remove('hidden');
  drawer.classList.add('open');

  requestAnimationFrame(() => {
    const target = progContainer.querySelector('.epg-program.current');
    if (target) {
      const targetPosition = target.offsetTop - progContainer.offsetTop - 12;
      progContainer.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  });

  closeBtn.onclick = () => {
    drawer.classList.remove('open');
    setTimeout(() => drawer.classList.add('hidden'), 300);
  };
}

function toggleEPG() {
  const content = document.getElementById('epgContent');
  const arrow = document.querySelector('#epgHeader .metadata-arrow');
  const isCollapsed = content.style.display === 'none';

  content.style.display = isCollapsed ? 'block' : 'none';
  arrow.classList.toggle('collapsed', !isCollapsed);
  localStorage.setItem('epgCollapsed', String(!isCollapsed));

  if (!isCollapsed && window.currentChannelUrl) {
    const currentChannel = channels.find(ch => getChannelKey(ch) === window.currentChannelUrl);
    if (currentChannel) showChannelEPG(currentChannel);
  }
}

function closeFullEPG() {
    _epgPlaybackOverride = null;

    const drawer = document.getElementById('channelEpgDrawer');
    const fullEpgContainer = document.getElementById('fullEpgContainer');
    const channelEpgDetail = document.getElementById('channelEpgDetail');

    if (drawer) {
        drawer.classList.remove('open');
        setTimeout(() => drawer.classList.add('hidden'), 300);
    }

    if (fullEpgContainer && !fullEpgContainer.classList.contains('hidden')) {
        fullEpgContainer.classList.add('hidden');
    }
    if (channelEpgDetail && !channelEpgDetail.classList.contains('hidden')) {
        channelEpgDetail.classList.add('hidden');
    }

    const wasInEpgManager = localStorage.getItem('lastViewBeforeFullEPG') === 'epgManager';

    if (wasInEpgManager) {
        document.getElementById('epgListContainer').classList.remove('hidden');
        document.getElementById('channelListContainer').classList.add('hidden');
        document.getElementById('playerContainer').classList.add('hidden');
        window.isEPGView = true;
    } else {
        document.getElementById('channelListContainer').classList.remove('hidden');
        document.getElementById('playerContainer').classList.remove('hidden');
        window.isEPGView = false;
    }

    localStorage.removeItem('lastViewBeforeFullEPG');
}

function openEPGBottomSheet() {
  const bottomSheet = document.getElementById("epgUrlBottomSheet");
  const overlay = document.getElementById("bottomSheetOverlayEPG");
  bottomSheet.classList.remove("hidden");
  overlay.classList.remove("hidden");
  setTimeout(() => {
    bottomSheet.classList.add("open");
    overlay.classList.add("open");
  }, 10);
  setTimeout(() => {
    document.getElementById("modalEPGName")?.focus();
  }, 300);
}

function closeEPGBottomSheet() {
  const bottomSheet = document.getElementById("epgUrlBottomSheet");
  const overlay = document.getElementById("bottomSheetOverlayEPG");
  bottomSheet.classList.remove("open");
  overlay.classList.remove("open");
  setTimeout(() => {
    bottomSheet.classList.add("hidden");
    overlay.classList.add("hidden");
  }, 300);
}