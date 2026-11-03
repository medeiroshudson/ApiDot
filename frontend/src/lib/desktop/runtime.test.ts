import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDesktop,
  getSidecarInfo,
  setCachedSidecarInfo,
  clearSidecarInfoCache,
  getCachedSidecarInfo,
  listenDesktopEvent,
} from './runtime';

describe('runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSidecarInfoCache();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    clearSidecarInfoCache();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  describe('isDesktop', () => {
    it('returns false when neither __TAURI__ nor __TAURI_INTERNALS__ is set', () => {
      expect(isDesktop()).toBe(false);
    });

    it('returns true when __TAURI_INTERNALS__ is set', () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      expect(isDesktop()).toBe(true);
    });

    it('returns true when __TAURI__ is set', () => {
      (window as any).__TAURI__ = {};
      expect(isDesktop()).toBe(true);
    });
  });

  describe('getSidecarInfo', () => {
    it('returns cached sidecar info if available', async () => {
      setCachedSidecarInfo({ port: 12345, secret: 'test-secret' });
      const info = await getSidecarInfo();
      expect(info).toEqual({ port: 12345, secret: 'test-secret' });
      expect(getCachedSidecarInfo()).toEqual({ port: 12345, secret: 'test-secret' });
    });

    it('throws when not running in desktop environment', async () => {
      await expect(getSidecarInfo()).rejects.toThrow('Not running in Tauri desktop environment');
    });

    it('retrieves sidecar info via Tauri IPC and caches it', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({ port: 54321, secret: 'ipc-secret' });
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      const info = await getSidecarInfo();
      expect(mockInvoke).toHaveBeenCalledWith('get_sidecar_info');
      expect(info).toEqual({ port: 54321, secret: 'ipc-secret' });
      expect(getCachedSidecarInfo()).toEqual({ port: 54321, secret: 'ipc-secret' });
    });

    it('throws when IPC returns invalid payload', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({ port: 'not-a-number', secret: 123 });
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      await expect(getSidecarInfo()).rejects.toThrow('Invalid sidecar info received from Tauri IPC');
    });
  });

  describe('listenDesktopEvent', () => {
    it('returns a no-op unlisten function when not in desktop mode', async () => {
      const handler = vi.fn();
      const unlisten = await listenDesktopEvent('test-event', handler);

      expect(typeof unlisten).toBe('function');
      unlisten();
      expect(handler).not.toHaveBeenCalled();
    });

    it('subscribes via window.__TAURI__.event.listen and unpacks payload object', async () => {
      let registeredCb: ((e: any) => void) | undefined;
      const mockUnlisten = vi.fn();
      const listenMock = vi.fn((event: string, cb: any) => {
        registeredCb = cb;
        return Promise.resolve(mockUnlisten);
      });

      (window as any).__TAURI__ = {
        event: {
          listen: listenMock,
        },
      };

      const handler = vi.fn();
      const unlisten = await listenDesktopEvent('custom-event', handler);

      expect(listenMock).toHaveBeenCalledWith('custom-event', expect.any(Function));

      // Simulate event firing with Tauri Event object format { event, id, payload }
      registeredCb?.({ event: 'custom-event', id: 1, payload: { foo: 'bar' } });
      expect(handler).toHaveBeenCalledWith({ foo: 'bar' });

      unlisten();
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });

    it('subscribes via window.__TAURI__.listen when event.listen is not present', async () => {
      let registeredCb: ((e: any) => void) | undefined;
      const mockUnlisten = vi.fn();
      const listenMock = vi.fn((event: string, cb: any) => {
        registeredCb = cb;
        return Promise.resolve(mockUnlisten);
      });

      (window as any).__TAURI__ = {
        listen: listenMock,
      };

      const handler = vi.fn();
      const unlisten = await listenDesktopEvent('direct-event', handler);

      expect(listenMock).toHaveBeenCalledWith('direct-event', expect.any(Function));

      registeredCb?.('direct-data');
      expect(handler).toHaveBeenCalledWith('direct-data');

      unlisten();
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });

    it('subscribes via window.__TAURI_INTERNALS__.listen when global listen is not present', async () => {
      let registeredCb: ((e: any) => void) | undefined;
      const mockUnlisten = vi.fn();
      const listenMock = vi.fn((event: string, cb: any) => {
        registeredCb = cb;
        return mockUnlisten;
      });

      (window as any).__TAURI_INTERNALS__ = {
        listen: listenMock,
      };

      const handler = vi.fn();
      const unlisten = await listenDesktopEvent('internals-event', handler);

      expect(listenMock).toHaveBeenCalledWith('internals-event', expect.any(Function));

      registeredCb?.({ payload: 'unpacked' });
      expect(handler).toHaveBeenCalledWith('unpacked');

      unlisten();
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });

    it('supports window CustomEvent fallback in desktop environment', async () => {
      (window as any).__TAURI__ = {}; // isDesktop() is true, but no listenFn

      const handler = vi.fn();
      const unlisten = await listenDesktopEvent('window-fallback-event', handler);

      window.dispatchEvent(
        new CustomEvent('window-fallback-event', { detail: { sample: 42 } })
      );

      expect(handler).toHaveBeenCalledWith({ sample: 42 });

      unlisten();

      window.dispatchEvent(
        new CustomEvent('window-fallback-event', { detail: { sample: 99 } })
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('handles errors during listener registration gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (window as any).__TAURI__ = {
        event: {
          listen: vi.fn().mockRejectedValue(new Error('IPC permission denied')),
        },
      };

      const handler = vi.fn();
      const unlisten = await listenDesktopEvent('error-event', handler);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(typeof unlisten).toBe('function');
      unlisten();
    });
  });
});
