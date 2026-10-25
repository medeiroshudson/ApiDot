import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { TargetSelector, ExecutionTarget } from './TargetSelector';

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
  initialRequest?: Partial<RequestData>;
  isAgentOnline?: boolean;
  isLoading?: boolean;
  onSend?: (request: RequestData) => void;
  onChange?: (request: RequestData) => void;
}

export const TABS = [
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
] as const;

export type TabType = (typeof TABS)[number]['id'];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export function RequestEditor({
  initialRequest,
  isAgentOnline = false,
  isLoading = false,
  onSend,
  onChange,
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

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
      tabRefs.current[targetIndex]?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100">
      {/* Top Bar: Method, URL, TargetSelector, Send Button */}
      <div className="p-3 sm:p-4 border-b border-neutral-800 bg-neutral-900/40 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex items-center gap-2 flex-1">
            <select
              aria-label="Método HTTP"
              value={method}
              disabled={isLoading}
              onChange={(e) => handleMethodChange(e.target.value)}
              className="h-10 px-3 font-semibold text-xs rounded-md bg-neutral-800 border border-neutral-700 text-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m} className="bg-neutral-900 text-neutral-200">
                  {m}
                </option>
              ))}
            </select>

            <div className="flex-1">
              <input
                type="text"
                aria-label="URL da requisição"
                placeholder="https://api.exemplo.com/v1/recurso"
                value={url}
                disabled={isLoading}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                aria-invalid={!!urlError}
                aria-describedby={urlError ? 'url-error' : undefined}
                className={`h-10 w-full px-3 text-sm bg-neutral-900 border rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 font-mono disabled:opacity-50 disabled:cursor-not-allowed ${
                  urlError
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-neutral-800 focus:ring-blue-500'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0">
            <TargetSelector
              value={target}
              isAgentOnline={isAgentOnline}
              disabled={isLoading}
              onChange={handleTargetChange}
            />

            <button
              type="button"
              aria-label="Enviar requisição"
              onClick={handleSend}
              disabled={isLoading}
              className="h-10 px-4 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{isLoading ? 'Enviando...' : 'Enviar'}</span>
            </button>
          </div>
        </div>

        {urlError && (
          <span id="url-error" role="alert" className="text-xs text-rose-500 px-1">
            {urlError}
          </span>
        )}
      </div>

      {/* Tabs navigation */}
      <div
        role="tablist"
        aria-label="Abas de configuração da requisição"
        className="flex border-b border-neutral-800 bg-neutral-900/20 px-3 sm:px-4"
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
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
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

      {/* Tab Panels */}
      <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
        <div
          role="tabpanel"
          id="panel-headers"
          aria-labelledby="tab-headers"
          hidden={activeTab !== 'headers'}
          className={activeTab === 'headers' ? 'h-full flex flex-col' : 'hidden'}
        >
          <label htmlFor="headers-textarea" className="text-xs text-neutral-400 mb-2">
            Cabeçalhos HTTP (JSON ou formato Chave: Valor):
          </label>
          <textarea
            id="headers-textarea"
            aria-label="Cabeçalhos HTTP"
            value={headers}
            disabled={isLoading}
            onChange={(e) => handleHeadersChange(e.target.value)}
            placeholder="{\n  &quot;Content-Type&quot;: &quot;application/json&quot;,\n  &quot;Authorization&quot;: &quot;Bearer token&quot;\n}"
            className="w-full flex-1 min-h-[160px] p-3 text-xs sm:text-sm font-mono bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div
          role="tabpanel"
          id="panel-body"
          aria-labelledby="tab-body"
          hidden={activeTab !== 'body'}
          className={activeTab === 'body' ? 'h-full flex flex-col' : 'hidden'}
        >
          <label htmlFor="body-textarea" className="text-xs text-neutral-400 mb-2">
            Corpo da requisição (Payload):
          </label>
          <textarea
            id="body-textarea"
            aria-label="Corpo da requisição"
            value={body}
            disabled={isLoading}
            onChange={(e) => handleBodyChange(e.target.value)}
            placeholder="{\n  &quot;key&quot;: &quot;value&quot;\n}"
            className="w-full flex-1 min-h-[160px] p-3 text-xs sm:text-sm font-mono bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y disabled:opacity-50 disabled:cursor-not-allowed"
          />
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
    </div>
  );
}
