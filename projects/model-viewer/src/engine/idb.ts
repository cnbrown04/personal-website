// Minimal promise wrapper over IndexedDB for the viewer's local data.
// Stores: "parts" (render cache), "uploads" (tool meshes), "kv" (presets, prefs).

const DB_NAME = "model-viewer";
const VERSION = 1;
export type StoreName = "parts" | "uploads" | "kv";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ["parts", "uploads", "kv"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function request<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idb = {
  get: <T>(store: StoreName, key: string) =>
    request<T | undefined>(store, "readonly", (s) => s.get(key)),
  put: (store: StoreName, key: string, value: unknown) =>
    request<void>(store, "readwrite", (s) => s.put(value, key)),
  delete: (store: StoreName, key: string) =>
    request<void>(store, "readwrite", (s) => s.delete(key)),
  all: <T>(store: StoreName) => request<T[]>(store, "readonly", (s) => s.getAll()),
  keys: (store: StoreName) => request<string[]>(store, "readonly", (s) => s.getAllKeys()),
  count: (store: StoreName) => request<number>(store, "readonly", (s) => s.count()),
};

/** Storage can be unavailable (private mode, blocked site data); callers degrade to memory. */
export async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
