import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Link,
  PlusCircle,
  Edit3,
  Trash2,
  ShieldCheck,
} from 'lucide-react';

export interface SyncReport {
  addedRequests: number;
  updatedRequests: number;
  fieldsAdded: number;
  fieldsRemoved: number;
  fieldsPreserved: number;
}

export interface CollectionItem {
  id: string;
  name: string;
  openApiSpecUrl?: string | null;
  openApiSpecContent?: string | null;
}

export interface CollectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection?: CollectionItem | null;
  onSync?: (data: { specUrl?: string; specContent?: string }) => Promise<SyncReport>;
  onSave?: (data: { specUrl?: string; specContent?: string }) => Promise<void> | void;
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

export function CollectionSettingsModal({
  isOpen,
  onClose,
  collection,
  onSync,
  onSave,
  onSyncSuccess,
}: CollectionSettingsModalProps) {
  const [specUrl, setSpecUrl] = useState('');
  const [specContent, setSpecContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const isBusy = isLoading || isSaving;

  useEffect(() => {
    if (isOpen && collection) {
      setSpecUrl(collection.openApiSpecUrl || '');
      setSpecContent(collection.openApiSpecContent || '');
      setError(null);
      setReport(null);
    }
  }, [isOpen, collection]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;
      const focusTarget = urlInputRef.current || closeButtonRef.current;
      if (focusTarget) {
        focusTarget.focus();
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (wasOpenRef.current && previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, []);

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
          if (document.activeElement === lastElement || !modalContentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isBusy]);

  if (!isOpen) return null;

  const handleSync = async () => {
    const trimmedUrl = specUrl.trim();
    const trimmedContent = specContent.trim();

    if (!trimmedUrl && !trimmedContent) {
      setError('Informe uma URL ou o conteúdo da especificação OpenAPI.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setReport(null);

    try {
      let syncResult: SyncReport;
      const payload = {
        specUrl: trimmedUrl || undefined,
        specContent: trimmedContent || undefined,
      };

      if (onSync) {
        syncResult = await onSync(payload);
      } else if (collection?.id) {
        const res = await fetch(`/api/collections/${collection.id}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let errDetail = 'Falha na sincronização da coleção.';
          try {
            const json = await res.json();
            errDetail = json.detail || json.title || errDetail;
          } catch {
            const text = await res.text();
            if (text) errDetail = text;
          }
          throw new Error(errDetail);
        }

        const json = await res.json();
        syncResult = json as SyncReport;
      } else {
        throw new Error('Nenhuma coleção selecionada para sincronização.');
      }

      setReport(syncResult);
      onSyncSuccess?.(syncResult);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro inesperado ao sincronizar coleção.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveOnly = async () => {
    if (!onSave) return;
    const trimmedUrl = specUrl.trim();
    const trimmedContent = specContent.trim();

    if (!trimmedUrl && !trimmedContent) {
      setError('Informe uma URL ou o conteúdo da especificação OpenAPI.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        specUrl: trimmedUrl || undefined,
        specContent: trimmedContent || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar configurações da coleção.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      data-testid="collection-settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          onClose();
        }
      }}
    >
      <div
        ref={modalContentRef}
        data-testid="collection-settings-modal-content"
        className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="collection-settings-modal-title"
                className="text-base font-semibold text-neutral-100"
              >
                Configurações da Coleção & Sincronização
              </h2>
              {collection?.name && (
                <p className="text-xs text-neutral-400 mt-0.5">
                  Coleção: <span className="text-neutral-200 font-medium">{collection.name}</span>
                </p>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar modal"
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto max-h-[70vh]">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Audit Report Banner */}
          {report && (
            <div
              data-testid="sync-report-card"
              className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-4 space-y-3"
            >
              <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Sincronização concluída com sucesso!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {STAT_CONFIGS.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.key}
                      className={`bg-neutral-900/80 border border-neutral-800 rounded p-2.5 ${stat.className || ''}`}
                    >
                      <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${stat.color}`} />
                        <span>{stat.label}</span>
                      </div>
                      <span className="text-lg font-bold text-white">{stat.getValue(report)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="openapi-spec-url"
                className="flex items-center gap-1.5 text-xs font-medium text-neutral-300 mb-1.5"
              >
                <Link className="w-3.5 h-3.5 text-neutral-400" />
                <span>URL da Especificação OpenAPI (v3.x JSON/YAML)</span>
              </label>
              <input
                ref={urlInputRef}
                id="openapi-spec-url"
                type="url"
                value={specUrl}
                onChange={(e) => setSpecUrl(e.target.value)}
                disabled={isBusy}
                placeholder="https://api.example.com/openapi.json"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                A URL remota é consultada para buscar novas versões e atualizar endpoints automaticamente.
              </p>
            </div>

            <div>
              <label
                htmlFor="openapi-spec-content"
                className="flex items-center gap-1.5 text-xs font-medium text-neutral-300 mb-1.5"
              >
                <FileCode className="w-3.5 h-3.5 text-neutral-400" />
                <span>Conteúdo da Especificação (JSON / YAML)</span>
              </label>
              <textarea
                id="openapi-spec-content"
                rows={8}
                value={specContent}
                onChange={(e) => setSpecContent(e.target.value)}
                disabled={isBusy}
                placeholder="Cole aqui a definição OpenAPI v3.x em JSON ou YAML..."
                className="w-full font-mono text-xs px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50 resize-y"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Utilizado se a URL remota não for informada ou para especificações estáticas locais.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800 bg-neutral-900/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {onSave && (
              <button
                type="button"
                onClick={handleSaveOnly}
                disabled={isBusy}
                className="px-3.5 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? 'Salvando...' : 'Salvar Especificação'}
              </button>
            )}

            <button
              type="button"
              onClick={handleSync}
              disabled={isBusy}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm shadow-blue-500/20"
            >
              {isLoading ? (
                <>
                  <Loader2
                    data-testid="sync-loading-spinner"
                    className="w-3.5 h-3.5 animate-spin"
                  />
                  <span>Sincronizando...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronizar Coleção</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
