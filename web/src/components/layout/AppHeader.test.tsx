import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  it('renders workspace title and default fallback', () => {
    const { rerender } = render(<AppHeader title="My Custom Workspace" />);
    expect(screen.getByText('My Custom Workspace')).toBeDefined();

    rerender(<AppHeader />);
    expect(screen.getByText('ApiDot')).toBeDefined();
  });

  it('renders agent status badge reflecting connection status', () => {
    const { rerender } = render(<AppHeader isAgentOnline={true} />);
    expect(screen.getByText('Agent Online')).toBeDefined();

    rerender(<AppHeader isAgentOnline={false} />);
    expect(screen.getByText('Agent Offline')).toBeDefined();
  });

  it('calls onToggleDrawer when drawer toggle button is clicked', () => {
    const handleToggle = vi.fn();
    render(<AppHeader onToggleDrawer={handleToggle} />);
    const toggleButton = screen.getByRole('button', { name: /toggle drawer|menu/i });
    fireEvent.click(toggleButton);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
