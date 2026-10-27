'use client';

import React, { useState, useRef } from 'react';

export interface PanelSplitterProps {
  id: string;
  ariaLabel: string;
  direction?: 'horizontal';
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
  onDeltaChange: (deltaPixels: number) => void;
  onReset?: () => void;
  className?: string;
}

export const PanelSplitter: React.FC<PanelSplitterProps> = ({
  id,
  ariaLabel,
  direction = 'horizontal',
  valueNow,
  valueMin,
  valueMax,
  onDeltaChange,
  onReset,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only respond to primary mouse button (button === 0)
    if (e.button !== 0 && e.button !== undefined) return;

    e.preventDefault();
    e.currentTarget.focus();
    startXRef.current = typeof e.clientX === 'number' && !isNaN(e.clientX) ? e.clientX : 0;
    setIsDragging(true);

    const pointerId = e.pointerId ?? (e.nativeEvent as PointerEvent)?.pointerId;
    if (typeof e.currentTarget.setPointerCapture === 'function' && pointerId !== undefined) {
      try {
        e.currentTarget.setPointerCapture(pointerId);
      } catch {
        // Safe fallback in environments without full pointer capture support
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    if (typeof e.clientX !== 'number' || isNaN(e.clientX)) return;

    const delta = e.clientX - startXRef.current;
    if (delta !== 0) {
      onDeltaChange(delta);
      startXRef.current = e.clientX;
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current !== null) {
      const pointerId = e.pointerId ?? (e.nativeEvent as PointerEvent)?.pointerId;
      if (typeof e.currentTarget.releasePointerCapture === 'function' && pointerId !== undefined) {
        try {
          if (!e.currentTarget.hasPointerCapture || e.currentTarget.hasPointerCapture(pointerId)) {
            e.currentTarget.releasePointerCapture(pointerId);
          }
        } catch {
          // Safe fallback
        }
      }
      setIsDragging(false);
      startXRef.current = null;
    }
  };

  const handleLostPointerCapture = () => {
    setIsDragging(false);
    startXRef.current = null;
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onReset?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 50 : 10;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onDeltaChange(-step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onDeltaChange(step);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onReset?.();
    }
  };

  return (
    <div
      id={id}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={valueNow !== undefined ? valueNow : undefined}
      aria-valuemin={valueMin !== undefined ? valueMin : undefined}
      aria-valuemax={valueMax !== undefined ? valueMax : undefined}
      data-testid={`panel-splitter-${id}`}
      data-dragging={isDragging ? 'true' : 'false'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handleLostPointerCapture}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      className={`group relative flex items-center justify-center w-1.5 h-full cursor-col-resize select-none shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-sky-500 touch-none transition-colors ${className}`}
    >
      {/* 1px visual separator line centered inside hit area */}
      <div
        className={`w-px h-full transition-colors ${
          isDragging ? 'bg-sky-500' : 'bg-neutral-800 group-hover:bg-sky-500/70'
        }`}
      />
    </div>
  );
};
