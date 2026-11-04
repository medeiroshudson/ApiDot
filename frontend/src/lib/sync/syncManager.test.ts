import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  processSyncQueue,
  syncPendingMutations,
  startSyncListener,
  resetSyncState,
  SyncResult,
} from './syncManager';
import {
  PendingMutation,
  queuePendingMutation,
  getPendingMutations,
  MUTATIONS_QUEUE_PATH,
} from '@/lib/storage/offlineStorage';

describe('syncManager (Reconnection Synchronizer & Mutation Batch Dispatcher)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSyncState();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    resetSyncState();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('1. processSyncQueue', () => {
    it('dispatches pending mutations to /api/sync/batch upon online event and clears queue (Step 1 Contract)', async () => {
      const pendingMutations = [{ id: 'm1', entityType: 'Collection', action: 'Upsert' }];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ appliedCount: 1, conflicts: [] }),
      });
      globalThis.fetch = mockFetch;

      const result = await processSyncQueue(pendingMutations as any);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sync/batch',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ mutations: pendingMutations }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
    });

    it('returns success with 0 applied when mutations list is empty and does not call fetch', async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const result = await processSyncQueue([]);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        appliedCount: 0,
        conflictCount: 0,
        conflicts: [],
      });
    });

    it('clears pending mutations queue via clearPendingMutations after successful sync', async () => {
      const savedFiles: Record<string, string> = {
        [MUTATIONS_QUEUE_PATH]: JSON.stringify([
          { id: 'm-1', entityType: 'Workspace', action: 'Upsert' },
        ]),
      };

      const mockDelete = vi.fn().mockImplementation(async (path: string) => {
        delete savedFiles[path];
      });
      const mockLoad = vi.fn().mockImplementation(async (path: string) => savedFiles[path] || null);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ appliedCount: 1, conflictCount: 0, conflicts: [] }),
      });

      const mutations: PendingMutation[] = [
        {
          id: 'm-1',
          entityType: 'Workspace',
          action: 'Upsert',
          payloadJson: '{"name":"WS 1"}',
          updatedAtUtc: '2026-11-03T00:00:00Z',
        },
      ];

      const result = await processSyncQueue(mutations, {
        fetchFn: mockFetch as any,
        adapters: {
          deleteFile: mockDelete,
          loadFile: mockLoad,
        },
      });

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
      expect(mockDelete).toHaveBeenCalledWith(MUTATIONS_QUEUE_PATH);
      expect(savedFiles[MUTATIONS_QUEUE_PATH]).toBeUndefined();
    });

    it('handles server HTTP error response without clearing mutations queue', async () => {
      const mockDelete = vi.fn();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Internal Server Error' }),
      });

      const mutations: PendingMutation[] = [
        {
          id: 'm-err',
          entityType: 'Request',
          action: 'Upsert',
          payloadJson: '{}',
          updatedAtUtc: '2026-11-03T00:00:00Z',
        },
      ];

      const result = await processSyncQueue(mutations, {
        fetchFn: mockFetch as any,
        adapters: { deleteFile: mockDelete },
      });

      expect(result.success).toBe(false);
      expect(result.appliedCount).toBe(0);
      expect(result.error).toBe('Internal Server Error');
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('handles network failure (fetch throws) gracefully and preserves mutations queue', async () => {
      const mockDelete = vi.fn();
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));

      const mutations: PendingMutation[] = [
        {
          id: 'm-net',
          entityType: 'Folder',
          action: 'Upsert',
          payloadJson: '{}',
          updatedAtUtc: '2026-11-03T00:00:00Z',
        },
      ];

      const result = await processSyncQueue(mutations, {
        fetchFn: mockFetch as any,
        adapters: { deleteFile: mockDelete },
      });

      expect(result.success).toBe(false);
      expect(result.appliedCount).toBe(0);
      expect(result.error).toBe('Network disconnected');
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('handles server conflicts in 200 OK response and clears queue', async () => {
      const mockDelete = vi.fn();
      const conflicts = [
        {
          id: 'c-1',
          entityType: 'Workspace',
          reason: 'Remote workspace is newer',
          resolution: 'Created local backup (Local Backup)',
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ appliedCount: 0, conflictCount: 1, conflicts }),
      });

      const mutations: PendingMutation[] = [
        {
          id: 'c-1',
          entityType: 'Workspace',
          action: 'Upsert',
          payloadJson: '{}',
          updatedAtUtc: '2026-11-03T00:00:00Z',
        },
      ];

      const result = await processSyncQueue(mutations, {
        fetchFn: mockFetch as any,
        adapters: { deleteFile: mockDelete },
      });

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
      expect(result.conflictCount).toBe(1);
      expect(result.conflicts).toEqual(conflicts);
      expect(mockDelete).toHaveBeenCalledWith(MUTATIONS_QUEUE_PATH);
    });

    it('prepends custom baseUrl when configured in options', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ appliedCount: 1, conflicts: [] }),
      });

      const mutations: PendingMutation[] = [
        {
          id: 'm-url',
          entityType: 'Collection',
          action: 'Upsert',
          payloadJson: '{}',
          updatedAtUtc: '2026-11-03T00:00:00Z',
        },
      ];

      await processSyncQueue(mutations, {
        fetchFn: mockFetch as any,
        baseUrl: 'https://api.apidot.dev/',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.apidot.dev/api/sync/batch',
        expect.any(Object)
      );
    });
  });

  describe('2. syncPendingMutations', () => {
    it('reads mutations from storage and dispatches them', async () => {
      const storage: Record<string, string> = {};
      const adapters = {
        saveFile: vi.fn(async (path: string, content: string) => {
          storage[path] = content;
        }),
        loadFile: vi.fn(async (path: string) => storage[path] || null),
        deleteFile: vi.fn(async (path: string) => {
          delete storage[path];
        }),
      };

      const mutation: PendingMutation = {
        id: 'ws-100',
        entityType: 'Workspace',
        action: 'Upsert',
        payloadJson: '{"name":"Sync WS"}',
        updatedAtUtc: '2026-11-03T00:00:00Z',
      };
      await queuePendingMutation(mutation, adapters);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ appliedCount: 1, conflicts: [] }),
      });

      const onSyncComplete = vi.fn();
      const result = await syncPendingMutations({
        fetchFn: mockFetch as any,
        adapters,
        onSyncComplete,
      });

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
      expect(onSyncComplete).toHaveBeenCalledWith(result);

      // Verify queue is now cleared in storage
      const remaining = await getPendingMutations(adapters);
      expect(remaining).toHaveLength(0);
    });

    it('returns empty result without calling fetch when queue has no mutations', async () => {
      const mockFetch = vi.fn();
      const mockLoad = vi.fn().mockResolvedValue(null);

      const result = await syncPendingMutations({
        fetchFn: mockFetch as any,
        adapters: { loadFile: mockLoad },
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
    });

    it('prevents concurrent executions when a sync is already running', async () => {
      let resolveFirstFetch: (val: any) => void;
      const firstFetchPromise = new Promise((resolve) => {
        resolveFirstFetch = resolve;
      });

      const mockFetch = vi.fn().mockImplementation(() => firstFetchPromise);

      const storage: Record<string, string> = {};
      const adapters = {
        saveFile: vi.fn(async (path: string, content: string) => {
          storage[path] = content;
        }),
        loadFile: vi.fn(async (path: string) => storage[path] || null),
      };

      await queuePendingMutation(
        {
          id: 'ws-c1',
          entityType: 'Workspace',
          action: 'Upsert',
          payloadJson: '{}',
          updatedAtUtc: '2026-11-03T00:00:00Z',
        },
        adapters
      );

      // Start first sync (will hang until resolved)
      const firstSyncPromise = syncPendingMutations({
        fetchFn: mockFetch as any,
        adapters,
      });

      // Yield execution so getPendingMutations resolves and fetch is invoked
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Attempt second sync concurrently while first is still running
      const secondResult = await syncPendingMutations({
        fetchFn: mockFetch as any,
        adapters,
      });

      expect(secondResult.success).toBe(true);
      expect(secondResult.appliedCount).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Resolve first fetch
      resolveFirstFetch!({
        ok: true,
        json: async () => ({ appliedCount: 1, conflicts: [] }),
      });

      const firstResult = await firstSyncPromise;
      expect(firstResult.success).toBe(true);
      expect(firstResult.appliedCount).toBe(1);
    });
  });

  describe('3. startSyncListener', () => {
    it('registers window online listener and triggers sync when online event fires', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ appliedCount: 1, conflicts: [] }),
      });

      const storage: Record<string, string> = {};
      const adapters = {
        saveFile: vi.fn(async (path: string, content: string) => {
          storage[path] = content;
        }),
        loadFile: vi.fn(async (path: string) => storage[path] || null),
        deleteFile: vi.fn(async (path: string) => {
          delete storage[path];
        }),
      };

      await queuePendingMutation(
        {
          id: 'col-99',
          entityType: 'Collection',
          action: 'Upsert',
          payloadJson: '{}',
          updatedAtUtc: '2026-11-03T00:00:00Z',
        },
        adapters
      );

      const onSyncComplete = vi.fn();
      const cleanup = startSyncListener({
        fetchFn: mockFetch as any,
        adapters,
        onSyncComplete,
      });

      // Fire window online event
      window.dispatchEvent(new Event('online'));

      // Wait for async handler
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/sync/batch', expect.any(Object));
        expect(onSyncComplete).toHaveBeenCalled();
      });

      cleanup();
    });

    it('unregisters online listener when cleanup function is invoked', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ appliedCount: 1, conflicts: [] }),
      });

      const cleanup = startSyncListener({
        fetchFn: mockFetch as any,
      });

      cleanup();

      mockFetch.mockClear();
      window.dispatchEvent(new Event('online'));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('polls /health periodically when pollIntervalMs is configured', async () => {
      vi.useFakeTimers();

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/health')) {
          return Promise.resolve({ ok: true, status: 200 });
        }
        if (url.includes('/api/sync/batch')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ appliedCount: 1, conflicts: [] }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      });

      const storage: Record<string, string> = {};
      const adapters = {
        saveFile: vi.fn(async (path: string, content: string) => {
          storage[path] = content;
        }),
        loadFile: vi.fn(async (path: string) => storage[path] || null),
        deleteFile: vi.fn(async (path: string) => {
          delete storage[path];
        }),
      };

      await queuePendingMutation(
        {
          id: 'poll-req',
          entityType: 'Request',
          action: 'Upsert',
          payloadJson: '{}',
          updatedAtUtc: '2026-11-03T00:00:00Z',
        },
        adapters
      );

      const cleanup = startSyncListener({
        fetchFn: mockFetch as any,
        adapters,
        pollIntervalMs: 5000,
        checkHealth: true,
      });

      // Advance timers by 5000ms
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockFetch).toHaveBeenCalledWith('/health');
      expect(mockFetch).toHaveBeenCalledWith('/api/sync/batch', expect.any(Object));

      cleanup();
      vi.useRealTimers();
    });

    it('returns a no-op cleanup function safely if window is undefined', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error simulating SSR
      delete globalThis.window;

      try {
        const cleanup = startSyncListener();
        expect(typeof cleanup).toBe('function');
        expect(() => cleanup()).not.toThrow();
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });
});
