'use client';

import React, { useEffect, use } from 'react';
import { useParams } from 'next/navigation';
import { WorkspaceEditorPane } from '@/components/workspace/WorkspaceEditorPane';
import { useRequestStore } from '@/stores/useRequestStore';
import { useWorkspaceContext } from '@/context/WorkspaceContext';

export interface WorkspacePageProps {
  params?: Promise<{ workspaceId: string }>;
}

export default function WorkspacePage({ params: propsParams }: WorkspacePageProps): React.JSX.Element {
  const routeParams = useParams();

  const unwrappedParams =
    propsParams && typeof (propsParams as any).then === 'function'
      ? use(propsParams as Promise<{ workspaceId: string }>)
      : (propsParams as { workspaceId: string } | undefined);

  const rawId = unwrappedParams?.workspaceId ?? routeParams?.workspaceId;
  const workspaceId = Array.isArray(rawId) ? rawId[0] : (typeof rawId === 'string' ? rawId : '');

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
