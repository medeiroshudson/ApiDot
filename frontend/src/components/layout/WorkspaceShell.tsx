'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { CollectionTree } from '@/components/layout/CollectionTree';
import { PanelSplitter } from '@/components/layout/PanelSplitter';
import {
  RequestData,
  SaveRequestModal,
  CollectionOption,
  FolderOption,
} from '@/components/request/RequestEditor';
import { EnvironmentModal, EnvironmentGroup } from '@/components/environment/EnvironmentModal';
import {
  CollectionSettingsModal,
  SyncReport,
} from '@/components/collection/CollectionSettingsModal';
import { OpenApiImportModal } from '@/components/collection/OpenApiImportModal';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';
import { GlobalSettingsModal } from '@/components/settings/GlobalSettingsModal';
import { CurlImportModal } from '@/components/request/CurlImportModal';
import { ParsedCurlRequest } from '@/lib/curl/curlParser';
import { generateCurlCommand } from '@/lib/curl/curlGenerator';
import { interpolateVariables } from '@/lib/variables';
import {
  CollectionNodeDto,
  FolderNodeDto,
  RequestItemNodeDto,
  ExecutionTarget,
  HttpBodyType,
  importOpenApiCollection,
} from '@/lib/treeApi';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useEnvironmentStore } from '@/stores/useEnvironmentStore';
import { useRequestStore, CLEAN_SCRATCHPAD } from '@/stores/useRequestStore';
import {
  WorkspaceProvider,
  useWorkspaceContext,
} from '@/context/WorkspaceContext';
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

function countCollectionRequests(col: CollectionNodeDto): number {
  let count = Array.isArray(col.requests) ? col.requests.length : 0;
  const countFolder = (f: FolderNodeDto) => {
    if (Array.isArray(f.requests)) count += f.requests.length;
    if (Array.isArray(f.subFolders)) f.subFolders.forEach(countFolder);
  };
  if (Array.isArray(col.folders)) col.folders.forEach(countFolder);
  return count;
}

export interface WorkspaceShellProps {
  workspaceId: string;
  children: React.ReactNode;
}

function WorkspaceShellContent({
  workspaceId,
  children,
}: WorkspaceShellProps): React.JSX.Element {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Layout Store
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const adjustSidebarWidth = useLayoutStore((s) => s.adjustSidebarWidth);
  const resetSidebarWidth = useLayoutStore((s) => s.resetSidebarWidth);
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

  // Workspace Store
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const isWorkspacesLoading = useWorkspaceStore((s) => s.isLoading);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
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
  const getResolvedVariables = useEnvironmentStore((s) => s.getResolvedVariables);

  // Request Store
  const activeRequestId = useRequestStore((s) => s.activeRequestId);
  const activeRequestDetails = useRequestStore((s) => s.activeRequestDetails);
  const currentEditorData = useRequestStore((s) => s.currentEditorData);
  const pendingSaveData = useRequestStore((s) => s.pendingSaveData);
  const requestHistory = useRequestStore((s) => s.requestHistory);
  const isAgentOnline = useRequestStore((s) => s.isAgentOnline);
  const setActiveRequest = useRequestStore((s) => s.setActiveRequest);
  const setPendingSaveData = useRequestStore((s) => s.setPendingSaveData);

  // Workspace Context
  const {
    tree,
    filteredTree,
    isTreeLoading,
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
    duplicateRequest,
    deleteRequest,
    handleSelectItem,
    handleCreateRequest,
    handleUpdateRequestName,
  } = useWorkspaceContext();

  // Local Collection & Sync States
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [syncingCollectionId, setSyncingCollectionId] = useState<string | null>(null);
  const [editingCollection, setEditingCollection] = useState<CollectionNodeDto | null>(null);

  // Global Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // cURL Import / Export States
  const [isImportCurlModalOpen, setIsImportCurlModalOpen] = useState(false);
  const [importCurlTarget, setImportCurlTarget] = useState<{
    collectionId: string;
    folderId?: string | null;
    targetName?: string;
  } | null>(null);

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
    const collectionId =
      importCurlTarget?.collectionId || tree?.collections[0]?.id || selectedCollectionId;
    if (!collectionId) {
      throw new Error('Nenhuma coleção selecionada para importação');
    }

    const created = await createRequest({
      workspaceId,
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
    setActiveRequest(
      created.id,
      {
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
      },
      workspaceId
    );
    setIsImportCurlModalOpen(false);
    setImportCurlTarget(null);
    router.push(
      `/workspace/${encodeURIComponent(workspaceId)}/request/${encodeURIComponent(created.id)}`
    );
  };

  const handleCopyCurl = async (req: RequestItemNodeDto) => {
    const isEditingThis = activeRequestId === req.id;
    const activeData = isEditingThis ? currentEditorData || activeRequestDetails : null;

    let method = req.method;
    let url = req.url;
    let headers: string | Record<string, string> = req.headersJson;
    let body: string | null | undefined = req.bodyContent;
    let bodyFormat: string | undefined = activeData
      ? undefined
      : req.bodyType === 'Json'
      ? 'json'
      : req.bodyType === 'RawText'
      ? 'raw'
      : undefined;
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

  useEffect(() => {
    setMounted(true);
    fetchWorkspaces(workspaceId);
  }, [fetchWorkspaces, workspaceId]);

  const handleSelectWorkspace = useCallback(
    (id: string) => {
      setActiveWorkspaceId(id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ACTIVE_WORKSPACE, id);
      }
      router.push(`/workspace/${encodeURIComponent(id)}`);
    },
    [setActiveWorkspaceId, router]
  );

  const handleCreateWorkspace = useCallback(
    async (name: string) => {
      const created = await createWorkspace(name);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ACTIVE_WORKSPACE, created.id);
      }
      router.push(`/workspace/${encodeURIComponent(created.id)}`);
    },
    [createWorkspace, router]
  );

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
      const res = await fetch(`/api/collections/${encodeURIComponent(item.id)}/sync`, {
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
      const res = await fetch(`/api/collections/${encodeURIComponent(editingCollection.id)}/openapi`, {
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

  const handleImportOpenApi = () => {
    setModalOpen('importOpenApi', true);
  };

  const handleOpenApiImport = async (data: {
    workspaceId: string;
    name?: string;
    specUrl?: string;
    specContent?: string;
  }) => {
    const wsId = data.workspaceId || workspaceId;
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

    const created = await createRequest({
      name,
      method: dataToSave.method || 'GET',
      url: dataToSave.url || '',
      workspaceId,
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
    router.push(`/workspace/${encodeURIComponent(workspaceId)}/request/${encodeURIComponent(created.id)}`);
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
        await createCollection({ name, workspaceId });
      }}
      onUpdateCollection={async (id, name) => {
        await updateCollection(id, { name });
      }}
      onDeleteCollection={async (id) => {
        await deleteCollection(id);
      }}
      onCreateFolder={async (name, colId, parentId) => {
        await createFolder({
          name,
          collectionId: colId,
          parentFolderId: parentId,
          workspaceId,
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
      onImportCurl={handleOpenImportCurl}
      onCopyCurl={handleCopyCurl}
      workspaces={workspaces}
      activeWorkspaceId={workspaceId}
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
        onOpenSettings={() => setIsSettingsOpen(true)}
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
        workspaceId={workspaceId}
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

      <GlobalSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
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

        {children}
      </div>
    </div>
  );
}

export function WorkspaceShell({
  workspaceId,
  children,
}: WorkspaceShellProps): React.JSX.Element {
  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <WorkspaceShellContent workspaceId={workspaceId}>
        {children}
      </WorkspaceShellContent>
    </WorkspaceProvider>
  );
}
