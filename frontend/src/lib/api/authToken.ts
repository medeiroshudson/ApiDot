/**
 * In-memory access token used by the API client.
 *
 * Persistence is intentionally out of scope for this phase; a later change
 * stores the token in the desktop keychain and restores it on boot.
 *
 * The value lives in the session store; this module keeps the existing facade.
 */

import { sessionStore } from '@/lib/session/state';

export function getAccessToken(): string | null {
  return sessionStore.getState().accessToken;
}

export function setAccessToken(token: string | null): void {
  sessionStore.getState().setAccessToken(token);
}
