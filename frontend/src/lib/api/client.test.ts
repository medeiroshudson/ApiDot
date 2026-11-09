import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch, setUnauthorizedHandler } from './client';
import { setApiBase } from './base';
import { setAccessToken } from './authToken';

describe('apiFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    setApiBase(null);
    setAccessToken(null);
    setUnauthorizedHandler(null);
    fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps relative calls and the exact options object without a base', async () => {
    const init: RequestInit = { method: 'POST', body: '{}' };

    await apiFetch('/api/workspaces', init);

    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces', init);
  });

  it('calls fetch with a single argument when no init is supplied', async () => {
    await apiFetch('/api/auth/config');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/config');
  });

  it('resolves the path against the configured base', async () => {
    setApiBase('https://apidot.example.com/');

    await apiFetch('/api/workspaces');

    expect(fetchMock).toHaveBeenCalledWith('https://apidot.example.com/api/workspaces');
  });

  it('does not attach a bearer token when none is set', async () => {
    await apiFetch('/api/workspaces', { method: 'GET' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init).toEqual({ method: 'GET' });
  });

  it('attaches the bearer token when one exists', async () => {
    setAccessToken('token-123');

    await apiFetch('/api/workspaces', { method: 'GET' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('preserves a caller-supplied Authorization header', async () => {
    setAccessToken('token-123');

    await apiFetch('/api/workspaces', {
      headers: { Authorization: 'Bearer custom' },
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer custom');
  });

  describe('unauthorized handler', () => {
    it('invokes the handler once for a 401 on a token-authenticated request', async () => {
      setAccessToken('token-123');
      fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);
      const handler = vi.fn(() => {
        setAccessToken(null);
      });
      setUnauthorizedHandler(handler);

      await Promise.all([
        apiFetch('/api/auth/me'),
        apiFetch('/api/workspaces'),
        apiFetch('/api/agent/devices'),
      ]);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not invoke the handler without a bearer token', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);
      const handler = vi.fn();
      setUnauthorizedHandler(handler);

      await apiFetch('/api/auth/me');

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not invoke the handler for non-401 responses', async () => {
      setAccessToken('token-123');
      fetchMock.mockResolvedValue({ ok: false, status: 403 } as Response);
      const handler = vi.fn();
      setUnauthorizedHandler(handler);

      await apiFetch('/api/workspaces');

      expect(handler).not.toHaveBeenCalled();
    });

    it('handles a later 401 after a new token is issued', async () => {
      setAccessToken('token-123');
      fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);
      const handler = vi.fn(() => {
        setAccessToken(null);
      });
      setUnauthorizedHandler(handler);

      await apiFetch('/api/auth/me');
      setAccessToken('token-456');
      await apiFetch('/api/auth/me');

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('stops calling a handler that was unsubscribed', async () => {
      setAccessToken('token-123');
      fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);
      const handler = vi.fn();
      const unsubscribe = setUnauthorizedHandler(handler);

      unsubscribe();
      await apiFetch('/api/auth/me');

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
