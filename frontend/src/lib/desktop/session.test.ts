import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearDesktopSession,
  loadDesktopSession,
  saveDesktopSession,
} from './session';

describe('desktop/session', () => {
  beforeEach(() => {
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it('is a no-op on the web', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(loadDesktopSession()).resolves.toBeNull();
    await expect(saveDesktopSession({ accessToken: 'tok' })).resolves.toBeUndefined();
    await expect(clearDesktopSession()).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('maps the snake_case IPC payload to the camelCase session', async () => {
    const invoke = vi.fn().mockResolvedValue({
      user_id: 'u1',
      device_id: 'dev-1',
      device_key: 'key-1',
      access_token: 'tok-1',
      expires_at: '2026-12-09T00:00:00Z',
    });
    (window as any).__TAURI_INTERNALS__ = { invoke };

    const session = await loadDesktopSession();

    expect(invoke).toHaveBeenCalledWith('load_session');
    expect(session).toEqual({
      userId: 'u1',
      deviceId: 'dev-1',
      deviceKey: 'key-1',
      accessToken: 'tok-1',
      expiresAt: '2026-12-09T00:00:00Z',
    });
  });

  it('returns null for a missing or corrupt session', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    (window as any).__TAURI_INTERNALS__ = { invoke };

    await expect(loadDesktopSession()).resolves.toBeNull();

    invoke.mockRejectedValueOnce(new Error('corrupt json'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(loadDesktopSession()).resolves.toBeNull();
  });

  it('saves the session with the snake_case command argument', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    (window as any).__TAURI__ = { core: { invoke } };

    await saveDesktopSession({
      userId: 'u1',
      deviceId: 'dev-1',
      deviceKey: 'key-1',
      accessToken: 'tok-1',
      expiresAt: '2026-12-09T00:00:00Z',
    });

    expect(invoke).toHaveBeenCalledWith('save_session', {
      session: {
        user_id: 'u1',
        device_id: 'dev-1',
        device_key: 'key-1',
        access_token: 'tok-1',
        expires_at: '2026-12-09T00:00:00Z',
      },
    });
  });

  it('clears the persisted session and swallows IPC errors', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    (window as any).__TAURI_INTERNALS__ = { invoke };

    await clearDesktopSession();

    expect(invoke).toHaveBeenCalledWith('clear_session');

    invoke.mockRejectedValueOnce(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(saveDesktopSession({ accessToken: 'tok' })).resolves.toBeUndefined();
  });

  it('does not throw when Tauri is present but IPC cannot be resolved', async () => {
    (window as any).__TAURI__ = {};
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(loadDesktopSession()).resolves.toBeNull();
    await expect(saveDesktopSession({ accessToken: 'tok' })).resolves.toBeUndefined();
    await expect(clearDesktopSession()).resolves.toBeUndefined();
  });
});
