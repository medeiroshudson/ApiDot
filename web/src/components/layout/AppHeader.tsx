import React from 'react';
import { Menu } from 'lucide-react';

export interface AppHeaderProps {
  title?: string;
  isAgentOnline?: boolean;
  isDrawerOpen?: boolean;
  onToggleDrawer?: () => void;
}

export function AppHeader({
  title = 'ApiDot',
  isAgentOnline = false,
  isDrawerOpen = false,
  onToggleDrawer,
}: AppHeaderProps) {
  const agentStatusText = isAgentOnline ? 'Agent Online' : 'Agent Offline';

  return (
    <header className="h-14 border-b border-neutral-800 bg-neutral-950 px-4 flex items-center justify-between select-none">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-label="Alternar menu de navegação"
          aria-expanded={isDrawerOpen}
          aria-controls="collections-drawer"
          className="md:hidden p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight text-white">{title}</span>
          <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
            v0.1.0
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          data-testid="agent-status-badge"
          className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-900 border border-neutral-800"
          title={agentStatusText}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isAgentOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span className="text-neutral-300">
            {agentStatusText}
          </span>
        </div>
      </div>
    </header>
  );
}
