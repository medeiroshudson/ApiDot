import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuItem {
  id?: string;
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  isDivider?: boolean;
  className?: string;
}

export interface ContextMenuProps {
  isOpen: boolean;
  position: ContextMenuPosition;
  onClose: () => void;
  items: ContextMenuItem[];
  header?: string;
  className?: string;
  containerRef?: React.RefObject<HTMLElement | null>;
  usePortal?: boolean;
}

const PADDING = 8;
const DEFAULT_MENU_WIDTH = 180;
const DEFAULT_ITEM_HEIGHT = 36;

function computeBoundedCoordinates(
  pos: ContextMenuPosition,
  itemsCount: number,
  hasHeader: boolean,
  containerEl?: HTMLElement | null,
  menuEl?: HTMLElement | null
): ContextMenuPosition {
  let boundsWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  let boundsHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
  let boundsLeft = 0;
  let boundsTop = 0;

  if (containerEl) {
    const rect = containerEl.getBoundingClientRect();
    boundsWidth = rect.width;
    boundsHeight = rect.height;
    boundsLeft = rect.left;
    boundsTop = rect.top;
  }

  let menuWidth = DEFAULT_MENU_WIDTH;
  let menuHeight = itemsCount * DEFAULT_ITEM_HEIGHT + (hasHeader ? 32 : 0) + 16;

  if (menuEl) {
    const rect = menuEl.getBoundingClientRect();
    if (rect.width > 0) menuWidth = rect.width;
    if (rect.height > 0) menuHeight = rect.height;
  }

  let x = pos.x;
  let y = pos.y;

  const maxRight = boundsLeft + boundsWidth - PADDING;
  const maxBottom = boundsTop + boundsHeight - PADDING;

  if (x + menuWidth > maxRight) {
    x = Math.max(boundsLeft + PADDING, maxRight - menuWidth);
  }
  if (x < boundsLeft + PADDING) {
    x = boundsLeft + PADDING;
  }

  if (y + menuHeight > maxBottom) {
    y = Math.max(boundsTop + PADDING, maxBottom - menuHeight);
  }
  if (y < boundsTop + PADDING) {
    y = boundsTop + PADDING;
  }

  return { x, y };
}

export function ContextMenu({
  isOpen,
  position,
  onClose,
  items,
  header,
  className = '',
  containerRef,
  usePortal = false,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<ContextMenuPosition>(() =>
    computeBoundedCoordinates(position, items.length, Boolean(header), containerRef?.current)
  );

  // Recompute position on position or open state changes
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return;

    const adjusted = computeBoundedCoordinates(
      position,
      items.length,
      Boolean(header),
      containerRef?.current,
      menuRef.current
    );
    setCoords(adjusted);
  }, [isOpen, position.x, position.y, items.length, header, containerRef]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled || item.isDivider) return;
    item.onClick?.();
    onClose();
  };

  const menuContent = (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      data-testid="context-menu"
      style={{
        top: `${coords.y}px`,
        left: `${coords.x}px`,
      }}
      className={`fixed z-50 min-w-[160px] max-w-[280px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl shadow-black/50 py-1 text-xs text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-100 ${className}`}
    >
      {header && (
        <div
          role="presentation"
          className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400 border-b border-zinc-800/80 mb-1 tracking-wider uppercase"
        >
          {header}
        </div>
      )}

      <div className="flex flex-col">
        {items.map((item, index) => {
          if (item.isDivider) {
            return (
              <div
                key={item.id || `divider-${index}`}
                role="separator"
                className="h-px my-1 bg-zinc-800/80"
              />
            );
          }

          const isDanger = item.danger;
          const isDisabled = item.disabled;

          return (
            <button
              key={item.id || `item-${index}`}
              role="menuitem"
              type="button"
              disabled={isDisabled}
              onClick={() => handleItemClick(item)}
              className={`w-full flex items-center px-3 py-1.5 text-left transition-colors text-xs ${
                isDisabled
                  ? 'opacity-40 cursor-not-allowed text-zinc-500'
                  : isDanger
                  ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:outline-none'
                  : 'text-zinc-200 hover:text-white hover:bg-zinc-800/80 focus:bg-zinc-800/80 focus:outline-none'
              } ${item.className || ''}`}
            >
              {item.icon && (
                <span
                  className={`mr-2 flex items-center justify-center shrink-0 w-4 h-4 ${
                    isDanger ? 'text-rose-400' : 'text-zinc-400'
                  }`}
                >
                  {item.icon}
                </span>
              )}
              <span className="truncate flex-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (usePortal && typeof document !== 'undefined') {
    return createPortal(menuContent, document.body);
  }

  return menuContent;
}
