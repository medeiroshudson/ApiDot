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
  collectionVariablesByCollectionId: Record<string, VariableItem[]>;
  activeCollectionId: string | null;
  setEnvironments: (envs: EnvironmentGroup[]) => void;
  setActiveEnvironment: (name: string | null) => void;
  setGlobals: (vars: VariableItem[]) => void;
  setCollectionVariables: (vars: VariableItem[]) => void;
  setActiveCollectionId: (id: string | null) => void;
  setCollectionVariablesForId: (collectionId: string, vars: VariableItem[]) => void;
  getCollectionVariablesForId: (collectionId: string) => VariableItem[];
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
  activeCollectionId: null as string | null,
  collectionVariablesByCollectionId: {} as Record<string, VariableItem[]>,
};

const dummyStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function cloneEnvironments(envs: EnvironmentGroup[]): EnvironmentGroup[] {
  return envs.map((e) => ({
    ...e,
    variables: Array.isArray(e.variables) ? [...e.variables] : [],
  }));
}

export const useEnvironmentStore = create<EnvironmentState>()(
  persist(
    (set, get) => ({
      environments: cloneEnvironments(DEFAULT_ENVIRONMENTS),
      activeEnvironment: null,
      globals: [],
      collectionVariables: [],
      activeCollectionId: null,
      collectionVariablesByCollectionId: {},

      setEnvironments: (envs: EnvironmentGroup[]) => {
        set((state) => {
          const validEnvs = Array.isArray(envs) ? envs : [];
          const matched = state.activeEnvironment
            ? validEnvs.find((e) => e.name.toLowerCase() === state.activeEnvironment!.toLowerCase())
            : null;

          return {
            environments: validEnvs,
            activeEnvironment: matched ? matched.name : null,
          };
        });
      },

      setActiveEnvironment: (name: string | null | undefined) => {
        if (!name || !name.trim()) {
          set({ activeEnvironment: null });
          return;
        }
        const trimmed = name.trim();
        const matched = get().environments.find(
          (e) => e.name.toLowerCase() === trimmed.toLowerCase()
        );
        set({ activeEnvironment: matched ? matched.name : trimmed });
      },

      setGlobals: (vars: VariableItem[]) => {
        set({ globals: vars });
      },

      setCollectionVariables: (vars: VariableItem[]) => {
        set({ collectionVariables: vars });
      },

      setActiveCollectionId: (id: string | null) => {
        set({ activeCollectionId: id });
      },

      setCollectionVariablesForId: (collectionId: string, vars: VariableItem[]) => {
        set((state) => ({
          collectionVariablesByCollectionId: {
            ...(state.collectionVariablesByCollectionId || {}),
            [collectionId]: Array.isArray(vars) ? vars : [],
          },
        }));
      },

      getCollectionVariablesForId: (collectionId: string) => {
        const vars = (get().collectionVariablesByCollectionId || {})[collectionId];
        return Array.isArray(vars) ? vars : [];
      },

      getResolvedVariables: () => {
        const {
          globals,
          collectionVariables,
          collectionVariablesByCollectionId,
          activeCollectionId,
          environments,
          activeEnvironment,
        } = get();
        const currentCollectionVars = activeCollectionId
          ? ((collectionVariablesByCollectionId || {})[activeCollectionId] || [])
          : (collectionVariables || []);
        return resolveVariables(globals, currentCollectionVars, environments, activeEnvironment);
      },

      getAvailableVariables: () => {
        const {
          globals,
          collectionVariables,
          collectionVariablesByCollectionId,
          activeCollectionId,
          environments,
          activeEnvironment,
        } = get();
        const currentCollectionVars = activeCollectionId
          ? ((collectionVariablesByCollectionId || {})[activeCollectionId] || [])
          : (collectionVariables || []);
        const list: AutocompleteVariable[] = [];

        (globals || [])
          .filter((g) => g.isActive !== false && Boolean(g.key?.trim()))
          .forEach((g) => {
            list.push({ key: g.key.trim(), value: g.value, scope: 'global' });
          });

        (currentCollectionVars || [])
          .filter((c) => c.isActive !== false && Boolean(c.key?.trim()))
          .forEach((c) => {
            list.push({ key: c.key.trim(), value: c.value, scope: 'collection' });
          });

        if (activeEnvironment) {
          const activeEnv = (environments || []).find(
            (e) => e.name.toLowerCase() === activeEnvironment.toLowerCase()
          );
          if (activeEnv && Array.isArray(activeEnv.variables)) {
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
          environments: cloneEnvironments(DEFAULT_ENVIRONMENTS),
          activeEnvironment: null,
          globals: [],
          collectionVariables: [],
          activeCollectionId: null,
          collectionVariablesByCollectionId: {},
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
        collectionVariablesByCollectionId: state.collectionVariablesByCollectionId,
      }),
    }
  )
);
