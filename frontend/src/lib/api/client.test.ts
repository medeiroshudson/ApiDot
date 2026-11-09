import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch } from './client';
import { setApiBase } from './base';
import { setAccessToken } from './authToken';

describe('apiFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    setApiBase(null);
    setAccessToken(null);
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
});
