import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextMenu, ContextMenuItem, ContextMenuPosition } from './ContextMenu';

describe('ContextMenu', () => {
  const defaultItems: ContextMenuItem[] = [
    { id: 'item-1', label: 'Nova Pasta', onClick: vi.fn() },
    { id: 'item-2', label: 'Nova Requisição', onClick: vi.fn() },
    { isDivider: true },
    { id: 'item-3', label: 'Excluir', danger: true, onClick: vi.fn() },
    { id: 'item-4', label: 'Desabilitado', disabled: true, onClick: vi.fn() },
  ];

  const defaultPosition: ContextMenuPosition = { x: 100, y: 150 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render anything when isOpen is false', () => {
    render(
      <ContextMenu
        isOpen={false}
        position={defaultPosition}
        onClose={vi.fn()}
        items={defaultItems}
      />
    );

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders menu and items when isOpen is true', () => {
    render(
      <ContextMenu
        isOpen={true}
        position={defaultPosition}
        onClose={vi.fn()}
        items={defaultItems}
      />
    );

    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(screen.getByText('Nova Pasta')).toBeInTheDocument();
    expect(screen.getByText('Nova Requisição')).toBeInTheDocument();
    expect(screen.getByText('Excluir')).toBeInTheDocument();
    expect(screen.getByText('Desabilitado')).toBeInTheDocument();
  });

  it('renders dividers with separator role', () => {
    render(
      <ContextMenu
        isOpen={true}
        position={defaultPosition}
        onClose={vi.fn()}
        items={defaultItems}
      />
    );

    const separators = screen.getAllByRole('separator');
    expect(separators.length).toBe(1);
  });

  it('renders optional header when provided', () => {
    render(
      <ContextMenu
        isOpen={true}
        position={defaultPosition}
        onClose={vi.fn()}
        items={defaultItems}
        header="Ações da Coleção"
      />
    );

    expect(screen.getByText('Ações da Coleção')).toBeInTheDocument();
  });

  it('calls item.onClick and onClose when an active item is clicked', () => {
    const handleClose = vi.fn();
    const handleItemClick = vi.fn();
    const items: ContextMenuItem[] = [
      { id: '1', label: 'Renomear', onClick: handleItemClick },
    ];

    render(
      <ContextMenu
        isOpen={true}
        position={defaultPosition}
        onClose={handleClose}
        items={items}
      />
    );

    fireEvent.click(screen.getByText('Renomear'));

    expect(handleItemClick).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick or onClose when a disabled item is clicked', () => {
    const handleClose = vi.fn();
    const handleDisabledClick = vi.fn();
    const items: ContextMenuItem[] = [
      { id: '1', label: 'Indisponível', disabled: true, onClick: handleDisabledClick },
    ];

    render(
      <ContextMenu
        isOpen={true}
        position={defaultPosition}
        onClose={handleClose}
        items={items}
      />
    );

    const button = screen.getByRole('menuitem', { name: /indisponível/i });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(handleDisabledClick).not.toHaveBeenCalled();
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('applies danger styling to items marked danger', () => {
    render(
      <ContextMenu
        isOpen={true}
        position={defaultPosition}
        onClose={vi.fn()}
        items={defaultItems}
      />
    );

    const deleteItem = screen.getByRole('menuitem', { name: /excluir/i });
    expect(deleteItem.className).toMatch(/rose|red/);
  });

  it('renders icon when provided', () => {
    const itemsWithIcon: ContextMenuItem[] = [
      {
        id: 'icon-item',
        label: 'Com Ícone',
        icon: <span data-testid="custom-icon">★</span>,
        onClick: vi.fn(),
      },
    ];

    render(
      <ContextMenu
        isOpen={true}
        position={defaultPosition}
        onClose={vi.fn()}
        items={itemsWithIcon}
      />
    );

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    expect(screen.getByText('Com Ícone')).toBeInTheDocument();
  });

  it('closes when Escape key is pressed', () => {
    const handleClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        position={defaultPosition}
        onClose={handleClose}
        items={defaultItems}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking outside the menu', () => {
    const handleClose = vi.fn();

    render(
      <div>
        <div data-testid="outside-element">Fora</div>
        <ContextMenu
          isOpen={true}
          position={defaultPosition}
          onClose={handleClose}
          items={defaultItems}
        />
      </div>
    );

    fireEvent.mouseDown(screen.getByTestId('outside-element'));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the menu container', () => {
    const handleClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        position={defaultPosition}
        onClose={handleClose}
        items={defaultItems}
      />
    );

    const menu = screen.getByRole('menu');
    fireEvent.mouseDown(menu);

    expect(handleClose).not.toHaveBeenCalled();
  });

  describe('boundary repositioning', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 600 });
    });

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: originalInnerHeight });
    });

    it('positions within normal bounds when coordinates do not overflow', () => {
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 150, y: 120 }}
          onClose={vi.fn()}
          items={defaultItems}
        />
      );

      const menu = screen.getByRole('menu');
      expect(menu.style.left).toBe('150px');
      expect(menu.style.top).toBe('120px');
    });

    it('repositions leftward when position.x overflows window width', () => {
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 750, y: 100 }}
          onClose={vi.fn()}
          items={defaultItems}
        />
      );

      const menu = screen.getByRole('menu');
      const leftVal = parseInt(menu.style.left, 10);
      // Menu width default is at least 160-180px, so 750 + 180 > 800 - 8 (792)
      // Must be repositioned to less than or equal to 800 - width - padding
      expect(leftVal).toBeLessThan(750);
      expect(leftVal).toBeGreaterThanOrEqual(8);
    });

    it('repositions upward when position.y overflows window height', () => {
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 100, y: 550 }}
          onClose={vi.fn()}
          items={defaultItems}
        />
      );

      const menu = screen.getByRole('menu');
      const topVal = parseInt(menu.style.top, 10);
      expect(topVal).toBeLessThan(550);
      expect(topVal).toBeGreaterThanOrEqual(8);
    });

    it('clamps negative or zero coordinates to padding', () => {
      render(
        <ContextMenu
          isOpen={true}
          position={{ x: -20, y: -50 }}
          onClose={vi.fn()}
          items={defaultItems}
        />
      );

      const menu = screen.getByRole('menu');
      expect(menu.style.left).toBe('8px');
      expect(menu.style.top).toBe('8px');
    });

    it('bounds coordinates within containerRef if provided', () => {
      const container = document.createElement('div');
      container.getBoundingClientRect = () => ({
        left: 50,
        top: 50,
        width: 300,
        height: 300,
        right: 350,
        bottom: 350,
        x: 50,
        y: 50,
        toJSON: () => {},
      });
      const containerRef = { current: container };

      render(
        <ContextMenu
          isOpen={true}
          position={{ x: 340, y: 340 }}
          onClose={vi.fn()}
          items={defaultItems}
          containerRef={containerRef}
        />
      );

      const menu = screen.getByRole('menu');
      const leftVal = parseInt(menu.style.left, 10);
      const topVal = parseInt(menu.style.top, 10);
      expect(leftVal).toBeLessThan(340);
      expect(leftVal).toBeGreaterThanOrEqual(58);
      expect(topVal).toBeLessThan(340);
    });

    it('renders into portal when usePortal is true', () => {
      render(
        <div data-testid="parent-div">
          <ContextMenu
            isOpen={true}
            position={defaultPosition}
            onClose={vi.fn()}
            items={defaultItems}
            usePortal={true}
          />
        </div>
      );

      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();
      expect(menu.parentElement).toBe(document.body);
    });
  });
});
