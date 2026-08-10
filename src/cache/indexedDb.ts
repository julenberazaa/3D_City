import type { CacheBackend } from "./store";

const DB_NAME = "3d-city-cache";
const STORE = "chunks";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/**
 * IndexedDB-backed cache backend for the browser. Values are stored as
 * { key, bytes: ArrayBuffer, storedAt } records.
 */
export function createIndexedDbCacheBackend(): CacheBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    if (!dbPromise) dbPromise = openDb();
    return dbPromise;
  };

  return {
    async get(key: string): Promise<ArrayBuffer | undefined> {
      const d = await db();
      return new Promise((resolve, reject) => {
        const req = tx(d, "readonly").get(key);
        req.onsuccess = () => {
          const rec = req.result as { bytes?: ArrayBuffer } | undefined;
          resolve(rec?.bytes);
        };
        req.onerror = () => reject(req.error);
      });
    },
    async put(key: string, bytes: ArrayBuffer): Promise<void> {
      const d = await db();
      return new Promise((resolve, reject) => {
        const rec = { key, bytes, storedAt: Date.now() };
        const req = tx(d, "readwrite").put(rec);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    async delete(key: string): Promise<void> {
      const d = await db();
      return new Promise((resolve, reject) => {
        const req = tx(d, "readwrite").delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    async keys(): Promise<string[]> {
      const d = await db();
      return new Promise((resolve, reject) => {
        const req = tx(d, "readonly").getAllKeys();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => reject(req.error);
      });
    },
  };
}
