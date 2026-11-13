/**
 * Transport-level request used by the API client and the boot sequence.
 *
 * It resolves the URL, attaches the bearer token and routes a 401 to the
 * unauthorized handler. Callers that must not trigger that handler, such as the
 * boot validating a stored token, pass `handleUnauthorized: false`.
 *
 * This module must stay below the boot in the import graph: importing the boot
 * here would close the cycle the boot exists to break.
 */

import { apiUrl } from './base';
import { getAccessToken } from './authToken';

export type UnauthorizedHandler = () => void | Promise<void>;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let unauthorizedInFlight = false;

/**
 * Registers the handler invoked when an authenticated request gets a 401.
 *
 * The transport never navigates by itself: the handler decides how to end the
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

export interface RawFetchOptions {
  /** Defaults to `true`; the boot opts out so validation is not a user action. */
  handleUnauthorized?: boolean;
}

/**
 * Sends an API request through the configurable base URL and attaches the
 * bearer token when one is available.
 *
 * Caller-supplied headers win: an explicit Authorization header is never
 * overwritten. Without a base and a token the call is exactly
 * `fetch(path, init)`, which keeps relative-URL behaviour on the web intact.
 */
export async function rawFetch(
  path: string,
  init?: RequestInit,
  options: RawFetchOptions = {}
): Promise<Response> {
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

  if (response.status === 401 && token && options.handleUnauthorized !== false) {
    await notifyUnauthorized(token);
  }

  return response;
}
