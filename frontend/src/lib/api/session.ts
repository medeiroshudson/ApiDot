/**
 * In-memory desktop session and device credential persistence.
 *
 * The session is the client-side mirror of `~/.apidot/session.json`: identity,
 * device key, bearer token and expiry. The token itself is also held by
 * `lib/api/authToken.ts`; this module keeps both in sync when a credential
 * arrives and when the session ends.
 *
 * Both values live in the session store; this module keeps the existing facade.
 */

import { getApiBase } from '@/lib/api/base';
import { isDesktop } from '@/lib/desktop/runtime';
import { saveDesktopSession } from '@/lib/desktop/session';
import { connectSidecar } from '@/lib/desktop/sidecarConnection';
import { sessionStore } from '@/lib/session/state';
import type { DesktopSession } from '@/lib/session/types';
import { setAccessToken } from './authToken';

export type { DesktopSession } from '@/lib/session/types';

/** Response headers that carry the device credential on login. */
export const DEVICE_CREDENTIAL_HEADERS = {
  accessToken: 'X-Desktop-Access-Token',
  expiresAt: 'X-Desktop-Access-Token-Expires',
  deviceId: 'X-Desktop-Device-Id',
  deviceKey: 'X-Desktop-Device-Key',
} as const;

export function getSession(): DesktopSession | null {
  return sessionStore.getState().session;
}

/** Replaces the in-memory session. The access token is synced by callers. */
export function setSession(session: DesktopSession | null): DesktopSession | null {
  return sessionStore.getState().setSession(session);
}

/**
 * Merges a partial session into the current one. When no session is loaded
 * yet the patch becomes the session.
 */
export function patchSession(patch: Partial<DesktopSession>): DesktopSession | null {
  const current = sessionStore.getState().session;
  return sessionStore.getState().setSession({ ...(current ?? {}), ...patch });
}

/**
 * Ends the session in memory while keeping the machine identity.
 *
 * `deviceKey` is not a secret: it identifies the machine so the next login
 * reuses the same device row. The bearer token is always dropped.
 */
export function clearSessionMemory(): DesktopSession | null {
  return sessionStore.getState().clearKeepingDeviceIdentity();
}

export interface PersistDeviceCredentialOptions {
  userId?: string | null;
}

/**
 * Stores the device credential returned by a successful login.
 *
 * The web build has no device credential: the response carries no
 * `X-Desktop-*` headers and the session stays empty. In the desktop app the
 * four headers are merged into the in-memory session, the bearer token is
 * applied to the API client and the session is written to disk.
 *
 * A fresh login also opens the sidecar WebSocket: without this the machine only
 * becomes a dispatch target on the next boot. The connection is awaited after
 * the session is saved and its failure is non-fatal (`connectSidecar` logs and
 * resolves `false`), so a sidecar that is not ready never breaks the login.
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
  });

  setAccessToken(token);

  if (next) {
    await saveDesktopSession(next);

    const base = getApiBase();
    if (base) {
      await connectSidecar(base, token);
    }
  }

  return next;
}
