'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Terminal,
  Loader2,
  AlertCircle,
  Folder,
} from 'lucide-react';
import { parseCurl, ParsedCurlRequest } from '@/lib/curl/curlParser';
import { METHOD_COLORS } from './RequestAutocomplete';
import { useTranslation } from '@/hooks/useTranslation';

export interface CurlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName?: string;
  onImport: (parsed: ParsedCurlRequest, requestName: string) => Promise<void> | void;
}

export function CurlImportModal({
  isOpen,
  onClose,
  targetName,
  onImport,
}: CurlImportModalProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [curlInput, setCurlInput] = useState('');
  const [parsedRequest, setParsedRequest] = useState<ParsedCurlRequest | null>(null);
  const [name, setName] = useState('');
  const [hasUserEditedName, setHasUserEditedName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modalContentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // Manage focus and reset state on open/close
  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        setCurlInput('');
        setParsedRequest(null);
        setName('');
        setHasUserEditedName(false);
        setError(null);
        setIsSubmitting(false);

        wasOpenRef.current = true;
        previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;

        if (textareaRef.current) {
          textareaRef.current.focus();
        }

        const timer = setTimeout(() => {
          textareaRef.current?.focus();
        }, 50);

        return () => clearTimeout(timer);
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      setCurlInput('');
      setParsedRequest(null);
      setName('');
      setHasUserEditedName(false);
      setError(null);
      setIsSubmitting(false);

      if (
        previousActiveElementRef.current &&
        document.contains(previousActiveElementRef.current) &&
        typeof previousActiveElementRef.current.focus === 'function'
      ) {
        previousActiveElementRef.current.focus();
      }
    }
  }, [isOpen]);

  // Restore focus on unmount
  useEffect(() => {
    return () => {
      if (
        wasOpenRef.current &&
        previousActiveElementRef.current &&
        document.contains(previousActiveElementRef.current) &&
        typeof previousActiveElementRef.current.focus === 'function'
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, []);

  // Keyboard accessibility: Escape key and Tab focus trap
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
        ).filter(
          (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !modalContentRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !modalContentRef.current.contains(document.activeElement)
          ) {
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

  const handleCurlInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setCurlInput(value);

    if (!value.trim()) {
      setParsedRequest(null);
      setError(null);
      if (!hasUserEditedName) {
        setName('');
      }
      return;
    }

    const result = parseCurl(value);
    if (result.success && result.request) {
      setParsedRequest(result.request);
      setError(null);
      if (!hasUserEditedName) {
        setName(result.request.name);
      }
    } else {
      setParsedRequest(null);
      let errorMsg = result.error || t('curlImport.invalidCommand');
      if (result.error) {
        if (/começar com "curl"|start with.*curl/i.test(result.error)) {
          errorMsg = t('curlImport.mustStartWithCurl');
        } else if (/url/i.test(result.error)) {
          errorMsg = t('curlImport.noUrlFound');
        }
      }
      setError(errorMsg);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setHasUserEditedName(true);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isSubmitting) return;

    if (!parsedRequest) {
      if (!curlInput.trim()) {
        setError(t('curlImport.emptyCommand'));
      }
      return;
    }

    const finalName = name.trim() || parsedRequest.name || t('curlImport.defaultRequestName');

    setIsSubmitting(true);
    setError(null);

    try {
      await onImport(parsedRequest, finalName);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t('curlImport.importFailed');
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerCount = parsedRequest ? Object.keys(parsedRequest.headers).length : 0;
  const method = parsedRequest?.method.toUpperCase() || 'GET';
  const methodColorClasses =
    METHOD_COLORS[method] || 'text-neutral-400 bg-neutral-900 border-neutral-700';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="curl-import-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        ref={modalContentRef}
        data-testid="curl-import-modal-content"
        className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Terminal className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="curl-import-modal-title"
                className="text-sm font-semibold text-neutral-100"
              >
                {t('curlImport.title')}
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                {t('curlImport.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={t('curlImport.closeAria')}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Destination if provided */}
        {targetName && (
          <div className="px-5 pt-3 pb-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-950/60 border border-neutral-800/80 text-xs text-neutral-400">
              <Folder className="w-3.5 h-3.5 text-neutral-400 shrink-0" aria-hidden="true" />
              <span className="text-neutral-400">{t('curlImport.destinationLabel')}</span>
              <span className="text-neutral-200 font-medium">{targetName}</span>
            </div>
          </div>
        )}

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* cURL Command Textarea */}
          <div className="space-y-1.5">
            <label
              htmlFor="curl-command-input"
              className="block text-xs font-medium text-neutral-300"
            >
              {t('curlImport.curlCommandLabel')}
            </label>
            <textarea
              id="curl-command-input"
              ref={textareaRef}
              value={curlInput}
              onChange={handleCurlInputChange}
              placeholder={t('curlImport.curlPlaceholder')}
              className="w-full h-36 px-3 py-2 text-xs font-mono bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition-colors resize-none"
              spellCheck={false}
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          {/* Validation Error Alert */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs animate-in fade-in duration-100"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Live Preview Card */}
          {parsedRequest && (
            <div
              data-testid="curl-preview-card"
              className="p-3 rounded-lg bg-neutral-950/80 border border-neutral-800 space-y-2 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-400">{t('curlImport.previewTitle')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400 text-xs">
                    {headerCount === 1 ? t('curlImport.headersCount', { count: headerCount }) : t('curlImport.headersCountPlural', { count: headerCount })}
                  </span>
                  {parsedRequest.bodyType !== 'None' && (
                    <span
                      data-testid="curl-preview-body-badge"
                      className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-neutral-800 text-neutral-300 border border-neutral-700"
                    >
                      {parsedRequest.bodyType === 'Json' ? 'JSON' : 'Body'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-hidden">
                <span
                  data-testid="curl-preview-method"
                  className={`px-2 py-0.5 text-xs font-semibold rounded border uppercase tracking-wider shrink-0 ${methodColorClasses}`}
                >
                  {method}
                </span>
                <span
                  className="font-mono text-xs text-neutral-200 truncate"
                  title={parsedRequest.url}
                >
                  {parsedRequest.url}
                </span>
              </div>
            </div>
          )}

          {/* Request Name Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="curl-request-name"
              className="block text-xs font-medium text-neutral-300"
            >
              {t('curlImport.requestNameLabel')}
            </label>
            <input
              id="curl-request-name"
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder={t('curlImport.requestNamePlaceholder')}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition-colors disabled:opacity-50"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {t('curlImport.cancel')}
            </button>
            <button
              type="submit"
              disabled={!parsedRequest || isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    data-testid="curl-import-loading-spinner"
                    className="w-3.5 h-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  <span>{t('curlImport.submitting')}</span>
                </>
              ) : (
                <span>{t('curlImport.submit')}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
