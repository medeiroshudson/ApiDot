import React, { useState, useEffect, useRef } from 'react';
import { X, Briefcase, Plus, Loader2, AlertCircle } from 'lucide-react';

export interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export function WorkspaceModal({
  isOpen,
  onClose,
  onSave,
}: WorkspaceModalProps) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalContentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        setName('');
        setError(null);
        setIsSubmitting(false);
        wasOpenRef.current = true;
        previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;

        if (inputRef.current) {
          inputRef.current.focus();
        }

        const timer = setTimeout(() => {
          inputRef.current?.focus();
        }, 50);

        return () => clearTimeout(timer);
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      setName('');
      setError(null);
      setIsSubmitting(false);
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

  // Handle Escape & Tab trapping
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

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0 && trimmedName.length <= 200;
  const isSubmitDisabled = isSubmitting || !isValid;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isSubmitting) return;

    if (!trimmedName) {
      setError('O nome do workspace é obrigatório.');
      return;
    }

    if (trimmedName.length > 200) {
      setError('O nome do workspace não pode exceder 200 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSave(trimmedName);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar workspace.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (error) {
      setError(null);
    }
  };

  return (
    <div
      data-testid="workspace-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        ref={modalContentRef}
        data-testid="workspace-modal-content"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Briefcase className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="workspace-modal-title"
                className="text-sm font-semibold text-neutral-100"
              >
                Novo Workspace
              </h2>
              <p className="text-xs text-neutral-400">
                Crie um espaço de trabalho para organizar suas coleções e requisições
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fechar"
            className="text-neutral-400 hover:text-neutral-200 p-1 rounded-md hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="workspace-name-input"
              className="text-xs font-medium text-neutral-300"
            >
              Nome do Workspace
            </label>
            <input
              ref={inputRef}
              autoFocus
              id="workspace-name-input"
              type="text"
              value={name}
              onChange={handleInputChange}
              disabled={isSubmitting}
              maxLength={200}
              placeholder="Ex: Minha API, Pagamentos, etc."
              aria-label="Nome do Workspace"
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition-colors disabled:opacity-50"
            />
            <div className="flex justify-between items-center text-[11px] text-neutral-400">
              <span>Máximo de 200 caracteres</span>
              <span className={trimmedName.length > 200 ? 'text-rose-400' : ''}>
                {name.length}/200
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-2 text-xs font-medium text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Criando...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Criar Workspace</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
