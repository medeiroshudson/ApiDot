'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Sliders,
  Link2,
  Copy,
  Check,
  PlusCircle,
  Edit3,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { ExecutionTarget, TargetSelector } from '../request/TargetSelector';
import { CollectionNodeDto, FolderNodeDto, RequestItemNodeDto } from '@/lib/treeApi';
import { CodeEditor } from '../common/CodeEditor';

export interface SyncReport {
  addedRequests: number;
  updatedRequests: number;
  fieldsAdded: number;
  fieldsRemoved: number;
  fieldsPreserved: number;
}

export type CollectionModalTab = 'general' | 'openapi' | 'dependencies';

export interface CollectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection?: CollectionNodeDto | null;
  isAgentOnline?: boolean;
  onSync?: (data: { specUrl?: string; specContent?: string }) => Promise<SyncReport>;
  onSave?: (data: {
    name?: string;
    defaultTarget?: ExecutionTarget;
    specUrl?: string;
    specContent?: string;
  }) => Promise<void> | void;
  onSyncSuccess?: (report: SyncReport) => void;
}

interface StatCardConfig {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  className?: string;
  getValue: (report: SyncReport) => number;
}

const STAT_CONFIGS: StatCardConfig[] = [
  {
    key: 'addedRequests',
    label: 'Requisições Adicionadas',
    icon: PlusCircle,
    color: 'text-emerald-400',
    getValue: (r) => r.addedRequests,
  },
  {
    key: 'updatedRequests',
    label: 'Requisições Atualizadas',
    icon: Edit3,
    color: 'text-blue-400',
    getValue: (r) => r.updatedRequests,
  },
  {
    key: 'fieldsAdded',
    label: 'Campos Adicionados',
    icon: PlusCircle,
    color: 'text-teal-400',
    getValue: (r) => r.fieldsAdded,
  },
  {
    key: 'fieldsRemoved',
    label: 'Campos Removidos',
    icon: Trash2,
    color: 'text-rose-400',
    getValue: (r) => r.fieldsRemoved,
  },
  {
    key: 'fieldsPreserved',
    label: 'Campos Preservados',
    icon: ShieldCheck,
    color: 'text-amber-400',
    className: 'col-span-2 sm:col-span-1',
    getValue: (r) => r.fieldsPreserved,
  },
];

interface ChainedDependency {
  requestId: string;
  requestName: string;
  token: string;
  location: string;
}

function extractDependenciesFromCollection(col?: CollectionNodeDto | null): ChainedDependency[] {
  if (!col) return [];
  const results: ChainedDependency[] = [];

  const inspectRequest = (req: RequestItemNodeDto) => {
    const regex = /\{\{\$request\[["']([^"']+)["']\]\.([^}]+)\}\}/g;
    const checkText = (text: string | null | undefined, loc: string) => {
      if (!text) return;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        results.push({
          requestId: req.id,
          requestName: req.name,
          token: match[0],
          location: loc,
        });
      }
    };

    checkText(req.url, 'URL');
    checkText(req.headersJson, 'Headers');
    checkText(req.bodyContent, 'Body');
  };

  const walkFolders = (folders: FolderNodeDto[]) => {
    for (const f of folders) {
      f.requests?.forEach(inspectRequest);
      if (f.subFolders) walkFolders(f.subFolders);
    }
  };

  col.requests?.forEach(inspectRequest);
  if (col.folders) walkFolders(col.folders);

  return results;
}

export function CollectionSettingsModal({
  isOpen,
  onClose,
  collection,
  isAgentOnline = false,
  onSync,
  onSave,
  onSyncSuccess,
}: CollectionSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<CollectionModalTab>('general');
  const [name, setName] = useState('');
  const [defaultTarget, setDefaultTarget] = useState<ExecutionTarget>('Inherit');
  const [specUrl, setSpecUrl] = useState('');
  const [specContent, setSpecContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const isBusy = isLoading || isSaving;

  // Extract chained tokens from current collection
  const dependencies = useMemo(() => {
    return extractDependenciesFromCollection(collection);
  }, [collection]);

  useEffect(() => {
    if (isOpen && collection) {
      setName(collection.name || '');
      setDefaultTarget(collection.defaultTarget || 'Inherit');
      setSpecUrl(collection.openApiSpecUrl || '');
      setSpecContent((collection as { openApiSpecContent?: string | null })?.openApiSpecContent || '');
      setError(null);
      setReport(null);
      setActiveTab('general');
    }
  }, [isOpen, collection]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!modalContentRef.current) return;
        const focusableElements = Array.from(
          modalContentRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !modalContentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isBusy, onClose]);

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleSyncClick = async () => {
    if (!collection) return;
    const trimmedUrl = specUrl.trim();
    const trimmedContent = specContent.trim();

    if (!trimmedUrl && !trimmedContent) {
      setError('Forneça a URL ou o conteúdo da especificação OpenAPI.');
      return;
    }

    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      setError('A URL da especificação deve ser um endereço HTTP ou HTTPS válido.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      let syncResult: SyncReport;
      if (onSync) {
        syncResult = await onSync({
          specUrl: trimmedUrl || undefined,
          specContent: trimmedContent || undefined,
        });
      } else {
        const res = await fetch(`/api/collections/${collection.id}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            specUrl: trimmedUrl || undefined,
            specContent: trimmedContent || undefined,
          }),
        });

        if (!res.ok) {
          let errDetail = 'Falha ao sincronizar a especificação OpenAPI.';
          try {
            const json = await res.json();
            errDetail = json.detail || json.title || json.message || errDetail;
          } catch {
            const text = await res.text();
            if (text) errDetail = text;
          }
          throw new Error(errDetail);
        }

        syncResult = await res.json();
      }

      setReport(syncResult);
      onSyncSuccess?.(syncResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado na sincronização.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveClick = async () => {
    if (!collection) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave?.({
        name: name.trim() || collection.name,
        defaultTarget,
        specUrl: specUrl.trim() || undefined,
        specContent: specContent.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar configurações.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !collection) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div
        ref={modalContentRef}
        className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden text-neutral-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Sliders className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="collection-settings-title" className="text-sm font-semibold text-white">
                Configurações da Coleção
              </h2>
              <span className="text-[11px] text-neutral-400 truncate max-w-xs block">
                {collection.name}
              </span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar configurações da coleção"
            onClick={onClose}
            disabled={isBusy}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Tabs Bar */}
        <div
          role="tablist"
          aria-label="Abas de configuração da coleção"
          className="flex border-b border-neutral-800 bg-neutral-950/30 px-5 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'general'}
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'general'
                ? 'border-blue-500 text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Geral & Alvo</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'openapi'}
            onClick={() => setActiveTab('openapi')}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'openapi'
                ? 'border-blue-500 text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>OpenAPI / Sync</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'dependencies'}
            onClick={() => setActiveTab('dependencies')}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'dependencies'
                ? 'border-blue-500 text-white font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Vínculos & Dependências</span>
            {dependencies.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                {dependencies.length}
              </span>
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" aria-hidden="true" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* TAB 1: GERAL & ALVO */}
          {activeTab === 'general' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <div className="space-y-1.5">
                <label htmlFor="collection-name-input" className="text-xs font-medium text-neutral-300 block">
                  Nome da Coleção:
                </label>
                <input
                  id="collection-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isBusy}
                  placeholder="Nome da coleção"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-neutral-800/80">
                <label className="text-xs font-medium text-neutral-300 block">
                  Alvo de Execução Padrão:
                </label>
                <p className="text-[11px] text-neutral-400 mb-2">
                  Define onde as requisições desta coleção são executadas por padrão (na nuvem ou no seu Agent local).
                </p>
                <TargetSelector
                  value={defaultTarget}
                  onChange={setDefaultTarget}
                  isAgentOnline={isAgentOnline}
                  disabled={isBusy}
                  className="w-full sm:w-64"
                />
              </div>
            </div>
          )}

          {/* TAB 2: OPENAPI / SYNC */}
          {activeTab === 'openapi' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <div className="space-y-1.5">
                <label htmlFor="openapi-spec-url" className="text-xs font-medium text-neutral-300 block">
                  URL da Especificação OpenAPI (JSON ou YAML):
                </label>
                <input
                  id="openapi-spec-url"
                  type="url"
                  placeholder="https://api.exemplo.com/swagger/v1/swagger.json"
                  value={specUrl}
                  disabled={isBusy}
                  onChange={(e) => {
                    setSpecUrl(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-300 block">
                  Conteúdo da Especificação OpenAPI (JSON / YAML direto):
                </label>
                <CodeEditor
                  value={specContent}
                  onChange={(val) => {
                    setSpecContent(val);
                    if (error) setError(null);
                  }}
                  language="json"
                  placeholder="Cole aqui a especificação OpenAPI (JSON ou YAML)..."
                  ariaLabel="Conteúdo da Especificação OpenAPI"
                  testId="openapi-code-editor"
                  minHeight="140px"
                  maxHeight="240px"
                  disabled={isBusy}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleSyncClick}
                  disabled={isBusy || (!specUrl.trim() && !specContent.trim())}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Sincronizando...' : 'Sincronizar Coleção'}</span>
                </button>
              </div>

              {report && (
                <div data-testid="sync-report-section" className="pt-3 border-t border-neutral-800 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Relatório de Sincronização Não-Destrutiva</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {STAT_CONFIGS.map((c) => {
                      const Icon = c.icon;
                      return (
                        <div key={c.key} className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${c.color} shrink-0`} />
                          <div>
                            <span className="text-[10px] text-neutral-400 block">{c.label}</span>
                            <span className="text-xs font-bold text-white font-mono">{c.getValue(report)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VÍNCULOS & DEPENDÊNCIAS */}
          {activeTab === 'dependencies' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <p className="text-xs text-neutral-400">
                Visualização de requisições que utilizam tokens encadeados de respostas anteriores nesta coleção.
              </p>

              {dependencies.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-neutral-800 rounded-lg bg-neutral-950/40">
                  <Link2 className="w-6 h-6 text-neutral-600 mx-auto mb-2" />
                  <h4 className="text-xs font-medium text-neutral-300 mb-1">
                    Nenhum vínculo encadeado nesta coleção
                  </h4>
                  <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
                    Para encadear respostas entre requisições, digite <code className="text-blue-400 bg-neutral-900 px-1 py-0.5 rounded">{'{{$request['}</code> no URL, Headers ou Body de qualquer requisição.
                  </p>
                </div>
              ) : (
                <div className="border border-neutral-800 rounded-lg overflow-hidden divide-y divide-neutral-800 bg-neutral-950/60">
                  {dependencies.map((dep, idx) => (
                    <div key={`${dep.requestId}-${idx}`} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{dep.requestName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                            {dep.location}
                          </span>
                        </div>
                        <code className="text-[11px] text-blue-300 font-mono mt-0.5 block truncate max-w-md">
                          {dep.token}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyToken(dep.token)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors shrink-0"
                      >
                        {copiedToken === dep.token ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Unified Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t border-neutral-800 bg-neutral-950/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
