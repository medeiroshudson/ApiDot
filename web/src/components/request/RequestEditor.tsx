import React, { useState } from 'react';
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

type TabType = 'headers' | 'body' | 'auth';

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

  const handleSend = () => {
    if (isLoading) return;
    const requestData: RequestData = {
      method,
      url,
      target,
      headers,
      body,
      auth,
    };
    onSend?.(requestData);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100">
      {/* Top Bar: Method, URL, TargetSelector, Send Button */}
      <div className="p-3 sm:p-4 border-b border-neutral-800 bg-neutral-900/40 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex items-center gap-2 flex-1">
          <select
            aria-label="Método HTTP"
            value={method}
            onChange={(e) => handleMethodChange(e.target.value)}
            className="h-10 px-3 font-semibold text-xs rounded-md bg-neutral-800 border border-neutral-700 text-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m} className="bg-neutral-900 text-neutral-200">
                {m}
              </option>
            ))}
          </select>

          <input
            type="text"
            aria-label="URL da requisição"
            placeholder="https://api.exemplo.com/v1/recurso"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            className="h-10 flex-1 px-3 text-sm bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0">
          <TargetSelector
            value={target}
            isAgentOnline={isAgentOnline}
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

      {/* Tabs navigation */}
      <div
        role="tablist"
        aria-label="Abas de configuração da requisição"
        className="flex border-b border-neutral-800 bg-neutral-900/20 px-3 sm:px-4"
      >
        <button
          type="button"
          role="tab"
          id="tab-headers"
          aria-selected={activeTab === 'headers'}
          aria-controls="panel-headers"
          onClick={() => setActiveTab('headers')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors focus:outline-none ${
            activeTab === 'headers'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Headers
        </button>

        <button
          type="button"
          role="tab"
          id="tab-body"
          aria-selected={activeTab === 'body'}
          aria-controls="panel-body"
          onClick={() => setActiveTab('body')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors focus:outline-none ${
            activeTab === 'body'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Body
        </button>

        <button
          type="button"
          role="tab"
          id="tab-auth"
          aria-selected={activeTab === 'auth'}
          aria-controls="panel-auth"
          onClick={() => setActiveTab('auth')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors focus:outline-none ${
            activeTab === 'auth'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Auth
        </button>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
        {activeTab === 'headers' && (
          <div role="tabpanel" id="panel-headers" aria-labelledby="tab-headers" className="h-full flex flex-col">
            <label htmlFor="headers-textarea" className="text-xs text-neutral-400 mb-2">
              Cabeçalhos HTTP (JSON ou formato Chave: Valor):
            </label>
            <textarea
              id="headers-textarea"
              aria-label="Cabeçalhos HTTP"
              value={headers}
              onChange={(e) => handleHeadersChange(e.target.value)}
              placeholder="{\n  &quot;Content-Type&quot;: &quot;application/json&quot;,\n  &quot;Authorization&quot;: &quot;Bearer token&quot;\n}"
              className="w-full flex-1 min-h-[160px] p-3 text-xs sm:text-sm font-mono bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
          </div>
        )}

        {activeTab === 'body' && (
          <div role="tabpanel" id="panel-body" aria-labelledby="tab-body" className="h-full flex flex-col">
            <label htmlFor="body-textarea" className="text-xs text-neutral-400 mb-2">
              Corpo da Requisição (Payload):
            </label>
            <textarea
              id="body-textarea"
              aria-label="Corpo da requisição"
              value={body}
              onChange={(e) => handleBodyChange(e.target.value)}
              placeholder="{\n  &quot;key&quot;: &quot;value&quot;\n}"
              className="w-full flex-1 min-h-[160px] p-3 text-xs sm:text-sm font-mono bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
          </div>
        )}

        {activeTab === 'auth' && (
          <div role="tabpanel" id="panel-auth" aria-labelledby="tab-auth" className="flex flex-col gap-4 max-w-lg">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-type-select" className="text-xs text-neutral-400">
                Tipo de Autenticação:
              </label>
              <select
                id="auth-type-select"
                aria-label="Tipo de autenticação"
                value={auth.type}
                onChange={(e) => handleAuthTypeChange(e.target.value as AuthConfig['type'])}
                className="h-9 px-3 text-xs rounded-md bg-neutral-900 border border-neutral-800 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  onChange={(e) => {
                    const newAuth = { ...auth, token: e.target.value };
                    setAuth(newAuth);
                    updateRequest((prev) => ({ ...prev, auth: newAuth }));
                  }}
                  className="h-9 px-3 text-xs font-mono bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    onChange={(e) => {
                      const newAuth = { ...auth, username: e.target.value };
                      setAuth(newAuth);
                      updateRequest((prev) => ({ ...prev, auth: newAuth }));
                    }}
                    className="h-9 px-3 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    onChange={(e) => {
                      const newAuth = { ...auth, password: e.target.value };
                      setAuth(newAuth);
                      updateRequest((prev) => ({ ...prev, auth: newAuth }));
                    }}
                    className="h-9 px-3 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    onChange={(e) => {
                      const newAuth = { ...auth, key: e.target.value };
                      setAuth(newAuth);
                      updateRequest((prev) => ({ ...prev, auth: newAuth }));
                    }}
                    className="h-9 px-3 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    onChange={(e) => {
                      const newAuth = { ...auth, value: e.target.value };
                      setAuth(newAuth);
                      updateRequest((prev) => ({ ...prev, auth: newAuth }));
                    }}
                    className="h-9 px-3 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
