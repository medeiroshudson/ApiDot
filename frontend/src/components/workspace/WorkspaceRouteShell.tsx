'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';
import { WorkspaceEditorPane } from '@/components/workspace/WorkspaceEditorPane';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { isDesktop } from '@/lib/desktop/runtime';

export interface WorkspaceRouteShellProps {
  workspaceId: string;
  /** Selected request; when absent the shell renders the scratchpad editor. */
  requestId?: string | null;
  /** Web layouts render their page children; the desktop root page uses requestId. */
  children?: React.ReactNode;
}

/**
 * Shared workspace chrome for a single route. Used by the web layout (with
 * children) and by the desktop root page (which derives the route from the
 * hash and renders the editor itself).
 */
export function WorkspaceRouteShell({
  workspaceId,
  requestId = null,
  children,
}: WorkspaceRouteShellProps): React.JSX.Element {
  const router = useRouter();

  const activeWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === (workspaceId || s.activeWorkspaceId))
  );

  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    let isMounted = true;

    async function verifyAuth() {
      await checkAuth();
      if (!isMounted) return;

      const authState = useAuthStore.getState();
      if (!authState.isLoading && !authState.isAuthenticated) {
        if (isDesktop()) {
          // The desktop shell lives at "/"; remember the route so the login
          // screen can resume it through the hash.
          useAuthStore
            .getState()
            .setPendingRoute(
              workspaceId && requestId
                ? { kind: 'request', workspaceId, requestId }
                : workspaceId
                  ? { kind: 'workspace', workspaceId }
                  : { kind: 'home' }
            );
          router.replace('/login');
          return;
        }
        const returnUrl = workspaceId ? `/workspace/${encodeURIComponent(workspaceId)}` : '/';
        router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      }
    }

    verifyAuth();

    return () => {
      isMounted = false;
    };
  }, [checkAuth, router, workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      useWorkspaceStore.getState().setActiveWorkspaceId(workspaceId);
    }
  }, [workspaceId]);

  useEffect(() => {
    const workspaceName = activeWorkspace?.name;
    if (workspaceName) {
      document.title = `ApiDot - ${workspaceName}`;
    } else {
      document.title = 'ApiDot - Test and debug any API, anywhere';
    }
  }, [activeWorkspace?.name]);

  return (
    <WorkspaceShell workspaceId={workspaceId}>
      {children ?? <WorkspaceEditorPane workspaceId={workspaceId} requestId={requestId} />}
    </WorkspaceShell>
  );
}
