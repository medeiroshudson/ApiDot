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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
        text: async () => '',
      })
    );
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

  it('renders environment pill with active environment indicator and opens dropdown on click', () => {
    useI18nStore.setState({ locale: 'pt-BR' });
    render(
      <AppHeader
        environments={['Development', 'Production']}
        activeEnvironment="Production"
      />
    );
    const pill = screen.getByRole('button', { name: /selecionar ambiente ativo/i });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent('Production');

    fireEvent.click(pill);
    expect(screen.getByRole('menu', { name: /environments|ambientes/i })).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Gerenciar Ambientes')).toBeInTheDocument();
  });

  it('calls onOpenEnvironmentSettings when clicking manage link inside environment pill dropdown', () => {
    useI18nStore.setState({ locale: 'pt-BR' });
    const onOpenEnvSettings = vi.fn();
    render(
      <AppHeader
        environments={['Production']}
        activeEnvironment="Production"
        onOpenEnvironmentSettings={onOpenEnvSettings}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /selecionar ambiente ativo/i }));
    fireEvent.click(screen.getByText('Gerenciar Ambientes'));
    expect(onOpenEnvSettings).toHaveBeenCalledTimes(1);
  });

  it('renders environment pill with fallback text when activeEnvironment is null', () => {
    const { rerender } = render(<AppHeader environments={['Development']} activeEnvironment={null} />);
    const pill = screen.getByRole('button', { name: /select active environment/i });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent('No Environment');

    rerender(<AppHeader environments={['Development']} activeEnvironment="Development" />);
    expect(pill).toHaveTextContent('Development');
  });

  it('calls onSelectEnvironment with environment name or null when environment item or "No Environment" is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <AppHeader
        environments={['Development', 'Staging', 'Production']}
        activeEnvironment="Development"
        onSelectEnvironment={handleSelect}
      />
    );
    const pill = screen.getByRole('button', { name: /select active environment/i });
    fireEvent.click(pill);

    const stagingItem = screen.getByRole('menuitem', { name: 'Staging' });
    fireEvent.click(stagingItem);
    expect(handleSelect).toHaveBeenCalledWith('Staging');

    // Reopen menu to select "No Environment"
    fireEvent.click(pill);
    const noEnvItem = screen.getByRole('menuitem', { name: 'No Environment' });
    fireEvent.click(noEnvItem);
    expect(handleSelect).toHaveBeenCalledWith(null);
  });

  it('handles duplicate environments safely in environment pill dropdown', () => {
    render(<AppHeader environments={['Dev', 'Dev']} />);
    const pill = screen.getByRole('button', { name: /select active environment/i });
    fireEvent.click(pill);

    const items = screen.getAllByRole('menuitem', { name: 'Dev' });
    expect(items).toHaveLength(2);
  });

  it('closes environment dropdown menu when pressing Escape or clicking outside', () => {
    render(<AppHeader environments={['Development', 'Production']} />);
    const pill = screen.getByRole('button', { name: /select active environment/i });

    fireEvent.click(pill);
    expect(screen.getByRole('menu', { name: /environments|ambientes/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: /environments|ambientes/i })).toBeNull();

    // Click outside
    fireEvent.click(pill);
    expect(screen.getByRole('menu', { name: /environments|ambientes/i })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu', { name: /environments|ambientes/i })).toBeNull();
  });

  it('exposes accessible ARIA attributes for environment pill trigger', () => {
    render(<AppHeader />);
    const pill = screen.getByRole('button', { name: /select active environment/i });
    expect(pill.getAttribute('aria-label')).toBe('Select active environment');
    expect(pill.getAttribute('aria-haspopup')).toBe('menu');
    expect(pill.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(pill);
    expect(pill.getAttribute('aria-expanded')).toBe('true');
  });

  it('hides topbar global settings button on mobile with responsive classes', () => {
    render(<AppHeader />);
    const settingsButton = screen.getByRole('button', { name: 'Global Settings' });
    expect(settingsButton.className).toContain('hidden');
    expect(settingsButton.className).toContain('sm:flex');
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

    it('provides global settings access inside user profile dropdown with settings icon and calls onOpenSettings', () => {
      const handleOpenSettings = vi.fn();
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

      render(<AppHeader onOpenSettings={handleOpenSettings} />);
      const userTrigger = screen.getByRole('button', { name: /menu do usuário/i });
      fireEvent.click(userTrigger);

      const globalSettingsItem = screen.getByRole('menuitem', { name: 'Global Settings' });
      expect(globalSettingsItem).toBeInTheDocument();

      fireEvent.click(globalSettingsItem);
      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('user-dropdown-menu')).toBeNull();
    });

    it('renders in English by default ("Global Settings", "No Environment")', () => {
      render(<AppHeader />);
      expect(screen.getByRole('button', { name: 'Global Settings' })).toBeInTheDocument();
      const pill = screen.getByRole('button', { name: /select active environment/i });
      expect(pill).toHaveTextContent('No Environment');
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
