'use client';

import React, { use } from 'react';
import { WorkspaceRouteShell } from '@/components/workspace/WorkspaceRouteShell';
import { useAppRoute } from '@/hooks/useAppRoute';

export interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params?: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

export default function WorkspaceLayout({ children, params: propsParams }: WorkspaceLayoutProps) {
  const { route } = useAppRoute();

  const unwrappedParams =
    propsParams && typeof (propsParams as any).then === 'function'
      ? use(propsParams as Promise<{ workspaceId: string }>)
      : (propsParams as { workspaceId: string } | undefined);

  const propWorkspaceId = unwrappedParams?.workspaceId;
  const routeWorkspaceId =
    route.kind === 'workspace' || route.kind === 'request' ? route.workspaceId : undefined;
  const rawId = propWorkspaceId ?? routeWorkspaceId;
  const workspaceId = Array.isArray(rawId) ? rawId[0] : (typeof rawId === 'string' ? rawId : '');

  return (
    <WorkspaceRouteShell
      workspaceId={workspaceId}
      requestId={route.kind === 'request' ? route.requestId : undefined}
    >
      {children}
    </WorkspaceRouteShell>
  );
}
