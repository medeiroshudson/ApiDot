'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { CollectionTree } from '@/components/layout/CollectionTree';
import { PanelSplitter } from '@/components/layout/PanelSplitter';
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
import { DependencyRequest, interpolateVariables } from '@/lib/variables';
import { AutocompleteVariable } from '@/components/request/RequestAutocomplete';
import {
  CollectionSettingsModal,
  SyncReport,
} from '@/components/collection/CollectionSettingsModal';
import { OpenApiImportModal } from '@/components/collection/OpenApiImportModal';
import { CurlImportModal } from '@/components/request/CurlImportModal';
import { ParsedCurlRequest } from '@/lib/curl/curlParser';
import { generateCurlCommand } from '@/lib/curl/curlGenerator';
import {
  useCollectionTree,
  ActiveTreeItem,
} from '@/hooks/useCollectionTree';
import {
  WorkspaceTreeDto,
  CollectionNodeDto,
  FolderNodeDto,
  RequestItemNodeDto,
  ExecutionTarget,
  HttpBodyType,
  importOpenApiCollection,
} from '@/lib/treeApi';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useEnvironmentStore } from '@/stores/useEnvironmentStore';
import { useRequestStore, CLEAN_SCRATCHPAD } from '@/stores/useRequestStore';
import { CheckCircle2, X, AlertCircle } from 'lucide-react';

const STORAGE_KEY_ACTIVE_WORKSPACE = 'apidot_active_workspace_id';

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

function countCollectionRequests(col: CollectionNodeDto): number {
  let count = Array.isArray(col.requests) ? col.requests.length : 0;
  const countFolder = (f: FolderNodeDto) => {
    if (Array.isArray(f.requests)) count += f.requests.length;
    if (Array.isArray(f.subFolders)) f.subFolders.forEach(countFolder);
  };
  if (Array.isArray(col.folders)) col.folders.forEach(countFolder);
  return count;
}

export default function Home() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  // Layout Store
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const requestResponseRatio = useLayoutStore((s) => s.requestResponseRatio);
  const adjustSidebarWidth = useLayoutStore((s) => s.adjustSidebarWidth);
  const adjustRequestResponseRatio = useLayoutStore((s) => s.adjustRequestResponseRatio);
  const resetSidebarWidth = useLayoutStore((s) => s.resetSidebarWidth);
  const resetRequestResponseRatio = useLayoutStore((s) => s.resetRequestResponseRatio);
  const isWorkspaceModalOpen = useLayoutStore((s) => s.isWorkspaceModalOpen);
  const isSaveModalOpen = useLayoutStore((s) => s.isSaveModalOpen);
  const isEnvModalOpen = useLayoutStore((s) => s.isEnvModalOpen);
  const isCollectionSettingsOpen = useLayoutStore((s) => s.isCollectionSettingsOpen);
  const isImportOpenApiModalOpen = useLayoutStore((s) => s.isImportOpenApiModalOpen);
  const isDrawerOpen = useLayoutStore((s) => s.isDrawerOpen);
  const setModalOpen = useLayoutStore((s) => s.setModalOpen);
  const auditBanner = useLayoutStore((s) => s.auditBanner);
  const setAuditBanner = useLayoutStore((s) => s.setAuditBanner);
  const syncError = useLayoutStore((s) => s.syncError);
  const setSyncError = useLayoutStore((s) => s.setSyncError);
  const activeMobilePane = useLayoutStore((s) => s.activeMobilePane);
  const setActiveMobilePane = useLayoutStore((s) => s.setActiveMobilePane);

  // Workspace Store
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isWorkspacesLoading = useWorkspaceStore((s) => s.isLoading);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const ensureWorkspaceId = useWorkspaceStore((s) => s.ensureWorkspaceId);
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);

  // Environment Store
  const environments = useEnvironmentStore((s) => s.environments);
  const activeEnvironment = useEnvironmentStore((s) => s.activeEnvironment);
  const globals = useEnvironmentStore((s) => s.globals);
  const collectionVariables = useEnvironmentStore((s) => s.collectionVariables);
  const setEnvironments = useEnvironmentStore((s) => s.setEnvironments);
  const setActiveEnvironment = useEnvironmentStore((s) => s.setActiveEnvironment);
  const setGlobals = useEnvironmentStore((s) => s.setGlobals);
  const setCollectionVariables = useEnvironmentStore((s) => s.setCollectionVariables);
  const getAvailableVariables = useEnvironmentStore((s) => s.getAvailableVariables);
  const getResolvedVariables = useEnvironmentStore((s) => s.getResolvedVariables);

  // Request Store
  const activeRequestId = useRequestStore((s) => s.activeRequestId);
  const activeRequestDetails = useRequestStore((s) => s.activeRequestDetails);
  const currentEditorData = useRequestStore((s) => s.currentEditorData);
  const pendingSaveData = useRequestStore((s) => s.pendingSaveData);
  const isSavingRequest = useRequestStore((s) => s.isSavingRequest);
  const isLoading = useRequestStore((s) => s.isLoading);
  const isAgentOnline = useRequestStore((s) => s.isAgentOnline);
  const response = useRequestStore((s) => s.response);
  const requestHistory = useRequestStore((s) => s.requestHistory);
  const setActiveRequest = useRequestStore((s) => s.setActiveRequest);
  const setActiveRequestName = useRequestStore((s) => s.setActiveRequestName);
  const setCurrentEditorData = useRequestStore((s) => s.setCurrentEditorData);
  const setPendingSaveData = useRequestStore((s) => s.setPendingSaveData);
  const setIsSavingRequest = useRequestStore((s) => s.setIsSavingRequest);
  const setIsLoading = useRequestStore((s) => s.setIsLoading);
  const setResponse = useRequestStore((s) => s.setResponse);
  const addRequestHistory = useRequestStore((s) => s.addRequestHistory);
  const resetScratchpad = useRequestStore((s) => s.resetScratchpad);

  // Local Collection & Sync States
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [syncingCollectionId, setSyncingCollectionId] = useState<string | null>(null);
  const [editingCollection, setEditingCollection] = useState<CollectionNodeDto | null>(null);

  useEffect(() => {
    setMounted(true);
    const checkDesktop = () => {
      if (typeof window !== 'undefined') {
        setIsDesktop(window.innerWidth >= 768);
      }
    };
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleSelectWorkspace = useCallback(
    (id: string) => {
      setActiveWorkspaceId(id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ACTIVE_WORKSPACE, id);
      }
    },
    [setActiveWorkspaceId]
  );

  const handleCreateWorkspace = useCallback(
    async (name: string) => {
      const created = await createWorkspace(name);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ACTIVE_WORKSPACE, created.id);
      }
    },
    [createWorkspace]
  );

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

  const [isImportCurlModalOpen, setIsImportCurlModalOpen] = useState(false);
  const [importCurlTarget, setImportCurlTarget] = useState<{
    collectionId: string;
    folderId?: string | null;
    targetName?: string;
  } | null>(null);
  const [executedCurl, setExecutedCurl] = useState<string | null>(null);
  const availableVariables = useMemo<AutocompleteVariable[]>(() => {
    return getAvailableVariables();
  }, [globals, collectionVariables, environments, activeEnvironment, getAvailableVariables]);

  // Sync active request details with activeItem state changes
  useEffect(() => {
    if (!activeItem || activeItem.type !== 'request') {
      setActiveRequest(null, null);
    }
  }, [activeItem, setActiveRequest]);

  const handleEnvironmentsChange = (updated: EnvironmentGroup[]) => {
    setEnvironments(updated);
  };

  const handleOpenCollectionSettings = (item: CollectionNodeDto) => {
    setEditingCollection(item);
    setModalOpen('collectionSettings', true);
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
      } else if (item.type === 'collection') {
        setSelectedCollectionId(item.id);
      }
    },
    [setActiveItem, tree, setActiveRequest]
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
  };

  const handleSaveAs = (reqData: RequestData) => {
    setPendingSaveData(reqData);
    setModalOpen('save', true);
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
      schemaDefinition: dataToSave.schemaDefinition || null,
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
      auth: dataToSave.auth || { type: 'none' },
      collectionId: created.collectionId,
      folderId: created.folderId,
      schemaDefinition: created.schemaDefinition,
    });
    setModalOpen('save', false);
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
      schemaDefinition: (existing as any)?.schemaDefinition || null,
    });
    if (activeRequestId === id) {
      setActiveRequestName(name);
    }
    return updated;
  };

  const handleImportOpenApi = () => {
    setModalOpen('importOpenApi', true);
  };

  const handleOpenApiImport = async (data: {
    workspaceId: string;
    name?: string;
    specUrl?: string;
    specContent?: string;
  }) => {
    const wsId = data.workspaceId || (await ensureWorkspaceId());
    const created = await importOpenApiCollection({
      ...data,
      workspaceId: wsId,
    });

    await reloadTree();

    if (created) {
      setSelectedCollectionId(created.id);
      setActiveItem({
        type: 'collection',
        id: created.id,
        data: created,
      });

      const totalRequests = countCollectionRequests(created);
      setAuditBanner({
        collectionName: created.name,
        report: {
          addedRequests: totalRequests,
          updatedRequests: 0,
          fieldsAdded: 0,
          fieldsRemoved: 0,
          fieldsPreserved: 0,
        },
      });
      setSyncError(null);
    }

    return created;
  };

  const handleOpenImportCurl = useCallback(
    (collectionId: string, folderId?: string | null) => {
      let targetName: string | undefined = undefined;
      if (tree?.collections) {
        const col = tree.collections.find((c) => c.id === collectionId);
        if (col) {
          if (folderId) {
            const match = flattenFolders(col.folders || []).find((f) => f.id === folderId);
            targetName = match ? match.name : col.name;
          } else {
            targetName = col.name;
          }
        }
      }
      setImportCurlTarget({ collectionId, folderId, targetName });
      setIsImportCurlModalOpen(true);
    },
    [tree]
  );

  const handleImportCurl = async (parsed: ParsedCurlRequest, requestName: string) => {
    const wsId = await ensureWorkspaceId();
    const collectionId =
      importCurlTarget?.collectionId || tree?.collections[0]?.id || selectedCollectionId;
    if (!collectionId) {
      throw new Error('Nenhuma coleção selecionada para importação');
    }

    const created = await createRequest({
      workspaceId: wsId,
      name: requestName || parsed.name || 'Nova Requisição',
      method: parsed.method || 'GET',
      url: parsed.url || '',
      target: 'Inherit',
      headersJson: parsed.headersJson || '{}',
      bodyType: parsed.bodyType || 'None',
      bodyContent: parsed.bodyContent || null,
      collectionId,
      folderId: importCurlTarget?.folderId || null,
    });

    await reloadTree();

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
      auth: parsed.auth || { type: 'none' },
      collectionId: created.collectionId,
      folderId: created.folderId,
      schemaDefinition: created.schemaDefinition,
    });
    setIsImportCurlModalOpen(false);
    setImportCurlTarget(null);
  };

  const handleCopyCurl = async (req: RequestItemNodeDto) => {
    const isEditingThis = activeRequestId === req.id;
    const activeData = isEditingThis ? (currentEditorData || activeRequestDetails) : null;

    let method = req.method;
    let url = req.url;
    let headers: string | Record<string, string> = req.headersJson;
    let body: string | null = req.bodyContent;
    let bodyFormat: string | undefined = activeData
      ? undefined
      : req.bodyType === 'Json' ? 'json' : req.bodyType === 'RawText' ? 'raw' : undefined;
    let auth: RequestData['auth'] = { type: 'none' };
    let pathParams: Record<string, string> | undefined = undefined;

    if (activeData) {
      method = activeData.method;
      url = activeData.url;
      headers = activeData.headers;
      body = activeData.body;
      auth = activeData.auth;
      pathParams = (activeData as RequestData).pathParams;
    }

    const activeVariables = getResolvedVariables();

    const hasVariables = Boolean(activeVariables && Object.keys(activeVariables).length > 0);
    const hasRequests = Boolean(requestHistory && requestHistory.length > 0);

    const safeUrl = (url || '').trim();

    const curl = generateCurlCommand(
      {
        method,
        url: safeUrl,
        headers,
        body,
        bodyFormat,
        auth,
        pathParams,
      },
      {
        variables: activeVariables,
        requestHistory,
        resolveVariables: hasVariables || hasRequests,
      }
    );

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(curl);
      } catch {
        // Gracefully handle clipboard errors without crashing UI
      }
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
        schemaDefinition: activeRequestDetails.schemaDefinition || undefined,
      };
    }
    return CLEAN_SCRATCHPAD;
  }, [activeRequestDetails]);

  const handleSend = async (request: RequestData) => {
    setIsLoading(true);
    setResponse(null);
    setExecutedCurl(null);
    setActiveMobilePane('response');
    const startTime = Date.now();
    try {
      const activeVariables = getResolvedVariables();

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

      const executedCurlCmd = generateCurlCommand({
        method: request.method,
        url: resolvedUrl,
        headers: interpolatedHeaders,
        body: interpolatedBody,
        auth: request.auth,
      });
      setExecutedCurl(executedCurlCmd);

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

      addRequestHistory(executedItem);
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
        if (activeRequestId === id) {
          resetScratchpad();
        }
        await deleteRequest(id);
      }}
      onImportOpenApi={handleImportOpenApi}
      onImportCurl={handleOpenImportCurl}
      onCopyCurl={handleCopyCurl}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      onSelectWorkspace={handleSelectWorkspace}
      onCreateWorkspaceClick={() => setModalOpen('workspace', true)}
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
        onToggleDrawer={() => setModalOpen('drawer', !isDrawerOpen)}
        environments={environments.map((e) => e.name)}
        activeEnvironment={activeEnvironment}
        onSelectEnvironment={setActiveEnvironment}
        onOpenEnvironmentSettings={() => setModalOpen('env', true)}
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
        onClose={() => setModalOpen('env', false)}
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
        onClose={() => setModalOpen('collectionSettings', false)}
        collection={editingCollection}
        onSave={handleSaveCollectionSettings}
        isAgentOnline={isAgentOnline}
        onSyncSuccess={handleSyncSuccess}
      />

      <OpenApiImportModal
        isOpen={isImportOpenApiModalOpen}
        onClose={() => setModalOpen('importOpenApi', false)}
        workspaceId={activeWorkspaceId || ''}
        onImport={handleOpenApiImport}
      />

      <CurlImportModal
        isOpen={isImportCurlModalOpen}
        onClose={() => {
          setIsImportCurlModalOpen(false);
          setImportCurlTarget(null);
        }}
        targetName={importCurlTarget?.targetName}
        onImport={handleImportCurl}
      />

      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setModalOpen('workspace', false)}
        onSave={handleCreateWorkspace}
      />

      <SaveRequestModal
        isOpen={isSaveModalOpen}
        onClose={() => {
          setModalOpen('save', false);
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
      <MobileDrawer isOpen={isDrawerOpen} onClose={() => setModalOpen('drawer', false)}>
        {renderSidebarContent()}
      </MobileDrawer>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
        <aside
          style={{ width: `${sidebarWidth}px` }}
          className="hidden md:flex flex-col border-r border-neutral-800 bg-neutral-900/50 p-4 overflow-hidden shrink-0"
        >
          {renderSidebarContent()}
        </aside>

        {/* Divisor Sidebar <-> Workspace */}
        <PanelSplitter
          id="sidebar-splitter"
          ariaLabel="Redimensionar barra lateral"
          valueNow={sidebarWidth}
          valueMin={180}
          valueMax={480}
          onDeltaChange={adjustSidebarWidth}
          onReset={resetSidebarWidth}
          className="hidden md:flex"
        />

        {/* Main Workspace Area (Request & Response panels) */}
        <main
          ref={workspaceRef}
          className="flex-1 flex flex-col md:flex-row overflow-hidden bg-neutral-950"
        >
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
            style={{ flex: isDesktop ? `0 0 ${requestResponseRatio}%` : undefined }}
            className={`border-b md:border-b-0 md:border-r border-neutral-800 overflow-hidden flex flex-col ${
              activeMobilePane === 'request' ? 'flex flex-1' : 'hidden md:flex'
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

          {/* Divisor Request <-> Response (apenas desktop) */}
          <div className="hidden md:flex items-stretch">
            <PanelSplitter
              id="request-response-splitter"
              ariaLabel="Redimensionar painéis de requisição e resposta"
              valueNow={Math.round(requestResponseRatio)}
              valueMin={20}
              valueMax={80}
              onDeltaChange={(deltaPx) => {
                const w = workspaceRef.current?.clientWidth;
                if (w) adjustRequestResponseRatio((deltaPx / w) * 100);
              }}
              onReset={resetRequestResponseRatio}
            />
          </div>

          <section
            className={`flex-1 overflow-hidden flex flex-col ${
              activeMobilePane === 'response' ? 'flex' : 'hidden md:flex'
            }`}
          >
            <ResponseViewer
              response={response}
              isLoading={isLoading}
              executedCurl={executedCurl || undefined}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
