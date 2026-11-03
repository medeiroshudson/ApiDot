import { WorkspaceDto } from '@/lib/treeApi';
import { isDesktop } from '@/lib/desktop/runtime';

export interface PendingMutation {
  id: string;
  entityType: 'Workspace' | 'Collection' | 'Folder' | 'Request';
  action: 'Upsert' | 'Delete';
  payloadJson: string;
  updatedAtUtc: string;
}

export interface StorageAdapters {
  saveFile?: (path: string, content: string) => Promise<void | boolean>;
  loadFile?: (path: string) => Promise<string | null>;
  listFiles?: (dir: string) => Promise<string[]>;
  deleteFile?: (path: string) => Promise<void | boolean>;
  queueMutation?: (mutation: PendingMutation) => Promise<void | boolean>;
  enqueueMutation?: boolean;
}

export const MUTATIONS_QUEUE_PATH = 'queue/pending_mutations.json';
export const WORKSPACES_DIR = 'workspaces';
export const COLLECTIONS_DIR = 'collections';

const LOCAL_STORAGE_PREFIX = 'apidot_fs_';

/**
 * Retorna a função de invoke do Tauri IPC caso disponível no ambiente.
 */
function getTauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<any>) | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const tauriInternals = (window as any).__TAURI_INTERNALS__;
  const tauriGlobal = (window as any).__TAURI__;

  if (typeof tauriInternals?.invoke === 'function') {
    return tauriInternals.invoke.bind(tauriInternals);
  }
  if (typeof tauriGlobal?.core?.invoke === 'function') {
    return tauriGlobal.core.invoke.bind(tauriGlobal.core);
  }
  if (typeof tauriGlobal?.invoke === 'function') {
    return tauriGlobal.invoke.bind(tauriGlobal);
  }
  return null;
}

/**
 * Adaptadores de armazenamento padrão com despacho direto para IPC do Tauri no desktop
 * e fallback resiliente em localStorage no navegador web / ambiente de testes.
 */
export const defaultStorageAdapters: StorageAdapters = {
  saveFile: async (relPath: string, content: string): Promise<void> => {
    const invoke = getTauriInvoke();
    if (isDesktop() && invoke) {
      await invoke('fs_save_storage', {
        relPath,
        rel_path: relPath,
        content,
      });
      return;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_PREFIX + relPath, content);
    }
  },

  loadFile: async (relPath: string): Promise<string | null> => {
    const invoke = getTauriInvoke();
    if (isDesktop() && invoke) {
      try {
        const content = await invoke('fs_load_storage', {
          relPath,
          rel_path: relPath,
        });
        return typeof content === 'string' ? content : null;
      } catch {
        return null;
      }
    }

    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(LOCAL_STORAGE_PREFIX + relPath);
    }
    return null;
  },

  listFiles: async (relDir: string): Promise<string[]> => {
    const invoke = getTauriInvoke();
    if (isDesktop() && invoke) {
      try {
        const list = await invoke('fs_list_storage', {
          relDir,
          rel_dir: relDir,
        });
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    }

    if (typeof localStorage !== 'undefined') {
      const normalizedDir = relDir.trim().replace(/^\/+|\/+$/g, '');
      const prefix = LOCAL_STORAGE_PREFIX + (normalizedDir ? `${normalizedDir}/` : '');
      const entries: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const relative = key.slice(prefix.length);
          const topLevelEntry = relative.split('/')[0];
          if (topLevelEntry && !entries.includes(topLevelEntry)) {
            entries.push(topLevelEntry);
          }
        }
      }
      return entries.sort();
    }
    return [];
  },

  deleteFile: async (relPath: string): Promise<void> => {
    const invoke = getTauriInvoke();
    if (isDesktop() && invoke) {
      try {
        await invoke('fs_delete_storage', {
          relPath,
          rel_path: relPath,
        });
      } catch {
        // Idempotente em caso de arquivo inexistente
      }
      return;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_PREFIX + relPath);
    }
  },
};

/**
 * Consulta a lista de mutações offline pendentes da fila local.
 */
export async function getPendingMutations(
  adapters?: StorageAdapters
): Promise<PendingMutation[]> {
  const loadFn = adapters?.loadFile || defaultStorageAdapters.loadFile!;
  try {
    const content = await loadFn(MUTATIONS_QUEUE_PATH);
    if (!content) return [];
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Enfileira uma mutação pendente para reconciliação futura com o servidor.
 */
export async function queuePendingMutation(
  mutation: PendingMutation,
  adapters?: StorageAdapters
): Promise<void> {
  const current = await getPendingMutations(adapters);
  const index = current.findIndex(
    (item) => item.id === mutation.id && item.entityType === mutation.entityType
  );

  if (index >= 0) {
    current[index] = mutation;
  } else {
    current.push(mutation);
  }

  const saveFn = adapters?.saveFile || defaultStorageAdapters.saveFile!;
  await saveFn(MUTATIONS_QUEUE_PATH, JSON.stringify(current, null, 2));
}

/**
 * Limpa a fila de mutações pendentes após sincronização bem-sucedida.
 */
export async function clearPendingMutations(
  adapters?: StorageAdapters
): Promise<void> {
  if (adapters?.deleteFile) {
    await adapters.deleteFile(MUTATIONS_QUEUE_PATH);
  } else if (adapters?.saveFile) {
    await adapters.saveFile(MUTATIONS_QUEUE_PATH, '[]');
  } else {
    await defaultStorageAdapters.deleteFile!(MUTATIONS_QUEUE_PATH);
  }
}

/**
 * Salva um workspace no disco local e opcionalmente enfileira mutação de Upsert.
 */
export async function saveWorkspaceOffline(
  workspace: WorkspaceDto,
  adapters?: StorageAdapters
): Promise<void> {
  const filePath = `${WORKSPACES_DIR}/${workspace.id}.json`;
  const content = JSON.stringify(workspace, null, 2);
  const saveFn = adapters?.saveFile || defaultStorageAdapters.saveFile!;

  await saveFn(filePath, content);

  if (adapters?.enqueueMutation !== false) {
    const mutation: PendingMutation = {
      id: workspace.id,
      entityType: 'Workspace',
      action: 'Upsert',
      payloadJson: content,
      updatedAtUtc: new Date().toISOString(),
    };

    if (adapters?.queueMutation) {
      await adapters.queueMutation(mutation);
    } else {
      await queuePendingMutation(mutation, adapters);
    }
  }
}

/**
 * Carrega todos os workspaces persistidos no diretório offline local.
 */
export async function loadWorkspacesOffline(
  adapters?: StorageAdapters
): Promise<WorkspaceDto[]> {
  const listFn = adapters?.listFiles || defaultStorageAdapters.listFiles!;
  const loadFn = adapters?.loadFile || defaultStorageAdapters.loadFile!;

  try {
    const files = await listFn(WORKSPACES_DIR);
    if (!Array.isArray(files) || files.length === 0) {
      return [];
    }

    const workspaces: WorkspaceDto[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = file.startsWith(`${WORKSPACES_DIR}/`)
        ? file
        : `${WORKSPACES_DIR}/${file}`;

      try {
        const raw = await loadFn(filePath);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.id === 'string' && typeof parsed.name === 'string') {
          workspaces.push(parsed as WorkspaceDto);
        }
      } catch {
        // Ignora arquivos corrompidos sem interromper a listagem dos demais
      }
    }

    return workspaces;
  } catch {
    return [];
  }
}

/**
 * Salva uma coleção no disco local (`collections/<workspaceId>/<id>.json`).
 */
export async function saveCollectionOffline(
  collection: any,
  adapters?: StorageAdapters
): Promise<void> {
  const workspaceId =
    collection.workspaceId || (adapters as any)?.workspaceId || 'default';
  const filePath = `${COLLECTIONS_DIR}/${workspaceId}/${collection.id}.json`;
  const content = JSON.stringify(collection, null, 2);
  const saveFn = adapters?.saveFile || defaultStorageAdapters.saveFile!;

  await saveFn(filePath, content);

  if (adapters?.enqueueMutation !== false) {
    const mutation: PendingMutation = {
      id: collection.id,
      entityType: 'Collection',
      action: 'Upsert',
      payloadJson: content,
      updatedAtUtc: new Date().toISOString(),
    };

    if (adapters?.queueMutation) {
      await adapters.queueMutation(mutation);
    } else {
      await queuePendingMutation(mutation, adapters);
    }
  }
}

/**
 * Carrega as coleções offline vinculadas a um workspace.
 */
export async function loadCollectionsOffline(
  workspaceId: string,
  adapters?: StorageAdapters
): Promise<any[]> {
  const listFn = adapters?.listFiles || defaultStorageAdapters.listFiles!;
  const loadFn = adapters?.loadFile || defaultStorageAdapters.loadFile!;

  try {
    const targetDir = `${COLLECTIONS_DIR}/${workspaceId}`;
    const files = await listFn(targetDir);
    if (!Array.isArray(files) || files.length === 0) {
      return [];
    }

    const collections: any[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = file.startsWith(`${targetDir}/`)
        ? file
        : `${targetDir}/${file}`;

      try {
        const raw = await loadFn(filePath);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.id === 'string') {
          collections.push(parsed);
        }
      } catch {
        // Ignora arquivos corrompidos
      }
    }

    return collections;
  } catch {
    return [];
  }
}

/**
 * Exclui um workspace local e enfileira a mutação de exclusão correspondente.
 */
export async function deleteWorkspaceOffline(
  workspaceId: string,
  adapters?: StorageAdapters
): Promise<void> {
  const filePath = `${WORKSPACES_DIR}/${workspaceId}.json`;
  const deleteFn = adapters?.deleteFile || defaultStorageAdapters.deleteFile!;

  await deleteFn(filePath);

  const mutation: PendingMutation = {
    id: workspaceId,
    entityType: 'Workspace',
    action: 'Delete',
    payloadJson: JSON.stringify({ id: workspaceId }),
    updatedAtUtc: new Date().toISOString(),
  };

  if (adapters?.queueMutation) {
    await adapters.queueMutation(mutation);
  } else if (adapters?.enqueueMutation !== false) {
    await queuePendingMutation(mutation, adapters);
  }
}

/**
 * Exclui uma coleção local e enfileira a mutação de exclusão correspondente.
 */
export async function deleteCollectionOffline(
  collectionId: string,
  workspaceId: string,
  adapters?: StorageAdapters
): Promise<void> {
  const filePath = `${COLLECTIONS_DIR}/${workspaceId}/${collectionId}.json`;
  const deleteFn = adapters?.deleteFile || defaultStorageAdapters.deleteFile!;

  await deleteFn(filePath);

  const mutation: PendingMutation = {
    id: collectionId,
    entityType: 'Collection',
    action: 'Delete',
    payloadJson: JSON.stringify({ id: collectionId, workspaceId }),
    updatedAtUtc: new Date().toISOString(),
  };

  if (adapters?.queueMutation) {
    await adapters.queueMutation(mutation);
  } else if (adapters?.enqueueMutation !== false) {
    await queuePendingMutation(mutation, adapters);
  }
}
