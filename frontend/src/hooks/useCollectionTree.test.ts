import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCollectionTree, filterTree } from './useCollectionTree';
import * as treeApi from '@/lib/treeApi';
import { WorkspaceTreeDto, CollectionNodeDto, FolderNodeDto, RequestItemNodeDto } from '@/lib/treeApi';

describe('useCollectionTree', () => {
  const mockTree: WorkspaceTreeDto = {
    workspaceId: 'ws-1',
    workspaceName: 'Main Workspace',
    collections: [
      {
        id: 'col-1',
        name: 'Auth Collection',
        defaultTarget: 'Inherit',
        openApiSpecUrl: null,
        folders: [
          {
            id: 'fold-1',
            name: 'Tokens',
            collectionId: 'col-1',
            parentFolderId: null,
            defaultTarget: 'Inherit',
            subFolders: [],
            requests: [
              {
                id: 'req-1',
                name: 'Get Token',
                method: 'GET',
                url: 'https://api.test/tokens',
                target: 'Inherit',
                bodyType: 'None',
                headersJson: '{}',
                bodyContent: null,
                collectionId: 'col-1',
                folderId: 'fold-1',
              },
            ],
          },
        ],
        requests: [
          {
            id: 'req-direct',
            name: 'Direct Health',
            method: 'GET',
            url: 'https://api.test/health',
            target: 'Inherit',
            bodyType: 'None',
            headersJson: '{}',
            bodyContent: null,
            collectionId: 'col-1',
            folderId: null,
          },
        ],
      },
      {
        id: 'col-2',
        name: 'Billing Collection',
        defaultTarget: 'Server',
        openApiSpecUrl: null,
        folders: [],
        requests: [
          {
            id: 'req-bill',
            name: 'List Invoices',
            method: 'POST',
            url: 'https://api.test/invoices/query',
            target: 'Server',
            bodyType: 'Json',
            headersJson: '{}',
            bodyContent: '{}',
            collectionId: 'col-2',
            folderId: null,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('filterTree pure logic', () => {
    it('returns null if tree is null', () => {
      expect(filterTree(null, 'test')).toBeNull();
    });

    it('returns original tree when filter text is empty or whitespace', () => {
      expect(filterTree(mockTree, '')).toEqual(mockTree);
      expect(filterTree(mockTree, '   ')).toEqual(mockTree);
    });

    it('filters requests by name and preserves parent folder and collection', () => {
      const filtered = filterTree(mockTree, 'token');
      expect(filtered).not.toBeNull();
      expect(filtered?.collections).toHaveLength(1);
      expect(filtered?.collections[0].id).toBe('col-1');
      expect(filtered?.collections[0].folders).toHaveLength(1);
      expect(filtered?.collections[0].folders[0].requests).toHaveLength(1);
      expect(filtered?.collections[0].folders[0].requests[0].name).toBe('Get Token');
      // Direct health request does not match, so excluded
      expect(filtered?.collections[0].requests).toHaveLength(0);
    });

    it('filters requests by URL', () => {
      const filtered = filterTree(mockTree, 'invoices');
      expect(filtered?.collections).toHaveLength(1);
      expect(filtered?.collections[0].id).toBe('col-2');
      expect(filtered?.collections[0].requests[0].id).toBe('req-bill');
    });

    it('includes all contents when collection name matches', () => {
      const filtered = filterTree(mockTree, 'billing');
      expect(filtered?.collections).toHaveLength(1);
      expect(filtered?.collections[0].id).toBe('col-2');
      expect(filtered?.collections[0].requests).toHaveLength(1);
    });

    it('includes all folder contents when folder name matches', () => {
      const filtered = filterTree(mockTree, 'Tokens');
      expect(filtered?.collections).toHaveLength(1);
      expect(filtered?.collections[0].folders[0].id).toBe('fold-1');
      expect(filtered?.collections[0].folders[0].requests).toHaveLength(1);
    });

    it('returns empty collections when no item matches', () => {
      const filtered = filterTree(mockTree, 'nonexistent');
      expect(filtered?.collections).toHaveLength(0);
    });
  });

  describe('useCollectionTree hook lifecycle and state', () => {
    it('loads tree on mount and exposes tree and filteredTree', async () => {
      vi.spyOn(treeApi, 'fetchWorkspaceTree').mockResolvedValue(mockTree);

      const { result } = renderHook(() => useCollectionTree('ws-1'));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.tree).toBeNull();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(treeApi.fetchWorkspaceTree).toHaveBeenCalledWith('ws-1');
      expect(result.current.tree).toEqual(mockTree);
      expect(result.current.filteredTree).toEqual(mockTree);
      expect(result.current.error).toBeNull();
    });

    it('sets error when fetching tree fails', async () => {
      vi.spyOn(treeApi, 'fetchWorkspaceTree').mockRejectedValue(new Error('Network failure'));

      const { result } = renderHook(() => useCollectionTree('ws-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network failure');
      expect(result.current.tree).toBeNull();
    });

    it('handles empty workspaceId gracefully', async () => {
      const fetchSpy = vi.spyOn(treeApi, 'fetchWorkspaceTree');

      const { result } = renderHook(() => useCollectionTree(''));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.current.tree).toBeNull();
    });

    it('manages activeItem state correctly', async () => {
      vi.spyOn(treeApi, 'fetchWorkspaceTree').mockResolvedValue(mockTree);
      const { result } = renderHook(() => useCollectionTree('ws-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.activeItem).toBeNull();

      act(() => {
        result.current.setActiveItem({
          type: 'request',
          id: 'req-1',
          data: mockTree.collections[0].folders[0].requests[0],
        });
      });

      expect(result.current.activeItem).toEqual({
        type: 'request',
        id: 'req-1',
        data: mockTree.collections[0].folders[0].requests[0],
      });

      act(() => {
        result.current.setActiveItem(null);
      });

      expect(result.current.activeItem).toBeNull();
    });

    it('updates filteredTree when filterText changes', async () => {
      vi.spyOn(treeApi, 'fetchWorkspaceTree').mockResolvedValue(mockTree);
      const { result } = renderHook(() => useCollectionTree('ws-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setFilterText('invoices');
      });

      expect(result.current.filterText).toBe('invoices');
      expect(result.current.filteredTree?.collections).toHaveLength(1);
      expect(result.current.filteredTree?.collections[0].id).toBe('col-2');
    });

    it('reloads tree manually when reload() is called', async () => {
      const fetchSpy = vi.spyOn(treeApi, 'fetchWorkspaceTree').mockResolvedValue(mockTree);
      const { result } = renderHook(() => useCollectionTree('ws-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.reload();
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('mutations', () => {
    beforeEach(() => {
      vi.spyOn(treeApi, 'fetchWorkspaceTree').mockResolvedValue(mockTree);
    });

    it('createCollection calls createCollectionApi and reloads tree', async () => {
      const newCol: CollectionNodeDto = {
        id: 'col-new',
        name: 'New Col',
        defaultTarget: 'Inherit',
        openApiSpecUrl: null,
        folders: [],
        requests: [],
      };
      const apiSpy = vi.spyOn(treeApi, 'createCollectionApi').mockResolvedValue(newCol);
      const fetchSpy = vi.spyOn(treeApi, 'fetchWorkspaceTree');

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let created: CollectionNodeDto | undefined;
      await act(async () => {
        created = await result.current.createCollection({ name: 'New Col' });
      });

      expect(apiSpy).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        name: 'New Col',
        defaultTarget: undefined,
      });
      expect(created).toEqual(newCol);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('updateCollection calls updateCollectionApi and updates activeItem data if active', async () => {
      const updatedCol: CollectionNodeDto = {
        id: 'col-1',
        name: 'Auth Collection Renamed',
        defaultTarget: 'Server',
        openApiSpecUrl: null,
        folders: [],
        requests: [],
      };
      const apiSpy = vi.spyOn(treeApi, 'updateCollectionApi').mockResolvedValue(updatedCol);

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setActiveItem({
          type: 'collection',
          id: 'col-1',
          data: mockTree.collections[0],
        });
      });

      await act(async () => {
        await result.current.updateCollection('col-1', { name: 'Auth Collection Renamed' });
      });

      expect(apiSpy).toHaveBeenCalledWith('col-1', { name: 'Auth Collection Renamed' });
      expect(result.current.activeItem?.data).toEqual(updatedCol);
    });

    it('deleteCollection calls deleteCollectionApi, resets activeItem, and reloads tree', async () => {
      const apiSpy = vi.spyOn(treeApi, 'deleteCollectionApi').mockResolvedValue(undefined);

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setActiveItem({
          type: 'collection',
          id: 'col-1',
        });
      });

      await act(async () => {
        await result.current.deleteCollection('col-1');
      });

      expect(apiSpy).toHaveBeenCalledWith('col-1');
      expect(result.current.activeItem).toBeNull();
    });

    it('createFolder calls createFolderApi and reloads tree', async () => {
      const newFolder: FolderNodeDto = {
        id: 'fold-2',
        name: 'Admin',
        collectionId: 'col-1',
        parentFolderId: null,
        defaultTarget: 'Inherit',
        subFolders: [],
        requests: [],
      };
      const apiSpy = vi.spyOn(treeApi, 'createFolderApi').mockResolvedValue(newFolder);

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let created: FolderNodeDto | undefined;
      await act(async () => {
        created = await result.current.createFolder({
          name: 'Admin',
          collectionId: 'col-1',
        });
      });

      expect(apiSpy).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        name: 'Admin',
        collectionId: 'col-1',
        parentFolderId: undefined,
        defaultTarget: undefined,
      });
      expect(created).toEqual(newFolder);
    });

    it('updateFolder calls updateFolderApi and updates activeItem data if active', async () => {
      const updatedFolder: FolderNodeDto = {
        id: 'fold-1',
        name: 'Tokens Renamed',
        collectionId: 'col-1',
        parentFolderId: null,
        defaultTarget: 'Inherit',
        subFolders: [],
        requests: [],
      };
      const apiSpy = vi.spyOn(treeApi, 'updateFolderApi').mockResolvedValue(updatedFolder);

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setActiveItem({
          type: 'folder',
          id: 'fold-1',
          data: mockTree.collections[0].folders[0],
        });
      });

      await act(async () => {
        await result.current.updateFolder('fold-1', { name: 'Tokens Renamed' });
      });

      expect(apiSpy).toHaveBeenCalledWith('fold-1', { name: 'Tokens Renamed' });
      expect(result.current.activeItem?.data).toEqual(updatedFolder);
    });

    it('deleteFolder calls deleteFolderApi, resets activeItem, and reloads tree', async () => {
      const apiSpy = vi.spyOn(treeApi, 'deleteFolderApi').mockResolvedValue(undefined);

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setActiveItem({
          type: 'folder',
          id: 'fold-1',
        });
      });

      await act(async () => {
        await result.current.deleteFolder('fold-1');
      });

      expect(apiSpy).toHaveBeenCalledWith('fold-1');
      expect(result.current.activeItem).toBeNull();
    });

    it('createRequest calls createRequestApi and reloads tree', async () => {
      const newReq: RequestItemNodeDto = {
        id: 'req-new',
        name: 'Post Token',
        method: 'POST',
        url: 'https://api.test/tokens',
        target: 'Inherit',
        bodyType: 'Json',
        headersJson: '{}',
        bodyContent: null,
        collectionId: 'col-1',
        folderId: 'fold-1',
      };
      const apiSpy = vi.spyOn(treeApi, 'createRequestApi').mockResolvedValue(newReq);

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let created: RequestItemNodeDto | undefined;
      await act(async () => {
        created = await result.current.createRequest({
          name: 'Post Token',
          method: 'POST',
          url: 'https://api.test/tokens',
          collectionId: 'col-1',
          folderId: 'fold-1',
        });
      });

      expect(apiSpy).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        name: 'Post Token',
        method: 'POST',
        url: 'https://api.test/tokens',
        collectionId: 'col-1',
        folderId: 'fold-1',
        target: undefined,
        headersJson: undefined,
        bodyType: undefined,
        bodyContent: undefined,
      });
      expect(created).toEqual(newReq);
    });

    it('updateRequest calls updateRequestApi and updates activeItem data if active', async () => {
      const updatedReq: RequestItemNodeDto = {
        id: 'req-1',
        name: 'Get Token V2',
        method: 'GET',
        url: 'https://api.test/v2/tokens',
        target: 'Inherit',
        bodyType: 'None',
        headersJson: '{}',
        bodyContent: null,
        collectionId: 'col-1',
        folderId: 'fold-1',
      };
      const apiSpy = vi.spyOn(treeApi, 'updateRequestApi').mockResolvedValue(updatedReq);

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setActiveItem({
          type: 'request',
          id: 'req-1',
          data: mockTree.collections[0].folders[0].requests[0],
        });
      });

      await act(async () => {
        await result.current.updateRequest('req-1', {
          name: 'Get Token V2',
          method: 'GET',
          url: 'https://api.test/v2/tokens',
          target: 'Inherit',
          headersJson: '{}',
          bodyType: 'None',
          bodyContent: null,
          collectionId: 'col-1',
          folderId: 'fold-1',
        });
      });

      expect(apiSpy).toHaveBeenCalledWith('req-1', expect.objectContaining({ name: 'Get Token V2' }));
      expect(result.current.activeItem?.data).toEqual(updatedReq);
    });

    it('duplicateRequest calls duplicateRequestApi and reloads tree', async () => {
      const dupReq: RequestItemNodeDto = {
        id: 'req-1-copy',
        name: 'Get Token (Copy)',
        method: 'GET',
        url: 'https://api.test/tokens',
        target: 'Inherit',
        bodyType: 'None',
        headersJson: '{}',
        bodyContent: null,
        collectionId: 'col-1',
        folderId: 'fold-1',
      };
      const apiSpy = vi.spyOn(treeApi, 'duplicateRequestApi').mockResolvedValue(dupReq);

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let duplicated: RequestItemNodeDto | undefined;
      await act(async () => {
        duplicated = await result.current.duplicateRequest('req-1');
      });

      expect(apiSpy).toHaveBeenCalledWith('req-1');
      expect(duplicated).toEqual(dupReq);
    });

    it('deleteRequest calls deleteRequestApi, resets activeItem, and reloads tree', async () => {
      const apiSpy = vi.spyOn(treeApi, 'deleteRequestApi').mockResolvedValue(undefined);

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setActiveItem({
          type: 'request',
          id: 'req-1',
        });
      });

      await act(async () => {
        await result.current.deleteRequest('req-1');
      });

      expect(apiSpy).toHaveBeenCalledWith('req-1');
      expect(result.current.activeItem).toBeNull();
    });

    it('sets error and re-throws when mutation fails', async () => {
      vi.spyOn(treeApi, 'createCollectionApi').mockRejectedValue(new Error('Validation error'));

      const { result } = renderHook(() => useCollectionTree('ws-1'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let thrownErr: Error | null = null;
      await act(async () => {
        try {
          await result.current.createCollection({ name: '' });
        } catch (e) {
          thrownErr = e as Error;
        }
      });

      expect(thrownErr).not.toBeNull();
      expect(thrownErr!.message).toBe('Validation error');
      expect(result.current.error).toBe('Validation error');
    });
  });
});
