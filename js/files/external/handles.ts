/** FileSystemFileHandle is structured-cloneable, unlike localStorage JSON. */
export function createLocalHandleStore(dbFactory: IDBFactory | undefined = globalThis.indexedDB) {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (!dbFactory) return reject(new Error('Local handle storage unavailable'));
    const request = dbFactory.open('easypocketmd-local-handles', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const access = async (id: string, handle?: unknown) => {
    const db = await open();
    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction('handles', handle === undefined ? 'readonly' : 'readwrite');
        const store = tx.objectStore('handles');
        const request = handle === undefined ? store.get(id) : handle === null ? store.delete(id) : store.put(handle, id);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  };
  return { get: (id: string) => access(id), set: (id: string, handle: unknown) => access(id, handle), remove: (id: string) => access(id, null) };
}

export async function ensureHandlePermission(handle: any, interactive: boolean) {
  if (!handle?.getFile || !handle?.createWritable) throw new Error('Local file handle unavailable');
  if (typeof handle.queryPermission !== 'function') return;
  let permission = await handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted' && interactive && handle.requestPermission) permission = await handle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') throw new Error('Local file read/write permission unavailable');
}
