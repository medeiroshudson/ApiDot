import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { EnvironmentGroup } from '@/components/environment/EnvironmentModal';
import { VariableItem } from '@/components/environment/VariableGrid';
import { AutocompleteVariable } from '@/components/request/RequestAutocomplete';
import { resolveVariables } from '@/lib/variables';

export interface EnvironmentState {
  environments: EnvironmentGroup[];
  activeEnvironment: string | null;
  globals: VariableItem[];
  collectionVariables: VariableItem[];
  setEnvironments: (envs: EnvironmentGroup[]) => void;
  setActiveEnvironment: (name: string | null) => void;
  setGlobals: (vars: VariableItem[]) => void;
  setCollectionVariables: (vars: VariableItem[]) => void;
  getResolvedVariables: () => Record<string, string>;
  getAvailableVariables: () => AutocompleteVariable[];
  reset: () => void;
}

export const DEFAULT_ENVIRONMENTS: EnvironmentGroup[] = [
  { name: 'Development', variables: [] },
  { name: 'Staging', variables: [] },
  { name: 'Production', variables: [] },
];

export const ENVIRONMENT_STORAGE_KEY = 'apidot_environment_storage';

export const INITIAL_ENVIRONMENT_STATE = {
  environments: DEFAULT_ENVIRONMENTS,
  activeEnvironment: null,
  globals: [] as VariableItem[],
  collectionVariables: [] as VariableItem[],
};

const dummyStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useEnvironmentStore = create<EnvironmentState>()(
  persist(
    (set, get) => ({
      environments: DEFAULT_ENVIRONMENTS,
      activeEnvironment: null,
      globals: [],
      collectionVariables: [],

      setEnvironments: (envs: EnvironmentGroup[]) => {
        set((state) => {
          const matched = state.activeEnvironment
            ? envs.find((e) => e.name.toLowerCase() === state.activeEnvironment!.toLowerCase())
            : null;

          return {
            environments: envs,
            activeEnvironment: matched ? matched.name : null,
          };
        });
      },

      setActiveEnvironment: (name: string | null) => {
        if (name === null) {
          set({ activeEnvironment: null });
          return;
        }
        const matched = get().environments.find(
          (e) => e.name.toLowerCase() === name.toLowerCase()
        );
        set({ activeEnvironment: matched ? matched.name : name });
      },

      setGlobals: (vars: VariableItem[]) => {
        set({ globals: vars });
      },

      setCollectionVariables: (vars: VariableItem[]) => {
        set({ collectionVariables: vars });
      },

      getResolvedVariables: () => {
        const { globals, collectionVariables, environments, activeEnvironment } = get();
        return resolveVariables(globals, collectionVariables, environments, activeEnvironment);
      },

      getAvailableVariables: () => {
        const { globals, collectionVariables, environments, activeEnvironment } = get();
        const list: AutocompleteVariable[] = [];

        globals
          .filter((g) => g.isActive !== false && Boolean(g.key?.trim()))
          .forEach((g) => {
            list.push({ key: g.key.trim(), value: g.value, scope: 'global' });
          });

        collectionVariables
          .filter((c) => c.isActive !== false && Boolean(c.key?.trim()))
          .forEach((c) => {
            list.push({ key: c.key.trim(), value: c.value, scope: 'collection' });
          });

        if (activeEnvironment) {
          const activeEnv = environments.find(
            (e) => e.name.toLowerCase() === activeEnvironment.toLowerCase()
          );
          if (activeEnv) {
            activeEnv.variables
              .filter((v) => v.isActive !== false && Boolean(v.key?.trim()))
              .forEach((v) => {
                list.push({ key: v.key.trim(), value: v.value, scope: activeEnv.name });
              });
          }
        }

        return list;
      },

      reset: () => {
        set({
          environments: DEFAULT_ENVIRONMENTS.map((e) => ({
            ...e,
            variables: [...e.variables],
          })),
          activeEnvironment: null,
          globals: [],
          collectionVariables: [],
        });
      },
    }),
    {
      name: ENVIRONMENT_STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : dummyStorage
      ),
      partialize: (state) => ({
        environments: state.environments,
        activeEnvironment: state.activeEnvironment,
        globals: state.globals,
      }),
    }
  )
);
