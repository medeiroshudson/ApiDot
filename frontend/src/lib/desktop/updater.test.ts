import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as runtime from './runtime';
import {
  checkDesktopUpdate,
  downloadAndInstallUpdate,
  relaunchAppCleanly,
  getActiveUpdate,
  setActiveUpdate,
  clearActiveUpdate,
  type DesktopUpdateInfo,
} from './updater';

const mockCheck = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}));

describe('desktop updater abstraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearActiveUpdate();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  afterEach(() => {
    clearActiveUpdate();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
    vi.restoreAllMocks();
  });

  describe('checkDesktopUpdate', () => {
    it('returns null immediately when isDesktop() is false', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(false);

      const result = await checkDesktopUpdate();

      expect(result).toBeNull();
      expect(mockCheck).not.toHaveBeenCalled();
      expect(getActiveUpdate()).toBeNull();
    });

    it('detects available update when Tauri Updater returns available update object', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);

      const fakeUpdate = {
        available: true,
        version: '0.6.0',
        currentVersion: '0.5.1',
        body: 'Bug fixes and performance improvements',
        date: '2026-11-04T12:00:00Z',
        downloadAndInstall: vi.fn(),
      };
      mockCheck.mockResolvedValueOnce(fakeUpdate);

      const result = await checkDesktopUpdate();

      expect(mockCheck).toHaveBeenCalledTimes(1);
      expect(result).toEqual<DesktopUpdateInfo>({
        version: '0.6.0',
        currentVersion: '0.5.1',
        body: 'Bug fixes and performance improvements',
        date: '2026-11-04T12:00:00Z',
      });
      expect(getActiveUpdate()).toBe(fakeUpdate);
    });

    it('passes custom check options to Tauri updater check()', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);

      const fakeUpdate = {
        available: true,
        version: '0.6.0',
        currentVersion: '0.5.1',
      };
      mockCheck.mockResolvedValueOnce(fakeUpdate);

      await checkDesktopUpdate({ timeout: 5000 });

      expect(mockCheck).toHaveBeenCalledWith({ timeout: 5000 });
    });

    it('returns null when Tauri updater returns null (no update available)', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
      mockCheck.mockResolvedValueOnce(null);

      const result = await checkDesktopUpdate();

      expect(result).toBeNull();
      expect(getActiveUpdate()).toBeNull();
    });

    it('returns null when Tauri updater returns an update with available: false', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
      mockCheck.mockResolvedValueOnce({
        available: false,
        version: '0.5.1',
        currentVersion: '0.5.1',
      });

      const result = await checkDesktopUpdate();

      expect(result).toBeNull();
      expect(getActiveUpdate()).toBeNull();
    });

    it('defensively handles network errors and clears active update reference', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
      mockCheck.mockRejectedValueOnce(new Error('Network connection timeout'));

      await expect(checkDesktopUpdate()).rejects.toThrow('Network connection timeout');
      expect(getActiveUpdate()).toBeNull();
    });

    it('defensively handles non-Error rejection values', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
      mockCheck.mockRejectedValueOnce('Manifest JSON parse failure');

      await expect(checkDesktopUpdate()).rejects.toThrow('Manifest JSON parse failure');
      expect(getActiveUpdate()).toBeNull();
    });
  });

  describe('downloadAndInstallUpdate', () => {
    it('is a safe no-op when isDesktop() is false', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(false);
      const onProgress = vi.fn();

      await expect(downloadAndInstallUpdate(onProgress)).resolves.toBeUndefined();
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('throws descriptive error if called in desktop without an active update', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
      clearActiveUpdate();

      await expect(downloadAndInstallUpdate()).rejects.toThrow(
        /no active update available/i
      );
    });

    it('tracks progress callbacks across Started, Progress, and Finished events', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);

      let downloadCallback: ((event: any) => void) | undefined;
      const mockDownloadAndInstall = vi.fn().mockImplementation((cb) => {
        downloadCallback = cb;
        // Simulate lifecycle events
        cb({ event: 'Started', data: { contentLength: 1000 } });
        cb({ event: 'Progress', data: { chunkLength: 250 } });
        cb({ event: 'Progress', data: { chunkLength: 500 } });
        cb({ event: 'Progress', data: { chunkLength: 250 } });
        cb({ event: 'Finished' });
        return Promise.resolve();
      });

      const fakeUpdate = {
        available: true,
        version: '0.6.0',
        currentVersion: '0.5.1',
        downloadAndInstall: mockDownloadAndInstall,
      };
      setActiveUpdate(fakeUpdate as any);

      const progressHistory: Array<{
        chunkLength: number;
        contentLength?: number;
        downloadedBytes: number;
        percent: number;
      }> = [];

      await downloadAndInstallUpdate((progress) => {
        progressHistory.push(progress);
      });

      expect(mockDownloadAndInstall).toHaveBeenCalledTimes(1);
      expect(progressHistory).toHaveLength(5);

      // Started: 0 bytes, 0%
      expect(progressHistory[0]).toEqual({
        chunkLength: 0,
        contentLength: 1000,
        downloadedBytes: 0,
        percent: 0,
      });

      // Progress 1: 250 bytes, 25%
      expect(progressHistory[1]).toEqual({
        chunkLength: 250,
        contentLength: 1000,
        downloadedBytes: 250,
        percent: 25,
      });

      // Progress 2: 750 bytes, 75%
      expect(progressHistory[2]).toEqual({
        chunkLength: 500,
        contentLength: 1000,
        downloadedBytes: 750,
        percent: 75,
      });

      // Progress 3: 1000 bytes, 100%
      expect(progressHistory[3]).toEqual({
        chunkLength: 250,
        contentLength: 1000,
        downloadedBytes: 1000,
        percent: 100,
      });

      // Finished: 1000 bytes, 100%
      expect(progressHistory[4]).toEqual({
        chunkLength: 0,
        contentLength: 1000,
        downloadedBytes: 1000,
        percent: 100,
      });
    });

    it('handles progress safely when contentLength is not provided by server', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);

      const mockDownloadAndInstall = vi.fn().mockImplementation((cb) => {
        cb({ event: 'Started', data: {} });
        cb({ event: 'Progress', data: { chunkLength: 500 } });
        cb({ event: 'Finished' });
        return Promise.resolve();
      });

      setActiveUpdate({
        available: true,
        version: '0.6.0',
        currentVersion: '0.5.1',
        downloadAndInstall: mockDownloadAndInstall,
      } as any);

      const progressHistory: any[] = [];
      await downloadAndInstallUpdate((p) => progressHistory.push(p));

      expect(progressHistory).toEqual([
        { chunkLength: 0, contentLength: undefined, downloadedBytes: 0, percent: 0 },
        { chunkLength: 500, contentLength: undefined, downloadedBytes: 500, percent: 0 },
        { chunkLength: 0, contentLength: undefined, downloadedBytes: 500, percent: 100 },
      ]);
    });

    it('executes downloadAndInstall without progress callback when omitted', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);

      const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined);
      setActiveUpdate({
        downloadAndInstall: mockDownloadAndInstall,
      } as any);

      await expect(downloadAndInstallUpdate()).resolves.toBeUndefined();
      expect(mockDownloadAndInstall).toHaveBeenCalledTimes(1);
    });

    it('defensively catches and wraps download/install failures', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);

      const mockDownloadAndInstall = vi
        .fn()
        .mockRejectedValue(new Error('Signature verification failed'));
      setActiveUpdate({
        downloadAndInstall: mockDownloadAndInstall,
      } as any);

      await expect(downloadAndInstallUpdate()).rejects.toThrow(
        'Signature verification failed'
      );
    });
  });

  describe('relaunchAppCleanly', () => {
    it('is a safe no-op when isDesktop() is false', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(false);

      await expect(relaunchAppCleanly()).resolves.toBeUndefined();
    });

    it('invokes "restart_app_cleanly" via window.__TAURI_INTERNALS__.invoke', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      await relaunchAppCleanly();

      expect(mockInvoke).toHaveBeenCalledWith('restart_app_cleanly');
    });

    it('invokes "restart_app_cleanly" via window.__TAURI__.core.invoke', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      (window as any).__TAURI__ = { core: { invoke: mockInvoke } };

      await relaunchAppCleanly();

      expect(mockInvoke).toHaveBeenCalledWith('restart_app_cleanly');
    });

    it('invokes "restart_app_cleanly" via window.__TAURI__.invoke fallback', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      (window as any).__TAURI__ = { invoke: mockInvoke };

      await relaunchAppCleanly();

      expect(mockInvoke).toHaveBeenCalledWith('restart_app_cleanly');
    });

    it('throws when running in desktop but no Tauri invoke is found', async () => {
      vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
      // No invoke method on window globals
      (window as any).__TAURI_INTERNALS__ = {};

      await expect(relaunchAppCleanly()).rejects.toThrow(
        /tauri ipc invoke is not available/i
      );
    });

    it('defensively propagates error if restart_app_cleanly fails', async () => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error('IPC call rejected'));
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      await expect(relaunchAppCleanly()).rejects.toThrow('IPC call rejected');
    });
  });
});
