'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setUnauthorizedHandler } from '@/lib/api/client';
import { isDesktop } from '@/lib/desktop/runtime';
import { endDeviceSession } from '@/lib/desktop/deviceSession';
import { ensureBooted } from '@/lib/session/boot';
import { useSessionStore } from '@/lib/session/state';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Releases the app once the boot has settled, and wires the 401 handler.
 *
 * The gate is a UI concern; it is not what makes requests safe. `apiFetch`
 * awaits the same boot, so any request fired outside the gate still waits. On
 * the web there is no desktop session to restore, so the children render
 * immediately.
 *
 * A 401 on an authenticated request ends the session, closes the sidecar and
 * sends the user to the login page.
 */
export function ApiBaseBootstrap({ children }: { children: React.ReactNode }): React.ReactNode {
  const router = useRouter();
  const [desktop] = useState(() => isDesktop());
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);

  useEffect(() => {
    void ensureBooted();
  }, []);

  useEffect(() => {
    if (user) {
      useAuthStore.getState().setUser(user);
    }
  }, [user]);

  // A failed boot has no usable API base: the login screen is the only place
  // where the user can set one, so the home route would dead-end on an error.
  useEffect(() => {
    if (!desktop || status !== 'failed') {
      return;
    }
    if (typeof window !== 'undefined' && window.location?.pathname?.startsWith('/login')) {
      return;
    }
    router.replace('/login');
  }, [desktop, status, router]);

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

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  const booted = status === 'ready' || status === 'failed';
  if (desktop && !booted) {
    return null;
  }

  return <>{children}</>;
}
