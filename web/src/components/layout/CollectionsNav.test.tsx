import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CollectionsNav } from './CollectionsNav';

describe('CollectionsNav', () => {
  it('renders default collection navigation items as buttons', () => {
    render(<CollectionsNav />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);

    expect(screen.getByRole('button', { name: /coleção padrão/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /autenticação/i })).toBeDefined();
  });

  it('triggers onSelect when an item is clicked', () => {
    const handleSelect = vi.fn();
    render(<CollectionsNav onSelect={handleSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /autenticação/i }));
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Autenticação' })
    );
  });

  it('indicates active/current item with aria-current', () => {
    render(<CollectionsNav selectedId="default-collection" />);
    const defaultButton = screen.getByRole('button', { name: /coleção padrão/i });
    expect(defaultButton.getAttribute('aria-current')).toBe('page');

    const authButton = screen.getByRole('button', { name: /autenticação/i });
    expect(authButton.getAttribute('aria-current')).toBeNull();
  });
});
