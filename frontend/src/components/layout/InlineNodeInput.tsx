import React, { useEffect, useRef, useState } from 'react';

export interface InlineNodeInputProps {
  initialValue?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export function InlineNodeInput({
  initialValue = '',
  onCommit,
  onCancel,
  placeholder = 'Nome...',
  className = '',
  'aria-label': ariaLabel,
}: InlineNodeInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const isResolvedRef = useRef(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    e.stopPropagation();

    if (e.key === 'Enter') {
      e.preventDefault();
      if (isResolvedRef.current) return;

      const trimmed = value.trim();
      isResolvedRef.current = true;

      if (trimmed.length > 0) {
        onCommit(trimmed);
      } else {
        onCancel();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (isResolvedRef.current) return;

      isResolvedRef.current = true;
      onCancel();
    }
  };

  const handleBlur = () => {
    if (isResolvedRef.current) return;

    isResolvedRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      placeholder={placeholder}
      autoFocus
      aria-label={ariaLabel || placeholder || 'Nome do item'}
      data-testid="inline-node-input"
      className={`w-full bg-zinc-900 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${className}`}
    />
  );
}
