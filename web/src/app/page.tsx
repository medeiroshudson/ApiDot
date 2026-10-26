'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { CollectionsNav, NavItem } from '@/components/layout/CollectionsNav';
import { RequestEditor, RequestData } from '@/components/request/RequestEditor';
import { ResponseViewer, ResponseData } from '@/components/response/ResponseViewer';
import { EnvironmentModal, EnvironmentGroup } from '@/components/environment/EnvironmentModal';
import { VariableItem } from '@/components/environment/VariableGrid';
import { DependencyRequest, resolveVariables, interpolateVariables } from '@/lib/variables';
import { AutocompleteVariable } from '@/components/request/RequestAutocomplete';
import {
  CollectionSettingsModal,
  SyncReport,
} from '@/components/collection/CollectionSettingsModal';
import { CheckCircle2, X } from 'lucide-react';

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

const DEFAULT_COLLECTIONS: NavItem[] = [
  {
    id: 'default-collection',
    name: 'Coleção Padrão',
    icon: 'collection',
    openApiSpecUrl: '',
    openApiSpecContent: '',
  },
  { id: 'auth-folder', name: 'Autenticação', icon: 'folder', isNested: true },
];

export default function Home() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAgentOnline, setIsAgentOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [activeMobilePane, setActiveMobilePane] = useState<'request' | 'response'>('request');
  const [mounted, setMounted] = useState(false);

  // Environments and Variables State
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [environments, setEnvironments] = useState<EnvironmentGroup[]>(DEFAULT_ENVIRONMENTS);
  const [activeEnvironment, setActiveEnvironment] = useState<string | null>(null);
  const [globals, setGlobals] = useState<VariableItem[]>([]);
  const [collectionVariables, setCollectionVariables] = useState<VariableItem[]>([]);
  const [requestHistory, setRequestHistory] = useState<DependencyRequest[]>(DEFAULT_REQUESTS);

  // Collections & Sync State
  const [collections, setCollections] = useState<NavItem[]>(DEFAULT_COLLECTIONS);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('default-collection');
  const [syncingCollectionId, setSyncingCollectionId] = useState<string | null>(null);
  const [isCollectionSettingsOpen, setIsCollectionSettingsOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<NavItem | null>(null);
  const [auditBanner, setAuditBanner] = useState<{
    collectionName: string;
    report: SyncReport;
  } | null>(null);

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

  const handleEnvironmentsChange = (updated: EnvironmentGroup[]) => {
    setEnvironments(updated);
    if (activeEnvironment && !updated.some((e) => e.name === activeEnvironment)) {
      setActiveEnvironment(null);
    }
  };

  const handleOpenCollectionSettings = (item: NavItem) => {
    setEditingCollection(item);
    setIsCollectionSettingsOpen(true);
  };

  const handleQuickSync = async (item: NavItem) => {
    setSyncingCollectionId(item.id);
    try {
      const res = await fetch(`/api/collections/${item.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specUrl: item.openApiSpecUrl || undefined,
          specContent: item.openApiSpecContent || undefined,
        }),
      });

      if (res.ok) {
        const report: SyncReport = await res.json();
        setAuditBanner({
          collectionName: item.name,
          report,
        });
      } else {
        // If not yet configured or failed, open settings modal so user can configure
        setEditingCollection(item);
        setIsCollectionSettingsOpen(true);
      }
    } catch {
      setEditingCollection(item);
      setIsCollectionSettingsOpen(true);
    } finally {
      setSyncingCollectionId(null);
    }
  };

  const handleSyncSuccess = (report: SyncReport) => {
    setAuditBanner({
      collectionName: editingCollection?.name || 'Coleção',
      report,
    });
  };

  const handleSaveCollectionSpec = async (data: { specUrl?: string; specContent?: string }) => {
    if (!editingCollection) return;
    try {
      await fetch(`/api/collections/${editingCollection.id}/openapi`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openApiSpecUrl: data.specUrl,
          openApiSpecContent: data.specContent,
        }),
      });
    } catch {
      // Ignore if local preview
    }

    setCollections((prev) =>
      prev.map((c) =>
        c.id === editingCollection.id
          ? { ...c, openApiSpecUrl: data.specUrl, openApiSpecContent: data.specContent }
          : c
      )
    );
  };

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

      if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
        const json = await res.json();
        if (json.timing) {
          timing = json.timing;
        }
        if (json.body) {
          bodyText = typeof json.body === 'string' ? json.body : JSON.stringify(json.body);
        } else {
          bodyText = JSON.stringify(json, null, 2);
        }
      } else {
        bodyText = await res.text();
      }

      const resHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      setResponse({
        statusCode: res.status,
        statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
        durationMs,
        headers: resHeaders,
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
        id: 'req-last',
        name: request.url || 'Última Requisição',
        method: request.method,
        url: request.url,
        response: {
          statusCode: res.status,
          headers: resHeaders,
          body: parsedBodyForHistory as any,
        },
      };

      setRequestHistory((prev) => [
        executedItem,
        ...prev.filter((r) => r.id !== 'req-last'),
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
              {auditBanner.report.addedRequests} requisições adicionadas,{' '}
              {auditBanner.report.updatedRequests} atualizadas |{' '}
              {auditBanner.report.fieldsAdded} campos adicionados,{' '}
              {auditBanner.report.fieldsRemoved} removidos,{' '}
              {auditBanner.report.fieldsPreserved} preservados intactos.
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
        onSave={handleSaveCollectionSpec}
        onSyncSuccess={handleSyncSuccess}
      />

      {/* Mobile Drawer */}
      <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <CollectionsNav
          items={collections}
          selectedId={selectedCollectionId}
          syncingId={syncingCollectionId}
          onSelect={(item) => setSelectedCollectionId(item.id)}
          onSync={handleQuickSync}
          onOpenSettings={handleOpenCollectionSettings}
        />
      </MobileDrawer>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
        <aside className="hidden md:flex flex-col w-64 border-r border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Coleções & Pastas
            </span>
          </div>
          <CollectionsNav
            className="flex-1 overflow-y-auto"
            items={collections}
            selectedId={selectedCollectionId}
            syncingId={syncingCollectionId}
            onSelect={(item) => setSelectedCollectionId(item.id)}
            onSync={handleQuickSync}
            onOpenSettings={handleOpenCollectionSettings}
          />
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
              isAgentOnline={isAgentOnline}
              isLoading={isLoading}
              onSend={handleSend}
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
