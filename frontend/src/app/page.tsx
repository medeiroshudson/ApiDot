'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);

  useEffect(() => {
    let isMounted = true;

    async function resolveAndRedirect() {
      try {
        if (activeWorkspaceId) {
          if (isMounted) {
            router.replace(`/workspace/${activeWorkspaceId}`);
          }
          return;
        }

        const list = await fetchWorkspaces();
        if (!isMounted) return;

        if (list && list.length > 0) {
          const targetId = useWorkspaceStore.getState().activeWorkspaceId || list[0].id;
          router.replace(`/workspace/${targetId}`);
        } else {
          const created = await createWorkspace('Workspace');
          if (isMounted && created?.id) {
            router.replace(`/workspace/${created.id}`);
          }
        }
      } catch (error) {
        console.error('Failed to resolve and redirect workspace:', error);
      }
    }

    resolveAndRedirect();

    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId, fetchWorkspaces, createWorkspace, router]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-neutral-400 gap-3"
    >
      <Loader2 className="w-6 h-6 animate-spin text-neutral-200" />
      <span className="text-sm font-medium">Carregando workspace...</span>
    </div>
  );
}
