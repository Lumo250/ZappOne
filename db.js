// ============================================================================
// db.js — Persistenza su IndexedDB (playlist M3U, EPG, preferiti)
//
// Tutte le funzioni sono esportate globalmente. Usano un'unica connessione
// ottenuta tramite getDB(), che gestisce la creazione e l'upgrade del DB.
// ============================================================================

// ---------------------------------------------------------------------------
// Configurazione del database
// ---------------------------------------------------------------------------
const IDB_NAME         = 'M3UPlaylistsDB';
const IDB_VERSION      = 4;           // bumpato per aggiungere lo store 'epgUrls'
const IDB_STORE_NAME   = 'm3uUrls';    // store per playlist M3U
const IDB_STORE_NAME_EPG = 'epgUrls';  // store per EPG

// Cache della connessione per evitare aperture ripetute
let _dbInstance = null;

// ---------------------------------------------------------------------------
// Connessione unificata al database
// ---------------------------------------------------------------------------

/**
 * Restituisce (o crea) la connessione al database IndexedDB.
 * Gestisce automaticamente l'upgrade dello schema e la riapertura
 * dopo chiusure esterne (es. tab multipli).
 * @returns {Promise<IDBDatabase>}
 */
async function getDB() {
  if (_dbInstance) return _dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      _dbInstance = request.result;
      _dbInstance.onclose = () => { _dbInstance = null; };
      _dbInstance.onversionchange = () => {
        _dbInstance.close();
        _dbInstance = null;
      };
      resolve(_dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // --- Store playlist M3U ---
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        const store = db.createObjectStore(IDB_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('by_active', 'isActive', { unique: false });
        store.createIndex('by_url',    'url',      { unique: false });
      }

      // --- Store preferiti ---
      if (!db.objectStoreNames.contains('favorites')) {
        const fav = db.createObjectStore('favorites', { keyPath: 'key' });
        fav.createIndex('by_order', 'order', { unique: false });
      }

      // --- Store EPG ---
      if (!db.objectStoreNames.contains(IDB_STORE_NAME_EPG)) {
        const epgStore = db.createObjectStore(IDB_STORE_NAME_EPG, {
          keyPath: 'id',
          autoIncrement: true
        });
        epgStore.createIndex('by_url',    'url',      { unique: false });
        epgStore.createIndex('by_active', 'isActive', { unique: false });
      }
    };
  });
}

// ===========================================================================
// 1. PLAYLIST M3U
// ===========================================================================

// --- Operazioni CRUD di base ---

async function saveM3UUrl(url, name) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);
  return new Promise((resolve, reject) => {
    const request = store.add({ url, name, timestamp: Date.now() });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateM3URecord(id, patch) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);
  const rec = await new Promise((res, rej) => {
    const g = store.get(id);
    g.onsuccess = () => res(g.result);
    g.onerror = () => rej(g.error);
  });
  if (!rec) return false;
  Object.assign(rec, patch);
  store.put(rec);
  return true;
}

async function getM3UById(id) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readonly');
  const store = tx.objectStore(IDB_STORE_NAME);
  return new Promise((res, rej) => {
    const g = store.get(id);
    g.onsuccess = () => res(g.result);
    g.onerror = () => rej(g.error);
  });
}

async function getAllM3UUrls() {
  try {
    const db = await getDB();
    const tx = db.transaction([IDB_STORE_NAME], 'readonly');
    const store = tx.objectStore(IDB_STORE_NAME);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('getAllM3UUrls error:', error);
    return [];
  }
}

async function deleteM3UUrl(id) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);
  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      store.delete(id).onsuccess = () => resolve(true);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// --- Ricerca e attivazione ---

async function findM3UByUrl(url) {
  const all = await getAllM3UUrls();
  return all.find(r => r.url === url) || null;
}

/**
 * Attiva una playlist disattivando tutte le altre (metodo ottimizzato con cursore).
 * @param {number} id - ID della playlist da attivare
 */
async function setOnlyActive(id) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);
  return new Promise((res, rej) => {
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const rec = cursor.value;
        if (rec.id === id) {
          if (!rec.isActive) { rec.isActive = true; cursor.update(rec); }
        } else if (rec.isActive) {
          rec.isActive = false;
          cursor.update(rec);
        }
        cursor.continue();
      } else res(true);
    };
    req.onerror = (err) => rej(err.target?.error || err);
  });
}

/**
 * Versione legacy di attivazione, basata su get + cursore.
 * Mantenuta per retrocompatibilità, preferire setOnlyActive.
 */
async function setActivePlaylist(id) {
  const rec = await getM3UById(id);
  if (!rec) return;
  await updateM3URecord(id, { isActive: true });

  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);
  store.openCursor().onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      if (cursor.value.id !== id && cursor.value.isActive) {
        cursor.value.isActive = false;
        cursor.update(cursor.value);
      }
      cursor.continue();
    }
  };
}

// --- Operazioni composte ---

async function saveAndActivateM3U({ url, name, content }) {
  const isLocal = !url || !url.startsWith('http');
  let rec = null;

  if (!isLocal) {
    rec = await findM3UByUrl(url);
  } else {
    const all = await getAllM3UUrls();
    rec = all.find(m => m.name === name && (!m.url || !m.url.startsWith('http')));
  }

  let targetId;
  if (!rec) {
    const fallbackName = name || (url && url.split('/').pop()) || 'Playlist Locale';
    targetId = await saveM3UUrl(url || '', fallbackName);
  } else {
    targetId = rec.id;
  }

  await updateM3URecord(targetId, {
    content,
    lastFetched: Date.now(),
    name: name || (rec ? rec.name : 'Playlist'),
    filename: name || (rec ? rec.name : 'Playlist'),
    url: url || ''
  });
  await setOnlyActive(targetId);
  return await getM3UById(targetId);
}

async function getActivePlaylist() {
  const all = await getAllM3UUrls();
  if (!all || all.length === 0) return null;
  let active = all.find(r => r.isActive);
  if (!active) {
    const sorted = all.slice().sort((a, b) => (b.lastFetched || 0) - (a.lastFetched || 0));
    active = sorted[0];
  }
  return active || null;
}

// --- URL di default (settaggi) ---
//
// NOTA (fix): qui esistevano in precedenza setDefaultM3U()/getDefaultM3U(), che
// scrivevano/leggevano un record {id:"default_m3u", url} nello STESSO object store
// 'm3uUrls' usato per le playlist reali. getAllM3UUrls() lo restituiva mescolato alle
// playlist vere (mancandogli name/content/isActive), producendo una voce fittizia
// "Playlist senza nome" nel gestore playlist. In più getDefaultM3U() non veniva mai
// richiamata da nessuna parte dell'app: il valore veniva scritto ma mai riletto per lo
// scopo previsto. Il "default M3U URL" è gestito interamente via localStorage
// ("zappone_default_m3u", vedi license.js/zappone.js), coerentemente con l'EPG
// ("zappone_default_epg"). Le due funzioni sono state rimosse: se in futuro serve
// persistere impostazioni in IndexedDB, usare uno store dedicato (es. 'settings'),
// mai lo store dei dati veri.

// ===========================================================================
// 2. EPG (guida programmi)
// ===========================================================================

// --- CRUD base per EPG ---

async function saveEPGUrl(url, name) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((resolve, reject) => {
    const req = store.add({ url, name, timestamp: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateEPGRecord(id, patch) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  const rec = await new Promise((res, rej) => {
    const g = store.get(id);
    g.onsuccess = () => res(g.result);
    g.onerror = () => rej(g.error);
  });
  if (!rec) return false;
  Object.assign(rec, patch);
  store.put(rec);
  return true;
}

async function getEPGById(id) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readonly');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((res, rej) => {
    const r = store.get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function getAllEPGUrls() {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readonly');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteEPGUrl(id) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      store.delete(id).onsuccess = () => resolve(true);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function findEPGByUrl(url) {
  const all = await getAllEPGUrls();
  return all.find(r => r.url === url) || null;
}

// --- Attivazione e operazioni composte ---

async function setOnlyActiveEPG(id) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME_EPG);
  return new Promise((res, rej) => {
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const rec = cursor.value;
        if (rec.id === id) {
          if (!rec.isActive) { rec.isActive = true; cursor.update(rec); }
        } else if (rec.isActive) {
          rec.isActive = false;
          cursor.update(rec);
        }
        cursor.continue();
      } else res(true);
    };
    req.onerror = (err) => rej(err.target?.error || err);
  });
}

async function saveAndActivateEPG({ url, name, content }, { setActive = true } = {}) {
  if (!content || content === 'null' || content === 'undefined') {
    throw new Error('Contenuto EPG non valido per il salvataggio');
  }

  let rec = await findEPGByUrl(url);
  const fallbackName = name || (url && url.split('/').pop()) || 'local';

  if (!rec) {
    const id = await saveEPGUrl(url, fallbackName);
    await updateEPGRecord(id, {
      content,
      lastFetched: Date.now(),
      name: fallbackName,
      filename: fallbackName,
      isActive: setActive
    });
    if (setActive) await setOnlyActiveEPG(id);
    rec = await getEPGById(id);
  } else {
    const newName = name || rec.name || fallbackName;
    await updateEPGRecord(rec.id, {
      content,
      lastFetched: Date.now(),
      name: newName,
      filename: newName,
      isActive: setActive ? true : rec.isActive
    });
    if (setActive) await setOnlyActiveEPG(rec.id);
    rec = await getEPGById(rec.id);
  }
  return rec;
}

async function getActiveEPG() {
  const all = await getAllEPGUrls();
  if (!all || all.length === 0) return null;
  let active = all.find(r => r.isActive);
  if (!active) {
    const sorted = all.slice().sort((a, b) => (b.lastFetched || 0) - (a.lastFetched || 0));
    active = sorted[0];
  }
  return active || null;
}

// ===========================================================================
// 3. PREFERITI
// ===========================================================================

async function idbGetAllFavorites() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readonly');
    const store = tx.objectStore('favorites');
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
  });
}

async function idbPutFavorite(rec) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDeleteFavorite(key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearFavorites() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbUpdateFavoriteKey(oldKey, newRecord) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    const store = tx.objectStore('favorites');
    store.delete(oldKey);
    store.put(newRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Sostituisce tutti i preferiti con l'array fornito, preservando l'ordine.
 * @param {Array} favList - Array di canali preferiti (con i campi name, url, group, logo)
 */
async function persistFavoritesOrder(favList) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    const store = tx.objectStore('favorites');
    const clearReq = store.clear();

    clearReq.onsuccess = async () => {
      const putPromises = favList.map((ch, idx) => {
        const key = typeof getChannelKey === 'function' ? getChannelKey(ch) : `${ch.name}@@${ch.url}@@${ch.group || ''}`;
        return store.put({
          key,
          name: ch.name,
          url: ch.url,
          group: ch.group || 'Favorites',
          logo: ch.logo || '',
          type: ch.type || 'channel',
          order: idx
        });
      });
      try {
        await Promise.all(putPromises);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    clearReq.onerror = () => reject(clearReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

// ===========================================================================
// 4. UTILITY (Hard Reset)
// ===========================================================================

/**
 * Elimina un database IndexedDB dato il nome.
 * Usato durante l'Hard Reset.
 * @param {string} name - nome del database
 * @returns {Promise<void>}
 */
function deleteDB(name) {
  return new Promise(resolve => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => { console.log(`${name} deleted`); resolve(); };
      req.onerror = () => { console.warn(`${name} delete error`); resolve(); };
      req.onblocked = () => { console.warn(`${name} delete blocked`); resolve(); };
    } catch (e) {
      console.warn(`${name} delete exception`, e);
      resolve();
    }
  });
}