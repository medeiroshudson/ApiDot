import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAuthConfig,
  loginLocal,
  getCurrentUser,
  logout,
  patchUserLocale,
  AuthConfig,
  AuthUser,
} from './authApi';

describe('authApi', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('getAuthConfig', () => {
    it('sends GET to /api/auth/config and returns auth configuration', async () => {
      const mockConfig: AuthConfig = {
        oidcEnabled: true,
        localAuthEnabled: true,
        providerName: 'Authentik',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockConfig,
      } as Response);

      const result = await getAuthConfig();

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/config');
      expect(result).toEqual(mockConfig);
    });

    it('throws error with problem details message when config fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Failed to load configuration' }),
      } as Response);

      await expect(getAuthConfig()).rejects.toThrow('Failed to load configuration');
    });

    it('falls back to status code message when error json parsing fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Not JSON');
        },
        text: async () => 'Bad Gateway',
      } as unknown as Response);

      await expect(getAuthConfig()).rejects.toThrow('Bad Gateway');
    });
  });

  describe('loginLocal', () => {
    it('sends POST to /api/auth/local with credentials and returns user DTO', async () => {
      const mockUser: AuthUser = {
        id: 'usr-123',
        email: 'user@example.com',
        displayName: 'Test User',
        isRoot: true,
        workspaces: [{ id: 'ws-1', name: 'Default', role: 'Owner' }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockUser,
      } as Response);

      const result = await loginLocal('user@example.com', 'secret123');

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'secret123' }),
      });
      expect(result).toEqual(mockUser);
    });

    it('throws error when login fails with 401 problem details', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Invalid email or password.' }),
      } as Response);

      await expect(loginLocal('user@example.com', 'wrongpassword')).rejects.toThrow(
        'Invalid email or password.'
      );
    });

    it('throws error with message property if detail is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Local authentication is disabled.' }),
      } as Response);

      await expect(loginLocal('user@example.com', 'password')).rejects.toThrow(
        'Local authentication is disabled.'
      );
    });
  });

  describe('getCurrentUser', () => {
    it('sends GET to /api/auth/me and returns user DTO when authenticated', async () => {
      const mockUser: AuthUser = {
        id: 'usr-999',
        email: 'logged@example.com',
        displayName: 'Logged In User',
        isRoot: false,
        workspaces: [{ id: 'ws-abc', name: 'Work', role: 'Member' }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockUser,
      } as Response);

      const result = await getCurrentUser();

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/me');
      expect(result).toEqual(mockUser);
    });

    it('returns null when server responds with 401 Unauthorized', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      } as Response);

      const result = await getCurrentUser();

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/me');
      expect(result).toBeNull();
    });

    it('throws error when server responds with non-401 error like 500', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Internal server error while fetching user' }),
      } as Response);

      await expect(getCurrentUser()).rejects.toThrow(
        'Internal server error while fetching user'
      );
    });
  });

  describe('logout', () => {
    it('sends POST to /api/auth/logout', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: 'Logged out successfully' }),
      } as Response);

      await logout();

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
      });
    });

    it('throws error when logout fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Failed to terminate session' }),
      } as Response);

      await expect(logout()).rejects.toThrow('Failed to terminate session');
    });
  });

  describe('patchUserLocale', () => {
    it('sends PATCH to /api/auth/me/locale with locale payload', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      } as Response);

      await patchUserLocale('pt-BR');

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/me/locale', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'pt-BR' }),
      });
    });

    it('throws error when patch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      } as Response);

      await expect(patchUserLocale('invalid')).rejects.toThrow(
        'Failed to update locale preference'
      );
    });
  });
});
