// ===========================================================================
//  03-db.js — Persistenza su IndexedDB (playlist M3U, EPG, preferiti)
//
//  SCHEMA v5 (metadati e payload SEPARATI)
//  ---------------------------------------------------------------------------
//  Vedi documentazione originale per la struttura degli store.
//
//  DEMO MODE
//  ---------------------------------------------------------------------------
//  In demo (appConfig.isPremium !== true) tutte le funzioni di lettura
//  restituiscono dati vuoti e quelle di scrittura sono no-op. I dati
//  premium in IndexedDB restano intatti ma invisibili. Il passaggio
//  premium→demo esegue purgePremiumData() che cancella tutto (vedi
//  zappone.js bootstrap). I contenuti demo vivono in memoria (A10).
//
//  GESTIONE ERRORI (scritture)
//  ---------------------------------------------------------------------------
//  Tutte le scritture si risolvono SOLO a transazione committata
//  (tx.oncomplete) e si rifiutano su tx.onerror / tx.onabort, con l'errore
//  reale (es. QuotaExceededError). Le operazioni composte (salva+attiva,
//  elimina meta+payload, ...) avvengono in UN'UNICA transazione: o riescono
//  del tutto o non cambia nulla. Per mostrare l'errore all'utente nei punti
//  "fire-and-forget" usare dbReportError(err, 'cosa stavi facendo').
// ===========================================================================

const IDB_NAME            = 'M3UPlaylistsDB';
const IDB_VERSION         = 5;
const IDB_STORE_NAME      = 'm3uUrls';      // metadati playlist
const IDB_STORE_NAME_EPG  = 'epgUrls';      // metadati EPG
const IDB_STORE_DATA_M3U  = 'm3uContent';   // payload playlist (testo M3U)
const IDB_STORE_DATA_EPG  = 'epgContent';   // payload EPG (array canali)
const IDB_STORE_FAV       = 'favorites';

let _dbPromise = null;

// ===========================================================================
// 0a. GATE DEMO E PURGE
// ===========================================================================

// In demo mode, IndexedDB è isolato: nessuna lettura (per non mostrare
// dati premium) e nessuna scrittura (per non sovrascrivere i dati premium
// con contenuto demo). I dati demo vivono in memoria (A10-demo-mode.js).
function _canAccessDB() {
  return typeof appConfig !== 'undefined' && !!appConfig && appConfig.isPremium === true;
}

// Cancella tutti i dati dell'app (playlist, EPG, preferiti) SENZA toccare
// licenza né preferenze UI. Chiamata al passaggio premium→demo.
// Bypassa intenzionalmente _canAccessDB() per funzionare in demo.
async function purgePremiumData() {
  try {
    await _idbTx(
      [IDB_STORE_NAME, IDB_STORE_DATA_M3U, IDB_STORE_NAME_EPG, IDB_STORE_DATA_EPG, IDB_STORE_FAV],
      'readwrite',
      (ctx) => {
        ctx.store(IDB_STORE_NAME).clear();
        ctx.store(IDB_STORE_DATA_M3U).clear();
        ctx.store(IDB_STORE_NAME_EPG).clear();
        ctx.store(IDB_STORE_DATA_EPG).clear();
        ctx.store(IDB_STORE_FAV).clear();
        ctx.set(true);
      }
    );
    // Pulisce anche "ultimo canale" (contiene URL premium).
    try {
      localStorage.removeItem('zappone_last_played');
      localStorage.removeItem('zappone_last_played_from_favorites');
      localStorage.removeItem('zappone_last_played_origin');
      localStorage.removeItem('zappone_last_played_epg_ref');
    } catch (_) {}
    console.log('[db] purgePremiumData: dati premium rimossi');
    return true;
  } catch (err) {
    console.error('[db] purgePremiumData failed:', err);
    return false;
  }
}
window.purgePremiumData = purgePremiumData;

// ===========================================================================
// 0b. UTILITÀ INTERNE
// ===========================================================================

/**
 * Esegue una transazione e restituisce una Promise che:
 *  - si risolve con il valore impostato da ctx.set(...) SOLO dopo tx.oncomplete;
 *  - si rifiuta con l'errore reale su tx.onerror / tx.onabort / eccezioni.
 *
 * `work(ctx)` registra le richieste. Dentro `work` NON si usa mai `await`
 * (una transazione IndexedDB si chiude da sola quando non ha richieste in
 * corso): le richieste successive partono dai callback di ctx.req().
 *
 *   ctx.store(nome)        -> IDBObjectStore della transazione
 *   ctx.req(request, fn)   -> fn(risultato) a successo; un'eccezione in fn
 *                             annulla la transazione e rifiuta la Promise
 *   ctx.set(valore)        -> valore con cui si risolve la Promise
 *   ctx.fail(errore)       -> annulla la transazione e rifiuta con `errore`
 */
function _idbTx(storeNames, mode, work) {
  return getDB().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeNames, mode);
    } catch (e) {
      reject(e);
      return;
    }

    let result;
    let failure = null;

    const ctx = {
      store: (name) => tx.objectStore(name),
      set: (value) => { result = value; },
      fail: (err) => {
        if (!failure) failure = err;
        try { tx.abort(); } catch (_) { /* già terminata */ }
      },
      req: (request, onOk) => {
        request.onsuccess = () => {
          try { onOk(request.result, request); }
          catch (e) { ctx.fail(e); }
        };
        return request;
      }
    };

    tx.oncomplete = () => resolve(result);
    tx.onerror = (ev) => {
      // L'errore di una richiesta risale fino alla transazione; poi seguirà onabort.
      if (!failure && ev && ev.target && ev.target.error) failure = ev.target.error;
    };
    tx.onabort = () => {
      reject(
        failure ||
        tx.error ||
        (typeof DOMException === 'function'
          ? new DOMException('Transazione IndexedDB annullata', 'AbortError')
          : new Error('Transazione IndexedDB annullata'))
      );
    };

    try {
      work(ctx);
    } catch (e) {
      ctx.fail(e);
    }
  }));
}

/** Copia del record senza il campo `content` (record legacy non ancora migrati). */
function _idbStripContent(rec) {
  if (!rec || !Object.prototype.hasOwnProperty.call(rec, 'content')) return rec;
  const copy = Object.assign({}, rec);
  delete copy.content;
  return copy;
}

/**
 * Statistiche derivate dal contenuto, salvate nei metadati per non dover
 * rileggere il payload solo per mostrare "N canali, M gruppi".
 *  - m3u: channelCount / groupCount (stesse regole di countChannelsAndGroups)
 *  - epg: channelCount (0 se il contenuto non è un array)
 */
function _idbContentStats(kind, content) {
  try {
    if (kind === 'm3u') {
      if (typeof content === 'string' && typeof countChannelsAndGroups === 'function') {
        const { channelCount, groupCount } = countChannelsAndGroups(content);
        return { channelCount, groupCount };
      }
      return {};
    }
    return { channelCount: Array.isArray(content) ? content.length : 0 };
  } catch (e) {
    console.warn('[db] statistiche contenuto non calcolate:', e && e.message);
    return {};
  }
}

/**
 * Mostra all'utente un errore di salvataggio. Pensata per i punti in cui la
 * scrittura parte "in background" e nessuno attende la Promise.
 *   catch (e) { dbReportError(e, 'salvataggio della playlist'); }
 */
function dbReportError(err, what) {
  console.error('[db]' + (what ? ' ' + what + ':' : ''), err);
  const isQuota = err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message || '')));
  const msg = isQuota
    ? 'spazio di archiviazione esaurito'
    : (err && err.message) ? err.message : 'errore sconosciuto';
  if (typeof showNotification === 'function') {
    showNotification('Salvataggio non riuscito' + (what ? ' (' + what + ')' : '') + ': ' + msg, true);
  }
}

// ===========================================================================
// 1. APERTURA DATABASE, MIGRAZIONE
// ===========================================================================

function _idbEnsureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
}

/**
 * Sposta `content` dai record dei metadati allo store del payload.
 * Gira DENTRO la transazione di upgrade: nessun `await`, solo callback di cursore.
 */
function _idbMigrateContent(upgradeTx, metaName, dataName, kind) {
  const metaStore = upgradeTx.objectStore(metaName);
  const dataStore = upgradeTx.objectStore(dataName);
  const cursorReq = metaStore.openCursor();

  cursorReq.onsuccess = (ev) => {
    const cursor = ev.target.result;
    if (!cursor) return;
    const rec = cursor.value;
    try {
      if (rec && Object.prototype.hasOwnProperty.call(rec, 'content')) {
        const content = rec.content;
        const metaRec = Object.assign({}, rec);
        delete metaRec.content;
        if (content !== undefined && content !== null) {
          dataStore.put({ id: rec.id, content });
          Object.assign(metaRec, _idbContentStats(kind, content));
        }
        cursor.update(metaRec);
      }
    } catch (e) {
      // Record non migrabile: resta com'è, con `content` ancora dentro.
      // getM3UContent()/getEPGContent() ripiegano su quel campo.
      console.warn('[db] migrazione record ' + metaName + '#' + (rec && rec.id) + ' saltata:', e && e.message);
    }
    cursor.continue();
  };
}

function getDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const upgradeTx = request.transaction;
      const oldVersion = event.oldVersion || 0;

      // --- Metadati playlist ---
      let m3uStore;
      if (db.objectStoreNames.contains(IDB_STORE_NAME)) {
        m3uStore = upgradeTx.objectStore(IDB_STORE_NAME);
      } else {
        m3uStore = db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      _idbEnsureIndex(m3uStore, 'by_url', 'url');
      // 'by_active' indicizzava un booleano (chiave non valida in IndexedDB): era sempre vuoto.
      if (m3uStore.indexNames.contains('by_active')) m3uStore.deleteIndex('by_active');

      // --- Metadati EPG ---
      let epgStore;
      if (db.objectStoreNames.contains(IDB_STORE_NAME_EPG)) {
        epgStore = upgradeTx.objectStore(IDB_STORE_NAME_EPG);
      } else {
        epgStore = db.createObjectStore(IDB_STORE_NAME_EPG, { keyPath: 'id', autoIncrement: true });
      }
      _idbEnsureIndex(epgStore, 'by_url', 'url');
      if (epgStore.indexNames.contains('by_active')) epgStore.deleteIndex('by_active');

      // --- Payload ---
      if (!db.objectStoreNames.contains(IDB_STORE_DATA_M3U)) {
        db.createObjectStore(IDB_STORE_DATA_M3U, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDB_STORE_DATA_EPG)) {
        db.createObjectStore(IDB_STORE_DATA_EPG, { keyPath: 'id' });
      }

      // --- Preferiti ---
      if (!db.objectStoreNames.contains(IDB_STORE_FAV)) {
        const favStore = db.createObjectStore(IDB_STORE_FAV, { keyPath: 'key' });
        favStore.createIndex('by_order', 'order', { unique: false });
      }

      // --- Migrazione dei dati esistenti (solo se esistevano già dei record v<5) ---
      if (oldVersion > 0 && oldVersion < 5) {
        _idbMigrateContent(upgradeTx, IDB_STORE_NAME, IDB_STORE_DATA_M3U, 'm3u');
        _idbMigrateContent(upgradeTx, IDB_STORE_NAME_EPG, IDB_STORE_DATA_EPG, 'epg');
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Un'altra scheda sta aggiornando lo schema: chiudi e riapri alla prossima richiesta.
      db.onversionchange = () => { db.close(); _dbPromise = null; };
      // Connessione chiusa dal browser (es. storage evictato).
      db.onclose = () => { _dbPromise = null; };
      resolve(db);
    };

    request.onblocked = () => {
      console.warn('[db] apertura/aggiornamento bloccati da un\'altra scheda ancora aperta: chiudila.');
    };

    request.onerror = () => {
      _dbPromise = null;
      reject(request.error);
    };
  });

  return _dbPromise;
}

async function closeDB() {
  if (!_dbPromise) return;
  try {
    const db = await _dbPromise;
    db.close();
  } catch (_) {
    /* apertura fallita: niente da chiudere */
  } finally {
    _dbPromise = null;
  }
}

// ===========================================================================
// 2. PLAYLIST M3U
// ===========================================================================

// --- CRUD base ---

/** Crea il record dei metadati (senza contenuto). Restituisce l'id. */
async function saveM3UUrl(url, name) {
  if (!_canAccessDB()) return null;
  return _idbTx([IDB_STORE_NAME], 'readwrite', (ctx) => {
    ctx.req(ctx.store(IDB_STORE_NAME).add({ url, name, timestamp: Date.now() }), (id) => ctx.set(id));
  });
}

/**
 * Aggiorna un record. `patch` può contenere `content`: in quel caso il testo
 * va nello store del payload (put diretto, senza rileggere il vecchio) e i
 * conteggi si ricalcolano, a meno che il chiamante non passi già
 * channelCount/groupCount. Resta una scrittura atomica meta+payload.
 * @returns {Promise<boolean>} true se aggiornato, false se il record non esiste
 */
async function updateM3URecord(id, patch) {
  if (!_canAccessDB()) return false;
  const { content, ...metaPatch } = patch || {};
  const hasContent = content !== undefined;
  const stats = (hasContent && !('channelCount' in metaPatch))
    ? _idbContentStats('m3u', content)
    : null;

  return _idbTx(
    hasContent ? [IDB_STORE_NAME, IDB_STORE_DATA_M3U] : [IDB_STORE_NAME],
    'readwrite',
    (ctx) => {
      const metaStore = ctx.store(IDB_STORE_NAME);
      ctx.req(metaStore.get(id), (rec) => {
        if (!rec) { ctx.set(false); return; }
        Object.assign(rec, metaPatch);
        if (stats) Object.assign(rec, stats);
        if (hasContent) delete rec.content;           // record legacy: il contenuto vive nel payload
        metaStore.put(rec);
        if (hasContent) ctx.store(IDB_STORE_DATA_M3U).put({ id: rec.id, content });
        ctx.set(true);
      });
    }
  );
}

/**
 * Un record (metadati + content). {withContent:false} salta la lettura del payload.
 * @returns {Promise<object|undefined>}
 */
async function getM3UById(id, { withContent = true } = {}) {
  if (!_canAccessDB()) return undefined;
  return _idbTx(
    withContent ? [IDB_STORE_NAME, IDB_STORE_DATA_M3U] : [IDB_STORE_NAME],
    'readonly',
    (ctx) => {
      ctx.req(ctx.store(IDB_STORE_NAME).get(id), (rec) => {
        if (!rec) { ctx.set(undefined); return; }
        if (!withContent) { ctx.set(_idbStripContent(rec)); return; }
        ctx.req(ctx.store(IDB_STORE_DATA_M3U).get(id), (row) => {
          const out = Object.assign({}, rec);
          if (row && row.content !== undefined) out.content = row.content;   // altrimenti resta l'eventuale content legacy
          ctx.set(out);
        });
      });
    }
  );
}

/** Solo il testo M3U di una playlist (undefined se assente). */
async function getM3UContent(id) {
  if (!_canAccessDB()) return undefined;
  return _idbTx([IDB_STORE_DATA_M3U, IDB_STORE_NAME], 'readonly', (ctx) => {
    ctx.req(ctx.store(IDB_STORE_DATA_M3U).get(id), (row) => {
      if (row && row.content !== undefined) { ctx.set(row.content); return; }
      ctx.req(ctx.store(IDB_STORE_NAME).get(id), (rec) => ctx.set(rec ? rec.content : undefined));
    });
  });
}

/** Elenco dei METADATI (senza content, quindi leggero). */
async function getAllM3UUrls() {
  if (!_canAccessDB()) return [];
  try {
    return await _idbTx([IDB_STORE_NAME], 'readonly', (ctx) => {
      ctx.req(ctx.store(IDB_STORE_NAME).getAll(), (rows) => ctx.set((rows || []).map(_idbStripContent)));
    });
  } catch (e) {
    console.error('[db] getAllM3UUrls:', e);
    return [];
  }
}

/** Elimina metadati e payload nella stessa transazione. */
async function deleteM3UUrl(id) {
  if (!_canAccessDB()) return false;
  return _idbTx([IDB_STORE_NAME, IDB_STORE_DATA_M3U], 'readwrite', (ctx) => {
    ctx.store(IDB_STORE_NAME).delete(id);
    ctx.store(IDB_STORE_DATA_M3U).delete(id);
    ctx.set(true);
  });
}

/** Cerca per URL con l'indice by_url. Metadati; {withContent:true} per avere anche il testo. */
async function findM3UByUrl(url, { withContent = false } = {}) {
  if (!_canAccessDB()) return null;
  if (typeof url !== 'string') return null;
  const meta = await _idbTx([IDB_STORE_NAME], 'readonly', (ctx) => {
    ctx.req(ctx.store(IDB_STORE_NAME).index('by_url').get(url), (rec) => ctx.set(_idbStripContent(rec) || null));
  });
  if (!meta || !withContent) return meta;
  const content = await getM3UContent(meta.id);
  return Object.assign({}, meta, { content });
}

// --- Attivazione ---

/** Rende attiva SOLO la playlist indicata. */
async function setOnlyActive(id) {
  if (!_canAccessDB()) return false;
  return _idbTx([IDB_STORE_NAME], 'readwrite', (ctx) => {
    const req = ctx.store(IDB_STORE_NAME).openCursor();
    req.onsuccess = (e) => {
      try {
        const cursor = e.target.result;
        if (!cursor) { ctx.set(true); return; }
        const rec = cursor.value;
        const shouldBeActive = (rec.id === id);
        if (!!rec.isActive !== shouldBeActive) {
          rec.isActive = shouldBeActive;
          cursor.update(rec);
        }
        cursor.continue();
      } catch (err) {
        ctx.fail(err);
      }
    };
  });
}

// --- Operazioni composte ---

/**
 * Salva (o aggiorna per URL / per nome se locale) e attiva la playlist, in
 * un'unica transazione. Restituisce il record completo, `content` compreso.
 */
async function saveAndActivateM3U({ url, name, content }) {
  if (!_canAccessDB()) {
    throw new Error('Salvataggio playlist disabilitato in modalità demo');
  }
  const isLocal = !url || !url.startsWith('http');
  const stats = _idbContentStats('m3u', content);
  const now = Date.now();

  return _idbTx([IDB_STORE_NAME, IDB_STORE_DATA_M3U], 'readwrite', (ctx) => {
    const metaStore = ctx.store(IDB_STORE_NAME);
    const dataStore = ctx.store(IDB_STORE_DATA_M3U);

    const write = (existing) => {
      const rec = existing || {
        url: url || '',
        name: name || (url && url.split('/').pop()) || 'Playlist Locale',
        timestamp: now
      };
      // Stesso risultato finale del vecchio saveM3UUrl() + updateM3URecord()
      const finalName = name || (existing ? existing.name : 'Playlist');
      rec.name = finalName;
      rec.filename = finalName;
      rec.url = url || '';
      rec.lastFetched = now;
      rec.isActive = true;
      Object.assign(rec, stats);
      delete rec.content;                              // record legacy

      const afterSave = (id) => {
        rec.id = id;
        dataStore.put({ id, content });

        // Disattiva tutte le altre
        const cur = metaStore.openCursor();
        cur.onsuccess = (e) => {
          try {
            const cursor = e.target.result;
            if (!cursor) { ctx.set(Object.assign({}, rec, { content })); return; }
            const other = cursor.value;
            if (other.id !== id && other.isActive) {
              other.isActive = false;
              cursor.update(other);
            }
            cursor.continue();
          } catch (err) {
            ctx.fail(err);
          }
        };
      };

      if (existing) ctx.req(metaStore.put(rec), () => afterSave(rec.id));
      else ctx.req(metaStore.add(rec), (id) => afterSave(id));
    };

    if (!isLocal) {
      ctx.req(metaStore.index('by_url').get(url), (found) => write(found || null));
    } else {
      ctx.req(metaStore.getAll(), (all) => {
        const found = (all || []).find(m => m.name === name && (!m.url || !m.url.startsWith('http')));
        write(found || null);
      });
    }
  });
}

/** Metadati della playlist attiva (o, se nessuna lo è, della più recente). Nessuna lettura del testo. */
async function getActivePlaylistMeta() {
  if (!_canAccessDB()) return null;
  const all = await getAllM3UUrls();
  if (!all || all.length === 0) return null;
  let active = all.find(r => r.isActive);
  if (!active) {
    const sorted = all.slice().sort((a, b) => (b.lastFetched || 0) - (a.lastFetched || 0));
    active = sorted[0];
  }
  return active || null;
}

/** Playlist attiva con `content` (legge UN solo payload). {withContent:false} = solo metadati. */
async function getActivePlaylist({ withContent = true } = {}) {
  if (!_canAccessDB()) return null;
  const meta = await getActivePlaylistMeta();
  if (!meta || !withContent) return meta;
  const content = await getM3UContent(meta.id);
  return Object.assign({}, meta, { content });
}

/**
 * Garantisce che i conteggi canali/gruppi siano nei metadati (record creati da
 * versioni precedenti o con conteggio fallito). Legge il payload una sola volta
 * e salva il risultato.
 * @returns {Promise<{channelCount:number, groupCount:number}|null>}
 */
async function ensurePlaylistCounts(id) {
  if (!_canAccessDB()) return null;
  const meta = await getM3UById(id, { withContent: false });
  if (!meta) return null;
  if (typeof meta.channelCount === 'number' && typeof meta.groupCount === 'number') {
    return { channelCount: meta.channelCount, groupCount: meta.groupCount };
  }
  const content = await getM3UContent(id);
  const stats = _idbContentStats('m3u', content);
  if (typeof stats.channelCount !== 'number') return null;
  await updateM3URecord(id, stats);                    // solo metadati
  return { channelCount: stats.channelCount, groupCount: stats.groupCount };
}

/**
 * Aggiunge un record completo (metadati + content) con un NUOVO id.
 * Usata dal ripristino backup. Restituisce l'id.
 */
async function dbAddPlaylistRecord(fullRec) {
  if (!_canAccessDB()) throw new Error('Aggiunta playlist disabilitata in modalità demo');
  const content = fullRec ? fullRec.content : undefined;
  const meta = Object.assign({}, fullRec);
  delete meta.id;
  delete meta.content;
  Object.assign(meta, _idbContentStats('m3u', content));

  return _idbTx([IDB_STORE_NAME, IDB_STORE_DATA_M3U], 'readwrite', (ctx) => {
    ctx.req(ctx.store(IDB_STORE_NAME).add(meta), (id) => {
      if (content !== undefined) ctx.store(IDB_STORE_DATA_M3U).put({ id, content });
      ctx.set(id);
    });
  });
}

// --- URL di default (settaggi) ---
//
// Il "default M3U/EPG URL" è gestito interamente via localStorage
// ("zappone_default_m3u" / "zappone_default_epg"). In IndexedDB non vanno
// mai messe impostazioni dentro gli store dei dati veri.

// ===========================================================================
// 3. EPG (guida programmi)
// ===========================================================================

// --- CRUD base ---

/** Crea il record dei metadati EPG (senza contenuto). Restituisce l'id. */
async function saveEPGUrl(url, name) {
  if (!_canAccessDB()) return null;
  return _idbTx([IDB_STORE_NAME_EPG], 'readwrite', (ctx) => {
    ctx.req(ctx.store(IDB_STORE_NAME_EPG).add({ url, name, timestamp: Date.now() }), (id) => ctx.set(id));
  });
}

/** Come updateM3URecord ma per l'EPG. `content` va nello store del payload. */
async function updateEPGRecord(id, patch) {
  if (!_canAccessDB()) return false;
  const { content, ...metaPatch } = patch || {};
  const hasContent = content !== undefined;
  const stats = (hasContent && !('channelCount' in metaPatch))
    ? _idbContentStats('epg', content)
    : null;

  return _idbTx(
    hasContent ? [IDB_STORE_NAME_EPG, IDB_STORE_DATA_EPG] : [IDB_STORE_NAME_EPG],
    'readwrite',
    (ctx) => {
      const metaStore = ctx.store(IDB_STORE_NAME_EPG);
      ctx.req(metaStore.get(id), (rec) => {
        if (!rec) { ctx.set(false); return; }
        Object.assign(rec, metaPatch);
        if (stats) Object.assign(rec, stats);
        if (hasContent) delete rec.content;
        metaStore.put(rec);
        if (hasContent) ctx.store(IDB_STORE_DATA_EPG).put({ id: rec.id, content });
        ctx.set(true);
      });
    }
  );
}

/** Un EPG (metadati + content). {withContent:false} salta la lettura del payload. */
async function getEPGById(id, { withContent = true } = {}) {
  if (!_canAccessDB()) return undefined;
  return _idbTx(
    withContent ? [IDB_STORE_NAME_EPG, IDB_STORE_DATA_EPG] : [IDB_STORE_NAME_EPG],
    'readonly',
    (ctx) => {
      ctx.req(ctx.store(IDB_STORE_NAME_EPG).get(id), (rec) => {
        if (!rec) { ctx.set(undefined); return; }
        if (!withContent) { ctx.set(_idbStripContent(rec)); return; }
        ctx.req(ctx.store(IDB_STORE_DATA_EPG).get(id), (row) => {
          const out = Object.assign({}, rec);
          if (row && row.content !== undefined) out.content = row.content;
          ctx.set(out);
        });
      });
    }
  );
}

/** Solo il contenuto (array di canali) di un EPG (undefined se assente). */
async function getEPGContent(id) {
  if (!_canAccessDB()) return undefined;
  return _idbTx([IDB_STORE_DATA_EPG, IDB_STORE_NAME_EPG], 'readonly', (ctx) => {
    ctx.req(ctx.store(IDB_STORE_DATA_EPG).get(id), (row) => {
      if (row && row.content !== undefined) { ctx.set(row.content); return; }
      ctx.req(ctx.store(IDB_STORE_NAME_EPG).get(id), (rec) => ctx.set(rec ? rec.content : undefined));
    });
  });
}

/** Elenco dei METADATI EPG (channelCount incluso, content escluso). */
async function getAllEPGUrls() {
  if (!_canAccessDB()) return [];
  return _idbTx([IDB_STORE_NAME_EPG], 'readonly', (ctx) => {
    ctx.req(ctx.store(IDB_STORE_NAME_EPG).getAll(), (rows) => ctx.set((rows || []).map(_idbStripContent)));
  });
}

/** Elimina metadati e payload nella stessa transazione. */
async function deleteEPGUrl(id) {
  if (!_canAccessDB()) return false;
  return _idbTx([IDB_STORE_NAME_EPG, IDB_STORE_DATA_EPG], 'readwrite', (ctx) => {
    ctx.store(IDB_STORE_NAME_EPG).delete(id);
    ctx.store(IDB_STORE_DATA_EPG).delete(id);
    ctx.set(true);
  });
}

/** Cerca per URL con l'indice by_url. Metadati; {withContent:true} per avere anche il contenuto. */
async function findEPGByUrl(url, { withContent = false } = {}) {
  if (!_canAccessDB()) return null;
  if (typeof url !== 'string') return null;
  const meta = await _idbTx([IDB_STORE_NAME_EPG], 'readonly', (ctx) => {
    ctx.req(ctx.store(IDB_STORE_NAME_EPG).index('by_url').get(url), (rec) => ctx.set(_idbStripContent(rec) || null));
  });
  if (!meta || !withContent) return meta;
  const content = await getEPGContent(meta.id);
  return Object.assign({}, meta, { content });
}

// --- Attivazione e operazioni composte ---

/** Rende attivo SOLO l'EPG indicato. */
async function setOnlyActiveEPG(id) {
  if (!_canAccessDB()) return false;
  return _idbTx([IDB_STORE_NAME_EPG], 'readwrite', (ctx) => {
    const req = ctx.store(IDB_STORE_NAME_EPG).openCursor();
    req.onsuccess = (e) => {
      try {
        const cursor = e.target.result;
        if (!cursor) { ctx.set(true); return; }
        const rec = cursor.value;
        const shouldBeActive = (rec.id === id);
        if (!!rec.isActive !== shouldBeActive) {
          rec.isActive = shouldBeActive;
          cursor.update(rec);
        }
        cursor.continue();
      } catch (err) {
        ctx.fail(err);
      }
    };
  });
}

/**
 * Salva (o aggiorna per URL) un EPG, applica il limite di slot ed
 * eventualmente lo attiva, tutto in un'unica transazione: se qualcosa fallisce
 * (slot pieni, quota esaurita, ...) NON cambia nulla, neanche lo stato attivo.
 * Restituisce il record completo, `content` compreso.
 *
 * `isDefault`: se true, il record è trattato come "EPG predefinito" e in caso
 * di slot pieni libera spazio eliminando gli EPG non attivi (fix 10). Il flag
 * esplicito è necessario perché dopo la rimozione di appConfig.epgUrl dal
 * premium, il confronto per URL non funziona più.
 */
async function saveAndActivateEPG({ url, name, content }, { setActive = true, isDefault = false } = {}) {
  if (!_canAccessDB()) throw new Error('Salvataggio EPG disabilitato in modalità demo');
  if (!content || content === 'null' || content === 'undefined') {
    throw new Error('Contenuto EPG non valido per il salvataggio');
  }

  const stats = _idbContentStats('epg', content);
  const now = Date.now();
  const fallbackName = name || (url && url.split('/').pop()) || 'local';
  const maxSlots = (typeof appConfig !== 'undefined' && appConfig.maxEpgSlots)
    ? appConfig.maxEpgSlots
    : 1;
  // isDefault: esplicito (da loadDefaultEPG) oppure legacy via appConfig.epgUrl.
  // Il flag esplicito è necessario dopo la rimozione di epgUrl dal premium.
  const isDefaultEpg = isDefault ||
    (typeof appConfig !== 'undefined' && !!appConfig.epgUrl && url === appConfig.epgUrl);
  const removed = [];

  const saved = await _idbTx([IDB_STORE_NAME_EPG, IDB_STORE_DATA_EPG], 'readwrite', (ctx) => {
    const metaStore = ctx.store(IDB_STORE_NAME_EPG);
    const dataStore = ctx.store(IDB_STORE_DATA_EPG);

    ctx.req(metaStore.getAll(), (rows) => {
      const all = (rows || []).map(_idbStripContent);
      const existing = all.find(r => r.url === url) || null;
      let target;

      if (!existing) {
        // --- NUOVO RECORD: applica il limite ---
        // Il limite vale solo alla CREAZIONE. Aggiornare un EPG esistente
        // (freccia ↻, riattivazione) non consuma uno slot aggiuntivo.
        let occupied = all.length;
        if (occupied >= maxSlots) {
          // [FIX 10] L'EPG PREDEFINITO deve poter sempre essere caricato: SOLO quando
          // l'utente lo carica esplicitamente (setActive) si liberano gli slot
          // eliminando prima gli EPG non attivi e, tra questi, i meno recenti.
          if (setActive && isDefaultEpg) {
            const victims = all
              .filter(r => r.url !== url)
              .sort((a, b) => ((a.isActive ? 1 : 0) - (b.isActive ? 1 : 0)) || ((a.lastFetched || 0) - (b.lastFetched || 0)));
            while (occupied >= maxSlots && victims.length) {
              const v = victims.shift();
              metaStore.delete(v.id);
              dataStore.delete(v.id);
              removed.push(v.name || v.url);
              const idx = all.indexOf(v);
              if (idx >= 0) all.splice(idx, 1);
              occupied--;
            }
          }
          if (occupied >= maxSlots) {
            const err = new Error(`Slot EPG pieni (${occupied}/${maxSlots})`);
            err.code = 'SLOTS_FULL';
            ctx.fail(err);                             // annulla anche le eventuali eliminazioni
            return;
          }
        }
        target = {
          url,
          name: fallbackName,
          filename: fallbackName,
          timestamp: now,
          lastFetched: now,
          isActive: !!setActive
        };
      } else {
        // --- AGGIORNAMENTO: nessun check di limite ---
        const newName = name || existing.name || fallbackName;
        target = existing;
        target.name = newName;
        target.filename = newName;
        target.lastFetched = now;
        target.isActive = setActive ? true : existing.isActive;
      }
      Object.assign(target, stats);

      const afterSave = (id) => {
        target.id = id;
        dataStore.put({ id, content });
        if (setActive) {
          for (const r of all) {
            if (r.id !== id && r.isActive) metaStore.put(Object.assign({}, r, { isActive: false }));
          }
        }
        ctx.set(Object.assign({}, target, { content }));
      };

      if (existing) ctx.req(metaStore.put(target), () => afterSave(target.id));
      else ctx.req(metaStore.add(target), (id) => afterSave(id));
    });
  });

  if (removed.length && typeof showNotification === 'function') {
    showNotification(
      `Slot EPG pieni: rimosso ${removed.map(n => '«' + n + '»').join(', ')} per caricare l'EPG predefinito`,
      false
    );
  }
  return saved;
}

/**
 * Metadati dell'EPG attivo. Se nessun record è attivo ripiega sul più recente
 * (comportamento storico), a meno di {strict:true} che restituisce null.
 */
async function getActiveEPGMeta({ strict = false } = {}) {
  if (!_canAccessDB()) return null;
  const all = await getAllEPGUrls();
  if (!all || all.length === 0) return null;
  let active = all.find(r => r.isActive);
  if (!active && !strict) {
    const sorted = all.slice().sort((a, b) => (b.lastFetched || 0) - (a.lastFetched || 0));
    active = sorted[0];
  }
  return active || null;
}

/** EPG attivo con `content` (legge UN solo payload). {withContent:false} = solo metadati. */
async function getActiveEPG({ withContent = true, strict = false } = {}) {
  if (!_canAccessDB()) return null;
  const meta = await getActiveEPGMeta({ strict });
  if (!meta || !withContent) return meta;
  const content = await getEPGContent(meta.id);
  return Object.assign({}, meta, { content });
}

/**
 * Aggiunge un EPG completo (metadati + content) con un NUOVO id, senza
 * controllo slot. Usata dal ripristino backup. Restituisce l'id.
 */
async function dbAddEpgRecord(fullRec) {
  if (!_canAccessDB()) throw new Error('Aggiunta EPG disabilitata in modalità demo');
  const content = fullRec ? fullRec.content : undefined;
  const meta = Object.assign({}, fullRec);
  delete meta.id;
  delete meta.content;
  Object.assign(meta, _idbContentStats('epg', content));

  return _idbTx([IDB_STORE_NAME_EPG, IDB_STORE_DATA_EPG], 'readwrite', (ctx) => {
    ctx.req(ctx.store(IDB_STORE_NAME_EPG).add(meta), (id) => {
      if (content !== undefined) ctx.store(IDB_STORE_DATA_EPG).put({ id, content });
      ctx.set(id);
    });
  });
}

// ===========================================================================
// 4. PREFERITI
// ===========================================================================

async function idbGetAllFavorites() {
  if (!_canAccessDB()) return [];
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_FAV, 'readonly');
    const store = tx.objectStore(IDB_STORE_FAV);
    const idx = store.index('by_order');
    const results = [];
    idx.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else resolve(results);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('favorites transaction aborted'));
  });
}

async function idbPutFavorite(rec) {
  if (!_canAccessDB()) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_FAV, 'readwrite');
    tx.objectStore(IDB_STORE_FAV).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('favorites transaction aborted'));
  });
}

async function idbDeleteFavorite(key) {
  if (!_canAccessDB()) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_FAV, 'readwrite');
    tx.objectStore(IDB_STORE_FAV).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('favorites transaction aborted'));
  });
}

async function idbClearFavorites() {
  if (!_canAccessDB()) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_FAV, 'readwrite');
    tx.objectStore(IDB_STORE_FAV).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('favorites transaction aborted'));
  });
}

async function idbUpdateFavoriteKey(oldKey, newRecord) {
  if (!_canAccessDB()) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_FAV, 'readwrite');
    const store = tx.objectStore(IDB_STORE_FAV);
    store.delete(oldKey);
    store.put(newRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('favorites transaction aborted'));
  });
}

/**
 * Sostituisce tutti i preferiti con l'array fornito, preservando l'ordine.
 * Una sola transazione; si risolve solo a tx.oncomplete e propaga gli errori.
 * @param {Array} favList - canali preferiti (name, url, group, logo, type)
 */
async function persistFavoritesOrder(favList) {
  if (!_canAccessDB()) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_FAV, 'readwrite');
    const store = tx.objectStore(IDB_STORE_FAV);

    store.clear();
    favList.forEach((ch, idx) => {
      const key = typeof getChannelKey === 'function'
        ? getChannelKey(ch)
        : `${ch.name}@@${ch.url}@@${ch.group || ''}`;
      store.put({
        key,
        name: ch.name,
        url: ch.url,
        group: ch.group || 'Favorites',
        logo: ch.logo || '',
        type: ch.type || 'channel',
        order: idx
      });
    });

    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error || new Error('favorites transaction failed'));
    tx.onabort    = () => reject(tx.error || new Error('favorites transaction aborted'));
  });
}

// ===========================================================================
// 5. UTILITY (Hard Reset)
// ===========================================================================

/**
 * Elimina un database IndexedDB dato il nome (Hard Reset).
 *  - onblocked NON risolve: aspetta che la delete proceda davvero.
 *  - un timeout di sicurezza (5s) evita che un blocco patologico lasci la
 *    promise appesa per sempre.
 *  - closeDB() va chiamata PRIMA (vedi hard reset in A06-sidebar.js).
 *
 * @param {string} name - nome del database
 * @param {number} [timeoutMs=5000] - timeout di sicurezza
 * @returns {Promise<boolean>} true = cancellato davvero; false = errore,
 *          blocco o timeout (il database potrebbe esistere ancora)
 */
function deleteDB(name, timeoutMs = 5000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      if (reason) console.warn(`${name} delete: ${reason}`);
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false, 'timeout di sicurezza scaduto'), timeoutMs);

    try {
      const req = indexedDB.deleteDatabase(name);

      req.onsuccess = () => {
        clearTimeout(timer);
        console.log(`${name} deleted`);
        finish(true);
      };
      req.onerror = () => {
        clearTimeout(timer);
        finish(false, 'errore del browser');
      };
      req.onblocked = () => {
        // NON risolvere qui. Aspetta onsuccess (o il timeout).
        console.warn(`${name} delete blocked: connessione ancora aperta`);
      };
    } catch (e) {
      clearTimeout(timer);
      finish(false, `eccezione: ${e && e.message}`);
    }
  });
}
