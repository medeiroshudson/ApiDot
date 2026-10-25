import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

export function MobileDrawer({ isOpen, onClose, children }: MobileDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      id="collections-drawer"
      data-testid="collections-drawer"
      className="fixed inset-0 z-50 flex bg-black/60 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      onClick={onClose}
    >
      <div
        data-testid="drawer-content"
        className="w-4/5 max-w-sm bg-neutral-900 p-4 shadow-xl flex flex-col h-full text-white border-r border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 border-b border-neutral-800 pb-2">
          <span id="drawer-title" className="font-semibold text-sm">
            Coleções & Pastas
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar gaveta"
            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
