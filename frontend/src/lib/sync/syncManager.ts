import {
  getPendingMutations,
  clearPendingMutations,
  queuePendingMutation,
  PendingMutation,
  StorageAdapters,
} from '@/lib/storage/offlineStorage';

export interface SyncConflict {
  id: string;
  entityType: string;
  reason: string;
  resolution: string;
}

export interface SyncResult {
  success: boolean;
  appliedCount: number;
  conflictCount: number;
  conflicts: SyncConflict[];
  error?: string;
}

export interface SyncOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  adapters?: StorageAdapters;
  pollIntervalMs?: number;
  checkHealth?: boolean;
  onSyncComplete?: (result: SyncResult) => void;
  onError?: (error: Error) => void;
}

let isSyncing = false;

/**
 * Resets the internal sync in-progress state (useful for unit tests).
 */
export function resetSyncState(): void {
  isSyncing = false;
}

/**
 * Returns whether a synchronization operation is currently running.
 */
export function isSyncInProgress(): boolean {
  return isSyncing;
}

/**
 * Dispatches a list of pending mutations to the batch reconciliation endpoint
 * `POST /api/sync/batch`. Upon HTTP 200 OK, removes the processed mutations from the local queue.
 */
export async function processSyncQueue(
  mutations: PendingMutation[],
  options?: SyncOptions
): Promise<SyncResult> {
  if (!mutations || mutations.length === 0) {
    return {
      success: true,
      appliedCount: 0,
      conflictCount: 0,
      conflicts: [],
    };
  }

  const fetchImpl =
    options?.fetchFn || (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);
  if (!fetchImpl) {
    return {
      success: false,
      appliedCount: 0,
      conflictCount: 0,
      conflicts: [],
      error: 'Fetch API is not available in current environment',
    };
  }

  const baseUrl = options?.baseUrl ? options.baseUrl.replace(/\/+$/, '') : '';
  const url = `${baseUrl}/api/sync/batch`;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mutations }),
    });

    if (!response.ok) {
      let errorMessage = `Sync batch failed with HTTP ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson && (errorJson.detail || errorJson.title || errorJson.message)) {
          errorMessage = errorJson.detail || errorJson.title || errorJson.message;
        }
      } catch {
        try {
          const errorText = await response.text();
          if (errorText) errorMessage = errorText;
        } catch {
          // Keep default error message
        }
      }

      return {
        success: false,
        appliedCount: 0,
        conflictCount: 0,
        conflicts: [],
        error: errorMessage,
      };
    }

    const data = await response.json();
    const appliedCount = typeof data?.appliedCount === 'number' ? data.appliedCount : 0;
    const conflicts = Array.isArray(data?.conflicts) ? data.conflicts : [];
    const conflictCount =
      typeof data?.conflictCount === 'number' ? data.conflictCount : conflicts.length;

    // Only remove mutations that were successfully processed in this batch, preserving in-flight mutations
    const currentQueue = await getPendingMutations(options?.adapters);
    const processedIds = new Set(mutations.map((m) => m.id));
    const remainingQueue = currentQueue.filter((m) => !processedIds.has(m.id));

    if (remainingQueue.length === 0) {
      await clearPendingMutations(options?.adapters);
    } else {
      const saveFn = options?.adapters?.saveFile;
      if (saveFn) {
        await saveFn('queue/pending_mutations.json', JSON.stringify(remainingQueue, null, 2));
      } else {
        await clearPendingMutations(options?.adapters);
        for (const item of remainingQueue) {
          await queuePendingMutation(item, options?.adapters);
        }
      }
    }

    return {
      success: true,
      appliedCount,
      conflictCount,
      conflicts,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      appliedCount: 0,
      conflictCount: 0,
      conflicts: [],
      error: errorMsg,
    };
  }
}

/**
 * Reads all queued mutations from local storage and dispatches them to the server.
 * Returns immediately without making an HTTP request if the queue is empty.
 */
export async function syncPendingMutations(
  options?: SyncOptions
): Promise<SyncResult> {
  if (isSyncing) {
    return {
      success: true,
      appliedCount: 0,
      conflictCount: 0,
      conflicts: [],
    };
  }

  isSyncing = true;
  try {
    const mutations = await getPendingMutations(options?.adapters);
    if (!mutations || mutations.length === 0) {
      return {
        success: true,
        appliedCount: 0,
        conflictCount: 0,
        conflicts: [],
      };
    }

    const result = await processSyncQueue(mutations, options);
    if (options?.onSyncComplete) {
      options.onSyncComplete(result);
    }
    return result;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (options?.onError) {
      options.onError(error);
    }
    return {
      success: false,
      appliedCount: 0,
      conflictCount: 0,
      conflicts: [],
      error: error.message,
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Starts automatic reconnection listener and health polling.
 * Listens to browser `online` events and synchronizes pending local mutations.
 * Returns a cleanup function to unregister listeners.
 */
export function startSyncListener(options?: SyncOptions): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let isCleanedUp = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const runSync = async () => {
    if (isCleanedUp) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
      await syncPendingMutations(options);
    } catch (err: unknown) {
      if (options?.onError && err instanceof Error) {
        options.onError(err);
      }
    }
  };

  const handleOnline = () => {
    void runSync();
  };

  window.addEventListener('online', handleOnline);

  // Periodic connectivity polling to /health when configured
  if (options?.pollIntervalMs && options.pollIntervalMs > 0) {
    pollTimer = setInterval(async () => {
      if (isCleanedUp) return;
      if (options.checkHealth) {
        const fetchImpl =
          options.fetchFn || (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);
        const baseUrl = options.baseUrl ? options.baseUrl.replace(/\/+$/, '') : '';
        try {
          const res = await fetchImpl(`${baseUrl}/health`);
          if (res.ok) {
            void runSync();
          }
        } catch {
          // Server still unreachable
        }
      } else {
        void runSync();
      }
    }, options.pollIntervalMs);
  }

  // Trigger initial synchronization check if already online
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    void runSync();
  }

  return () => {
    isCleanedUp = true;
    window.removeEventListener('online', handleOnline);
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}
