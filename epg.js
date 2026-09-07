// ================================================================
//  MODULO EPG - ZappOne
//  Download, parsing (XML/XMLTV e JSON), indicizzazione e rendering
//  della guida programmi (EPG). Estratto da zappone.js per isolare
//  la logica EPG dal resto dell'app.
//
//  Dipendenze globali attese da altri file (devono essere già caricati
//  prima di questo script, come per license.js/db.js/m3u-parser.js):
//   - appConfig, epgUrl                         (da license.js)
//   - findEPGByUrl, saveAndActivateEPG,
//     getAllEPGUrls, getActiveEPG, updateEPGRecord,
//     deleteEPGUrl                              (da db.js)
//   - channels, groupedChannels, showingFavorites,
//     favoriteChannels, getChannelKey           (da zappone.js)
//   - showNotification, window.isEPGView,
//     window.isPlaylistView                     (da zappone.js)
//
//  Funzioni qui definite chiamate da altri file (cross-file, come già
//  avveniva prima con controlli difensivi "typeof ... === 'function'"):
//   - player.js       -> showChannelEPG()
//   - m3u-parser.js   -> handleEPGLoading()
//   - zappone.js      -> tutte le altre (rendering, bottom sheet, ecc.)
// ================================================================

// ================================
// STATO GLOBALE EPG
// ================================
let epgData = [];
let epgByName = new Map(); // indice veloce per nome canale normalizzato

// FUNZIONE: Normalizzazione nome canale (centralizzata)
function normalizeChannelName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Rimuove accenti
    .replace(/[^a-z0-9]/g, '') // Tiene solo caratteri alfanumerici
    .replace(/\s+/g, '') // Rimuove spazi
    .replace(/(hd|sd|fhd)$/, ''); // Rimuove suffix qualità
}

// FUNZIONE: Converti data XMLTV in Date object
function parseXMLTVDate(xmltvDate) {
  // Formato: YYYYMMDDHHMMSS ±ZZZZ (es. 20230801180000 +0200)
  //
  // FIX: alcune fonti XMLTV (specie quelle aggregate da più provider) hanno
  // singole voci <programme> senza start/stop, o con valori troncati/non
  // numerici. Prima questa funzione lanciava un'eccezione in quel caso
  // (xmltvDate.substring su null/xmltvDate non valido), che risaliva fino a
  // parseXMLTV() e faceva fallire l'intero EPG per colpa di UNA voce sola.
  // Ora ritorna null in modo controllato: il chiamante scarta solo quella voce.
  if (!xmltvDate || typeof xmltvDate !== 'string' || xmltvDate.length < 14) {
    return null;
  }

  const year = parseInt(xmltvDate.substring(0, 4));
  const month = parseInt(xmltvDate.substring(4, 6)) - 1;
  const day = parseInt(xmltvDate.substring(6, 8));
  const hour = parseInt(xmltvDate.substring(8, 10));
  const minute = parseInt(xmltvDate.substring(10, 12));
  const second = parseInt(xmltvDate.substring(12, 14));
  const tzOffset = xmltvDate.substring(15);
  
  // Crea una data in UTC (ignorando l'offset per ora)
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (isNaN(date.getTime())) return null; // componenti non numerici (es. "abcd....")
  
  // Gestione corretta del fuso orario
  if (tzOffset && tzOffset.length >= 5) {
    const sign = tzOffset[0]; // '+' o '-'
    const offsetHours = parseInt(tzOffset.substring(1, 3));
    const offsetMinutes = parseInt(tzOffset.substring(3, 5));
    if (!isNaN(offsetHours) && !isNaN(offsetMinutes)) {
      const offsetMs = (offsetHours * 60 + offsetMinutes) * 60000;
      
      // Se è UTC+2, dobbiamo SOTTRARRE 2 ore per ottenere l'UTC
      // Se è UTC-5, dobbiamo AGGIUNGERE 5 ore per ottenere l'UTC
      if (sign === '+') {
        date.setTime(date.getTime() - offsetMs);
      } else if (sign === '-') {
        date.setTime(date.getTime() + offsetMs);
      }
    }
  }
  
  return date;
}

// FUNZIONE CENTRALE: Verifica se un programma è attualmente in onda
function isProgramCurrentlyAiring(program) {
    if (!program || !program.start || !program.end) return false;
    
    const now = new Date();
    const start = new Date(program.start);
    const end = new Date(program.end);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    
    // MODIFICA: Se i dati sono invertiti o assurdi (es. più di 12 ore), non considerarlo "in onda"
    const duration = end - start;
    if (duration <= 0 || duration > 43200000) return false;
    
    return start <= now && now < end;
}

// FUNZIONE Calcolo percentuale avanzamento 
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

// FUNZIONE: Prova a scaricare un URL EPG DIRETTAMENTE dal browser, senza passare
// dal proxy Netlify. Molte fonti EPG pubbliche (GitHub raw, jsdelivr, mirror di
// aggregatori EPG) inviano già header CORS permissivi (Access-Control-Allow-Origin),
// quindi il browser può scaricarle direttamente. Conviene provarci prima perché:
//  - un file EPG (specie .gz) può facilmente pesare diversi MB, e Netlify Functions
//    limita le risposte "bufferizzate" (come cors-proxy.js) a 6MB totali — per
//    contenuto binario, la codifica base64 necessaria per trasportarlo intatto
//    (vedi fix precedente su cors-proxy.js) aggiunge un ulteriore ~33%, riducendo
//    la soglia realmente utilizzabile a circa 4.5MB. Oltre quella soglia, Netlify
//    risponde con un errore a livello di gateway (502 Bad Gateway), non un errore
//    controllato della nostra funzione.
//  - un fetch diretto, quando funziona, è anche più veloce (un hop di rete in meno)
//    e non consuma invocazioni della function.
// Se il fetch diretto fallisce (CORS bloccato, rete assente, timeout), si ritorna
// null e il chiamante ricorre normalmente al proxy (che resta necessario per fonti
// senza CORS o dietro autenticazione).
async function tryDirectFetch(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch (e) {
    // Fallimento CORS, di rete o timeout: si prosegue col proxy.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// FUNZIONE: Scarica il binario di un EPG, provando prima il percorso diretto e
// ricadendo sul proxy (con licenza/JWT) solo se necessario.
async function fetchEPGBinary(targetUrl) {
  const direct = await tryDirectFetch(targetUrl);
  if (direct) {
    console.log('EPG scaricato direttamente (CORS ok): nessun proxy necessario.');
    return direct;
  }
  console.log('Fetch diretto EPG non disponibile (CORS/rete): uso il proxy.');
  return await fetchM3UWithProxies(targetUrl, 'arrayBuffer');
}

// FUNZIONE: Download EPG da URL - VERSIONE CORRETTA (Usa Licenza)
async function downloadEPG(url = appConfig.epgUrl, options = {}) {
  const { setActive = true, updateUI = true, silent = false } = options;

  // 1. Validazione URL (Usa appConfig se url è nullo)
  const targetUrl = url || appConfig.epgUrl;
  if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
    if (!silent) showNotification('URL EPG non valido o non configurato', true);
    return null;
  }

  const btn = document.getElementById('downloadEpgBtn');
  if (btn) btn.classList.add('loading');
  
  try {
    console.log(`Iniziando download EPG sicuro da: ${targetUrl}`);
    
    // --- IL CUORE DELLA PROTEZIONE ---
    // Invece di mappare i proxy qui, usiamo la funzione che gestisce licenza e whitelist
   
 


// Scarica come ArrayBuffer per gestire eventuale compressione GZip.
// FIX: prova prima un fetch diretto (vedi fetchEPGBinary) per evitare il limite
// di dimensione risposta del proxy Netlify su file EPG di alcuni MB.
const buffer = await fetchEPGBinary(targetUrl);
if (!buffer) throw new Error("Impossibile recuperare i dati (Licenza non valida o errore server)");

let responseText;

// Controlla il magic number GZip (0x1f 0x8b)
const view = new Uint8Array(buffer);
if (view.length > 1 && view[0] === 0x1f && view[1] === 0x8b) {
    // Il contenuto è compresso: decomprimilo
    const blob = new Blob([buffer]);
    const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    responseText = await new Response(decompressedStream).text();
} else {
    // Caso normale: decodifica come UTF-8
    const decoder = new TextDecoder('utf-8');
    responseText = decoder.decode(buffer);
}




    // Parsing XML/JSON (Manteniamo la tua logica originale)
    const isXML = responseText.trim().startsWith('<') || responseText.includes('<tv>');
    let data;
    
    try {
      if (isXML) {
        const xmlDoc = new DOMParser().parseFromString(responseText, "text/xml");
        if (xmlDoc.getElementsByTagName("parsererror").length) {
          throw new Error('XML malformato');
        }
        data = parseXMLTV(xmlDoc);
      } else {
        data = JSON.parse(responseText);
      }
    } catch (parseError) {
      throw new Error(`Errore parsing EPG: ${parseError.message}`);
    }

    // Validazione robusta 
    if (!Array.isArray(data)) throw new Error('Struttura EPG non valida');
    const validChannels = data.filter(ch => ch && ch.name);
    if (validChannels.length === 0) throw new Error('EPG vuoto');

    const name = targetUrl.split('/').pop() || 'EPG';
    
    // Salvataggio (Tua logica originale)
    await saveAndActivateEPG({ 
      url: targetUrl, 
      name, 
      content: JSON.stringify(data) 
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
    if (!silent) showNotification(error.message, true);
    return null;
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

// FUNZIONE: Parser XMLTV to JSON
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
  // FIX bug 1: scarta qui le singole <programme> con start/stop mancanti o non
  // parsabili (parseXMLTVDate ora ritorna null in quel caso, vedi sopra), così
  // una voce malformata viene semplicemente ignorata invece di far fallire
  // l'intero parsing EPG più sotto (p.start.toISOString() altrimenti lancerebbe
  // su una data invalida).
  .filter(p => p.start instanceof Date && !isNaN(p.start.getTime()) && p.end instanceof Date && !isNaN(p.end.getTime()));

  return channels.map(channel => {
    return {
      ...channel,
      programs: programmes
        .filter(p => p.channel === channel.id)
        // MODIFICA: Filtriamo i programmi corrotti qui
        .filter(p => {
           const duration = p.end - p.start;
           // Scarta se la fine è prima dell'inizio o se dura più di 12 ore (43200000 ms)
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

// FUNZIONE HELPER: Gestione EPG separata 
async function handleEPGLoading(headerLine) {
const REGEX = { EPG: /(?:x-tvg-url|url-tvg)="(.*?)"/i };
    const epgMatch = headerLine.match(REGEX.EPG);
    
    if (epgMatch) {
        const epgUrls = epgMatch[1].split(',').map(u => u.trim()).filter(u => u);
        
        console.log(`Trovati ${epgUrls.length} URL EPG nella playlist:`, epgUrls);
        
        if (epgUrls.length === 0) return;

        //  CORREZIONE: Disabilita temporaneamente le notifiche per tutti i download
        const originalShowNotification = window.showNotification;
        window.showNotification = () => {}; // Disabilita notifiche durante il batch
        
        try {
            //  CORREZIONE: Processa TUTTI gli EPG in sequenza per evitare race conditions
            const downloadResults = [];
            
            for (const epgUrl of epgUrls) {
                try {
                    console.log(`Processando EPG: ${epgUrl}`);
                    
                    // Controlla se l'EPG è già in IDB
                    const existingEPG = await findEPGByUrl(epgUrl);
                    if (existingEPG) {
                        console.log(`EPG già presente in IDB: ${epgUrl}`);
                        downloadResults.push({ 
                            url: epgUrl, 
                            success: true, 
                            fromCache: true,
                            name: existingEPG.name 
                        });
                        continue; // Passa al prossimo
                    }
                    
                    //  CORREZIONE: Scarica ogni EPG individualmente con opzioni corrette
                    const data = await downloadEPG(epgUrl, { 
                        setActive: false, 
                        updateUI: false, 
                        silent: true 
                    });
                    
                    if (data) {
                        downloadResults.push({ 
                            url: epgUrl, 
                            success: true, 
                            fromCache: false,
                            name: epgUrl.split('/').pop() || 'EPG',
                            channelCount: data.length
                        });
                        console.log(` EPG scaricato con successo: ${epgUrl}`);
                    } else {
                        downloadResults.push({ 
                            url: epgUrl, 
                            success: false, 
                            fromCache: false,
                            error: 'Download fallito o dati vuoti'
                        });
                        console.warn(` Download EPG fallito: ${epgUrl}`);
                    }
                } catch (error) {
                    downloadResults.push({ 
                        url: epgUrl, 
                        success: false, 
                        fromCache: false,
                        error: error.message 
                    });
                    console.error(`Errore durante il download di ${epgUrl}:`, error);
                }
            }
            
            //  CORREZIONE: Gestione post-download per TUTTI gli EPG
            const successfulDownloads = downloadResults.filter(r => r.success && !r.fromCache);
            const fromCache = downloadResults.filter(r => r.success && r.fromCache);
            const failedDownloads = downloadResults.filter(r => !r.success);
            
            console.log(`Risultati download EPG: ${successfulDownloads.length} nuovi, ${fromCache.length} dalla cache, ${failedDownloads.length} falliti`);
            
            //  CORREZIONE: Gestione EPG attivo - solo se necessario
            const totalEPGs = await getAllEPGUrls();
            const activeEPG = await getActiveEPG();
            
            if (!activeEPG && successfulDownloads.length > 0) {
                // Imposta il primo EPG scaricato con successo come attivo
                const firstSuccess = successfulDownloads[0];
                if (firstSuccess) {
                    const epgRec = await findEPGByUrl(firstSuccess.url);
                    if (epgRec) {
                        await setOnlyActiveEPG(epgRec.id);
                        // Carica i dati in memoria
                        if (epgRec.content) {
                            try {
                                let data;
                                const responseText = epgRec.content;
                               
data = JSON.parse(responseText);

                                epgData = data;
                                console.log(` EPG attivo impostato: ${firstSuccess.url}`);
rebuildEpgMap();
                            } catch (err) {
                                console.warn('Errore nel caricamento EPG attivo:', err);
                            }
                        }
                    }
                }
            }
            
            //  CORREZIONE: Aggiorna l'EPG manager per mostrare tutti gli EPG
            if (window.isEPGView && typeof renderEPGManager === 'function') {
                renderEPGManager();
            }
            
            //  CORREZIONE: Notifica riassuntiva di tutti i download
            let notificationMessage = '';
            if (successfulDownloads.length > 0) {
                notificationMessage += `${successfulDownloads.length} EPG scaricati`;
            }
            if (fromCache.length > 0) {
                if (notificationMessage) notificationMessage += ', ';
                notificationMessage += `${fromCache.length} dalla cache`;
            }
            if (failedDownloads.length > 0) {
                if (notificationMessage) notificationMessage += ', ';
                notificationMessage += `${failedDownloads.length} falliti`;
            }
            
            if (notificationMessage) {
                // Ripristina showNotification e mostra il messaggio riassuntivo
                window.showNotification = originalShowNotification;
                showNotification(notificationMessage);
            }
            
        } catch (error) {
            console.error('Errore durante il processing batch EPG:', error);
            // Ripristina showNotification in caso di errore
            window.showNotification = originalShowNotification;
            showNotification('Errore durante il caricamento EPG automatico', true);
        } finally {
            //  CORREZIONE: Ripristina sempre la funzione originale
            window.showNotification = originalShowNotification;
        }
    }
}

async function autoLoadEPG(url, name = '', closeAfter = true) {
  if (!url || modalEPGLoadingLock) return;
  
  // Validazione URL di base
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
    //  MODIFICA: Chiama downloadEPG con setActive: true per caricamento manuale
    const data = await downloadEPG(url, { setActive: true, updateUI: true });
    if (data === null) {
      if (closeAfter && typeof closeEPGBottomSheet === 'function') {
        closeEPGBottomSheet();
      }
      return;
    }

    //  MODIFICA: Non serve più salvare qui perché downloadEPG già chiama saveAndActivateEPG
    // epgData è già stato impostato da downloadEPG quando setActive: true
    
    showNotification('EPG salvato e caricato');

    //  Mostra direttamente la vista FULL EPG invece della lista
    try {
      // Nascondi lista canali e player
      document.getElementById('channelListContainer')?.classList.add('hidden');
      document.getElementById('playerContainer')?.classList.add('hidden');

      // Mostra contenitore EPG completo
      const fullEpgContainer = document.getElementById('fullEpgContainer');
      if (fullEpgContainer) fullEpgContainer.classList.remove('hidden');

      // Renderizza l'EPG completo
      if (typeof renderFullEPGList === 'function') {
        renderFullEPGList();
      }

} catch (uiErr) {
      console.error('Errore aprendo Full EPG dopo salvataggio:', uiErr);
      // fallback: aggiorna lista se qualcosa va storto
      window.forceEPGReload = true; // Forza il refresh della lista EPG
      if (typeof renderEPGManager === 'function') renderEPGManager();
    }

    // Chiudi il bottom sheet (dopo aver aperto il full EPG)
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

// Utility per ricostruire le map EPG
function rebuildEpgMap() {
    epgByName.clear();
    if (!epgData || !epgData.length) return;
    epgData.forEach(ch => {
        if (!ch.name) return;
        const key = normalizeChannelName(ch.name);
        if (!key) return;

        const existing = epgByName.get(key);
        if (existing) {
            // FIX bug 2: prima qui si sovrascriveva sempre con lultima voce
            // incontrata (Map.set), perdendo silenziosamente i programmi del
            // canale precedente ogni volta che due voci EPG normalizzavano
            // nella stessa chiave (tipico con varianti SD/HD dello stesso
            // canale). Ora si tiene quella con PIÙ programmi (dato più
            // completo) invece dellultima per ordine, e si segnala la
            // collisione in console per poterla diagnosticare.
            const existingCount = (existing.programs || []).length;
            const newCount = (ch.programs || []).length;
            console.warn(
                `EPG: collisione sul nome normalizzato "${key}" tra "${existing.name}" (${existingCount} programmi) e "${ch.name}" (${newCount} programmi). Tengo quella con più dati.`
            );
            if (newCount <= existingCount) return; // tieni quella già presente in mappa
        }

        epgByName.set(key, ch);
    });
}

// FUNZIONE: Verifica se un canale ha dati EPG
function hasEPG(channel) {
    if (!epgData || epgData.length === 0) return false;
    
    const channelName = normalizeChannelName(channel.name);
// Sostituisci con:
return epgByName.has(normalizeChannelName(channel.name));
}

// FUNZIONE: Ottiene info sul programma corrente (usa funzione centrale)
function getCurrentProgramInfo(channel) {
    if (!epgData || epgData.length === 0) return null;
    
    const channelName = normalizeChannelName(channel.name);
// Sostituisci le righe con epgData.find con:
const channelEPG = epgByName.get(normalizeChannelName(channel.name));
    
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

/**
 * Returns the current program object (with poster) for a channel, or null.
 */
function getCurrentProgramFull(channel) {
    if (!epgData) return null;
    const channelEPG = epgByName.get(normalizeChannelName(channel.name));
    if (!channelEPG || !channelEPG.programs) return null;
    return channelEPG.programs.find(p => isProgramCurrentlyAiring(p)) || null;
}

// FIX bug 3: raccoglie tutti i canali il cui nome normalizzato contiene (o è
// contenuto in) normEpg, invece di fermarsi al primo trovato. Un match per
// sottostringa senza questo controllo produce falsi positivi con nomi brevi o
// generici: un canale EPG chiamato "Sport" combaciava indifferentemente con
// "Sky Sport 1", "Eurosport" o "DAZN Sport HD", e veniva scelto semplicemente
// il primo nell'array, non il più simile.
function findSoftMatchCandidates(list, normEpg) {
  return list.filter(item => {
    const normItem = normalizeChannelName(item.name);
    return normItem && (normItem.includes(normEpg) || normEpg.includes(normItem));
  });
}

// Helper: trova il canale nella playlist partendo dall'epgChannel
async function findChannelFromEPG(epgChannel) {
  if (!epgChannel) return null;
  const epgName = (epgChannel.name || '').trim();
  const normEpg = normalizeChannelName(epgName);
  
  console.log(' Cercando canale EPG:', epgName, 'Normalizzato:', normEpg);

  

  let foundChannel = null;
  let fromFavorites = false;

  // --- 1. CERCA PRIMA NEI PREFERITI (Priorità Utente) ---
  for (let fav of favoriteChannels) {
    const normFav = normalizeChannelName(fav.name);
    if (normFav === normEpg) {
      foundChannel = fav;
      fromFavorites = true;
      console.log(' Trovato NEI PREFERITI (Priorità):', fav.name);
      break;
    }
  }

  // --- 2. SE NON TROVATO, CERCA NELLA LISTA PRINCIPALE ---
  if (!foundChannel) {
    for (let ch of channels) {
      const normCh = normalizeChannelName(ch.name);
      if (normCh === normEpg) {
        foundChannel = ch;
        fromFavorites = false;
        console.log(' Trovato in lista principale:', ch.name);
        break;
      }
    }
  }

  // --- 3. SE ANCORA NON TROVATO, TENTATIVO MATCHING "SOFT" (solo se univoco) ---
  if (!foundChannel) {
    console.log(' Tentativo matching soft...');

    // Prova prima il soft match sui PREFERITI
    const favMatches = findSoftMatchCandidates(favoriteChannels, normEpg);
    if (favMatches.length === 1) {
      foundChannel = favMatches[0];
      fromFavorites = true;
      console.log(' Trovato con matching soft NEI PREFERITI:', foundChannel.name);
    } else if (favMatches.length > 1) {
      console.log(` Matching soft ambiguo nei preferiti (${favMatches.length} candidati, scartato):`, favMatches.map(f => f.name));
    }

    // Se ancora nulla, prova il soft match sulla LISTA GENERALE
    if (!foundChannel) {
      const chMatches = findSoftMatchCandidates(channels, normEpg);
      if (chMatches.length === 1) {
        foundChannel = chMatches[0];
        fromFavorites = false;
        console.log(' Trovato con matching soft in lista principale:', foundChannel.name);
      } else if (chMatches.length > 1) {
        console.log(` Matching soft ambiguo in lista principale (${chMatches.length} candidati, scartato):`, chMatches.map(c => c.name));
      }
    }
  }

  if (foundChannel) {
    return { channel: foundChannel, fromFavorites: fromFavorites };
  }

  console.log(' Nessun match trovato per:', epgName);
  return null;
}

async function renderEPGManager() {
    // 1. STATI E VISIBILITÀ
    showingFavorites = false;
    if (typeof updateToggleState === 'function') updateToggleState();
    if (typeof saveViewModePreference === 'function') saveViewModePreference(currentViewMode);

    window.isPlaylistView = false;
    window.isEPGView = true;

    // Salva posizione per gestione back
    localStorage.setItem('currentView', 'epgManager');

    const epgListCont = document.getElementById('epgListContainer');
    const epgList = document.getElementById('epgList');
    const channelListCont = document.getElementById('channelListContainer');
    const playlistListCont = document.getElementById('playlistListContainer');
    const fullEpgCont = document.getElementById('fullEpgContainer');

    // Gestione visibilità container
    if (channelListCont) channelListCont.classList.add('hidden');
    if (playlistListCont) playlistListCont.classList.add('hidden');
    if (fullEpgCont) fullEpgCont.classList.add('hidden');
    if (epgListCont) epgListCont.classList.remove('hidden');

    // Reset della visibilità (con transizione)
    if (epgList) {
        epgList.style.transition = 'opacity 0.2s ease-in-out';
        epgList.style.opacity = '0';
        epgList.style.pointerEvents = 'none';
    }

    // 2. RECUPERA DATI EPG
    const epgs = await getAllEPGUrls();
    const activeEPG = await getActiveEPG();

    // --- OTTIMIZZAZIONE MODIFICATA ---
    // Se la lista esiste già E non abbiamo richiesto un ricaricamento forzato...
    if (epgList && epgList.children.length > 0 && !window.forceEPGReload) {
        console.log("Vista EPG Manager già presente, aggiorno solo l'evidenziazione.");
        
        // RENDI SUBITO VISIBILE (è già renderizzata)
        epgList.style.opacity = '1';
        epgList.style.pointerEvents = 'auto';
        
        epgList.querySelectorAll('.channel-item').forEach(item => {
            const epgId = item.getAttribute('data-epg-id');
            item.classList.remove('active-channel');
            if (activeEPG && epgId === String(activeEPG.id)) {
                item.classList.add('active-channel');
            }
        });
        return; // Esce senza ridisegnare
    }
    
    // Se siamo qui, o la lista era vuota o forceEPGReload era true.
    // Svuotiamo il contenitore prima di chiamare il render per evitare duplicati
    if (epgList) epgList.innerHTML = ''; 
    
    // Resettiamo il flag per la prossima volta
    window.forceEPGReload = false;
    // -----------------------------------------------------------------------

    // 3. PREPARAZIONE GRUPPI
    const localGroup = {
        name: "Caricamento",
        channels: [
            {
                name: "Aggiungi EPG",
                logo: "add-epg.svg",
                url: "#url",
                __special: true
            }
        ]
    };

    const savedGroup = {
        name: "EPG Salvati",
        channels: (epgs || []).map(e => ({
            name: e.name || 'EPG senza nome',
            logo: "tasto3-1.svg",
            url: e.url,
            __epgId: e.id,
            __raw: e,
            __isActive: activeEPG && e.id === activeEPG.id
        }))
    };

    const groups = [localGroup, savedGroup];

    // 4. RENDERING NEL CONTAINER
    renderGroupedChannelList(groups, { 
        targetContainer: 'epgList',
        context: 'epg' 
    });

    // 5. POST-PROCESSING (Listeners e icone)
    setTimeout(() => {
        const list = document.getElementById('epgList');
        if (!list) return;
        
        list.querySelectorAll('.channel-item').forEach(item => {
            const url = item.getAttribute('data-url');
            const def = groups.flatMap(g => g.channels).find(c => c.url === url || (c.__special && (url === '#local' || url === '#url')));
            if (!def) return;

            // Attributo fondamentale per l'ottimizzazione del punto 2
            if (def.__epgId) {
                item.setAttribute('data-epg-id', def.__epgId);
            }

            // Evidenziazione iniziale
            item.classList.remove('active-channel');
            if (def.__isActive) item.classList.add('active-channel');

            item.removeAttribute('draggable');
            item.removeAttribute('data-key');
            item.removeAttribute('data-group-index');

            // Icona ricarica EPG (Aggiornamento remoto)
            if (!def.__special && def.__epgId) {
                const reloadIcon = document.createElement('span');
                reloadIcon.className = 'reload-epg';
                reloadIcon.innerHTML = '↻';
                reloadIcon.title = 'Ricarica questo EPG da remoto';

                reloadIcon.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        reloadIcon.classList.add('loading');
                        await downloadEPG(def.url, { setActive: def.__isActive, updateUI: true });
                        showNotification(`EPG "${def.name}" aggiornato`);
                        window.forceEPGReload = true;
                        renderEPGManager(); // Rigenera per aggiornare la data "Aggiornato il..."
                    } catch (err) {
                        showNotification('Errore aggiornamento', true);
                    } finally {
                        reloadIcon.classList.remove('loading');
                    }
                });

                const delBtn = item.querySelector('.delete-channel');
                if (delBtn) delBtn.parentNode.insertBefore(reloadIcon, delBtn);
                else item.appendChild(reloadIcon);
            }

            // Gestione Click Special (Aggiunta)
            if (def.__special) {
                if (url === "#url") {
                    item.onclick = () => {
                        if (typeof openEPGBottomSheet === 'function') openEPGBottomSheet();
                    };
                }
            } 
            // GESTORE CLICK EPG SALVATO (OTTIMIZZATO)
            else if (def.__epgId) {
                item.onclick = async () => {
                    // Se clicco su quello già attivo, passo solo alla vista Full EPG
                    const currentActive = await getActiveEPG();
                    if (currentActive && currentActive.id === def.__epgId && epgData && epgData.length > 0) {
                        document.getElementById('epgListContainer').classList.add('hidden');
                        document.getElementById('fullEpgContainer')?.classList.remove('hidden');
                        if (typeof renderFullEPGList === 'function') renderFullEPGList();
                        return;
                    }

                    // Se è diverso, carica/scarica
                    const rec = await getEPGById(def.__epgId);
                    if (!rec) return;



                 

                if (rec.content) {
    try {
        let data;
        const responseText = rec.content;



            data = JSON.parse(responseText);
    



        await setOnlyActiveEPG(rec.id);
        epgData = data;
rebuildEpgMap();

    } catch (err) {
        // SOLO fallback se il contenuto è corrotto
        await downloadEPG(rec.url, { setActive: true, updateUI: true });
    }
} else {
    // SOLO se non esiste proprio contenuto
    await downloadEPG(rec.url, { setActive: true, updateUI: true });
}





                    document.getElementById('epgListContainer').classList.add('hidden');
                    document.getElementById('fullEpgContainer')?.classList.remove('hidden');
                    if (typeof renderFullEPGList === 'function') renderFullEPGList();
                };

                // Pulsante Elimina
                const delBtn = item.querySelector('.delete-channel');
                if (delBtn) {
                    delBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if (!confirm('Eliminare questo EPG?')) return;
                        await deleteEPGUrl(def.__epgId);
                        window.forceEPGReload = true;
                        renderEPGManager();
                    };
                }
            }

            // INFO AGGIUNTIVE (Seconda riga)
            if (!def.__special && def.url) {
                const infoContainer = item.querySelector('.channel-name')?.parentElement || item.children[1];
                const existingInfo = infoContainer.querySelector('.current-program');
                if (existingInfo) existingInfo.remove();
                
                const infoLine = document.createElement('div');
                infoLine.className = 'current-program';
                
                if (localStorage.getItem("zappone_show_playlist_url") === "true") {
                    infoLine.textContent = def.url;
                } else if (def.__raw) {
                    try {
                        let channelCount = 0;
                        if (def.__raw.content) {
                            const parsed = JSON.parse(def.__raw.content);
                            channelCount = Array.isArray(parsed) ? parsed.length : 0;
                        }
                        const epgDate = def.__raw.lastFetched || def.__raw.timestamp;
                        let dateInfo = "Mai aggiornato";
                        if (epgDate) {
                            const d = new Date(epgDate);
                            dateInfo = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        }
                        infoLine.textContent = `${channelCount} canali, Aggiornato il: ${dateInfo}`;
                    } catch (e) { infoLine.textContent = "Dati EPG non disponibili"; }
                }
                infoContainer.appendChild(infoLine);
            }
        });
    }, 50);
}

// Render lista canali con programma corrente (EPG completo) - versione aggiornata
function renderFullEPGList() {
  const fullEpgCont = document.getElementById('fullEpgContainer');
  const list = document.getElementById('fullEpgList');
  const header = document.querySelector('#fullEpgContainer .group-header');
  
  // --- FIX: ricostruisce la mappa EPG dai dati attuali ---
  if (epgData && epgData.length) {
    rebuildEpgMap();
  }

  // Reset della visibilità (con transizione)
  if (list) {
    list.style.transition = 'opacity 0.2s ease-in-out';
    list.style.opacity = '0';
    list.style.pointerEvents = 'none';
  }
  
  // --- AGGIUNTA: GESTIONE VISIBILITÀ ---
  // 1. Nascondi gli altri contenitori che potrebbero sovrapporsi
  document.getElementById('playlistListContainer')?.classList.add('hidden');
  document.getElementById('epgListContainer')?.classList.add('hidden');
  document.getElementById('channelListContainer')?.classList.add('hidden');

  // 2. Mostra il contenitore EPG completo
  if (fullEpgCont) {
      fullEpgCont.classList.remove('hidden');
      // Forza lo scroll in alto così non vedi pezzi "vecchi"
      fullEpgCont.scrollTop = 0; 
  }
  // -------------------------------------

  // --- FIX MEMORY LEAK: scollega l'observer prima di svuotare il container ---
  if (sharedChannelObserver) {
    sharedChannelObserver.disconnect();
    sharedChannelObserver = null;
  }

  list.innerHTML = '';

 // se non ci sono dati EPG
  if (!epgData || !epgData.length) {
    if (header) header.style.display = 'none';
    
    // Container flex per centrare l'immagine sia orizzontalmente che verticalmente
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems = 'center';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';  // occupa tutto lo spazio disponibile nel container
    wrapper.style.minHeight = '200px'; // evita che sia troppo piccolo su schermi piccoli

    const img = document.createElement('img');
    img.src = 'nofullepg.svg';
    img.alt = 'Nessun EPG disponibile';
    img.className = 'no-epg';  // Usa la stessa classe delle altre immagini
    
    // Dimensione naturale, scalabile verticalmente - STESSO STILE DELLE ALTRE
    img.style.height = 'auto';
    img.style.maxHeight = '50vh';  // RIMOSSO max-width: 60%
    img.style.cursor = 'pointer';
    
    wrapper.appendChild(img);
    list.appendChild(wrapper);
    
    // IMPORTANTE: Assicura che la lista abbia position: relative
    // per il corretto posizionamento dell'immagine assoluta
    list.style.position = 'relative';
    list.style.height = '100%';
    
    // Rendi visibile
    list.style.opacity = '1';
    list.style.pointerEvents = 'auto';
    return;
  }
    

  // se ci sono dati -> assicurati che l'header sia visibile
  if (header) header.style.display = '';

  // Applica la classe corretta per la visualizzazione (list-view | grid-view)
  list.className = 'group-content ' + currentViewMode + '-view';

  const isGridView = currentViewMode === 'grid';

  epgData.forEach(epgChannel => {
    const item = document.createElement('div');
    item.className = 'channel-item ' + currentViewMode; // es. "channel-item grid"
    item.setAttribute('data-name', (epgChannel.name || '').toLowerCase());

    // logo
    const logo = document.createElement('img');
    logo.className = 'channel-logo';
    logo.dataset.src = epgChannel.logo || 'img/placeholder.png';
    // Ottieni un nuovo observer (dopo lo svuotamento)
    const lazyObserver = getSharedObserver();
    lazyObserver.observe(logo);
    logo.onerror = function() {
      this.src = '';
      this.style.backgroundColor = 'var(--epg-poster-bg)';
    };
    item.appendChild(logo);

    // contenitore del nome
    const nameContainer = document.createElement('div');
    nameContainer.style.flex = '1';
    nameContainer.style.minWidth = '0';

    // titolo canale
    const title = document.createElement('div');
    title.className = 'channel-name ' + (isGridView ? 'grid-name' : 'list-name');
    title.textContent = epgChannel.name || 'Sconosciuto';
    nameContainer.appendChild(title);

    // programma corrente (solo in list view)
    const prog = getCurrentProgramInfo({ name: epgChannel.name }) || {};
    if (!isGridView && prog && prog.title) {
      const cur = document.createElement('div');
      cur.className = 'current-program';
      cur.textContent = prog.title;
      nameContainer.appendChild(cur);
    }

    item.appendChild(nameContainer);

    // click → apre il dettaglio EPG (non riproduce)
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      openChannelEpgDrawer(epgChannel);
    });

    list.appendChild(item);
  });

  // Rendi visibile gradualmente
  setTimeout(() => {
    list.style.opacity = '1';
    list.style.pointerEvents = 'auto';
  }, 50);
}

// FUNZIONE: Mostra l'EPG di un canale
function showChannelEPG(channel) {
  const epgContent = document.getElementById('epgContent');
  
  if (!epgData || epgData.length === 0) {
    epgContent.innerHTML = `
      <div class="epg-message-container">
        <div class="epg-message">
          <p>Nessun dato EPG disponibile. Scarica prima l'EPG.</p>
        </div>
      </div>
    `;
    return;
  }

  const normalizedChannelName = normalizeChannelName(channel.name);
// Sostituisci con:
const channelEPG = epgByName.get(normalizeChannelName(channel.name));
  
  if (!channelEPG || !channelEPG.programs || channelEPG.programs.length === 0) {
    epgContent.innerHTML = `
      <div class="epg-message-container">
        <div class="epg-message">
          <p>EPG non disponibile</p>
        </div>
      </div>
    `;
    return;
  }

  const now = new Date();
  const programs = channelEPG.programs;

  // Trova il programma corrente
  let currentProgramIndex = -1;
  let nextPrograms = [];
  
  for (let i = 0; i < programs.length; i++) {
    const program = programs[i];
    const startTime = new Date(program.start);
    const endTime = new Date(program.end);
    
  
    if (isProgramCurrentlyAiring(program)) {
      // Programma corrente trovato
      currentProgramIndex = i;
      // Prendi i prossimi 2 programmi (se disponibili)
      nextPrograms = programs.slice(i, i + 3);
      break;
    }
  }

  // Se non c'è programma corrente, mostra i prossimi 2 programmi
  if (currentProgramIndex === -1) {
    for (let i = 0; i < programs.length; i++) {
      const startTime = new Date(programs[i].start);
      if (startTime > now) {
        nextPrograms = programs.slice(i, i + 2); // Solo 2 futuri
        break;
      }
    }
  }

  // Se non abbiamo programmi da mostrare
  if (nextPrograms.length === 0) {
    epgContent.innerHTML = `
      <div class="epg-message-container">
        <div class="epg-message">
          <p>Nessun programma in onda o in programmazione</p>
        </div>
      </div>
    `;
    return;
  }

 epgContent.innerHTML = ''; // pulisci

nextPrograms.forEach(program => {
  const startTime = new Date(program.start);
  const endTime = new Date(program.end);
  const isCurrent = isProgramCurrentlyAiring(program);
  const durationMinutes = Math.round((endTime - startTime) / 60000);

  // container principale
  const wrapper = document.createElement('div');
  wrapper.className = 'epg-program' + (isCurrent ? ' current' : '');

  // poster
  const posterContainer = document.createElement('div');
  posterContainer.className = 'epg-poster-container';

  const img = document.createElement('img');
  img.className = 'epg-poster';
  img.src = program.poster || channel.logo || 'placeholder.png';
  img.alt = '';
  posterContainer.appendChild(img);

  // details
  const details = document.createElement('div');
  details.className = 'epg-details';

  // titolo + orario
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

  // subtitle
  if (program.subtitle) {
    const sub = document.createElement('div');
    sub.className = 'epg-subtitle';
    sub.textContent = program.subtitle;
    details.appendChild(sub);
  }

  // description
  if (program.description) {
    const desc = document.createElement('div');
    desc.className = 'epg-description';
    desc.textContent = program.description;
    details.appendChild(desc);
  }

  // durata
  const dur = document.createElement('div');
  dur.className = 'epg-duration';
  dur.textContent = durationMinutes + ' min';

  details.appendChild(dur);

  wrapper.appendChild(posterContainer);
  wrapper.appendChild(details);

  epgContent.appendChild(wrapper);
});
}

// Vista EPG dettagliata per canale
function openChannelEpgDrawer(epgChannel){
  const drawer = document.getElementById('channelEpgDrawer');
  const title = document.getElementById('drawerChannelTitle');
  const progContainer = document.getElementById('drawerPrograms');
  const closeBtn = document.getElementById('drawerCloseBtn');

  const playerContainer = document.getElementById('playerContainer');
  const fullEpgContainer = document.getElementById('fullEpgContainer');
  const channelEpgDetail = document.getElementById('channelEpgDetail');
  const channelListContainer = document.getElementById('channelListContainer');

  // reset contenuto
  progContainer.innerHTML = '';
  title.textContent = (epgChannel.name || 'Canale') + " — Programmi";

  epgChannel.programs.forEach(pr => {
    const prEl = document.createElement('div');
    
    // CORREZIONE: usa la nuova funzione centrale
    const isCurrent = isProgramCurrentlyAiring(pr);
    prEl.className = 'epg-program' + (isCurrent ? ' current' : '');

    // calcola la data del programma
    const programDate = new Date(pr.start);
    const dateStr = programDate.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });

    // CORREZIONE: usa isCurrent invece di chiamare di nuovo la funzione
    const progressBar = isCurrent ? `
      <div class="epg-progress-bar-container">
        <div class="epg-progress-bar" style="width: ${getProgramProgress(pr.start, pr.end)}%;"></div>
      </div>
    ` : '';

// === POSTER + DATA ===
const posterWrap = document.createElement('div');
posterWrap.className = 'poster-with-date';

// container immagine
const posterContainer = document.createElement('div');
posterContainer.className = 'epg-poster-container';

const img = document.createElement('img');
img.className = 'epg-poster';
img.src = pr.poster || epgChannel.logo || 'img/placeholder.png';
img.alt = '';

posterContainer.appendChild(img);
posterWrap.appendChild(posterContainer);

// data
const dateEl = document.createElement('div');
dateEl.className = 'epg-time';
dateEl.textContent = dateStr;
posterWrap.appendChild(dateEl);

// orario
const timeEl = document.createElement('div');
timeEl.className = 'epg-time';
timeEl.textContent = formatTime(pr.start) + ' - ' + formatTime(pr.end);
posterWrap.appendChild(timeEl);

// progress bar (se esiste)
if (isCurrent) {
  const progressContainer = document.createElement('div');
  progressContainer.className = 'epg-progress-bar-container';

  const progressBar = document.createElement('div');
  progressBar.className = 'epg-progress-bar';
  progressBar.style.width = getProgramProgress(pr.start, pr.end) + '%';

  progressContainer.appendChild(progressBar);
  posterWrap.appendChild(progressContainer);
}

// === DETAILS ===
const details = document.createElement('div');
details.className = 'epg-details';

// row titolo + bottone
const titleRow = document.createElement('div');
titleRow.className = 'epg-title-row';

// titolo
const title = document.createElement('span');
title.className = 'epg-title';
title.textContent = pr.title || '';
titleRow.appendChild(title);

// 🔥 BOTTONE PLAY (solo programma corrente)
if (isCurrent) {
  const playBtn = document.createElement('button');
  playBtn.className = 'play-btn';
  playBtn.title = 'Riproduci programma corrente';
  playBtn.textContent = '▶';

 playBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    const activePlaylist = await getActivePlaylist();
    if (activePlaylist && activePlaylist.content) {
        await parseM3U(activePlaylist.content, true, false);
    }
    await loadFavorites();
    rebuildIndexMaps();

    const found = await findChannelFromEPG(epgChannel);
    if (found && found.channel) {
        if (typeof closeFullEPG === 'function') closeFullEPG();
        showingFavorites = !!found.fromFavorites;
        updateToggleState();
        playStream(found.channel, !!found.fromFavorites);
    } else {
        showNotification('Canale non trovato nella playlist', true);
    }
});

  titleRow.appendChild(playBtn);
}

details.appendChild(titleRow);

// subtitle
if (pr.subtitle) {
  const sub = document.createElement('div');
  sub.className = 'epg-subtitle';
  sub.textContent = pr.subtitle;
  details.appendChild(sub);
}

// description
if (pr.description) {
  const desc = document.createElement('div');
  desc.className = 'epg-description';
  desc.textContent = pr.description;
  details.appendChild(desc);
}

// === ASSEMBLA TUTTO ===
prEl.appendChild(posterWrap);
prEl.appendChild(details);


   

    progContainer.appendChild(prEl);
  });

  // apri drawer
  drawer.classList.remove('hidden');
  drawer.classList.add('open');

  // autoscroll al programma corrente
  requestAnimationFrame(() => {
    const target = progContainer.querySelector('.epg-program.current');
    if (target) {
      const targetPosition = target.offsetTop - progContainer.offsetTop - 12;
      progContainer.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  });

  // chiudi drawer clic sulla X
  closeBtn.onclick = () => {
    drawer.classList.remove('open');
    setTimeout(() => drawer.classList.add('hidden'), 300);
  };
}

// FUNZIONE: Mostra/nasconde l'EPG
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

// ---------- Helper: chiude la vista Full EPG + drawer dettaglio (copia comportamento "Play") ----------
function closeFullEPG() {
    const drawer = document.getElementById('channelEpgDrawer');
    const fullEpgContainer = document.getElementById('fullEpgContainer');
    const channelEpgDetail = document.getElementById('channelEpgDetail');
    
    // 1) chiudi drawer (come prima)
    if (drawer) {
        drawer.classList.remove('open');
        setTimeout(() => drawer.classList.add('hidden'), 300);
    }

    // 2) nascondi le viste EPG (come prima)
    if (fullEpgContainer && !fullEpgContainer.classList.contains('hidden')) {
        fullEpgContainer.classList.add('hidden');
    }
    if (channelEpgDetail && !channelEpgDetail.classList.contains('hidden')) {
        channelEpgDetail.classList.add('hidden');
    }

    // 3) DECIDI QUALE VISTA MOSTRARE IN BASE AL CONTESTO
    // MODIFICA: Controlla se stavamo visualizzando l'EPG manager prima di aprire il full EPG
    const wasInEpgManager = localStorage.getItem('lastViewBeforeFullEPG') === 'epgManager';
    
    if (wasInEpgManager) {
        // Torna all'EPG manager
        document.getElementById('epgListContainer').classList.remove('hidden');
        document.getElementById('channelListContainer').classList.add('hidden');
        document.getElementById('playerContainer').classList.add('hidden');
        window.isEPGView = true; // Mantieni il flag EPG view
    } else {
        // Torna alla vista canali (comportamento originale)
        document.getElementById('channelListContainer').classList.remove('hidden');
        document.getElementById('playerContainer').classList.remove('hidden');
        window.isEPGView = false;
    }
    
    // Pulisci lo stato
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
