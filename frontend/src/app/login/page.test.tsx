import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LoginPage from './page';
import { useAuthStore, INITIAL_AUTH_STATE } from '@/stores/useAuthStore';
import { AuthConfig, AuthUser } from '@/lib/authApi';
import * as authApi from '@/lib/authApi';

vi.mock('@/lib/authApi', async () => {
  return {
    getAuthConfig: vi.fn(),
    loginLocal: vi.fn(),
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
  };
});

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

const mockUser: AuthUser = {
  id: 'user-1',
  email: 'dev@apidot.dev',
  displayName: 'Dev User',
  isRoot: true,
  workspaces: [{ id: 'ws-1', name: 'Default', role: 'Owner' }],
};

const mockConfigEnabled: AuthConfig = {
  oidcEnabled: true,
  localAuthEnabled: true,
  providerName: 'Authentik',
};

const mockConfigDisabled: AuthConfig = {
  oidcEnabled: false,
  localAuthEnabled: true,
  providerName: '',
};

describe('LoginPage (/login)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.getAuthConfig).mockResolvedValue(mockConfigEnabled);
    useAuthStore.setState({
      ...INITIAL_AUTH_STATE,
      isLoading: false,
      isAuthenticated: false,
      config: mockConfigEnabled,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Branding and Layout', () => {
    it('renders ApiDot branding and motto', () => {
      render(<LoginPage />);

      expect(screen.getByText(/⚡ ApiDot/i)).toBeInTheDocument();
      expect(screen.getByText(/Test and debug any API, anywhere/i)).toBeInTheDocument();
    });
  });

  describe('SSO Authentication', () => {
    it('renders "Entrar com SSO" button when oidcEnabled is true', () => {
      useAuthStore.setState({ config: mockConfigEnabled });
      render(<LoginPage />);

      const ssoButton = screen.getByRole('button', { name: /entrar com sso/i });
      expect(ssoButton).toBeInTheDocument();
      expect(ssoButton).toHaveAttribute('href', '/api/auth/login');
      expect(screen.getByText(/ou continue com credenciais locais/i)).toBeInTheDocument();
    });

    it('renders "Entrar com SSO" button by default while config is loading', () => {
      vi.mocked(authApi.getAuthConfig).mockImplementation(() => new Promise(() => {}));
      useAuthStore.setState({ config: null });
      render(<LoginPage />);

      const ssoButton = screen.getByRole('button', { name: /entrar com sso/i });
      expect(ssoButton).toBeInTheDocument();
      expect(ssoButton).toHaveAttribute('href', '/api/auth/login');
    });

    it('hides "Entrar com SSO" button and divider when oidcEnabled is false', () => {
      useAuthStore.setState({ config: mockConfigDisabled });
      render(<LoginPage />);

      expect(screen.queryByRole('button', { name: /entrar com sso/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/ou continue com credenciais locais/i)).not.toBeInTheDocument();
    });
  });

  describe('Local Credentials Form', () => {
    it('renders email, password inputs and submit button', () => {
      render(<LoginPage />);

      expect(screen.getByLabelText(/e-?mail/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /entrar com credenciais locais/i })
      ).toBeInTheDocument();
    });

    it('allows typing into email and password inputs', () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/e-?mail/i) as HTMLInputElement;
      const passwordInput = screen.getByLabelText(/senha/i) as HTMLInputElement;

      fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'secret123' } });

      expect(emailInput.value).toBe('user@example.com');
      expect(passwordInput.value).toBe('secret123');
    });

    it('successfully logs in with valid credentials and redirects to "/"', async () => {
      const loginLocalSpy = vi.fn().mockResolvedValue(mockUser);
      useAuthStore.setState({ loginLocal: loginLocalSpy });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/e-?mail/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole('button', { name: /entrar com credenciais locais/i });

      fireEvent.change(emailInput, { target: { value: 'admin@apidot.dev' } });
      fireEvent.change(passwordInput, { target: { value: 'correctpassword' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(loginLocalSpy).toHaveBeenCalledWith('admin@apidot.dev', 'correctpassword');
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      });
    });

    it('displays error message banner when login fails and does not redirect', async () => {
      const loginLocalSpy = vi.fn().mockRejectedValue(new Error('Credenciais inválidas'));
      useAuthStore.setState({ loginLocal: loginLocalSpy });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/e-?mail/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole('button', { name: /entrar com credenciais locais/i });

      fireEvent.change(emailInput, { target: { value: 'wrong@apidot.dev' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Credenciais inválidas')).toBeInTheDocument();
      });

      expect(mockReplace).not.toHaveBeenCalled();

      // Typing into input clears error
      fireEvent.change(emailInput, { target: { value: 'new@apidot.dev' } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('validates empty inputs and does not call loginLocal', async () => {
      const loginLocalSpy = vi.fn();
      useAuthStore.setState({ loginLocal: loginLocalSpy });

      render(<LoginPage />);

      const form = screen.getByRole('button', { name: /entrar com credenciais locais/i }).closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(loginLocalSpy).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('shows loading state on submit button during submission', async () => {
      let resolveLogin: (user: AuthUser) => void = () => {};
      const loginPromise = new Promise<AuthUser>((resolve) => {
        resolveLogin = resolve;
      });
      const loginLocalSpy = vi.fn().mockReturnValue(loginPromise);
      useAuthStore.setState({ loginLocal: loginLocalSpy });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/e-?mail/i);
      const passwordInput = screen.getByLabelText(/senha/i);
      const submitButton = screen.getByRole('button', { name: /entrar com credenciais locais/i });

      fireEvent.change(emailInput, { target: { value: 'admin@apidot.dev' } });
      fireEvent.change(passwordInput, { target: { value: 'password' } });
      fireEvent.click(submitButton);

      expect(submitButton).toBeDisabled();

      // Resolve login
      resolveLogin(mockUser);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('Redirection & Store Integration', () => {
    it('redirects to "/" immediately if already authenticated on mount', () => {
      useAuthStore.setState({ isAuthenticated: true });

      render(<LoginPage />);

      expect(mockReplace).toHaveBeenCalledWith('/');
    });

    it('calls fetchConfig on mount if config is not present', async () => {
      const fetchConfigSpy = vi.fn().mockResolvedValue(mockConfigEnabled);
      useAuthStore.setState({ config: null, fetchConfig: fetchConfigSpy });

      render(<LoginPage />);

      await waitFor(() => {
        expect(fetchConfigSpy).toHaveBeenCalled();
      });
    });
  });
});
