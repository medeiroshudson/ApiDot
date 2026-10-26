import React, { useState, useRef, useEffect } from 'react';
import { Briefcase, ChevronDown, Check, Plus } from 'lucide-react';
import { WorkspaceDto } from '../../lib/treeApi';

export interface WorkspaceSwitcherProps {
  workspaces: WorkspaceDto[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspaceClick: () => void;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspaceClick,
}: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const displayName = activeWorkspace ? activeWorkspace.name : 'Selecionar Workspace';

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
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
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onSelectWorkspace(id);
    setIsOpen(false);
  };

  const handleCreate = () => {
    onCreateWorkspaceClick();
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        data-testid="workspace-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Workspace: ${displayName}`}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-neutral-200 bg-neutral-900/90 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-700 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500"
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          <Briefcase className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />
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
          aria-label="Workspaces"
          data-testid="workspace-switcher-dropdown"
          className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl py-1 flex flex-col"
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Workspaces
          </div>

          <div className="max-h-56 overflow-y-auto py-0.5 space-y-0.5">
            {workspaces.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-400 italic">
                Nenhum workspace
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
            <span>Novo Workspace</span>
          </button>
        </div>
      )}
    </div>
  );
}
