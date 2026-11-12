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
import { useAuthStore } from '@/stores/useAuthStore';
import type { AuthUser } from '@/lib/authApi';

/**
 * Restores the persisted API base and, in the desktop app, the device session
 * before the rest of the app starts issuing requests.
 *
 * Children stay unmounted on desktop until the boot sequence has been
 * attempted, so no route requests with an empty base and no bearer token. The
 * web build renders immediately. A 401 on an authenticated request ends the
 * session, closes the sidecar and sends the user to the login page.
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

          // Signed in before the routes mount: the login screen does not ask again and a
          // deep link parked during hydration resumes. A malformed body is ignored.
          try {
            const user = (await res.json()) as AuthUser;
            useAuthStore.getState().setUser(user);
          } catch (err) {
            console.error('Failed to parse the desktop session user:', err);
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
        // Failed hydration falls back to the login screen, never a blank window.
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    // The gate is already released in `finally`; log instead of rethrowing.
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
