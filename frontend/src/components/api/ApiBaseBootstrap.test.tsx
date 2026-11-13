import React from 'react';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiBaseBootstrap } from './ApiBaseBootstrap';
import { getApiBase } from '@/lib/api/base';
import { getAccessToken } from '@/lib/api/authToken';
import { getSession } from '@/lib/api/session';
import { apiFetch, setUnauthorizedHandler } from '@/lib/api/client';
import { resetBoot } from '@/lib/session/boot';
import { sessionStore } from '@/lib/session/state';
import { clearDesktopSession, loadDesktopSession } from '@/lib/desktop/session';
import { connectSidecar, disconnectSidecar } from '@/lib/desktop/sidecarConnection';
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

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APIDOT_API_BASE = 'https://apidot.example.com';
});

const sessionFixture = {
  userId: 'u1',
  deviceId: 'dev-1',
  deviceKey: 'key-1',
  accessToken: 'tok-1',
  expiresAt: '2026-12-09T00:00:00Z',
};

const userFixture = {
  id: 'u1',
  email: 'u1@example.com',
  displayName: 'User One',
  isRoot: false,
  workspaces: [],
};

const renderWithChild = () =>
  render(
    <ApiBaseBootstrap>
      <div>app content</div>
    </ApiBaseBootstrap>
  );

const enableDesktop = () => {
  (window as any).__TAURI__ = {};
};

describe('ApiBaseBootstrap', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStore.getState().reset();
    resetBoot();
    setUnauthorizedHandler(null);
    useAuthStore.getState().reset();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.clearAllMocks();
    vi.mocked(loadDesktopSession).mockResolvedValue(null);
    vi.mocked(connectSidecar).mockResolvedValue(true);
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null,
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    sessionStore.getState().reset();
    resetBoot();
    setUnauthorizedHandler(null);
    useAuthStore.getState().reset();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.unstubAllGlobals();
  });

  it('renders the children immediately on the web', () => {
    renderWithChild();

    expect(screen.getByText('app content')).toBeInTheDocument();
    expect(loadDesktopSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('holds the children on desktop until the session hydration resolves', async () => {
    enableDesktop();
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
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);

    renderWithChild();

    await waitFor(() => {
      expect(connectSidecar).toHaveBeenCalledWith('https://apidot.example.com', 'tok-1');
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
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => userFixture,
    } as unknown as Response);

    renderWithChild();

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    expect(useAuthStore.getState().user?.id).toBe('u1');
    expect(screen.getByText('app content')).toBeInTheDocument();
  });

  it('still boots when the session user body is malformed', async () => {
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

    renderWithChild();

    await waitFor(() => {
      expect(connectSidecar).toHaveBeenCalled();
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.getByText('app content')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('clears the stored credential when the token is rejected', async () => {
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);

    renderWithChild();

    await waitFor(() => {
      expect(clearDesktopSession).toHaveBeenCalled();
    });

    expect(screen.getByText('app content')).toBeInTheDocument();
    // Boot validates the token itself; it is not a user action, so the
    // unauthorized handler must not fire.
    expect(disconnectSidecar).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(getSession()).toMatchObject({
      deviceKey: 'key-1',
    });
  });

  it('routes a later 401 through the unauthorized handler', async () => {
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);

    renderWithChild();

    await waitFor(() => {
      expect(screen.getByText('app content')).toBeInTheDocument();
    });

    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);
    await apiFetch('/api/workspaces');

    expect(disconnectSidecar).toHaveBeenCalled();
    expect(routerMock.replace).toHaveBeenCalledWith('/login');
    expect(getAccessToken()).toBeNull();
  });

  it('does not call the server without a stored session', async () => {
    enableDesktop();
    vi.mocked(loadDesktopSession).mockResolvedValue(null);

    renderWithChild();

    await waitFor(() => {
      expect(loadDesktopSession).toHaveBeenCalled();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(connectSidecar).not.toHaveBeenCalled();
  });

  it('releases the children when the hydration fails', async () => {
    enableDesktop();
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
