import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  sizeVariant?: 'sm' | 'md';
  wrapperClassName?: string;
  iconClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      sizeVariant = 'sm',
      wrapperClassName = '',
      iconClassName = '',
      className = '',
      disabled = false,
      children,
      ...rest
    },
    ref
  ) => {
    const sizeClasses =
      sizeVariant === 'md'
        ? 'h-9 text-xs pl-2.5 pr-8'
        : 'h-[30px] py-1.5 text-xs pl-2.5 pr-8';

    const hasCustomBg = /\bbg-/.test(className);
    const hasCustomBorder = /\bborder-/.test(className);
    const hasCustomTextColor = /\btext-(?!xs\b|sm\b|base\b|lg\b|xl\b|2xl\b|3xl\b|4xl\b|left\b|center\b|right\b|justify\b)\S+/.test(className);
    const hasShrink0 = /\bshrink-0\b/.test(className);

    const defaultBg = hasCustomBg ? '' : 'bg-neutral-900';
    const defaultBorder = hasCustomBorder ? '' : 'border-neutral-800';
    const defaultText = hasCustomTextColor ? '' : 'text-neutral-200';

    const selectClasses = [
      'appearance-none border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
      defaultBg,
      defaultBorder,
      defaultText,
      sizeClasses,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const wrapperClasses = [
      'relative inline-flex items-center',
      hasShrink0 ? 'shrink-0' : '',
      wrapperClassName,
    ]
      .filter(Boolean)
      .join(' ');

    const hasCustomIconColor = /\btext-/.test(iconClassName);
    const defaultIconColor = hasCustomIconColor ? '' : 'text-neutral-400';

    const iconClasses = [
      'w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity',
      defaultIconColor,
      disabled ? 'opacity-50' : '',
      iconClassName,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClasses}>
        <select
          ref={ref}
          disabled={disabled}
          className={selectClasses}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className={iconClasses}
          aria-hidden="true"
          data-testid="select-chevron"
        />
      </div>
    );
  }
);

Select.displayName = 'Select';
