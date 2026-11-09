import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectSidecar, disconnectSidecar } from './sidecarConnection';
import { clearSidecarInfoCache, setCachedSidecarInfo } from './runtime';

describe('desktop/sidecarConnection', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    clearSidecarInfoCache();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    clearSidecarInfoCache();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is a no-op on the web', async () => {
    await expect(connectSidecar('https://api.example.com', 'tok-1')).resolves.toBe(false);
    await expect(disconnectSidecar()).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the server URL and token to the sidecar /connect endpoint', async () => {
    (window as any).__TAURI__ = {};
    setCachedSidecarInfo({ port: 43210, secret: 'local-secret' });

    await expect(
      connectSidecar('https://api.example.com', 'tok-1')
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:43210/connect', {
      method: 'POST',
      headers: {
        'X-ApiDot-Sidecar-Secret': 'local-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serverUrl: 'https://api.example.com', token: 'tok-1' }),
    });
  });

  it('posts to /disconnect without a body', async () => {
    (window as any).__TAURI__ = {};
    setCachedSidecarInfo({ port: 43210, secret: 'local-secret' });

    await expect(disconnectSidecar()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:43210/disconnect', {
      method: 'POST',
      headers: { 'X-ApiDot-Sidecar-Secret': 'local-secret' },
    });
  });

  it('logs and swallows sidecar failures', async () => {
    (window as any).__TAURI__ = {};
    setCachedSidecarInfo({ port: 43210, secret: 'local-secret' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    await expect(connectSidecar('https://api.example.com', 'tok-1')).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error('connection refused'));
    await expect(disconnectSidecar()).resolves.toBe(false);
  });
});
