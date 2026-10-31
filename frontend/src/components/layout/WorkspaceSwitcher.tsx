import React, { useState, useRef, useEffect } from 'react';
import { Briefcase, ChevronDown, Check, Plus } from 'lucide-react';
import { WorkspaceDto } from '../../lib/treeApi';
import { useTranslation } from '@/hooks/useTranslation';

export interface WorkspaceSwitcherProps {
  workspaces: WorkspaceDto[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspaceClick: () => void;
  onOpenChange?: (isOpen: boolean) => void;
  className?: string;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspaceClick,
  onOpenChange,
  className = '',
}: WorkspaceSwitcherProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const displayName = activeWorkspace ? activeWorkspace.name : t('sidebar.selectWorkspace');

  const updateOpen = (openState: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof openState === 'function' ? openState(isOpen) : openState;
    if (next !== isOpen) {
      setIsOpen(next);
      onOpenChange?.(next);
    }
  };

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        updateOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        updateOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onSelectWorkspace(id);
    updateOpen(false);
  };

  const handleCreate = () => {
    onCreateWorkspaceClick();
    updateOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className || 'w-full'}`}>
      <button
        type="button"
        data-testid="workspace-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${t('sidebar.workspace')}: ${displayName}`}
        onClick={() => updateOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-200 bg-neutral-900/90 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-700 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500"
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <Briefcase className="w-3.5 h-3.5 text-neutral-400 shrink-0" aria-hidden="true" />
          <span className="truncate">{displayName}</span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={t('sidebar.workspaces')}
          data-testid="workspace-switcher-dropdown"
          className="absolute left-0 top-full mt-1 z-40 w-56 min-w-full bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl py-1 flex flex-col"
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            {t('sidebar.workspaces')}
          </div>

          <div className="max-h-56 overflow-y-auto py-0.5 space-y-0.5">
            {workspaces.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-400 italic">
                {t('sidebar.noWorkspaces')}
              </div>
            ) : (
              workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-testid={`workspace-option-${ws.id}`}
                    onClick={() => handleSelect(ws.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                      isActive
                        ? 'bg-neutral-800/80 text-white font-medium'
                        : 'text-neutral-300 hover:bg-neutral-800/50 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{ws.name}</span>
                    {isActive && (
                      <Check
                        className="w-3.5 h-3.5 text-blue-400 shrink-0"
                        aria-hidden="true"
                        data-testid="active-workspace-check"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="my-1 border-t border-neutral-800" />

          <button
            type="button"
            data-testid="workspace-switcher-create-button"
            onClick={handleCreate}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800/60 transition-colors group"
          >
            <Plus className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-200 shrink-0" aria-hidden="true" />
            <span>{t('sidebar.newWorkspace')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
