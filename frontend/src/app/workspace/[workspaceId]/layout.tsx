'use client';

import React, { useEffect, use } from 'react';
import { useParams } from 'next/navigation';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

export interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params?: { workspaceId: string } | Promise<{ workspaceId: string }>;
}

export default function WorkspaceLayout({ children, params: propsParams }: WorkspaceLayoutProps) {
  const routeParams = useParams();

  const unwrappedParams =
    propsParams && typeof (propsParams as any).then === 'function'
      ? use(propsParams as Promise<{ workspaceId: string }>)
      : (propsParams as { workspaceId: string } | undefined);

  const rawId = unwrappedParams?.workspaceId ?? routeParams?.workspaceId;
  const workspaceId = Array.isArray(rawId) ? rawId[0] : (typeof rawId === 'string' ? rawId : '');

  useEffect(() => {
    if (workspaceId) {
      useWorkspaceStore.getState().setActiveWorkspaceId(workspaceId);
    }
  }, [workspaceId]);

  return (
    <WorkspaceShell workspaceId={workspaceId}>
      {children}
    </WorkspaceShell>
  );
}
