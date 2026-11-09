import { apiUrl } from './base';
import { getAccessToken } from './authToken';

export type UnauthorizedHandler = () => void | Promise<void>;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let unauthorizedInFlight = false;

/**
 * Registers the handler invoked when an authenticated request gets a 401.
 *
 * The API client never navigates by itself: the handler decides how to end the
 * session and where to send the user. Returns an unsubscribe function.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): () => void {
  unauthorizedHandler = handler;
  unauthorizedInFlight = false;

  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

/**
 * Runs the handler at most once for the batch of responses that carried the
 * current token. Once the handler drops the token, later 401s from the same
 * expired credential are ignored, which prevents redirect loops.
 */
async function notifyUnauthorized(token: string): Promise<void> {
  if (!unauthorizedHandler || unauthorizedInFlight) {
    return;
  }
  // Another response already ended this session.
  if (getAccessToken() !== token) {
    return;
  }

  unauthorizedInFlight = true;
  try {
    await unauthorizedHandler();
  } finally {
    unauthorizedInFlight = false;
  }
}

/**
 * Sends an API request through the configurable base URL and attaches the
 * bearer token when one is available.
 *
 * Caller-supplied headers win: an explicit Authorization header is never
 * overwritten. Without a base and a token the call is exactly
 * `fetch(path, init)`, which keeps relative-URL behaviour on the web intact.
 * A 401 on a token-authenticated request is routed to the unauthorized handler.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  const token = getAccessToken();

  let response: Response;
  if (!token) {
    response = init === undefined ? await fetch(url) : await fetch(url, init);
  } else {
    const headers = new Headers(init?.headers);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    response = await fetch(url, { ...init, headers });
  }

  if (response.status === 401 && token) {
    await notifyUnauthorized(token);
  }

  return response;
}
