// Keeps the chosen image across reloads. Images are too big for localStorage, so use IndexedDB.
const DB = "printy", STORE = "images", KEY = "current";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
    });
  } finally {
    db.close();
  }
}

export async function loadSavedImage(): Promise<Blob | null> {
  try {
    const value = await run<unknown>("readonly", (s) => s.get(KEY));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

export async function saveImage(blob: Blob | null): Promise<void> {
  try {
    if (blob) await run("readwrite", (s) => s.put(blob, KEY));
    else await run("readwrite", (s) => s.delete(KEY));
  } catch { /* storage unavailable (e.g. private browsing): the image just won't persist */ }
}
