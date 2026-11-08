'use client';

import React, { useEffect, useRef, use } from 'react';
import { WorkspaceEditorPane } from '@/components/workspace/WorkspaceEditorPane';
import { useWorkspaceContext, findRequestInTree } from '@/context/WorkspaceContext';
import { useRequestStore } from '@/stores/useRequestStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useAppRoute } from '@/hooks/useAppRoute';

export interface RequestPageProps {
  params?: Promise<{ workspaceId: string; requestId: string }>;
}

export default function RequestPageClient({ params: propsParams }: RequestPageProps): React.JSX.Element {
  const { route, navigate } = useAppRoute();

  const unwrappedParams =
    propsParams && typeof (propsParams as any).then === 'function'
      ? use(propsParams as Promise<{ workspaceId: string; requestId: string }>)
      : (propsParams as { workspaceId: string; requestId: string } | undefined);

  const propWorkspaceId = unwrappedParams?.workspaceId;
  const propRequestId = unwrappedParams?.requestId;

  const workspaceId =
    typeof propWorkspaceId === 'string' && propWorkspaceId.length > 0
      ? propWorkspaceId
      : route.kind === 'workspace' || route.kind === 'request'
        ? route.workspaceId
        : '';

  const requestId =
    typeof propRequestId === 'string' && propRequestId.length > 0
      ? propRequestId
      : route.kind === 'request'
        ? route.requestId
        : '';

  const { tree, isTreeLoading, setActiveItem } = useWorkspaceContext();
  const setActiveRequest = useRequestStore((s) => s.setActiveRequest);
  const setSyncError = useLayoutStore((s) => s.setSyncError);

  const redirectedRef = useRef(false);
  const prevRequestIdRef = useRef(requestId);

  useEffect(() => {
    if (prevRequestIdRef.current !== requestId) {
      redirectedRef.current = false;
      prevRequestIdRef.current = requestId;
    }
  }, [requestId]);

  useEffect(() => {
    if (!requestId || !workspaceId) return;

    if (isTreeLoading) return;

    if (tree) {
      const found = findRequestInTree(tree, requestId);
      if (found) {
        redirectedRef.current = false;
        const currentActiveId = useRequestStore.getState().activeRequestId;
        if (currentActiveId !== found.id) {
          setActiveRequest(
            found.id,
            {
              id: found.id,
              name: found.name,
              method: found.method || 'GET',
              url: found.url || '',
              target: found.target || 'Inherit',
              headers: found.headersJson || '',
              body: found.bodyContent || '',
              auth: { type: 'none' },
              collectionId: found.collectionId,
              folderId: found.folderId,
              schemaDefinition: found.schemaDefinition,
            },
            workspaceId
          );
        }
        setActiveItem((current) => {
          if (current?.id === found.id && current?.type === 'request') {
            return current;
          }
          return {
            type: 'request',
            id: found.id,
            data: found,
          };
        });
      } else {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          setSyncError(`Requisição "${requestId}" não encontrada.`);
          navigate({ kind: 'workspace', workspaceId }, { replace: true });
        }
      }
    }
  }, [tree, isTreeLoading, requestId, workspaceId, setActiveRequest, setActiveItem, setSyncError, navigate]);

  return <WorkspaceEditorPane workspaceId={workspaceId} requestId={requestId} />;
}
