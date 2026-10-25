import React from 'react';

export interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

export function MobileDrawer({ isOpen, onClose, children }: MobileDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="collections-drawer"
      className="fixed inset-0 z-50 flex bg-black/60 md:hidden"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-4/5 max-w-sm bg-neutral-900 p-4 shadow-xl flex flex-col h-full text-white border-r border-neutral-800">
        <div className="flex justify-between items-center mb-4 border-b border-neutral-800 pb-2">
          <span className="font-semibold text-sm">Coleções & Pastas</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
