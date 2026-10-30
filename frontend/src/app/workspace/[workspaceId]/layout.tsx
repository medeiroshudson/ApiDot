'use client';

import React, { useEffect, use } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useAuthStore } from '@/stores/useAuthStore';

export interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params?: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

export default function WorkspaceLayout({ children, params: propsParams }: WorkspaceLayoutProps) {
  const router = useRouter();
  const routeParams = useParams();

  const unwrappedParams =
    propsParams && typeof (propsParams as any).then === 'function'
      ? use(propsParams as Promise<{ workspaceId: string }>)
      : (propsParams as { workspaceId: string } | undefined);

  const rawId = unwrappedParams?.workspaceId ?? routeParams?.workspaceId;
  const workspaceId = Array.isArray(rawId) ? rawId[0] : (typeof rawId === 'string' ? rawId : '');

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
      {children}
    </WorkspaceShell>
  );
}
