/**
 * In-memory access token used by the API client.
 *
 * Persistence is intentionally out of scope for this phase; a later change
 * stores the token in the desktop keychain and restores it on boot.
 */

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token && token.length > 0 ? token : null;
}
