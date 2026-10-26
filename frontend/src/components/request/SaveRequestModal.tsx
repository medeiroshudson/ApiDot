import React, { useState, useEffect, useRef } from 'react';
import { X, Bookmark, Loader2, AlertCircle } from 'lucide-react';

export interface FolderOption {
  id: string;
  name: string;
}

export interface CollectionOption {
  id: string;
  name: string;
  folders?: FolderOption[];
}

export interface SaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: CollectionOption[];
  defaultName?: string;
  onSave: (name: string, collectionId: string, folderId?: string) => Promise<void> | void;
}

export function SaveRequestModal({
  isOpen,
  onClose,
  collections,
  defaultName,
  onSave,
}: SaveRequestModalProps) {
  const [name, setName] = useState(defaultName ?? 'Nova Requisição');
  const [selectedCollectionId, setSelectedCollectionId] = useState(collections[0]?.id || '');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const modalContentRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        setName(defaultName !== undefined ? defaultName : 'Nova Requisição');
        setSelectedCollectionId(collections[0]?.id || '');
        setSelectedFolderId('');
        setError(null);
        setNameError(null);
        setIsSubmitting(false);

        wasOpenRef.current = true;
        previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;

        const timer = setTimeout(() => {
          if (nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
          }
        }, 50);

        return () => clearTimeout(timer);
      } else if (!selectedCollectionId && collections.length > 0) {
        setSelectedCollectionId(collections[0].id);
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    }
  }, [isOpen, defaultName, collections, selectedCollectionId]);

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
      if (e.key === 'Escape' && !isSubmitting) {
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
  }, [isOpen, onClose, isSubmitting]);

  if (!isOpen) return null;

  const activeCollection = collections.find((c) => c.id === selectedCollectionId);
  const availableFolders = activeCollection?.folders || [];

  const handleCollectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCollectionId(e.target.value);
    setSelectedFolderId('');
    setError(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isSubmitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('O nome da requisição é obrigatório.');
      return;
    }

    if (trimmedName.length > 200) {
      setNameError('O nome da requisição não pode exceder 200 caracteres.');
      return;
    }

    if (!selectedCollectionId) {
      setError('Selecione uma coleção de destino.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNameError(null);

    try {
      await onSave(trimmedName, selectedCollectionId, selectedFolderId || undefined);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar a requisição.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="save-request-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-request-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        ref={modalContentRef}
        data-testid="save-request-modal-content"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Bookmark className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="save-request-modal-title"
                className="text-sm font-semibold text-neutral-100"
              >
                Salvar Requisição
              </h2>
              <p className="text-xs text-neutral-400">
                Escolha a coleção e a pasta onde deseja salvar.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar modal"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Request Name Field */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="save-request-name-input"
              className="text-xs text-neutral-400 font-medium"
            >
              Nome da Requisição <span className="text-rose-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="save-request-name-input"
              type="text"
              aria-label="Nome da requisição"
              aria-required="true"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'save-request-name-error' : undefined}
              value={name}
              disabled={isSubmitting}
              placeholder="Ex: Listar Usuários"
              onChange={(e) => {
                setName(e.target.value);
                if (nameError && e.target.value.trim()) {
                  setNameError(null);
                }
              }}
              className={`h-10 px-3 text-sm bg-neutral-950 border rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                nameError
                  ? 'border-rose-500 focus:ring-rose-500/40'
                  : 'border-neutral-800 focus:border-blue-500 focus:ring-blue-500/30'
              }`}
            />
            {nameError && (
              <span
                id="save-request-name-error"
                role="alert"
                className="text-xs text-rose-400 font-medium"
              >
                {nameError}
              </span>
            )}
          </div>

          {/* Collection Select Field */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="save-request-collection-select"
              className="text-xs text-neutral-400 font-medium"
            >
              Coleção de Destino <span className="text-rose-400">*</span>
            </label>
            <select
              id="save-request-collection-select"
              aria-label="Coleção de destino"
              aria-required="true"
              value={selectedCollectionId}
              disabled={isSubmitting || collections.length === 0}
              onChange={handleCollectionChange}
              className="h-10 px-3 text-sm bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {collections.length === 0 ? (
                <option value="">Nenhuma coleção disponível</option>
              ) : (
                collections.map((col) => (
                  <option key={col.id} value={col.id} className="bg-neutral-900 text-neutral-100">
                    {col.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Folder Select Field */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="save-request-folder-select"
              className="text-xs text-neutral-400 font-medium"
            >
              Pasta (Opcional)
            </label>
            <select
              id="save-request-folder-select"
              aria-label="Pasta de destino"
              value={selectedFolderId}
              disabled={isSubmitting || collections.length === 0}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="h-10 px-3 text-sm bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <option value="" className="bg-neutral-900 text-neutral-300">
                (Nenhuma pasta - Raiz da coleção)
              </option>
              {availableFolders.map((folder) => (
                <option key={folder.id} value={folder.id} className="bg-neutral-900 text-neutral-100">
                  📁 {folder.name}
                </option>
              ))}
            </select>
          </div>

          {/* Form Error Notice */}
          {error && (
            <div
              role="alert"
              className="text-xs text-rose-400 bg-rose-950/60 border border-rose-900/80 px-3 py-2.5 rounded-lg flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-800 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium transition-colors border border-neutral-700/60 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-neutral-500 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || collections.length === 0}
              className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-950/40 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Salvar</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
