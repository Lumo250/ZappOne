// ============================================================================
// db.js — Persistenza su IndexedDB (playlist M3U, EPG, preferiti)
//
// Tutta la persistenza dell'app passa da qui. Tre object store separati:
//
//   m3uUrls     playlist M3U (una voce per playlist, con content + metadati)
//   epgUrls     guide EPG (una voce per EPG, con content + metadati)
//   favorites   canali preferiti dell'utente (uno per canale, con ordine)
//
// Tutte le funzioni sono esportate a livello globale (nessun modulo ES:
// gli script sono caricati in ordine da index.html). L'unico punto di
// ingresso per la connessione è getDB(), che gestisce apertura, upgrade
// dello schema e riapertura dopo chiusure esterne.
//
// Dipendenze:
//   - getChannelKey (da m3u-parser.js) — usato come fallback in
//     persistFavoritesOrder se non è ancora definito globalmente.
//
// Convenzioni:
//   - Le operazioni di scrittura risolvono SEMPRE su tx.oncomplete, non su
//     request.onsuccess: solo tx.oncomplete garantisce che la transazione
//     sia stata effettivamente committata su disco.
//   - Le operazioni di lettura possono risolvere su request.onsuccess
//     (nessuna scrittura da attendere).
//   - Ogni funzione che ritorna una Promise rifiuta su errore con l'errore
//     nativo di IndexedDB.
// ============================================================================


// ============================================================================
// INDICE DELLE SEZIONI
// ============================================================================
//
//   1.  Configurazione del database
//   2.  Connessione — getDB / closeDB
//   3.  PLAYLIST M3U — CRUD base
//   4.  PLAYLIST M3U — ricerca e attivazione
//   5.  PLAYLIST M3U — operazioni composte
//   6.  PLAYLIST M3U — default URL (rimosse, vedi nota)
//   7.  EPG — CRUD base
//   8.  EPG — attivazione e operazioni composte
//   9.  PREFERITI — lettura e scrittura singole
//  10.  PREFERITI — persistenza ordine completo
//  11.  Hard Reset — deleteDB
// ============================================================================


// ============================================================================
// 1. CONFIGURAZIONE DEL DATABASE
// ============================================================================

const IDB_NAME         = 'M3UPlaylistsDB';
const IDB_VERSION      = 4;            // bumpato ad ogni modifica dello schema
const IDB_STORE_NAME   = 'm3uUrls';    // store playlist M3U
const IDB_STORE_NAME_EPG = 'epgUrls';  // store EPG

// Cache della connessione. Salviamo la PROMISE, non l'istanza IDBDatabase.
//
// Motivo: initializeApp() chiama getDB() tre volte in parallelo (via
// Promise.all). Se la cache contenesse l'istanza, il guard `if (_dbInstance)`
// non scatterebbe nelle chiamate parallele (l'istanza è ancora null finché
// la open non risolve), e verrebbero aperte TRE connessioni reali allo
// stesso DB. Le due "perdenti" restano orfane, non vengono mai chiuse, e
// quando si chiama deleteDatabase() (hard reset) il browser risponde con
// onblocked perché c'è ancora una connessione aperta.
//
// Cachando la promise, le chiamate parallele condividono la stessa apertura
// e si ottiene UNA sola connessione per tutta la sessione.
let _dbPromise = null;


// ============================================================================
// 2. CONNESSIONE — getDB / closeDB
// ============================================================================

/**
 * Restituisce (o apre) la connessione a IndexedDB.
 *
 * La connessione viene cachata come promise: chiamate parallele durante
 * la fase di apertura condividono la stessa richiesta. Se la open fallisce,
 * la cache viene azzerata per permettere un retry alla prossima chiamata.
 *
 * Gestisce anche:
 *   - db.onclose: azzera la cache quando la connessione viene chiusa
 *     dall'esterno (es. browser che invalida la connessione);
 *   - db.onversionchange: chiude la connessione se un'altra tab tenta un
 *     upgrade dello schema, così l'altra tab non resta bloccata.
 *
 * Lo schema viene creato in onupgradeneeded in modo idempotente: ogni
 * store/index viene creato solo se non esiste già.
 *
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
      // Gli handler catturano `db` localmente (non _dbPromise): se un
      // domani _dbPromise venisse sovrascritta, questi handler
      // continuerebbero comunque a riferirsi alla connessione giusta.
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

      // Store playlist M3U
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        const store = db.createObjectStore(IDB_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('by_active', 'isActive', { unique: false });
        store.createIndex('by_url',    'url',      { unique: false });
      }

      // Store preferiti
      if (!db.objectStoreNames.contains('favorites')) {
        const fav = db.createObjectStore('favorites', { keyPath: 'key' });
        fav.createIndex('by_order', 'order', { unique: false });
      }

      // Store EPG
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
 * Chiude la connessione al DB e azzera la cache.
 *
 * Va chiamata PRIMA di deleteDatabase() in un hard reset: senza questa
 * chiusura, il browser risponde con onblocked perché la connessione è
 * ancora aperta, e il DB NON viene cancellato.
 *
 * Non solleva eccezioni: se la promise è già stata risolta con errore,
 * il catch è un no-op.
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


// ============================================================================
// 3. PLAYLIST M3U — CRUD BASE
// ============================================================================

/**
 * Inserisce una nuova voce nello store playlist e ritorna il suo id
 * auto-generato.
 *
 * La voce contiene solo { url, name, timestamp }: content, filename e
 * isActive vengono aggiunti da updateM3URecord() al primo salvataggio
 * di contenuto effettivo.
 *
 * @param {string} url    URL della playlist (o 'file:<nome>' per locali)
 * @param {string} name   nome visualizzato
 * @returns {Promise<number>}  id auto-generato dalla open
 */
async function saveM3UUrl(url, name) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);

    const request = store.add({ url, name, timestamp: Date.now() });
    let newId;

    request.onsuccess = () => { newId = request.result; };
    request.onerror   = () => reject(request.error);

    tx.oncomplete = () => resolve(newId);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

/**
 * Aggiorna i campi di una voce playlist esistente.
 *
 * Legge la voce, applica Object.assign(rec, patch), e scrive il risultato.
 * Se la voce non esiste, ritorna false senza scrivere nulla.
 *
 * Risolve su tx.oncomplete: il chiamante ha la garanzia che il dato sia
 * su disco quando la Promise si risolve, non solo che la put sia stata
 * accodata.
 *
 * @param {number} id
 * @param {Object} patch   campi da sovrascrivere
 * @returns {Promise<boolean>}  true se la voce esisteva ed è stata aggiornata
 */
async function updateM3URecord(id, patch) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    let found = false;

    const g = store.get(id);
    g.onsuccess = () => {
      const rec = g.result;
      if (!rec) return;
      found = true;
      Object.assign(rec, patch);
      store.put(rec);
    };
    g.onerror = () => reject(g.error);

    tx.oncomplete = () => resolve(found);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

/**
 * Legge una voce playlist per id. Ritorna undefined se non esiste.
 *
 * @param {number} id
 * @returns {Promise<Object|undefined>}
 */
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

/**
 * Legge tutte le playlist. In caso di errore logga e ritorna [].
 *
 * @returns {Promise<Object[]>}
 */
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

/**
 * Elimina una playlist per id. Ritorna sempre true su transazione
 * riuscita, anche se la chiave non esisteva (delete su chiave inesistente
 * non è un errore per IndexedDB).
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function deleteM3UUrl(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);

    store.delete(id);

    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}


// ============================================================================
// 4. PLAYLIST M3U — RICERCA E ATTIVAZIONE
// ============================================================================

/**
 * Trova una playlist per URL esatto. Scansione lineare (poche decine di
 * voci, non vale la pena un indice).
 *
 * @param {string} url
 * @returns {Promise<Object|null>}
 */
async function findM3UByUrl(url) {
  const all = await getAllM3UUrls();
  return all.find(r => r.url === url) || null;
}

/**
 * Attiva una playlist e disattiva tutte le altre.
 *
 * Usa un cursore sull'intero store: aggiorna ogni voce il cui stato di
 * isActive debba cambiare. Il cursore evita di leggere prima tutti i
 * record e di scriverli poi: una sola transazione, un solo passaggio.
 *
 * Non esiste uno stato "nessuna playlist attiva": se id non corrisponde
 * a nessuna voce, TUTTE le altre vengono comunque disattivate.
 *
 * @param {number} id
 * @returns {Promise<boolean>}  true su commit
 */
async function setOnlyActive(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_STORE_NAME], 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);

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
      }
      // Fine iterazione: non risolvere qui. Attendi tx.oncomplete.
    };
    req.onerror = (err) => reject(err.target?.error || err);

    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

/**
 * Alias storico di setOnlyActive, mantenuto per retrocompatibilità.
 *
 * La vecchia implementazione apriva un cursore fire-and-forget che
 * disattivava le altre playlist in background senza attendere la commit:
 * la funzione ritornava mentre la disattivazione era ancora in corso, con
 * il rischio di osservare due playlist attive contemporaneamente.
 * Ora delega a setOnlyActive, che attende tx.oncomplete.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function setActivePlaylist(id) {
  return await setOnlyActive(id);
}


// ============================================================================
// 5. PLAYLIST M3U — OPERAZIONI COMPOSTE
// ============================================================================

/**
 * Salva il contenuto di una playlist e la rende attiva.
 *
 * Sequenza:
 *   1. Valida il contenuto: deve essere una stringa non vuota con header
 *      #EXTM3U e almeno un #EXTINF. Impedisce che una risposta vuota,
 *      un errore di rete mascherato da null, o un contenuto non-M3U
 *      vengano salvati come playlist valida e sovrascrivano con null un
 *      contenuto buono già esistente.
 *   2. Cerca un record esistente per la stessa chiave:
 *        - playlist remote: per URL;
 *        - playlist locali: per (name, url non-http).
 *   3. Se non esiste, ne crea uno nuovo con saveM3UUrl.
 *   4. Aggiorna il record con content, lastFetched, name, filename, url.
 *   5. La rende attiva con setOnlyActive.
 *
 * @param {Object} params
 * @param {string} params.url      URL della playlist (o 'file:...')
 * @param {string} params.name     nome visualizzato
 * @param {string} params.content  contenuto M3U completo
 * @returns {Promise<Object>}      il record aggiornato
 * @throws {Error}                 se il contenuto non è una playlist M3U valida
 */
async function saveAndActivateM3U({ url, name, content }) {
  // Validazione del contenuto
  if (!content || typeof content !== 'string') {
    throw new Error('Contenuto playlist non valido (null o non stringa)');
  }
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Contenuto playlist vuoto');
  }
  if (!/^#EXTM3U/m.test(trimmed)) {
    throw new Error('Playlist non valida: manca #EXTM3U');
  }
  if (!/#EXTINF/i.test(trimmed)) {
    throw new Error('Playlist non valida: nessun canale trovato');
  }

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

/**
 * Ritorna la playlist attiva.
 *
 * Se nessuna ha isActive=true (caso limite: DB migrato, reset parziale),
 * ritorna la più recente per lastFetched.
 *
 * @returns {Promise<Object|null>}
 */
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


// ============================================================================
// 6. PLAYLIST M3U — DEFAULT URL
// ============================================================================
//
// NOTA STORICA
//
// In passato esistevano qui setDefaultM3U() / getDefaultM3U(), che
// scrivevano e leggevano un record { id: "default_m3u", url } nello
// STESSO object store 'm3uUrls' usato per le playlist reali.
//
// Due problemi:
//   1. getAllM3UUrls() restituiva quel record mescolato alle playlist vere
//      (mancandogli name, content, isActive), producendo una voce fittizia
//      "Playlist senza nome" nel gestore playlist.
//   2. getDefaultM3U() non veniva mai chiamata da nessuna parte: il valore
//      veniva scritto ma mai riletto.
//
// Entrambe sono state rimosse. Il "default M3U URL" è gestito interamente
// via localStorage con la chiave "zappone_default_m3u", coerentemente con
// l'EPG ("zappone_default_epg").
//
// Regola generale: mai scrivere impostazioni nello store dei dati veri.
// Se in futuro serve persistere settings in IndexedDB, va creato uno store
// dedicato (es. 'settings'), non riutilizzato uno store esistente.


// ============================================================================
// 7. EPG — CRUD BASE
// ============================================================================

/**
 * Inserisce una nuova voce EPG nello store e ritorna il suo id auto-generato.
 *
 * Come per saveM3UUrl, la voce contiene solo i metadati di base. Content
 * e lastFetched vengono aggiunti da updateEPGRecord() al primo salvataggio.
 *
 * @param {string} url
 * @param {string} name
 * @returns {Promise<number>}
 */
async function saveEPGUrl(url, name) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME_EPG);

    const req = store.add({ url, name, timestamp: Date.now() });
    let newId;

    req.onsuccess = () => { newId = req.result; };
    req.onerror   = () => reject(req.error);

    tx.oncomplete = () => resolve(newId);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

/**
 * Aggiorna i campi di una voce EPG esistente.
 *
 * Stessa semantica di updateM3URecord: risolve su tx.oncomplete, ritorna
 * false se la voce non esisteva.
 *
 * @param {number} id
 * @param {Object} patch
 * @returns {Promise<boolean>}
 */
async function updateEPGRecord(id, patch) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME_EPG);
    let found = false;

    const g = store.get(id);
    g.onsuccess = () => {
      const rec = g.result;
      if (!rec) return;
      found = true;
      Object.assign(rec, patch);
      store.put(rec);
    };
    g.onerror = () => reject(g.error);

    tx.oncomplete = () => resolve(found);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

/**
 * Legge una voce EPG per id. Ritorna undefined se non esiste.
 *
 * @param {number} id
 * @returns {Promise<Object|undefined>}
 */
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

/**
 * Legge tutte le voci EPG. Ritorna sempre un array (eventualmente vuoto).
 *
 * @returns {Promise<Object[]>}
 */
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

/**
 * Elimina una voce EPG per id.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function deleteEPGUrl(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME_EPG);

    store.delete(id);

    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

/**
 * Trova una voce EPG per URL esatto.
 *
 * @param {string} url
 * @returns {Promise<Object|null>}
 */
async function findEPGByUrl(url) {
  const all = await getAllEPGUrls();
  return all.find(r => r.url === url) || null;
}


// ============================================================================
// 8. EPG — ATTIVAZIONE E OPERAZIONI COMPOSTE
// ============================================================================

/**
 * Attiva una voce EPG e disattiva tutte le altre.
 * Stessa semantica di setOnlyActive, ma sullo store EPG.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function setOnlyActiveEPG(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_STORE_NAME_EPG], 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME_EPG);

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
      }
    };
    req.onerror = (err) => reject(err.target?.error || err);

    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

/**
 * Salva il contenuto di un EPG e opzionalmente lo attiva.
 *
 * Sequenza:
 *   1. Valida il contenuto: deve essere una stringa non vuota e non
 *      "null"/"undefined" (le stringhe prodotte da JSON.stringify(null)
 *      o da un errore a monte).
 *   2. Cerca un record per URL.
 *   3. Nuovo record: crea la voce con isActive = setActive e, se setActive,
 *      la rende attiva.
 *   4. Record esistente: aggiorna content e lastFetched preservando il nome
 *      esistente se non ne viene passato uno nuovo. isActive resta true se
 *      setActive è true, altrimenti preserva lo stato corrente.
 *
 * @param {Object} params
 * @param {string} params.url
 * @param {string} params.name
 * @param {string} params.content   JSON serializzato dell'array EPG
 * @param {Object} [opts]
 * @param {boolean} [opts.setActive=true]
 * @returns {Promise<Object>}  il record salvato
 * @throws {Error}             se il contenuto è invalido
 */
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

/**
 * Ritorna la voce EPG attiva.
 * Se nessuna ha isActive=true, ritorna la più recente per lastFetched.
 *
 * @returns {Promise<Object|null>}
 */
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


// ============================================================================
// 9. PREFERITI — LETTURA E SCRITTURA SINGOLE
// ============================================================================
//
// Lo store 'favorites' ha keyPath 'key' (stringa: getChannelKey del canale)
// e un indice 'by_order' che permette di ricostruire l'ordine cronologico
// di aggiunta o quello impostato dall'utente con drag & drop.

/**
 * Legge tutti i preferiti nell'ordine definito dal campo 'order'.
 *
 * @returns {Promise<Object[]>}
 */
async function idbGetAllFavorites() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readonly');
    const store = tx.objectStore('favorites');
    const idx = store.index('by_order');
    const results = [];

    const req = idx.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        // Fine iterazione: risolvi con i risultati. Lettura readonly,
        // tx.oncomplete arriva comunque subito dopo; risolvere qui è
        // idiomatico e non crea problemi di commit.
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
    tx.onerror  = () => reject(tx.error);
  });
}

/**
 * Inserisce o sostituisce un preferito (put su keyPath 'key').
 *
 * @param {Object} rec   record con key, name, url, group, logo, type, order
 * @returns {Promise<void>}
 */
async function idbPutFavorite(rec) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Elimina un preferito per chiave.
 *
 * @param {string} key
 * @returns {Promise<void>}
 */
async function idbDeleteFavorite(key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Svuota lo store dei preferiti.
 *
 * @returns {Promise<void>}
 */
async function idbClearFavorites() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Sostituisce un preferito con una nuova chiave.
 *
 * Serve quando un canale preferito viene rinominato (la chiave cambia
 * perché include name). Eliminare e reinserire in un'unica transazione
 * garantisce che non ci sia un istante in cui il preferito non esiste.
 *
 * @param {string} oldKey
 * @param {Object} newRecord   record completo con la nuova chiave
 * @returns {Promise<void>}
 */
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


// ============================================================================
// 10. PREFERITI — PERSISTENZA ORDINE COMPLETO
// ============================================================================

/**
 * Sostituisce tutti i preferiti con la lista fornita, preservando l'ordine.
 *
 * Usata dopo un riordino drag & drop nella vista Preferiti: svuota lo store
 * e riscrive ogni canale con un campo 'order' crescente (0, 1, 2...).
 *
 * Note contrattuali:
 *   - Svuota e riscrittura avvengono in un'unica transazione. Non è
 *     necessario attendere la clear prima delle put: IndexedDB garantisce
 *     l'ordine sequenziale delle operazioni sullo stesso object store
 *     dentro la stessa transazione.
 *   - La Promise risolve SOLO su tx.oncomplete. store.put() restituisce
 *     un IDBRequest, non una Promise: fare Promise.all sui vari put
 *     risolverebbe immediatamente, ben prima del commit. Questo era il
 *     bug della versione precedente (perdita di scritture su reload
 *     immediato, errori silenziosi).
 *   - Se store.put() fallisce a metà, la transazione si abortisce e la
 *     Promise viene rifiutata: nessuna scrittura parziale rimane.
 *
 * @param {Array} favList  canali preferiti con name, url, group, logo
 * @returns {Promise<void>}
 */
async function persistFavoritesOrder(favList) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    const store = tx.objectStore('favorites');

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


// ============================================================================
// 11. HARD RESET — deleteDB
// ============================================================================

/**
 * Elimina un intero database IndexedDB per nome.
 * Usato dall'Hard Reset (zappone.js), dopo closeDB().
 *
 * Contratto:
 *   - onsuccess del browser: risolve normalmente.
 *   - onerror del browser: risolve con un log di warning. Non rifiuta:
 *     l'Hard Reset deve poter proseguire verso il reload anche se la
 *     delete fallisce (l'utente vede comunque il reload).
 *   - onblocked: NON risolve. Significa che il browser ha rilevato una
 *     connessione ancora aperta e sta aspettando che si chiuda. Si
 *     aspetta onsuccess oppure il timeout di sicurezza, per evitare che
 *     la Promise resti appesa per sempre se un'altra tab con vecchio
 *     codice non chiude mai la connessione.
 *   - timeout di sicurezza (default 5 s): risolve con un warning se la
 *     delete non si è conclusa. Il chiamante può così proseguire.
 *
 * Chiamare SEMPRE closeDB() prima di deleteDB(): con la connessione
 * chiusa, onblocked non dovrebbe nemmeno scattare.
 *
 * @param {string} name
 * @param {number} [timeoutMs=5000]
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
