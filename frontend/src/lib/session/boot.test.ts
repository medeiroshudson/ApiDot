import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensureBooted, resetBoot } from './boot';
import { sessionStore } from './state';
import { apiFetch, setUnauthorizedHandler } from '@/lib/api/client';
import { API_BASE_STORAGE_KEY } from '@/lib/api/base';
import { clearDesktopSession, loadDesktopSession } from '@/lib/desktop/session';
import { connectSidecar } from '@/lib/desktop/sidecarConnection';

vi.mock('@/lib/desktop/session', () => ({
  loadDesktopSession: vi.fn().mockResolvedValue(null),
  saveDesktopSession: vi.fn().mockResolvedValue(undefined),
  clearDesktopSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/desktop/sidecarConnection', () => ({
  connectSidecar: vi.fn().mockResolvedValue(true),
  disconnectSidecar: vi.fn().mockResolvedValue(true),
}));

const sessionFixture = {
  userId: 'u1',
  deviceId: 'dev-1',
  deviceKey: 'key-1',
  accessToken: 'tok-1',
  expiresAt: '2026-12-09T00:00:00Z',
  serverUrl: 'https://apidot.example.com',
};

const userFixture = {
  id: 'u1',
  email: 'u1@example.com',
  displayName: 'User One',
  isRoot: false,
  workspaces: [],
};

const state = () => sessionStore.getState();

const okResponse = (body: unknown = null) =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as Response;

const enableDesktop = () => {
  (window as any).__TAURI__ = {};
};

describe('session boot', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    state().reset();
    resetBoot();
    setUnauthorizedHandler(null);
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.clearAllMocks();
    vi.mocked(loadDesktopSession).mockResolvedValue(null);
    vi.mocked(connectSidecar).mockResolvedValue(true);
    fetchMock = vi.fn().mockResolvedValue(okResponse(userFixture));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    state().reset();
    resetBoot();
    setUnauthorizedHandler(null);
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.unstubAllGlobals();
  });

  it('runs a single boot for concurrent callers', async () => {
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);

    const first = ensureBooted();
    const second = ensureBooted();

    expect(second).toBe(first);
    await Promise.all([first, second]);

    expect(loadDesktopSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://apidot.example.com/api/auth/me');
  });

  it('does not register the user when the stored token is rejected', async () => {
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);

    await ensureBooted();

    expect(unauthorized).not.toHaveBeenCalled();
    expect(state().status).toBe('ready');
    expect(state().user).toBeNull();
    expect(state().accessToken).toBeNull();
    expect(state().session).toEqual({
      deviceKey: 'key-1',
      serverUrl: 'https://apidot.example.com',
    });
    expect(clearDesktopSession).toHaveBeenCalled();
    expect(connectSidecar).not.toHaveBeenCalled();
  });

  it('clears the credential on any non-ok response', async () => {
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);

    await ensureBooted();

    expect(state().status).toBe('ready');
    expect(state().accessToken).toBeNull();
    expect(state().user).toBeNull();
  });

  it('keeps the session when /me rejects at the network level', async () => {
    enableDesktop();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await ensureBooted();

    expect(state().status).toBe('ready');
    expect(state().accessToken).toBe('tok-1');
    expect(state().session).toMatchObject({ deviceKey: 'key-1' });
    expect(connectSidecar).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('survives a malformed /me body and still connects the sidecar', async () => {
    enableDesktop();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    } as unknown as Response);

    await ensureBooted();

    expect(state().status).toBe('ready');
    expect(state().user).toBeNull();
    expect(connectSidecar).toHaveBeenCalledWith('https://apidot.example.com', 'tok-1');
    consoleError.mockRestore();
  });

  it('ends ready when the sidecar connection fails', async () => {
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    vi.mocked(connectSidecar).mockResolvedValue(false);

    await ensureBooted();

    expect(state().status).toBe('ready');
    expect(state().user).toEqual(userFixture);
    expect(connectSidecar).toHaveBeenCalledWith('https://apidot.example.com', 'tok-1');
  });

  it('ends ready without a request when no session is stored', async () => {
    enableDesktop();

    await ensureBooted();

    expect(state().status).toBe('ready');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connectSidecar).not.toHaveBeenCalled();
  });

  it('ends failed, without rejecting, when the session cannot be read', async () => {
    enableDesktop();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadDesktopSession).mockRejectedValue(new Error('IPC unavailable'));

    await expect(ensureBooted()).resolves.toBeUndefined();

    expect(state().status).toBe('failed');
    consoleError.mockRestore();
  });

  it('runs the sequence again after resetBoot', async () => {
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);

    await ensureBooted();
    resetBoot();
    await ensureBooted();

    expect(loadDesktopSession).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('boots a module-level apiFetch against the configured base', async () => {
    localStorage.setItem(API_BASE_STORAGE_KEY, 'https://stored.example.com/');

    await apiFetch('/api/workspaces');

    expect(fetchMock).toHaveBeenCalledWith('https://stored.example.com/api/workspaces');
  });
});
