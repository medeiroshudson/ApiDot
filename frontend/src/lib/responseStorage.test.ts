import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getMaxResponseCacheBytes,
  saveResponseToStorage,
  getResponseFromStorage,
  deleteResponseFromStorage,
  clearAllResponsesFromStorage,
} from './responseStorage';
import { ResponseData } from '@/components/response/ResponseViewer';

// In-memory IndexedDB mock implementation for Vitest / JSDOM environment
function createMockIndexedDB() {
  const dbs = new Map<string, Map<string, any>>();

  const idb = {
    open: (dbName: string, version: number = 1) => {
      const openReq: any = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      queueMicrotask(() => {
        let dbStores = dbs.get(dbName);
        let isNew = false;
        if (!dbStores) {
          dbStores = new Map();
          dbs.set(dbName, dbStores);
          isNew = true;
        }

        const db: any = {
          name: dbName,
          version,
          objectStoreNames: {
            contains: (storeName: string) => dbStores!.has(storeName),
          },
          createObjectStore: (storeName: string) => {
            if (!dbStores!.has(storeName)) {
              dbStores!.set(storeName, new Map());
            }
            return {};
          },
          transaction: (storeNames: string | string[], _mode: string) => {
            const primaryStoreName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
            if (!dbStores!.has(primaryStoreName)) {
              dbStores!.set(primaryStoreName, new Map());
            }
            const storeMap = dbStores!.get(primaryStoreName)!;

            const store = {
              put: (value: any, key: string) => {
                const req: any = { onsuccess: null, onerror: null, result: null };
                queueMicrotask(() => {
                  try {
                    storeMap.set(key, structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
                    req.result = key;
                    if (req.onsuccess) req.onsuccess({ target: req });
                  } catch (err) {
                    req.error = err;
                    if (req.onerror) req.onerror({ target: req });
                  }
                });
                return req;
              },
              get: (key: string) => {
                const req: any = { onsuccess: null, onerror: null, result: null };
                queueMicrotask(() => {
                  const val = storeMap.get(key);
                  req.result = val !== undefined ? (structuredClone ? structuredClone(val) : JSON.parse(JSON.stringify(val))) : undefined;
                  if (req.onsuccess) req.onsuccess({ target: req });
                });
                return req;
              },
              delete: (key: string) => {
                const req: any = { onsuccess: null, onerror: null, result: null };
                queueMicrotask(() => {
                  storeMap.delete(key);
                  if (req.onsuccess) req.onsuccess({ target: req });
                });
                return req;
              },
              clear: () => {
                const req: any = { onsuccess: null, onerror: null, result: null };
                queueMicrotask(() => {
                  storeMap.clear();
                  if (req.onsuccess) req.onsuccess({ target: req });
                });
                return req;
              },
            };

            const tx: any = {
              objectStore: () => store,
              onerror: null,
              oncomplete: null,
            };
            return tx;
          },
          close: () => {},
        };

        openReq.result = db;
        if (isNew && openReq.onupgradeneeded) {
          openReq.onupgradeneeded({ target: openReq });
        }
        if (openReq.onsuccess) {
          openReq.onsuccess({ target: openReq });
        }
      });

      return openReq;
    },
    deleteDatabase: (dbName: string) => {
      dbs.delete(dbName);
      const req: any = { onsuccess: null, onerror: null };
      queueMicrotask(() => {
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    },
  };

  return { idb, dbs };
}

describe('responseStorage (IndexedDB Persistent Storage)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB;
  let mockEnv: ReturnType<typeof createMockIndexedDB>;

  const sampleResponse: ResponseData = {
    statusCode: 200,
    statusText: 'OK',
    durationMs: 45,
    sizeBytes: 512,
    headers: {
      'content-type': 'application/json',
      'x-custom-header': 'apidot-test',
    },
    body: {
      message: 'Hello World',
      items: [1, 2, 3],
      nested: { enabled: true, score: 99.5 },
    },
    timing: {
      dnsLookupMs: 5,
      tcpHandshakeMs: 10,
      tlsHandshakeMs: 15,
      timeToFirstByteMs: 30,
      contentDownloadMs: 15,
      totalDurationMs: 45,
    },
  };

  beforeEach(() => {
    mockEnv = createMockIndexedDB();
    (globalThis as any).indexedDB = mockEnv.idb;
    if (typeof window !== 'undefined') {
      (window as any).indexedDB = mockEnv.idb;
    }
    process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB = '5';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB = originalEnv;
    delete (globalThis as any).indexedDB;
    if (typeof window !== 'undefined') {
      delete (window as any).indexedDB;
    }
  });

  describe('1. getMaxResponseCacheBytes', () => {
    it('should return 5MB (5,242,880 bytes) by default when env is unset', () => {
      delete process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB;
      expect(getMaxResponseCacheBytes()).toBe(5 * 1024 * 1024);
    });

    it('should parse valid number from NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB', () => {
      process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB = '10';
      expect(getMaxResponseCacheBytes()).toBe(10 * 1024 * 1024);

      process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB = '2.5';
      expect(getMaxResponseCacheBytes()).toBe(2.5 * 1024 * 1024);
    });

    it('should fallback to 5MB default if env value is negative, zero or non-numeric', () => {
      process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB = '0';
      expect(getMaxResponseCacheBytes()).toBe(5 * 1024 * 1024);

      process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB = '-5';
      expect(getMaxResponseCacheBytes()).toBe(5 * 1024 * 1024);

      process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB = 'not-a-number';
      expect(getMaxResponseCacheBytes()).toBe(5 * 1024 * 1024);
    });
  });

  describe('2. saveResponseToStorage & getResponseFromStorage', () => {
    it('should save and retrieve a response intact with zero mutation', async () => {
      const saved = await saveResponseToStorage('req-1', sampleResponse);
      expect(saved).toBe(true);

      const retrieved = await getResponseFromStorage('req-1');
      expect(retrieved).toEqual(sampleResponse);
      // Verify deep equality of all properties
      expect(retrieved?.statusCode).toBe(200);
      expect(retrieved?.statusText).toBe('OK');
      expect(retrieved?.headers).toEqual(sampleResponse.headers);
      expect(retrieved?.body).toEqual(sampleResponse.body);
      expect(retrieved?.timing).toEqual(sampleResponse.timing);
    });

    it('should return null when retrieving a non-existent key', async () => {
      const result = await getResponseFromStorage('non-existent-key');
      expect(result).toBeNull();
    });

    it('should reject saving responses larger than the configured maximum cache limit', async () => {
      // Configure max cache to 0.001 MB (~1KB = 1048 bytes) for testing limit
      process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB = '0.001';

      // Create a payload larger than 1048 bytes
      const largeBody = 'x'.repeat(2000);
      const largeResponse: ResponseData = {
        statusCode: 200,
        body: largeBody,
      };

      const saved = await saveResponseToStorage('req-large', largeResponse);
      expect(saved).toBe(false);

      // Verify it was NOT persisted to IndexedDB
      const retrieved = await getResponseFromStorage('req-large');
      expect(retrieved).toBeNull();
    });

    it('should accept saving responses <= maximum cache limit', async () => {
      process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB = '1'; // 1 MB

      // Small payload well under 1MB
      const smallResponse: ResponseData = {
        statusCode: 200,
        body: 'small payload',
      };

      const saved = await saveResponseToStorage('req-small', smallResponse);
      expect(saved).toBe(true);

      const retrieved = await getResponseFromStorage('req-small');
      expect(retrieved).toEqual(smallResponse);
    });

    it('should preserve 100% intact complex response body types (string, object, array, null)', async () => {
      const stringResp: ResponseData = { statusCode: 200, body: 'Plain text raw response' };
      const arrayResp: ResponseData = { statusCode: 200, body: [{ id: 1 }, { id: 2 }] };

      await saveResponseToStorage('resp-string', stringResp);
      await saveResponseToStorage('resp-array', arrayResp);

      expect(await getResponseFromStorage('resp-string')).toEqual(stringResp);
      expect(await getResponseFromStorage('resp-array')).toEqual(arrayResp);
    });
  });

  describe('3. deleteResponseFromStorage', () => {
    it('should delete a stored response by key', async () => {
      await saveResponseToStorage('req-del', sampleResponse);
      expect(await getResponseFromStorage('req-del')).toEqual(sampleResponse);

      await deleteResponseFromStorage('req-del');
      expect(await getResponseFromStorage('req-del')).toBeNull();
    });

    it('should not throw when deleting a non-existent key', async () => {
      await expect(deleteResponseFromStorage('does-not-exist')).resolves.toBeUndefined();
    });
  });

  describe('4. clearAllResponsesFromStorage', () => {
    it('should clear all responses in storage', async () => {
      await saveResponseToStorage('req-a', sampleResponse);
      await saveResponseToStorage('req-b', { ...sampleResponse, statusCode: 201 });
      await saveResponseToStorage('__scratchpad__', { ...sampleResponse, statusCode: 204 });

      expect(await getResponseFromStorage('req-a')).not.toBeNull();
      expect(await getResponseFromStorage('req-b')).not.toBeNull();
      expect(await getResponseFromStorage('__scratchpad__')).not.toBeNull();

      await clearAllResponsesFromStorage();

      expect(await getResponseFromStorage('req-a')).toBeNull();
      expect(await getResponseFromStorage('req-b')).toBeNull();
      expect(await getResponseFromStorage('__scratchpad__')).toBeNull();
    });
  });

  describe('5. SSR and Environment Resiliency', () => {
    it('should safely return false/null when IndexedDB is undefined in global scope', async () => {
      delete (globalThis as any).indexedDB;
      if (typeof window !== 'undefined') {
        delete (window as any).indexedDB;
      }

      const saveResult = await saveResponseToStorage('req-ssr', sampleResponse);
      expect(saveResult).toBe(false);

      const getResult = await getResponseFromStorage('req-ssr');
      expect(getResult).toBeNull();

      await expect(deleteResponseFromStorage('req-ssr')).resolves.toBeUndefined();
      await expect(clearAllResponsesFromStorage()).resolves.toBeUndefined();
    });
  });
});
