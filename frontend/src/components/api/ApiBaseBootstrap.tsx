'use client';

import React, { useEffect, useState } from 'react';
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
 * The children stay unmounted until the boot sequence above has been
 * attempted, so a route never issues a request with an empty base and no
 * bearer token. The gate is desktop-only: on the web `ready` starts `true` and
 * the children render immediately, which keeps that build unchanged.
 *
 * A 401 on any authenticated request is routed to one handler that ends the
 * session, closes the sidecar connection and sends the user to the login page.
 */
export function ApiBaseBootstrap({ children }: { children: React.ReactNode }): React.ReactNode {
  const router = useRouter();
  const [ready, setReady] = useState(() => !isDesktop());

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
      try {
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
      } finally {
        // Whatever happened above, the UI must not stay behind the gate: a
        // failed hydration falls back to the login screen instead of a blank
        // window. A cancelled effect leaves the unmount alone.
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    // A rejected hydration must not become an unhandled rejection: the gate is
    // already released by the `finally` above.
    void hydrate().catch((err) => {
      console.error('Failed to hydrate the desktop session at boot:', err);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
