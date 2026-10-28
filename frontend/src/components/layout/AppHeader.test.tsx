import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppHeader } from './AppHeader';
import { APP_VERSION, formatDisplayVersion } from '@/lib/version';

describe('AppHeader', () => {
  it('renders workspace title and default fallback', () => {
    const { rerender } = render(<AppHeader title="My Custom Workspace" />);
    expect(screen.getByText('My Custom Workspace')).toBeDefined();

    rerender(<AppHeader />);
    expect(screen.getByText('ApiDot')).toBeDefined();
  });

  it('renders dynamic version badge based on APP_VERSION', () => {
    render(<AppHeader />);
    const expectedBadge = formatDisplayVersion(APP_VERSION);
    expect(screen.getByText(expectedBadge)).toBeDefined();
  });

  it('does not render agent status badge in header', () => {
    render(<AppHeader isAgentOnline={true} />);
    expect(screen.queryByTestId('agent-status-badge')).toBeNull();
    expect(screen.queryByText('Agent Online')).toBeNull();
    expect(screen.queryByText('Agent Offline')).toBeNull();
  });

  it('calls onOpenSettings when clicking the global settings button', () => {
    const handleOpenSettings = vi.fn();
    render(<AppHeader onOpenSettings={handleOpenSettings} />);
    const settingsButton = screen.getByRole('button', { name: 'Configurações Globais' });
    fireEvent.click(settingsButton);
    expect(handleOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('exposes accessible ARIA attributes for global settings trigger', () => {
    render(<AppHeader />);
    const settingsButton = screen.getByRole('button', { name: 'Configurações Globais' });
    expect(settingsButton.getAttribute('aria-label')).toBe('Configurações Globais');
    expect(settingsButton.getAttribute('title')).toBe('Configurações Globais');
    expect(settingsButton.getAttribute('aria-haspopup')).toBe('dialog');
    expect(settingsButton.getAttribute('type')).toBe('button');
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

  it('renders environment dropdown selector with available environments and "Sem Ambiente"', () => {
    const { rerender } = render(<AppHeader environments={['Development', 'Staging', 'Production']} />);
    const select = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' }) as HTMLSelectElement;
    expect(select).toBeDefined();

    const options = Array.from(select.options).map((opt) => ({ text: opt.text, value: opt.value }));
    expect(options).toEqual([
      { text: 'Sem Ambiente', value: '' },
      { text: 'Development', value: 'Development' },
      { text: 'Staging', value: 'Staging' },
      { text: 'Production', value: 'Production' },
    ]);
    expect(select.value).toBe('');

    rerender(<AppHeader environments={['Local', 'Testing']} activeEnvironment="Testing" />);
    const updatedSelect = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' }) as HTMLSelectElement;
    const updatedOptions = Array.from(updatedSelect.options).map((opt) => ({ text: opt.text, value: opt.value }));
    expect(updatedOptions).toEqual([
      { text: 'Sem Ambiente', value: '' },
      { text: 'Local', value: 'Local' },
      { text: 'Testing', value: 'Testing' },
    ]);
    expect(updatedSelect.value).toBe('Testing');
  });

  it('defaults environments to an empty array when none are provided', () => {
    render(<AppHeader />);
    const select = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' }) as HTMLSelectElement;
    const options = Array.from(select.options).map((opt) => ({ text: opt.text, value: opt.value }));
    expect(options).toEqual([{ text: 'Sem Ambiente', value: '' }]);
  });

  it('calls onSelectEnvironment with environment name or null when "Sem Ambiente" is selected', () => {
    const handleSelect = vi.fn();
    render(
      <AppHeader
        environments={['Development', 'Staging', 'Production']}
        activeEnvironment="Development"
        onSelectEnvironment={handleSelect}
      />
    );
    const select = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' });

    fireEvent.change(select, { target: { value: 'Staging' } });
    expect(handleSelect).toHaveBeenCalledWith('Staging');

    fireEvent.change(select, { target: { value: '' } });
    expect(handleSelect).toHaveBeenCalledWith(null);
  });

  it('calls onOpenEnvironmentSettings when clicking the environment settings button', () => {
    const handleOpenSettings = vi.fn();
    render(<AppHeader onOpenEnvironmentSettings={handleOpenSettings} />);
    const settingsButton = screen.getByRole('button', { name: 'Configurar ambientes e variáveis' });
    fireEvent.click(settingsButton);
    expect(handleOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('exposes accessible ARIA attributes for environment selector and settings trigger', () => {
    render(<AppHeader />);
    const select = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' });
    expect(select.getAttribute('aria-label')).toBe('Selecionar ambiente ativo');

    const settingsButton = screen.getByRole('button', { name: 'Configurar ambientes e variáveis' });
    expect(settingsButton.getAttribute('aria-label')).toBe('Configurar ambientes e variáveis');
    expect(settingsButton.getAttribute('aria-haspopup')).toBe('dialog');
    expect(settingsButton.getAttribute('type')).toBe('button');
  });

  it('handles duplicate environments safely', () => {
    render(<AppHeader environments={['Dev', 'Dev']} />);
    const select = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' }) as HTMLSelectElement;
    const options = Array.from(select.options).map((opt) => opt.text);
    expect(options).toEqual(['Sem Ambiente', 'Dev', 'Dev']);
  });
});
