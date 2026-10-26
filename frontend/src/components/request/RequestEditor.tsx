import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, Loader2, X, Sparkles, Link2, Save } from 'lucide-react';
import { TargetSelector, ExecutionTarget } from './TargetSelector';
import {
  RequestAutocomplete,
  AutocompleteVariable,
  HTTP_METHOD_BADGES,
  METHOD_COLORS,
} from './RequestAutocomplete';
import {
  DependencyLinkerModal,
  DependencyRequest,
} from './DependencyLinkerModal';

export { SaveRequestModal } from './SaveRequestModal';
export type { SaveRequestModalProps, CollectionOption, FolderOption } from './SaveRequestModal';

export interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'apikey';
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
}

export interface RequestData {
  method: string;
  url: string;
  target: ExecutionTarget;
  headers: string;
  body: string;
  auth: AuthConfig;
}

export interface RequestEditorProps {
  initialRequest?: Partial<RequestData> & { id?: string };
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

export const TABS = [
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
] as const;

export type TabType = (typeof TABS)[number]['id'];

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
  const [method, setMethod] = useState(initialRequest?.method || 'GET');
  const [url, setUrl] = useState(initialRequest?.url || '');
  const [target, setTarget] = useState<ExecutionTarget>(initialRequest?.target || 'Inherit');
  const [headers, setHeaders] = useState(initialRequest?.headers || '');
  const [body, setBody] = useState(initialRequest?.body || '');
  const [auth, setAuth] = useState<AuthConfig>(
    initialRequest?.auth || { type: 'none' }
  );
  const [activeTab, setActiveTab] = useState<TabType>('headers');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isLinkerOpen, setIsLinkerOpen] = useState(false);
  const [activeArea, setActiveArea] = useState<'url' | 'headers' | 'body'>('headers');

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const headersRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = useMemo(() => {
    const initialMethod = initialRequest?.method ?? 'GET';
    const initialUrl = initialRequest?.url ?? '';
    const initialHeaders = initialRequest?.headers ?? '';
    const initialBody = initialRequest?.body ?? '';
    const initialTarget = initialRequest?.target ?? 'Inherit';
    const initialAuth = initialRequest?.auth ?? { type: 'none' };

    return (
      method !== initialMethod ||
      url !== initialUrl ||
      headers !== initialHeaders ||
      body !== initialBody ||
      target !== initialTarget ||
      JSON.stringify(auth) !== JSON.stringify(initialAuth)
    );
  }, [method, url, headers, body, target, auth, initialRequest]);

  const handleSave = useCallback(() => {
    if (isLoading || isSaving) return;
    const requestData: RequestData = {
      method,
      url: url.trim(),
      target,
      headers,
      body,
      auth,
    };
    const effectiveId = currentRequestId ?? (initialRequest as { id?: string } | undefined)?.id;
    if (effectiveId) {
      onSaveExisting?.(requestData);
    } else {
      onSaveAs?.(requestData);
    }
  }, [
    isLoading,
    isSaving,
    method,
    url,
    target,
    headers,
    body,
    auth,
    currentRequestId,
    initialRequest,
    onSaveExisting,
    onSaveAs,
  ]);

  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setMethod(initialRequest?.method ?? 'GET');
    setUrl(initialRequest?.url ?? '');
    setTarget(initialRequest?.target ?? 'Inherit');
    setHeaders(initialRequest?.headers ?? '');
    setBody(initialRequest?.body ?? '');
    setAuth(initialRequest?.auth ?? { type: 'none' });
    setUrlError(null);
  }, [initialRequest]);

  const updateRequest = (updater: (prev: RequestData) => RequestData) => {
    const current: RequestData = { method, url, target, headers, body, auth };
    const updated = updater(current);
    onChange?.(updated);
  };

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

  const handleTargetChange = (newTarget: ExecutionTarget) => {
    setTarget(newTarget);
    updateRequest((prev) => ({ ...prev, target: newTarget }));
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

  const handleFormatBody = () => {
    if (!body.trim()) return;
    try {
      const parsed = JSON.parse(body);
      const formatted = JSON.stringify(parsed, null, 2);
      handleBodyChange(formatted);
      setFormatNotice({ target: 'body', message: 'Formatado com sucesso!' });
      setTimeout(() => setFormatNotice(null), 2500);
    } catch {
      setFormatNotice({ target: 'body', message: 'JSON inválido para formatação', isError: true });
      setTimeout(() => setFormatNotice(null), 3000);
    }
  };

  const handleFormatHeaders = () => {
    if (!headers.trim()) return;
    try {
      const parsed = JSON.parse(headers);
      const formatted = JSON.stringify(parsed, null, 2);
      handleHeadersChange(formatted);
      setFormatNotice({ target: 'headers', message: 'Formatado com sucesso!' });
      setTimeout(() => setFormatNotice(null), 2500);
    } catch {
      setFormatNotice({ target: 'headers', message: 'JSON inválido para formatação', isError: true });
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

  const handleSend = () => {
    if (isLoading) return;
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setUrlError('A URL é obrigatória');
      return;
    }
    setUrlError(null);
    const requestData: RequestData = {
      method,
      url: trimmedUrl,
      target,
      headers,
      body,
      auth,
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
      if (nextTab.id === 'headers' || nextTab.id === 'body') {
        setActiveArea(nextTab.id);
      }
      tabRefs.current[targetIndex]?.focus();
    }
  };

  const handleInsertToken = (token: string) => {
    if (activeArea === 'body') {
      insertTokenAtCursor(bodyRef.current, body, token, handleBodyChange);
    } else if (activeArea === 'headers') {
      insertTokenAtCursor(headersRef.current, headers, token, handleHeadersChange);
    } else {
      insertTokenAtCursor(urlInputRef.current, url, token, handleUrlChange);
    }
    setIsLinkerOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100">
      {/* Title Bar / Action Bar: Request Title, Dirty State, Save Button */}
      <div className="px-3 sm:px-4 py-2 border-b border-neutral-800 bg-neutral-900/60 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
            Requisição:
          </span>
          <span
            data-testid="request-title"
            className="text-sm font-medium text-neutral-200 truncate"
            title={requestName || 'Nova Requisição'}
          >
            {requestName || 'Nova Requisição'}
          </span>
          {isDirty && (
            <span
              data-testid="dirty-indicator"
              className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
              title="Alterações não salvas"
              aria-label="Alterações não salvas"
            />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label="Salvar requisição"
            title="Salvar (Ctrl+S / Cmd+S)"
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="h-8 px-3 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors border border-neutral-700/60 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" aria-hidden="true" />
            ) : (
              <Save className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
            )}
            <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
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

      {/* Top Bar: Method, Expanded URL, Send Button */}
      <div className="p-3 sm:p-4 border-b border-neutral-800 bg-neutral-900/40 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center w-full">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <select
              aria-label="Método HTTP"
              value={method}
              disabled={isLoading}
              onChange={(e) => handleMethodChange(e.target.value)}
              className={`h-11 sm:h-12 px-3 sm:px-4 font-bold text-xs sm:text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0 ${
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
              <input
                ref={urlInputRef}
                type="text"
                aria-label="URL da requisição"
                placeholder="https://api.exemplo.com/v1/recurso"
                value={url}
                disabled={isLoading}
                onFocus={() => setActiveArea('url')}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.defaultPrevented) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                aria-invalid={!!urlError}
                aria-describedby={urlError ? 'url-error' : undefined}
                className={`h-11 sm:h-12 w-full pl-3.5 pr-9 sm:px-4 text-sm sm:text-base bg-neutral-900/90 border rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 font-mono transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  urlError
                    ? 'border-rose-500 focus:ring-rose-500 shadow-sm shadow-rose-950/40'
                    : 'border-neutral-700/80 hover:border-neutral-600 focus:border-blue-500 focus:ring-blue-500/30'
                }`}
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
                  aria-label="Limpar URL"
                  onClick={() => handleUrlChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 p-1 rounded-md hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            aria-label="Enviar requisição"
            onClick={handleSend}
            disabled={isLoading}
            className="h-11 sm:h-12 px-5 sm:px-6 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-950/40 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full sm:w-auto shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{isLoading ? 'Enviando...' : 'Enviar'}</span>
          </button>
        </div>

        {urlError && (
          <span id="url-error" role="alert" className="text-xs text-rose-400 px-1 font-medium">
            {urlError}
          </span>
        )}
      </div>

      {/* Tabs navigation & Target Selector */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/20 px-3 sm:px-4">
        <div
          role="tablist"
          aria-label="Abas de configuração da requisição"
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
                className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 py-1.5 shrink-0">
          <button
            type="button"
            aria-label="Vincular"
            title="Vincular resposta de dependência"
            onClick={() => setIsLinkerOpen(true)}
            disabled={isLoading}
            className="h-8 px-2.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors border border-neutral-700/60 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <Link2 className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            <span>Vincular</span>
          </button>

          <span className="hidden sm:inline text-xs text-neutral-400 font-medium">Alvo:</span>
          <TargetSelector
            value={target}
            isAgentOnline={isAgentOnline}
            disabled={isLoading}
            onChange={handleTargetChange}
          />
        </div>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
        <div
          role="tabpanel"
          id="panel-headers"
          aria-labelledby="tab-headers"
          hidden={activeTab !== 'headers'}
          className={activeTab === 'headers' ? 'h-full flex flex-col' : 'hidden'}
        >
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="headers-textarea" className="text-xs text-neutral-400 font-medium">
              Cabeçalhos HTTP (JSON ou formato Chave: Valor):
            </label>
            <div className="flex items-center gap-2">
              {formatNotice?.target === 'headers' && (
                <span
                  role="status"
                  className={`text-xs font-medium animate-fade-in ${
                    formatNotice.isError ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {formatNotice.message}
                </span>
              )}
              <button
                type="button"
                aria-label="Formatar cabeçalhos"
                onClick={handleFormatHeaders}
                disabled={isLoading || !headers.trim()}
                className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors border border-neutral-700/60 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                <span>Formatar</span>
              </button>
            </div>
          </div>
          <div className="relative flex-1 flex flex-col">
            <textarea
              ref={headersRef}
              id="headers-textarea"
              aria-label="Cabeçalhos HTTP"
              value={headers}
              disabled={isLoading}
              onFocus={() => setActiveArea('headers')}
              onChange={(e) => handleHeadersChange(e.target.value)}
              placeholder={`{
  "Content-Type": "application/json",
  "Authorization": "Bearer token"
}`}
              className="w-full flex-1 min-h-[160px] p-3 text-xs sm:text-sm font-mono bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <RequestAutocomplete
              inputRef={headersRef}
              value={headers}
              onChange={handleHeadersChange}
              availableRequests={availableRequests}
              availableVariables={availableVariables}
            />
          </div>
        </div>

        <div
          role="tabpanel"
          id="panel-body"
          aria-labelledby="tab-body"
          hidden={activeTab !== 'body'}
          className={activeTab === 'body' ? 'h-full flex flex-col' : 'hidden'}
        >
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="body-textarea" className="text-xs text-neutral-400 font-medium">
              Corpo da requisição (Payload):
            </label>
            <div className="flex items-center gap-2">
              {formatNotice?.target === 'body' && (
                <span
                  role="status"
                  className={`text-xs font-medium animate-fade-in ${
                    formatNotice.isError ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {formatNotice.message}
                </span>
              )}
              <button
                type="button"
                aria-label="Formatar corpo"
                onClick={handleFormatBody}
                disabled={isLoading || !body.trim()}
                className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors border border-neutral-700/60 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                <span>Formatar</span>
              </button>
            </div>
          </div>
          <div className="relative flex-1 flex flex-col">
            <textarea
              ref={bodyRef}
              id="body-textarea"
              aria-label="Corpo da requisição"
              value={body}
              disabled={isLoading}
              onFocus={() => setActiveArea('body')}
              onChange={(e) => handleBodyChange(e.target.value)}
              placeholder={`{
  "name": "Exemplo",
  "active": true
}`}
              className="w-full flex-1 min-h-[160px] p-3 text-xs sm:text-sm font-mono bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <RequestAutocomplete
              inputRef={bodyRef}
              value={body}
              onChange={handleBodyChange}
              availableRequests={availableRequests}
              availableVariables={availableVariables}
            />
          </div>
        </div>

        <div
          role="tabpanel"
          id="panel-auth"
          aria-labelledby="tab-auth"
          hidden={activeTab !== 'auth'}
          className={activeTab === 'auth' ? 'flex flex-col gap-4 max-w-lg' : 'hidden'}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-type-select" className="text-xs text-neutral-400">
              Tipo de autenticação:
            </label>
            <select
              id="auth-type-select"
              aria-label="Tipo de autenticação"
              value={auth.type}
              disabled={isLoading}
              onChange={(e) => handleAuthTypeChange(e.target.value as AuthConfig['type'])}
              className="h-9 px-3 text-xs rounded-md bg-neutral-900 border border-neutral-800 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="none">Nenhuma (No Auth)</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="apikey">API Key</option>
            </select>
          </div>

          {auth.type === 'bearer' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bearer-token-input" className="text-xs text-neutral-400">
                Token:
              </label>
              <input
                id="bearer-token-input"
                type="text"
                aria-label="Token Bearer"
                placeholder="eyJhbGciOi..."
                value={auth.token || ''}
                disabled={isLoading}
                onChange={(e) => handleAuthFieldChange('token', e.target.value)}
                className="h-9 px-3 text-xs font-mono bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {auth.type === 'basic' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="basic-user-input" className="text-xs text-neutral-400">
                  Usuário:
                </label>
                <input
                  id="basic-user-input"
                  type="text"
                  aria-label="Usuário"
                  placeholder="admin"
                  value={auth.username || ''}
                  disabled={isLoading}
                  onChange={(e) => handleAuthFieldChange('username', e.target.value)}
                  className="h-9 px-3 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="basic-pass-input" className="text-xs text-neutral-400">
                  Senha:
                </label>
                <input
                  id="basic-pass-input"
                  type="password"
                  aria-label="Senha"
                  placeholder="••••••••"
                  value={auth.password || ''}
                  disabled={isLoading}
                  onChange={(e) => handleAuthFieldChange('password', e.target.value)}
                  className="h-9 px-3 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          )}

          {auth.type === 'apikey' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="apikey-name-input" className="text-xs text-neutral-400">
                  Chave:
                </label>
                <input
                  id="apikey-name-input"
                  type="text"
                  aria-label="Chave da API"
                  placeholder="X-API-Key"
                  value={auth.key || ''}
                  disabled={isLoading}
                  onChange={(e) => handleAuthFieldChange('key', e.target.value)}
                  className="h-9 px-3 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="apikey-val-input" className="text-xs text-neutral-400">
                  Valor:
                </label>
                <input
                  id="apikey-val-input"
                  type="text"
                  aria-label="Valor da chave"
                  placeholder="api_key_value"
                  value={auth.value || ''}
                  disabled={isLoading}
                  onChange={(e) => handleAuthFieldChange('value', e.target.value)}
                  className="h-9 px-3 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <DependencyLinkerModal
        isOpen={isLinkerOpen}
        onClose={() => setIsLinkerOpen(false)}
        onInsertToken={handleInsertToken}
        availableRequests={availableRequests}
        currentRequestId={currentRequestId ?? (initialRequest as { id?: string } | undefined)?.id}
      />
    </div>
  );
}
