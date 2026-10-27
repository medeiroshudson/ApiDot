'use client';

import React, { useEffect, useRef, use } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkspaceEditorPane } from '@/components/workspace/WorkspaceEditorPane';
import { useWorkspaceContext, findRequestInTree } from '@/context/WorkspaceContext';
import { useRequestStore } from '@/stores/useRequestStore';
import { useLayoutStore } from '@/stores/useLayoutStore';

export interface RequestPageProps {
  params?: Promise<{ workspaceId: string; requestId: string }>;
}

export default function RequestPage({ params: propsParams }: RequestPageProps): React.JSX.Element {
  const router = useRouter();
  const routeParams = useParams();

  const unwrappedParams =
    propsParams && typeof (propsParams as any).then === 'function'
      ? use(propsParams as Promise<{ workspaceId: string; requestId: string }>)
      : (propsParams as { workspaceId: string; requestId: string } | undefined);

  const rawWsId = unwrappedParams?.workspaceId ?? routeParams?.workspaceId;
  const workspaceId = Array.isArray(rawWsId) ? rawWsId[0] : (typeof rawWsId === 'string' ? rawWsId : '');

  const rawReqId = unwrappedParams?.requestId ?? routeParams?.requestId;
  const requestId = Array.isArray(rawReqId) ? rawReqId[0] : (typeof rawReqId === 'string' ? rawReqId : '');

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
          router.replace(`/workspace/${encodeURIComponent(workspaceId)}`);
        }
      }
    }
  }, [tree, isTreeLoading, requestId, workspaceId, setActiveRequest, setActiveItem, setSyncError, router]);

  return <WorkspaceEditorPane workspaceId={workspaceId} requestId={requestId} />;
}
