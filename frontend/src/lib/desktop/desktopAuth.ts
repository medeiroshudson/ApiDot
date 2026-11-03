import { AuthUser } from '@/lib/authApi';
import { getSidecarInfo } from '@/lib/desktop/runtime';

export interface PollSessionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  intervalMs?: number;
}

export interface DesktopSsoOptions {
  openBrowser?: (url: string) => Promise<void>;
  pollSession?: (port: number, secret?: string, options?: PollSessionOptions) => Promise<string | null>;
  exchangeToken?: (token: string, baseUrl?: string) => Promise<AuthUser>;
  port?: number;
  secret?: string;
  serverUrl?: string;
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
      const timer = setTimeout(resolve, intervalMs);
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  return null;
}

/**
 * Exchanges a one-time ephemeral desktop token for an authenticated user session.
 */
export async function exchangeDesktopToken(token: string, baseUrl?: string): Promise<AuthUser> {
  const base = (baseUrl || '').replace(/\/+$/, '');
  const url = `${base}/api/auth/desktop-exchange`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
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

  return (await res.json()) as AuthUser;
}

/**
 * Initiates the desktop external browser SSO authentication flow:
 * 1. Obtains loopback sidecar port and secret
 * 2. Launches the browser to /api/auth/login with desktop_callback
 * 3. Polls the local sidecar /auth/session for the single-use token
 * 4. Exchanges the token at /api/auth/desktop-exchange
 * 5. Returns the authenticated user
 */
export async function startDesktopSsoFlow(
  options: DesktopSsoOptions = {}
): Promise<DesktopSsoResult> {
  try {
    if (options.signal?.aborted) {
      return { success: false, error: 'Authentication cancelled' };
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
    const base = (options.serverUrl || '').replace(/\/+$/, '');
    let loginUrl = `${base}/api/auth/login?desktop_callback=${encodeURIComponent(callbackUrl)}`;

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
    const user = await exchange(token, options.serverUrl);

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
