import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startDesktopSsoFlow,
  pollDesktopSidecarSession,
  exchangeDesktopToken,
  openExternalBrowser,
} from './desktopAuth';
import * as runtime from './runtime';

describe('desktopAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startDesktopSsoFlow', () => {
    it('initiates desktop SSO flow, opens browser, polls sidecar session and exchanges token', async () => {
      const mockOpen = vi.fn().mockResolvedValue(undefined);
      const mockExchange = vi.fn().mockResolvedValue({ id: 'u1', email: 'test@hmedeiros.dev' });

      const result = await startDesktopSsoFlow({
        openBrowser: mockOpen,
        pollSession: vi.fn().mockResolvedValue('exchange-token-123'),
        exchangeToken: mockExchange,
        port: 54321,
        serverUrl: 'https://apidot.hmedeiros.dev',
      });

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('desktop_callback=http%3A%2F%2F127.0.0.1%3A54321%2Fauth%2Fcallback')
      );
      expect(result.success).toBe(true);
      expect(result.user).toEqual({ id: 'u1', email: 'test@hmedeiros.dev' });
    });

    it('retrieves port and secret from getSidecarInfo when not explicitly provided', async () => {
      vi.spyOn(runtime, 'getSidecarInfo').mockResolvedValue({ port: 42000, secret: 'sidecar-sec' });
      const mockOpen = vi.fn().mockResolvedValue(undefined);
      const mockPoll = vi.fn().mockResolvedValue('tok-auto');
      const mockExchange = vi.fn().mockResolvedValue({ id: 'u2', email: 'auto@test.com' });

      const result = await startDesktopSsoFlow({
        openBrowser: mockOpen,
        pollSession: mockPoll,
        exchangeToken: mockExchange,
      });

      expect(runtime.getSidecarInfo).toHaveBeenCalled();
      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('desktop_callback=http%3A%2F%2F127.0.0.1%3A42000%2Fauth%2Fcallback')
      );
      expect(mockPoll).toHaveBeenCalledWith(42000, 'sidecar-sec', expect.any(Object));
      expect(mockExchange).toHaveBeenCalledWith('tok-auto', undefined);
      expect(result.success).toBe(true);
    });

    it('includes returnUrl in desktop login URL when provided', async () => {
      const mockOpen = vi.fn().mockResolvedValue(undefined);

      await startDesktopSsoFlow({
        openBrowser: mockOpen,
        pollSession: vi.fn().mockResolvedValue('tok-1'),
        exchangeToken: vi.fn().mockResolvedValue({ id: 'u1' } as any),
        port: 12345,
        serverUrl: 'https://app.apidot.dev',
        returnUrl: '/workspace/ws-1',
      });

      expect(mockOpen).toHaveBeenCalledWith(
        'https://app.apidot.dev/api/auth/login?desktop_callback=http%3A%2F%2F127.0.0.1%3A12345%2Fauth%2Fcallback&returnUrl=%2Fworkspace%2Fws-1'
      );
    });

    it('handles cancellation via AbortSignal gracefully', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await startDesktopSsoFlow({
        openBrowser: vi.fn().mockResolvedValue(undefined),
        pollSession: vi.fn().mockResolvedValue(null),
        exchangeToken: vi.fn(),
        port: 54321,
        signal: controller.signal,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication cancelled');
    });

    it('returns error when polling times out and returns null token', async () => {
      const result = await startDesktopSsoFlow({
        openBrowser: vi.fn().mockResolvedValue(undefined),
        pollSession: vi.fn().mockResolvedValue(null),
        exchangeToken: vi.fn(),
        port: 54321,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication timed out. Please try again.');
    });

    it('returns error when exchangeToken throws an error', async () => {
      const result = await startDesktopSsoFlow({
        openBrowser: vi.fn().mockResolvedValue(undefined),
        pollSession: vi.fn().mockResolvedValue('invalid-tok'),
        exchangeToken: vi.fn().mockRejectedValue(new Error('Invalid or expired token')),
        port: 54321,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or expired token');
    });
  });

  describe('pollDesktopSidecarSession', () => {
    it('polls loopback endpoint with X-ApiDot-Sidecar-Secret header until token is returned', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toBe('http://127.0.0.1:54321/auth/session');
        expect(init?.headers).toEqual(expect.objectContaining({
          'X-ApiDot-Sidecar-Secret': 'my-secret',
        }));

        callCount++;
        if (callCount < 2) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ token: null }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ token: 'ready-token-abc' }),
        } as Response;
      });

      const token = await pollDesktopSidecarSession(54321, 'my-secret', {
        intervalMs: 10,
        timeoutMs: 1000,
      });

      expect(token).toBe('ready-token-abc');
      expect(callCount).toBe(2);
    });

    it('aborts immediately and returns null when AbortSignal is triggered', async () => {
      const controller = new AbortController();
      controller.abort();

      const token = await pollDesktopSidecarSession(54321, 'my-secret', {
        signal: controller.signal,
        intervalMs: 10,
        timeoutMs: 1000,
      });

      expect(token).toBeNull();
    });

    it('returns null when timeout is reached without token', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: null }),
      } as Response);

      const token = await pollDesktopSidecarSession(54321, 'my-secret', {
        intervalMs: 10,
        timeoutMs: 30,
      });

      expect(token).toBeNull();
    });
  });

  describe('exchangeDesktopToken', () => {
    it('sends POST to /api/auth/desktop-exchange with token in body and returns AuthUser', async () => {
      const mockUser = { id: 'u100', email: 'user@apidot.dev', displayName: 'Dev' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockUser,
      } as Response);

      const user = await exchangeDesktopToken('desktop-token-xyz', 'https://api.apidot.dev');

      expect(global.fetch).toHaveBeenCalledWith('https://api.apidot.dev/api/auth/desktop-exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: 'desktop-token-xyz' }),
      });
      expect(user).toEqual(mockUser);
    });

    it('throws error when server responds with 401 ProblemDetails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Desktop exchange token has expired.' }),
      } as Response);

      await expect(exchangeDesktopToken('expired-token')).rejects.toThrow(
        'Desktop exchange token has expired.'
      );
    });
  });

  describe('openExternalBrowser', () => {
    it('uses Tauri IPC plugin:shell|open when available', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      (window as any).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      await openExternalBrowser('https://apidot.hmedeiros.dev/auth');

      expect(mockInvoke).toHaveBeenCalledWith('plugin:shell|open', {
        path: 'https://apidot.hmedeiros.dev/auth',
      });
    });

    it('falls back to window.open when Tauri IPC is not present', async () => {
      const mockWindowOpen = vi.fn();
      window.open = mockWindowOpen;

      await openExternalBrowser('https://apidot.hmedeiros.dev/fallback');

      expect(mockWindowOpen).toHaveBeenCalledWith('https://apidot.hmedeiros.dev/fallback', '_blank');
    });
  });
});
