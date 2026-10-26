import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CollectionsNav, NavItem } from './CollectionsNav';

describe('CollectionsNav', () => {
  const customItems: NavItem[] = [
    { id: 'coll-1', name: 'Minha API', icon: 'collection' },
    { id: 'folder-1', name: 'Autenticação', icon: 'folder', isNested: true },
  ];

  it('renders default collection navigation items as buttons', () => {
    render(<CollectionsNav />);
    expect(screen.getByRole('button', { name: /coleção padrão/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /autenticação/i })).toBeDefined();
  });

  it('triggers onSelect when an item is clicked', () => {
    const handleSelect = vi.fn();
    render(<CollectionsNav items={customItems} onSelect={handleSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /autenticação/i }));
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Autenticação' })
    );
  });

  it('indicates active/current item with aria-current', () => {
    render(<CollectionsNav items={customItems} selectedId="coll-1" />);
    const defaultButton = screen.getByRole('button', { name: /minha api/i });
    expect(defaultButton.getAttribute('aria-current')).toBe('page');

    const authButton = screen.getByRole('button', { name: /autenticação/i });
    expect(authButton.getAttribute('aria-current')).toBeNull();
  });

  it('renders sync and settings action buttons for collection items', () => {
    render(<CollectionsNav items={customItems} />);

    const syncButton = screen.getByRole('button', { name: /sincronizar coleção|sincronizar/i });
    expect(syncButton).toBeInTheDocument();

    const settingsButton = screen.getByRole('button', { name: /configurações da coleção|configurações/i });
    expect(settingsButton).toBeInTheDocument();
  });

  it('invokes onSync and stops propagation when sync button is clicked', () => {
    const handleSelect = vi.fn();
    const handleSync = vi.fn();

    render(
      <CollectionsNav
        items={customItems}
        onSelect={handleSelect}
        onSync={handleSync}
      />
    );

    const syncButton = screen.getByRole('button', { name: /sincronizar coleção|sincronizar/i });
    fireEvent.click(syncButton);

    expect(handleSync).toHaveBeenCalledTimes(1);
    expect(handleSync).toHaveBeenCalledWith(customItems[0]);
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('invokes onOpenSettings and stops propagation when settings button is clicked', () => {
    const handleSelect = vi.fn();
    const handleOpenSettings = vi.fn();

    render(
      <CollectionsNav
        items={customItems}
        onSelect={handleSelect}
        onOpenSettings={handleOpenSettings}
      />
    );

    const settingsButton = screen.getByRole('button', { name: /configurações da coleção|configurações/i });
    fireEvent.click(settingsButton);

    expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    expect(handleOpenSettings).toHaveBeenCalledWith(customItems[0]);
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('renders spinning animation when syncingId matches the collection item', () => {
    render(
      <CollectionsNav
        items={customItems}
        syncingId="coll-1"
      />
    );

    const syncButton = screen.getByRole('button', { name: /sincronizar coleção|sincronizar/i });
    expect(syncButton).toBeDisabled();
    expect(screen.getByTestId('nav-sync-spinning-coll-1')).toBeInTheDocument();
  });
});
