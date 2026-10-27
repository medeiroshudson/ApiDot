import { ResponseData } from '@/components/response/ResponseViewer';

export const DB_NAME = 'apidot_responses_db';
export const STORE_NAME = 'responses';
export const DB_VERSION = 1;

/**
 * Returns the maximum response size in bytes allowed for disk cache persistence.
 * Configurable via process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB (defaults to 5 MB).
 */
export function getMaxResponseCacheBytes(): number {
  const envVal = process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB;
  if (envVal !== undefined && envVal !== null && envVal !== '') {
    const mb = Number(envVal);
    if (!Number.isNaN(mb) && mb > 0) {
      return mb * 1024 * 1024;
    }
  }
  return 5 * 1024 * 1024; // 5 MB default (5,242,880 bytes)
}

function getIndexedDB(): IDBFactory | null {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  return null;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let cachedIdb: IDBFactory | null = null;

function openDatabase(): Promise<IDBDatabase> {
  const idb = getIndexedDB();
  if (!idb) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }

  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB database'));
    };
  });
}

function getDB(): Promise<IDBDatabase> {
  const idb = getIndexedDB();
  if (!idb) {
    dbPromise = null;
    cachedIdb = null;
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  if (cachedIdb !== idb) {
    dbPromise = null;
    cachedIdb = idb;
  }
  if (!dbPromise) {
    dbPromise = openDatabase().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export function resetDatabaseConnectionForTesting(): void {
  dbPromise = null;
  cachedIdb = null;
}

/**
 * Persists a response payload to IndexedDB if it fits within the max cache size.
 * Responses exceeding the limit are not written to disk and return false.
 * Evicts any stale response from storage before returning false.
 * Zero payload mutation: data is stored 100% intact.
 */
export async function saveResponseToStorage(key: string, data: ResponseData): Promise<boolean> {
  try {
    const serialized = JSON.stringify(data);
    if (serialized.length > getMaxResponseCacheBytes()) {
      await deleteResponseFromStorage(key);
      return false;
    }
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Retrieves a response payload from IndexedDB by its key.
 * Returns null if the response is not found or storage is unavailable.
 */
export async function getResponseFromStorage(key: string): Promise<ResponseData | null> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result ?? null);
      };
      req.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Deletes a stored response by key.
 */
export async function deleteResponseFromStorage(key: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);

      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Graceful no-op
  }
}

/**
 * Clears all stored responses from IndexedDB.
 */
export async function clearAllResponsesFromStorage(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Graceful no-op
  }
}
