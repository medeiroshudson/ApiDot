'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Loader2,
  AlertCircle,
  FileCode,
  Link,
  Sparkles,
} from 'lucide-react';
import {
  CollectionNodeDto,
  importOpenApiCollection,
  ImportOpenApiCollectionRequest,
} from '@/lib/treeApi';
import { useTranslation } from '@/hooks/useTranslation';

export interface OpenApiImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onImport?: (data: ImportOpenApiCollectionRequest) => Promise<CollectionNodeDto> | Promise<void> | void;
  onImportSuccess?: (collection: CollectionNodeDto) => void;
}

export type ImportTabMode = 'url' | 'raw';

function formatSuggestion(raw: string): string {
  const words = raw.split(/[-_]+/).filter(Boolean);
  if (words.length > 0) {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function parseTitleSuggestionFromUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url.trim());
    const pathSegments = parsed.pathname.split('/').filter(Boolean);

    // Check path segments from right to left
    for (let i = pathSegments.length - 1; i >= 0; i--) {
      const seg = pathSegments[i].replace(/\.(json|yaml|yml)$/i, '');
      if (seg && !/^(v\d+|openapi|swagger|api|spec|v\d+\.\d+)$/i.test(seg)) {
        return formatSuggestion(seg);
      }
    }

    // Check hostname
    const hostParts = parsed.hostname.split('.');
    for (const part of hostParts) {
      if (
        part &&
        !['www', 'api', 'dev', 'staging', 'swagger', 'io', 'com', 'net', 'org', 'app'].includes(
          part.toLowerCase()
        )
      ) {
        return formatSuggestion(part);
      }
    }
  } catch {
    // invalid URL format
  }
  return '';
}

export function parseTitleSuggestionFromContent(content: string): string {
  if (!content || typeof content !== 'string') return '';
  // Match "title": "..." in JSON
  const jsonMatch = /"title"\s*:\s*["']([^"'\r\n]+)["']/i.exec(content);
  if (jsonMatch && jsonMatch[1].trim()) {
    return jsonMatch[1].trim();
  }
  // Match title: ... in YAML
  const yamlMatch = /(?:^|\n)\s*title:\s*["']?([^"'\r\n#]+)["']?/i.exec(content);
  if (yamlMatch && yamlMatch[1].trim()) {
    return yamlMatch[1].trim();
  }
  return '';
}

export function OpenApiImportModal({
  isOpen,
  onClose,
  workspaceId,
  onImport,
  onImportSuccess,
}: OpenApiImportModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ImportTabMode>('url');
  const [url, setUrl] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [name, setName] = useState('');
  const [suggestedName, setSuggestedName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLInputElement | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab('url');
      setUrl('');
      setRawContent('');
      setName('');
      setSuggestedName('');
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  // Focus trap / keyboard ESC handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  // Auto-focus the active input on open
  useEffect(() => {
    if (isOpen && initialFocusRef.current) {
      initialFocusRef.current.focus();
    }
  }, [isOpen, activeTab]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrl(val);
    setError(null);

    const suggestion = parseTitleSuggestionFromUrl(val);
    setSuggestedName(suggestion);
  };

  const handleRawContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawContent(val);
    setError(null);

    const suggestion = parseTitleSuggestionFromContent(val);
    setSuggestedName(suggestion);
  };

  const handleTabChange = (tab: ImportTabMode) => {
    setActiveTab(tab);
    setError(null);
    if (tab === 'url') {
      setSuggestedName(parseTitleSuggestionFromUrl(url));
    } else {
      setSuggestedName(parseTitleSuggestionFromContent(rawContent));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (activeTab === 'url') {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        setError(t('openApiImport.urlRequired'));
        return;
      }
      if (!/^https?:\/\//i.test(trimmedUrl)) {
        setError(t('openApiImport.invalidHttpUrl'));
        return;
      }
    } else {
      const trimmedContent = rawContent.trim();
      if (!trimmedContent) {
        setError(t('openApiImport.contentRequired'));
        return;
      }
    }

    setIsLoading(true);
    try {
      const payload: ImportOpenApiCollectionRequest = {
        workspaceId,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(activeTab === 'url' ? { specUrl: url.trim() } : { specContent: rawContent.trim() }),
      };

      let importedCol: CollectionNodeDto | undefined;

      if (onImport) {
        const res = await onImport(payload);
        if (res && typeof res === 'object' && 'id' in res) {
          importedCol = res as CollectionNodeDto;
        }
      } else {
        importedCol = await importOpenApiCollection(payload);
      }

      if (importedCol && onImportSuccess) {
        onImportSuccess(importedCol);
      }

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('openApiImport.importFailed');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const namePlaceholder = suggestedName
    ? t('openApiImport.namePlaceholderSuggested', { name: suggestedName })
    : t('openApiImport.namePlaceholderDefault');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="openapi-import-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden text-zinc-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Download className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="openapi-import-modal-title" className="text-sm font-semibold text-white">
                {t('openApiImport.title')}
              </h2>
              <span className="text-[11px] text-zinc-400">
                {t('openApiImport.subtitle')}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label={t('openApiImport.closeAria')}
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div
          role="tablist"
          aria-label={t('openApiImport.importModeAria')}
          className="flex border-b border-zinc-800 bg-zinc-950/30 px-5 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'url'}
            onClick={() => handleTabChange('url')}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'url'
                ? 'border-purple-500 text-white font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>{t('openApiImport.urlTab')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'raw'}
            onClick={() => handleTabChange('raw')}
            className={`flex items-center gap-2 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'raw'
                ? 'border-purple-500 text-white font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{t('openApiImport.rawTab')}</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">
            {/* Error Alert */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Spec Source Input (URL or Raw Textarea) */}
            {activeTab === 'url' ? (
              <div>
                <label
                  htmlFor="openapi-spec-url"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  {t('openApiImport.specUrlLabel')}
                </label>
                <div className="relative">
                  <input
                    ref={initialFocusRef}
                    id="openapi-spec-url"
                    type="url"
                    value={url}
                    onChange={handleUrlChange}
                    disabled={isLoading}
                    placeholder={t('openApiImport.specUrlPlaceholder')}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {t('openApiImport.specUrlHelp')}
                </p>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="openapi-spec-content"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  {t('openApiImport.rawContentLabel')}
                </label>
                <textarea
                  id="openapi-spec-content"
                  rows={8}
                  value={rawContent}
                  onChange={handleRawContentChange}
                  disabled={isLoading}
                  placeholder={`{\n  "openapi": "3.0.0",\n  "info": { "title": "Minha API", "version": "1.0" },\n  "paths": {}\n}`}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50 resize-y"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  {t('openApiImport.rawContentHelp')}
                </p>
              </div>
            )}

            {/* Collection Name Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="openapi-collection-name"
                  className="block text-xs font-medium text-zinc-300"
                >
                  {t('openApiImport.collectionNameLabel')}
                </label>
                {suggestedName && !name && (
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    {t('openApiImport.suggestionReady')}
                  </span>
                )}
              </div>
              <input
                id="openapi-collection-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                placeholder={namePlaceholder}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
              />
              {suggestedName && !name && (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-zinc-400">
                  <span>{t('openApiImport.suggestionLabel')}</span>
                  <button
                    type="button"
                    onClick={() => setName(suggestedName)}
                    className="text-purple-400 hover:text-purple-300 font-medium underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    {suggestedName}
                  </button>
                </div>
              )}
              <p className="text-[11px] text-zinc-500 mt-1">
                {t('openApiImport.nameHint')}
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {t('openApiImport.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none shadow-sm cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('openApiImport.importing')}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('openApiImport.submit')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
