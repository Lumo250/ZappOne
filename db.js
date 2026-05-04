// ============================================================================
// db.js — Gestione del database IndexedDB (playlist M3U, EPG, preferiti)
// ============================================================================

// --- Configurazione DB ---
const IDB_NAME = 'M3UPlaylistsDB';
const IDB_VERSION = 4; // bump per creare lo store 'epgUrls'
const IDB_STORE_NAME = 'm3uUrls';
const IDB_STORE_NAME_EPG = 'epgUrls'; // nuovo store per EPG salvati

// Cache della connessione per evitare aperture multiple
let _dbInstance = null;

/**
 * Ottiene (o crea) la connessione al database IndexedDB.
 * Tutte le operazioni DB devono passare da questa funzione.
 * @returns {Promise<IDBDatabase>}
 */
async function getDB() {
  if (_dbInstance) return _dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      _dbInstance = request.result;

      // Se il browser chiude la connessione (es. tab multipli), resetta la cache
      _dbInstance.onclose = () => { _dbInstance = null; };
      _dbInstance.onversionchange = () => {
        _dbInstance.close();
        _dbInstance = null;
      };

      resolve(_dbInstance);
    };

    // Eseguito SOLO alla prima creazione o quando IDB_VERSION aumenta
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store: playlist M3U
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        const store = db.createObjectStore(IDB_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('by_active', 'isActive', { unique: false });
        store.createIndex('by_url',    'url',      { unique: false });
      }

      // Store: preferiti
      if (!db.objectStoreNames.contains('favorites')) {
        const fav = db.createObjectStore('favorites', { keyPath: 'key' });
        fav.createIndex('by_order', 'order', { unique: false });
      }

      // Store: EPG salvati
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

// --------------------------------------------------------------------------
// Playlist M3U
// --------------------------------------------------------------------------

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
    console.error('Errore nel recupero URL:', error);
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

async function findM3UByUrl(url) {
  const all = await getAllM3UUrls();
  return all.find(r => r.url === url) || null;
}

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

async function setDefaultM3U(url) {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
  const store = tx.objectStore(IDB_STORE_NAME);
  await store.put({ id: "default_m3u", url });
}

async function getDefaultM3U() {
  const db = await getDB();
  const tx = db.transaction([IDB_STORE_NAME], 'readonly');
  const store = tx.objectStore(IDB_STORE_NAME);
  return new Promise(res => {
    const req = store.get("default_m3u");
    req.onsuccess = () => res(req.result?.url || DEFAULT_PLAYLIST_URL);
    req.onerror = () => res(DEFAULT_PLAYLIST_URL);
  });
}

// --------------------------------------------------------------------------
// EPG
// --------------------------------------------------------------------------

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
  if (!rec) {
    const fallbackName = name || (url && url.split('/').pop()) || 'local';
    const id = await saveEPGUrl(url, fallbackName);
    await updateEPGRecord(id, { content, lastFetched: Date.now(), name: fallbackName, filename: fallbackName, isActive: setActive });
    if (setActive) await setOnlyActiveEPG(id);
    rec = await getEPGById(id);
  } else {
    const newName = name || rec.name || (url && url.split('/').pop()) || 'local';
    await updateEPGRecord(rec.id, { content, lastFetched: Date.now(), name: newName, filename: newName, isActive: setActive ? true : rec.isActive });
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

// --------------------------------------------------------------------------
// Preferiti
// --------------------------------------------------------------------------

async function idbGetAllFavorites() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readonly');
    const store = tx.objectStore('favorites');
    const idx = store.index('by_order');
    const results = [];
    idx.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { results.push(cursor.value); cursor.continue(); }
      else resolve(results);
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

async function persistFavoritesOrder(favList) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    const store = tx.objectStore('favorites');
    const clearRequest = store.clear();
    clearRequest.onsuccess = () => {
      const requests = [];
      favList.forEach((ch, idx) => {
        const key = getChannelKey(ch);
        requests.push(store.put({
          key,
          name: ch.name,
          url: ch.url,
          group: ch.group || 'Favorites',
          logo: ch.logo || '',
          type: ch.type || 'channel',
          order: idx
        }));
      });
      Promise.all(requests).then(() => resolve()).catch(err => reject(err));
    };
    clearRequest.onerror = () => reject(clearRequest.error);
    tx.onerror = () => reject(tx.error);
  });
}

// --------------------------------------------------------------------------
// Utility per Hard Reset
// --------------------------------------------------------------------------

/**
 * Elimina un database IndexedDB dato il suo nome.
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