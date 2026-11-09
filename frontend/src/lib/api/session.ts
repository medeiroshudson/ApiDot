/**
 * In-memory desktop session and device credential persistence.
 *
 * The session is the client-side mirror of `~/.apidot/session.json`: identity,
 * device key, bearer token, expiry and the server URL used to reach the API.
 * The token itself is also held by `lib/api/authToken.ts`; this module keeps
 * both in sync when a credential arrives and when the session ends.
 */

import { isDesktop } from '@/lib/desktop/runtime';
import { saveDesktopSession } from '@/lib/desktop/session';
import { setAccessToken } from './authToken';

export interface DesktopSession {
  userId?: string | null;
  deviceId?: string | null;
  deviceKey?: string | null;
  accessToken?: string | null;
  expiresAt?: string | null;
  serverUrl?: string | null;
}

/** Response headers that carry the device credential on login. */
export const DEVICE_CREDENTIAL_HEADERS = {
  accessToken: 'X-Desktop-Access-Token',
  expiresAt: 'X-Desktop-Access-Token-Expires',
  deviceId: 'X-Desktop-Device-Id',
  deviceKey: 'X-Desktop-Device-Key',
} as const;

let currentSession: DesktopSession | null = null;

export function getSession(): DesktopSession | null {
  return currentSession;
}

/** Replaces the in-memory session. The access token is synced by callers. */
export function setSession(session: DesktopSession | null): DesktopSession | null {
  currentSession = session ? { ...session } : null;
  return currentSession;
}

/**
 * Merges a partial session into the current one. When no session is loaded
 * yet the patch becomes the session, which lets the server URL be recorded
 * before the first login.
 */
export function patchSession(patch: Partial<DesktopSession>): DesktopSession | null {
  currentSession = { ...(currentSession ?? {}), ...patch };
  return currentSession;
}

/**
 * Ends the session in memory while keeping the machine identity.
 *
 * `deviceKey` is not a secret: it identifies the machine so the next login
 * reuses the same device row. `serverUrl` is kept so the app knows where to
 * sign in again. The bearer token is always dropped.
 */
export function clearSessionMemory(): DesktopSession | null {
  const preserved: DesktopSession = {};

  if (currentSession?.deviceKey) {
    preserved.deviceKey = currentSession.deviceKey;
  }
  if (currentSession?.serverUrl) {
    preserved.serverUrl = currentSession.serverUrl;
  }

  currentSession = Object.keys(preserved).length > 0 ? preserved : null;
  setAccessToken(null);
  return currentSession;
}

export interface PersistDeviceCredentialOptions {
  userId?: string | null;
  serverUrl?: string | null;
}

/**
 * Stores the device credential returned by a successful login.
 *
 * The web build has no device credential: the response carries no
 * `X-Desktop-*` headers and the session stays empty. In the desktop app the
 * four headers are merged into the in-memory session, the bearer token is
 * applied to the API client and the session is written to disk.
 */
export async function persistDeviceCredential(
  response: Response,
  options: PersistDeviceCredentialOptions = {}
): Promise<DesktopSession | null> {
  if (!isDesktop()) {
    return null;
  }

  const headers = response.headers;
  if (!headers || typeof headers.get !== 'function') {
    return null;
  }

  const token = headers.get(DEVICE_CREDENTIAL_HEADERS.accessToken);
  if (!token) {
    return null;
  }

  const next = patchSession({
    accessToken: token,
    deviceId: headers.get(DEVICE_CREDENTIAL_HEADERS.deviceId),
    deviceKey: headers.get(DEVICE_CREDENTIAL_HEADERS.deviceKey),
    expiresAt: headers.get(DEVICE_CREDENTIAL_HEADERS.expiresAt),
    ...(options.userId ? { userId: options.userId } : {}),
    ...(options.serverUrl ? { serverUrl: options.serverUrl } : {}),
  });

  setAccessToken(token);

  if (next) {
    await saveDesktopSession(next);
  }

  return next;
}
