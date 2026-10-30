import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as authApi from '@/lib/authApi';
import { AuthConfig, AuthUser } from '@/lib/authApi';
import {
  useAuthStore,
  INITIAL_AUTH_STATE,
} from './useAuthStore';

vi.mock('@/lib/authApi', async () => {
  return {
    getAuthConfig: vi.fn(),
    loginLocal: vi.fn(),
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
  };
});

const mockUser: AuthUser = {
  id: 'usr-123',
  email: 'admin@apidot.dev',
  displayName: 'Admin User',
  isRoot: true,
  workspaces: [{ id: 'ws-1', name: 'Default', role: 'Owner' }],
};

const mockConfig: AuthConfig = {
  oidcEnabled: true,
  localAuthEnabled: true,
  providerName: 'Authentik',
};

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      config: null,
      isLoading: true,
      isAuthenticated: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Initial State & Constants', () => {
    it('initializes with isLoading: true and isAuthenticated: false', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.config).toBeNull();
      expect(state.isLoading).toBe(true);
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeNull();
    });

    it('exports INITIAL_AUTH_STATE matching requirements', () => {
      expect(INITIAL_AUTH_STATE).toEqual({
        user: null,
        config: null,
        isLoading: true,
        isAuthenticated: false,
        error: null,
      });
    });
  });

  describe('2. checkAuth', () => {
    it('populates user and sets isAuthenticated: true when /api/auth/me succeeds', async () => {
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(mockUser);

      const result = await useAuthStore.getState().checkAuth();

      expect(authApi.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockUser);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets user to null and isAuthenticated: false when /api/auth/me returns null (401)', async () => {
      vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce(null);

      const result = await useAuthStore.getState().checkAuth();

      expect(authApi.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('handles unexpected errors, resets auth and records error in state', async () => {
      vi.mocked(authApi.getCurrentUser).mockRejectedValueOnce(
        new Error('Network error connecting to auth server')
      );

      const result = await useAuthStore.getState().checkAuth();

      expect(result).toBeNull();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Network error connecting to auth server');
    });
  });

  describe('3. fetchConfig', () => {
    it('fetches and stores auth configuration', async () => {
      vi.mocked(authApi.getAuthConfig).mockResolvedValueOnce(mockConfig);

      const result = await useAuthStore.getState().fetchConfig();

      expect(authApi.getAuthConfig).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockConfig);

      const state = useAuthStore.getState();
      expect(state.config).toEqual(mockConfig);
      expect(state.error).toBeNull();
    });

    it('records error and rethrows when config fetch fails', async () => {
      vi.mocked(authApi.getAuthConfig).mockRejectedValueOnce(
        new Error('Failed to fetch configuration')
      );

      await expect(useAuthStore.getState().fetchConfig()).rejects.toThrow(
        'Failed to fetch configuration'
      );

      const state = useAuthStore.getState();
      expect(state.error).toBe('Failed to fetch configuration');
    });
  });

  describe('4. loginLocal', () => {
    it('authenticates user and updates store on successful local login', async () => {
      vi.mocked(authApi.loginLocal).mockResolvedValueOnce(mockUser);

      const result = await useAuthStore.getState().loginLocal('admin@apidot.dev', 'password');

      expect(authApi.loginLocal).toHaveBeenCalledWith('admin@apidot.dev', 'password');
      expect(result).toEqual(mockUser);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error and rethrows when local login fails', async () => {
      vi.mocked(authApi.loginLocal).mockRejectedValueOnce(
        new Error('Invalid email or password.')
      );

      await expect(
        useAuthStore.getState().loginLocal('admin@apidot.dev', 'wrongpassword')
      ).rejects.toThrow('Invalid email or password.');

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Invalid email or password.');
    });
  });

  describe('5. logout', () => {
    it('clears user state and sets isAuthenticated: false on logout', async () => {
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      vi.mocked(authApi.logout).mockResolvedValueOnce();

      await useAuthStore.getState().logout();

      expect(authApi.logout).toHaveBeenCalledTimes(1);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('clears user state even when logout request throws error', async () => {
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      vi.mocked(authApi.logout).mockRejectedValueOnce(new Error('Logout failed on server'));

      await expect(useAuthStore.getState().logout()).rejects.toThrow('Logout failed on server');

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Logout failed on server');
    });
  });

  describe('6. reset', () => {
    it('resets store back to INITIAL_AUTH_STATE', () => {
      useAuthStore.setState({
        user: mockUser,
        config: mockConfig,
        isAuthenticated: true,
        isLoading: false,
        error: 'some error',
      });

      useAuthStore.getState().reset();

      expect(useAuthStore.getState()).toMatchObject(INITIAL_AUTH_STATE);
    });
  });
});
