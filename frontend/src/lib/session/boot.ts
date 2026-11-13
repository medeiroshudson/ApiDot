/**
 * Boot sequence for the API client.
 *
 * It resolves the API base and, in the desktop app, restores the stored device
 * session and validates its token before any request is allowed out. Every
 * `apiFetch` awaits `ensureBooted`, so a caller cannot race the hydration no
 * matter where it lives.
 *
 * The sequence never rejects: a failed boot ends in `status: 'failed'` and the
 * app falls back to the login screen instead of a blank window.
 *
 * Import graph: this module may not import `lib/api/client`, `lib/authApi` or
 * `lib/desktop/deviceSession`; each of those reaches back here.
 */

import { API_BASE_STORAGE_KEY, normalizeApiBase } from '@/lib/api/base';
import { rawFetch } from '@/lib/api/rawFetch';
import { isDesktop } from '@/lib/desktop/runtime';
import { clearDesktopSession, loadDesktopSession } from '@/lib/desktop/session';
import { connectSidecar } from '@/lib/desktop/sidecarConnection';
import { sessionStore } from './state';
import type { AuthUser } from './types';

let bootPromise: Promise<void> | null = null;

/** Runs the boot once; later callers await the same promise. */
export function ensureBooted(): Promise<void> {
  if (!bootPromise) {
    bootPromise = runBoot();
  }
  return bootPromise;
}

/** Forgets the completed boot so the next caller runs it again. Tests only. */
export function resetBoot(): void {
  bootPromise = null;
}

function readStoredBase(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return normalizeApiBase(window.localStorage.getItem(API_BASE_STORAGE_KEY));
  } catch {
    return '';
  }
}

async function runBoot(): Promise<void> {
  const store = sessionStore.getState();
  store.setStatus('hydrating');

  try {
    if (!isDesktop()) {
      store.setBaseUrl(readStoredBase());
      store.setStatus('ready');
      return;
    }

    // Parity with the component gate: pick up the stored base first.
    store.setBaseUrl(readStoredBase());

    const session = await loadDesktopSession();

    if (session?.serverUrl) {
      store.setBaseUrl(normalizeApiBase(session.serverUrl));
    }

    if (!session) {
      store.setStatus('ready');
      return;
    }

    store.setSession(session);
    const token = session.accessToken ?? null;
    store.setAccessToken(token);

    if (!token) {
      store.setStatus('ready');
      return;
    }

    let res: Response;
    try {
      // Boot validates the stored token itself; a rejected credential is not a
      // user action and must not run the unauthorized handler.
      res = await rawFetch('/api/auth/me', undefined, { handleUnauthorized: false });
    } catch (err) {
      // A transient network failure keeps the session for the next attempt.
      console.error('Failed to validate the desktop session at boot:', err);
      store.setStatus('ready');
      return;
    }

    if (!res.ok) {
      // Drop the dead credential but keep the machine identity so the next
      // login reuses the same device row.
      store.clearKeepingDeviceIdentity();
      await clearDesktopSession();
      store.setStatus('ready');
      return;
    }

    try {
      const user = (await res.json()) as AuthUser;
      store.setUser(user);
    } catch (err) {
      console.error('Failed to parse the desktop session user:', err);
    }

    if (session.serverUrl) {
      await connectSidecar(session.serverUrl, token);
    }

    store.setStatus('ready');
  } catch (err) {
    console.error('Failed to hydrate the desktop session at boot:', err);
    sessionStore.getState().setStatus('failed');
  }
}
