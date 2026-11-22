/* git-store-kit: the last good copy of each source, for offline and for loading only what changed.

   Kept in IndexedDB (one database, `git-store-kit`, shared by every app on the origin; keys start with the app's
   name), not in local storage: items can be big (a game board over 200 KB), and local storage holds about 5 MB for
   the whole origin, which the app's own data needs. Where IndexedDB isn't there or fails (Node, some private
   windows), the copy is kept in memory for the page's lifetime.

   A cache is {get(key), set(key, value), delete(key)}, all returning promises; createGitStore takes any object
   like it through its `cache` option. */

const DB = 'git-store-kit', STORE = 'sources';

export function memoryCache(){
  const map = new Map();
  return {
    async get(key){ return map.has(key) ? structuredClone(map.get(key)) : null; },
    async set(key, value){ map.set(key, structuredClone(value)); },
    async delete(key){ map.delete(key); }
  };
}

export function indexedCache(idb = globalThis.indexedDB){
  if (!idb) return memoryCache();
  const fallback = memoryCache();
  let opening = null;
  const open = () => opening || (opening = new Promise((ok, no) => {
    let req;
    try { req = idb.open(DB, 1); } catch (e){ no(e); return; }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error);
    req.onblocked = () => no(new Error('blocked'));
  }));
  // one request in its own transaction; any failure falls back to memory, so the app works either way
  const run = (mode, work) => open().then(db => new Promise((ok, no) => {
    const tx = db.transaction(STORE, mode), req = work(tx.objectStore(STORE));
    tx.oncomplete = () => ok(req.result);
    tx.onerror = tx.onabort = () => no(tx.error);
  }));
  return {
    async get(key){
      try { const v = await run('readonly', s => s.get(key)); return v === undefined ? fallback.get(key) : v; }
      catch { return fallback.get(key); }
    },
    async set(key, value){
      try { await run('readwrite', s => s.put(value, key)); }
      catch { await fallback.set(key, value); }
    },
    async delete(key){
      await fallback.delete(key);
      try { await run('readwrite', s => s.delete(key)); } catch { /* nothing kept there */ }
    }
  };
}
