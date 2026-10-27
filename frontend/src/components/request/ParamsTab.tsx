'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Trash2, Plus, Route, HelpCircle } from 'lucide-react';

export interface QueryParamRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface ParamsTabProps {
  url: string;
  onUrlChange: (newUrl: string) => void;
  pathParams?: Record<string, string>;
  onPathParamsChange?: (params: Record<string, string>) => void;
  disabled?: boolean;
}

/**
 * Extracts all `:param` tokens from the path portion of a URL.
 * Automatically ignores host and port segments (e.g. localhost:5000).
 */
export function extractPathParamsFromUrl(url: string): string[] {
  if (!url) return [];
  // Take part before ? or #
  const beforeQuery = url.split(/[?#]/)[0] || '';

  // Extract path portion after authority (host:port) if scheme is present
  let pathOnly = beforeQuery;
  const schemeIndex = beforeQuery.indexOf('://');
  if (schemeIndex !== -1) {
    const slashAfterHost = beforeQuery.indexOf('/', schemeIndex + 3);
    pathOnly = slashAfterHost !== -1 ? beforeQuery.slice(slashAfterHost) : '';
  }

  const regex = /:([a-zA-Z0-9_]+)/g;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(pathOnly)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }
  return names;
}

/**
 * Encodes a query key or value while preserving {{variable}} interpolation tags.
 */
function encodeParam(str: string): string {
  if (!str) return '';
  const parts = str.split(/(\{\{[^}]+\}\})/);
  return parts
    .map((part) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        return part;
      }
      return encodeURIComponent(part);
    })
    .join('');
}

/**
 * Decodes a query parameter component.
 */
function decodeParam(str: string): string {
  try {
    return decodeURIComponent(str.replace(/\+/g, ' '));
  } catch {
    return str;
  }
}

/**
 * Parses query string into structured rows, preserving disabled items and descriptions.
 */
export function parseQueryString(
  queryPart: string,
  existingRows: QueryParamRow[] = []
): QueryParamRow[] {
  if (!queryPart || !queryPart.trim()) {
    // Preserve any disabled rows from existingRows
    return existingRows.filter(
      (r) => !r.enabled && (r.key.trim() !== '' || r.value.trim() !== '')
    );
  }

  const tokens = queryPart.split('&').filter((t) => t.length > 0);
  const parsedItems = tokens.map((token) => {
    const eqIdx = token.indexOf('=');
    if (eqIdx >= 0) {
      return {
        key: decodeParam(token.slice(0, eqIdx)),
        value: decodeParam(token.slice(eqIdx + 1)),
      };
    }
    return {
      key: decodeParam(token),
      value: '',
    };
  });

  const usedExistingIds = new Set<string>();
  const newRows: QueryParamRow[] = [];

  for (const item of parsedItems) {
    const existing = existingRows.find(
      (r) => !usedExistingIds.has(r.id) && r.key === item.key
    );

    if (existing) {
      usedExistingIds.add(existing.id);
      newRows.push({
        ...existing,
        value: item.value,
        enabled: true,
      });
    } else {
      newRows.push({
        id: `query-param-${Math.random().toString(36).slice(2, 9)}`,
        key: item.key,
        value: item.value,
        enabled: true,
        description: '',
      });
    }
  }

  // Preserve disabled rows that are not in the active query string
  for (const r of existingRows) {
    if (
      !r.enabled &&
      !usedExistingIds.has(r.id) &&
      (r.key.trim() !== '' || r.value.trim() !== '')
    ) {
      newRows.push(r);
    }
  }

  return newRows;
}

/**
 * Reconstructs a full URL with serialized enabled query parameters.
 */
export function buildUrlWithQueryParams(
  currentUrl: string,
  rows: QueryParamRow[]
): string {
  const hashIndex = currentUrl.indexOf('#');
  const hashPart = hashIndex >= 0 ? currentUrl.slice(hashIndex) : '';
  const cleanBase = (
    hashIndex >= 0 ? currentUrl.slice(0, hashIndex) : currentUrl
  ).split('?')[0];

  const enabledRows = rows.filter(
    (r) => r.enabled && (r.key.trim() !== '' || r.value.trim() !== '')
  );

  if (enabledRows.length === 0) {
    return cleanBase + hashPart;
  }

  const queryString = enabledRows
    .map((r) => {
      const k = encodeParam(r.key.trim());
      const v = encodeParam(r.value);
      return v !== '' ? `${k}=${v}` : `${k}=`;
    })
    .join('&');

  return `${cleanBase}?${queryString}${hashPart}`;
}

export function ParamsTab({
  url,
  onUrlChange,
  pathParams: controlledPathParams,
  onPathParamsChange,
  disabled = false,
}: ParamsTabProps) {
  // --- Section 1: Path Parameters State ---
  const [internalPathParams, setInternalPathParams] = useState<Record<string, string>>({});
  const pathParams = controlledPathParams ?? internalPathParams;

  const pathParamNames = useMemo(() => extractPathParamsFromUrl(url), [url]);

  const handlePathParamChange = useCallback(
    (name: string, value: string) => {
      const next = { ...pathParams, [name]: value };
      if (!controlledPathParams) {
        setInternalPathParams(next);
      }
      onPathParamsChange?.(next);
    },
    [pathParams, controlledPathParams, onPathParamsChange]
  );

  // --- Section 2: Query Parameters State & Bidirectional Sync ---
  const [queryRows, setQueryRows] = useState<QueryParamRow[]>(() => {
    const qIndex = url.indexOf('?');
    const queryPart = qIndex >= 0 ? url.slice(qIndex + 1).split('#')[0] : '';
    return parseQueryString(queryPart);
  });

  // Draft row for adding new parameter
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const addRowRef = useRef<HTMLTableRowElement>(null);
  const newKeyInputRef = useRef<HTMLInputElement>(null);

  // Prevent infinite loops during bidirectional synchronization
  const isSelfUpdatingRef = useRef<boolean>(false);

  // Sync external URL changes into queryRows
  useEffect(() => {
    if (isSelfUpdatingRef.current) {
      isSelfUpdatingRef.current = false;
      return;
    }

    const qIndex = url.indexOf('?');
    const queryPart = qIndex >= 0 ? url.slice(qIndex + 1).split('#')[0] : '';
    setQueryRows((prev) => parseQueryString(queryPart, prev));
  }, [url]);

  const emitUrlChange = useCallback(
    (updatedRows: QueryParamRow[]) => {
      isSelfUpdatingRef.current = true;
      const nextUrl = buildUrlWithQueryParams(url, updatedRows);
      onUrlChange(nextUrl);
    },
    [url, onUrlChange]
  );

  const handleRowKeyChange = useCallback(
    (id: string, key: string) => {
      const next = queryRows.map((r) => (r.id === id ? { ...r, key } : r));
      setQueryRows(next);
      emitUrlChange(next);
    },
    [queryRows, emitUrlChange]
  );

  const handleRowValueChange = useCallback(
    (id: string, value: string) => {
      const next = queryRows.map((r) => (r.id === id ? { ...r, value } : r));
      setQueryRows(next);
      emitUrlChange(next);
    },
    [queryRows, emitUrlChange]
  );

  const handleRowToggle = useCallback(
    (id: string, enabled: boolean) => {
      const next = queryRows.map((r) => (r.id === id ? { ...r, enabled } : r));
      setQueryRows(next);
      emitUrlChange(next);
    },
    [queryRows, emitUrlChange]
  );

  const handleRowDescriptionChange = useCallback(
    (id: string, description: string) => {
      setQueryRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, description } : r))
      );
    },
    []
  );

  const handleRowDelete = useCallback(
    (id: string) => {
      const next = queryRows.filter((r) => r.id !== id);
      setQueryRows(next);
      emitUrlChange(next);
    },
    [queryRows, emitUrlChange]
  );

  const handleCommitNewRow = useCallback(() => {
    const trimmedKey = newKey.trim();
    if (!trimmedKey) return;

    const newRow: QueryParamRow = {
      id: `query-param-${Math.random().toString(36).slice(2, 9)}`,
      key: trimmedKey,
      value: newValue,
      enabled: true,
      description: newDescription,
    };

    const next = [...queryRows, newRow];
    setQueryRows(next);
    setNewKey('');
    setNewValue('');
    setNewDescription('');
    emitUrlChange(next);
  }, [newKey, newValue, newDescription, queryRows, emitUrlChange]);

  const handleAddRowBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (
        addRowRef.current &&
        e.relatedTarget &&
        addRowRef.current.contains(e.relatedTarget as Node)
      ) {
        return;
      }
      handleCommitNewRow();
    },
    [handleCommitNewRow]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-6 text-neutral-200">
      {/* 1. Path Parameters Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-blue-400" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">
              Parâmetros de Rota (Path Parameters)
            </h3>
            {pathParamNames.length > 0 && (
              <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.2 rounded font-mono">
                {pathParamNames.length}
              </span>
            )}
          </div>
          <span className="text-[11px] text-neutral-500">
            Valores substituídos em segmentos <code className="text-neutral-400">:param</code> da URL
          </span>
        </div>

        {pathParamNames.length === 0 ? (
          <div
            data-testid="path-params-empty"
            className="p-4 border border-dashed border-neutral-800 rounded-lg text-center text-xs text-neutral-500 bg-neutral-900/20"
          >
            Nenhum parâmetro de rota detectado no caminho da URL.
          </div>
        ) : (
          <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/30">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-900/80 text-neutral-400 font-medium border-b border-neutral-800">
                <tr>
                  <th scope="col" className="px-3 py-2 w-1/3">
                    Chave
                  </th>
                  <th scope="col" className="px-3 py-2 w-2/3">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono">
                {pathParamNames.map((name) => (
                  <tr key={name} className="hover:bg-neutral-900/40 transition-colors">
                    <td className="px-3 py-2 text-blue-400 font-semibold select-none">
                      {name}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        disabled={disabled}
                        aria-label={`Valor para :${name}`}
                        placeholder={`Valor para :${name}`}
                        value={pathParams[name] ?? ''}
                        onChange={(e) => handlePathParamChange(name, e.target.value)}
                        className="w-full bg-neutral-900/60 hover:bg-neutral-900 focus:bg-neutral-900 border border-neutral-800/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 rounded px-2.5 py-1 text-xs text-neutral-100 placeholder-neutral-500 outline-none transition-all disabled:opacity-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. Query Parameters Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">
              Parâmetros de Consulta (Query Parameters)
            </h3>
            {queryRows.length > 0 && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-mono">
                {queryRows.length}
              </span>
            )}
          </div>
          <span className="text-[11px] text-neutral-500">
            Sincronização bidirecional com a query string da URL
          </span>
        </div>

        <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/30">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-900/80 text-neutral-400 font-medium border-b border-neutral-800">
              <tr>
                <th scope="col" className="w-9 px-2.5 py-2 text-center">
                  <span className="sr-only">Ativar</span>
                </th>
                <th scope="col" className="px-3 py-2 w-1/4">
                  Chave
                </th>
                <th scope="col" className="px-3 py-2 w-1/3">
                  Valor
                </th>
                <th scope="col" className="px-3 py-2">
                  Descrição
                </th>
                <th scope="col" className="w-9 px-2.5 py-2 text-center">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {queryRows.map((row) => (
                <tr
                  key={row.id}
                  className={`hover:bg-neutral-900/40 transition-colors ${
                    !row.enabled ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-2.5 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label="Ativar parâmetro"
                      checked={row.enabled}
                      disabled={disabled}
                      onChange={(e) => handleRowToggle(row.id, e.target.checked)}
                      className="rounded bg-neutral-900 border-neutral-700 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer h-3.5 w-3.5"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      disabled={disabled}
                      placeholder="Chave"
                      aria-label="Chave do parâmetro"
                      value={row.key}
                      onChange={(e) => handleRowKeyChange(row.id, e.target.value)}
                      className="w-full bg-neutral-900/60 hover:bg-neutral-900 focus:bg-neutral-900 border border-neutral-800/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 rounded px-2.5 py-1 text-xs text-neutral-100 placeholder-neutral-500 outline-none transition-all disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      disabled={disabled}
                      placeholder="Valor"
                      aria-label="Valor do parâmetro"
                      value={row.value}
                      onChange={(e) => handleRowValueChange(row.id, e.target.value)}
                      className="w-full bg-neutral-900/60 hover:bg-neutral-900 focus:bg-neutral-900 border border-neutral-800/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 rounded px-2.5 py-1 text-xs text-neutral-100 placeholder-neutral-500 outline-none transition-all disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2 py-1.5 font-sans">
                    <input
                      type="text"
                      disabled={disabled}
                      placeholder="Descrição"
                      aria-label="Descrição do parâmetro"
                      value={row.description || ''}
                      onChange={(e) => handleRowDescriptionChange(row.id, e.target.value)}
                      className="w-full bg-neutral-900/60 hover:bg-neutral-900 focus:bg-neutral-900 border border-neutral-800/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 rounded px-2.5 py-1 text-xs text-neutral-300 placeholder-neutral-600 outline-none transition-all disabled:opacity-50"
                    />
                  </td>
                  <td className="px-2.5 py-1.5 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label="Remover parâmetro"
                      title="Remover parâmetro"
                      onClick={() => handleRowDelete(row.id)}
                      className="text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 p-1 rounded transition-colors focus:outline-none"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Draft row for adding new parameter */}
              <tr ref={addRowRef} className="hover:bg-neutral-900/20 bg-neutral-900/10">
                <td className="px-2.5 py-1.5 text-center">
                  <input
                    type="checkbox"
                    disabled
                    aria-label="Novo parâmetro"
                    className="rounded bg-neutral-800 border-neutral-700 opacity-30 cursor-not-allowed h-3.5 w-3.5"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    ref={newKeyInputRef}
                    type="text"
                    disabled={disabled}
                    placeholder="Novo parâmetro"
                    aria-label="Chave do novo parâmetro"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    onBlur={handleAddRowBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCommitNewRow();
                      }
                    }}
                    className="w-full bg-transparent hover:bg-neutral-900/60 focus:bg-neutral-900 border border-dashed border-neutral-800/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 rounded px-2.5 py-1 text-xs text-neutral-100 placeholder-neutral-500 outline-none transition-all disabled:opacity-50"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    disabled={disabled}
                    placeholder="Valor"
                    aria-label="Valor do novo parâmetro"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    onBlur={handleAddRowBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCommitNewRow();
                      }
                    }}
                    className="w-full bg-transparent hover:bg-neutral-900/60 focus:bg-neutral-900 border border-dashed border-neutral-800/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 rounded px-2.5 py-1 text-xs text-neutral-100 placeholder-neutral-500 outline-none transition-all disabled:opacity-50"
                  />
                </td>
                <td className="px-2 py-1.5 font-sans">
                  <input
                    type="text"
                    disabled={disabled}
                    placeholder="Descrição"
                    aria-label="Descrição do novo parâmetro"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    onBlur={handleAddRowBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCommitNewRow();
                      }
                    }}
                    className="w-full bg-transparent hover:bg-neutral-900/60 focus:bg-neutral-900 border border-dashed border-neutral-800/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 rounded px-2.5 py-1 text-xs text-neutral-300 placeholder-neutral-600 outline-none transition-all disabled:opacity-50"
                  />
                </td>
                <td className="px-2.5 py-1.5 text-center">
                  <button
                    type="button"
                    disabled={disabled || !newKey.trim()}
                    aria-label="Salvar novo parâmetro"
                    onClick={handleCommitNewRow}
                    className="text-neutral-500 hover:text-blue-400 hover:bg-neutral-800 p-1 rounded transition-colors disabled:opacity-20 disabled:hover:text-neutral-500 disabled:hover:bg-transparent"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-start">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (newKey.trim()) {
                handleCommitNewRow();
              } else {
                newKeyInputRef.current?.focus();
              }
            }}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-800/80 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Adicionar Parâmetro</span>
          </button>
        </div>
      </div>
    </div>
  );
}
