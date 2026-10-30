import React from 'react';

export const HTTP_METHOD_BADGES: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80',
  POST: 'text-blue-400 bg-blue-950/60 border-blue-800/80',
  PUT: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
  PATCH: 'text-purple-400 bg-purple-950/60 border-purple-800/80',
  DELETE: 'text-rose-400 bg-rose-950/60 border-rose-800/80',
  HEAD: 'text-neutral-400 bg-neutral-900 border-neutral-700',
  OPTIONS: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/80',
};

export const METHOD_COLORS = HTTP_METHOD_BADGES;

export const DEFAULT_METHOD_BADGE_STYLE = 'text-neutral-400 bg-neutral-900 border-neutral-700';

export interface MethodBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  method?: string | null;
  size?: 'sm' | 'md';
}

export function MethodBadge({
  method,
  size = 'sm',
  className = '',
  ...rest
}: MethodBadgeProps): React.JSX.Element {
  const normalizedMethod = (method?.trim() || 'GET').toUpperCase();
  const colorClasses = HTTP_METHOD_BADGES[normalizedMethod] || DEFAULT_METHOD_BADGE_STYLE;
  const sizeClasses = size === 'md' ? 'w-16 h-6 text-xs' : 'w-[52px] h-5 text-[10px]';

  return (
    <span
      className={`inline-flex items-center justify-center font-mono font-semibold rounded border uppercase shrink-0 tracking-wide select-none ${sizeClasses} ${colorClasses} ${className}`.trim()}
      {...rest}
    >
      {normalizedMethod}
    </span>
  );
}
