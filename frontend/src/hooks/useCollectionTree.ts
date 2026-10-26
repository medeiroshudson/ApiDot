import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  WorkspaceTreeDto,
  CollectionNodeDto,
  FolderNodeDto,
  RequestItemNodeDto,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  CreateFolderRequest,
  UpdateFolderRequest,
  CreateRequestItemRequest,
  UpdateRequestItemRequest,
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
} from '@/lib/treeApi';

export type ActiveTreeItemType = 'collection' | 'folder' | 'request';

export interface ActiveTreeItem {
  type: ActiveTreeItemType;
  id: string;
  data?: CollectionNodeDto | FolderNodeDto | RequestItemNodeDto | unknown;
}

export function filterTree(tree: WorkspaceTreeDto | null, filterText: string): WorkspaceTreeDto | null {
  if (!tree || !Array.isArray(tree.collections)) return null;
  const term = filterText.trim().toLowerCase();
  if (!term) return tree;

  function matchesRequest(req: RequestItemNodeDto): boolean {
    return (
      req.name.toLowerCase().includes(term) ||
      (req.url ? req.url.toLowerCase().includes(term) : false) ||
      (req.method ? req.method.toLowerCase().includes(term) : false)
    );
  }

  function filterFolder(folder: FolderNodeDto): FolderNodeDto | null {
    const folderNameMatches = folder.name.toLowerCase().includes(term);
    if (folderNameMatches) {
      return folder;
    }

    const filteredSubFolders = folder.subFolders
      .map(filterFolder)
      .filter((f): f is FolderNodeDto => f !== null);
    const filteredRequests = folder.requests.filter(matchesRequest);

    if (filteredSubFolders.length > 0 || filteredRequests.length > 0) {
      return {
        ...folder,
        subFolders: filteredSubFolders,
        requests: filteredRequests,
      };
    }
    return null;
  }

  function filterCollection(col: CollectionNodeDto): CollectionNodeDto | null {
    const colNameMatches = col.name.toLowerCase().includes(term);
    if (colNameMatches) {
      return col;
    }

    const filteredFolders = col.folders
      .map(filterFolder)
      .filter((f): f is FolderNodeDto => f !== null);
    const filteredRequests = col.requests.filter(matchesRequest);

    if (filteredFolders.length > 0 || filteredRequests.length > 0) {
      return {
        ...col,
        folders: filteredFolders,
        requests: filteredRequests,
      };
    }
    return null;
  }

  const collections = tree.collections
    .map(filterCollection)
    .filter((c): c is CollectionNodeDto => c !== null);

  return {
    ...tree,
    collections,
  };
}

export interface UseCollectionTreeResult {
  tree: WorkspaceTreeDto | null;
  filteredTree: WorkspaceTreeDto | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  activeItem: ActiveTreeItem | null;
  setActiveItem: React.Dispatch<React.SetStateAction<ActiveTreeItem | null>>;
  filterText: string;
  setFilterText: (text: string) => void;
  createCollection: (
    data: Omit<CreateCollectionRequest, 'workspaceId'> & { workspaceId?: string }
  ) => Promise<CollectionNodeDto>;
  updateCollection: (id: string, data: UpdateCollectionRequest) => Promise<CollectionNodeDto>;
  deleteCollection: (id: string) => Promise<void>;
  createFolder: (
    data: Omit<CreateFolderRequest, 'workspaceId'> & { workspaceId?: string }
  ) => Promise<FolderNodeDto>;
  updateFolder: (id: string, data: UpdateFolderRequest) => Promise<FolderNodeDto>;
  deleteFolder: (id: string) => Promise<void>;
  createRequest: (
    data: Omit<CreateRequestItemRequest, 'workspaceId'> & { workspaceId?: string }
  ) => Promise<RequestItemNodeDto>;
  updateRequest: (id: string, data: UpdateRequestItemRequest) => Promise<RequestItemNodeDto>;
  duplicateRequest: (id: string) => Promise<RequestItemNodeDto>;
  deleteRequest: (id: string) => Promise<void>;
}

function folderContainsItem(folders: FolderNodeDto[], type: string, id: string): boolean {
  for (const f of folders) {
    if (type === 'folder' && f.id === id) return true;
    for (const r of f.requests) {
      if (type === 'request' && r.id === id) return true;
    }
    if (folderContainsItem(f.subFolders, type, id)) return true;
  }
  return false;
}

function itemExistsInCollections(collections: CollectionNodeDto[], type: string, id: string): boolean {
  for (const c of collections) {
    if (type === 'collection' && c.id === id) return true;
    for (const r of c.requests) {
      if (type === 'request' && r.id === id) return true;
    }
    if (folderContainsItem(c.folders, type, id)) return true;
  }
  return false;
}

export function useCollectionTree(
  workspaceId: string | null | undefined,
  initialTree: WorkspaceTreeDto | null = null
): UseCollectionTreeResult {
  const [tree, setTree] = useState<WorkspaceTreeDto | null>(initialTree);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState<string>('');
  const [activeItem, setActiveItem] = useState<ActiveTreeItem | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (!workspaceId) {
      setTree(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchWorkspaceTree(workspaceId);
      if (data && Array.isArray(data.collections)) {
        setTree(data);
        setActiveItem((current) => {
          if (!current) return null;
          return itemExistsInCollections(data.collections, current.type, current.id) ? current : null;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar árvore de coleções';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filteredTree = useMemo(() => {
    return filterTree(tree, filterText);
  }, [tree, filterText]);

  const createCollection = useCallback(
    async (
      data: Omit<CreateCollectionRequest, 'workspaceId'> & { workspaceId?: string }
    ): Promise<CollectionNodeDto> => {
      setError(null);
      try {
        const targetWorkspaceId = data.workspaceId || workspaceId;
        if (!targetWorkspaceId) {
          throw new Error('Nenhum workspace selecionado');
        }
        const created = await createCollectionApi({
          workspaceId: targetWorkspaceId,
          name: data.name,
          defaultTarget: data.defaultTarget,
        });
        await reload();
        return created;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao criar coleção';
        setError(msg);
        throw err;
      }
    },
    [workspaceId, reload]
  );

  const updateCollection = useCallback(
    async (id: string, data: UpdateCollectionRequest): Promise<CollectionNodeDto> => {
      setError(null);
      try {
        const updated = await updateCollectionApi(id, data);
        await reload();
        setActiveItem((current) => {
          if (current?.id === id && current.type === 'collection') {
            return { ...current, data: updated };
          }
          return current;
        });
        return updated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao atualizar coleção';
        setError(msg);
        throw err;
      }
    },
    [reload]
  );

  const deleteCollection = useCallback(
    async (id: string): Promise<void> => {
      setError(null);
      try {
        await deleteCollectionApi(id);
        setActiveItem((current) => {
          if (
            current?.id === id ||
            (current?.data &&
              typeof current.data === 'object' &&
              'collectionId' in current.data &&
              (current.data as { collectionId?: string }).collectionId === id)
          ) {
            return null;
          }
          return current;
        });
        await reload();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao excluir coleção';
        setError(msg);
        throw err;
      }
    },
    [reload]
  );

  const createFolder = useCallback(
    async (
      data: Omit<CreateFolderRequest, 'workspaceId'> & { workspaceId?: string }
    ): Promise<FolderNodeDto> => {
      setError(null);
      try {
        const targetWorkspaceId = data.workspaceId || workspaceId;
        if (!targetWorkspaceId) {
          throw new Error('Nenhum workspace selecionado');
        }
        const created = await createFolderApi({
          workspaceId: targetWorkspaceId,
          name: data.name,
          collectionId: data.collectionId,
          parentFolderId: data.parentFolderId,
          defaultTarget: data.defaultTarget,
        });
        await reload();
        return created;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao criar pasta';
        setError(msg);
        throw err;
      }
    },
    [workspaceId, reload]
  );

  const updateFolder = useCallback(
    async (id: string, data: UpdateFolderRequest): Promise<FolderNodeDto> => {
      setError(null);
      try {
        const updated = await updateFolderApi(id, data);
        await reload();
        setActiveItem((current) => {
          if (current?.id === id && current.type === 'folder') {
            return { ...current, data: updated };
          }
          return current;
        });
        return updated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao atualizar pasta';
        setError(msg);
        throw err;
      }
    },
    [reload]
  );

  const deleteFolder = useCallback(
    async (id: string): Promise<void> => {
      setError(null);
      try {
        await deleteFolderApi(id);
        setActiveItem((current) => {
          if (
            current?.id === id ||
            (current?.data &&
              typeof current.data === 'object' &&
              'folderId' in current.data &&
              (current.data as { folderId?: string }).folderId === id)
          ) {
            return null;
          }
          return current;
        });
        await reload();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao excluir pasta';
        setError(msg);
        throw err;
      }
    },
    [reload]
  );

  const createRequest = useCallback(
    async (
      data: Omit<CreateRequestItemRequest, 'workspaceId'> & { workspaceId?: string }
    ): Promise<RequestItemNodeDto> => {
      setError(null);
      try {
        const targetWorkspaceId = data.workspaceId || workspaceId;
        if (!targetWorkspaceId) {
          throw new Error('Nenhum workspace selecionado');
        }
        const created = await createRequestApi({
          workspaceId: targetWorkspaceId,
          name: data.name,
          method: data.method,
          url: data.url,
          collectionId: data.collectionId,
          folderId: data.folderId,
          target: data.target,
          headersJson: data.headersJson,
          bodyType: data.bodyType,
          bodyContent: data.bodyContent,
        });
        await reload();
        return created;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao criar requisição';
        setError(msg);
        throw err;
      }
    },
    [workspaceId, reload]
  );

  const updateRequest = useCallback(
    async (id: string, data: UpdateRequestItemRequest): Promise<RequestItemNodeDto> => {
      setError(null);
      try {
        const updated = await updateRequestApi(id, data);
        await reload();
        setActiveItem((current) => {
          if (current?.id === id && current.type === 'request') {
            return { ...current, data: updated };
          }
          return current;
        });
        return updated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao atualizar requisição';
        setError(msg);
        throw err;
      }
    },
    [reload]
  );

  const duplicateRequest = useCallback(
    async (id: string): Promise<RequestItemNodeDto> => {
      setError(null);
      try {
        const duplicated = await duplicateRequestApi(id);
        await reload();
        return duplicated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao duplicar requisição';
        setError(msg);
        throw err;
      }
    },
    [reload]
  );

  const deleteRequest = useCallback(
    async (id: string): Promise<void> => {
      setError(null);
      try {
        await deleteRequestApi(id);
        setActiveItem((current) => {
          if (current?.id === id && current.type === 'request') {
            return null;
          }
          return current;
        });
        await reload();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao excluir requisição';
        setError(msg);
        throw err;
      }
    },
    [reload]
  );

  return {
    tree,
    filteredTree,
    isLoading,
    error,
    reload,
    activeItem,
    setActiveItem,
    filterText,
    setFilterText,
    createCollection,
    updateCollection,
    deleteCollection,
    createFolder,
    updateFolder,
    deleteFolder,
    createRequest,
    updateRequest,
    duplicateRequest,
    deleteRequest,
  };
}
