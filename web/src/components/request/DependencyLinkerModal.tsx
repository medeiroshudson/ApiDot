import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Link2,
  FileCode,
  Server,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { HTTP_METHOD_BADGES } from './RequestAutocomplete';

export interface DependencyResponse {
  status?: number;
  statusCode?: number;
  headers?: Record<string, string | string[]> | [string, string][] | null;
  body?: string | Record<string, unknown> | unknown[] | null;
}

export interface DependencyRequest {
  id: string;
  name: string;
  method: string;
  url?: string;
  response?: DependencyResponse | null;
}

export interface DependencyLinkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertToken: (token: string) => void;
  availableRequests: DependencyRequest[];
  currentRequestId?: string;
}

export const DEPENDENCY_TABS = [
  { id: 'body', label: 'Corpo (Body)', icon: FileCode },
  { id: 'headers', label: 'Cabeçalhos (Headers)', icon: Server },
  { id: 'status', label: 'Status', icon: Activity },
] as const;

export type DependencyTabType = (typeof DEPENDENCY_TABS)[number]['id'];

function getChildPath(
  parentPath: string,
  keyOrIndex: string | number,
  isArrayParent: boolean
): string {
  if (!parentPath) {
    return isArrayParent ? `[${keyOrIndex}]` : String(keyOrIndex);
  }
  if (isArrayParent) {
    return `${parentPath}[${keyOrIndex}]`;
  }
  return `${parentPath}.${keyOrIndex}`;
}

interface TreeNodeProps {
  label: string;
  value: unknown;
  path: string;
  requestId: string;
  onInsertToken: (token: string) => void;
  copiedToken: string | null;
  onCopyToken: (token: string) => void;
  depth?: number;
}

function TreeNode({
  label,
  value,
  path,
  requestId,
  onInsertToken,
  copiedToken,
  onCopyToken,
  depth = 0,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const token = path.startsWith('[')
    ? `{{$request['${requestId}'].response.body${path}}}`
    : `{{$request['${requestId}'].response.body.${path}}}`;
  const isCopied = copiedToken === token;

  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  const entries: [string | number, unknown][] = useMemo(() => {
    if (!isObject) return [];
    if (isArray) {
      return (value as unknown[]).map((item, idx) => [idx, item]);
    }
    return Object.entries(value as Record<string, unknown>);
  }, [value, isObject, isArray]);

  const handleInsert = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInsertToken(token);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyToken(token);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const renderValuePreview = () => {
    if (value === null) {
      return <span className="text-rose-400">null</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="text-purple-400">{value ? 'true' : 'false'}</span>;
    }
    if (typeof value === 'number') {
      return <span className="text-amber-400">{value}</span>;
    }
    if (typeof value === 'string') {
      return <span className="text-emerald-400">"{value}"</span>;
    }
    if (isArray) {
      return (
        <span className="text-neutral-500 text-xs">
          Array({(value as unknown[]).length})
        </span>
      );
    }
    if (isObject) {
      return (
        <span className="text-neutral-500 text-xs">
          {`{${Object.keys(value as Record<string, unknown>).length} campos}`}
        </span>
      );
    }
    return <span className="text-neutral-400">{String(value)}</span>;
  };

  return (
    <div className="flex flex-col text-xs font-mono select-none">
      <div
        onClick={handleInsert}
        className={`group flex items-center justify-between py-1 px-2 rounded hover:bg-neutral-800/80 cursor-pointer transition-colors ${
          depth > 0 ? 'ml-3 border-l border-neutral-800 pl-2' : ''
        }`}
        title={`Clique para inserir: ${token}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isObject ? (
            <button
              type="button"
              aria-label={isExpanded ? `Recolher ${label}` : `Expandir ${label}`}
              onClick={handleToggle}
              className="p-0.5 text-neutral-400 hover:text-white rounded hover:bg-neutral-700/60"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-3.5 inline-block" />
          )}

          <span className="text-sky-400 font-semibold">{label}</span>
          <span className="text-neutral-500">:</span>
          <div className="truncate">{renderValuePreview()}</div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
          <button
            type="button"
            aria-label="Copiar token"
            title="Copiar token"
            onClick={handleCopy}
            className="p-1 text-neutral-400 hover:text-neutral-100 rounded hover:bg-neutral-700/80 transition-colors"
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <span className="text-[10px] text-neutral-500 bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded flex items-center gap-1 text-neutral-400">
            <span>Inserir</span>
            <ArrowRight className="w-2.5 h-2.5" />
          </span>
        </div>
      </div>

      {isObject && isExpanded && (
        <div className="flex flex-col">
          {entries.map(([childKey, childValue]) => {
            const childPath = getChildPath(path, childKey, isArray);
            return (
              <TreeNode
                key={String(childKey)}
                label={isArray ? `[${childKey}]` : String(childKey)}
                value={childValue}
                path={childPath}
                requestId={requestId}
                onInsertToken={onInsertToken}
                copiedToken={copiedToken}
                onCopyToken={onCopyToken}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DependencyLinkerModal({
  isOpen,
  onClose,
  onInsertToken,
  availableRequests,
  currentRequestId,
}: DependencyLinkerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DependencyTabType>('body');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter requests (exclude current request ID, filter by search query)
  const filteredRequests = useMemo(() => {
    return availableRequests.filter((req) => {
      if (currentRequestId && req.id === currentRequestId) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        req.name.toLowerCase().includes(q) ||
        (req.url && req.url.toLowerCase().includes(q)) ||
        req.method.toLowerCase().includes(q)
      );
    });
  }, [availableRequests, currentRequestId, searchQuery]);

  // Auto-select first request if none selected or if selected was filtered out
  useEffect(() => {
    if (!isOpen) return;
    if (filteredRequests.length > 0) {
      if (!selectedRequestId || !filteredRequests.some((r) => r.id === selectedRequestId)) {
        setSelectedRequestId(filteredRequests[0].id);
      }
    } else {
      setSelectedRequestId(null);
    }
  }, [isOpen, filteredRequests, selectedRequestId]);

  const selectedRequest = useMemo(() => {
    return availableRequests.find((r) => r.id === selectedRequestId) || null;
  }, [availableRequests, selectedRequestId]);

  const response = selectedRequest?.response;

  // Normalized headers
  const normalizedHeaders = useMemo(() => {
    if (!response?.headers) return [];
    if (Array.isArray(response.headers)) {
      return response.headers.map(([key, val]) => ({
        key,
        value: Array.isArray(val) ? val.join(', ') : String(val),
      }));
    }
    return Object.entries(response.headers).map(([key, val]) => ({
      key,
      value: Array.isArray(val) ? val.join(', ') : String(val),
    }));
  }, [response?.headers]);

  // Parsed body
  const parsedBody = useMemo(() => {
    if (!response?.body) return null;
    if (typeof response.body === 'object') return response.body;
    try {
      return JSON.parse(response.body);
    } catch {
      return null;
    }
  }, [response?.body]);

  const handleCopyToken = useCallback((token: string) => {
    navigator.clipboard?.writeText(token);
    setCopiedToken(token);
    setTimeout(() => {
      setCopiedToken((prev) => (prev === token ? null : prev));
    }, 2000);
  }, []);

  const handleInsert = useCallback(
    (token: string) => {
      onInsertToken(token);
    },
    [onInsertToken]
  );

  if (!isOpen) return null;

  const statusCode = response?.statusCode ?? response?.status;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dependency-linker-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-4xl h-[620px] bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-950/70 border border-blue-800/80 text-blue-400">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="dependency-linker-title" className="text-sm font-semibold text-white">
                Vincular Resposta de Dependência
              </h2>
              <p className="text-xs text-neutral-400">
                Selecione campos de requisições anteriores para encadear valores dinâmicos
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body (Two Column Layout) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Requests List */}
          <div className="w-80 border-r border-neutral-800 flex flex-col bg-neutral-950/30">
            {/* Search */}
            <div className="p-3 border-b border-neutral-800">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Buscar requisições..."
                  aria-label="Buscar requisições"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
              {filteredRequests.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-500">
                  Nenhuma requisição encontrada.
                </div>
              ) : (
                filteredRequests.map((req) => {
                  const isSelected = req.id === selectedRequestId;
                  const reqStatus = req.response?.statusCode ?? req.response?.status;
                  const methodBadge =
                    HTTP_METHOD_BADGES[req.method] ||
                    'text-blue-400 bg-blue-950/60 border-blue-800/80';

                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => setSelectedRequestId(req.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-blue-950/30 border-blue-600/80 shadow-sm'
                          : 'bg-neutral-900/60 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-850'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${methodBadge}`}
                        >
                          {req.method}
                        </span>
                        <span className="text-xs font-semibold text-neutral-200 truncate flex-1">
                          {req.name}
                        </span>
                        {reqStatus && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                              reqStatus >= 200 && reqStatus < 300
                                ? 'text-emerald-400 bg-emerald-950/50'
                                : 'text-amber-400 bg-amber-950/50'
                            }`}
                          >
                            {reqStatus}
                          </span>
                        )}
                      </div>
                      {req.url && (
                        <span className="text-[11px] text-neutral-400 font-mono truncate">
                          {req.url}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Selected Request Response Inspector */}
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-900/50">
            {!selectedRequest ? (
              <div className="flex-1 flex items-center justify-center p-8 text-neutral-500 text-xs">
                Selecione uma requisição para inspecionar os dados de resposta
              </div>
            ) : !selectedRequest.response ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-500 text-xs gap-2">
                <Activity className="w-8 h-8 text-neutral-600" />
                <span>Esta requisição não possui dados de resposta executados.</span>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div
                  role="tablist"
                  aria-label="Abas de dados da resposta"
                  className="flex items-center border-b border-neutral-800 px-4 bg-neutral-950/40 shrink-0"
                >
                  {DEPENDENCY_TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        role="tab"
                        id={`dep-tab-${tab.id}`}
                        aria-selected={isActive}
                        aria-controls={`dep-panel-${tab.id}`}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors focus:outline-none ${
                          isActive
                            ? 'border-blue-500 text-white'
                            : 'border-transparent text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {/* Body Panel */}
                  {activeTab === 'body' && (
                    <div
                      role="tabpanel"
                      id="dep-panel-body"
                      aria-labelledby="dep-tab-body"
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between text-xs text-neutral-400 pb-2 border-b border-neutral-800/80">
                        <span>Árvore de Propriedades (clique para vincular)</span>
                        <span className="text-[11px] text-neutral-500 font-mono">
                          Format: {`{{$request['${selectedRequest.id}'].response.body.<path>}}`}
                        </span>
                      </div>

                      {parsedBody ? (
                        <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800 overflow-x-auto">
                          {Array.isArray(parsedBody) ? (
                            parsedBody.map((item, idx) => (
                              <TreeNode
                                key={idx}
                                label={`[${idx}]`}
                                value={item}
                                path={`[${idx}]`}
                                requestId={selectedRequest.id}
                                onInsertToken={handleInsert}
                                copiedToken={copiedToken}
                                onCopyToken={handleCopyToken}
                              />
                            ))
                          ) : typeof parsedBody === 'object' ? (
                            Object.entries(parsedBody).map(([key, val]) => (
                              <TreeNode
                                key={key}
                                label={key}
                                value={val}
                                path={key}
                                requestId={selectedRequest.id}
                                onInsertToken={handleInsert}
                                copiedToken={copiedToken}
                                onCopyToken={handleCopyToken}
                              />
                            ))
                          ) : (
                            <div
                              onClick={() =>
                                handleInsert(
                                  `{{$request['${selectedRequest.id}'].response.body}}`
                                )
                              }
                              className="text-xs font-mono text-emerald-400 cursor-pointer p-2 hover:bg-neutral-800 rounded"
                            >
                              {String(parsedBody)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-400 p-4 bg-neutral-950 rounded border border-neutral-800">
                          {selectedRequest.response.body ? (
                            <div
                              onClick={() =>
                                handleInsert(
                                  `{{$request['${selectedRequest.id}'].response.body}}`
                                )
                              }
                              className="font-mono text-neutral-300 cursor-pointer hover:underline"
                            >
                              {String(selectedRequest.response.body)}
                            </div>
                          ) : (
                            'Nenhum corpo de resposta retornado.'
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Headers Panel */}
                  {activeTab === 'headers' && (
                    <div
                      role="tabpanel"
                      id="dep-panel-headers"
                      aria-labelledby="dep-tab-headers"
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between text-xs text-neutral-400 pb-2 border-b border-neutral-800/80">
                        <span>Cabeçalhos da Resposta (clique para vincular)</span>
                        <span className="text-[11px] text-neutral-500 font-mono">
                          Format: {`{{$request['${selectedRequest.id}'].response.headers['<header>']}}`}
                        </span>
                      </div>

                      {normalizedHeaders.length === 0 ? (
                        <div className="text-xs text-neutral-500 p-4 text-center">
                          Nenhum cabeçalho retornado nesta resposta.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {normalizedHeaders.map(({ key, value }) => {
                            const headerToken = `{{$request['${selectedRequest.id}'].response.headers['${key}']}}`;
                            const isCopied = copiedToken === headerToken;

                            return (
                              <div
                                key={key}
                                onClick={() => handleInsert(headerToken)}
                                className="group flex items-center justify-between p-2.5 rounded-lg bg-neutral-950/80 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/80 cursor-pointer transition-all"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="text-xs font-mono font-semibold text-sky-400">
                                    {key}
                                  </span>
                                  <span className="text-neutral-500">:</span>
                                  <span className="text-xs font-mono text-neutral-300 truncate">
                                    {value}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                                  <button
                                    type="button"
                                    aria-label="Copiar token"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyToken(headerToken);
                                    }}
                                    className="p-1 text-neutral-400 hover:text-neutral-100 rounded hover:bg-neutral-700/80 transition-colors"
                                  >
                                    {isCopied ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <span className="text-[10px] text-neutral-500 bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded flex items-center gap-1 text-neutral-400">
                                    <span>Inserir</span>
                                    <ArrowRight className="w-2.5 h-2.5" />
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status Panel */}
                  {activeTab === 'status' && (
                    <div
                      role="tabpanel"
                      id="dep-panel-status"
                      aria-labelledby="dep-tab-status"
                      className="flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between text-xs text-neutral-400 pb-2 border-b border-neutral-800/80">
                        <span>Código de Status da Resposta (clique para vincular)</span>
                        <span className="text-[11px] text-neutral-500 font-mono">
                          Format: {`{{$request['${selectedRequest.id}'].response.status}}`}
                        </span>
                      </div>

                      {statusCode !== undefined ? (
                        <div
                          onClick={() =>
                            handleInsert(
                              `{{$request['${selectedRequest.id}'].response.status}}`
                            )
                          }
                          className="group flex items-center justify-between p-4 rounded-lg bg-neutral-950/80 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/80 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-lg font-mono font-bold px-2.5 py-1 rounded border ${
                                statusCode >= 200 && statusCode < 300
                                  ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80'
                                  : 'text-amber-400 bg-amber-950/60 border-amber-800/80'
                              }`}
                            >
                              {statusCode}
                            </span>
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-neutral-200">
                                HTTP Status Code
                              </span>
                              <span className="text-[11px] font-mono text-neutral-500">
                                {`{{$request['${selectedRequest.id}'].response.status}}`}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                            <button
                              type="button"
                              aria-label="Copiar token"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyToken(
                                  `{{$request['${selectedRequest.id}'].response.status}}`
                                );
                              }}
                              className="p-1.5 text-neutral-400 hover:text-neutral-100 rounded hover:bg-neutral-700/80 transition-colors"
                            >
                              {copiedToken ===
                              `{{$request['${selectedRequest.id}'].response.status}}` ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <span className="text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded flex items-center gap-1">
                              <span>Inserir</span>
                              <ArrowRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-500 p-4 text-center">
                          Status não disponível para esta requisição.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-neutral-950/80 text-xs text-neutral-400 shrink-0">
          <span>
            {selectedRequest
              ? `Requisição selecionada: ${selectedRequest.name} (${selectedRequest.id})`
              : 'Nenhuma requisição selecionada'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
