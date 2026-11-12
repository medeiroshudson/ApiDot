import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startDesktopSsoFlow,
  pollDesktopSidecarSession,
  exchangeDesktopToken,
  openExternalBrowser,
} from './desktopAuth';
import * as runtime from './runtime';
import { clearSidecarInfoCache } from './runtime';
import { getAccessToken, setAccessToken } from '@/lib/api/authToken';
import { getSession, setSession } from '@/lib/api/session';

describe('desktopAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSidecarInfoCache();
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
        getState: vi.fn().mockResolvedValue('state-abc'),
        port: 54321,
        serverUrl: 'https://apidot.hmedeiros.dev',
      });

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('desktop_callback=http%3A%2F%2F127.0.0.1%3A54321%2Fauth%2Fcallback%3Fstate%3Dstate-abc')
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
        getState: vi.fn().mockResolvedValue('state-auto'),
      });

      expect(runtime.getSidecarInfo).toHaveBeenCalled();
      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('desktop_callback=http%3A%2F%2F127.0.0.1%3A42000%2Fauth%2Fcallback%3Fstate%3Dstate-auto')
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
        getState: vi.fn().mockResolvedValue('state-123'),
        port: 12345,
        serverUrl: 'https://app.apidot.dev',
        returnUrl: '/workspace/ws-1',
      });

      expect(mockOpen).toHaveBeenCalledWith(
        'https://app.apidot.dev/api/auth/login?desktop_callback=http%3A%2F%2F127.0.0.1%3A12345%2Fauth%2Fcallback%3Fstate%3Dstate-123&returnUrl=%2Fworkspace%2Fws-1'
      );
    });

    it('defaults base to window.location.origin when serverUrl is not provided', async () => {
      const mockOpen = vi.fn().mockResolvedValue(undefined);

      await startDesktopSsoFlow({
        openBrowser: mockOpen,
        pollSession: vi.fn().mockResolvedValue('tok-1'),
        exchangeToken: vi.fn().mockResolvedValue({ id: 'u1' } as any),
        getState: vi.fn().mockResolvedValue('state-default'),
        port: 12345,
      });

      expect(mockOpen).toHaveBeenCalledWith(
        `${window.location.origin}/api/auth/login?desktop_callback=http%3A%2F%2F127.0.0.1%3A12345%2Fauth%2Fcallback%3Fstate%3Dstate-default`
      );
    });

    it('handles cancellation via AbortSignal gracefully', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await startDesktopSsoFlow({
        openBrowser: vi.fn().mockResolvedValue(undefined),
        pollSession: vi.fn().mockResolvedValue(null),
        exchangeToken: vi.fn(),
        getState: vi.fn().mockResolvedValue('state-cancel'),
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
        getState: vi.fn().mockResolvedValue('state-timeout'),
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
        getState: vi.fn().mockResolvedValue('state-exchange'),
        port: 54321,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or expired token');
    });

    it('aborts the sign-in when the sidecar auth state cannot be obtained', async () => {
      const mockOpen = vi.fn().mockResolvedValue(undefined);

      const result = await startDesktopSsoFlow({
        openBrowser: mockOpen,
        pollSession: vi.fn(),
        exchangeToken: vi.fn(),
        getState: vi.fn().mockRejectedValue(new Error('Failed to obtain sidecar auth state (401)')),
        port: 54321,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to obtain sidecar auth state (401)');
      expect(mockOpen).not.toHaveBeenCalled();
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

    it('returns null when timeout is reached without token and cleans up abort listener', async () => {
      const controller = new AbortController();
      const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: null }),
      } as Response);

      const token = await pollDesktopSidecarSession(54321, 'my-secret', {
        signal: controller.signal,
        intervalMs: 10,
        timeoutMs: 30,
      });

      expect(token).toBeNull();
      expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
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

    it('persists the device credential and connects the sidecar after a desktop exchange', async () => {
      const invoke = vi.fn().mockImplementation(async (cmd: string) => {
        if (cmd === 'get_sidecar_info') {
          return { port: 43210, secret: 'sidecar-secret' };
        }
        return undefined;
      });
      (window as any).__TAURI__ = { core: { invoke } };

      const mockUser = { id: 'u100', email: 'user@apidot.dev', displayName: 'Dev' };
      const headers = new Headers({
        'X-Desktop-Access-Token': 'device-token-abc',
        'X-Desktop-Access-Token-Expires': '2026-12-09T00:00:00.0000000Z',
        'X-Desktop-Device-Id': '11111111-1111-1111-1111-111111111111',
        'X-Desktop-Device-Key': 'machine-key-1',
      });

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/auth/desktop-exchange')) {
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => mockUser,
          } as unknown as Response;
        }
        return { ok: true, status: 204 } as Response;
      });
      global.fetch = fetchMock;

      await exchangeDesktopToken('desktop-token-xyz', 'https://api.apidot.dev');

      expect(getAccessToken()).toBe('device-token-abc');
      expect(getSession()).toMatchObject({
        userId: 'u100',
        deviceId: '11111111-1111-1111-1111-111111111111',
        deviceKey: 'machine-key-1',
        accessToken: 'device-token-abc',
        expiresAt: '2026-12-09T00:00:00.0000000Z',
        serverUrl: 'https://api.apidot.dev',
      });
      expect(invoke).toHaveBeenCalledWith('save_session', {
        session: {
          user_id: 'u100',
          device_id: '11111111-1111-1111-1111-111111111111',
          device_key: 'machine-key-1',
          access_token: 'device-token-abc',
          expires_at: '2026-12-09T00:00:00.0000000Z',
          server_url: 'https://api.apidot.dev',
        },
      });
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:43210/connect', {
        method: 'POST',
        headers: {
          'X-ApiDot-Sidecar-Secret': 'sidecar-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverUrl: 'https://api.apidot.dev',
          token: 'device-token-abc',
        }),
      });

      delete (window as any).__TAURI__;
      setSession(null);
      setAccessToken(null);
    });

    it('does not fail the login when the sidecar /connect call fails', async () => {
      const invoke = vi.fn().mockImplementation(async (cmd: string) => {
        if (cmd === 'get_sidecar_info') {
          return { port: 43210, secret: 'sidecar-secret' };
        }
        return undefined;
      });
      (window as any).__TAURI__ = { core: { invoke } };
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockUser = { id: 'u100', email: 'user@apidot.dev', displayName: 'Dev' };
      const headers = new Headers({
        'X-Desktop-Access-Token': 'device-token-abc',
        'X-Desktop-Device-Id': '11111111-1111-1111-1111-111111111111',
      });

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/auth/desktop-exchange')) {
          return {
            ok: true,
            status: 200,
            headers,
            json: async () => mockUser,
          } as unknown as Response;
        }
        return { ok: false, status: 500 } as Response;
      });
      global.fetch = fetchMock;

      const user = await exchangeDesktopToken('desktop-token-xyz', 'https://api.apidot.dev');

      expect(user).toEqual(mockUser);
      expect(getAccessToken()).toBe('device-token-abc');
      expect(getSession()).toMatchObject({
        serverUrl: 'https://api.apidot.dev',
        accessToken: 'device-token-abc',
      });

      delete (window as any).__TAURI__;
      setSession(null);
      setAccessToken(null);
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

    it('resolves relative URLs to absolute URLs using window.location.origin before invoking Tauri IPC', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(undefined);
      (window as any).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      await openExternalBrowser('/api/auth/login?desktop_callback=http%3A%2F%2F127.0.0.1%3A123%2Fauth%2Fcallback');

      expect(mockInvoke).toHaveBeenCalledWith('plugin:shell|open', {
        path: `${window.location.origin}/api/auth/login?desktop_callback=http%3A%2F%2F127.0.0.1%3A123%2Fauth%2Fcallback`,
      });
    });
  });
});
