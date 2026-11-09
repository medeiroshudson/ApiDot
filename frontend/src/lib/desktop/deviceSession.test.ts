import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { endDeviceSession, revokeDeviceSession } from './deviceSession';
import { revokeDeviceToken } from '@/lib/authApi';
import { setAccessToken } from '@/lib/api/authToken';
import { clearSessionMemory } from '@/lib/api/session';
import { clearDesktopSession } from './session';
import { disconnectSidecar } from './sidecarConnection';

vi.mock('@/lib/authApi', () => ({
  revokeDeviceToken: vi.fn(),
}));

vi.mock('@/lib/api/session', () => ({
  clearSessionMemory: vi.fn(),
}));

vi.mock('./session', () => ({
  clearDesktopSession: vi.fn().mockResolvedValue(undefined),
  loadDesktopSession: vi.fn().mockResolvedValue(null),
  saveDesktopSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./sidecarConnection', () => ({
  connectSidecar: vi.fn(),
  disconnectSidecar: vi.fn().mockResolvedValue(true),
}));

describe('desktop/deviceSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken(null);
    vi.mocked(revokeDeviceToken).mockResolvedValue(undefined);
    vi.mocked(disconnectSidecar).mockResolvedValue(true);
    vi.mocked(clearDesktopSession).mockResolvedValue(undefined);
  });

  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it('revokes, disconnects and clears in that order on logout', async () => {
    setAccessToken('tok-1');

    await revokeDeviceSession();

    expect(revokeDeviceToken).toHaveBeenCalledTimes(1);
    expect(disconnectSidecar).toHaveBeenCalledTimes(1);
    expect(clearSessionMemory).toHaveBeenCalledTimes(1);
    expect(clearDesktopSession).toHaveBeenCalledTimes(1);

    const order = (fn: { mock: { invocationCallOrder: number[] } }) =>
      fn.mock.invocationCallOrder[0];
    expect(order(vi.mocked(revokeDeviceToken))).toBeLessThan(
      order(vi.mocked(disconnectSidecar))
    );
    expect(order(vi.mocked(disconnectSidecar))).toBeLessThan(
      order(vi.mocked(clearSessionMemory))
    );
    expect(order(vi.mocked(clearSessionMemory))).toBeLessThan(
      order(vi.mocked(clearDesktopSession))
    );
  });

  it('skips revocation without a token but still disconnects and clears', async () => {
    await revokeDeviceSession();

    expect(revokeDeviceToken).not.toHaveBeenCalled();
    expect(disconnectSidecar).toHaveBeenCalledTimes(1);
    expect(clearSessionMemory).toHaveBeenCalledTimes(1);
    expect(clearDesktopSession).toHaveBeenCalledTimes(1);
  });

  it('still signs out locally when revocation fails', async () => {
    setAccessToken('tok-1');
    vi.mocked(revokeDeviceToken).mockRejectedValueOnce(new Error('401'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(revokeDeviceSession()).resolves.toBeUndefined();

    expect(disconnectSidecar).toHaveBeenCalledTimes(1);
    expect(clearSessionMemory).toHaveBeenCalledTimes(1);
    expect(clearDesktopSession).toHaveBeenCalledTimes(1);
  });

  it('clears the session and disconnects without a server call on 401', async () => {
    setAccessToken('tok-1');

    await endDeviceSession();

    expect(revokeDeviceToken).not.toHaveBeenCalled();
    expect(clearSessionMemory).toHaveBeenCalledTimes(1);
    expect(clearDesktopSession).toHaveBeenCalledTimes(1);
    expect(disconnectSidecar).toHaveBeenCalledTimes(1);
  });
});
