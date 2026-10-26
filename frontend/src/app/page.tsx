'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { CollectionTree } from '@/components/layout/CollectionTree';
import {
  RequestEditor,
  RequestData,
  SaveRequestModal,
  CollectionOption,
  FolderOption,
} from '@/components/request/RequestEditor';
import { ResponseViewer, ResponseData } from '@/components/response/ResponseViewer';
import { EnvironmentModal, EnvironmentGroup } from '@/components/environment/EnvironmentModal';
import { VariableItem } from '@/components/environment/VariableGrid';
import { DependencyRequest, resolveVariables, interpolateVariables } from '@/lib/variables';
import { AutocompleteVariable } from '@/components/request/RequestAutocomplete';
import {
  CollectionSettingsModal,
  SyncReport,
} from '@/components/collection/CollectionSettingsModal';
import {
  useCollectionTree,
  ActiveTreeItem,
} from '@/hooks/useCollectionTree';
import {
  WorkspaceTreeDto,
  WorkspaceDto,
  CollectionNodeDto,
  FolderNodeDto,
  RequestItemNodeDto,
  ExecutionTarget,
  HttpBodyType,
  fetchWorkspacesApi,
  createWorkspaceApi,
} from '@/lib/treeApi';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';
import { CheckCircle2, X, AlertCircle } from 'lucide-react';

const STORAGE_KEY_ACTIVE_WORKSPACE = 'apidot_active_workspace_id';

const DEFAULT_ENVIRONMENTS: EnvironmentGroup[] = [
  { name: 'Development', variables: [] },
  { name: 'Staging', variables: [] },
  { name: 'Production', variables: [] },
];

const DEFAULT_REQUESTS: DependencyRequest[] = [
  {
    id: 'req-auth',
    name: 'Autenticação Login',
    method: 'POST',
    url: 'https://api.example.com/auth/login',
    response: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        token: 'mock-jwt-token-xyz',
        user: { id: 42, role: 'admin' },
      },
    },
  },
];

const CLEAN_SCRATCHPAD: RequestData = {
  method: 'GET',
  url: '',
  target: 'Inherit',
  headers: '',
  body: '',
  auth: { type: 'none' },
};

function flattenFolders(folders: FolderNodeDto[], prefix = ''): FolderOption[] {
  const result: FolderOption[] = [];
  for (const f of folders) {
    const fullName = prefix ? `${prefix} / ${f.name}` : f.name;
    result.push({ id: f.id, name: fullName });
    if (f.subFolders && f.subFolders.length > 0) {
      result.push(...flattenFolders(f.subFolders, fullName));
    }
  }
  return result;
}

function findRequestInTree(
  tree: WorkspaceTreeDto | null,
  requestId: string
): RequestItemNodeDto | null {
  if (!tree) return null;
  for (const c of tree.collections) {
    for (const req of c.requests) {
      if (req.id === requestId) return req;
    }
    const searchFolders = (folders: FolderNodeDto[]): RequestItemNodeDto | null => {
      for (const f of folders) {
        for (const req of f.requests) {
          if (req.id === requestId) return req;
        }
        const sub = searchFolders(f.subFolders);
        if (sub) return sub;
      }
      return null;
    };
    const found = searchFolders(c.folders);
    if (found) return found;
  }
  return null;
}

export default function Home() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [isWorkspacesLoading, setIsWorkspacesLoading] = useState(true);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAgentOnline, setIsAgentOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [activeMobilePane, setActiveMobilePane] = useState<'request' | 'response'>('request');
  const [mounted, setMounted] = useState(false);

  const refreshWorkspaces = useCallback(async (preferredWorkspaceId?: string): Promise<WorkspaceDto[]> => {
    try {
      const list = await fetchWorkspacesApi();
      const validList = Array.isArray(list) ? list : [];
      setWorkspaces(validList);

      if (validList.length === 0) {
        setActiveWorkspaceId(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY_ACTIVE_WORKSPACE);
        }
        return validList;
      }

      let chosenId: string | null = null;
      if (preferredWorkspaceId && validList.some((w) => w.id === preferredWorkspaceId)) {
        chosenId = preferredWorkspaceId;
      } else {
        const savedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ACTIVE_WORKSPACE) : null;
        if (savedId && validList.some((w) => w.id === savedId)) {
          chosenId = savedId;
        } else {
          chosenId = validList[0].id;
        }
      }

      setActiveWorkspaceId(chosenId);
      if (typeof window !== 'undefined' && chosenId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_WORKSPACE, chosenId);
      }
      return validList;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    setIsWorkspacesLoading(true);
    refreshWorkspaces().finally(() => {
      setIsWorkspacesLoading(false);
    });
  }, [refreshWorkspaces]);

  const handleSelectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_ACTIVE_WORKSPACE, id);
    }
  }, []);

  const handleCreateWorkspace = useCallback(async (name: string) => {
    const created = await createWorkspaceApi(name);
    await refreshWorkspaces(created.id);
  }, [refreshWorkspaces]);

  const ensureWorkspaceId = useCallback(async (): Promise<string> => {
    if (activeWorkspaceId) return activeWorkspaceId;
    const list = await refreshWorkspaces();
    if (list && list.length > 0) {
      return list[0].id;
    }
    const created = await createWorkspaceApi('Workspace');
    await refreshWorkspaces(created.id);
    return created.id;
  }, [activeWorkspaceId, refreshWorkspaces]);

  // Tree Hook
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
    deleteRequest,
  } = useCollectionTree(activeWorkspaceId);

  // Active Request State in RequestEditor
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeRequestDetails, setActiveRequestDetails] = useState<{
    id: string;
    name: string;
    method: string;
    url: string;
    target: ExecutionTarget;
    headers: string;
    body: string;
    auth: RequestData['auth'];
    collectionId?: string | null;
    folderId?: string | null;
  } | null>(null);
  const [currentEditorData, setCurrentEditorData] = useState<RequestData | null>(null);
  const [isSavingRequest, setIsSavingRequest] = useState(false);

  // Save As Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<RequestData | null>(null);

  // Environments and Variables State
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [environments, setEnvironments] = useState<EnvironmentGroup[]>(DEFAULT_ENVIRONMENTS);
  const [activeEnvironment, setActiveEnvironment] = useState<string | null>(null);
  const [globals, setGlobals] = useState<VariableItem[]>([]);
  const [collectionVariables, setCollectionVariables] = useState<VariableItem[]>([]);
  const [requestHistory, setRequestHistory] = useState<DependencyRequest[]>(DEFAULT_REQUESTS);

  // Selected Collection & Sync Modal State
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [syncingCollectionId, setSyncingCollectionId] = useState<string | null>(null);
  const [isCollectionSettingsOpen, setIsCollectionSettingsOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionNodeDto | null>(null);
  const [auditBanner, setAuditBanner] = useState<{
    collectionName: string;
    report: SyncReport;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const availableVariables = useMemo<AutocompleteVariable[]>(() => {
    const list: AutocompleteVariable[] = [];
    globals
      .filter((g) => g.isActive !== false && g.key.trim())
      .forEach((g) => {
        list.push({ key: g.key.trim(), value: g.value, scope: 'global' });
      });
    collectionVariables
      .filter((c) => c.isActive !== false && c.key.trim())
      .forEach((c) => {
        list.push({ key: c.key.trim(), value: c.value, scope: 'collection' });
      });
    if (activeEnvironment) {
      const activeEnv = environments.find(
        (e) => e.name.toLowerCase() === activeEnvironment.toLowerCase()
      );
      if (activeEnv) {
        activeEnv.variables
          .filter((v) => v.isActive !== false && v.key.trim())
          .forEach((v) => {
            list.push({ key: v.key.trim(), value: v.value, scope: activeEnvironment });
          });
      }
    }
    return list;
  }, [globals, collectionVariables, environments, activeEnvironment]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync active request details with activeItem state changes
  useEffect(() => {
    if (!activeItem || activeItem.type !== 'request') {
      setActiveRequestId(null);
      setActiveRequestDetails(null);
    }
  }, [activeItem]);

  const handleEnvironmentsChange = (updated: EnvironmentGroup[]) => {
    setEnvironments(updated);
    if (activeEnvironment && !updated.some((e) => e.name === activeEnvironment)) {
      setActiveEnvironment(null);
    }
  };

  const handleOpenCollectionSettings = (item: CollectionNodeDto) => {
    setEditingCollection(item);
    setIsCollectionSettingsOpen(true);
  };

  const handleQuickSync = async (
    item: CollectionNodeDto | { id: string; name: string; openApiSpecUrl?: string | null }
  ) => {
    setSyncingCollectionId(item.id);
    try {
      const res = await fetch(`/api/collections/${item.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specUrl: item.openApiSpecUrl || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const report: SyncReport = data as SyncReport;
        setAuditBanner({
          collectionName: item.name,
          report,
        });
        setSyncError(null);
        await reloadTree();
      } else {
        let errDetail = `Falha ao sincronizar a coleção "${item.name}".`;
        try {
          const json = await res.json();
          errDetail = json.detail || json.title || json.message || errDetail;
        } catch {
          const text = await res.text();
          if (text) errDetail = text;
        }
        setSyncError(errDetail);
        setAuditBanner(null);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : `Falha ao sincronizar a coleção "${item.name}".`;
      setSyncError(msg);
      setAuditBanner(null);
    } finally {
      setSyncingCollectionId(null);
    }
  };

  const handleSyncSuccess = (report: SyncReport) => {
    setAuditBanner({
      collectionName: editingCollection?.name || 'Coleção',
      report,
    });
    setSyncError(null);
    reloadTree();
  };

  const handleSaveCollectionSettings = async (data: {
    name?: string;
    defaultTarget?: ExecutionTarget;
    specUrl?: string;
    specContent?: string;
  }) => {
    if (!editingCollection) return;

    if (
      (data.name && data.name !== editingCollection.name) ||
      (data.defaultTarget && data.defaultTarget !== editingCollection.defaultTarget)
    ) {
      await updateCollection(editingCollection.id, {
        name: data.name || editingCollection.name,
        defaultTarget: data.defaultTarget || editingCollection.defaultTarget,
      });
    }

    if (data.specUrl !== undefined || data.specContent !== undefined) {
      const res = await fetch(`/api/collections/${editingCollection.id}/openapi`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openApiSpecUrl: data.specUrl,
          openApiSpecContent: data.specContent,
        }),
      });

      if (!res.ok) {
        let errDetail = 'Falha ao salvar configurações da coleção.';
        try {
          const json = await res.json();
          errDetail = json.detail || json.title || json.message || errDetail;
        } catch {
          const text = await res.text();
          if (text) errDetail = text;
        }
        throw new Error(errDetail);
      }
    }

    await reloadTree();
  };

  const handleSelectItem = useCallback(
    (item: ActiveTreeItem) => {
      setActiveItem(item);
      if (item.type === 'request') {
        const req =
          (item.data as RequestItemNodeDto | undefined) || findRequestInTree(tree, item.id);
        if (req) {
          setActiveRequestId(req.id);
          setActiveRequestDetails({
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
          });
        }
      } else if (item.type === 'collection') {
        setSelectedCollectionId(item.id);
      }
    },
    [setActiveItem, tree]
  );

  const handleSaveExisting = async (reqData: RequestData) => {
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
      });

      setActiveRequestDetails({
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
      });
    } finally {
      setIsSavingRequest(false);
    }
  };

  const handleSaveAs = (reqData: RequestData) => {
    setPendingSaveData(reqData);
    setIsSaveModalOpen(true);
  };

  const collectionOptions = useMemo<CollectionOption[]>(() => {
    if (!tree?.collections) return [];
    return tree.collections.map((col) => ({
      id: col.id,
      name: col.name,
      folders: flattenFolders(col.folders),
    }));
  }, [tree]);

  const handleSaveNewRequest = async (
    name: string,
    collectionId: string,
    folderId?: string
  ) => {
    const dataToSave = pendingSaveData || currentEditorData || CLEAN_SCRATCHPAD;
    const bodyContent = dataToSave.body || null;
    const bodyType: HttpBodyType = !bodyContent
      ? 'None'
      : bodyContent.trim().startsWith('{') || bodyContent.trim().startsWith('[')
      ? 'Json'
      : 'RawText';

    const wsId = await ensureWorkspaceId();
    const created = await createRequest({
      name,
      method: dataToSave.method || 'GET',
      url: dataToSave.url || '',
      workspaceId: wsId,
      collectionId,
      folderId: folderId || null,
      target: dataToSave.target || 'Inherit',
      headersJson: dataToSave.headers || '{}',
      bodyType,
      bodyContent,
    });

    setActiveItem({
      type: 'request',
      id: created.id,
      data: created,
    });
    setActiveRequestId(created.id);
    setActiveRequestDetails({
      id: created.id,
      name: created.name,
      method: created.method,
      url: created.url,
      target: created.target,
      headers: created.headersJson,
      body: created.bodyContent || '',
      auth: dataToSave.auth || { type: 'none' },
      collectionId: created.collectionId,
      folderId: created.folderId,
    });
    setIsSaveModalOpen(false);
    setPendingSaveData(null);
  };

  const handleCreateRequest = async (
    name: string,
    colId?: string | null,
    foldId?: string | null
  ) => {
    const wsId = await ensureWorkspaceId();
    const defaultColId = colId || tree?.collections[0]?.id || selectedCollectionId;
    const created = await createRequest({
      workspaceId: wsId,
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
    setActiveRequestId(created.id);
    setActiveRequestDetails({
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
    return created;
  };

  const handleUpdateRequestName = async (id: string, name: string) => {
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
    });
    if (activeRequestId === id) {
      setActiveRequestDetails((prev) => (prev ? { ...prev, name } : null));
    }
    return updated;
  };

  const handleImportOpenApi = () => {
    if (tree?.collections && tree.collections.length > 0) {
      handleOpenCollectionSettings(tree.collections[0]);
    }
  };

  const initialEditorRequest = useMemo<Partial<RequestData> & { id?: string }>(() => {
    if (activeRequestDetails) {
      return {
        id: activeRequestDetails.id,
        method: activeRequestDetails.method,
        url: activeRequestDetails.url,
        target: activeRequestDetails.target,
        headers: activeRequestDetails.headers,
        body: activeRequestDetails.body,
        auth: activeRequestDetails.auth,
      };
    }
    return CLEAN_SCRATCHPAD;
  }, [activeRequestDetails]);

  const handleSend = async (request: RequestData) => {
    setIsLoading(true);
    setResponse(null);
    setActiveMobilePane('response');
    const startTime = Date.now();
    try {
      const activeVariables = resolveVariables(
        globals,
        collectionVariables,
        environments,
        activeEnvironment
      );

      const resolvedUrl = interpolateVariables(request.url, activeVariables, requestHistory);

      let parsedHeaders: Record<string, string> = {};
      if (request.headers.trim()) {
        try {
          parsedHeaders = JSON.parse(request.headers);
        } catch {
          request.headers.split('\n').forEach((line) => {
            const idx = line.indexOf(':');
            if (idx > 0) {
              const k = line.slice(0, idx).trim();
              const v = line.slice(idx + 1).trim();
              if (k) parsedHeaders[k] = v;
            }
          });
        }
      }

      const interpolatedHeaders: Record<string, string> = {};
      Object.entries(parsedHeaders).forEach(([k, v]) => {
        interpolatedHeaders[k] = interpolateVariables(v, activeVariables, requestHistory);
      });

      const interpolatedBody = request.body
        ? interpolateVariables(request.body, activeVariables, requestHistory)
        : null;

      const res = await fetch('/api/requests/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: request.method,
          url: resolvedUrl,
          target: request.target,
          headers: interpolatedHeaders,
          bodyContent: interpolatedBody,
          environmentName: activeEnvironment || undefined,
          environmentVariables: activeVariables,
          variables: activeVariables,
        }),
      });

      const durationMs = Date.now() - startTime;
      const contentType = res.headers.get('content-type') || '';
      let bodyText = '';
      let timing = null;
      let targetStatusCode = res.status;
      let targetStatusText = res.statusText || (res.ok ? 'OK' : 'Error');
      const targetHeaders: Record<string, string> = {};

      if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
        const json = await res.json();
        if (json.timing) {
          timing = json.timing;
        }
        if (typeof json.statusCode === 'number') {
          targetStatusCode = json.statusCode;
        }
        if (json.statusText) {
          targetStatusText = json.statusText;
        }
        if (json.headers && typeof json.headers === 'object') {
          Object.entries(json.headers).forEach(([k, v]) => {
            targetHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
          });
        }

        if (typeof json.body === 'string') {
          if (json.body.length === 0) {
            bodyText = '';
          } else {
            try {
              const binary = atob(json.body);
              const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
              bodyText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            } catch {
              bodyText = json.body;
            }
          }
        } else if (json.body !== undefined && json.body !== null) {
          bodyText = JSON.stringify(json.body, null, 2);
        } else if (json.errorMessage) {
          bodyText = json.errorMessage;
        } else {
          bodyText = JSON.stringify(json, null, 2);
        }
      } else {
        bodyText = await res.text();
        res.headers.forEach((val, key) => {
          targetHeaders[key] = val;
        });
      }

      setResponse({
        statusCode: targetStatusCode,
        statusText: targetStatusText,
        durationMs,
        headers: targetHeaders,
        body: bodyText,
        timing,
      });

      let parsedBodyForHistory: unknown = bodyText;
      try {
        parsedBodyForHistory = JSON.parse(bodyText);
      } catch {
        parsedBodyForHistory = bodyText;
      }

      const executedItem: DependencyRequest = {
        id: activeRequestId || 'req-last',
        name: activeRequestDetails?.name || request.url || 'Última Requisição',
        method: request.method,
        url: request.url,
        response: {
          statusCode: targetStatusCode,
          headers: targetHeaders,
          body: parsedBodyForHistory as any,
        },
      };

      setRequestHistory((prev) => [
        executedItem,
        ...prev.filter((r) => r.id !== (activeRequestId || 'req-last')),
      ]);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      setResponse({
        statusCode: 0,
        statusText: 'Network Error',
        errorMessage: err.message || 'Failed to dispatch request',
        durationMs,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderSidebarContent = (className?: string) => (
    <CollectionTree
      className={className}
      tree={filteredTree}
      selectedId={activeItem?.id || selectedCollectionId}
      activeItem={activeItem}
      isLoading={isTreeLoading}
      syncingId={syncingCollectionId}
      filterText={filterText}
      onFilterChange={setFilterText}
      onSelectItem={handleSelectItem}
      onSyncCollection={handleQuickSync}
      onOpenCollectionSettings={handleOpenCollectionSettings}
      onReload={reloadTree}
      onCreateCollection={async (name) => {
        const wsId = await ensureWorkspaceId();
        await createCollection({ name, workspaceId: wsId });
      }}
      onUpdateCollection={async (id, name) => {
        await updateCollection(id, { name });
      }}
      onDeleteCollection={async (id) => {
        await deleteCollection(id);
      }}
      onCreateFolder={async (name, colId, parentId) => {
        const wsId = await ensureWorkspaceId();
        await createFolder({
          name,
          collectionId: colId,
          parentFolderId: parentId,
          workspaceId: wsId,
        });
      }}
      onUpdateFolder={async (id, name) => {
        await updateFolder(id, { name });
      }}
      onDeleteFolder={async (id) => {
        await deleteFolder(id);
      }}
      onCreateRequest={handleCreateRequest}
      onUpdateRequestName={handleUpdateRequestName}
      onDuplicateRequest={async (id) => {
        await duplicateRequest(id);
      }}
      onDeleteRequest={async (id) => {
        await deleteRequest(id);
      }}
      onImportOpenApi={handleImportOpenApi}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      onSelectWorkspace={handleSelectWorkspace}
      onCreateWorkspaceClick={() => setIsWorkspaceModalOpen(true)}
      isWorkspacesLoading={isWorkspacesLoading}
    />
  );

  return (
    <div
      data-hydrated={mounted}
      className="flex flex-col h-screen overflow-hidden bg-neutral-950 text-neutral-100"
    >
      <AppHeader
        title="ApiDot"
        isAgentOnline={isAgentOnline}
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen((prev) => !prev)}
        environments={environments.map((e) => e.name)}
        activeEnvironment={activeEnvironment}
        onSelectEnvironment={setActiveEnvironment}
        onOpenEnvironmentSettings={() => setIsEnvModalOpen(true)}
      />

      {/* Audit Summary Banner */}
      {auditBanner && (
        <div
          role="status"
          data-testid="audit-summary-banner"
          className="bg-emerald-950/90 border-b border-emerald-800 px-4 py-2 flex items-center justify-between text-xs text-emerald-200 shrink-0"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Sincronização de &ldquo;{auditBanner.collectionName}&rdquo;:</strong>{' '}
              {auditBanner.report.addedRequests ?? 0} requisições adicionadas,{' '}
              {auditBanner.report.updatedRequests ?? 0} atualizadas |{' '}
              {auditBanner.report.fieldsAdded ?? 0} campos adicionados,{' '}
              {auditBanner.report.fieldsRemoved ?? 0} removidos,{' '}
              {auditBanner.report.fieldsPreserved ?? 0} preservados intactos.
            </span>
          </div>
          <button
            type="button"
            aria-label="Fechar notificação de auditoria"
            onClick={() => setAuditBanner(null)}
            className="p-1 rounded text-emerald-400 hover:text-white hover:bg-emerald-900/60 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sync Error Banner / Notice */}
      {syncError && (
        <div
          role="alert"
          data-testid="sync-error-banner"
          className="bg-rose-950/90 border-b border-rose-800 px-4 py-2 flex items-center justify-between text-xs text-rose-200 shrink-0"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{syncError}</span>
          </div>
          <button
            type="button"
            aria-label="Fechar notificação de erro"
            onClick={() => setSyncError(null)}
            className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-900/60 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <EnvironmentModal
        isOpen={isEnvModalOpen}
        onClose={() => setIsEnvModalOpen(false)}
        globals={globals}
        collectionVariables={collectionVariables}
        environments={environments}
        activeEnvironment={activeEnvironment}
        onGlobalsChange={setGlobals}
        onCollectionChange={setCollectionVariables}
        onEnvironmentsChange={handleEnvironmentsChange}
        onSelectActiveEnvironment={setActiveEnvironment}
      />

      <CollectionSettingsModal
        isOpen={isCollectionSettingsOpen}
        onClose={() => setIsCollectionSettingsOpen(false)}
        collection={editingCollection}
        onSave={handleSaveCollectionSettings}
        isAgentOnline={isAgentOnline}
        onSyncSuccess={handleSyncSuccess}
      />

      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSave={handleCreateWorkspace}
      />

      <SaveRequestModal
        isOpen={isSaveModalOpen}
        onClose={() => {
          setIsSaveModalOpen(false);
          setPendingSaveData(null);
        }}
        collections={collectionOptions}
        defaultName={
          activeRequestDetails?.name ||
          (pendingSaveData?.url
            ? pendingSaveData.url.replace(/^https?:\/\//, '')
            : 'Nova Requisição')
        }
        onSave={handleSaveNewRequest}
      />

      {/* Mobile Drawer */}
      <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        {renderSidebarContent()}
      </MobileDrawer>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
        <aside className="hidden md:flex flex-col w-64 border-r border-neutral-800 bg-neutral-900/50 p-4 overflow-hidden">
          {renderSidebarContent()}
        </aside>

        {/* Main Workspace Area (Request & Response panels) */}
        <main className="flex-1 flex flex-col md:flex-row overflow-hidden bg-neutral-950">
          {/* Mobile Tab Switcher (Requisição vs Resposta) */}
          <div className="flex md:hidden border-b border-neutral-800 bg-neutral-900/90 px-3 py-1.5 gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveMobilePane('request')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeMobilePane === 'request'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Requisição
            </button>
            <button
              type="button"
              onClick={() => setActiveMobilePane('response')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                activeMobilePane === 'response'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span>Resposta</span>
              {response && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    response.statusCode >= 200 && response.statusCode < 300
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}
                >
                  {response.statusCode}
                </span>
              )}
            </button>
          </div>

          <section
            className={`flex-1 border-b md:border-b-0 md:border-r border-neutral-800 overflow-hidden flex flex-col ${
              activeMobilePane === 'request' ? 'flex' : 'hidden md:flex'
            }`}
          >
            <RequestEditor
              initialRequest={initialEditorRequest}
              currentRequestId={activeRequestId || undefined}
              requestName={activeRequestDetails?.name || undefined}
              onSaveExisting={handleSaveExisting}
              onSaveAs={handleSaveAs}
              isSaving={isSavingRequest}
              isAgentOnline={isAgentOnline}
              isLoading={isLoading}
              onSend={handleSend}
              onChange={setCurrentEditorData}
              availableRequests={requestHistory}
              availableVariables={availableVariables}
            />
          </section>

          <section
            className={`flex-1 overflow-hidden flex flex-col ${
              activeMobilePane === 'response' ? 'flex' : 'hidden md:flex'
            }`}
          >
            <ResponseViewer response={response} isLoading={isLoading} />
          </section>
        </main>
      </div>
    </div>
  );
}
