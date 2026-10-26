import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MobileDrawer } from './MobileDrawer';

describe('MobileDrawer', () => {
  it('opens and renders header, accessibility attributes, and children when isOpen is true', () => {
    render(
      <MobileDrawer isOpen={true} onClose={() => {}}>
        <div data-testid="drawer-child">Child Content</div>
      </MobileDrawer>
    );

    const drawer = screen.getByTestId('collections-drawer');
    expect(drawer).toBeDefined();
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.getAttribute('aria-labelledby')).toBe('drawer-title');

    const title = screen.getByText('Coleções & Pastas');
    expect(title).toBeDefined();
    expect(title.getAttribute('id')).toBe('drawer-title');

    expect(screen.getByTestId('drawer-child')).toBeDefined();
  });

  it('triggers onClose callback when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<MobileDrawer isOpen={true} onClose={handleClose} />);
    const closeButton = screen.getByRole('button', { name: /fechar gaveta|close/i });
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not render drawer when isOpen is false', () => {
    render(<MobileDrawer isOpen={false} onClose={() => {}} />);
    expect(screen.queryByTestId('collections-drawer')).toBeNull();
  });

  it('triggers onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(<MobileDrawer isOpen={true} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onClose when clicking on the backdrop', () => {
    const handleClose = vi.fn();
    render(
      <MobileDrawer isOpen={true} onClose={handleClose}>
        <div>Drawer Body</div>
      </MobileDrawer>
    );

    const backdrop = screen.getByTestId('collections-drawer');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not trigger onClose when clicking inside the drawer content', () => {
    const handleClose = vi.fn();
    render(
      <MobileDrawer isOpen={true} onClose={handleClose}>
        <button data-testid="inside-btn">Inside</button>
      </MobileDrawer>
    );

    const insideButton = screen.getByTestId('inside-btn');
    fireEvent.click(insideButton);
    expect(handleClose).not.toHaveBeenCalled();

    const title = screen.getByText('Coleções & Pastas');
    fireEvent.click(title);
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('auto-focuses the close button when opened', () => {
    render(<MobileDrawer isOpen={true} onClose={() => {}} />);
    const closeButton = screen.getByRole('button', { name: /fechar gaveta|close/i });
    expect(document.activeElement).toBe(closeButton);
  });
});
