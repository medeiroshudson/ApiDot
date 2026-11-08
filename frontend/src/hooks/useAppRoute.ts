'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { isDesktop } from '@/lib/desktop/runtime';
import {
  AppRoute,
  parseHashRoute,
  parsePathRoute,
  toHash,
  toPath,
} from '@/lib/routing/route';

type RouteParams = Record<string, string | string[] | undefined> | null | undefined;

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || raw.length === 0 || raw.includes('/')) {
    return null;
  }
  return raw;
}

/**
 * Builds a route from Next.js dynamic params. Returns null when the params do
 * not describe a known route so the caller can fall back to the pathname.
 */
function routeFromParams(params: RouteParams): AppRoute | null {
  const workspaceId = firstParam(params?.workspaceId);
  if (!workspaceId) {
    return null;
  }
  const requestId = firstParam(params?.requestId);
  return requestId ? { kind: 'request', workspaceId, requestId } : { kind: 'workspace', workspaceId };
}

function currentHash(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.location.hash;
}

/**
 * Announces a hash change that was produced by `history.pushState` /
 * `history.replaceState` (which do not fire `hashchange` themselves).
 */
function notifyHashChange(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (typeof HashChangeEvent === 'function') {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.dispatchEvent(new Event('hashchange'));
}

export interface UseAppRouteResult {
  route: AppRoute;
  navigate: (route: AppRoute, opts?: { replace?: boolean }) => void;
}

/**
 * Single source of truth for the current application route.
 *
 * On the web the route comes from the Next.js router (dynamic params first,
 * pathname as fallback). On the desktop shell the route lives in the URL hash
 * and is kept in sync through `hashchange`.
 */
export function useAppRoute(): UseAppRouteResult {
  const params = useParams() as RouteParams;
  const pathname = usePathname();
  const router = useRouter();
  const desktop = isDesktop();

  const [hashRoute, setHashRoute] = useState<AppRoute>(() => parseHashRoute(currentHash()));

  useEffect(() => {
    if (!desktop) {
      return;
    }

    const syncFromHash = () => {
      setHashRoute(parseHashRoute(currentHash()));
    };

    // Pick up a hash that changed between the first render and the subscription.
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [desktop]);

  const route = useMemo<AppRoute>(() => {
    if (desktop) {
      return hashRoute;
    }
    return routeFromParams(params) ?? parsePathRoute(pathname ?? '');
  }, [desktop, hashRoute, params, pathname]);

  const navigate = useCallback(
    (next: AppRoute, opts?: { replace?: boolean }) => {
      if (desktop) {
        const hash = toHash(next);
        const hashChanged = currentHash() !== hash;
        if (hashChanged) {
          const url = `${window.location.pathname}${window.location.search}${hash}`;
          if (opts?.replace) {
            window.history.replaceState(window.history.state, '', url);
          } else {
            window.history.pushState(window.history.state, '', url);
          }
        }
        // pushState/replaceState emit no `hashchange`; notify every hook
        // instance (root shell, provider, pages) that the route changed.
        setHashRoute(next);
        if (hashChanged) {
          notifyHashChange();
        }
        return;
      }

      const path = toPath(next);
      if (opts?.replace) {
        router.replace(path);
      } else {
        router.push(path);
      }
    },
    [desktop, router]
  );

  return { route, navigate };
}
