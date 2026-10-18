/* Tiny IndexedDB key-value store, shared by the page and the service worker.
   The service worker cannot read localStorage, so the reminder settings and
   today's reading count are mirrored here for it. */
const KV = (() => {
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open("nous", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction("kv", mode), s = t.objectStore("kv"), q = fn(s);
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error);
    });
  }
  return {
    get: k => tx("readonly", s => s.get(k)).catch(() => undefined),
    set: (k, v) => tx("readwrite", s => s.put(v, k)).catch(() => {}),
  };
})();
