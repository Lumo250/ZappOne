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

// Cache della connessione: salviamo la PROMISE, non l'istanza.
// Motivo: initializeApp() chiama getDB() tre volte in parallelo (via
// Promise.all). Con la cache sull'istanza, il guard `if (_dbInstance)`
// non scatta (è ancora null) e vengono aperte TRE connessioni reali allo
// stesso DB. Le prime due restano orfane e non vengono mai chiuse: quando
// si chiama deleteDatabase() (hard reset), il browser spara onblocked e
// il DB non viene cancellato. Cachando la promise, le chiamate parallele
// condividono la stessa apertura e si ottiene UNA sola connessione.
let _dbPromise = null;

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
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onerror = () => {
      _dbPromise = null;     // permette un retry alla prossima chiamata
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;
      // IMPORTANTE: gli handler catturano `db` localmente, NON _dbPromise.
      // Se un domani _dbPromise venisse sovrascritta, questi handler
      // chiuderebbero comunque la connessione giusta.
      db.onclose = () => {
        if (_dbPromise) _dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        _dbPromise = null;
      };
      resolve(db);
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

  return _dbPromise;
}

/**
 * Chiude esplicitamente la connessione al DB e azzera la cache.
 * Va chiamata PRIMA di deleteDatabase() in un hard reset: senza questa,
 * il browser risponde con onblocked e il DB non viene cancellato.
 */
async function closeDB() {
  if (!_dbPromise) return;
  try {
    const db = await _dbPromise;
    db.close();
  } catch (e) {
    // la promise potrebbe essere già risolta con errore: ignora
  }
  _dbPromise = null;
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
    // --- NUOVO RECORD: applica il limite ---
    // Il limite vale solo alla CREAZIONE. Aggiornare un EPG esistente
    // (freccia ↻, riattivazione) non consuma uno slot aggiuntivo.
    const all = await getAllEPGUrls();
    const maxSlots = (typeof appConfig !== 'undefined' && appConfig.maxEpgSlots)
                     ? appConfig.maxEpgSlots
                     : 1;

    if (all.length >= maxSlots) {
      const err = new Error(`Slot EPG pieni (${all.length}/${maxSlots})`);
      err.code = 'SLOTS_FULL';
      throw err;
    }

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
    // --- AGGIORNAMENTO: nessun check di limite ---
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
 *
 * FIX: la versione precedente risolveva la Promise dentro clearReq.onsuccess,
 * dopo un `await Promise.all(putPromises)` su oggetti IDBRequest. Ma
 * `store.put()` restituisce IDBRequest, NON una Promise: Promise.all li
 * considerava già risolti, e la Promise esterna si risolveva PRIMA che la
 * transazione fosse effettivamente committata. Conseguenze:
 *   - ricaricando la pagina subito dopo un riordino, le scritture potevano
 *     non essere ancora su disco → preferiti nel vecchio ordine;
 *   - eventuali errori di scrittura (quota piena, key invalida) arrivavano
 *     al tx.onerror DOPO che la Promise era già stata risolta → reject()
 *     era un no-op, errori silenziosamente persi.
 * Ora si attende l'evento tx.oncomplete: il contratto async è corretto e
 * gli errori sono propagati davvero al chiamante.
 */
async function persistFavoritesOrder(favList) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    const store = tx.objectStore('favorites');

    // Svuota lo store e riscrive tutto in un'unica transazione.
    // Non serve attendere il singolo clear prima dei put: IDB garantisce
    // l'ordine sequenziale delle operazioni su uno stesso object store
    // dentro la stessa transazione.
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

    // tx.oncomplete è l'unico punto in cui è garantito che TUTTE le
    // operazioni della transazione siano state committate su disco.
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error || new Error('favorites transaction failed'));
    tx.onabort    = () => reject(tx.error || new Error('favorites transaction aborted'));
  });
}

// ===========================================================================
// 4. UTILITY (Hard Reset)
// ===========================================================================

/**
 * Elimina un database IndexedDB dato il nome.
 * Usato durante l'Hard Reset.
 *
 * FIX: la versione precedente risolveva la promise su onblocked, cioè
 * quando il browser SEGNALAVA che la delete era bloccata da una connessione
 * aperta — non quando era riuscita. Il chiamante proseguiva (e ricaricava la
 * pagina) credendo che il DB fosse cancellato, mentre era intatto. Ora:
 *   - onblocked NON risolve la promise: aspetta che la delete proceda
 *     davvero (o fallisca davvero).
 *   - un timeout di sicurezza di 5s evita che un blocco patologico (es.
 *     altra tab con vecchio codice che non chiude la connessione) lasci
 *     la promise appesa per sempre.
 *   - closeDB() va chiamata PRIMA di questa funzione (vedi hard reset in
 *     zappone.js): con quella, onblocked non dovrebbe nemmeno scattare.
 *
 * @param {string} name - nome del database
 * @param {number} [timeoutMs=5000] - timeout di sicurezza
 * @returns {Promise<void>}
 */
function deleteDB(name, timeoutMs = 5000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (reason) => {
      if (settled) return;
      settled = true;
      if (reason) console.warn(`${name} delete: ${reason}`);
      resolve();
    };

    // Timeout di sicurezza
    const timer = setTimeout(() => finish('timeout di sicurezza scaduto'), timeoutMs);

    try {
      const req = indexedDB.deleteDatabase(name);

      req.onsuccess = () => {
        clearTimeout(timer);
        console.log(`${name} deleted`);
        finish();
      };
      req.onerror = () => {
        clearTimeout(timer);
        finish('errore del browser');
      };
      req.onblocked = () => {
        // NON risolvere qui. Aspetta onsuccess (o il timeout).
        console.warn(`${name} delete blocked: connessione ancora aperta`);
      };
    } catch (e) {
      clearTimeout(timer);
      finish(`eccezione: ${e && e.message}`);
    }
  });
}


