'use client';

import React, { useEffect, use } from 'react';
import { WorkspaceEditorPane } from '@/components/workspace/WorkspaceEditorPane';
import { useRequestStore } from '@/stores/useRequestStore';
import { useWorkspaceContext } from '@/context/WorkspaceContext';
import { useAppRoute } from '@/hooks/useAppRoute';

export interface WorkspacePageProps {
  params?: Promise<{ workspaceId: string }>;
}

export default function WorkspacePageClient({ params: propsParams }: WorkspacePageProps): React.JSX.Element {
  const { route } = useAppRoute();

  const unwrappedParams =
    propsParams && typeof (propsParams as any).then === 'function'
      ? use(propsParams as Promise<{ workspaceId: string }>)
      : (propsParams as { workspaceId: string } | undefined);

  const propWorkspaceId = unwrappedParams?.workspaceId;
  const routeWorkspaceId =
    route.kind === 'workspace' || route.kind === 'request' ? route.workspaceId : '';
  const workspaceId =
    typeof propWorkspaceId === 'string' && propWorkspaceId.length > 0
      ? propWorkspaceId
      : routeWorkspaceId;

  const setActiveRequest = useRequestStore((s) => s.setActiveRequest);
  const setCurrentEditorData = useRequestStore((s) => s.setCurrentEditorData);
  const { setActiveItem } = useWorkspaceContext();

  useEffect(() => {
    if (workspaceId) {
      if (useRequestStore.getState().activeRequestId !== null) {
        setActiveRequest(null, null, workspaceId);
        setCurrentEditorData(null);
      }
      setActiveItem((current) => (current === null ? current : null));
    }
  }, [workspaceId, setActiveRequest, setCurrentEditorData, setActiveItem]);

  return <WorkspaceEditorPane workspaceId={workspaceId} requestId={null} />;
}
