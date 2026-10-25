'use client';

import React, { useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { CollectionsNav } from '@/components/layout/CollectionsNav';
import { RequestEditor, RequestData } from '@/components/request/RequestEditor';
import { ResponseViewer, ResponseData } from '@/components/response/ResponseViewer';
import { EnvironmentModal, EnvironmentGroup } from '@/components/environment/EnvironmentModal';
import { VariableItem } from '@/components/environment/VariableGrid';
import { resolveVariables, interpolateVariables } from '@/lib/variables';

const DEFAULT_ENVIRONMENTS: EnvironmentGroup[] = [
  { name: 'Development', variables: [] },
  { name: 'Staging', variables: [] },
  { name: 'Production', variables: [] },
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEnvironmentsChange = (updated: EnvironmentGroup[]) => {
    setEnvironments(updated);
    if (activeEnvironment && !updated.some((e) => e.name === activeEnvironment)) {
      setActiveEnvironment(null);
    }
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

      const resolvedUrl = interpolateVariables(request.url, activeVariables);

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
        interpolatedHeaders[k] = interpolateVariables(v, activeVariables);
      });

      const interpolatedBody = request.body
        ? interpolateVariables(request.body, activeVariables)
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

      {/* Mobile Drawer */}
      <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <CollectionsNav />
      </MobileDrawer>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
        <aside className="hidden md:flex flex-col w-64 border-r border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Coleções & Pastas
            </span>
          </div>
          <CollectionsNav className="flex-1 overflow-y-auto" />
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
