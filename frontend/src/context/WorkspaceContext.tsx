'use client';

import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  WorkspaceTreeDto,
  FolderNodeDto,
  RequestItemNodeDto,
  HttpBodyType,
} from '@/lib/treeApi';
import {
  useCollectionTree,
  ActiveTreeItem,
} from '@/hooks/useCollectionTree';
import { RequestData } from '@/components/request/RequestEditor';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useRequestStore } from '@/stores/useRequestStore';
import { useLayoutStore } from '@/stores/useLayoutStore';

export function findRequestInTree(
  tree: WorkspaceTreeDto | null,
  requestId: string
): RequestItemNodeDto | null {
  if (!tree) return null;
  const collections = tree.collections ?? [];
  for (const c of collections) {
    const requests = c.requests ?? [];
    for (const req of requests) {
      if (req.id === requestId) return req;
    }
    const searchFolders = (folders: FolderNodeDto[]): RequestItemNodeDto | null => {
      for (const f of folders) {
        const fRequests = f.requests ?? [];
        for (const req of fRequests) {
          if (req.id === requestId) return req;
        }
        const sub = searchFolders(f.subFolders ?? []);
        if (sub) return sub;
      }
      return null;
    };
    const found = searchFolders(c.folders ?? []);
    if (found) return found;
  }
  return null;
}

export interface WorkspaceContextValue {
  workspaceId: string;
  tree: WorkspaceTreeDto | null;
  filteredTree: WorkspaceTreeDto | null;
  isTreeLoading: boolean;
  treeError: string | null;
  reloadTree: () => Promise<void>;
  activeItem: ActiveTreeItem | null;
  setActiveItem: React.Dispatch<React.SetStateAction<ActiveTreeItem | null>>;
  filterText: string;
  setFilterText: (text: string) => void;
  createCollection: (data: any) => Promise<any>;
  updateCollection: (id: string, data: any) => Promise<any>;
  deleteCollection: (id: string) => Promise<void>;
  createFolder: (data: any) => Promise<any>;
  updateFolder: (id: string, data: any) => Promise<any>;
  deleteFolder: (id: string) => Promise<void>;
  createRequest: (data: any) => Promise<any>;
  updateRequest: (id: string, data: any) => Promise<any>;
  duplicateRequest: (id: string) => Promise<any>;
  deleteRequest: (id: string) => Promise<void>;
  handleSelectItem: (item: ActiveTreeItem) => void;
  handleCreateRequest: (name: string, colId?: string | null, foldId?: string | null) => Promise<any>;
  handleUpdateRequestName: (id: string, name: string) => Promise<any>;
  handleSaveExisting: (reqData: RequestData) => Promise<void>;
  handleSaveAs: (reqData: RequestData) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}): JSX.Element {
  const router = useRouter();

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);

  const activeRequestId = useRequestStore((s) => s.activeRequestId);
  const activeRequestDetails = useRequestStore((s) => s.activeRequestDetails);
  const setActiveRequest = useRequestStore((s) => s.setActiveRequest);
  const setActiveRequestName = useRequestStore((s) => s.setActiveRequestName);
  const setIsSavingRequest = useRequestStore((s) => s.setIsSavingRequest);
  const setPendingSaveData = useRequestStore((s) => s.setPendingSaveData);
  const resetScratchpad = useRequestStore((s) => s.resetScratchpad);

  const setModalOpen = useLayoutStore((s) => s.setModalOpen);

  useEffect(() => {
    if (workspaceId && activeWorkspaceId !== workspaceId) {
      setActiveWorkspaceId(workspaceId);
    }
  }, [workspaceId, activeWorkspaceId, setActiveWorkspaceId]);

  const {
    tree,
    filteredTree,
    isLoading: isTreeLoading,
    error: treeError,
    reload: reloadTree,
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
    deleteRequest: treeDeleteRequest,
  } = useCollectionTree(workspaceId);

  const handleSelectItem = useCallback(
    (item: ActiveTreeItem) => {
      setActiveItem(item);
      if (item.type === 'request') {
        const req =
          (item.data as RequestItemNodeDto | undefined) || findRequestInTree(tree, item.id);
        if (req) {
          setActiveRequest(req.id, {
            id: req.id,
            name: req.name,
            method: req.method || 'GET',
            url: req.url || '',
            target: req.target || 'Inherit',
            headers: req.headersJson || '',
            body: req.bodyContent || '',
            auth: { type: 'none' },
            collectionId: req.collectionId,
            folderId: req.folderId,
            schemaDefinition: req.schemaDefinition,
          });
        }
        router.push(`/workspace/${workspaceId}/request/${item.id}`);
      }
    },
    [setActiveItem, tree, setActiveRequest, router, workspaceId]
  );

  const handleCreateRequest = useCallback(
    async (name: string, colId?: string | null, foldId?: string | null) => {
      const defaultColId = colId || tree?.collections[0]?.id;
      const created = await createRequest({
        workspaceId,
        name,
        method: 'GET',
        url: '',
        target: 'Inherit',
        headersJson: '{}',
        bodyContent: null,
        bodyType: 'None',
        collectionId: defaultColId,
        folderId: foldId || null,
      });

      setActiveItem({
        type: 'request',
        id: created.id,
        data: created,
      });
      setActiveRequest(created.id, {
        id: created.id,
        name: created.name,
        method: created.method,
        url: created.url,
        target: created.target,
        headers: created.headersJson,
        body: created.bodyContent || '',
        auth: { type: 'none' },
        collectionId: created.collectionId,
        folderId: created.folderId,
      });
      router.push(`/workspace/${workspaceId}/request/${created.id}`);
      return created;
    },
    [tree, createRequest, workspaceId, setActiveItem, setActiveRequest, router]
  );

  const handleUpdateRequestName = useCallback(
    async (id: string, name: string) => {
      const existing = activeRequestId === id ? activeRequestDetails : findRequestInTree(tree, id);
      const updated = await updateRequest(id, {
        name,
        method: existing?.method || 'GET',
        url: existing?.url || '',
        target: existing?.target || 'Inherit',
        headersJson:
          existing && 'headers' in existing
            ? (existing as { headers: string }).headers
            : (existing as RequestItemNodeDto | null)?.headersJson || '{}',
        bodyContent:
          existing && 'body' in existing
            ? (existing as { body: string }).body || null
            : (existing as RequestItemNodeDto | null)?.bodyContent || null,
        bodyType:
          (existing as RequestItemNodeDto | null)?.bodyType ||
          (existing && 'body' in existing && (existing as { body: string }).body
            ? (existing as { body: string }).body.trim().startsWith('{') ||
              (existing as { body: string }).body.trim().startsWith('[')
              ? 'Json'
              : 'RawText'
            : 'None'),
        collectionId: existing?.collectionId || null,
        folderId: existing?.folderId || null,
        schemaDefinition: (existing as any)?.schemaDefinition || null,
      });
      if (activeRequestId === id) {
        setActiveRequestName(name);
      }
      return updated;
    },
    [activeRequestId, activeRequestDetails, tree, updateRequest, setActiveRequestName]
  );

  const handleSaveAs = useCallback(
    (reqData: RequestData) => {
      setPendingSaveData(reqData);
      setModalOpen('save', true);
    },
    [setPendingSaveData, setModalOpen]
  );

  const handleSaveExisting = useCallback(
    async (reqData: RequestData) => {
      if (!activeRequestId) {
        handleSaveAs(reqData);
        return;
      }
      setIsSavingRequest(true);
      try {
        const bodyContent = reqData.body || null;
        const bodyType: HttpBodyType = !bodyContent
          ? 'None'
          : bodyContent.trim().startsWith('{') || bodyContent.trim().startsWith('[')
          ? 'Json'
          : 'RawText';

        const updated = await updateRequest(activeRequestId, {
          name: activeRequestDetails?.name || 'Requisição',
          method: reqData.method,
          url: reqData.url,
          target: reqData.target,
          headersJson: reqData.headers || '{}',
          bodyType,
          bodyContent,
          collectionId: activeRequestDetails?.collectionId || null,
          folderId: activeRequestDetails?.folderId || null,
          schemaDefinition: reqData.schemaDefinition || null,
        });

        setActiveRequest(updated.id, {
          id: updated.id,
          name: updated.name,
          method: updated.method,
          url: updated.url,
          target: updated.target,
          headers: updated.headersJson,
          body: updated.bodyContent || '',
          auth: reqData.auth,
          collectionId: updated.collectionId,
          folderId: updated.folderId,
          schemaDefinition: updated.schemaDefinition,
        });
      } finally {
        setIsSavingRequest(false);
      }
    },
    [activeRequestId, activeRequestDetails, updateRequest, setActiveRequest, setIsSavingRequest, handleSaveAs]
  );

  const deleteRequest = useCallback(
    async (id: string) => {
      await treeDeleteRequest(id);
      if (activeRequestId === id) {
        resetScratchpad(workspaceId);
        router.push(`/workspace/${workspaceId}`);
      }
    },
    [activeRequestId, resetScratchpad, workspaceId, router, treeDeleteRequest]
  );

  const contextValue = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceId,
      tree,
      filteredTree,
      isTreeLoading,
      treeError,
      reloadTree,
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
      handleSelectItem,
      handleCreateRequest,
      handleUpdateRequestName,
      handleSaveExisting,
      handleSaveAs,
    }),
    [
      workspaceId,
      tree,
      filteredTree,
      isTreeLoading,
      treeError,
      reloadTree,
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
      handleSelectItem,
      handleCreateRequest,
      handleUpdateRequestName,
      handleSaveExisting,
      handleSaveAs,
    ]
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return context;
}
