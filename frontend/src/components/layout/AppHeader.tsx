import React from 'react';
import { Menu, Settings, Sliders } from 'lucide-react';

export interface AppHeaderProps {
  title?: string;
  isAgentOnline?: boolean;
  isDrawerOpen?: boolean;
  onToggleDrawer?: () => void;
  environments?: string[];
  activeEnvironment?: string | null;
  onSelectEnvironment?: (env: string | null) => void;
  onOpenEnvironmentSettings?: () => void;
  onOpenSettings?: () => void;
}

export function AppHeader({
  title = 'ApiDot',
  isAgentOnline = false,
  isDrawerOpen = false,
  onToggleDrawer,
  environments = [],
  activeEnvironment = null,
  onSelectEnvironment,
  onOpenEnvironmentSettings,
  onOpenSettings,
}: AppHeaderProps) {
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
            v0.4.0
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5">
          <select
            value={activeEnvironment ?? ''}
            onChange={(e) => onSelectEnvironment?.(e.target.value === '' ? null : e.target.value)}
            aria-label="Selecionar ambiente ativo"
            className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-400 cursor-pointer hover:border-neutral-700 transition-colors max-w-[120px] sm:max-w-[200px] truncate"
          >
            <option value="">Sem Ambiente</option>
            {(environments ?? []).map((env, idx) => (
              <option key={`${env}-${idx}`} value={env}>
                {env}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onOpenEnvironmentSettings}
            aria-label="Configurar ambientes e variáveis"
            aria-haspopup="dialog"
            title="Configurar ambientes e variáveis"
            className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400"
          >
            <Sliders className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Configurações Globais"
          aria-haspopup="dialog"
          title="Configurações Globais"
          className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400"
        >
          <Settings className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
