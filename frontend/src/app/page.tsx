'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTranslation } from '@/hooks/useTranslation';
import { Loader2, AlertCircle } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { t } = useTranslation();

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const checkAuth = useAuthStore((s) => s.checkAuth);

  const redirectedRef = useRef(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const executeRedirect = useCallback((targetId: string) => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    routerRef.current.replace(`/workspace/${encodeURIComponent(targetId)}`);
  }, []);

  const resolveAndRedirect = useCallback(async () => {
    try {
      setHasError(false);
      setErrorMessage(null);

      // Check auth status on mount via checkAuth()
      const user = await checkAuth();
      const authState = useAuthStore.getState();

      if (!authState.isLoading && !authState.isAuthenticated) {
        if (authState.error) {
          throw new Error(authState.error);
        }
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          routerRef.current.replace('/login');
        }
        return;
      }

      // Check legacy / preferred localStorage active workspace
      let legacyId: string | null = null;
      try {
        legacyId =
          typeof window !== 'undefined'
            ? localStorage.getItem('apidot_active_workspace_id')
            : null;
      } catch {
        legacyId = null;
      }

      // If authenticated on "/", redirect to preferred active workspace or first available workspace
      if (user?.workspaces && user.workspaces.length > 0) {
        const preferredWs = user.isRoot && activeWorkspaceId
          ? user.workspaces.find((w) => (activeWorkspaceId && w.id === activeWorkspaceId) || (legacyId && w.id === legacyId)) || { id: activeWorkspaceId }
          : user.workspaces.find((w) => (activeWorkspaceId && w.id === activeWorkspaceId) || (legacyId && w.id === legacyId));
        const targetId = preferredWs ? preferredWs.id : user.workspaces[0].id;
        executeRedirect(targetId);
        return;
      }

      // Fallback: fetch workspaces list from API
      const list = await fetchWorkspaces();
      const storeError = useWorkspaceStore.getState().error;
      if (storeError) {
        throw new Error(storeError);
      }

      if (list && list.length > 0) {
        const targetId = useWorkspaceStore.getState().activeWorkspaceId || list[0].id;
        executeRedirect(targetId);
      } else {
        const created = await createWorkspace('Workspace');
        if (created?.id) {
          executeRedirect(created.id);
        }
      }
    } catch (error) {
      redirectedRef.current = false;
      setHasError(true);
      setErrorMessage(
        error instanceof Error ? error.message : t('home.errorDefault')
      );
    }
  }, [activeWorkspaceId, fetchWorkspaces, createWorkspace, executeRedirect, checkAuth, t]);

  useEffect(() => {
    let isMounted = true;

    async function run() {
      if (!isMounted) return;
      await resolveAndRedirect();
    }

    run();

    return () => {
      isMounted = false;
    };
  }, [resolveAndRedirect, retryCount]);

  const handleRetry = () => {
    useWorkspaceStore.setState({ error: null });
    useAuthStore.setState({ error: null });
    redirectedRef.current = false;
    setRetryCount((prev) => prev + 1);
  };

  if (hasError) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-neutral-300 gap-4 p-6"
      >
        <AlertCircle className="w-8 h-8 text-rose-500 shrink-0" />
        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-base font-semibold text-neutral-100">{t('home.errorTitle')}</h2>
          <p className="text-sm text-neutral-400 max-w-sm">
            {errorMessage || t('home.errorFallback')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          className="px-4 py-2 text-sm font-medium rounded-md bg-neutral-800 text-neutral-100 hover:bg-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 cursor-pointer"
        >
          {t('home.retry')}
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-neutral-400 gap-3"
    >
      <Loader2 className="w-6 h-6 animate-spin text-neutral-200" />
      <span className="text-sm font-medium">{t('home.loading')}</span>
    </div>
  );
}
