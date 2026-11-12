/**
 * Tauri IPC wrappers for the desktop session file.
 *
 * The Rust commands (`load_session`, `save_session`, `clear_session`) use
 * snake_case fields: `session.rs` declares `DesktopSession` without a serde
 * rename policy, so the JSON that crosses IPC is snake_case even though the
 * TypeScript session uses camelCase. The mapping lives here and nowhere else.
 *
 * The app does not ship the `@tauri-apps/api` package; the webview injects the
 * IPC globals, so the invoke lookup mirrors `lib/desktop/runtime.ts`. Every
 * function is a no-op outside Tauri, and IPC failures are logged rather than
 * thrown: a session that cannot be read must not prevent the app from starting.
 */

import type { DesktopSession } from '@/lib/api/session';
import { isDesktop } from './runtime';

interface WireDesktopSession {
  user_id?: string | null;
  device_id?: string | null;
  device_key?: string | null;
  access_token?: string | null;
  expires_at?: string | null;
  server_url?: string | null;
}

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function resolveInvoke(): InvokeFn | null {
  if (typeof window === 'undefined' || !isDesktop()) {
    return null;
  }

  const tauriInternals = (window as any).__TAURI_INTERNALS__;
  const tauriGlobal = (window as any).__TAURI__;

  if (typeof tauriInternals?.invoke === 'function') {
    return tauriInternals.invoke.bind(tauriInternals);
  }
  if (typeof tauriGlobal?.core?.invoke === 'function') {
    return tauriGlobal.core.invoke.bind(tauriGlobal.core);
  }
  if (typeof tauriGlobal?.invoke === 'function') {
    return tauriGlobal.invoke.bind(tauriGlobal);
  }

  return null;
}

function toWireSession(session: DesktopSession): WireDesktopSession {
  return {
    user_id: session.userId ?? null,
    device_id: session.deviceId ?? null,
    device_key: session.deviceKey ?? null,
    access_token: session.accessToken ?? null,
    expires_at: session.expiresAt ?? null,
    server_url: session.serverUrl ?? null,
  };
}

function fromWireSession(wire: WireDesktopSession): DesktopSession {
  return {
    userId: wire.user_id ?? null,
    deviceId: wire.device_id ?? null,
    deviceKey: wire.device_key ?? null,
    accessToken: wire.access_token ?? null,
    expiresAt: wire.expires_at ?? null,
    serverUrl: wire.server_url ?? null,
  };
}

/**
 * Reads `~/.apidot/session.json`. Resolves to `null` on the web, when the file
 * is missing or corrupt, and when IPC is unavailable.
 */
export async function loadDesktopSession(): Promise<DesktopSession | null> {
  const invoke = resolveInvoke();
  if (!invoke) {
    return null;
  }

  try {
    const raw = (await invoke('load_session')) as WireDesktopSession | null;
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    return fromWireSession(raw);
  } catch (err) {
    console.error('Failed to load the desktop session:', err);
    return null;
  }
}

/**
 * Writes the session to `~/.apidot/session.json`. No-op on the web; a failed
 * write is logged because the in-memory session still works for this run.
 */
export async function saveDesktopSession(session: DesktopSession): Promise<void> {
  const invoke = resolveInvoke();
  if (!invoke) {
    return;
  }

  try {
    await invoke('save_session', { session: toWireSession(session) });
  } catch (err) {
    console.error('Failed to save the desktop session:', err);
  }
}

/**
 * Clears the token fields on disk while preserving `device_key` and
 * `server_url`. No-op on the web.
 */
export async function clearDesktopSession(): Promise<void> {
  const invoke = resolveInvoke();
  if (!invoke) {
    return;
  }

  try {
    await invoke('clear_session');
  } catch (err) {
    console.error('Failed to clear the desktop session:', err);
  }
}
