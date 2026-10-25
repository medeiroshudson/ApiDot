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

  it('renders agent status badge reflecting connection status with consistent labels', () => {
    const { rerender } = render(<AppHeader isAgentOnline={true} />);
    const onlineText = screen.getByText('Agent Online');
    expect(onlineText).toBeDefined();
    const onlineBadge = screen.getByTestId('agent-status-badge');
    expect(onlineBadge.getAttribute('title')).toBe('Agent Online');

    rerender(<AppHeader isAgentOnline={false} />);
    const offlineText = screen.getByText('Agent Offline');
    expect(offlineText).toBeDefined();
    const offlineBadge = screen.getByTestId('agent-status-badge');
    expect(offlineBadge.getAttribute('title')).toBe('Agent Offline');
  });

  it('calls onToggleDrawer when drawer toggle button is clicked', () => {
    const handleToggle = vi.fn();
    render(<AppHeader onToggleDrawer={handleToggle} />);
    const toggleButton = screen.getByRole('button', { name: /toggle drawer|menu/i });
    fireEvent.click(toggleButton);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it('exposes accessible attributes on the hamburger button reflecting drawer state', () => {
    const { rerender } = render(<AppHeader isDrawerOpen={false} />);
    const toggleButton = screen.getByRole('button', { name: /toggle drawer|menu/i });
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
    expect(toggleButton.getAttribute('aria-controls')).toBe('collections-drawer');

    rerender(<AppHeader isDrawerOpen={true} />);
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true');
  });
});
