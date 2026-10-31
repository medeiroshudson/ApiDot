'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, Loader2, X, Sparkles, Save, ChevronDown, Server, Cpu, Shield, FileCode } from 'lucide-react';
import { ExecutionTarget } from './TargetSelector';
import {
  RequestAutocomplete,
  AutocompleteVariable,
  CursorCoords,
  AutocompleteNavigationHandle,
  METHOD_COLORS,
} from './RequestAutocomplete';
import {
  DependencyLinkerModal,
  DependencyRequest,
} from './DependencyLinkerModal';
import { CodeEditor } from '../common/CodeEditor';
import { Input } from '../common/Input';
import { ParamsTab } from './ParamsTab';
import { SpecificationTab, extractSchemaProperties } from './SpecificationTab';
import { useTranslation } from '@/hooks/useTranslation';

export { SaveRequestModal } from './SaveRequestModal';
export type { SaveRequestModalProps, CollectionOption, FolderOption } from './SaveRequestModal';

export interface AuthConfig {
  type: 'inherit' | 'none' | 'bearer' | 'basic' | 'apikey';
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
}

export type BodyFormat = 'none' | 'json' | 'text';

export interface RequestData {
  method: string;
  url: string;
  target: ExecutionTarget;
  headers: string;
  body: string;
  auth: AuthConfig;
  pathParams?: Record<string, string>;
  schemaDefinition?: string;
}

export interface RequestEditorProps {
  initialRequest?: Partial<RequestData> & { id?: string };
  initialTab?: TabType;
  currentRequestId?: string;
  requestName?: string;
  onSaveExisting?: (request: RequestData) => Promise<void> | void;
  onSaveAs?: (request: RequestData) => Promise<void> | void;
  isSaving?: boolean;
  isAgentOnline?: boolean;
  isLoading?: boolean;
  onSend?: (request: RequestData) => void;
  onChange?: (request: RequestData) => void;
  availableRequests?: DependencyRequest[];
  availableVariables?: AutocompleteVariable[];
}

export type TabType = 'specification' | 'params' | 'headers' | 'body' | 'auth';

export const TABS: { id: TabType; label: string }[] = [
  { id: 'specification', label: 'Especificação' },
  { id: 'params', label: 'Parâmetros' },
  { id: 'headers', label: 'Cabeçalhos' },
  { id: 'body', label: 'Corpo' },
  { id: 'auth', label: 'Autenticação' },
];

export function resolvePathParams(
  url: string,
  pathParams?: Record<string, string>
): string {
  if (!url || !pathParams) return url;
  return url.replace(/:([a-zA-Z0-9_]+)/g, (match, paramName) => {
    if (
      paramName in pathParams &&
      pathParams[paramName] !== undefined &&
      pathParams[paramName] !== ''
    ) {
      return pathParams[paramName];
    }
    return match;
  });
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export function insertTokenAtCursor(
  element: HTMLInputElement | HTMLTextAreaElement | null,
  currentValue: string,
  token: string,
  onChange: (value: string) => void
): void {
  if (element && typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const nextVal = currentValue.slice(0, start) + token + currentValue.slice(end);
    onChange(nextVal);
    setTimeout(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  } else {
    onChange(currentValue ? `${currentValue}${token}` : token);
  }
}

export function RequestEditor({
  initialRequest,
  initialTab,
  currentRequestId,
  requestName,
  onSaveExisting,
  onSaveAs,
  isSaving = false,
  isAgentOnline = false,
  isLoading = false,
  onSend,
  onChange,
  availableRequests = [],
  availableVariables = [],
}: RequestEditorProps) {
  const { t } = useTranslation();
  const [method, setMethod] = useState(initialRequest?.method || 'GET');
  const [url, setUrl] = useState(initialRequest?.url || '');
  const [target, setTarget] = useState<ExecutionTarget>(initialRequest?.target || 'Inherit');
  const [headers, setHeaders] = useState(initialRequest?.headers || '');
  const [body, setBody] = useState(initialRequest?.body || '');
  const [pathParams, setPathParams] = useState<Record<string, string>>(
    initialRequest?.pathParams || {}
  );
  const [schemaDefinition, setSchemaDefinition] = useState<string>(
    initialRequest?.schemaDefinition || ''
  );

  const schemaProperties = useMemo(() => {
    return extractSchemaProperties(schemaDefinition);
  }, [schemaDefinition]);
  const [bodyFormat, setBodyFormat] = useState<BodyFormat>(() => {
    if (!initialRequest?.body) return 'none';
    if (initialRequest.body.trim().startsWith('{') || initialRequest.body.trim().startsWith('[')) return 'json';
    return 'text';
  });
  const [auth, setAuth] = useState<AuthConfig>(
    initialRequest?.auth || { type: 'none' }
  );
  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? 'params');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isLinkerOpen, setIsLinkerOpen] = useState(false);
  const [activeArea, setActiveArea] = useState<'url' | 'headers' | 'body'>('headers');

  // Split Send button state
  const [isSendMenuOpen, setIsSendMenuOpen] = useState(false);
  const sendMenuRef = useRef<HTMLDivElement>(null);

  // Navigation ref for ArrowDown/ArrowUp/Enter in CodeMirror autocomplete
  const autocompleteNavRef = useRef<AutocompleteNavigationHandle | null>(null);

  // Cursor coords for floating autocomplete
  const [cursorCoords, setCursorCoords] = useState<CursorCoords | null>(null);
  const [cursorPos, setCursorPos] = useState<number>(0);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const urlInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const isDirty = useMemo(() => {
    const initialMethod = initialRequest?.method ?? 'GET';
    const initialUrl = initialRequest?.url ?? '';
    const initialHeaders = initialRequest?.headers ?? '';
    const initialBody = initialRequest?.body ?? '';
    const initialTarget = initialRequest?.target ?? 'Inherit';
    const initialAuth = initialRequest?.auth ?? { type: 'none' };
    const initialPathParams = initialRequest?.pathParams ?? {};
    const initialSchemaDefinition = initialRequest?.schemaDefinition ?? '';

    return (
      method !== initialMethod ||
      url !== initialUrl ||
      headers !== initialHeaders ||
      body !== initialBody ||
      target !== initialTarget ||
      schemaDefinition !== initialSchemaDefinition ||
      JSON.stringify(auth) !== JSON.stringify(initialAuth) ||
      JSON.stringify(pathParams) !== JSON.stringify(initialPathParams)
    );
  }, [method, url, headers, body, target, auth, pathParams, schemaDefinition, initialRequest]);

  // Primary execution target based on priority rule:
  const defaultExecutionTarget: ExecutionTarget = useMemo(() => {
    if (target && target !== 'Inherit') return target;
    return isAgentOnline ? 'Agent' : 'Server';
  }, [target, isAgentOnline]);

  const alternateTarget: ExecutionTarget =
    defaultExecutionTarget === 'Agent' ? 'Server' : 'Agent';

  const handleSave = useCallback(() => {
    if (isLoading || isSaving) return;
    const requestData: RequestData = {
      method,
      url: url.trim(),
      target,
      headers,
      body: bodyFormat === 'none' ? '' : body,
      auth,
      pathParams,
      schemaDefinition,
    };
    const effectiveId = currentRequestId ?? (initialRequest as { id?: string } | undefined)?.id;
    if (effectiveId) {
      onSaveExisting?.(requestData);
    } else {
      onSaveAs?.(requestData);
    }
  }, [isLoading, isSaving, method, url, target, headers, body, bodyFormat, auth, pathParams, schemaDefinition, currentRequestId, initialRequest, onSaveExisting, onSaveAs]);

  // Global Ctrl+S / Cmd+S shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // Close split send menu on outside click or Escape
  useEffect(() => {
    if (!isSendMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) {
        setIsSendMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSendMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isSendMenuOpen]);

  // Sync initialRequest props
  useEffect(() => {
    if (initialRequest) {
      if (initialRequest.method !== undefined) setMethod(initialRequest.method);
      if (initialRequest.url !== undefined) setUrl(initialRequest.url);
      if (initialRequest.target !== undefined) setTarget(initialRequest.target);
      if (initialRequest.headers !== undefined) setHeaders(initialRequest.headers);
      if (initialRequest.body !== undefined) {
        setBody(initialRequest.body);
        if (!initialRequest.body) {
          setBodyFormat('none');
        } else if (initialRequest.body.trim().startsWith('{') || initialRequest.body.trim().startsWith('[')) {
          setBodyFormat('json');
        } else {
          setBodyFormat('text');
        }
      }
      if (initialRequest.auth !== undefined) setAuth(initialRequest.auth);
      if (initialRequest.pathParams !== undefined) setPathParams(initialRequest.pathParams);
      if (initialRequest.schemaDefinition !== undefined) setSchemaDefinition(initialRequest.schemaDefinition || '');
    }
  }, [initialRequest]);

  const updateRequest = useCallback(
    (updater: (prev: RequestData) => RequestData) => {
      const updated = updater({
        method,
        url,
        target,
        headers,
        body: bodyFormat === 'none' ? '' : body,
        auth,
        pathParams,
        schemaDefinition,
      });
      onChange?.(updated);
    },
    [method, url, target, headers, body, bodyFormat, auth, pathParams, schemaDefinition, onChange]
  );

  const handlePathParamsChange = (newPathParams: Record<string, string>) => {
    setPathParams(newPathParams);
    updateRequest((prev) => ({ ...prev, pathParams: newPathParams }));
  };

  const handleSchemaDefinitionChange = useCallback(
    (newSchemaJson: string) => {
      setSchemaDefinition(newSchemaJson);
      updateRequest((prev) => ({ ...prev, schemaDefinition: newSchemaJson }));
    },
    [updateRequest]
  );

  const handleGenerateBodyExample = useCallback(
    (exampleJson: string) => {
      setBody(exampleJson);
      setBodyFormat('json');
      setActiveTab('body');
      setActiveArea('body');
      updateRequest((prev) => ({
        ...prev,
        body: exampleJson,
      }));
    },
    [updateRequest]
  );

  const handleMethodChange = (newMethod: string) => {
    setMethod(newMethod);
    updateRequest((prev) => ({ ...prev, method: newMethod }));
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    if (urlError && newUrl.trim()) {
      setUrlError(null);
    }
    updateRequest((prev) => ({ ...prev, url: newUrl }));
  };

  const handleHeadersChange = (newHeaders: string) => {
    setHeaders(newHeaders);
    updateRequest((prev) => ({ ...prev, headers: newHeaders }));
  };

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
    updateRequest((prev) => ({ ...prev, body: newBody }));
  };

  const [formatNotice, setFormatNotice] = useState<{ target: 'body' | 'headers'; message: string; isError?: boolean } | null>(null);

  const handleFormatJson = () => {
    if (!body.trim()) return;
    try {
      const parsed = JSON.parse(body);
      const formatted = JSON.stringify(parsed, null, 2);
      handleBodyChange(formatted);
      setFormatNotice({ target: 'body', message: t('request.formatSuccess') });
      setTimeout(() => setFormatNotice(null), 2500);
    } catch {
      setFormatNotice({ target: 'body', message: t('request.formatError'), isError: true });
      setTimeout(() => setFormatNotice(null), 3000);
    }
  };

  const handleFormatHeaders = () => {
    if (!headers.trim()) return;
    try {
      const parsed = JSON.parse(headers);
      const formatted = JSON.stringify(parsed, null, 2);
      handleHeadersChange(formatted);
      setFormatNotice({ target: 'headers', message: t('request.formatSuccess') });
      setTimeout(() => setFormatNotice(null), 2500);
    } catch {
      setFormatNotice({ target: 'headers', message: t('request.formatError'), isError: true });
      setTimeout(() => setFormatNotice(null), 3000);
    }
  };

  const handleAuthTypeChange = (type: AuthConfig['type']) => {
    const newAuth: AuthConfig = { ...auth, type };
    setAuth(newAuth);
    updateRequest((prev) => ({ ...prev, auth: newAuth }));
  };

  const handleAuthFieldChange = (field: keyof Omit<AuthConfig, 'type'>, value: string) => {
    const newAuth: AuthConfig = { ...auth, [field]: value };
    setAuth(newAuth);
    updateRequest((prev) => ({ ...prev, auth: newAuth }));
  };

  const handleSend = (sendTarget?: ExecutionTarget) => {
    if (isLoading) return;
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setUrlError(t('request.urlRequired'));
      return;
    }
    setUrlError(null);
    setIsSendMenuOpen(false);

    const effectiveTarget = sendTarget ?? defaultExecutionTarget;
    const resolvedUrl = resolvePathParams(trimmedUrl, pathParams);
    const requestData: RequestData = {
      method,
      url: resolvedUrl,
      target: effectiveTarget,
      headers,
      body: bodyFormat === 'none' ? '' : body,
      auth,
      pathParams,
      schemaDefinition,
    };
    onSend?.(requestData);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let targetIndex = -1;
    if (e.key === 'ArrowRight') {
      targetIndex = (index + 1) % TABS.length;
    } else if (e.key === 'ArrowLeft') {
      targetIndex = (index - 1 + TABS.length) % TABS.length;
    } else if (e.key === 'Home') {
      targetIndex = 0;
    } else if (e.key === 'End') {
      targetIndex = TABS.length - 1;
    }

    if (targetIndex !== -1) {
      e.preventDefault();
      const nextTab = TABS[targetIndex];
      setActiveTab(nextTab.id);
      tabRefs.current[targetIndex]?.focus();
    }
  };

  const tabLabels: Record<TabType, string> = {
    specification: t('request.tabSpec'),
    params: t('request.tabParams'),
    headers: t('request.tabHeaders'),
    body: t('request.tabBody'),
    auth: t('request.tabAuth'),
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Title Bar: Request Name, Dirty State, Save Action */}
      <div className="h-9 px-3 sm:px-4 border-b border-neutral-800 bg-neutral-900/60 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
            {t('request.requestTitlePrefix')}
          </span>
          <span
            data-testid="request-title"
            className="text-xs font-medium text-neutral-200 truncate"
            title={requestName || t('request.newRequest')}
          >
            {requestName || t('request.newRequest')}
          </span>
          {isDirty && (
            <span
              data-testid="dirty-indicator"
              className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
              title={t('request.unsavedChanges')}
              aria-label={t('request.unsavedChanges')}
            />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label={t('request.saveRequest')}
            title={t('request.saveTooltip')}
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="h-7 px-2.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors border border-neutral-700/60 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" aria-hidden="true" />
            ) : (
              <Save className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
            )}
            <span>{isSaving ? t('request.saving') : t('request.save')}</span>
            {isDirty && (
              <span
                data-testid="save-button-dirty-dot"
                className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </div>

      {/* Top Bar Compact (h-9): Method, URL Input, Split Send Button */}
      <div className="p-2.5 sm:p-3 border-b border-neutral-800 bg-neutral-900/40 flex flex-col gap-1.5 shrink-0">
        <div className="flex flex-col sm:flex-row gap-2 items-start w-full">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <select
              aria-label={t('request.httpMethodAria')}
              value={method}
              disabled={isLoading}
              onChange={(e) => handleMethodChange(e.target.value)}
              className={`h-9 px-2.5 font-bold text-xs rounded-md border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0 ${
                METHOD_COLORS[method] || 'text-blue-400 bg-neutral-800 border-neutral-700'
              }`}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m} className="bg-neutral-900 text-neutral-200 font-semibold">
                  {m}
                </option>
              ))}
            </select>

            <div className="flex-1 min-w-0 relative">
              <Input
                ref={urlInputRef}
                autoGrow
                aria-label={t('request.urlAria')}
                placeholder={t('request.urlDefaultPlaceholder')}
                value={url}
                disabled={isLoading}
                error={!!urlError}
                onFocus={() => {
                  setActiveArea('url');
                  setCursorCoords(null);
                }}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                aria-invalid={!!urlError}
                aria-describedby={urlError ? 'url-error' : undefined}
                className="w-full"
              />
              <RequestAutocomplete
                inputRef={urlInputRef}
                value={url}
                onChange={handleUrlChange}
                availableRequests={availableRequests}
                availableVariables={availableVariables}
              />
              {url && !isLoading && (
                <button
                  type="button"
                  aria-label={t('request.clearUrl')}
                  onClick={() => handleUrlChange('')}
                  className="absolute right-2 top-2.5 text-neutral-400 hover:text-neutral-200 p-1 rounded hover:bg-neutral-800 transition-colors focus:outline-none"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Split Send Button: [ Enviar | ▾ ] */}
          <div ref={sendMenuRef} className="relative inline-flex rounded-md shadow-sm h-9 shrink-0 items-start">
            <button
              type="button"
              aria-label={t('request.sendRequest')}
              onClick={() => handleSend(defaultExecutionTarget)}
              disabled={isLoading}
              title={
                defaultExecutionTarget === 'Agent'
                  ? t('request.sendViaAgent')
                  : t('request.sendViaServer')
              }
              className="h-9 px-3.5 rounded-l-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : defaultExecutionTarget === 'Agent' ? (
                <Cpu className="w-3.5 h-3.5 text-blue-200" aria-hidden="true" />
              ) : (
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{isLoading ? t('request.sending') : t('request.send')}</span>
            </button>

            <button
              type="button"
              aria-label={t('request.sendOptions')}
              aria-haspopup="true"
              aria-expanded={isSendMenuOpen}
              onClick={() => setIsSendMenuOpen((prev) => !prev)}
              disabled={isLoading}
              className="h-9 px-2 rounded-r-md bg-blue-700 hover:bg-blue-600 border-l border-blue-500/40 text-white flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
            >
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            {/* Dropdown for Alternative Target */}
            {isSendMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-56 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl shadow-black/80 py-1 z-50 text-xs animate-in fade-in duration-75"
              >
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-neutral-400 border-b border-neutral-800/80">
                  {t('request.alternativeTarget')}
                </div>

                {alternateTarget === 'Server' ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSend('Server')}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 text-neutral-200 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <Server className="w-3.5 h-3.5 text-neutral-400" />
                    <div className="flex flex-col">
                      <span className="font-medium">{t('request.executeOnServer')}</span>
                      <span className="text-[10px] text-neutral-500">
                        {t('request.executeOnServerDesc')}
                      </span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!isAgentOnline}
                    onClick={() => handleSend('Agent')}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                      isAgentOnline
                        ? 'text-neutral-200 hover:text-white hover:bg-neutral-800 cursor-pointer'
                        : 'text-neutral-500 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <Cpu className={`w-3.5 h-3.5 ${isAgentOnline ? 'text-emerald-400' : 'text-neutral-500'}`} />
                    <div className="flex flex-col">
                      <span className="font-medium">{t('request.executeOnAgent')}</span>
                      <span className="text-[10px] text-neutral-500">
                        {isAgentOnline ? t('request.executeOnAgentDescOnline') : t('request.executeOnAgentDescOffline')}
                      </span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {urlError && (
          <span id="url-error" role="alert" className="text-xs text-rose-400 px-1 font-medium">
            {urlError}
          </span>
        )}
      </div>

      {/* Tabs navigation: Headers, Body, Auth */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/20 px-3 sm:px-4 shrink-0">
        <div
          role="tablist"
          aria-label={t('request.tabsAria')}
          className="flex"
        >
          {TABS.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'headers' || tab.id === 'body') {
                    setActiveArea(tab.id);
                  }
                }}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
                className={`px-3 sm:px-4 py-2 text-xs font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tabLabels[tab.id]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels - filling 100% available vertical height */}
      <div className="flex-1 p-3 sm:p-4 flex flex-col min-h-0 overflow-hidden">
        {/* Specification Panel */}
        <div
          role="tabpanel"
          id="panel-specification"
          aria-labelledby="tab-specification"
          hidden={activeTab !== 'specification'}
          className={activeTab === 'specification' ? 'flex-1 h-full flex flex-col min-h-0' : 'hidden'}
        >
          <div data-testid="specification-panel" className="flex-1 h-full flex flex-col min-h-0">
            <SpecificationTab
              schemaDefinition={schemaDefinition}
              onChange={handleSchemaDefinitionChange}
              onUpdateSchema={handleSchemaDefinitionChange}
              onGenerateBodyExample={handleGenerateBodyExample}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Params Panel */}
        <div
          role="tabpanel"
          id="panel-params"
          aria-labelledby="tab-params"
          hidden={activeTab !== 'params'}
          className={activeTab === 'params' ? 'flex-1 h-full flex flex-col min-h-0' : 'hidden'}
        >
          <ParamsTab
            url={url}
            onUrlChange={handleUrlChange}
            pathParams={pathParams}
            onPathParamsChange={handlePathParamsChange}
            disabled={isLoading}
          />
        </div>

        {/* Headers Panel */}
        <div
          role="tabpanel"
          id="panel-headers"
          aria-labelledby="tab-headers"
          hidden={activeTab !== 'headers'}
          className={activeTab === 'headers' ? 'flex-1 h-full flex flex-col min-h-0' : 'hidden'}
        >
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-xs text-neutral-400 font-medium">
              {t('request.httpHeaders')}
            </span>
            <div className="flex items-center gap-2">
              {formatNotice?.target === 'headers' && (
                <span
                  role="status"
                  data-testid="format-notice"
                  className={`text-xs ${
                    formatNotice.isError ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {formatNotice.message}
                </span>
              )}
              <button
                type="button"
                aria-label={t('request.formatHeadersAria')}
                onClick={handleFormatHeaders}
                disabled={isLoading || !headers.trim()}
                className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors border border-neutral-700/60 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                <span>{t('request.formatJson')}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 relative h-full flex flex-col">
            <CodeEditor
              value={headers}
              onChange={handleHeadersChange}
              onCursorChange={(coords, pos) => {
                setActiveArea('headers');
                setCursorCoords(coords);
                setCursorPos(pos);
              }}
              onSpecialKeyDown={(key) => autocompleteNavRef.current?.onKeyDown(key) ?? false}
              language="json"
              placeholder={`{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer token"\n}`}
              ariaLabel={t('request.headersAria')}
              testId="headers-code-editor"
              minHeight="100%"
              disabled={isLoading}
              className="flex-1 h-full"
            />

            {activeArea === 'headers' && (
              <RequestAutocomplete
                navigationRef={autocompleteNavRef}
                value={headers}
                cursorCoords={cursorCoords}
                cursorPos={cursorPos}
                onChange={(val) => handleHeadersChange(val)}
                availableRequests={availableRequests}
                availableVariables={availableVariables}
              />
            )}
          </div>
        </div>

        {/* Body Panel */}
        <div
          role="tabpanel"
          id="panel-body"
          aria-labelledby="tab-body"
          hidden={activeTab !== 'body'}
          className={activeTab === 'body' ? 'flex-1 h-full flex flex-col min-h-0' : 'hidden'}
        >
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-400 font-medium">
                {t('request.requestBody')}
              </span>

              {/* Body Type Selector (None / JSON / Text) */}
              <div
                role="radiogroup"
                aria-label={t('request.bodyTypeAria')}
                className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded p-0.5 text-xs"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={bodyFormat === 'none'}
                  onClick={() => setBodyFormat('none')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    bodyFormat === 'none'
                      ? 'bg-neutral-800 text-white font-medium shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {t('request.bodyNone')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={bodyFormat === 'text'}
                  onClick={() => setBodyFormat('text')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    bodyFormat === 'text'
                      ? 'bg-neutral-800 text-white font-medium shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {t('request.bodyText')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={bodyFormat === 'json'}
                  onClick={() => setBodyFormat('json')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    bodyFormat === 'json'
                      ? 'bg-neutral-800 text-white font-medium shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {t('request.bodyJson')}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {formatNotice?.target === 'body' && (
                <span
                  role="status"
                  data-testid="format-notice"
                  className={`text-xs ${
                    formatNotice.isError ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {formatNotice.message}
                </span>
              )}
              {bodyFormat === 'json' && (
                <button
                  type="button"
                  aria-label={t('request.formatJson')}
                  onClick={handleFormatJson}
                  disabled={isLoading || !body.trim()}
                  className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors border border-neutral-700/60 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                  <span>{t('request.formatJson')}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 relative h-full flex flex-col">
            {bodyFormat === 'none' ? (
              <div
                data-testid="body-empty-placeholder"
                className="flex-1 flex flex-col items-center justify-center p-8 text-center border border-dashed border-neutral-800/80 rounded-lg bg-neutral-900/20 my-auto text-neutral-500"
              >
                <FileCode className="w-8 h-8 mb-2 opacity-40 text-neutral-600" />
                <p className="text-xs font-medium text-neutral-300">
                  {t('request.emptyBodyTitle')}
                </p>
                <p className="text-[11px] text-neutral-500 mt-1 max-w-xs">
                  {t('request.emptyBodyDesc')}
                </p>
              </div>
            ) : (
              <CodeEditor
                value={body}
                onChange={handleBodyChange}
                onCursorChange={(coords, pos) => {
                  setActiveArea('body');
                  setCursorCoords(coords);
                  setCursorPos(pos);
                }}
                onSpecialKeyDown={(key) => autocompleteNavRef.current?.onKeyDown(key) ?? false}
                language={bodyFormat === 'json' ? 'json' : 'text'}
                placeholder={bodyFormat === 'json' ? '{\n  "key": "value"\n}' : t('request.bodyPlaceholderText')}
                ariaLabel={t('request.bodyAria')}
                testId="body-code-editor"
                minHeight="100%"
                disabled={isLoading}
                className="flex-1 h-full"
              />
            )}

            {activeArea === 'body' && bodyFormat !== 'none' && (
              <RequestAutocomplete
                navigationRef={autocompleteNavRef}
                value={body}
                cursorCoords={cursorCoords}
                cursorPos={cursorPos}
                onChange={(val) => handleBodyChange(val)}
                availableRequests={availableRequests}
                availableVariables={availableVariables}
                schemaProperties={schemaProperties}
              />
            )}
          </div>
        </div>

        {/* Auth Panel */}
        <div
          role="tabpanel"
          id="panel-auth"
          aria-labelledby="tab-auth"
          hidden={activeTab !== 'auth'}
          className={activeTab === 'auth' ? 'space-y-4' : 'hidden'}
        >
          <div className="space-y-1">
            <label htmlFor="auth-type-select" className="text-xs text-neutral-400 font-medium">
              {t('request.authType')}
            </label>
            <select
              id="auth-type-select"
              aria-label={t('request.authTypeAria')}
              value={auth.type}
              disabled={isLoading}
              onChange={(e) => handleAuthTypeChange(e.target.value as AuthConfig['type'])}
              className="bg-neutral-900 border border-neutral-800 text-xs rounded-md px-3 py-1.5 text-neutral-200 outline-none focus:ring-1 focus:ring-blue-500 block w-full sm:w-64"
            >
              <option value="inherit">{t('request.authInherit')}</option>
              <option value="none">{t('request.authNone')}</option>
              <option value="bearer">{t('request.authBearer')}</option>
              <option value="basic">{t('request.authBasic')}</option>
              <option value="apikey">{t('request.authApiKey')}</option>
            </select>
          </div>

          {auth.type === 'inherit' && (
            <div className="p-3.5 rounded-lg bg-neutral-900/40 border border-neutral-800 text-neutral-400 text-xs flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{t('request.authInheritNotice')}</span>
            </div>
          )}

          {auth.type === 'bearer' && (
            <div className="space-y-1">
              <label htmlFor="bearer-token-input" className="text-xs text-neutral-400 font-medium">
                {t('request.tokenLabel')}
              </label>
              <input
                id="bearer-token-input"
                type="text"
                aria-label={t('request.tokenAria')}
                placeholder={t('request.tokenPlaceholder')}
                value={auth.token || ''}
                disabled={isLoading}
                onChange={(e) => handleAuthFieldChange('token', e.target.value)}
                className="w-full sm:w-96 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-200 font-mono outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {auth.type === 'basic' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="basic-username-input" className="text-xs text-neutral-400 font-medium">
                  {t('request.usernameLabel')}
                </label>
                <input
                  id="basic-username-input"
                  type="text"
                  aria-label={t('request.usernameAria')}
                  placeholder={t('request.usernamePlaceholder')}
                  value={auth.username || ''}
                  disabled={isLoading}
                  onChange={(e) => handleAuthFieldChange('username', e.target.value)}
                  className="w-full sm:w-80 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="basic-password-input" className="text-xs text-neutral-400 font-medium">
                  {t('request.passwordLabel')}
                </label>
                <input
                  id="basic-password-input"
                  type="password"
                  aria-label={t('request.passwordAria')}
                  placeholder={t('request.passwordPlaceholder')}
                  value={auth.password || ''}
                  disabled={isLoading}
                  onChange={(e) => handleAuthFieldChange('password', e.target.value)}
                  className="w-full sm:w-80 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {auth.type === 'apikey' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="apikey-key-input" className="text-xs text-neutral-400 font-medium">
                  {t('request.apiKeyLabel')}
                </label>
                <input
                  id="apikey-key-input"
                  type="text"
                  aria-label={t('request.apiKeyAria')}
                  placeholder={t('request.apiKeyPlaceholder')}
                  value={auth.key || ''}
                  disabled={isLoading}
                  onChange={(e) => handleAuthFieldChange('key', e.target.value)}
                  className="w-full sm:w-80 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-200 font-mono outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="apikey-value-input" className="text-xs text-neutral-400 font-medium">
                  {t('request.apiValueLabel')}
                </label>
                <input
                  id="apikey-value-input"
                  type="text"
                  aria-label={t('request.apiValueAria')}
                  placeholder={t('request.apiValuePlaceholder')}
                  value={auth.value || ''}
                  disabled={isLoading}
                  onChange={(e) => handleAuthFieldChange('value', e.target.value)}
                  className="w-full sm:w-80 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-200 font-mono outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dependency Linker Modal */}
      <DependencyLinkerModal
        isOpen={isLinkerOpen}
        onClose={() => setIsLinkerOpen(false)}
        availableRequests={availableRequests}
        onInsertToken={(token) => {
          if (activeArea === 'headers') {
            handleHeadersChange(headers ? `${headers}\n${token}` : token);
          } else if (activeArea === 'body') {
            handleBodyChange(body ? `${body}\n${token}` : token);
          } else {
            handleUrlChange(url ? `${url}${token}` : token);
          }
          setIsLinkerOpen(false);
        }}
      />
    </div>
  );
}
