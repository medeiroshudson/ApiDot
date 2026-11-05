import { create } from 'zustand';
import {
  checkDesktopUpdate,
  downloadAndInstallUpdate,
  relaunchAppCleanly,
  type UpdateProgress,
} from '@/lib/desktop/updater';
import { isDesktop } from '@/lib/desktop/runtime';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready-to-restart'
  | 'error';

export interface UpdateStoreState {
  status: UpdateStatus;
  availableVersion: string | null;
  currentVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  progressPercent: number;
  downloadedBytes: number;
  totalBytes: number | null;
  errorMessage: string | null;
  lastCheckedAt: Date | null;

  checkForUpdates: (manual?: boolean) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartAndApply: () => Promise<void>;
  resetError: () => void;
  reset: () => void;
}

export const INITIAL_UPDATE_STATE = {
  status: 'idle' as UpdateStatus,
  availableVersion: null as string | null,
  currentVersion: null as string | null,
  releaseNotes: null as string | null,
  releaseDate: null as string | null,
  progressPercent: 0,
  downloadedBytes: 0,
  totalBytes: null as number | null,
  errorMessage: null as string | null,
  lastCheckedAt: null as Date | null,
};

export const useUpdateStore = create<UpdateStoreState>()((set, get) => ({
  ...INITIAL_UPDATE_STATE,

  checkForUpdates: async (_manual = false): Promise<void> => {
    if (!isDesktop()) {
      return;
    }

    if (get().status === 'downloading' || get().status === 'checking') {
      return;
    }

    set({ status: 'checking', errorMessage: null });

    try {
      const update = await checkDesktopUpdate();
      if (update) {
        set({
          status: 'available',
          availableVersion: update.version || null,
          currentVersion: update.currentVersion || null,
          releaseNotes: update.body ?? null,
          releaseDate: update.date ?? null,
          lastCheckedAt: new Date(),
          errorMessage: null,
        });
      } else {
        set({
          status: 'up-to-date',
          availableVersion: null,
          releaseNotes: null,
          releaseDate: null,
          lastCheckedAt: new Date(),
          errorMessage: null,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({
        status: 'error',
        errorMessage: message || 'errorCheck',
      });
    }
  },

  downloadAndInstall: async (): Promise<void> => {
    if (get().status === 'downloading' || get().status === 'ready-to-restart') {
      return;
    }

    set({
      status: 'downloading',
      progressPercent: 0,
      downloadedBytes: 0,
      totalBytes: null,
      errorMessage: null,
    });

    try {
      await downloadAndInstallUpdate((progress: UpdateProgress) => {
        if (get().status !== 'downloading') {
          return;
        }
        set({
          progressPercent: progress.percent,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.contentLength ?? null,
        });
      });

      if (get().status !== 'downloading') {
        return;
      }

      set({
        status: 'ready-to-restart',
        progressPercent: 100,
      });
    } catch (err: unknown) {
      if (get().status !== 'downloading') {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      set({
        status: 'error',
        errorMessage: message || 'Failed to download and install update',
      });
    }
  },

  restartAndApply: async (): Promise<void> => {
    try {
      await relaunchAppCleanly();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({
        status: 'error',
        errorMessage: message || 'Failed to restart application cleanly',
      });
    }
  },

  resetError: () => {
    set((state) => ({
      status: state.status === 'error' ? 'idle' : state.status,
      errorMessage: null,
    }));
  },

  reset: () => {
    set({ ...INITIAL_UPDATE_STATE });
  },
}));
