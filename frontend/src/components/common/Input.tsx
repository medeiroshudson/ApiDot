import React, { forwardRef, useState } from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  autoGrow?: boolean;
  maxRows?: number;
  error?: boolean;
  textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
}

export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  (
    {
      autoGrow = false,
      maxRows,
      error = false,
      textareaProps,
      className = '',
      onChange,
      onKeyDown,
      onFocus,
      onBlur,
      type = 'text',
      style,
      ...rest
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    if (autoGrow) {
      const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        setIsFocused(true);
        (onFocus as unknown as React.FocusEventHandler<HTMLTextAreaElement>)?.(e);
        textareaProps?.onFocus?.(e);
      };

      const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        setIsFocused(false);
        (onBlur as unknown as React.FocusEventHandler<HTMLTextAreaElement>)?.(e);
        textareaProps?.onBlur?.(e);
      };

      const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
        }
        (onKeyDown as unknown as React.KeyboardEventHandler<HTMLTextAreaElement>)?.(e);
        textareaProps?.onKeyDown?.(e);
      };

      const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (/[\r\n]/.test(e.target.value)) {
          const sanitized = e.target.value.replace(/[\r\n]+/g, '');
          e.target.value = sanitized;
          if (e.currentTarget && e.currentTarget !== e.target) {
            e.currentTarget.value = sanitized;
          }
        }
        (onChange as unknown as React.ChangeEventHandler<HTMLTextAreaElement>)?.(e);
        textareaProps?.onChange?.(e);
      };

      const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const text = e.clipboardData?.getData('text');
        if (text && /[\r\n]/.test(text)) {
          e.preventDefault();
          const sanitized = text.replace(/[\r\n]+/g, '');
          const target = e.currentTarget;
          if (typeof document !== 'undefined' && document.queryCommandSupported?.('insertText')) {
            document.execCommand('insertText', false, sanitized);
          } else if (target) {
            const start = target.selectionStart ?? 0;
            const end = target.selectionEnd ?? 0;
            const val = target.value;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            setter?.call(target, val.slice(0, start) + sanitized + val.slice(end));
            target.selectionStart = target.selectionEnd = start + sanitized.length;
            const event = new Event('input', { bubbles: true });
            target.dispatchEvent(event);
          }
        }
        (rest as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)?.onPaste?.(e);
        textareaProps?.onPaste?.(e);
      };

      const textareaClasses = [
        'w-full min-h-[36px] py-2 pl-3 pr-8 text-xs sm:text-sm bg-neutral-900/90 border rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 font-mono transition-all disabled:opacity-50 disabled:cursor-not-allowed break-all resize-none leading-snug',
        isFocused
          ? (maxRows ? 'overflow-y-auto' : 'max-h-[84px] overflow-y-auto')
          : 'max-h-[36px] overflow-hidden truncate',
        error
          ? 'border-rose-500 focus:ring-rose-500 shadow-sm shadow-rose-950/40'
          : isFocused
            ? 'border-blue-500 ring-1 ring-blue-500/30'
            : 'border-neutral-700/80 hover:border-neutral-600',
        className,
        textareaProps?.className,
      ]
        .filter(Boolean)
        .join(' ');

      const dynamicStyle = {
        ...(maxRows && isFocused ? { maxHeight: `${maxRows * 24 + 12}px` } : {}),
        ...style,
        ...textareaProps?.style,
      };

      return (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          rows={textareaProps?.rows ?? 1}
          aria-invalid={error || undefined}
          {...(rest as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          {...textareaProps}
          style={dynamicStyle}
          className={textareaClasses}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onChange={handleChange}
          onPaste={handlePaste}
        />
      );
    }

    const inputClasses = [
      'h-9 w-full pl-3 pr-8 text-xs sm:text-sm bg-neutral-900/90 border rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 font-mono transition-all disabled:opacity-50 disabled:cursor-not-allowed',
      error
        ? 'border-rose-500 focus:ring-rose-500 shadow-sm shadow-rose-950/40'
        : 'border-neutral-700/80 hover:border-neutral-600 focus:border-blue-500 focus:ring-blue-500/30',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        type={type}
        aria-invalid={error || undefined}
        style={style}
        className={inputClasses}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        {...rest}
      />
    );
  }
);

Input.displayName = 'Input';
