import React from 'react';
import { Folder, Layers, RefreshCw, Settings } from 'lucide-react';

export interface NavItem {
  id: string;
  name: string;
  icon?: 'collection' | 'folder';
  isNested?: boolean;
  openApiSpecUrl?: string | null;
  openApiSpecContent?: string | null;
}

export interface CollectionsNavProps {
  className?: string;
  items?: NavItem[];
  selectedId?: string;
  syncingId?: string | null;
  onSelect?: (item: NavItem) => void;
  onSync?: (item: NavItem) => void;
  onOpenSettings?: (item: NavItem) => void;
}

const DEFAULT_ITEMS: NavItem[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Coleção Padrão', icon: 'collection' },
  { id: 'auth-folder', name: 'Autenticação', icon: 'folder', isNested: true },
];

export function CollectionsNav({
  className = '',
  items = DEFAULT_ITEMS,
  selectedId,
  syncingId,
  onSelect,
  onSync,
  onOpenSettings,
}: CollectionsNavProps) {
  return (
    <nav aria-label="Coleções & Pastas" className={`space-y-1 text-sm ${className}`}>
      {items.map((item) => {
        const Icon = item.icon === 'folder' ? Folder : Layers;
        const isSelected = selectedId === item.id;
        const isCollection = item.icon !== 'folder' && !item.isNested;
        const isSyncing = syncingId === item.id;

        return (
          <div
            key={item.id}
            className={`group flex items-center justify-between rounded transition-colors ${
              item.isNested ? 'pl-6 pr-2 py-1' : 'px-2 py-1'
            } ${
              isSelected
                ? 'bg-neutral-800 text-white font-medium'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-800/70'
            }`}
          >
            <button
              type="button"
              role="button"
              aria-current={isSelected ? 'page' : undefined}
              onClick={() => onSelect?.(item)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left focus:outline-none focus:ring-1 focus:ring-neutral-700 rounded py-0.5 cursor-pointer"
            >
              <Icon className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.name}</span>
            </button>

            {isCollection && (
              <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ml-1 shrink-0">
                <button
                  type="button"
                  title={`Sincronizar coleção ${item.name}`}
                  aria-label={`Sincronizar coleção ${item.name}`}
                  disabled={isSyncing}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSync?.(item);
                  }}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-700/60 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`}
                    data-testid={isSyncing ? `nav-sync-spinning-${item.id}` : undefined}
                  />
                </button>

                <button
                  type="button"
                  title={`Configurações da coleção ${item.name}`}
                  aria-label={`Configurações da coleção ${item.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSettings?.(item);
                  }}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-700/60 transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
