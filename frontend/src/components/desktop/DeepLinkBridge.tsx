'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppRoute } from '@/hooks/useAppRoute';
import { initDeepLinks } from '@/lib/desktop/deepLink';
import { parseDeepLink } from '@/lib/routing/route';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Bridges OS deep links into the application route.
 *
 * Mounted once by the root layout. On desktop it subscribes to `apidot://`
 * URLs, navigates straight to the requested workspace/request when the user
 * is signed in, and otherwise parks the route so the login screen can resume
 * it after sign-in. Outside the desktop shell `initDeepLinks` is a no-op, so
 * the component renders nothing and stays inert.
 */
export function DeepLinkBridge() {
  const router = useRouter();
  const { navigate } = useAppRoute();

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    const handleUrl = (url: string) => {
      if (!active) {
        return;
      }

      const route = parseDeepLink(url);
      // Invalid links and bare launches have nothing to resume.
      if (!route || route.kind === 'home') {
        return;
      }

      if (!useAuthStore.getState().isAuthenticated) {
        useAuthStore.getState().setPendingRoute(route);
        router.replace('/login');
        return;
      }

      navigate(route);
    };

    void initDeepLinks(handleUrl).then((cleanup) => {
      if (!active) {
        // The effect was cleaned up while `initDeepLinks` was resolving:
        // release the subscription right away instead of leaking it.
        cleanup();
        return;
      }
      unlisten = cleanup;
    });

    return () => {
      active = false;
      unlisten?.();
      unlisten = null;
    };
  }, [navigate, router]);

  return null;
}
