import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Plus, Layers, Globe, FolderGit2, Calculator, Trash2 } from 'lucide-react';
import { VariableGrid, VariableItem } from './VariableGrid';

export interface EnvironmentGroup {
  name: string;
  variables: VariableItem[];
}

export interface ResolvedVariableItem {
  key: string;
  value: string;
  scope: 'Global' | 'Collection' | 'Environment' | string;
  sourceEnvironmentName?: string | null;
  overrodeExisting?: boolean;
  isSecret?: boolean;
}

export type ModalTab = 'Globais' | 'Coleção' | 'Ambientes' | 'Calculadas';

export interface EnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ModalTab;
  globals?: VariableItem[];
  collectionVariables?: VariableItem[];
  environments?: EnvironmentGroup[] | Record<string, VariableItem[]>;
  activeEnvironment?: string | null;
  computedVariables?: ResolvedVariableItem[];
  onSave?: (data: {
    globals: VariableItem[];
    collectionVariables: VariableItem[];
    environments: EnvironmentGroup[];
    activeEnvironment?: string | null;
  }) => void;
  onGlobalsChange?: (variables: VariableItem[]) => void;
  onCollectionChange?: (variables: VariableItem[]) => void;
  onEnvironmentsChange?: (environments: EnvironmentGroup[]) => void;
  onSelectActiveEnvironment?: (envName: string | null) => void;
}

const EMPTY_GLOBALS: VariableItem[] = [];
const EMPTY_COLLECTIONS: VariableItem[] = [];
const EMPTY_ENVIRONMENTS: EnvironmentGroup[] = [];

const TABS: ModalTab[] = ['Globais', 'Coleção', 'Ambientes', 'Calculadas'];

export function EnvironmentModal({
  isOpen,
  onClose,
  initialTab = 'Globais',
  globals = EMPTY_GLOBALS,
  collectionVariables = EMPTY_COLLECTIONS,
  environments = EMPTY_ENVIRONMENTS,
  activeEnvironment = null,
  computedVariables,
  onSave,
  onGlobalsChange,
  onCollectionChange,
  onEnvironmentsChange,
  onSelectActiveEnvironment,
}: EnvironmentModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab);
  const [globalsList, setGlobalsList] = useState<VariableItem[]>(globals);
  const [collectionList, setCollectionList] = useState<VariableItem[]>(collectionVariables);

  const normalizeEnvironments = (
    input: EnvironmentGroup[] | Record<string, VariableItem[]>
  ): EnvironmentGroup[] => {
    if (Array.isArray(input)) return input;
    if (input && typeof input === 'object') {
      return Object.entries(input).map(([name, vars]) => ({ name, variables: vars }));
    }
    return [];
  };

  const [envList, setEnvList] = useState<EnvironmentGroup[]>(() =>
    normalizeEnvironments(environments)
  );

  const [selectedEnvName, setSelectedEnvName] = useState<string>(() => {
    if (activeEnvironment) return activeEnvironment;
    const normalized = normalizeEnvironments(environments);
    return normalized.length > 0 ? normalized[0].name : '';
  });

  const [newEnvInput, setNewEnvInput] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const envTabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Sync state with props
  useEffect(() => {
    setGlobalsList(globals);
  }, [globals]);

  useEffect(() => {
    setCollectionList(collectionVariables);
  }, [collectionVariables]);

  useEffect(() => {
    const normalized = normalizeEnvironments(environments);
    setEnvList(normalized);
    if (!selectedEnvName && normalized.length > 0) {
      setSelectedEnvName(normalized[0].name);
    }
  }, [environments]);

  useEffect(() => {
    if (activeEnvironment) {
      setSelectedEnvName(activeEnvironment);
    }
  }, [activeEnvironment]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Trap focus & Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const dialog = modalContentRef.current;
        if (!dialog) return;

        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'
        );
        const focusableElements = Array.from(focusable).filter(
          (el) => el.getAttribute('tabindex') !== '-1'
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !dialog.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !dialog.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus management: auto-focus on open and restore previous focus on close
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
    } else if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus();
      previousActiveElementRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    };
  }, []);

  // Handlers for Globals
  const handleGlobalsChange = (updated: VariableItem[]) => {
    setGlobalsList(updated);
    onGlobalsChange?.(updated);
  };

  // Handlers for Collection
  const handleCollectionChange = (updated: VariableItem[]) => {
    setCollectionList(updated);
    onCollectionChange?.(updated);
  };

  // Handlers for Environments
  const handleCurrentEnvVarsChange = (updatedVars: VariableItem[]) => {
    const updated = envList.map((env) =>
      env.name === selectedEnvName ? { ...env, variables: updatedVars } : env
    );
    setEnvList(updated);
    onEnvironmentsChange?.(updated);
  };

  const handleAddEnvironment = () => {
    const trimmed = newEnvInput.trim();
    if (!trimmed) return;

    const existing = envList.find((e) => e.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setSelectedEnvName(existing.name);
      setNewEnvInput('');
      return;
    }

    const updated = [...envList, { name: trimmed, variables: [] }];
    setEnvList(updated);
    setSelectedEnvName(trimmed);
    setNewEnvInput('');
    onEnvironmentsChange?.(updated);
  };

  const handleDeleteEnvironment = (envName: string) => {
    const updated = envList.filter((e) => e.name !== envName);
    setEnvList(updated);
    if (selectedEnvName === envName) {
      setSelectedEnvName(updated.length > 0 ? updated[0].name : '');
    }
    onEnvironmentsChange?.(updated);
  };

  // Arrow key navigation between main tabs
  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % TABS.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = TABS.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    setActiveTab(TABS[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };

  // Arrow key navigation between environment sub-tabs (roving tabIndex)
  const handleEnvTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      nextIndex = (index + 1) % envList.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + envList.length) % envList.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = envList.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    setSelectedEnvName(envList[nextIndex].name);
    envTabRefs.current[nextIndex]?.focus();
  };

  // Dynamic calculation for Calculadas tab (memoized)
  const resolvedVariables: ResolvedVariableItem[] = useMemo(() => {
    if (computedVariables) return computedVariables;

    const map = new Map<string, ResolvedVariableItem>();

    // 1. Globals (active only)
    globalsList.forEach((v) => {
      if (v.isActive !== false && v.key.trim()) {
        map.set(v.key, {
          key: v.key,
          value: v.value,
          scope: 'Global',
          overrodeExisting: false,
          isSecret: !!v.isSecret,
        });
      }
    });

    // 2. Collection (active only, overrides globals)
    collectionList.forEach((v) => {
      if (v.isActive !== false && v.key.trim()) {
        const existed = map.has(v.key);
        map.set(v.key, {
          key: v.key,
          value: v.value,
          scope: 'Collection',
          overrodeExisting: existed,
          isSecret: !!v.isSecret,
        });
      }
    });

    // 3. Active environment (active only, overrides collection & globals)
    const activeEnvObj = envList.find((e) => e.name === selectedEnvName);
    if (activeEnvObj) {
      activeEnvObj.variables.forEach((v) => {
        if (v.isActive !== false && v.key.trim()) {
          const existed = map.has(v.key);
          map.set(v.key, {
            key: v.key,
            value: v.value,
            scope: 'Environment',
            sourceEnvironmentName: activeEnvObj.name,
            overrodeExisting: existed,
            isSecret: !!v.isSecret,
          });
        }
      });
    }

    return Array.from(map.values());
  }, [computedVariables, globalsList, collectionList, envList, selectedEnvName]);

  const currentEnvironment =
    envList.find((e) => e.name === selectedEnvName) || envList[0] || null;

  if (!isOpen) return null;

  return (
    <div
      data-testid="environment-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={modalContentRef}
        data-testid="environment-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="env-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[85vh] max-h-[720px] bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-neutral-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/40">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-blue-400" aria-hidden="true" />
            <h2 id="env-modal-title" className="text-base font-semibold tracking-tight text-white">
              Ambientes e Variáveis
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tab List */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-neutral-800 bg-neutral-900/20">
          <div role="tablist" aria-label="Abas de gerenciamento de variáveis" className="flex gap-2">
            {TABS.map((tab, idx) => {
              const isSelected = activeTab === tab;
              const icons = {
                Globais: Globe,
                Coleção: FolderGit2,
                Ambientes: Layers,
                Calculadas: Calculator,
              };
              const TabIcon = icons[tab];

              return (
                <button
                  key={tab}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  role="tab"
                  id={`tab-${tab}`}
                  aria-selected={isSelected}
                  aria-controls={`panel-${tab}`}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setActiveTab(tab)}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                      : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{tab}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Panes */}
        <div className="flex-1 overflow-hidden p-6">
          {/* 1. Globais Tab */}
          {activeTab === 'Globais' && (
            <div
              role="tabpanel"
              id="panel-Globais"
              aria-labelledby="tab-Globais"
              className="h-full flex flex-col"
            >
              <VariableGrid
                title="Variáveis Globais"
                description="Disponíveis em todas as requisições deste Workspace. Podem ser sobrescritas por Coleção e Ambientes."
                variables={globalsList}
                onChange={handleGlobalsChange}
                emptyMessage="Nenhuma variável global cadastrada."
              />
            </div>
          )}

          {/* 2. Coleção Tab */}
          {activeTab === 'Coleção' && (
            <div
              role="tabpanel"
              id="panel-Coleção"
              aria-labelledby="tab-Coleção"
              className="h-full flex flex-col"
            >
              <VariableGrid
                title="Variáveis da Coleção"
                description="Vinculadas à coleção selecionada. Sobrescrevem Variáveis Globais para as requisições da coleção."
                variables={collectionList}
                onChange={handleCollectionChange}
                emptyMessage="Nenhuma variável de coleção cadastrada."
              />
            </div>
          )}

          {/* 3. Ambientes Tab */}
          {activeTab === 'Ambientes' && (
            <div
              role="tabpanel"
              id="panel-Ambientes"
              aria-labelledby="tab-Ambientes"
              className="h-full flex flex-col md:flex-row gap-6 overflow-hidden"
            >
              {/* Left sidebar: Environments list & Add input */}
              <div className="w-full md:w-60 flex flex-col border-b md:border-b-0 md:border-r border-neutral-800 pr-0 md:pr-4">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-neutral-800">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Ambientes ({envList.length})
                  </span>
                </div>

                {/* Add new environment input */}
                <div className="flex items-center gap-1.5 mb-4">
                  <input
                    type="text"
                    placeholder="Novo ambiente..."
                    aria-label="Nome do novo ambiente"
                    value={newEnvInput}
                    onChange={(e) => setNewEnvInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEnvironment();
                      }
                    }}
                    className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                  />
                  <button
                    type="button"
                    onClick={handleAddEnvironment}
                    aria-label="Adicionar ambiente"
                    className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Environments sub-tab list */}
                <div
                  role="tablist"
                  aria-orientation="vertical"
                  aria-label="Lista de ambientes"
                  className="flex-1 flex flex-col gap-1 overflow-y-auto"
                >
                  {envList.length === 0 ? (
                    <span className="text-xs text-neutral-500 italic p-2">
                      Nenhum ambiente criado.
                    </span>
                  ) : (
                    envList.map((env, envIdx) => {
                      const isSelected = selectedEnvName === env.name;
                      return (
                        <div
                          key={env.name}
                          className={`flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors group ${
                            isSelected
                              ? 'bg-neutral-800 text-white font-medium border border-neutral-700'
                              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                          }`}
                        >
                          <button
                            ref={(el) => {
                              envTabRefs.current[envIdx] = el;
                            }}
                            type="button"
                            role="tab"
                            id={`env-tab-${env.name}`}
                            aria-selected={isSelected}
                            aria-controls="panel-env-variables"
                            tabIndex={isSelected ? 0 : -1}
                            onClick={() => setSelectedEnvName(env.name)}
                            onKeyDown={(e) => handleEnvTabKeyDown(e, envIdx)}
                            className="flex-1 text-left truncate flex items-center justify-between focus:outline-none"
                          >
                            <span className="truncate">{env.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-900/60 text-neutral-400 border border-neutral-800 ml-1">
                              {env.variables.length}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteEnvironment(env.name)}
                            aria-label={`Excluir ambiente ${env.name}`}
                            title={`Excluir ambiente ${env.name}`}
                            className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-rose-400 rounded transition-opacity ml-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right panel: Overrides grid for selected environment */}
              <div
                id="panel-env-variables"
                role="tabpanel"
                aria-labelledby={currentEnvironment ? `env-tab-${currentEnvironment.name}` : undefined}
                className="flex-1 flex flex-col h-full overflow-hidden"
              >
                {currentEnvironment ? (
                  <VariableGrid
                    title={`Variáveis: ${currentEnvironment.name}`}
                    description={`Sobrescreve valores para o ambiente "${currentEnvironment.name}". Tem prioridade máxima sobre Coleção e Globais.`}
                    variables={currentEnvironment.variables}
                    onChange={handleCurrentEnvVarsChange}
                    emptyMessage={`Nenhuma variável configurada para "${currentEnvironment.name}".`}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-neutral-500">
                    Selecione ou crie um ambiente à esquerda para configurar variáveis.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Calculadas Tab */}
          {activeTab === 'Calculadas' && (
            <div
              role="tabpanel"
              id="panel-Calculadas"
              aria-labelledby="tab-Calculadas"
              className="h-full flex flex-col"
            >
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200">
                    Variáveis Calculadas (Cascata)
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Visualização em tempo real das variáveis resolvidas na ordem:{' '}
                    <span className="text-neutral-300 font-mono">Globais</span> &rarr;{' '}
                    <span className="text-neutral-300 font-mono">Coleção</span> &rarr;{' '}
                    <span className="text-neutral-300 font-mono">Ambiente Ativo</span>.
                  </p>
                </div>

                {envList.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="active-env-select" className="text-xs text-neutral-400">
                      Ambiente ativo:
                    </label>
                    <select
                      id="active-env-select"
                      aria-label="Ambiente ativo"
                      value={selectedEnvName}
                      onChange={(e) => {
                        setSelectedEnvName(e.target.value);
                        onSelectActiveEnvironment?.(e.target.value || null);
                      }}
                      className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-400 cursor-pointer"
                    >
                      {envList.map((e) => (
                        <option key={e.name} value={e.name}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-400 font-medium select-none">
                      <th scope="col" className="py-2 px-3 w-1/4">Chave</th>
                      <th scope="col" className="py-2 px-3 w-1/3">Valor Resolvido</th>
                      <th scope="col" className="py-2 px-3 w-1/4">Origem / Escopo</th>
                      <th scope="col" className="py-2 px-3 text-center">Sobrescrita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-900 font-mono">
                    {resolvedVariables.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-500 italic">
                          Nenhuma variável calculada.
                        </td>
                      </tr>
                    ) : (
                      resolvedVariables.map((item, idx) => {
                        const isEnvScope =
                          item.scope === 'Environment' || item.sourceEnvironmentName;
                        const isCollectionScope = item.scope === 'Collection';

                        return (
                          <tr
                            key={`res-${item.key}-${idx}`}
                            className="hover:bg-neutral-900/60 transition-colors"
                          >
                            <td className="py-2.5 px-3 text-neutral-200 font-semibold">
                              {item.key}
                            </td>
                            <td className="py-2.5 px-3 text-neutral-300 break-all">
                              {item.isSecret ? (
                                <span className="text-neutral-500 tracking-widest select-none">
                                  ••••••••
                                </span>
                              ) : (
                                item.value
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                data-testid={`scope-badge-${item.key}`}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-sans font-medium border ${
                                  isEnvScope
                                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80'
                                    : isCollectionScope
                                    ? 'bg-purple-950/60 text-purple-300 border-purple-800/80'
                                    : 'bg-blue-950/60 text-blue-300 border-blue-800/80'
                                }`}
                              >
                                {item.sourceEnvironmentName || item.scope}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {item.overrodeExisting ? (
                                <span
                                  data-testid="override-indicator"
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/80"
                                >
                                  Sobrescrito
                                </span>
                              ) : (
                                <span className="text-neutral-600 font-sans">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
