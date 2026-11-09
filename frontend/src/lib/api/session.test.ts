import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearSessionMemory,
  getSession,
  patchSession,
  persistDeviceCredential,
  setSession,
} from './session';
import { getAccessToken, setAccessToken } from './authToken';
import { saveDesktopSession } from '@/lib/desktop/session';

vi.mock('@/lib/desktop/session', () => ({
  loadDesktopSession: vi.fn().mockResolvedValue(null),
  saveDesktopSession: vi.fn().mockResolvedValue(undefined),
  clearDesktopSession: vi.fn().mockResolvedValue(undefined),
}));

describe('api/session', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setSession(null);
    setAccessToken(null);
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    setSession(null);
    setAccessToken(null);
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('stores, patches and reports the current session', () => {
    setSession({ userId: 'u1', accessToken: 'tok-1' });

    expect(getSession()).toEqual({ userId: 'u1', accessToken: 'tok-1' });

    patchSession({ deviceKey: 'key-1', serverUrl: 'https://api.example.com' });

    expect(getSession()).toEqual({
      userId: 'u1',
      accessToken: 'tok-1',
      deviceKey: 'key-1',
      serverUrl: 'https://api.example.com',
    });
  });

  it('creates a session from a patch when none is loaded', () => {
    patchSession({ serverUrl: 'https://api.example.com' });

    expect(getSession()).toEqual({ serverUrl: 'https://api.example.com' });
  });

  it('clears the identity and token while preserving deviceKey and serverUrl', () => {
    setAccessToken('tok-1');
    setSession({
      userId: 'u1',
      deviceId: 'dev-1',
      deviceKey: 'key-1',
      accessToken: 'tok-1',
      expiresAt: '2026-12-09T00:00:00Z',
      serverUrl: 'https://api.example.com',
    });

    clearSessionMemory();

    expect(getSession()).toEqual({
      deviceKey: 'key-1',
      serverUrl: 'https://api.example.com',
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
      serverUrl: 'https://api.example.com',
    });

    expect(session).toMatchObject({
      userId: 'u1',
      deviceId: 'dev-1',
      deviceKey: 'key-1',
      accessToken: 'tok-1',
      expiresAt: '2026-12-09T00:00:00Z',
      serverUrl: 'https://api.example.com',
    });
    expect(getAccessToken()).toBe('tok-1');
    expect(save).toHaveBeenCalledWith(session);
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
