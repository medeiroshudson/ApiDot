import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppHeader } from './AppHeader';
import { APP_VERSION, formatDisplayVersion } from '@/lib/version';
import { useAuthStore } from '@/stores/useAuthStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useRequestStore } from '@/stores/useRequestStore';
import { useI18nStore } from '@/stores/useI18nStore';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
}));

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useI18nStore.setState({ locale: 'en-US' });
  });
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
    const settingsButton = screen.getByRole('button', { name: 'Global Settings' });
    fireEvent.click(settingsButton);
    expect(handleOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('exposes accessible ARIA attributes for global settings trigger', () => {
    render(<AppHeader />);
    const settingsButton = screen.getByRole('button', { name: 'Global Settings' });
    expect(settingsButton.getAttribute('aria-label')).toBe('Global Settings');
    expect(settingsButton.getAttribute('title')).toBe('Global Settings');
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

  it('renders environment dropdown selector with available environments and "No Environment"', () => {
    const { rerender } = render(<AppHeader environments={['Development', 'Staging', 'Production']} />);
    const select = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' }) as HTMLSelectElement;
    expect(select).toBeDefined();

    const options = Array.from(select.options).map((opt) => ({ text: opt.text, value: opt.value }));
    expect(options).toEqual([
      { text: 'No Environment', value: '' },
      { text: 'Development', value: 'Development' },
      { text: 'Staging', value: 'Staging' },
      { text: 'Production', value: 'Production' },
    ]);
    expect(select.value).toBe('');

    rerender(<AppHeader environments={['Local', 'Testing']} activeEnvironment="Testing" />);
    const updatedSelect = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' }) as HTMLSelectElement;
    const updatedOptions = Array.from(updatedSelect.options).map((opt) => ({ text: opt.text, value: opt.value }));
    expect(updatedOptions).toEqual([
      { text: 'No Environment', value: '' },
      { text: 'Local', value: 'Local' },
      { text: 'Testing', value: 'Testing' },
    ]);
    expect(updatedSelect.value).toBe('Testing');
  });

  it('defaults environments to an empty array when none are provided', () => {
    render(<AppHeader />);
    const select = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' }) as HTMLSelectElement;
    const options = Array.from(select.options).map((opt) => ({ text: opt.text, value: opt.value }));
    expect(options).toEqual([{ text: 'No Environment', value: '' }]);
  });

  it('calls onSelectEnvironment with environment name or null when "No Environment" is selected', () => {
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
    expect(options).toEqual(['No Environment', 'Dev', 'Dev']);
  });

  describe('User Profile Menu and Authentication', () => {
    it('degrades gracefully without rendering user menu when user is unauthenticated or loading', () => {
      useAuthStore.setState({ isAuthenticated: false, isLoading: false, user: null });
      render(<AppHeader />);
      expect(screen.queryByTestId('user-avatar')).toBeNull();
      expect(screen.queryByTestId('user-role-badge')).toBeNull();
    });

    it('renders user initials and email without role badge in navbar', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: 'u-1',
          email: 'hudson@example.com',
          displayName: 'Hudson Medeiros',
          isRoot: false,
          workspaces: [{ id: 'ws-main', name: 'Main Workspace', role: 'Owner' }],
        },
      });
      useWorkspaceStore.setState({ activeWorkspaceId: 'ws-main' });

      render(<AppHeader />);

      expect(screen.getByText('HM')).toBeInTheDocument();
      expect(screen.getByText('hudson@example.com')).toBeInTheDocument();
      expect(screen.queryByTestId('user-role-badge')).toBeNull();
      expect(screen.queryByText('Owner')).toBeNull();
    });

    it('calls logout action and redirects to /login on clicking logout', async () => {
      const mockLogout = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({
        isAuthenticated: true,
        isLoading: false,
        logout: mockLogout,
        user: {
          id: 'u-1',
          email: 'hudson@example.com',
          displayName: 'Hudson Medeiros',
          isRoot: false,
          workspaces: [{ id: 'ws-main', name: 'Main Workspace', role: 'Owner' }],
        },
      });
      useWorkspaceStore.setState({ activeWorkspaceId: 'ws-main' });
      useRequestStore.setState({ activeRequestId: 'req-active-123' });

      render(<AppHeader />);

      const userTrigger = screen.getByRole('button', { name: /menu do usuário/i });
      fireEvent.click(userTrigger);

      const logoutBtn = screen.getByRole('menuitem', { name: /log out/i });
      expect(logoutBtn).toHaveAttribute('role', 'menuitem');
      fireEvent.click(logoutBtn);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledTimes(1);
        expect(mockReplace).toHaveBeenCalledWith('/login');
      });

      expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
      expect(useRequestStore.getState().activeRequestId).toBeNull();
    });

    it('toggles dropdown menu on click and closes on Escape', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: 'u-1',
          email: 'hudson@example.com',
          displayName: 'Hudson Medeiros',
          isRoot: false,
          workspaces: [{ id: 'ws-main', name: 'Main Workspace', role: 'Owner' }],
        },
      });

      render(<AppHeader />);

      const userTrigger = screen.getByRole('button', { name: /menu do usuário/i });
      expect(screen.queryByTestId('user-dropdown-menu')).toBeNull();

      fireEvent.click(userTrigger);
      expect(screen.getByTestId('user-dropdown-menu')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('user-dropdown-menu')).toBeNull();
    });

    it('renders in English by default ("Global Settings", "No Environment")', () => {
      render(<AppHeader />);
      expect(screen.getByRole('button', { name: 'Global Settings' })).toBeInTheDocument();
      const select = screen.getByRole('combobox', { name: 'Selecionar ambiente ativo' }) as HTMLSelectElement;
      expect(select.options[0].text).toBe('No Environment');
    });

    it('shows active language in user menu and allows quick toggle between en-US and pt-BR', async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: 'u-1',
          email: 'hudson@example.com',
          displayName: 'Hudson Medeiros',
          isRoot: false,
          workspaces: [{ id: 'ws-main', name: 'Main Workspace', role: 'Owner' }],
        },
      });

      render(<AppHeader />);

      const userTrigger = screen.getByRole('button', { name: /menu do usuário/i });
      fireEvent.click(userTrigger);

      expect(screen.getByTestId('user-dropdown-menu')).toBeInTheDocument();
      expect(screen.getByText('Language')).toBeInTheDocument();

      const toggleBtn = screen.getByTestId('language-toggle');
      expect(toggleBtn).toBeInTheDocument();
      expect(toggleBtn).toHaveTextContent(/english/i);

      // Toggle to Portuguese
      await act(async () => {
        fireEvent.click(toggleBtn);
      });

      expect(useI18nStore.getState().locale).toBe('pt-BR');
      expect(screen.getByRole('button', { name: 'Configurações Globais' })).toBeInTheDocument();
      expect(screen.getByText('Idioma')).toBeInTheDocument();
      expect(toggleBtn).toHaveTextContent(/português/i);

      // Toggle back to English
      await act(async () => {
        fireEvent.click(toggleBtn);
      });

      expect(useI18nStore.getState().locale).toBe('en-US');
      expect(screen.getByRole('button', { name: 'Global Settings' })).toBeInTheDocument();
      expect(screen.getByText('Language')).toBeInTheDocument();
      expect(toggleBtn).toHaveTextContent(/english/i);
    });
  });
});
