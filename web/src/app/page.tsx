'use client';

import React, { useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { CollectionsNav } from '@/components/layout/CollectionsNav';
import { RequestEditor, RequestData } from '@/components/request/RequestEditor';
import { ResponseViewer, ResponseData } from '@/components/response/ResponseViewer';

export default function Home() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAgentOnline, setIsAgentOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSend = async (request: RequestData) => {
    setIsLoading(true);
    setResponse(null);
    const startTime = Date.now();
    try {
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

      const res = await fetch('/api/requests/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: request.method,
          url: request.url,
          target: request.target,
          headers: parsedHeaders,
          bodyContent: request.body || null,
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
          <section className="flex-1 border-b md:border-b-0 md:border-r border-neutral-800 overflow-hidden flex flex-col">
            <RequestEditor
              isAgentOnline={isAgentOnline}
              isLoading={isLoading}
              onSend={handleSend}
            />
          </section>

          <section className="flex-1 overflow-hidden flex flex-col">
            <ResponseViewer response={response} isLoading={isLoading} />
          </section>
        </main>
      </div>
    </div>
  );
}
