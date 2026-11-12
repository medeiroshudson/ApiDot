import React from 'react';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiBaseBootstrap } from './ApiBaseBootstrap';
import { API_BASE_STORAGE_KEY, getApiBase, setApiBase } from '@/lib/api/base';
import { getAccessToken, setAccessToken } from '@/lib/api/authToken';
import { getSession, setSession } from '@/lib/api/session';
import { setUnauthorizedHandler } from '@/lib/api/client';
import {
  clearDesktopSession,
  loadDesktopSession,
} from '@/lib/desktop/session';
import {
  connectSidecar,
  disconnectSidecar,
} from '@/lib/desktop/sidecarConnection';
import { useAuthStore } from '@/stores/useAuthStore';

const routerMock = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

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

const renderWithChild = () =>
  render(
    <ApiBaseBootstrap>
      <div>app content</div>
    </ApiBaseBootstrap>
  );

describe('ApiBaseBootstrap', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    setApiBase(null);
    setSession(null);
    setAccessToken(null);
    setUnauthorizedHandler(null);
    useAuthStore.getState().reset();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.clearAllMocks();
    vi.mocked(loadDesktopSession).mockResolvedValue(null);
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null,
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    setSession(null);
    setAccessToken(null);
    setUnauthorizedHandler(null);
    useAuthStore.getState().reset();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.unstubAllGlobals();
  });

  it('reads the stored base on mount', () => {
    localStorage.setItem(API_BASE_STORAGE_KEY, 'https://apidot.example.com/');

    renderWithChild();

    expect(getApiBase()).toBe('https://apidot.example.com');
  });

  it('leaves the base empty without a stored value', () => {
    renderWithChild();

    expect(getApiBase()).toBe('');
  });

  it('renders the children immediately on the web', () => {
    renderWithChild();

    expect(screen.getByText('app content')).toBeInTheDocument();
    expect(loadDesktopSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('holds the children on desktop until the session hydration resolves', async () => {
    (window as any).__TAURI__ = {};
    let resolveHydration: (session: typeof sessionFixture | null) => void = () => {};
    vi.mocked(loadDesktopSession).mockReturnValue(
      new Promise((resolve) => {
        resolveHydration = resolve;
      })
    );

    renderWithChild();

    expect(screen.queryByText('app content')).not.toBeInTheDocument();

    resolveHydration(sessionFixture);

    await waitFor(() => {
      expect(screen.getByText('app content')).toBeInTheDocument();
    });
  });

  it('validates the stored session with the bearer token, then connects the sidecar', async () => {
    (window as any).__TAURI__ = {};
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);

    renderWithChild();

    // The route may only render once the token is in the client, so the request
    // it issues afterwards cannot race the hydration.
    await waitFor(() => {
      expect(connectSidecar).toHaveBeenCalledWith(sessionFixture.serverUrl, 'tok-1');
    });

    expect(screen.getByText('app content')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://apidot.example.com/api/auth/me');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok-1');
    expect(getApiBase()).toBe('https://apidot.example.com');
    expect(getAccessToken()).toBe('tok-1');
    expect(getSession()).toMatchObject({ deviceId: 'dev-1', deviceKey: 'key-1' });
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('populates the auth store from the hydrated session', async () => {
    (window as any).__TAURI__ = {};
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'u1',
        email: 'u1@example.com',
        displayName: 'User One',
        isRoot: false,
        workspaces: [],
      }),
    } as unknown as Response);

    renderWithChild();

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    expect(useAuthStore.getState().user?.id).toBe('u1');
    expect(screen.getByText('app content')).toBeInTheDocument();
  });

  it('still boots when the session user body is malformed', async () => {
    (window as any).__TAURI__ = {};
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    } as unknown as Response);

    renderWithChild();

    await waitFor(() => {
      expect(connectSidecar).toHaveBeenCalled();
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.getByText('app content')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('clears and disconnects when the stored token is rejected', async () => {
    (window as any).__TAURI__ = {};
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);

    renderWithChild();

    await waitFor(() => {
      expect(clearDesktopSession).toHaveBeenCalled();
    });

    expect(disconnectSidecar).toHaveBeenCalled();
    expect(connectSidecar).not.toHaveBeenCalled();
    expect(routerMock.replace).toHaveBeenCalledWith('/login');
    expect(getAccessToken()).toBeNull();
    // The machine identity survives so the next login reuses the device row.
    expect(getSession()).toMatchObject({
      deviceKey: 'key-1',
      serverUrl: 'https://apidot.example.com',
    });
  });

  it('does not call the server without a stored session', async () => {
    (window as any).__TAURI__ = {};
    vi.mocked(loadDesktopSession).mockResolvedValue(null);

    renderWithChild();

    await waitFor(() => {
      expect(loadDesktopSession).toHaveBeenCalled();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(connectSidecar).not.toHaveBeenCalled();
  });

  it('releases the children when the hydration fails', async () => {
    (window as any).__TAURI__ = {};
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadDesktopSession).mockRejectedValue(new Error('IPC unavailable'));

    renderWithChild();

    expect(screen.queryByText('app content')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('app content')).toBeInTheDocument();
    });

    expect(connectSidecar).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
