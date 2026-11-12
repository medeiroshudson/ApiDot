import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
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

describe('ApiBaseBootstrap', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    setApiBase(null);
    setSession(null);
    setAccessToken(null);
    setUnauthorizedHandler(null);
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.clearAllMocks();
    vi.mocked(loadDesktopSession).mockResolvedValue(null);
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    setSession(null);
    setAccessToken(null);
    setUnauthorizedHandler(null);
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.unstubAllGlobals();
  });

  it('reads the stored base on mount', () => {
    localStorage.setItem(API_BASE_STORAGE_KEY, 'https://apidot.example.com/');

    render(<ApiBaseBootstrap />);

    expect(getApiBase()).toBe('https://apidot.example.com');
  });

  it('leaves the base empty without a stored value', () => {
    render(<ApiBaseBootstrap />);

    expect(getApiBase()).toBe('');
  });

  it('never touches IPC on the web', () => {
    localStorage.setItem(API_BASE_STORAGE_KEY, 'https://apidot.example.com');

    render(<ApiBaseBootstrap />);

    expect(loadDesktopSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hydrates the desktop session, validates it and connects the sidecar', async () => {
    (window as any).__TAURI__ = {};
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);

    render(<ApiBaseBootstrap />);

    await waitFor(() => {
      expect(connectSidecar).toHaveBeenCalledWith(sessionFixture.serverUrl, 'tok-1');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://apidot.example.com/api/auth/me',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(getApiBase()).toBe('https://apidot.example.com');
    expect(getAccessToken()).toBe('tok-1');
    expect(getSession()).toMatchObject({ deviceId: 'dev-1', deviceKey: 'key-1' });
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('clears and disconnects when the stored token is rejected', async () => {
    (window as any).__TAURI__ = {};
    vi.mocked(loadDesktopSession).mockResolvedValue(sessionFixture);
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);

    render(<ApiBaseBootstrap />);

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

    render(<ApiBaseBootstrap />);

    await waitFor(() => {
      expect(loadDesktopSession).toHaveBeenCalled();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(connectSidecar).not.toHaveBeenCalled();
  });
});
