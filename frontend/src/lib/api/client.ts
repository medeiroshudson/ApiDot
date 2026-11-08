import { apiUrl } from './base';
import { getAccessToken } from './authToken';

/**
 * Sends an API request through the configurable base URL and attaches the
 * bearer token when one is available.
 *
 * Caller-supplied headers win: an explicit Authorization header is never
 * overwritten. Without a base and a token the call is exactly
 * `fetch(path, init)`, which keeps relative-URL behaviour on the web intact.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  const token = getAccessToken();

  if (!token) {
    return init === undefined ? fetch(url) : fetch(url, init);
  }

  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, { ...init, headers });
}
