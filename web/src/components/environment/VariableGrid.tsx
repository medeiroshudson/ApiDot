import React, { useState } from 'react';
import { Eye, EyeOff, Trash2, Plus, Sparkles, Code, Table, Lock, Unlock } from 'lucide-react';

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

export function VariableGrid({
  variables,
  onChange,
  title,
  description,
  isReadOnly = false,
  emptyMessage = 'Nenhuma variável cadastrada.',
  className = '',
}: VariableGridProps) {
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<number, boolean>>({});

  const handleToggleBulkMode = () => {
    if (!isBulkMode) {
      // Switching to bulk JSON mode
      const serialized = JSON.stringify(
        variables.map((v) => ({
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
          let newVars: VariableItem[] = [];
          if (Array.isArray(parsed)) {
            newVars = parsed.map((item) => ({
              key: item.key ? String(item.key) : '',
              value: item.value !== undefined ? String(item.value) : '',
              isActive: item.isActive !== false,
              isSecret: !!item.isSecret,
            }));
          } else if (typeof parsed === 'object' && parsed !== null) {
            newVars = Object.entries(parsed).map(([k, v]) => ({
              key: k,
              value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
              isActive: true,
              isSecret: false,
            }));
          }
          onChange(newVars);
          setJsonError(null);
          setIsBulkMode(false);
        } catch (err: any) {
          setJsonError(`JSON inválido: ${err.message || 'Sintaxe inválida'}`);
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
      const formatted = JSON.stringify(parsed, null, 2);
      setRawJson(formatted);
      setJsonError(null);

      // Also sync back to variables if valid
      let newVars: VariableItem[] = [];
      if (Array.isArray(parsed)) {
        newVars = parsed.map((item) => ({
          key: item.key ? String(item.key) : '',
          value: item.value !== undefined ? String(item.value) : '',
          isActive: item.isActive !== false,
          isSecret: !!item.isSecret,
        }));
      } else if (typeof parsed === 'object' && parsed !== null) {
        newVars = Object.entries(parsed).map(([k, v]) => ({
          key: k,
          value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
          isActive: true,
          isSecret: false,
        }));
      }
      onChange(newVars);
    } catch (err: any) {
      setJsonError(`JSON inválido: ${err.message || 'Sintaxe inválida'}`);
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

  const toggleRevealSecret = (index: number) => {
    setRevealedSecrets((prev) => ({
      ...prev,
      [index]: !prev[index],
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
              aria-label="Modo JSON em massa"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors"
            >
              {isBulkMode ? (
                <>
                  <Table className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Modo Tabela</span>
                </>
              ) : (
                <>
                  <Code className="w-3.5 h-3.5 text-neutral-400" />
                  <span>JSON em Massa</span>
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
              Cole ou edite as variáveis como JSON (array de objetos ou chave-valor).
            </span>
            <button
              type="button"
              onClick={handleFormatJson}
              aria-label="Formatar JSON"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Formatar</span>
            </button>
          </div>

          <textarea
            aria-label="Editor JSON em massa"
            value={rawJson}
            onChange={(e) => {
              setRawJson(e.target.value);
              if (jsonError) setJsonError(null);
            }}
            placeholder='[\n  { "key": "API_URL", "value": "https://api.com", "isActive": true, "isSecret": false }\n]'
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
                  <th className="py-2 px-2 w-10 text-center">Ativo</th>
                  <th className="py-2 px-2 w-1/3">Chave</th>
                  <th className="py-2 px-2">Valor</th>
                  <th className="py-2 px-2 w-24 text-center">Segredo</th>
                  {!isReadOnly && <th className="py-2 px-2 w-12 text-center">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {variables.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isReadOnly ? 4 : 5}
                      className="py-8 text-center text-neutral-500 italic"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  variables.map((item, idx) => {
                    const isSecretRevealed = revealedSecrets[idx] || false;
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
                            aria-label={`Ativar variável ${item.key || idx + 1}`}
                            disabled={isReadOnly}
                            className="rounded border-neutral-700 bg-neutral-900 text-blue-500 focus:ring-neutral-400 cursor-pointer h-4 w-4"
                          />
                        </td>

                        {/* Key input */}
                        <td className="py-1.5 px-2 align-middle">
                          <input
                            type="text"
                            placeholder="Chave"
                            value={item.key}
                            onChange={(e) => handleUpdateItem(idx, { key: e.target.value })}
                            aria-label={`Chave da variável ${idx + 1}`}
                            readOnly={isReadOnly}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 font-mono text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-neutral-700"
                          />
                        </td>

                        {/* Value input with reveal eye icon when secret */}
                        <td className="py-1.5 px-2 align-middle">
                          <div className="relative flex items-center">
                            <input
                              type={item.isSecret && !isSecretRevealed ? 'password' : 'text'}
                              placeholder="Valor"
                              value={item.value}
                              onChange={(e) => handleUpdateItem(idx, { value: e.target.value })}
                              aria-label={`Valor da variável ${idx + 1}`}
                              readOnly={isReadOnly}
                              className={`w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 font-mono text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-neutral-700 ${
                                item.isSecret ? 'pr-8' : ''
                              }`}
                            />
                            {item.isSecret && (
                              <button
                                type="button"
                                onClick={() => toggleRevealSecret(idx)}
                                aria-label={
                                  isSecretRevealed ? 'Ocultar segredo' : 'Revelar segredo'
                                }
                                title={isSecretRevealed ? 'Ocultar valor' : 'Revelar valor'}
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
                                ? `Desmarcar segredo ${item.key || idx + 1}`
                                : `Marcar segredo ${item.key || idx + 1}`
                            }
                            title={item.isSecret ? 'Variável secreta' : 'Marcar como segredo'}
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
                              aria-label={`Excluir variável ${item.key || idx + 1}`}
                              title="Excluir variável"
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
                aria-label="Adicionar variável"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <Plus className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
                <span>Adicionar Variável</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
