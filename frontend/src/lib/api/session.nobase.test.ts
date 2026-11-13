import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { persistDeviceCredential } from './session';
import { getAccessToken, setAccessToken } from './authToken';
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

describe('api/session without a build API server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken(null);
    (window as any).__TAURI__ = {};
  });

  afterEach(() => {
    setAccessToken(null);
    delete (window as any).__TAURI__;
  });

  it('stores the credential but does not connect the sidecar', async () => {
    const session = await persistDeviceCredential({
      headers: new Headers({ 'X-Desktop-Access-Token': 'tok-1' }),
    } as Response);

    expect(session).toMatchObject({ accessToken: 'tok-1' });
    expect(getAccessToken()).toBe('tok-1');
    expect(connectSidecar).not.toHaveBeenCalled();
  });
});
