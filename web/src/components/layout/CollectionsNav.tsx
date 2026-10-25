import React from 'react';
import { Folder, Layers } from 'lucide-react';

export interface NavItem {
  id: string;
  name: string;
  icon?: 'collection' | 'folder';
  isNested?: boolean;
}

export interface CollectionsNavProps {
  className?: string;
  items?: NavItem[];
  selectedId?: string;
  onSelect?: (item: NavItem) => void;
}

const DEFAULT_ITEMS: NavItem[] = [
  { id: 'default-collection', name: 'Coleção Padrão', icon: 'collection' },
  { id: 'auth-folder', name: 'Autenticação', icon: 'folder', isNested: true },
];

export function CollectionsNav({
  className = '',
  items = DEFAULT_ITEMS,
  selectedId,
  onSelect,
}: CollectionsNavProps) {
  return (
    <nav aria-label="Coleções & Pastas" className={`space-y-1 text-sm ${className}`}>
      {items.map((item) => {
        const Icon = item.icon === 'folder' ? Folder : Layers;
        const isSelected = selectedId === item.id;

        return (
          <button
            key={item.id}
            type="button"
            role="button"
            aria-current={isSelected ? 'page' : undefined}
            onClick={() => onSelect?.(item)}
            className={`w-full flex items-center gap-2 p-2 rounded transition-colors text-left focus:outline-none focus:ring-2 focus:ring-neutral-700 cursor-pointer ${
              item.isNested ? 'pl-6' : ''
            } ${
              isSelected
                ? 'bg-neutral-800 text-white font-medium'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Icon className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.name}</span>
          </button>
        );
      })}
    </nav>
  );
}
