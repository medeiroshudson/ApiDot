/**
 * Sidecar connection control for the desktop app.
 *
 * The sidecar is a loopback HTTP process; the ephemeral secret obtained from
 * `get_sidecar_info` protects `/connect` and `/disconnect`. The app asks the
 * sidecar to open or close the agent WebSocket after login, on logout and on a
 * 401. The device token is only sent to the loopback endpoint and is never
 * persisted by the sidecar.
 */

import { getSidecarInfo, isDesktop } from './runtime';

const SIDECAR_SECRET_HEADER = 'X-ApiDot-Sidecar-Secret';

/**
 * Posts to a secret-protected sidecar endpoint. Resolves to `true` when the
 * sidecar accepted the command. Every failure is logged and swallowed: a
 * sidecar that is slow or gone must not break the UI flow that triggered it.
 */
async function postToSidecar(path: string, body?: unknown): Promise<boolean> {
  if (!isDesktop()) {
    return false;
  }

  try {
    const info = await getSidecarInfo();
    const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
      method: 'POST',
      headers: {
        [SIDECAR_SECRET_HEADER]: info.secret,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!res.ok) {
      console.warn(`Sidecar ${path} failed with status ${res.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Failed to reach the sidecar at ${path}:`, err);
    return false;
  }
}

/**
 * Opens (or replaces) the sidecar's agent WebSocket for the given server and
 * device token. No-op on the web.
 */
export async function connectSidecar(serverUrl: string, token: string): Promise<boolean> {
  if (!isDesktop() || !serverUrl || !token) {
    return false;
  }

  return postToSidecar('/connect', { serverUrl, token });
}

/**
 * Closes the sidecar's agent WebSocket. Local execution keeps working. No-op
 * on the web.
 */
export async function disconnectSidecar(): Promise<boolean> {
  return postToSidecar('/disconnect');
}
