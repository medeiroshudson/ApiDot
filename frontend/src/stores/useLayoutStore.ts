import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { SyncReport } from '@/components/collection/CollectionSettingsModal';

export interface LayoutState {
  sidebarWidth: number;
  requestResponseRatio: number;
  sidebarCollapsed: boolean;
  activeMobilePane: 'request' | 'response';
  isWorkspaceModalOpen: boolean;
  isSaveModalOpen: boolean;
  isEnvModalOpen: boolean;
  isCollectionSettingsOpen: boolean;
  isImportOpenApiModalOpen: boolean;
  isDrawerOpen: boolean;
  auditBanner: { collectionName: string; report: SyncReport } | null;
  syncError: string | null;
  setSidebarWidth: (width: number) => void;
  adjustSidebarWidth: (deltaPx: number) => void;
  setRequestResponseRatio: (ratio: number) => void;
  adjustRequestResponseRatio: (deltaPct: number) => void;
  resetSidebarWidth: () => void;
  resetRequestResponseRatio: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setActiveMobilePane: (pane: 'request' | 'response') => void;
  setModalOpen: (modal: string, isOpen: boolean) => void;
  setAuditBanner: (banner: { collectionName: string; report: SyncReport } | null) => void;
  setSyncError: (error: string | null) => void;
}

export const DEFAULT_SIDEBAR_WIDTH = 256;
export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 480;

export const DEFAULT_REQUEST_RESPONSE_RATIO = 50;
export const MIN_REQUEST_RESPONSE_RATIO = 20;
export const MAX_REQUEST_RESPONSE_RATIO = 80;

export const LAYOUT_STORAGE_KEY = 'apidot_layout_preferences';

export const INITIAL_LAYOUT_STATE = {
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  requestResponseRatio: DEFAULT_REQUEST_RESPONSE_RATIO,
  sidebarCollapsed: false,
  activeMobilePane: 'request' as const,
  isWorkspaceModalOpen: false,
  isSaveModalOpen: false,
  isEnvModalOpen: false,
  isCollectionSettingsOpen: false,
  isImportOpenApiModalOpen: false,
  isDrawerOpen: false,
  auditBanner: null,
  syncError: null,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const MODAL_KEY_MAP: Record<
  string,
  keyof Pick<
    LayoutState,
    | 'isWorkspaceModalOpen'
    | 'isSaveModalOpen'
    | 'isEnvModalOpen'
    | 'isCollectionSettingsOpen'
    | 'isImportOpenApiModalOpen'
    | 'isDrawerOpen'
  >
> = {
  workspace: 'isWorkspaceModalOpen',
  isWorkspaceModalOpen: 'isWorkspaceModalOpen',
  save: 'isSaveModalOpen',
  isSaveModalOpen: 'isSaveModalOpen',
  env: 'isEnvModalOpen',
  environment: 'isEnvModalOpen',
  isEnvModalOpen: 'isEnvModalOpen',
  collectionSettings: 'isCollectionSettingsOpen',
  isCollectionSettingsOpen: 'isCollectionSettingsOpen',
  importOpenApi: 'isImportOpenApiModalOpen',
  isImportOpenApiModalOpen: 'isImportOpenApiModalOpen',
  drawer: 'isDrawerOpen',
  isDrawerOpen: 'isDrawerOpen',
};

const dummyStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      ...INITIAL_LAYOUT_STATE,

      setSidebarWidth: (width: number) => {
        set({ sidebarWidth: clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH) });
      },

      adjustSidebarWidth: (deltaPx: number) => {
        set((state) => ({
          sidebarWidth: clamp(state.sidebarWidth + deltaPx, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
        }));
      },

      setRequestResponseRatio: (ratio: number) => {
        set({ requestResponseRatio: clamp(ratio, MIN_REQUEST_RESPONSE_RATIO, MAX_REQUEST_RESPONSE_RATIO) });
      },

      adjustRequestResponseRatio: (deltaPct: number) => {
        set((state) => ({
          requestResponseRatio: clamp(
            state.requestResponseRatio + deltaPct,
            MIN_REQUEST_RESPONSE_RATIO,
            MAX_REQUEST_RESPONSE_RATIO
          ),
        }));
      },

      resetSidebarWidth: () => {
        set({ sidebarWidth: DEFAULT_SIDEBAR_WIDTH });
      },

      resetRequestResponseRatio: () => {
        set({ requestResponseRatio: DEFAULT_REQUEST_RESPONSE_RATIO });
      },

      setSidebarCollapsed: (collapsed: boolean) => {
        set({ sidebarCollapsed: collapsed });
      },

      toggleSidebarCollapsed: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setActiveMobilePane: (pane: 'request' | 'response') => {
        set({ activeMobilePane: pane });
      },

      setModalOpen: (modal: string, isOpen: boolean) => {
        const mappedKey = MODAL_KEY_MAP[modal];
        if (mappedKey) {
          set({ [mappedKey]: isOpen } as unknown as Partial<LayoutState>);
        }
      },

      setAuditBanner: (banner: { collectionName: string; report: any } | null) => {
        set({ auditBanner: banner });
      },

      setSyncError: (error: string | null) => {
        set({ syncError: error });
      },
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : dummyStorage
      ),
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        requestResponseRatio: state.requestResponseRatio,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
