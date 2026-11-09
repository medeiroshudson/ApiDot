/**
 * Ordered teardown of the desktop device session.
 *
 * Two paths exist and they must not be swapped:
 * - logout revokes the presented token first, so the server stops accepting it,
 *   then closes the sidecar WebSocket, then forgets the session locally;
 * - a 401 means the credential is already invalid, so the local session and the
 *   sidecar connection are cleared without another server round trip.
 */

import { revokeDeviceToken } from '@/lib/authApi';
import { getAccessToken } from '@/lib/api/authToken';
import { clearSessionMemory } from '@/lib/api/session';
import { clearDesktopSession } from './session';
import { disconnectSidecar } from './sidecarConnection';

/**
 * Logout path: revoke, disconnect, clear.
 *
 * Revocation failures (including a 401 from an expired token) are logged and
 * ignored: the user asked to sign out and must always end signed out locally.
 */
export async function revokeDeviceSession(): Promise<void> {
  if (getAccessToken()) {
    try {
      await revokeDeviceToken();
    } catch (err) {
      console.warn('Failed to revoke the device token during logout:', err);
    }
  }

  await disconnectSidecar();
  clearSessionMemory();
  await clearDesktopSession();
}

/**
 * Expired/invalid credential path: clear and disconnect.
 */
export async function endDeviceSession(): Promise<void> {
  clearSessionMemory();
  await clearDesktopSession();
  await disconnectSidecar();
}
