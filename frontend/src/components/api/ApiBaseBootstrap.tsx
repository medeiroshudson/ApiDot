'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_STORAGE_KEY, getApiBase, setApiBase } from '@/lib/api/base';
import { apiFetch, setUnauthorizedHandler } from '@/lib/api/client';
import { setAccessToken } from '@/lib/api/authToken';
import { setSession } from '@/lib/api/session';
import { isDesktop } from '@/lib/desktop/runtime';
import { endDeviceSession } from '@/lib/desktop/deviceSession';
import { loadDesktopSession } from '@/lib/desktop/session';
import { connectSidecar } from '@/lib/desktop/sidecarConnection';

/**
 * Restores the persisted API base and, in the desktop app, the device session
 * before the rest of the app starts issuing requests.
 *
 * Boot sequence with a stored session:
 * 1. hydrate the in-memory session and bearer token;
 * 2. `GET /api/auth/me` so a stale token surfaces as a 401 instead of an
 *    endless WebSocket reconnect loop;
 * 3. on success, ask the sidecar to open its agent WebSocket.
 *
 * A 401 on any authenticated request is routed to one handler that ends the
 * session, closes the sidecar connection and sends the user to the login page.
 * Renders nothing.
 */
export function ApiBaseBootstrap(): null {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const navigateToLogin = () => {
      if (typeof window !== 'undefined' && window.location?.pathname?.startsWith('/login')) {
        return;
      }
      router.replace('/login');
    };

    const handleUnauthorized = async () => {
      await endDeviceSession();
      if (!cancelled) {
        navigateToLogin();
      }
    };

    const unsubscribe = setUnauthorizedHandler(handleUnauthorized);

    const hydrate = async () => {
      let stored: string | null = null;
      try {
        stored =
          typeof window !== 'undefined'
            ? window.localStorage.getItem(API_BASE_STORAGE_KEY)
            : null;
      } catch {
        stored = null;
      }
      setApiBase(stored);

      if (!isDesktop()) {
        return;
      }

      const session = await loadDesktopSession();
      if (cancelled || !session) {
        return;
      }

      setSession(session);
      if (session.serverUrl) {
        setApiBase(session.serverUrl);
      }
      setAccessToken(session.accessToken ?? null);

      if (!session.accessToken) {
        return;
      }

      try {
        const res = await apiFetch('/api/auth/me');
        if (cancelled) {
          return;
        }

        // The client routed this 401 to the unauthorized handler, which already
        // cleared the session and closed the sidecar connection.
        if (res.status === 401 || !res.ok) {
          return;
        }

        const serverUrl = session.serverUrl || getApiBase();
        if (serverUrl) {
          await connectSidecar(serverUrl, session.accessToken);
        }
      } catch (err) {
        // A transient network failure keeps the session for the next attempt.
        console.error('Failed to validate the desktop session at boot:', err);
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  return null;
}
