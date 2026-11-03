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
 * Reseta o estado interno de sincronização (útil para testes unitários).
 */
export function resetSyncState(): void {
  isSyncing = false;
}

/**
 * Retorna se há uma operação de sincronização ativa em andamento.
 */
export function isSyncInProgress(): boolean {
  return isSyncing;
}

/**
 * Envia uma lista de mutações pendentes para o endpoint de reconciliação em lote
 * `POST /api/sync/batch`. Ao obter resposta 200 OK com sucesso, limpa a fila local.
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
          // Manter mensagem padrão
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

    // Remove apenas as mutações processadas com sucesso neste lote, preservando mutações enfileiradas in-flight
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
 * Lê todas as mutações enfileiradas no armazenamento local e executa a reconciliação.
 * Se a fila estiver vazia, retorna imediatamente sem despachar requisição HTTP.
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
 * Inicia o listener de reconexão automática e polling de integridade.
 * Escuta o evento `online` do navegador e despacha as mutações locais pendentes.
 * Retorna função de limpeza para desregistrar os listeners.
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

  // Polling de conectividade com /health quando configurado
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
          // Servidor ainda inacessível
        }
      } else {
        void runSync();
      }
    }, options.pollIntervalMs);
  }

  // Dispara checagem inicial se o ambiente já estiver online
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
