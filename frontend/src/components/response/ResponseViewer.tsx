import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Copy, Check, Clock, Server, FileCode, Layers, Loader2 } from 'lucide-react';
import { TimingWaterfall, TimingBreakdown } from './TimingWaterfall';
import { SyntaxHighlighter } from '../common/syntax/SyntaxHighlighter';

export interface ResponseData {
  statusCode: number;
  statusText?: string;
  durationMs?: number;
  sizeBytes?: number;
  headers?: Record<string, string | string[]> | [string, string][] | null;
  body?: string;
  timing?: TimingBreakdown | null;
  errorMessage?: string | null;
}

export interface ResponseViewerProps {
  response: ResponseData | null;
  isLoading?: boolean;
  className?: string;
}

export const RESPONSE_TABS = [
  { id: 'pretty', label: 'Pretty', icon: FileCode },
  { id: 'raw', label: 'Raw', icon: Layers },
  { id: 'headers', label: 'Headers', icon: Server },
  { id: 'timings', label: 'Timings', icon: Clock },
] as const;

export type ResponseTabType = (typeof RESPONSE_TABS)[number]['id'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getPayloadSize(response: ResponseData | null): number {
  if (!response) return 0;
  if (typeof response.sizeBytes === 'number') {
    return response.sizeBytes;
  }
  if (response.body) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(response.body).length;
    }
    return response.body.length;
  }
  return 0;
}

export const calculateSize = getPayloadSize;

export function ResponseViewer({
  response,
  isLoading = false,
  className = '',
}: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<ResponseTabType>('pretty');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const payloadSize = useMemo(
    () => getPayloadSize(response),
    [response?.sizeBytes, response?.body]
  );

  const prettyBody = useMemo(() => {
    if (activeTab !== 'pretty' || !response?.body) return '';
    try {
      const parsed = JSON.parse(response.body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return response.body;
    }
  }, [activeTab, response?.body]);

  const normalizedHeaders = useMemo((): [string, string][] => {
    if (!response?.headers) return [];
    if (Array.isArray(response.headers)) {
      return response.headers;
    }
    const entries: [string, string][] = [];
    for (const [key, val] of Object.entries(response.headers)) {
      if (Array.isArray(val)) {
        entries.push([key, val.join(', ')]);
      } else {
        entries.push([key, String(val)]);
      }
    }
    return entries;
  }, [response?.headers]);

  const handleCopyBody = async () => {
    if (!response?.body) return;
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API not available');
      }
      await navigator.clipboard.writeText(response.body);
      setCopied(true);
      setCopyFailed(false);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopyFailed(true);
      setCopied(false);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopyFailed(false);
      }, 2000);
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let targetIndex = -1;
    if (e.key === 'ArrowRight') {
      targetIndex = (index + 1) % RESPONSE_TABS.length;
    } else if (e.key === 'ArrowLeft') {
      targetIndex = (index - 1 + RESPONSE_TABS.length) % RESPONSE_TABS.length;
    } else if (e.key === 'Home') {
      targetIndex = 0;
    } else if (e.key === 'End') {
      targetIndex = RESPONSE_TABS.length - 1;
    }

    if (targetIndex !== -1) {
      e.preventDefault();
      const nextTab = RESPONSE_TABS[targetIndex];
      setActiveTab(nextTab.id);
      tabRefs.current[targetIndex]?.focus();
    }
  };

  if (isLoading) {
    return (
      <div
        data-testid="response-loading"
        role="status"
        aria-live="polite"
        className={`flex flex-col items-center justify-center h-full p-8 text-center text-neutral-500 bg-neutral-950 ${className}`}
      >
        <div className="w-10 h-10 rounded-full border border-neutral-800 flex items-center justify-center mb-3 text-blue-500">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-neutral-300">
          Enviando requisição...
        </p>
        <p className="text-xs text-neutral-600 mt-1 max-w-xs">
          Aguardando resposta do servidor
        </p>
        <div className="w-48 max-w-full space-y-2 mt-4 animate-pulse" aria-hidden="true">
          <div className="h-2 bg-neutral-800 rounded w-3/4 mx-auto" />
          <div className="h-2 bg-neutral-800 rounded w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full p-8 text-center text-neutral-500 bg-neutral-950 ${className}`}
      >
        <div className="w-10 h-10 rounded-full border border-neutral-800 flex items-center justify-center mb-3 text-neutral-600">
          <Server className="w-5 h-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-neutral-400">
          Dispare uma requisição para visualizar a resposta
        </p>
        <p className="text-xs text-neutral-600 mt-1 max-w-xs">
          Os detalhes de status, latência por etapa, cabeçalhos e payload aparecerão aqui.
        </p>
      </div>
    );
  }

  const { statusCode, statusText, durationMs, errorMessage } = response;
  const isNetworkError = statusCode === 0 || !!errorMessage;
  const is1xx = statusCode >= 100 && statusCode < 200;
  const is2xx = statusCode >= 200 && statusCode < 300;
  const is3xx = statusCode >= 300 && statusCode < 400;
  const is4xx = statusCode >= 400 && statusCode < 500;
  const is5xx = statusCode >= 500;

  let badgeClasses = 'bg-rose-950 text-rose-400 border-rose-800';
  let badgeLabel = `${statusCode} ${statusText || ''}`.trim();

  if (isNetworkError) {
    badgeClasses = 'bg-rose-950 text-rose-400 border-rose-800';
    badgeLabel = errorMessage || (statusText ? `Error: ${statusText}` : 'Error');
  } else if (is1xx) {
    badgeClasses = 'bg-sky-950 text-sky-400 border-sky-800';
  } else if (is2xx) {
    badgeClasses = 'bg-emerald-950 text-emerald-400 border-emerald-800';
  } else if (is3xx) {
    badgeClasses = 'bg-amber-950 text-amber-400 border-amber-800';
  } else if (is4xx || is5xx) {
    badgeClasses = 'bg-rose-950 text-rose-400 border-rose-800';
  }

  return (
    <div
      className={`flex flex-col h-full bg-neutral-950 border-l border-neutral-800 text-neutral-200 overflow-hidden ${className}`}
    >
      {/* Top Header: Status Badge, Metrics, Copy Action */}
      <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 border-b border-neutral-800 bg-neutral-900/40">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span
            data-testid="status-badge"
            className={`px-2 py-0.5 rounded text-xs font-mono font-bold border transition-colors ${badgeClasses}`}
          >
            {badgeLabel}
          </span>

          {typeof durationMs === 'number' && (
            <span className="text-xs font-mono text-neutral-400">
              {durationMs} ms
            </span>
          )}

          <span className="text-xs font-mono text-neutral-400">
            {formatBytes(payloadSize)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={copied ? 'Corpo da resposta copiado' : 'Copiar corpo da resposta'}
            onClick={handleCopyBody}
            disabled={!response.body}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-400">Copiado!</span>
              </>
            ) : copyFailed ? (
              <>
                <Copy className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                <span className="text-rose-400">Falha ao copiar</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copiar</span>
              </>
            )}
          </button>
          <span className="sr-only" role="status" aria-live="polite">
            {copied
              ? 'Corpo da resposta copiado para a área de transferência'
              : copyFailed
              ? 'Falha ao copiar corpo da resposta'
              : ''}
          </span>
        </div>
      </div>

      {/* Tabs list with roving tabIndex */}
      <div
        role="tablist"
        aria-label="Abas de visualização da resposta"
        className="flex border-b border-neutral-800 bg-neutral-900/20 px-3 sm:px-4"
      >
        {RESPONSE_TABS.map((tab, index) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`response-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`response-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-auto p-3 sm:p-4">
        {/* Pretty tab panel */}
        <div
          role="tabpanel"
          id="response-panel-pretty"
          aria-labelledby="response-tab-pretty"
          tabIndex={0}
          hidden={activeTab !== 'pretty'}
          className={activeTab === 'pretty' ? 'h-full flex flex-col focus:outline-none' : 'hidden'}
        >
          {activeTab === 'pretty' && (
            response.body ? (
              <SyntaxHighlighter
                code={prettyBody}
                language="json"
                data-testid="response-pretty-content"
                className="flex-1"
              />
            ) : (
              <div className="text-xs text-neutral-500 italic p-2">Corpo vazio</div>
            )
          )}
        </div>

        {/* Raw tab panel */}
        <div
          role="tabpanel"
          id="response-panel-raw"
          aria-labelledby="response-tab-raw"
          tabIndex={0}
          hidden={activeTab !== 'raw'}
          className={activeTab === 'raw' ? 'h-full flex flex-col focus:outline-none' : 'hidden'}
        >
          {activeTab === 'raw' && (
            response.body ? (
              <pre
                data-testid="response-raw-content"
                className="flex-1 font-mono text-xs text-neutral-300 whitespace-pre-wrap break-all select-text"
              >
                {response.body}
              </pre>
            ) : (
              <div className="text-xs text-neutral-500 italic p-2">Corpo vazio</div>
            )
          )}
        </div>

        {/* Headers tab panel */}
        <div
          role="tabpanel"
          id="response-panel-headers"
          aria-labelledby="response-tab-headers"
          tabIndex={0}
          hidden={activeTab !== 'headers'}
          className={activeTab === 'headers' ? 'h-full flex flex-col focus:outline-none' : 'hidden'}
        >
          {activeTab === 'headers' && (
            normalizedHeaders.length > 0 ? (
              <div className="border border-neutral-800 rounded-md overflow-hidden bg-neutral-900/40 divide-y divide-neutral-800">
                {normalizedHeaders.map(([key, value], idx) => (
                  <div
                    key={`${key}-${idx}`}
                    className="flex flex-col sm:flex-row sm:items-center py-2 px-3 text-xs gap-1 sm:gap-4 hover:bg-neutral-800/40"
                  >
                    <span className="font-mono font-semibold text-neutral-300 min-w-[140px] select-text">
                      {key}
                    </span>
                    <span className="font-mono text-neutral-400 break-all select-text">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-neutral-500 italic p-2">
                Nenhum cabeçalho retornado
              </div>
            )
          )}
        </div>

        {/* Timings tab panel */}
        <div
          role="tabpanel"
          id="response-panel-timings"
          aria-labelledby="response-tab-timings"
          tabIndex={0}
          hidden={activeTab !== 'timings'}
          className={activeTab === 'timings' ? 'h-full flex flex-col focus:outline-none' : 'hidden'}
        >
          {activeTab === 'timings' && (
            <TimingWaterfall
              timing={response.timing}
              totalDurationMs={response.durationMs}
            />
          )}
        </div>
      </div>
    </div>
  );
}
