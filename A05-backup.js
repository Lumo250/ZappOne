// ================================================================
//  MODULO BACKUP / RIPRISTINO - ZappOne
//
//  Da caricare DOPO zappone.js (usa getDB() di db.js, showNotification()
//  e appConfig). I pulsanti del tab Contenuti vengono gestiti con
//  event delegation, così funzionano anche se #backupCreateBtn /
//  #backupRestoreBtn / #backupFileInput sono iniettati in un secondo
//  momento dal template della sidebar (clonato da sidebar.js).
// ================================================================
(function setupBackupRestore() {
  'use strict';

  const FORMAT = 4;
  const STORE_PL  = 'm3uUrls';
  const STORE_EPG = 'epgUrls';
  const STORE_FAV = 'favorites';
  const STORE_PL_DATA  = 'm3uContent';
  const STORE_EPG_DATA = 'epgContent';

  const SETTINGS_DENY = new Set([
    'zappone_license', 'zappone_jwt', 'zappone_device_id',
    // La cache di configurazione può contenere playlistUrl/epgUrl
    // in chiaro (backup vecchi o utenti precedenti alla full
    // protection). Non va mai trasferita: la cache si ricrea al
    // prossimo getConfigFromServer, e dopo la modifica non contiene
    // più gli URL.
    'zappone_config_cache',
    'zappone_demo_mode', 'zappone_eq_debug', 'zappone_console_overlay'
  ]);

  class BackupError extends Error {}

  const req = (r) => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Errore IndexedDB'));
  });
  async function idbKeys(store)       { const db = await getDB(); return req(db.transaction([store], 'readonly').objectStore(store).getAllKeys()); }
  async function idbGet(store, key)   { const db = await getDB(); return req(db.transaction([store], 'readonly').objectStore(store).get(key)); }
  async function idbGetAll(store)     { const db = await getDB(); return req(db.transaction([store], 'readonly').objectStore(store).getAll()); }
  async function idbAdd(store, rec)   { const db = await getDB(); return req(db.transaction([store], 'readwrite').objectStore(store).add(rec)); }
  async function idbPut(store, rec)   { const db = await getDB(); return req(db.transaction([store], 'readwrite').objectStore(store).put(rec)); }

  async function idbBatch(stores, fn) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Errore IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('Transazione annullata'));
      try { fn(tx); } catch (e) { try { tx.abort(); } catch (_) {} reject(e); }
    });
  }

  function collectSettings() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && !SETTINGS_DENY.has(k)) out.push([k, localStorage.getItem(k)]);
    }
    return out;
  }

  function makeLineReader(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let pieces = [];
    const ready = [];
    let readyPos = 0;
    let finished = false;

    function feed(text) {
      let start = 0, idx;
      while ((idx = text.indexOf('\n', start)) !== -1) {
        pieces.push(text.slice(start, idx));
        ready.push(pieces.length === 1 ? pieces[0] : pieces.join(''));
        pieces = [];
        start = idx + 1;
      }
      if (start < text.length) pieces.push(text.slice(start));
    }

    return {
      async next() {
        for (;;) {
          if (readyPos < ready.length) {
            const value = ready[readyPos++];
            if (readyPos > 1024) { ready.splice(0, readyPos); readyPos = 0; }
            return { value, done: false };
          }
          if (finished) {
            if (pieces.length) { const value = pieces.join(''); pieces = []; return { value, done: false }; }
            return { value: undefined, done: true };
          }
          const chunk = await reader.read();
          if (chunk.done) {
            finished = true;
            const tail = decoder.decode();
            if (tail) feed(tail);
          } else {
            feed(decoder.decode(chunk.value, { stream: true }));
          }
        }
      },
      async cancel() { try { await reader.cancel(); } catch (_) {} }
    };
  }

  async function isGzip(file) {
    try {
      const b = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      return b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
    } catch (_) { return false; }
  }

  async function openLines(file) {
    if (!file || typeof file.stream !== 'function') throw new BackupError('Questo dispositivo non può leggere il file di backup.');
    let stream = file.stream();
    if (await isGzip(file)) {
      if (typeof DecompressionStream !== 'function') {
        throw new BackupError('Il backup è compresso e questo dispositivo non sa decomprimerlo (serve iOS 16.4 o successivo).');
      }
      stream = stream.pipeThrough(new DecompressionStream('gzip'));
    }
    return makeLineReader(stream);
  }

  async function scan(file, handler) {
    const lines = await openLines(file);
    let n = 0;
    try {
      for (;;) {
        let item;
        try { item = await lines.next(); }
        catch (e) { throw new BackupError('File di backup danneggiato o incompleto (' + (e && e.message ? e.message : 'lettura fallita') + ').'); }
        if (item.done) break;
        n++;
        if (!item.value) continue;
        let obj;
        try { obj = JSON.parse(item.value); }
        catch (_) { throw new BackupError('File di backup danneggiato (riga ' + n + ' non valida).'); }
        if (!obj || typeof obj !== 'object' || typeof obj.t !== 'string') throw new BackupError('File di backup non valido (riga ' + n + ').');
        await handler(obj, n);
      }
    } finally {
      await lines.cancel();
    }
  }

  // ================================================================
  //  CREAZIONE
  // ================================================================
  async function buildBackup() {
    const keysPl  = await idbKeys(STORE_PL);
    const keysEpg = await idbKeys(STORE_EPG);
    const keysFav = await idbKeys(STORE_FAV);
    const settings = collectSettings();

    const canCompress = (typeof CompressionStream === 'function');
    const enc = new TextEncoder();
    const chunks = [];
    let writer = null, collector = null;

    if (canCompress) {
      const gz = new CompressionStream('gzip');
      writer = gz.writable.getWriter();
      const reader = gz.readable.getReader();
      collector = (async () => {
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          chunks.push(r.value);
        }
      })();
    }

    const emit = async (obj) => {
      const line = JSON.stringify(obj) + '\n';
      if (writer) await writer.write(enc.encode(line));
      else chunks.push(line);
    };

    const counts = { playlists: 0, epgs: 0, favorites: 0, settings: 0 };
    try {
      await emit({
        t: 'header', app: 'ZappOne', format: FORMAT, exportedAt: new Date().toISOString(),
        counts: { playlists: keysPl.length, epgs: keysEpg.length, favorites: keysFav.length, settings: settings.length }
      });

      for (const [k, v] of settings) { await emit({ t: 'ls', k, v }); counts.settings++; }

      for (const key of keysPl) {
        const rec = await idbGet(STORE_PL, key);
        if (!rec) continue;
        const plData = await idbGet(STORE_PL_DATA, key);
        if (plData && plData.content !== undefined) rec.content = plData.content;
        await emit({ t: 'pl', r: rec });
        counts.playlists++;
      }

      for (const key of keysEpg) {
        const rec = await idbGet(STORE_EPG, key);
        if (!rec) continue;
        const epgData = await idbGet(STORE_EPG_DATA, key);
        if (epgData && epgData.content !== undefined) rec.content = epgData.content;
        if (Array.isArray(rec.content)) {
          const meta = Object.assign({}, rec); delete meta.content;
          await emit({ t: 'epg', r: meta, n: rec.content.length });
          for (let i = 0; i < rec.content.length; i++) await emit({ t: 'ec', c: rec.content[i] });
        } else {
          await emit({ t: 'epg', r: rec, n: -1 });
        }
        counts.epgs++;
      }

      const favs = [];
      for (const key of keysFav) { const rec = await idbGet(STORE_FAV, key); if (rec) favs.push(rec); }
      for (const rec of favs) { await emit({ t: 'fav', r: rec }); counts.favorites++; }

      await emit({ t: 'end', counts });
      if (writer) { await writer.close(); await collector; }
    } catch (e) {
      if (writer) { try { await writer.abort(e); } catch (_) {} try { await collector; } catch (_) {} }
      throw e;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const compressed = canCompress;
    const blob = new Blob(chunks, { type: compressed ? 'application/gzip' : 'application/x-ndjson' });
    return { blob, filename: `zappone-backup-${stamp}.${compressed ? 'ndjson.gz' : 'ndjson'}`, counts, compressed };
  }

  async function deliver(blob, filename) {
    try {
      if (typeof File === 'function' && navigator.share && navigator.canShare) {
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Backup ZappOne' });
          return 'shared';
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return 'downloaded';
  }

  // ================================================================
  //  RIPRISTINO
  // ================================================================
  async function validate(file) {
    let header = null, end = null, pendingEc = 0;
    const seen = { playlists: 0, epgs: 0, favorites: 0, settings: 0 };
    await scan(file, (o, n) => {
      if (n === 1 || header === null) {
        if (o.t !== 'header' || o.app !== 'ZappOne') throw new BackupError('Questo non è un backup di ZappOne.');
        if (o.format !== FORMAT) throw new BackupError('Backup creato con un formato non supportato (' + (o.format || ('v' + o.version) || '?') + ').');
        header = o;
        return;
      }
      if (end) throw new BackupError('File di backup non valido (righe dopo la chiusura).');
      if (pendingEc > 0 && o.t !== 'ec') throw new BackupError('File di backup incompleto (EPG interrotto alla riga ' + n + ').');
      switch (o.t) {
        case 'ls':  if (typeof o.k !== 'string') throw new BackupError('Impostazione non valida (riga ' + n + ').'); seen.settings++; break;
        case 'pl':  if (!o.r || typeof o.r.content !== 'string' || typeof o.r.name !== 'string') throw new BackupError('Playlist non valida (riga ' + n + ').'); seen.playlists++; break;
        case 'epg': if (!o.r || typeof o.r !== 'object' || typeof o.n !== 'number') throw new BackupError('EPG non valido (riga ' + n + ').'); seen.epgs++; pendingEc = o.n > 0 ? o.n : 0; break;
        case 'ec':  if (pendingEc <= 0 || !o.c || typeof o.c !== 'object') throw new BackupError('Canale EPG fuori posto (riga ' + n + ').'); pendingEc--; break;
        case 'fav': if (!o.r || typeof o.r.key !== 'string') throw new BackupError('Preferito non valido (riga ' + n + ').'); seen.favorites++; break;
        case 'end': end = o; break;
        default: throw new BackupError('Riga sconosciuta (' + n + ').');
      }
    });
    if (!header) throw new BackupError('File vuoto.');
    if (!end) throw new BackupError('Il backup è incompleto (manca la chiusura del file).');
    if (pendingEc > 0) throw new BackupError('Il backup è incompleto (EPG troncato).');
    const c = end.counts || {};
    if (c.playlists !== seen.playlists || c.epgs !== seen.epgs || c.favorites !== seen.favorites || c.settings !== seen.settings) {
      throw new BackupError('Il backup è incompleto (i conteggi non tornano).');
    }
    return { header, counts: seen };
  }

  let restoring = false;

  async function restore(file) {
    if (restoring) return { ok: false, reason: 'busy' };
    if (typeof appConfig !== 'undefined' && appConfig && appConfig.canUpload === false) {
      showNotification('Il ripristino da backup è riservato alla versione Premium', true);
      return { ok: false, reason: 'demo' };
    }
    restoring = true;

    try {
      showNotification('Controllo del backup…');
      let info;
      try { info = await validate(file); }
      catch (e) {
        showNotification(e instanceof BackupError ? e.message : 'Backup non leggibile', true);
        if (!(e instanceof BackupError)) console.error('Validazione backup fallita:', e);
        return { ok: false, reason: 'invalid', error: e };
      }

      const when = info.header.exportedAt ? new Date(info.header.exportedAt).toLocaleString('it-IT') : 'data sconosciuta';
      const ok = confirm(
        `Ripristinare il backup del ${when}?\n\n` +
        `Contiene:\n· ${info.counts.playlists} playlist\n· ${info.counts.epgs} EPG\n· ${info.counts.favorites} preferiti\n· ${info.counts.settings} impostazioni\n\n` +
        `I contenuti attuali verranno sostituiti. Se qualcosa va storto l'app resta com'è ora.`
      );
      if (!ok) return { ok: false, reason: 'cancelled' };

      try { if (typeof cleanupPlayers === 'function') await cleanupPlayers(); } catch (_) {}
      showNotification('Ripristino in corso… non chiudere l\'app');

      const oldKeys = { [STORE_PL]: await idbKeys(STORE_PL), [STORE_EPG]: await idbKeys(STORE_EPG), [STORE_FAV]: await idbKeys(STORE_FAV) };
      const oldFavs = await idbGetAll(STORE_FAV);
      const added = { [STORE_PL]: [], [STORE_EPG]: [] };
      const addedFavKeys = new Set();
      const settings = [];

      try {
        let cur = null;
        const flushEpg = async () => {
          const rec = Object.assign({}, cur.meta, { content: cur.channels });
          added[STORE_EPG].push(await dbAddEpgRecord(rec));
          cur = null;
        };


        await scan(file, async (o, n) => {
          if (n === 1) return;
          switch (o.t) {
            case 'ls':  settings.push([o.k, o.v]); break;
            case 'pl':  { const rec = Object.assign({}, o.r); delete rec.id; added[STORE_PL].push(await dbAddPlaylistRecord(rec)); break; }


            case 'epg': {
              const meta = Object.assign({}, o.r); delete meta.id;
              if (o.n < 0) { added[STORE_EPG].push(await dbAddEpgRecord(meta)); }
              else { cur = { meta, channels: [], n: o.n }; if (o.n === 0) await flushEpg(); }
              break;
            }
            case 'ec':  cur.channels.push(o.c); if (cur.channels.length === cur.n) await flushEpg(); break;
            case 'fav': await idbPut(STORE_FAV, o.r); addedFavKeys.add(o.r.key); break;
            default: break;
          }
        });



  

await idbBatch([STORE_PL, STORE_PL_DATA, STORE_EPG, STORE_EPG_DATA, STORE_FAV], (tx) => {
oldKeys[STORE_PL].forEach(k => { tx.objectStore(STORE_PL).delete(k); tx.objectStore(STORE_PL_DATA).delete(k); });
oldKeys[STORE_EPG].forEach(k => { tx.objectStore(STORE_EPG).delete(k); tx.objectStore(STORE_EPG_DATA).delete(k); });

          oldKeys[STORE_FAV].forEach(k => { if (!addedFavKeys.has(k)) tx.objectStore(STORE_FAV).delete(k); });
        });
      } catch (e) {
        try {


await idbBatch([STORE_PL, STORE_PL_DATA, STORE_EPG, STORE_EPG_DATA, STORE_FAV], (tx) => {
added[STORE_PL].forEach(k => { tx.objectStore(STORE_PL).delete(k); tx.objectStore(STORE_PL_DATA).delete(k); });
added[STORE_EPG].forEach(k => { tx.objectStore(STORE_EPG).delete(k); tx.objectStore(STORE_EPG_DATA).delete(k); });


            addedFavKeys.forEach(k => tx.objectStore(STORE_FAV).delete(k));
            oldFavs.forEach(f => tx.objectStore(STORE_FAV).put(f));
          });
        } catch (rb) { console.error('Rollback del ripristino non riuscito:', rb); }
        console.error('Ripristino fallito, stato precedente rimesso a posto:', e);
        showNotification((e instanceof BackupError ? e.message : 'Ripristino non riuscito') + ' Nulla è stato modificato.', true);
        return { ok: false, reason: 'failed', error: e };
      }

      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        keys.forEach(k => { if (k !== null && !SETTINGS_DENY.has(k)) localStorage.removeItem(k); });
        settings.forEach(([k, v]) => { if (!SETTINGS_DENY.has(k)) localStorage.setItem(k, v); });
      } catch (e) { console.warn('Impostazioni non ripristinate del tutto:', e); }

      showNotification('Backup ripristinato. Riavvio in corso…');
      setTimeout(() => { window.location.replace(window.location.origin + window.location.pathname); }, 800);
      return { ok: true, counts: info.counts };
    } finally {
      restoring = false;
    }
  }

  // ================================================================
  //  COLLEGAMENTO CON I PULSANTI DEL TAB CONTENUTI
  //  (event delegation: funziona anche con sidebar iniettata dopo)
  // ================================================================
  let pending = null;
  let building = false;

  function setCreateLabel(btn, text) {
    const span = btn && btn.querySelector('span');
    if (span) span.textContent = text;
  }

  async function onCreateClick() {
    const btn = document.getElementById('backupCreateBtn');
    if (!btn || building) return;

    if (pending) {
      const result = await deliver(pending.blob, pending.filename);
      if (result !== 'cancelled') { pending = null; setCreateLabel(btn, 'Crea backup'); }
      if (result === 'downloaded') showNotification('Backup salvato');
      return;
    }

    building = true; btn.disabled = true; setCreateLabel(btn, 'Creazione in corso…');
    try {
      const { blob, filename, counts, compressed } = await buildBackup();
      pending = { blob, filename };
      const mb = (blob.size / 1048576).toFixed(1);
      setCreateLabel(btn, `Salva backup (${mb} MB)`);
      showNotification(`Backup pronto${compressed ? '' : ' (non compresso)'}: ${counts.playlists} playlist, ${counts.epgs} EPG, ${counts.favorites} preferiti. Tocca "Salva backup".`);
    } catch (e) {
      console.error('Creazione backup fallita:', e);
      showNotification('Errore nella creazione del backup', true);
      setCreateLabel(btn, 'Crea backup');
    } finally {
      building = false; btn.disabled = false;
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#backupCreateBtn')) {
      e.preventDefault();
      onCreateClick();
      return;
    }
    if (e.target.closest('#backupRestoreBtn')) {
      e.preventDefault();
      document.getElementById('backupFileInput')?.click();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'backupFileInput') {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) restore(f);
    }
  });

  window.ZappOneBackup = { build: buildBackup, restore, validate, deliver, makeLineReader, FORMAT };
})();