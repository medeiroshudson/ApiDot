import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveWorkspaceOffline,
  loadWorkspacesOffline,
  saveCollectionOffline,
  loadCollectionsOffline,
  queuePendingMutation,
  getPendingMutations,
  clearPendingMutations,
  deleteWorkspaceOffline,
  deleteCollectionOffline,
  defaultStorageAdapters,
  PendingMutation,
  MUTATIONS_QUEUE_PATH,
} from './offlineStorage';
import { WorkspaceDto } from '@/lib/treeApi';

describe('offlineStorage (Local-First Disk Storage & Mutation Queue)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  describe('1. saveWorkspaceOffline', () => {
    it('saves workspace JSON to local storage and enqueues mutation when offline (Step 1 Contract)', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      const mockQueue = vi.fn().mockResolvedValue(true);

      await saveWorkspaceOffline({ id: 'ws-1', name: 'Local WS' } as any, {
        saveFile: mockSave,
        queueMutation: mockQueue,
      });

      expect(mockSave).toHaveBeenCalledWith(
        'workspaces/ws-1.json',
        expect.stringContaining('Local WS')
      );
      expect(mockQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ws-1',
          entityType: 'Workspace',
          action: 'Upsert',
        })
      );
    });

    it('does not enqueue mutation when enqueueMutation is explicitly false', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      const mockQueue = vi.fn().mockResolvedValue(true);

      await saveWorkspaceOffline(
        { id: 'ws-2', name: 'Server Cached WS', createdAtUtc: '2026-01-01' },
        {
          saveFile: mockSave,
          queueMutation: mockQueue,
          enqueueMutation: false,
        }
      );

      expect(mockSave).toHaveBeenCalledWith(
        'workspaces/ws-2.json',
        expect.stringContaining('Server Cached WS')
      );
      expect(mockQueue).not.toHaveBeenCalled();
    });

    it('uses queuePendingMutation when queueMutation adapter is not provided', async () => {
      const savedFiles: Record<string, string> = {};
      const mockSave = vi.fn().mockImplementation(async (path: string, content: string) => {
        savedFiles[path] = content;
      });
      const mockLoad = vi.fn().mockImplementation(async (path: string) => {
        return savedFiles[path] || null;
      });

      await saveWorkspaceOffline(
        { id: 'ws-auto', name: 'Auto Queued WS', createdAtUtc: '2026-01-01' },
        {
          saveFile: mockSave,
          loadFile: mockLoad,
        }
      );

      expect(mockSave).toHaveBeenCalledWith('workspaces/ws-auto.json', expect.any(String));
      expect(savedFiles[MUTATIONS_QUEUE_PATH]).toBeDefined();

      const queued = JSON.parse(savedFiles[MUTATIONS_QUEUE_PATH]);
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({
        id: 'ws-auto',
        entityType: 'Workspace',
        action: 'Upsert',
      });
    });
  });

  describe('2. loadWorkspacesOffline', () => {
    it('lists workspace files and parses valid workspaces', async () => {
      const ws1: WorkspaceDto = { id: 'ws-1', name: 'Workspace Alpha', createdAtUtc: '2026-01-01' };
      const ws2: WorkspaceDto = { id: 'ws-2', name: 'Workspace Beta', createdAtUtc: '2026-01-02' };

      const mockList = vi.fn().mockResolvedValue(['ws-1.json', 'ws-2.json']);
      const mockLoad = vi.fn().mockImplementation(async (path: string) => {
        if (path === 'workspaces/ws-1.json') return JSON.stringify(ws1);
        if (path === 'workspaces/ws-2.json') return JSON.stringify(ws2);
        return null;
      });

      const result = await loadWorkspacesOffline({
        listFiles: mockList,
        loadFile: mockLoad,
      });

      expect(mockList).toHaveBeenCalledWith('workspaces');
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(ws1);
      expect(result).toContainEqual(ws2);
    });

    it('handles full relative paths from listFiles (e.g. "workspaces/ws-1.json")', async () => {
      const ws: WorkspaceDto = { id: 'ws-1', name: 'Workspace Alpha', createdAtUtc: '2026-01-01' };

      const mockList = vi.fn().mockResolvedValue(['workspaces/ws-1.json']);
      const mockLoad = vi.fn().mockResolvedValue(JSON.stringify(ws));

      const result = await loadWorkspacesOffline({
        listFiles: mockList,
        loadFile: mockLoad,
      });

      expect(mockLoad).toHaveBeenCalledWith('workspaces/ws-1.json');
      expect(result).toEqual([ws]);
    });

    it('ignores non-JSON or corrupted files gracefully without throwing', async () => {
      const validWs: WorkspaceDto = { id: 'ws-ok', name: 'Valid WS', createdAtUtc: '2026-01-01' };

      const mockList = vi.fn().mockResolvedValue(['.DS_Store', 'corrupt.json', 'ws-ok.json']);
      const mockLoad = vi.fn().mockImplementation(async (path: string) => {
        if (path === 'workspaces/.DS_Store') return 'binary content';
        if (path === 'workspaces/corrupt.json') return 'invalid json content {{{';
        if (path === 'workspaces/ws-ok.json') return JSON.stringify(validWs);
        return null;
      });

      const result = await loadWorkspacesOffline({
        listFiles: mockList,
        loadFile: mockLoad,
      });

      expect(result).toEqual([validWs]);
    });

    it('returns empty array if listFiles returns empty or throws', async () => {
      const mockList = vi.fn().mockRejectedValue(new Error('Directory not found'));
      const result = await loadWorkspacesOffline({ listFiles: mockList });
      expect(result).toEqual([]);
    });
  });

  describe('3. saveCollectionOffline & loadCollectionsOffline', () => {
    it('saves collection to collections/<workspaceId>/<id>.json and enqueues mutation', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      const mockQueue = vi.fn().mockResolvedValue(true);

      const collection = {
        id: 'col-1',
        name: 'Users API',
        workspaceId: 'ws-123',
        defaultTarget: 'Agent',
      };

      await saveCollectionOffline(collection, {
        saveFile: mockSave,
        queueMutation: mockQueue,
      });

      expect(mockSave).toHaveBeenCalledWith(
        'collections/ws-123/col-1.json',
        expect.stringContaining('Users API')
      );
      expect(mockQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'col-1',
          entityType: 'Collection',
          action: 'Upsert',
        })
      );
    });

    it('loads collections for a specific workspaceId', async () => {
      const col1 = { id: 'col-1', name: 'Users API', workspaceId: 'ws-123' };
      const col2 = { id: 'col-2', name: 'Auth API', workspaceId: 'ws-123' };

      const mockList = vi.fn().mockResolvedValue(['col-1.json', 'col-2.json']);
      const mockLoad = vi.fn().mockImplementation(async (path: string) => {
        if (path === 'collections/ws-123/col-1.json') return JSON.stringify(col1);
        if (path === 'collections/ws-123/col-2.json') return JSON.stringify(col2);
        return null;
      });

      const result = await loadCollectionsOffline('ws-123', {
        listFiles: mockList,
        loadFile: mockLoad,
      });

      expect(mockList).toHaveBeenCalledWith('collections/ws-123');
      expect(result).toEqual([col1, col2]);
    });

    it('returns empty array when workspace collections directory is empty', async () => {
      const mockList = vi.fn().mockResolvedValue([]);
      const result = await loadCollectionsOffline('ws-empty', { listFiles: mockList });
      expect(result).toEqual([]);
    });
  });

  describe('4. Mutation Queue Lifecycle (get, queue, clear)', () => {
    it('returns empty array when mutation queue file does not exist', async () => {
      const mockLoad = vi.fn().mockResolvedValue(null);
      const result = await getPendingMutations({ loadFile: mockLoad });
      expect(result).toEqual([]);
    });

    it('queues multiple mutations and updates existing entity mutations in place', async () => {
      const storage: Record<string, string> = {};
      const adapters = {
        saveFile: vi.fn(async (path: string, content: string) => {
          storage[path] = content;
        }),
        loadFile: vi.fn(async (path: string) => {
          return storage[path] || null;
        }),
      };

      const mutation1: PendingMutation = {
        id: 'ws-1',
        entityType: 'Workspace',
        action: 'Upsert',
        payloadJson: '{"name":"WS 1"}',
        updatedAtUtc: '2026-01-01T00:00:00Z',
      };
      const mutation2: PendingMutation = {
        id: 'col-1',
        entityType: 'Collection',
        action: 'Upsert',
        payloadJson: '{"name":"Col 1"}',
        updatedAtUtc: '2026-01-01T00:01:00Z',
      };
      const mutation1Updated: PendingMutation = {
        id: 'ws-1',
        entityType: 'Workspace',
        action: 'Upsert',
        payloadJson: '{"name":"WS 1 Renamed"}',
        updatedAtUtc: '2026-01-01T00:05:00Z',
      };

      await queuePendingMutation(mutation1, adapters);
      await queuePendingMutation(mutation2, adapters);

      let list = await getPendingMutations(adapters);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('ws-1');
      expect(list[1].id).toBe('col-1');

      // Update ws-1 mutation
      await queuePendingMutation(mutation1Updated, adapters);
      list = await getPendingMutations(adapters);
      expect(list).toHaveLength(2);
      expect(list[0].payloadJson).toBe('{"name":"WS 1 Renamed"}');
    });

    it('clears pending mutations using deleteFile when available', async () => {
      const mockDelete = vi.fn().mockResolvedValue(true);
      await clearPendingMutations({ deleteFile: mockDelete });
      expect(mockDelete).toHaveBeenCalledWith(MUTATIONS_QUEUE_PATH);
    });

    it('clears pending mutations by writing empty array when deleteFile is not provided', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      await clearPendingMutations({ saveFile: mockSave });
      expect(mockSave).toHaveBeenCalledWith(MUTATIONS_QUEUE_PATH, '[]');
    });
  });

  describe('5. Offline Deletion (deleteWorkspaceOffline & deleteCollectionOffline)', () => {
    it('deletes workspace file and queues Delete mutation', async () => {
      const mockDelete = vi.fn().mockResolvedValue(true);
      const mockQueue = vi.fn().mockResolvedValue(true);

      await deleteWorkspaceOffline('ws-delete', {
        deleteFile: mockDelete,
        queueMutation: mockQueue,
      });

      expect(mockDelete).toHaveBeenCalledWith('workspaces/ws-delete.json');
      expect(mockQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ws-delete',
          entityType: 'Workspace',
          action: 'Delete',
        })
      );
    });

    it('deletes collection file and queues Delete mutation', async () => {
      const mockDelete = vi.fn().mockResolvedValue(true);
      const mockQueue = vi.fn().mockResolvedValue(true);

      await deleteCollectionOffline('col-delete', 'ws-123', {
        deleteFile: mockDelete,
        queueMutation: mockQueue,
      });

      expect(mockDelete).toHaveBeenCalledWith('collections/ws-123/col-delete.json');
      expect(mockQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'col-delete',
          entityType: 'Collection',
          action: 'Delete',
        })
      );
    });
  });

  describe('6. Default Adapters in Tauri Environment', () => {
    it('dispatches to Tauri IPC commands when isDesktop() is true', async () => {
      const mockInvoke = vi.fn().mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'fs_save_storage') return undefined;
        if (cmd === 'fs_load_storage') return '{"mock":"content"}';
        if (cmd === 'fs_list_storage') return ['file1.json', 'file2.json'];
        if (cmd === 'fs_delete_storage') return undefined;
        throw new Error(`Unknown command ${cmd}`);
      });

      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      await defaultStorageAdapters.saveFile!('workspaces/test.json', '{"mock":"content"}');
      expect(mockInvoke).toHaveBeenCalledWith(
        'fs_save_storage',
        expect.objectContaining({ relPath: 'workspaces/test.json' })
      );

      const loaded = await defaultStorageAdapters.loadFile!('workspaces/test.json');
      expect(mockInvoke).toHaveBeenCalledWith(
        'fs_load_storage',
        expect.objectContaining({ relPath: 'workspaces/test.json' })
      );
      expect(loaded).toBe('{"mock":"content"}');

      const list = await defaultStorageAdapters.listFiles!('workspaces');
      expect(mockInvoke).toHaveBeenCalledWith(
        'fs_list_storage',
        expect.objectContaining({ relDir: 'workspaces' })
      );
      expect(list).toEqual(['file1.json', 'file2.json']);

      await defaultStorageAdapters.deleteFile!('workspaces/test.json');
      expect(mockInvoke).toHaveBeenCalledWith(
        'fs_delete_storage',
        expect.objectContaining({ relPath: 'workspaces/test.json' })
      );
    });
  });

  describe('7. Default Adapters in Browser / Fallback Environment', () => {
    it('persists and retrieves from localStorage when not in Tauri desktop', async () => {
      // In jsdom without Tauri globals
      await defaultStorageAdapters.saveFile!('workspaces/local-1.json', '{"name":"Local Browser"}');
      expect(localStorage.getItem('apidot_fs_workspaces/local-1.json')).toBe(
        '{"name":"Local Browser"}'
      );

      const loaded = await defaultStorageAdapters.loadFile!('workspaces/local-1.json');
      expect(loaded).toBe('{"name":"Local Browser"}');

      await defaultStorageAdapters.saveFile!('workspaces/local-2.json', '{"name":"Local 2"}');
      const list = await defaultStorageAdapters.listFiles!('workspaces');
      expect(list).toContain('local-1.json');
      expect(list).toContain('local-2.json');

      await defaultStorageAdapters.deleteFile!('workspaces/local-1.json');
      expect(localStorage.getItem('apidot_fs_workspaces/local-1.json')).toBeNull();
      const updatedList = await defaultStorageAdapters.listFiles!('workspaces');
      expect(updatedList).not.toContain('local-1.json');
      expect(updatedList).toContain('local-2.json');
    });
  });
});
