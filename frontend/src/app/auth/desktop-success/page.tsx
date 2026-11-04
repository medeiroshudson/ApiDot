'use client';

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { CheckCircle2 } from 'lucide-react';
import ApiDotLogo from '@assets/api-dot-white.svg';

export default function DesktopSuccessPage() {
  const { t } = useTranslation();

  const handleOpenDesktop = () => {
    if (typeof window !== 'undefined') {
      window.close();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center px-4 py-12 selection:bg-neutral-800 selection:text-white">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center gap-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header with ApiDot branding */}
        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="inline-flex items-center justify-center gap-2 mb-1">
            <ApiDotLogo className="h-8 w-auto text-white" aria-label="ApiDot" />
            <span className="sr-only">ApiDot</span>
          </div>
        </div>

        {/* Emerald Check Icon */}
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
        </div>

        {/* Title and Message */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {t('auth.desktopSuccessTitle')}
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed max-w-sm">
            {t('auth.desktopSuccessMessage')}
          </p>
        </div>

        {/* Action Button */}
        <div className="w-full pt-2">
          <button
            type="button"
            onClick={handleOpenDesktop}
            className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-sm transition-colors shadow-lg shadow-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer"
          >
            {t('auth.desktopSuccessButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
