import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MobileDrawer } from './MobileDrawer';

describe('MobileDrawer', () => {
  it('opens and renders header and children when isOpen is true', () => {
    render(
      <MobileDrawer isOpen={true} onClose={() => {}}>
        <div data-testid="drawer-child">Child Content</div>
      </MobileDrawer>
    );
    expect(screen.getByTestId('collections-drawer')).toBeDefined();
    expect(screen.getByText('Coleções & Pastas')).toBeDefined();
    expect(screen.getByTestId('drawer-child')).toBeDefined();
  });

  it('triggers onClose callback when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<MobileDrawer isOpen={true} onClose={handleClose} />);
    const closeButton = screen.getByRole('button', { name: /close|✕/i });
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not render drawer when isOpen is false', () => {
    render(<MobileDrawer isOpen={false} onClose={() => {}} />);
    expect(screen.queryByTestId('collections-drawer')).toBeNull();
  });
});
