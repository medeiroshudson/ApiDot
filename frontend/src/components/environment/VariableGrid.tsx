import React, { useState } from 'react';
import { Eye, EyeOff, Trash2, Plus, Sparkles, Code, Table, Lock, Unlock } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export interface VariableItem {
  id?: string;
  key: string;
  value: string;
  isActive?: boolean;
  isSecret?: boolean;
}

export interface VariableGridProps {
  variables: VariableItem[];
  onChange: (variables: VariableItem[]) => void;
  title?: string;
  description?: string;
  isReadOnly?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function parseJsonToVariableItems(parsed: unknown): VariableItem[] | null {
  if (parsed === null || typeof parsed !== 'object') {
    return null;
  }

  if (Array.isArray(parsed)) {
    return parsed.map((item, idx) => {
      if (item && typeof item === 'object') {
        const itemObj = item as Record<string, unknown>;
        return {
          id: itemObj.id ? String(itemObj.id) : undefined,
          key: itemObj.key !== undefined && itemObj.key !== null ? String(itemObj.key) : '',
          value: itemObj.value !== undefined && itemObj.value !== null ? String(itemObj.value) : '',
          isActive: itemObj.isActive !== false,
          isSecret: !!itemObj.isSecret,
        };
      }
      return {
        key: String(idx),
        value: String(item ?? ''),
        isActive: true,
        isSecret: false,
      };
    });
  }

  // parsed is an object (record of key-values)
  return Object.entries(parsed as Record<string, unknown>).map(([k, v]) => ({
    key: k,
    value: typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''),
    isActive: true,
    isSecret: false,
  }));
}

export function VariableGrid({
  variables,
  onChange,
  title,
  description,
  isReadOnly = false,
  emptyMessage,
  className = '',
}: VariableGridProps) {
  const { t } = useTranslation();
  const effectiveEmptyMessage = emptyMessage ?? t('environments.noVariables');
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  const handleToggleBulkMode = () => {
    if (!isBulkMode) {
      // Switching to bulk JSON mode
      const serialized = JSON.stringify(
        variables.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          key: v.key,
          value: v.value,
          isActive: v.isActive !== false,
          isSecret: !!v.isSecret,
        })),
        null,
        2
      );
      setRawJson(serialized);
      setJsonError(null);
      setIsBulkMode(true);
    } else {
      // Switching back to table mode: parse JSON and update if valid
      if (rawJson.trim()) {
        try {
          const parsed = JSON.parse(rawJson);
          const newVars = parseJsonToVariableItems(parsed);
          if (newVars === null) {
            setJsonError(t('environments.jsonParseError'));
            return;
          }
          onChange(newVars);
          setJsonError(null);
          setIsBulkMode(false);
        } catch (err: any) {
          setJsonError(t('environments.invalidJson', { error: err.message || 'Syntax error' }));
          return;
        }
      } else {
        onChange([]);
        setJsonError(null);
        setIsBulkMode(false);
      }
    }
  };

  const handleFormatJson = () => {
    if (!rawJson.trim()) return;
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed === null || typeof parsed !== 'object') {
        setJsonError(t('environments.jsonParseError'));
        return;
      }
      const formatted = JSON.stringify(parsed, null, 2);
      setRawJson(formatted);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(t('environments.invalidJson', { error: err.message || 'Syntax error' }));
    }
  };

  const handleUpdateItem = (index: number, patch: Partial<VariableItem>) => {
    const next = variables.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  };

  const handleDeleteItem = (index: number) => {
    const next = variables.filter((_, i) => i !== index);
    onChange(next);
  };

  const handleAddItem = () => {
    const next = [...variables, { key: '', value: '', isActive: true, isSecret: false }];
    onChange(next);
  };

  const toggleRevealSecret = (secretKey: string) => {
    setRevealedSecrets((prev) => ({
      ...prev,
      [secretKey]: !prev[secretKey],
    }));
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header controls (Title + Bulk JSON Toggle) */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
        <div>
          {title && <h3 className="text-sm font-semibold text-neutral-200">{title}</h3>}
          {description && <p className="text-xs text-neutral-400 mt-0.5">{description}</p>}
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleBulkMode}
              aria-label={t('environments.bulkJsonMode')}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
            >
              {isBulkMode ? (
                <>
                  <Table className="w-3.5 h-3.5 text-neutral-400" />
                  <span>{t('environments.tableMode')}</span>
                </>
              ) : (
                <>
                  <Code className="w-3.5 h-3.5 text-neutral-400" />
                  <span>{t('environments.bulkJson')}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Main Content: Bulk JSON or Table Grid */}
      {isBulkMode ? (
        <div className="flex-1 flex flex-col gap-2 min-h-[250px]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              {t('environments.bulkJsonDesc')}
            </span>
            <button
              type="button"
              onClick={handleFormatJson}
              aria-label={t('environments.formatJson')}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('environments.format')}</span>
            </button>
          </div>

          <textarea
            aria-label={t('environments.bulkJsonEditorAria')}
            value={rawJson}
            onChange={(e) => {
              setRawJson(e.target.value);
              if (jsonError) setJsonError(null);
            }}
            placeholder={t('environments.bulkJsonPlaceholder')}
            className="flex-1 w-full bg-neutral-950 border border-neutral-800 rounded-md p-3 font-mono text-xs text-neutral-200 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-400 leading-relaxed min-h-[200px]"
          />

          {jsonError && (
            <div
              role="alert"
              className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 rounded px-2.5 py-1.5"
            >
              {jsonError}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 font-medium select-none">
                  <th scope="col" className="py-2 px-2 w-10 text-center">{t('environments.colActive')}</th>
                  <th scope="col" className="py-2 px-2 w-1/3">{t('environments.colKey')}</th>
                  <th scope="col" className="py-2 px-2">{t('environments.colValue')}</th>
                  <th scope="col" className="py-2 px-2 w-24 text-center">{t('environments.colSecret')}</th>
                  {!isReadOnly && <th scope="col" className="py-2 px-2 w-12 text-center">{t('environments.colActions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {variables.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isReadOnly ? 4 : 5}
                      className="py-8 text-center text-neutral-500 italic"
                    >
                      {effectiveEmptyMessage}
                    </td>
                  </tr>
                ) : (
                  variables.map((item, idx) => {
                    const secretKey = item.id || item.key || String(idx);
                    const isSecretRevealed = !!revealedSecrets[secretKey];
                    return (
                      <tr
                        key={item.id || `var-${idx}`}
                        className="hover:bg-neutral-900/60 transition-colors group"
                      >
                        {/* Checkbox active/inactive */}
                        <td className="py-1.5 px-2 text-center align-middle">
                          <input
                            type="checkbox"
                            checked={item.isActive !== false}
                            onChange={(e) =>
                              handleUpdateItem(idx, { isActive: e.target.checked })
                            }
                            aria-label={t('environments.enableVariableAria', { name: item.key || String(idx + 1) })}
                            disabled={isReadOnly}
                            className="rounded border-neutral-700 bg-neutral-900 text-blue-500 focus:ring-neutral-400 cursor-pointer h-4 w-4"
                          />
                        </td>

                        {/* Key input */}
                        <td className="py-1.5 px-2 align-middle">
                          <input
                            type="text"
                            placeholder={t('environments.keyPlaceholder')}
                            value={item.key}
                            onChange={(e) => handleUpdateItem(idx, { key: e.target.value })}
                            aria-label={t('environments.variableKeyAria', { index: idx + 1 })}
                            readOnly={isReadOnly}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 font-mono text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-neutral-700"
                          />
                        </td>

                        {/* Value input with reveal eye icon when secret */}
                        <td className="py-1.5 px-2 align-middle">
                          <div className="relative flex items-center">
                            <input
                              type={item.isSecret && !isSecretRevealed ? 'password' : 'text'}
                              placeholder={t('environments.valuePlaceholder')}
                              value={item.value}
                              onChange={(e) => handleUpdateItem(idx, { value: e.target.value })}
                              aria-label={t('environments.variableValueAria', { index: idx + 1 })}
                              readOnly={isReadOnly}
                              className={`w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 font-mono text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-neutral-700 ${
                                item.isSecret ? 'pr-8' : ''
                              }`}
                            />
                            {item.isSecret && (
                              <button
                                type="button"
                                onClick={() => toggleRevealSecret(secretKey)}
                                aria-label={
                                  isSecretRevealed ? t('environments.hideSecret') : t('environments.revealSecret')
                                }
                                title={isSecretRevealed ? t('environments.hideValue') : t('environments.revealValue')}
                                className="absolute right-1.5 p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors"
                              >
                                {isSecretRevealed ? (
                                  <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Secret toggle */}
                        <td className="py-1.5 px-2 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, { isSecret: !item.isSecret })}
                            aria-label={
                              item.isSecret
                                ? t('environments.unmarkSecret', { name: item.key || String(idx + 1) })
                                : t('environments.markSecret', { name: item.key || String(idx + 1) })
                            }
                            title={item.isSecret ? t('environments.secretVariable') : t('environments.markAsSecret')}
                            disabled={isReadOnly}
                            className={`p-1.5 rounded transition-colors ${
                              item.isSecret
                                ? 'text-amber-400 bg-amber-950/40 hover:bg-amber-900/40 border border-amber-900/60'
                                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            {item.isSecret ? (
                              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </td>

                        {/* Actions (Delete row) */}
                        {!isReadOnly && (
                          <td className="py-1.5 px-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(idx)}
                              aria-label={t('environments.deleteVariableAria', { name: item.key || String(idx + 1) })}
                              title={t('environments.deleteVariableTitle')}
                              className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-neutral-800 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Add variable button footer */}
          {!isReadOnly && (
            <div className="pt-3 mt-2 border-t border-neutral-800 flex justify-start">
              <button
                type="button"
                onClick={handleAddItem}
                aria-label={t('environments.addVariable')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <Plus className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
                <span>{t('environments.addVariable')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
