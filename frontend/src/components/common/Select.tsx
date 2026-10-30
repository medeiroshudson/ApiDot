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
        : 'h-7.5 py-1.5 text-xs pl-2.5 pr-8';

    const selectClasses = [
      'appearance-none bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
      sizeClasses,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const wrapperClasses = [
      'relative inline-flex items-center',
      wrapperClassName,
    ]
      .filter(Boolean)
      .join(' ');

    const iconClasses = [
      'w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 transition-opacity',
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
