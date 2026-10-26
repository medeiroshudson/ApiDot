import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchWorkspaceTree,
  createCollectionApi,
  updateCollectionApi,
  deleteCollectionApi,
  createFolderApi,
  updateFolderApi,
  deleteFolderApi,
  createRequestApi,
  updateRequestApi,
  duplicateRequestApi,
  deleteRequestApi,
  WorkspaceTreeDto,
  CollectionNodeDto,
  FolderNodeDto,
  RequestItemNodeDto,
} from './treeApi';

describe('treeApi', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchWorkspaceTree', () => {
    it('sends GET to /api/workspaces/:id/tree and returns tree DTO', async () => {
      const mockTree: WorkspaceTreeDto = {
        workspaceId: 'ws-1',
        workspaceName: 'Default Workspace',
        collections: [
          {
            id: 'col-1',
            name: 'API v1',
            defaultTarget: 'Inherit',
            openApiSpecUrl: null,
            folders: [],
            requests: [],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTree,
      } as Response);

      const result = await fetchWorkspaceTree('ws-1');

      expect(global.fetch).toHaveBeenCalledWith('/api/workspaces/ws-1/tree');
      expect(result).toEqual(mockTree);
    });

    it('throws error with detail when server returns 404 problem details', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Workspace with ID ws-unknown was not found.' }),
      } as Response);

      await expect(fetchWorkspaceTree('ws-unknown')).rejects.toThrow(
        'Workspace with ID ws-unknown was not found.'
      );
    });

    it('throws error with text when JSON parsing fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        text: async () => 'Internal Server Error',
      } as unknown as Response);

      await expect(fetchWorkspaceTree('ws-error')).rejects.toThrow('Internal Server Error');
    });
  });

  describe('createCollectionApi', () => {
    it('sends POST to /api/collections with payload and returns created collection', async () => {
      const mockCreated: CollectionNodeDto = {
        id: 'col-10',
        name: 'New Collection',
        defaultTarget: 'Inherit',
        openApiSpecUrl: null,
        folders: [],
        requests: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockCreated,
      } as Response);

      const payload = { name: 'New Collection', workspaceId: 'ws-1', defaultTarget: 'Inherit' as const };
      const result = await createCollectionApi(payload);

      expect(global.fetch).toHaveBeenCalledWith('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockCreated);
    });

    it('throws error when validation fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ title: 'Collection name is required.' }),
      } as Response);

      await expect(
        createCollectionApi({ name: '', workspaceId: 'ws-1' })
      ).rejects.toThrow('Collection name is required.');
    });
  });

  describe('updateCollectionApi', () => {
    it('sends PUT to /api/collections/:id with payload and returns updated collection', async () => {
      const mockUpdated: CollectionNodeDto = {
        id: 'col-1',
        name: 'Updated Name',
        defaultTarget: 'Server',
        openApiSpecUrl: null,
        folders: [],
        requests: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockUpdated,
      } as Response);

      const payload = { name: 'Updated Name', defaultTarget: 'Server' as const };
      const result = await updateCollectionApi('col-1', payload);

      expect(global.fetch).toHaveBeenCalledWith('/api/collections/col-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockUpdated);
    });
  });

  describe('deleteCollectionApi', () => {
    it('sends DELETE to /api/collections/:id and returns void on 204', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      const result = await deleteCollectionApi('col-1');

      expect(global.fetch).toHaveBeenCalledWith('/api/collections/col-1', {
        method: 'DELETE',
      });
      expect(result).toBeUndefined();
    });

    it('throws error when collection not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Collection not found.' }),
      } as Response);

      await expect(deleteCollectionApi('col-missing')).rejects.toThrow('Collection not found.');
    });
  });

  describe('createFolderApi', () => {
    it('sends POST to /api/folders with payload and returns created folder', async () => {
      const mockCreated: FolderNodeDto = {
        id: 'fold-1',
        name: 'Auth',
        collectionId: 'col-1',
        parentFolderId: null,
        defaultTarget: 'Inherit',
        subFolders: [],
        requests: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockCreated,
      } as Response);

      const payload = {
        name: 'Auth',
        workspaceId: 'ws-1',
        collectionId: 'col-1',
      };
      const result = await createFolderApi(payload);

      expect(global.fetch).toHaveBeenCalledWith('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockCreated);
    });
  });

  describe('updateFolderApi', () => {
    it('sends PUT to /api/folders/:id with payload and returns updated folder', async () => {
      const mockUpdated: FolderNodeDto = {
        id: 'fold-1',
        name: 'Authentication',
        collectionId: 'col-1',
        parentFolderId: null,
        defaultTarget: 'Inherit',
        subFolders: [],
        requests: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockUpdated,
      } as Response);

      const payload = { name: 'Authentication' };
      const result = await updateFolderApi('fold-1', payload);

      expect(global.fetch).toHaveBeenCalledWith('/api/folders/fold-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockUpdated);
    });

    it('throws error when cycle detection prevents reparenting', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'Cannot set parent folder to itself or a descendant.' }),
      } as Response);

      await expect(
        updateFolderApi('fold-1', { name: 'Auth', parentFolderId: 'fold-1' })
      ).rejects.toThrow('Cannot set parent folder to itself or a descendant.');
    });
  });

  describe('deleteFolderApi', () => {
    it('sends DELETE to /api/folders/:id and handles 204', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await expect(deleteFolderApi('fold-1')).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith('/api/folders/fold-1', {
        method: 'DELETE',
      });
    });
  });

  describe('createRequestApi', () => {
    it('sends POST to /api/requests with payload and returns created request', async () => {
      const mockCreated: RequestItemNodeDto = {
        id: 'req-1',
        name: 'Login',
        method: 'POST',
        url: 'https://api.test/login',
        target: 'Inherit',
        bodyType: 'Json',
        headersJson: '{}',
        bodyContent: '{"user":"test"}',
        collectionId: 'col-1',
        folderId: 'fold-1',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockCreated,
      } as Response);

      const payload = {
        name: 'Login',
        method: 'POST',
        url: 'https://api.test/login',
        workspaceId: 'ws-1',
        collectionId: 'col-1',
        folderId: 'fold-1',
      };
      const result = await createRequestApi(payload);

      expect(global.fetch).toHaveBeenCalledWith('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockCreated);
    });
  });

  describe('updateRequestApi', () => {
    it('sends PUT to /api/requests/:id with payload and returns updated request', async () => {
      const mockUpdated: RequestItemNodeDto = {
        id: 'req-1',
        name: 'Login Updated',
        method: 'POST',
        url: 'https://api.test/v2/login',
        target: 'Server',
        bodyType: 'Json',
        headersJson: '{"Authorization":"Bearer 123"}',
        bodyContent: null,
        collectionId: 'col-1',
        folderId: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockUpdated,
      } as Response);

      const payload = {
        name: 'Login Updated',
        method: 'POST',
        url: 'https://api.test/v2/login',
        target: 'Server' as const,
        headersJson: '{"Authorization":"Bearer 123"}',
        bodyType: 'Json' as const,
        bodyContent: null,
        collectionId: 'col-1',
        folderId: null,
      };
      const result = await updateRequestApi('req-1', payload);

      expect(global.fetch).toHaveBeenCalledWith('/api/requests/req-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockUpdated);
    });
  });

  describe('duplicateRequestApi', () => {
    it('sends POST to /api/requests/:id/duplicate and returns duplicate request', async () => {
      const mockDuplicate: RequestItemNodeDto = {
        id: 'req-2',
        name: 'Login (Copy)',
        method: 'POST',
        url: 'https://api.test/login',
        target: 'Inherit',
        bodyType: 'Json',
        headersJson: '{}',
        bodyContent: null,
        collectionId: 'col-1',
        folderId: 'fold-1',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockDuplicate,
      } as Response);

      const result = await duplicateRequestApi('req-1');

      expect(global.fetch).toHaveBeenCalledWith('/api/requests/req-1/duplicate', {
        method: 'POST',
      });
      expect(result).toEqual(mockDuplicate);
    });
  });

  describe('deleteRequestApi', () => {
    it('sends DELETE to /api/requests/:id and handles 204', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await expect(deleteRequestApi('req-1')).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith('/api/requests/req-1', {
        method: 'DELETE',
      });
    });
  });
});
