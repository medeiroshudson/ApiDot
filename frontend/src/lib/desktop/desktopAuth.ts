import { AuthUser } from '@/lib/authApi';
import { getSidecarInfo } from '@/lib/desktop/runtime';
import { getApiBase } from '@/lib/api/base';
import { getSession, persistDeviceCredential } from '@/lib/api/session';

/** A desktop build without `NEXT_PUBLIC_APIDOT_API_BASE` cannot reach any server. */
const NO_API_SERVER = 'This build has no API server configured';

export interface PollSessionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  intervalMs?: number;
}

export interface DesktopSsoOptions {
  openBrowser?: (url: string) => Promise<void>;
  pollSession?: (port: number, secret?: string, options?: PollSessionOptions) => Promise<string | null>;
  exchangeToken?: (token: string) => Promise<AuthUser>;
  getState?: (port: number, secret?: string, signal?: AbortSignal) => Promise<string>;
  port?: number;
  secret?: string;
  returnUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  intervalMs?: number;
}

export interface DesktopSsoResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

/**
 * Opens a URL in the user's default external browser.
 * Prefers the Tauri IPC shell plugin ('plugin:shell|open'), falling back to window.open.
 */
export async function openExternalBrowser(url: string): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const tauriInternals = (window as any).__TAURI_INTERNALS__;
  const tauriGlobal = (window as any).__TAURI__;

  let invokeFn: ((cmd: string, args?: Record<string, unknown>) => Promise<any>) | undefined;
  if (typeof tauriInternals?.invoke === 'function') {
    invokeFn = tauriInternals.invoke.bind(tauriInternals);
  } else if (typeof tauriGlobal?.core?.invoke === 'function') {
    invokeFn = tauriGlobal.core.invoke.bind(tauriGlobal.core);
  } else if (typeof tauriGlobal?.invoke === 'function') {
    invokeFn = tauriGlobal.invoke.bind(tauriGlobal);
  }

  if (invokeFn) {
    try {
      await invokeFn('plugin:shell|open', { path: url });
      return;
    } catch {
      // Fallback if invoke fails
    }
  }

  if (typeof window.open === 'function') {
    window.open(url, '_blank');
  }
}

/**
 * Polls the local sidecar loopback session endpoint until a token is returned,
 * the timeout expires, or the operation is aborted.
 */
export async function pollDesktopSidecarSession(
  port: number,
  secret?: string,
  options?: PollSessionOptions
): Promise<string | null> {
  const timeoutMs = options?.timeoutMs ?? 120_000; // 2 minutes default
  const intervalMs = options?.intervalMs ?? 1_000;
  const signal = options?.signal;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (signal?.aborted) {
      return null;
    }

    try {
      const headers: Record<string, string> = {};
      if (secret) {
        headers['X-ApiDot-Sidecar-Secret'] = secret;
      }

      const res = await fetch(`http://127.0.0.1:${port}/auth/session`, {
        headers,
        signal,
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && typeof data.token === 'string' && data.token.length > 0) {
          return data.token;
        }
      }
    } catch (err: unknown) {
      if (signal?.aborted) {
        return null;
      }
      // Transient connection failures during polling are ignored
    }

    if (signal?.aborted) {
      return null;
    }

    // Wait intervalMs before the next poll, immediately waking up if aborted
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;

      const cleanup = () => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      if (signal) {
        onAbort = () => {
          cleanup();
          resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }

      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, intervalMs);
    });
  }

  return null;
}

/**
 * Requests a fresh single-use OAuth state nonce from the local sidecar.
 * The nonce is echoed back on the loopback callback so unsolicited callbacks
 * cannot inject a token into the desktop session.
 */
export async function fetchDesktopSidecarAuthState(
  port: number,
  secret?: string,
  signal?: AbortSignal
): Promise<string> {
  const headers: Record<string, string> = {};
  if (secret) {
    headers['X-ApiDot-Sidecar-Secret'] = secret;
  }

  const res = await fetch(`http://127.0.0.1:${port}/auth/state`, {
    headers,
    signal,
  });

  if (!res.ok) {
    throw new Error(`Failed to obtain sidecar auth state (${res.status})`);
  }

  const data = await res.json().catch(() => null);
  if (!data || typeof data.state !== 'string' || data.state.length === 0) {
    throw new Error('Sidecar auth state response was invalid');
  }

  return data.state;
}

/**
 * Exchanges a one-time ephemeral desktop token for an authenticated user session.
 */
export async function exchangeDesktopToken(token: string): Promise<AuthUser> {
  const base = getApiBase();
  if (!base) {
    throw new Error(NO_API_SERVER);
  }
  const url = `${base}/api/auth/desktop-exchange`;

  // The one-time token travels in the body, so the exchange does not need the
  // cookie session (and the desktop CORS policy does not allow credentials).
  // Reuses this machine's device row, as the local login does.
  const deviceKey = getSession()?.deviceKey;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deviceKey ? { token, deviceKey } : { token }),
  });

  if (!res.ok) {
    let message = `Desktop token exchange failed (${res.status})`;
    try {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object') {
        message = data.detail || data.title || data.message || message;
      }
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  const user = (await res.json()) as AuthUser;

  // A successful exchange also returns the device credential in response
  // headers. Persisting it here keeps SSO and local login on one path.
  await persistDeviceCredential(res, {
    userId: user.id,
  });

  return user;
}

/**
 * Initiates the desktop external browser SSO authentication flow:
 * 1. Obtains loopback sidecar port and secret
 * 2. Launches the browser to /api/auth/login with desktop_callback
 * 3. Polls the local sidecar /auth/session for the single-use token
 * 4. Exchanges the token at /api/auth/desktop-exchange
 * 5. Returns the authenticated user
 *
 * The login URL is built from the API base compiled into the app, so a build
 * with no base fails here instead of opening a `tauri://` address.
 */
export async function startDesktopSsoFlow(
  options: DesktopSsoOptions = {}
): Promise<DesktopSsoResult> {
  try {
    if (options.signal?.aborted) {
      return { success: false, error: 'Authentication cancelled' };
    }

    const base = getApiBase();
    if (!base) {
      return { success: false, error: NO_API_SERVER };
    }

    let port = options.port;
    let secret = options.secret;

    if (port === undefined) {
      const info = await getSidecarInfo();
      port = info.port;
      if (secret === undefined) {
        secret = info.secret;
      }
    } else if (secret === undefined) {
      try {
        const info = await getSidecarInfo();
        secret = info.secret;
      } catch {
        secret = '';
      }
    }

    const callbackUrl = `http://127.0.0.1:${port}/auth/callback`;

    const resolveState = options.getState ?? fetchDesktopSidecarAuthState;
    const state = await resolveState(port, secret, options.signal);
    const callbackWithState = `${callbackUrl}?state=${encodeURIComponent(state)}`;

    let loginUrl = `${base}/api/auth/login?desktop_callback=${encodeURIComponent(callbackWithState)}`;

    if (options.returnUrl) {
      loginUrl += `&returnUrl=${encodeURIComponent(options.returnUrl)}`;
    }

    const open = options.openBrowser ?? openExternalBrowser;
    await open(loginUrl);

    if (options.signal?.aborted) {
      return { success: false, error: 'Authentication cancelled' };
    }

    const poll = options.pollSession ?? pollDesktopSidecarSession;
    const token = await poll(port, secret, {
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
    });

    if (options.signal?.aborted) {
      return { success: false, error: 'Authentication cancelled' };
    }

    if (!token) {
      return {
        success: false,
        error: 'Authentication timed out. Please try again.',
      };
    }

    const exchange = options.exchangeToken ?? exchangeDesktopToken;
    const user = await exchange(token);

    return {
      success: true,
      user,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Desktop SSO flow failed';
    return {
      success: false,
      error: message,
    };
  }
}
