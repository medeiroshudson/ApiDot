'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTranslation } from '@/hooks/useTranslation';
import { LogIn, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

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
  } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // If already authenticated, redirect to returnUrl or "/"
  useEffect(() => {
    if (isAuthenticated) {
      routerRef.current.replace(getReturnUrl());
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
      await loginLocal(email.trim(), password);
      routerRef.current.replace(getReturnUrl());
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
            <span className="text-2xl font-bold tracking-tight text-white select-none">
              ⚡ ApiDot
            </span>
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
            <a
              href={`/api/auth/login${getReturnUrl() !== '/' ? `?returnUrl=${encodeURIComponent(getReturnUrl())}` : ''}`}
              role="button"
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Spacebar') {
                  e.preventDefault();
                  window.location.href = `/api/auth/login${getReturnUrl() !== '/' ? `?returnUrl=${encodeURIComponent(getReturnUrl())}` : ''}`;
                }
              }}
              aria-label={t('auth.ssoSignIn')}
              className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-sm transition-colors shadow-lg shadow-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer"
            >
              <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('auth.ssoSignIn')}</span>
            </a>

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
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
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
