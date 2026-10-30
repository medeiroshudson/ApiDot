import { create } from 'zustand';
import {
  AuthConfig,
  AuthUser,
  getAuthConfig as getAuthConfigApi,
  loginLocal as loginLocalApi,
  getCurrentUser as getCurrentUserApi,
  logout as logoutApi,
} from '@/lib/authApi';

export const INITIAL_AUTH_STATE = {
  user: null as AuthUser | null,
  config: null as AuthConfig | null,
  isLoading: true,
  isAuthenticated: false,
  error: null as string | null,
};

export interface AuthState {
  user: AuthUser | null;
  config: AuthConfig | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  setUser: (user: AuthUser | null) => void;
  checkAuth: () => Promise<AuthUser | null>;
  fetchConfig: () => Promise<AuthConfig>;
  loginLocal: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...INITIAL_AUTH_STATE,

  setUser: (user: AuthUser | null) => {
    set({
      user,
      isAuthenticated: !!user,
    });
  },

  checkAuth: async (): Promise<AuthUser | null> => {
    set({ isLoading: true, error: null });
    try {
      const user = await getCurrentUserApi();
      if (user) {
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return user;
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
        return null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication check failed';
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: message,
      });
      return null;
    }
  },

  fetchConfig: async (): Promise<AuthConfig> => {
    set({ error: null });
    try {
      const config = await getAuthConfigApi();
      set({ config, error: null });
      return config;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch auth configuration';
      set({ error: message });
      throw err;
    }
  },

  loginLocal: async (email: string, password: string): Promise<AuthUser> => {
    set({ isLoading: true, error: null });
    try {
      const user = await loginLocalApi(email, password);
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return user;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: message,
      });
      throw err;
    }
  },

  logout: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      await logoutApi();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Logout failed';
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: message,
      });
      throw err;
    }
  },

  reset: () => {
    set({ ...INITIAL_AUTH_STATE });
  },
}));
