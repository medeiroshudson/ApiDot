import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as updaterModule from '@/lib/desktop/updater';
import {
  useUpdateStore,
  INITIAL_UPDATE_STATE,
  type UpdateStatus,
} from './useUpdateStore';

vi.mock('@/lib/desktop/updater', () => ({
  checkDesktopUpdate: vi.fn(),
  downloadAndInstallUpdate: vi.fn(),
  relaunchAppCleanly: vi.fn(),
}));

describe('useUpdateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdateStore.setState({ ...INITIAL_UPDATE_STATE });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Initial State & Constants', () => {
    it('initializes with default idle state and zeroed progress', () => {
      const state = useUpdateStore.getState();

      expect(state.status).toBe('idle');
      expect(state.availableVersion).toBeNull();
      expect(state.currentVersion).toBeNull();
      expect(state.releaseNotes).toBeNull();
      expect(state.releaseDate).toBeNull();
      expect(state.progressPercent).toBe(0);
      expect(state.downloadedBytes).toBe(0);
      expect(state.totalBytes).toBeNull();
      expect(state.errorMessage).toBeNull();
      expect(state.lastCheckedAt).toBeNull();
    });

    it('matches INITIAL_UPDATE_STATE snapshot', () => {
      expect(INITIAL_UPDATE_STATE).toEqual({
        status: 'idle',
        availableVersion: null,
        currentVersion: null,
        releaseNotes: null,
        releaseDate: null,
        progressPercent: 0,
        downloadedBytes: 0,
        totalBytes: null,
        errorMessage: null,
        lastCheckedAt: null,
      });
    });
  });

  describe('2. checkForUpdates', () => {
    it('handles automatic check when update is available', async () => {
      const mockUpdate: updaterModule.DesktopUpdateInfo = {
        version: '0.6.0',
        currentVersion: '0.5.1',
        body: 'Performance improvements and bug fixes',
        date: '2026-11-04T12:00:00Z',
      };
      vi.mocked(updaterModule.checkDesktopUpdate).mockResolvedValueOnce(mockUpdate);

      const checkPromise = useUpdateStore.getState().checkForUpdates(false);
      // Immediately after invocation, status should transition to 'checking'
      expect(useUpdateStore.getState().status).toBe('checking');
      expect(useUpdateStore.getState().errorMessage).toBeNull();

      await checkPromise;

      const state = useUpdateStore.getState();
      expect(updaterModule.checkDesktopUpdate).toHaveBeenCalledTimes(1);
      expect(state.status).toBe('available');
      expect(state.availableVersion).toBe('0.6.0');
      expect(state.currentVersion).toBe('0.5.1');
      expect(state.releaseNotes).toBe('Performance improvements and bug fixes');
      expect(state.releaseDate).toBe('2026-11-04T12:00:00Z');
      expect(state.lastCheckedAt).toBeInstanceOf(Date);
      expect(state.errorMessage).toBeNull();
    });

    it('handles manual check when application is up-to-date', async () => {
      vi.mocked(updaterModule.checkDesktopUpdate).mockResolvedValueOnce(null);

      // Pre-seed available version to verify it gets cleared when up to date
      useUpdateStore.setState({
        availableVersion: '0.6.0',
        releaseNotes: 'old notes',
      });

      const checkPromise = useUpdateStore.getState().checkForUpdates(true);
      expect(useUpdateStore.getState().status).toBe('checking');

      await checkPromise;

      const state = useUpdateStore.getState();
      expect(updaterModule.checkDesktopUpdate).toHaveBeenCalledTimes(1);
      expect(state.status).toBe('up-to-date');
      expect(state.availableVersion).toBeNull();
      expect(state.releaseNotes).toBeNull();
      expect(state.lastCheckedAt).toBeInstanceOf(Date);
      expect(state.errorMessage).toBeNull();
    });

    it('clears previous errorMessage upon starting a new check', async () => {
      useUpdateStore.setState({
        status: 'error',
        errorMessage: 'Previous network timeout',
      });

      vi.mocked(updaterModule.checkDesktopUpdate).mockResolvedValueOnce(null);

      const checkPromise = useUpdateStore.getState().checkForUpdates();
      expect(useUpdateStore.getState().errorMessage).toBeNull();
      expect(useUpdateStore.getState().status).toBe('checking');

      await checkPromise;
      expect(useUpdateStore.getState().status).toBe('up-to-date');
    });

    it('handles network error during checkDesktopUpdate', async () => {
      vi.mocked(updaterModule.checkDesktopUpdate).mockRejectedValueOnce(
        new Error('Failed to reach release endpoint')
      );

      await useUpdateStore.getState().checkForUpdates();

      const state = useUpdateStore.getState();
      expect(state.status).toBe('error');
      expect(state.errorMessage).toBe('Failed to reach release endpoint');
    });

    it('uses errorCheck fallback when thrown error has an empty message', async () => {
      vi.mocked(updaterModule.checkDesktopUpdate).mockRejectedValueOnce(new Error(''));

      await useUpdateStore.getState().checkForUpdates();

      const state = useUpdateStore.getState();
      expect(state.status).toBe('error');
      expect(state.errorMessage).toBe('errorCheck');
    });

    it('handles non-Error rejection values during check', async () => {
      vi.mocked(updaterModule.checkDesktopUpdate).mockRejectedValueOnce('Unknown connection failure');

      await useUpdateStore.getState().checkForUpdates();

      const state = useUpdateStore.getState();
      expect(state.status).toBe('error');
      expect(state.errorMessage).toBe('Unknown connection failure');
    });

    it('does not run check if currently downloading an update', async () => {
      useUpdateStore.setState({ status: 'downloading' });

      await useUpdateStore.getState().checkForUpdates();

      expect(updaterModule.checkDesktopUpdate).not.toHaveBeenCalled();
      expect(useUpdateStore.getState().status).toBe('downloading');
    });
  });

  describe('3. downloadAndInstall', () => {
    it('blocks concurrent download invocations if status is downloading', async () => {
      useUpdateStore.setState({ status: 'downloading' });

      await useUpdateStore.getState().downloadAndInstall();

      expect(updaterModule.downloadAndInstallUpdate).not.toHaveBeenCalled();
    });

    it('transitions to downloading and updates progress via callback', async () => {
      let progressCb: ((progress: updaterModule.UpdateProgress) => void) | undefined;

      vi.mocked(updaterModule.downloadAndInstallUpdate).mockImplementationOnce(
        async (onProgress) => {
          progressCb = onProgress;
          if (progressCb) {
            progressCb({
              chunkLength: 1024,
              contentLength: 4096,
              downloadedBytes: 1024,
              percent: 25,
            });
            progressCb({
              chunkLength: 2048,
              contentLength: 4096,
              downloadedBytes: 3072,
              percent: 75,
            });
            progressCb({
              chunkLength: 1024,
              contentLength: 4096,
              downloadedBytes: 4096,
              percent: 100,
            });
          }
        }
      );

      useUpdateStore.setState({ status: 'available', availableVersion: '0.6.0' });

      await useUpdateStore.getState().downloadAndInstall();

      const state = useUpdateStore.getState();
      expect(updaterModule.downloadAndInstallUpdate).toHaveBeenCalledTimes(1);
      expect(state.status).toBe('ready-to-restart');
      expect(state.progressPercent).toBe(100);
      expect(state.downloadedBytes).toBe(4096);
      expect(state.totalBytes).toBe(4096);
    });

    it('handles download failure and sets error state', async () => {
      vi.mocked(updaterModule.downloadAndInstallUpdate).mockRejectedValueOnce(
        new Error('Disk write permission denied')
      );

      useUpdateStore.setState({ status: 'available', availableVersion: '0.6.0' });

      await useUpdateStore.getState().downloadAndInstall();

      const state = useUpdateStore.getState();
      expect(state.status).toBe('error');
      expect(state.errorMessage).toBe('Disk write permission denied');
    });

    it('handles download failure with non-Error rejection', async () => {
      vi.mocked(updaterModule.downloadAndInstallUpdate).mockRejectedValueOnce('Socket aborted');

      useUpdateStore.setState({ status: 'available', availableVersion: '0.6.0' });

      await useUpdateStore.getState().downloadAndInstall();

      const state = useUpdateStore.getState();
      expect(state.status).toBe('error');
      expect(state.errorMessage).toBe('Socket aborted');
    });
  });

  describe('4. restartAndApply', () => {
    it('calls relaunchAppCleanly IPC bridge cleanly', async () => {
      vi.mocked(updaterModule.relaunchAppCleanly).mockResolvedValueOnce();

      useUpdateStore.setState({ status: 'ready-to-restart' });

      await useUpdateStore.getState().restartAndApply();

      expect(updaterModule.relaunchAppCleanly).toHaveBeenCalledTimes(1);
    });

    it('handles IPC failure during relaunchAppCleanly', async () => {
      vi.mocked(updaterModule.relaunchAppCleanly).mockRejectedValueOnce(
        new Error('Sidecar termination failed')
      );

      useUpdateStore.setState({ status: 'ready-to-restart' });

      await useUpdateStore.getState().restartAndApply();

      const state = useUpdateStore.getState();
      expect(state.status).toBe('error');
      expect(state.errorMessage).toBe('Sidecar termination failed');
    });
  });

  describe('5. resetError and reset', () => {
    it('clears error and resets status to idle when status is error', () => {
      useUpdateStore.setState({
        status: 'error',
        errorMessage: 'Something broke',
      });

      useUpdateStore.getState().resetError();

      const state = useUpdateStore.getState();
      expect(state.status).toBe('idle');
      expect(state.errorMessage).toBeNull();
    });

    it('clears error without changing status when status is not error', () => {
      useUpdateStore.setState({
        status: 'available',
        errorMessage: 'Transient warning',
      });

      useUpdateStore.getState().resetError();

      const state = useUpdateStore.getState();
      expect(state.status).toBe('available');
      expect(state.errorMessage).toBeNull();
    });

    it('resets entire store to initial state', () => {
      useUpdateStore.setState({
        status: 'ready-to-restart',
        availableVersion: '0.6.0',
        currentVersion: '0.5.1',
        releaseNotes: 'Some notes',
        releaseDate: '2026-11-04',
        progressPercent: 100,
        downloadedBytes: 1000,
        totalBytes: 1000,
        errorMessage: 'Some error',
        lastCheckedAt: new Date(),
      });

      useUpdateStore.getState().reset();

      const state = useUpdateStore.getState();
      expect(state).toEqual({
        status: 'idle',
        availableVersion: null,
        currentVersion: null,
        releaseNotes: null,
        releaseDate: null,
        progressPercent: 0,
        downloadedBytes: 0,
        totalBytes: null,
        errorMessage: null,
        lastCheckedAt: null,
        checkForUpdates: expect.any(Function),
        downloadAndInstall: expect.any(Function),
        restartAndApply: expect.any(Function),
        resetError: expect.any(Function),
        reset: expect.any(Function),
      });
    });
  });
});
