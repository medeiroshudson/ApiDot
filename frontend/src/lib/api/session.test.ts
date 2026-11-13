import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearSessionMemory,
  getSession,
  patchSession,
  persistDeviceCredential,
  setSession,
} from './session';
import { getAccessToken, setAccessToken } from './authToken';
import { setApiBase } from '@/lib/api/base';
import { saveDesktopSession } from '@/lib/desktop/session';
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

describe('api/session', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(connectSidecar).mockClear();
    vi.mocked(connectSidecar).mockResolvedValue(true);
    setSession(null);
    setAccessToken(null);
    setApiBase('https://api.example.com');
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    setSession(null);
    setAccessToken(null);
    setApiBase(null);
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('stores, patches and reports the current session', () => {
    setSession({ userId: 'u1', accessToken: 'tok-1' });

    expect(getSession()).toEqual({ userId: 'u1', accessToken: 'tok-1' });

    patchSession({ deviceKey: 'key-1' });

    expect(getSession()).toEqual({
      userId: 'u1',
      accessToken: 'tok-1',
      deviceKey: 'key-1',
    });
  });

  it('creates a session from a patch when none is loaded', () => {
    patchSession({ deviceKey: 'key-1' });

    expect(getSession()).toEqual({ deviceKey: 'key-1' });
  });

  it('clears the identity and token while preserving deviceKey', () => {
    setAccessToken('tok-1');
    setSession({
      userId: 'u1',
      deviceId: 'dev-1',
      deviceKey: 'key-1',
      accessToken: 'tok-1',
      expiresAt: '2026-12-09T00:00:00Z',
    });

    clearSessionMemory();

    expect(getSession()).toEqual({
      deviceKey: 'key-1',
    });
    expect(getAccessToken()).toBeNull();
  });

  it('clears everything when the session had no machine identity', () => {
    setSession({ userId: 'u1', accessToken: 'tok-1' });

    clearSessionMemory();

    expect(getSession()).toBeNull();
  });

  it('does nothing on the web when persisting a credential', async () => {
    const save = vi.mocked(saveDesktopSession);
    save.mockClear();
    const response = {
      headers: new Headers({ 'X-Desktop-Access-Token': 'tok-1' }),
    } as Response;

    await expect(persistDeviceCredential(response)).resolves.toBeNull();

    expect(getSession()).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(connectSidecar).not.toHaveBeenCalled();
  });

  it('persists the four credential headers in the desktop app', async () => {
    (window as any).__TAURI__ = {};
    const save = vi.mocked(saveDesktopSession);
    save.mockClear();

    const response = {
      headers: new Headers({
        'X-Desktop-Access-Token': 'tok-1',
        'X-Desktop-Access-Token-Expires': '2026-12-09T00:00:00Z',
        'X-Desktop-Device-Id': 'dev-1',
        'X-Desktop-Device-Key': 'key-1',
      }),
    } as Response;

    const session = await persistDeviceCredential(response, {
      userId: 'u1',
    });

    expect(session).toMatchObject({
      userId: 'u1',
      deviceId: 'dev-1',
      deviceKey: 'key-1',
      accessToken: 'tok-1',
      expiresAt: '2026-12-09T00:00:00Z',
    });
    expect(getAccessToken()).toBe('tok-1');
    expect(save).toHaveBeenCalledWith(session);
    expect(connectSidecar).toHaveBeenCalledWith('https://api.example.com', 'tok-1');
  });

  it('skips the sidecar connection without a configured base', async () => {
    (window as any).__TAURI__ = {};
    setApiBase(null);

    const session = await persistDeviceCredential({
      headers: new Headers({
        'X-Desktop-Access-Token': 'tok-1',
        'X-Desktop-Device-Id': 'dev-1',
      }),
    } as Response);

    expect(session).toMatchObject({ accessToken: 'tok-1' });
    expect(getAccessToken()).toBe('tok-1');
    expect(connectSidecar).not.toHaveBeenCalled();
  });

  it('does not fail the login when /connect fails', async () => {
    (window as any).__TAURI__ = {};
    vi.mocked(connectSidecar).mockResolvedValueOnce(false);

    const response = {
      headers: new Headers({
        'X-Desktop-Access-Token': 'tok-1',
        'X-Desktop-Device-Id': 'dev-1',
      }),
    } as Response;

    const session = await persistDeviceCredential(response, { userId: 'u1' });

    expect(connectSidecar).toHaveBeenCalledWith('https://api.example.com', 'tok-1');
    expect(session).toMatchObject({ accessToken: 'tok-1' });
    expect(getAccessToken()).toBe('tok-1');
  });

  it('ignores a desktop response without a token header', async () => {
    (window as any).__TAURI__ = {};
    const save = vi.mocked(saveDesktopSession);
    save.mockClear();

    const session = await persistDeviceCredential({
      headers: new Headers({ 'X-Desktop-Device-Id': 'dev-1' }),
    } as Response);

    expect(session).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
