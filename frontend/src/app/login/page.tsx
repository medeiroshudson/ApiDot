'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTranslation } from '@/hooks/useTranslation';
import { isDesktop } from '@/lib/desktop/runtime';
import { toHash } from '@/lib/routing/route';
import { startDesktopSsoFlow } from '@/lib/desktop/desktopAuth';
import { apiUrl, getApiBase, normalizeApiBase, setApiBase } from '@/lib/api/base';
import { getSession, patchSession } from '@/lib/api/session';
import { saveDesktopSession } from '@/lib/desktop/session';
import { LogIn, Lock, Mail, AlertCircle, Loader2, Server } from 'lucide-react';
import ApiDotLogo from '@assets/api-dot-white.svg';

/** Prefers the base in memory, then the session's URL: it is empty before the first sign-in. */
function initialServerUrl(): string {
  if (!isDesktop()) {
    return '';
  }
  return getApiBase() || getSession()?.serverUrl || '';
}

export default function LoginPage() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { t } = useTranslation();

  const {
    config,
    fetchConfig,
    isAuthenticated,
    loginLocal,
    loginDesktopSso,
  } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(initialServerUrl);
  const [serverUrlError, setServerUrlError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingBrowserAuth, setIsWaitingBrowserAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const getReturnUrl = () => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const returnUrl = params.get('returnUrl');
        if (
          returnUrl &&
          returnUrl.startsWith('/') &&
          !returnUrl.startsWith('//') &&
          !returnUrl.startsWith('/\\')
        ) {
          return returnUrl;
        }
      } catch {
        // ignore
      }
    }
    return '/';
  };

  /**
   * Picks the post-login destination. A desktop deep link captured before the
   * login screen wins over the web-style returnUrl and is consumed once.
   */
  const resolveLoginTarget = () => {
    if (isDesktop()) {
      const { pendingRoute, setPendingRoute } = useAuthStore.getState();
      if (pendingRoute) {
        setPendingRoute(null);
        return `/${toHash(pendingRoute)}`;
      }
    }
    return getReturnUrl();
  };

  const redirectAfterLogin = () => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    routerRef.current.replace(resolveLoginTarget());
  };

  // If already authenticated, redirect to the pending route, returnUrl or "/"
  useEffect(() => {
    if (isAuthenticated) {
      redirectAfterLogin();
    }
  }, [isAuthenticated]);

  // Fetch auth config on mount if not already loaded
  useEffect(() => {
    if (!config) {
      fetchConfig().catch(() => {});
    }
  }, [config, fetchConfig]);

  // Check for error query parameter from SSO redirect (e.g. /login?error=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlError = params.get('error');
        if (urlError) {
          setError(decodeURIComponent(urlError));
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const isOidcEnabled = config === null || config.oidcEnabled === true;

  /** Persists the Server URL before the request that depends on it; null means invalid. */
  const persistServerUrl = async (): Promise<string | null> => {
    if (!isDesktop()) {
      return '';
    }

    const trimmed = serverUrl.trim();
    const normalized = normalizeApiBase(trimmed);
    if (trimmed && !normalized) {
      setServerUrlError(t('auth.serverUrlInvalid'));
      return null;
    }

    setServerUrlError(null);
    setApiBase(normalized);

    const updated = patchSession({ serverUrl: normalized });
    if (updated) {
      await saveDesktopSession(updated);
    }

    return normalized;
  };

  const handleDesktopSso = async () => {
    if (isWaitingBrowserAuth) return;
    setError(null);

    // Persist first, or the SSO URL falls back to the webview origin.
    const base = await persistServerUrl();
    if (base === null) {
      return;
    }

    setIsWaitingBrowserAuth(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await startDesktopSsoFlow({
        returnUrl: getReturnUrl(),
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) {
        return;
      }

      if (result.success && result.user) {
        loginDesktopSso(result.user);
        redirectAfterLogin();
      } else if (!result.success && result.error && result.error !== 'Authentication cancelled') {
        setError(result.error);
      }
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        const message = err instanceof Error ? err.message : t('auth.authFailed');
        setError(message);
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsWaitingBrowserAuth(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleCancelDesktopAuth = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsWaitingBrowserAuth(false);
  };

  const handleLocalSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!email.trim() || !password) {
      setError(t('auth.fillAllFields'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const base = await persistServerUrl();
      if (base === null) {
        return;
      }

      await loginLocal(email.trim(), password);
      redirectAfterLogin();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth.authFailed');
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center px-4 py-12 selection:bg-neutral-800 selection:text-white">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header with ApiDot branding */}
        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="inline-flex items-center justify-center gap-2 mb-1">
            <ApiDotLogo className="h-8 w-auto text-white" aria-label="ApiDot" />
            <span className="sr-only">ApiDot</span>
          </div>
          <p className="text-sm text-neutral-400">
            {t('auth.loginSubtitle')}
          </p>
        </div>

        {/* Global Error Banner (SSO redirects or Form errors) */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs animate-in fade-in duration-150 leading-relaxed"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* SSO Button & Divider */}
        {isOidcEnabled && (
          <div className="flex flex-col gap-5">
            {isWaitingBrowserAuth ? (
              <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 text-center animate-in fade-in duration-200">
                <div className="flex items-center gap-2.5 text-sm text-neutral-300">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" aria-hidden="true" />
                  <span>{t('auth.waitingBrowserAuth')}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelDesktopAuth}
                  aria-label={t('auth.cancelWaiting')}
                  className="px-3 py-1 rounded-md text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  {t('auth.cancelWaiting')}
                </button>
              </div>
            ) : isDesktop() ? (
              <button
                type="button"
                onClick={handleDesktopSso}
                aria-label={t('auth.ssoSignIn')}
                className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-sm transition-colors shadow-lg shadow-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer"
              >
                <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('auth.ssoSignIn')}</span>
              </button>
            ) : (
              <a
                href={apiUrl(`/api/auth/login${getReturnUrl() !== '/' ? `?returnUrl=${encodeURIComponent(getReturnUrl())}` : ''}`)}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    window.location.href = apiUrl(`/api/auth/login${getReturnUrl() !== '/' ? `?returnUrl=${encodeURIComponent(getReturnUrl())}` : ''}`);
                  }
                }}
                aria-label={t('auth.ssoSignIn')}
                className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-sm transition-colors shadow-lg shadow-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer"
              >
                <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('auth.ssoSignIn')}</span>
              </a>
            )}

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-800" />
              </div>
              <div className="relative px-3 bg-neutral-900 text-xs text-neutral-400 uppercase tracking-wider select-none">
                {t('auth.or')}
              </div>
            </div>
          </div>
        )}

        {/* Local Login Form */}
        <form onSubmit={handleLocalSubmit} className="flex flex-col gap-4">
          {/* Server URL (desktop only): a fresh install has no other way to
              point the app at a server before it is authenticated. */}
          {isDesktop() && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="server-url"
                className="text-xs font-medium text-neutral-300 flex items-center gap-1.5"
              >
                <Server className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
                <span>{t('auth.serverUrlLabel')}</span>
              </label>
              <input
                id="server-url"
                name="server-url"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={t('auth.serverUrlHint')}
                aria-invalid={serverUrlError ? true : undefined}
                aria-describedby={serverUrlError ? 'server-url-error' : undefined}
                value={serverUrl}
                disabled={isSubmitting}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  if (serverUrlError) setServerUrlError(null);
                }}
                className="w-full px-3.5 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:border-neutral-700 focus:ring-1 focus:ring-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {serverUrlError && (
                <p id="server-url-error" role="alert" className="text-xs text-rose-400">
                  {serverUrlError}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-xs font-medium text-neutral-300 flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
              <span>{t('auth.email')}</span>
            </label>
            <input
              id="email"
              name="email"
              type="text"
              inputMode="email"
              required
              autoComplete="username"
              placeholder={t('auth.emailPlaceholder')}
              aria-invalid={!!error}
              value={email}
              disabled={isSubmitting}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:border-neutral-700 focus:ring-1 focus:ring-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium text-neutral-300 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
              <span>{t('auth.password')}</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!error}
              value={password}
              disabled={isSubmitting}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder:text-neutral-500 text-sm focus:outline-none focus:border-neutral-700 focus:ring-1 focus:ring-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            aria-label={t('auth.localSubmitButton')}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-100 hover:bg-white active:bg-neutral-200 text-neutral-900 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                <span>{t('auth.signingIn')}</span>
              </>
            ) : (
              <span>{t('auth.localSubmitButton')}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
