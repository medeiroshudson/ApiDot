import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import {
  WorkspaceDto,
  fetchWorkspacesApi,
  createWorkspaceApi,
} from '@/lib/treeApi';

export interface WorkspaceState {
  workspaces: WorkspaceDto[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;
  setWorkspaces: (workspaces: WorkspaceDto[]) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  fetchWorkspaces: (preferredId?: string) => Promise<WorkspaceDto[]>;
  createWorkspace: (name: string) => Promise<WorkspaceDto>;
  ensureWorkspaceId: () => Promise<string>;
  reset: () => void;
}

export const WORKSPACE_STORAGE_KEY = 'apidot_workspace_storage';

export const INITIAL_WORKSPACE_STATE = {
  workspaces: [] as WorkspaceDto[],
  activeWorkspaceId: null as string | null,
  isLoading: false,
  error: null as string | null,
};

const dummyStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      isLoading: false,
      error: null,

      setWorkspaces: (workspaces: WorkspaceDto[]) => {
        const validList = Array.isArray(workspaces) ? workspaces : [];
        set({ workspaces: validList });
      },

      setActiveWorkspaceId: (id: string | null) => {
        set({ activeWorkspaceId: id });
      },

      fetchWorkspaces: async (preferredId?: string): Promise<WorkspaceDto[]> => {
        set({ isLoading: true, error: null });
        try {
          const list = await fetchWorkspacesApi();
          const validList = Array.isArray(list) ? list : [];

          if (validList.length === 0) {
            set({
              workspaces: [],
              activeWorkspaceId: null,
              isLoading: false,
              error: null,
            });
            return [];
          }

          const currentActiveId = get().activeWorkspaceId;
          let chosenId: string = validList[0].id;

          if (preferredId && validList.some((w) => w.id === preferredId)) {
            chosenId = preferredId;
          } else if (currentActiveId && validList.some((w) => w.id === currentActiveId)) {
            chosenId = currentActiveId;
          } else {
            let legacyId: string | null = null;
            try {
              legacyId =
                typeof window !== 'undefined'
                  ? localStorage.getItem('apidot_active_workspace_id')
                  : null;
            } catch {
              legacyId = null;
            }
            if (legacyId && validList.some((w) => w.id === legacyId)) {
              chosenId = legacyId;
            } else {
              chosenId = validList[0].id;
            }
          }

          set({
            workspaces: validList,
            activeWorkspaceId: chosenId,
            isLoading: false,
            error: null,
          });
          return validList;
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : 'Falha ao listar workspaces';
          set({
            error: errorMessage,
            isLoading: false,
          });
          return [];
        }
      },

      createWorkspace: async (name: string): Promise<WorkspaceDto> => {
        set({ isLoading: true, error: null });
        try {
          const created = await createWorkspaceApi(name);
          const updatedWorkspaces = await get().fetchWorkspaces(created.id);
          if (!updatedWorkspaces.some((w) => w.id === created.id)) {
            set((state) => ({
              workspaces: [...state.workspaces, created],
              activeWorkspaceId: created.id,
              isLoading: false,
              error: null,
            }));
          }
          return created;
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : 'Falha ao criar workspace';
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw err;
        }
      },

      ensureWorkspaceId: async (): Promise<string> => {
        const currentId = get().activeWorkspaceId;
        if (currentId) {
          return currentId;
        }

        const workspaces = await get().fetchWorkspaces();
        if (workspaces && workspaces.length > 0) {
          return get().activeWorkspaceId || workspaces[0].id;
        }

        const created = await get().createWorkspace('Workspace');
        return created.id;
      },

      reset: () => {
        set(INITIAL_WORKSPACE_STATE);
      },
    }),
    {
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : dummyStorage
      ),
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    }
  )
);
