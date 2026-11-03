'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PanelSplitter } from '@/components/layout/PanelSplitter';
import {
  RequestEditor,
  RequestData,
  ExecutionTarget,
} from '@/components/request/RequestEditor';
import { ResponseViewer, ResponseData } from '@/components/response/ResponseViewer';
import { AutocompleteVariable } from '@/components/request/RequestAutocomplete';
import { DependencyRequest, interpolateVariables } from '@/lib/variables';
import { generateCurlCommand } from '@/lib/curl/curlGenerator';
import { WorkspaceTreeDto } from '@/lib/treeApi';
import { isDesktop, getSidecarInfo } from '@/lib/desktop/runtime';
import { executeViaDesktopSidecar } from '@/lib/desktop/desktopExecutor';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useRequestStore, CLEAN_SCRATCHPAD, getScratchpadKey } from '@/stores/useRequestStore';
import { useEnvironmentStore } from '@/stores/useEnvironmentStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useWorkspaceContext, findRequestInTree } from '@/context/WorkspaceContext';
import { useTranslation } from '@/hooks/useTranslation';

export interface WorkspaceEditorPaneProps {
  workspaceId: string;
  requestId?: string | null;
}

function resolveEffectiveTarget(
  target: ExecutionTarget | undefined,
  tree: WorkspaceTreeDto | null,
  requestId: string | null
): ExecutionTarget {
  if (target && target !== 'Inherit') {
    return target;
  }
  if (requestId && tree?.collections) {
    for (const col of tree.collections) {
      if (col.requests?.some((r) => r.id === requestId)) {
        if (col.defaultTarget && col.defaultTarget !== 'Inherit') {
          return col.defaultTarget;
        }
        break;
      }
      const findInFolders = (folders: typeof col.folders): ExecutionTarget | null => {
        for (const f of folders) {
          if (f.requests?.some((r) => r.id === requestId)) {
            if (f.defaultTarget && f.defaultTarget !== 'Inherit') return f.defaultTarget;
            if (col.defaultTarget && col.defaultTarget !== 'Inherit') return col.defaultTarget;
            return null;
          }
          if (f.subFolders) {
            const found = findInFolders(f.subFolders);
            if (found) return found;
          }
        }
        return null;
      };
      const foundInFolder = findInFolders(col.folders);
      if (foundInFolder) return foundInFolder;
    }
  }
  const globalTarget = useDeviceStore.getState().globalDefaultTarget;
  if (globalTarget && globalTarget !== 'Inherit') {
    return globalTarget;
  }
  if (useDeviceStore.getState().activeDeviceId) {
    return 'Agent';
  }
  return 'Server';
}

export function WorkspaceEditorPane({
  workspaceId,
  requestId = null,
}: WorkspaceEditorPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });
  const [executedCurl, setExecutedCurl] = useState<string | null>(null);

  // Layout Store
  const requestResponseRatio = useLayoutStore((s) => s.requestResponseRatio);
  const adjustRequestResponseRatio = useLayoutStore((s) => s.adjustRequestResponseRatio);
  const resetRequestResponseRatio = useLayoutStore((s) => s.resetRequestResponseRatio);
  const activeMobilePane = useLayoutStore((s) => s.activeMobilePane);
  const setActiveMobilePane = useLayoutStore((s) => s.setActiveMobilePane);
  const activeRequestTab = useLayoutStore((s) => s.activeRequestTab);
  const setActiveRequestTab = useLayoutStore((s) => s.setActiveRequestTab);

  // Environment Store
  const environments = useEnvironmentStore((s) => s.environments);
  const activeEnvironment = useEnvironmentStore((s) => s.activeEnvironment);
  const globals = useEnvironmentStore((s) => s.globals);
  const collectionVariables = useEnvironmentStore((s) => s.collectionVariables);
  const getAvailableVariables = useEnvironmentStore((s) => s.getAvailableVariables);
  const getResolvedVariables = useEnvironmentStore((s) => s.getResolvedVariables);

  // Request Store
  const activeRequestId = useRequestStore((s) => s.activeRequestId);
  const activeRequestDetails = useRequestStore((s) => s.activeRequestDetails);
  const currentEditorData = useRequestStore((s) => s.currentEditorData);
  const isSavingRequest = useRequestStore((s) => s.isSavingRequest);
  const isLoading = useRequestStore((s) => s.isLoading);
  const isDeviceAgentOnline = useDeviceStore((s) => s.isAgentOnline());
  const isRequestAgentOnline = useRequestStore((s) => s.isAgentOnline);
  const isAgentOnline = isDeviceAgentOnline || isRequestAgentOnline;
  const requestHistory = useRequestStore((s) => s.requestHistory);
  const setCurrentEditorData = useRequestStore((s) => s.setCurrentEditorData);
  const setIsLoading = useRequestStore((s) => s.setIsLoading);
  const setResponse = useRequestStore((s) => s.setResponse);
  const addRequestHistory = useRequestStore((s) => s.addRequestHistory);
  const loadResponseForRequest = useRequestStore((s) => s.loadResponseForRequest);

  // Workspace Context
  const { tree, handleSaveExisting, handleSaveAs } = useWorkspaceContext();

  const targetKey = useMemo(() => {
    return requestId ? requestId : getScratchpadKey(workspaceId);
  }, [requestId, workspaceId]);

  // Read response isolated to the current targetKey using fine-grained selector
  const response = useRequestStore((s) => s.responsesByRequestId[targetKey] ?? null);

  useEffect(() => {
    if (!useRequestStore.getState().responsesByRequestId[targetKey]) {
      loadResponseForRequest(targetKey).catch(() => {});
    }
  }, [targetKey, loadResponseForRequest]);

  useEffect(() => {
    const checkDesktop = () => {
      if (typeof window !== 'undefined') {
        setIsDesktopLayout(window.innerWidth >= 768);
      }
    };
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  const availableVariables = useMemo<AutocompleteVariable[]>(() => {
    return getAvailableVariables();
  }, [globals, collectionVariables, environments, activeEnvironment, getAvailableVariables]);

  const initialEditorRequest = useMemo<Partial<RequestData> & { id?: string }>(() => {
    if (requestId) {
      if (activeRequestDetails && activeRequestDetails.id === requestId) {
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
      const found = findRequestInTree(tree, requestId);
      if (found) {
        return {
          id: found.id,
          method: found.method || 'GET',
          url: found.url || '',
          target: found.target || 'Inherit',
          headers: found.headersJson || '',
          body: found.bodyContent || '',
          auth: { type: 'none' },
          schemaDefinition: found.schemaDefinition || undefined,
        };
      }
    }
    return useRequestStore.getState().currentEditorData || CLEAN_SCRATCHPAD;
  }, [requestId, activeRequestDetails?.id, tree]);

  const handleSend = useCallback(
    async (request: RequestData) => {
      setIsLoading(true);
      setResponse(null, requestId, workspaceId);
      setExecutedCurl(null);
      setActiveMobilePane('response');
      const startTime = Date.now();
      try {
        const activeVariables = getResolvedVariables();
        const resolvedUrl = interpolateVariables(request.url, activeVariables, requestHistory);

        let parsedHeaders: Record<string, string> = {};
        if (request.headers && typeof request.headers === 'string' && request.headers.trim()) {
          try {
            const parsed = JSON.parse(request.headers);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              Object.entries(parsed).forEach(([k, v]) => {
                if (k && v !== undefined && v !== null) {
                  parsedHeaders[k] = String(v);
                }
              });
            }
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
          interpolatedHeaders[k] = interpolateVariables(String(v ?? ''), activeVariables, requestHistory);
        });

        // Inject credentials from request.auth into headers if configured
        if (request.auth) {
          if (request.auth.type === 'bearer' && request.auth.token) {
            const interpolatedToken = interpolateVariables(
              request.auth.token,
              activeVariables,
              requestHistory
            );
            interpolatedHeaders['Authorization'] = `Bearer ${interpolatedToken}`;
          } else if (request.auth.type === 'basic') {
            const username = interpolateVariables(
              request.auth.username || '',
              activeVariables,
              requestHistory
            );
            const password = interpolateVariables(
              request.auth.password || '',
              activeVariables,
              requestHistory
            );
            const rawCreds = `${username}:${password}`;
            const credentials =
              typeof btoa !== 'undefined'
                ? btoa(unescape(encodeURIComponent(rawCreds)))
                : Buffer.from(rawCreds, 'utf-8').toString('base64');
            interpolatedHeaders['Authorization'] = `Basic ${credentials}`;
          } else if (request.auth.type === 'apikey' && request.auth.key) {
            const apiKey = interpolateVariables(
              request.auth.key,
              activeVariables,
              requestHistory
            );
            const apiVal = interpolateVariables(
              request.auth.value || '',
              activeVariables,
              requestHistory
            );
            interpolatedHeaders[apiKey] = apiVal;
          }
        }

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

        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const resolvedTarget = resolveEffectiveTarget(request.target, tree, requestId);
        const isAgentTarget = resolvedTarget === 'Agent';

        let responsePayload: ResponseData;

        if (isDesktop() && (isAgentTarget || isOffline)) {
          const sidecarInfo = await getSidecarInfo();
          const dispatch = {
            method: request.method,
            url: resolvedUrl,
            headers: interpolatedHeaders,
            bodyType: interpolatedBody
              ? (interpolatedBody.trim().startsWith('{') || interpolatedBody.trim().startsWith('[') ? 1 : 4)
              : 0,
            bodyContent: interpolatedBody,
            target: request.target,
            timeoutSeconds: 30,
            ignoreSslErrors: false,
          };

          responsePayload = await executeViaDesktopSidecar({
            port: sidecarInfo.port,
            secret: sidecarInfo.secret,
            dispatch,
          });
        } else {
          const activeDeviceId = useDeviceStore.getState().activeDeviceId;
          const executionHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (activeDeviceId && activeDeviceId.trim()) {
            executionHeaders['X-Device-Id'] = activeDeviceId.trim();
          }

          const res = await fetch('/api/requests/execute', {
            method: 'POST',
            headers: executionHeaders,
            body: JSON.stringify({
              workspaceId: workspaceId || undefined,
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

          if (
            contentType.includes('application/json') ||
            contentType.includes('application/problem+json')
          ) {
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

          responsePayload = {
            statusCode: targetStatusCode,
            statusText: targetStatusText,
            durationMs,
            headers: targetHeaders,
            body: bodyText,
            timing,
          };
        }

        setResponse(responsePayload, requestId, workspaceId);

        let parsedBodyForHistory: unknown = responsePayload.body || '';
        try {
          parsedBodyForHistory = JSON.parse(responsePayload.body || '');
        } catch {
          parsedBodyForHistory = responsePayload.body;
        }

        const effectiveName =
          activeRequestDetails?.name ||
          (requestId ? findRequestInTree(tree, requestId)?.name : null) ||
          request.url ||
          t('request.lastRequest');

        const executedItem: DependencyRequest = {
          id: requestId || 'req-last',
          name: effectiveName,
          method: request.method,
          url: request.url,
          response: {
            statusCode: responsePayload.statusCode,
            headers: (responsePayload.headers as Record<string, string>) || {},
            body: parsedBodyForHistory as any,
          },
        };

        addRequestHistory(executedItem);
      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        const msg = err instanceof Error ? err.message : 'Failed to dispatch request';
        setResponse(
          {
            statusCode: 0,
            statusText: 'Network Error',
            errorMessage: msg,
            durationMs,
          },
          requestId,
          workspaceId
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      requestId,
      workspaceId,
      setIsLoading,
      setResponse,
      setActiveMobilePane,
      getResolvedVariables,
      requestHistory,
      activeEnvironment,
      activeRequestDetails,
      tree,
      addRequestHistory,
    ]
  );

  const handleSaveExistingInternal = useCallback(
    async (reqData: RequestData) => {
      if (requestId || activeRequestId) {
        await handleSaveExisting(reqData);
      } else {
        handleSaveAs(reqData);
      }
    },
    [requestId, activeRequestId, handleSaveExisting, handleSaveAs]
  );

  const handleEditorChange = useCallback(
    (data: RequestData) => {
      if (!requestId) {
        setCurrentEditorData(data);
      }
    },
    [requestId, setCurrentEditorData]
  );

  const effectiveRequestId = requestId || activeRequestId || undefined;
  const effectiveRequestName =
    activeRequestDetails?.name ||
    (requestId ? findRequestInTree(tree, requestId)?.name : undefined);

  return (
    <main
      ref={workspaceRef}
      className="flex-1 h-full w-full flex flex-col overflow-hidden bg-neutral-950"
    >
      <RequestEditor
        initialRequest={initialEditorRequest}
        currentRequestId={effectiveRequestId}
        requestName={effectiveRequestName}
        onSaveExisting={handleSaveExistingInternal}
        onSaveAs={handleSaveAs}
        isSaving={isSavingRequest}
        isAgentOnline={isAgentOnline}
        isLoading={isLoading}
        onSend={handleSend}
        onChange={handleEditorChange}
        availableRequests={requestHistory}
        availableVariables={availableVariables}
        activeTab={activeRequestTab}
        onTabChange={setActiveRequestTab}
        isDesktop={isDesktopLayout}
        requestDetailsRatio={requestResponseRatio}
        activeMobilePane={activeMobilePane}
        onMobilePaneChange={setActiveMobilePane}
        responseStatusCode={response?.statusCode}
        splitterSlot={
          isDesktopLayout ? (
            <PanelSplitter
              id="request-response-splitter"
              ariaLabel={t('request.resizeRequestResponse')}
              valueNow={Math.round(requestResponseRatio)}
              valueMin={20}
              valueMax={80}
              onDeltaChange={(deltaPx) => {
                const w = workspaceRef.current?.clientWidth;
                if (w) adjustRequestResponseRatio((deltaPx / w) * 100);
              }}
              onReset={resetRequestResponseRatio}
            />
          ) : undefined
        }
        responseSlot={
          <div
            data-testid="response-viewer-container"
            className="h-full w-full flex flex-col min-h-0 overflow-hidden"
          >
            <ResponseViewer
              response={response}
              isLoading={isLoading}
              executedCurl={executedCurl || undefined}
            />
          </div>
        }
      />
    </main>
  );
}
