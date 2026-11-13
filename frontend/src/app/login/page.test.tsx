import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LoginPage from './page';
import { useAuthStore, INITIAL_AUTH_STATE } from '@/stores/useAuthStore';
import { AuthConfig, AuthUser } from '@/lib/authApi';
import * as authApi from '@/lib/authApi';
import * as desktopAuth from '@/lib/desktop/desktopAuth';
import { getApiBase, setApiBase } from '@/lib/api/base';
import { getSession, setSession } from '@/lib/api/session';
import { saveDesktopSession } from '@/lib/desktop/session';

vi.mock('@/lib/desktop/desktopAuth', () => ({
  startDesktopSsoFlow: vi.fn(),
}));

vi.mock('@/lib/desktop/session', () => ({
  loadDesktopSession: vi.fn().mockResolvedValue(null),
  saveDesktopSession: vi.fn().mockResolvedValue(undefined),
  clearDesktopSession: vi.fn().mockResolvedValue(undefined),
}));

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
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    vi.mocked(authApi.getAuthConfig).mockResolvedValue(mockConfigEnabled);
    useAuthStore.setState({
      ...INITIAL_AUTH_STATE,
      isLoading: false,
      isAuthenticated: false,
      config: mockConfigEnabled,
      error: null,
      pendingRoute: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Branding and Layout', () => {
    it('renders ApiDot branding and motto', () => {
      render(<LoginPage />);

      expect(screen.getByRole('img', { name: /ApiDot/i })).toBeInTheDocument();
      expect(screen.getByText('ApiDot')).toBeInTheDocument();
      expect(screen.getByText(/Test and debug any API, anywhere/i)).toBeInTheDocument();
    });
  });

  describe('SSO Authentication', () => {
    it('renders "Sign in with SSO" button when oidcEnabled is true', () => {
      useAuthStore.setState({ config: mockConfigEnabled });
      render(<LoginPage />);

      const ssoButton = screen.getByRole('button', { name: /sign in with sso/i });
      expect(ssoButton).toBeInTheDocument();
      expect(ssoButton).toHaveAttribute('href', '/api/auth/login');
      expect(screen.getByText(/or continue with local credentials/i)).toBeInTheDocument();
    });

    it('renders "Sign in with SSO" button by default while config is loading', () => {
      vi.mocked(authApi.getAuthConfig).mockImplementation(() => new Promise(() => {}));
      useAuthStore.setState({ config: null });
      render(<LoginPage />);

      const ssoButton = screen.getByRole('button', { name: /sign in with sso/i });
      expect(ssoButton).toBeInTheDocument();
      expect(ssoButton).toHaveAttribute('href', '/api/auth/login');
    });

    it('hides "Sign in with SSO" button and divider when oidcEnabled is false', () => {
      useAuthStore.setState({ config: mockConfigDisabled });
      render(<LoginPage />);

      expect(screen.queryByRole('button', { name: /sign in with sso/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/or continue with local credentials/i)).not.toBeInTheDocument();
    });
  });

  describe('Local Credentials Form', () => {
    it('renders email, password inputs and submit button', () => {
      render(<LoginPage />);

      expect(screen.getByLabelText(/email|e-?mail/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password|senha/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /sign in with local credentials|entrar com credenciais locais/i })
      ).toBeInTheDocument();
    });

    it('allows typing into email and password inputs', () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email|e-?mail/i) as HTMLInputElement;
      const passwordInput = screen.getByLabelText(/password|senha/i) as HTMLInputElement;

      fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'secret123' } });

      expect(emailInput.value).toBe('user@example.com');
      expect(passwordInput.value).toBe('secret123');
    });

    it('successfully logs in with valid credentials and redirects to "/"', async () => {
      const loginLocalSpy = vi.fn().mockResolvedValue(mockUser);
      useAuthStore.setState({ loginLocal: loginLocalSpy });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email|e-?mail/i);
      const passwordInput = screen.getByLabelText(/password|senha/i);
      const submitButton = screen.getByRole('button', { name: /sign in with local credentials|entrar com credenciais locais/i });

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

    it('allows entering a plain username like demo and calls loginLocal with it', async () => {
      const loginLocalSpy = vi.fn().mockResolvedValue(mockUser);
      useAuthStore.setState({ loginLocal: loginLocalSpy });

      render(<LoginPage />);

      const emailOrUsernameInput = screen.getByLabelText(/email|e-?mail/i);
      const passwordInput = screen.getByLabelText(/password|senha/i);
      const submitButton = screen.getByRole('button', { name: /sign in with local credentials|entrar com credenciais locais/i });

      fireEvent.change(emailOrUsernameInput, { target: { value: 'demo' } });
      fireEvent.change(passwordInput, { target: { value: 'demo' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(loginLocalSpy).toHaveBeenCalledWith('demo', 'demo');
        expect(mockReplace).toHaveBeenCalledWith('/');
      });
    });

    it('displays error message banner when login fails and does not redirect', async () => {
      const loginLocalSpy = vi.fn().mockRejectedValue(new Error('Credenciais inválidas'));
      useAuthStore.setState({ loginLocal: loginLocalSpy });

      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email|e-?mail/i);
      const passwordInput = screen.getByLabelText(/password|senha/i);
      const submitButton = screen.getByRole('button', { name: /sign in with local credentials|entrar com credenciais locais/i });

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

      const form = screen.getByRole('button', { name: /sign in with local credentials|entrar com credenciais locais/i }).closest('form')!;
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

      const emailInput = screen.getByLabelText(/email|e-?mail/i);
      const passwordInput = screen.getByLabelText(/password|senha/i);
      const submitButton = screen.getByRole('button', { name: /sign in with local credentials|entrar com credenciais locais/i });

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

    it('redirects to safe returnUrl when already authenticated', () => {
      window.history.pushState({}, '', '/login?returnUrl=/workspace/ws-safe');
      useAuthStore.setState({ isAuthenticated: true });

      render(<LoginPage />);

      expect(mockReplace).toHaveBeenCalledWith('/workspace/ws-safe');
      window.history.pushState({}, '', '/login');
    });

    it('sanitizes malicious protocol-relative and external returnUrl parameters to "/"', () => {
      // Test //evil.com
      window.history.pushState({}, '', '/login?returnUrl=//attacker.com');
      useAuthStore.setState({ isAuthenticated: true });

      const { unmount } = render(<LoginPage />);
      expect(mockReplace).toHaveBeenCalledWith('/');
      unmount();

      // Test /\\attacker.com
      mockReplace.mockClear();
      window.history.pushState({}, '', '/login?returnUrl=/\\\\attacker.com');
      const { unmount: unmount2 } = render(<LoginPage />);
      expect(mockReplace).toHaveBeenCalledWith('/');
      unmount2();

      // Test https://evil.com
      mockReplace.mockClear();
      window.history.pushState({}, '', '/login?returnUrl=https://evil.com');
      render(<LoginPage />);
      expect(mockReplace).toHaveBeenCalledWith('/');

      window.history.pushState({}, '', '/login');
    });

    it('displays error message from url query parameter when present on mount', () => {
      window.history.pushState({}, '', '/login?error=Falha%20no%20provedor%20SSO');
      useAuthStore.setState({ isAuthenticated: false });

      render(<LoginPage />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Falha no provedor SSO')).toBeInTheDocument();

      window.history.pushState({}, '', '/login');
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

  describe('Desktop SSO Flow', () => {
    beforeEach(() => {
      (window as any).__TAURI__ = { core: { invoke: vi.fn() } };
    });

    it('renders SSO button as standard button without href in desktop environment', () => {
      render(<LoginPage />);

      const ssoButton = screen.getByRole('button', { name: /sign in with sso/i });
      expect(ssoButton).toBeInTheDocument();
      expect(ssoButton).not.toHaveAttribute('href');
    });

    it('triggers startDesktopSsoFlow, displays waiting state with spinner and cancel button', async () => {
      let resolveFlow: (val: any) => void = () => {};
      const pendingPromise = new Promise((resolve) => {
        resolveFlow = resolve;
      });
      vi.mocked(desktopAuth.startDesktopSsoFlow).mockReturnValue(pendingPromise as any);

      render(<LoginPage />);

      const ssoButton = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(ssoButton);

      await waitFor(() => {
        expect(desktopAuth.startDesktopSsoFlow).toHaveBeenCalledWith({
          returnUrl: '/',
          signal: expect.any(AbortSignal),
        });
      });

      // Waiting state should be rendered
      expect(screen.getByText(/waiting for authentication in your browser\.\.\./i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

      // Resolve successfully
      resolveFlow({ success: true, user: mockUser });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      });
    });

    it('calls loginDesktopSso and redirects to returnUrl on successful desktop SSO authentication', async () => {
      window.history.pushState({}, '', '/login?returnUrl=/workspace/ws-target');
      const loginDesktopSsoSpy = vi.fn();
      useAuthStore.setState({ loginDesktopSso: loginDesktopSsoSpy });

      vi.mocked(desktopAuth.startDesktopSsoFlow).mockResolvedValue({
        success: true,
        user: mockUser,
      });

      render(<LoginPage />);

      const ssoButton = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(ssoButton);

      await waitFor(() => {
        expect(loginDesktopSsoSpy).toHaveBeenCalledWith(mockUser);
        expect(mockReplace).toHaveBeenCalledWith('/workspace/ws-target');
      });

      window.history.pushState({}, '', '/login');
    });

    it('allows cancelling waiting state and restores SSO button', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.mocked(desktopAuth.startDesktopSsoFlow).mockImplementation(async (opts) => {
        capturedSignal = opts?.signal;
        return new Promise(() => {});
      });

      render(<LoginPage />);

      const ssoButton = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(ssoButton);

      await waitFor(() => {
        expect(screen.getByText(/waiting for authentication in your browser\.\.\./i)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText(/waiting for authentication in your browser\.\.\./i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument();
      });

      expect(capturedSignal?.aborted).toBe(true);
    });

    it('displays error banner when desktop SSO flow fails and resets waiting state', async () => {
      vi.mocked(desktopAuth.startDesktopSsoFlow).mockResolvedValue({
        success: false,
        error: 'Authentication timed out. Please try again.',
      });

      render(<LoginPage />);

      const ssoButton = screen.getByRole('button', { name: /sign in with sso/i });
      fireEvent.click(ssoButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Authentication timed out. Please try again.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in with sso/i })).toBeInTheDocument();
      });
    });
  });

  describe('Desktop server URL', () => {
    beforeEach(() => {
      (window as any).__TAURI__ = { core: { invoke: vi.fn() } };
      setApiBase(null);
      setSession(null);
      vi.mocked(saveDesktopSession).mockClear();
    });

    afterEach(() => {
      delete (window as any).__TAURI__;
      setApiBase(null);
      setSession(null);
    });

    const fillCredentialsAndSubmit = () => {
      fireEvent.change(screen.getByLabelText(/email|e-?mail/i), {
        target: { value: 'dev@apidot.dev' },
      });
      fireEvent.change(screen.getByLabelText(/password|senha/i), {
        target: { value: 'secret123' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: /sign in with local credentials|entrar com credenciais locais/i,
        })
      );
    };

    it('hides the field on the web', () => {
      delete (window as any).__TAURI__;

      render(<LoginPage />);

      expect(screen.queryByLabelText(/server url|url do servidor/i)).not.toBeInTheDocument();
    });

    it('prefills the field from the configured API base', () => {
      setApiBase('https://stored.example.com');

      render(<LoginPage />);

      expect(screen.getByLabelText(/server url|url do servidor/i)).toHaveValue(
        'https://stored.example.com'
      );
    });

    it('persists the typed URL before calling the login API', async () => {
      let baseAtLoginCall: string | null = null;
      const loginLocalSpy = vi.fn().mockImplementation(async () => {
        baseAtLoginCall = getApiBase();
        return mockUser;
      });
      useAuthStore.setState({ loginLocal: loginLocalSpy });

      render(<LoginPage />);

      fireEvent.change(screen.getByLabelText(/server url|url do servidor/i), {
        target: { value: ' https://typed.example.com/ ' },
      });
      fillCredentialsAndSubmit();

      await waitFor(() => {
        expect(loginLocalSpy).toHaveBeenCalledWith('dev@apidot.dev', 'secret123');
      });

      expect(baseAtLoginCall).toBe('https://typed.example.com');
      expect(getApiBase()).toBe('https://typed.example.com');
      expect(getSession()?.serverUrl).toBe('https://typed.example.com');
      expect(vi.mocked(saveDesktopSession).mock.calls.at(-1)?.[0]).toMatchObject({
        serverUrl: 'https://typed.example.com',
      });
    });

    it.each(['ftp://x', 'not a url'])(
      'rejects the invalid URL %s and never calls the login API',
      async (invalidUrl) => {
        const loginLocalSpy = vi.fn().mockResolvedValue(mockUser);
        useAuthStore.setState({ loginLocal: loginLocalSpy });
        setApiBase('https://stored.example.com');

        render(<LoginPage />);

        fireEvent.change(screen.getByLabelText(/server url|url do servidor/i), {
          target: { value: invalidUrl },
        });
        fillCredentialsAndSubmit();

        await waitFor(() => {
          expect(screen.getByText(/valid http\(s\) url/i)).toBeInTheDocument();
        });

        expect(loginLocalSpy).not.toHaveBeenCalled();
        expect(getApiBase()).toBe('https://stored.example.com');
        expect(saveDesktopSession).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
      }
    );

    it('blocks desktop SSO with an invalid URL', async () => {
      render(<LoginPage />);

      fireEvent.change(screen.getByLabelText(/server url|url do servidor/i), {
        target: { value: 'ftp://x' },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign in with sso/i }));

      await waitFor(() => {
        expect(screen.getByText(/valid http\(s\) url/i)).toBeInTheDocument();
      });

      expect(desktopAuth.startDesktopSsoFlow).not.toHaveBeenCalled();
    });
  });

  describe('Pending route resume', () => {
    const pendingRequest = {
      kind: 'request' as const,
      workspaceId: 'ws-1',
      requestId: 'req 9',
    };

    const submitLocalCredentials = () => {
      fireEvent.change(screen.getByLabelText(/email|e-?mail/i), {
        target: { value: 'dev@apidot.dev' },
      });
      fireEvent.change(screen.getByLabelText(/password|senha/i), {
        target: { value: 'secret123' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: /sign in with local credentials|entrar com credenciais locais/i,
        })
      );
    };

    it('keeps the pending route while the login screen is shown', () => {
      useAuthStore.getState().setPendingRoute(pendingRequest);

      render(<LoginPage />);

      expect(useAuthStore.getState().pendingRoute).toEqual(pendingRequest);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('navigates to the pending hash route after a desktop login and clears it', async () => {
      (window as any).__TAURI_INTERNALS__ = {};
      useAuthStore.getState().setPendingRoute(pendingRequest);
      useAuthStore.setState({ loginLocal: vi.fn().mockResolvedValue(mockUser) });

      render(<LoginPage />);
      submitLocalCredentials();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/#/workspace/ws-1/request/req%209');
      });

      expect(useAuthStore.getState().pendingRoute).toBeNull();
      expect(mockReplace).toHaveBeenCalledTimes(1);
    });

    it('consumes the pending route once when the session is already authenticated', () => {
      (window as any).__TAURI_INTERNALS__ = {};
      useAuthStore.getState().setPendingRoute({ kind: 'workspace', workspaceId: 'ws-1' });
      useAuthStore.setState({ isAuthenticated: true });

      const { rerender } = render(<LoginPage />);

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/#/workspace/ws-1');
      expect(useAuthStore.getState().pendingRoute).toBeNull();

      rerender(<LoginPage />);

      expect(mockReplace).toHaveBeenCalledTimes(1);
    });

    it('ignores the pending route on the web and keeps the returnUrl behaviour', async () => {
      useAuthStore.getState().setPendingRoute({ kind: 'workspace', workspaceId: 'ws-1' });
      useAuthStore.setState({ loginLocal: vi.fn().mockResolvedValue(mockUser) });

      render(<LoginPage />);
      submitLocalCredentials();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      });

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().pendingRoute).toEqual({
        kind: 'workspace',
        workspaceId: 'ws-1',
      });
    });
  });
});
