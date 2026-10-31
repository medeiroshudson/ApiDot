import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useI18nStore, LOCALE_STORAGE_KEY } from './useI18nStore';
import { useAuthStore } from './useAuthStore';
import * as authApi from '@/lib/authApi';

vi.mock('@/lib/authApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authApi')>('@/lib/authApi');
  return {
    ...actual,
    patchUserLocale: vi.fn(),
  };
});

describe('useI18nStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
    });
    useI18nStore.setState({ locale: 'en-US' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Initialization & Defaults', () => {
    it('initializes with en-US as default', () => {
      expect(useI18nStore.getState().locale).toBe('en-US');
    });

    it('exports LOCALE_STORAGE_KEY matching apidot_locale', () => {
      expect(LOCALE_STORAGE_KEY).toBe('apidot_locale');
    });

    it('configures persistence with LOCALE_STORAGE_KEY', () => {
      const persistOptions = (useI18nStore as any).persist?.getOptions?.();
      expect(persistOptions?.name).toBe('apidot_locale');
    });
  });

  describe('2. setLocale and persistence', () => {
    it('updates locale and persists in localStorage', async () => {
      await useI18nStore.getState().setLocale('pt-BR');
      expect(useI18nStore.getState().locale).toBe('pt-BR');
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR');
    });

    it('falls back to en-US when given an invalid locale', async () => {
      await useI18nStore.getState().setLocale('fr-FR' as any);
      expect(useI18nStore.getState().locale).toBe('en-US');
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en-US');
    });
  });

  describe('3. Backend Synchronization', () => {
    it('does not call patchUserLocale when user is unauthenticated', async () => {
      useAuthStore.setState({ isAuthenticated: false });
      await useI18nStore.getState().setLocale('pt-BR');

      expect(authApi.patchUserLocale).not.toHaveBeenCalled();
      expect(useI18nStore.getState().locale).toBe('pt-BR');
    });

    it('calls patchUserLocale when user is authenticated and syncBackend is true or omitted', async () => {
      vi.mocked(authApi.patchUserLocale).mockResolvedValueOnce(undefined);
      useAuthStore.setState({ isAuthenticated: true });

      await useI18nStore.getState().setLocale('pt-BR');

      expect(authApi.patchUserLocale).toHaveBeenCalledTimes(1);
      expect(authApi.patchUserLocale).toHaveBeenCalledWith('pt-BR');
      expect(useI18nStore.getState().locale).toBe('pt-BR');
    });

    it('skips patchUserLocale when syncBackend is explicitly false even if authenticated', async () => {
      useAuthStore.setState({ isAuthenticated: true });

      await useI18nStore.getState().setLocale('pt-BR', false);

      expect(authApi.patchUserLocale).not.toHaveBeenCalled();
      expect(useI18nStore.getState().locale).toBe('pt-BR');
    });

    it('handles backend sync error without throwing or crashing the store', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(authApi.patchUserLocale).mockRejectedValueOnce(new Error('Network error'));
      useAuthStore.setState({ isAuthenticated: true });

      await expect(useI18nStore.getState().setLocale('pt-BR')).resolves.not.toThrow();

      expect(authApi.patchUserLocale).toHaveBeenCalledWith('pt-BR');
      expect(useI18nStore.getState().locale).toBe('pt-BR');
      consoleSpy.mockRestore();
    });
  });

  describe('4. initFromUser', () => {
    it('syncs with server locale when authenticated user has preference', () => {
      useI18nStore.getState().initFromUser('pt-BR');
      expect(useI18nStore.getState().locale).toBe('pt-BR');
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR');
    });

    it('does not change locale or persist if serverLocale is null or undefined', () => {
      useI18nStore.setState({ locale: 'en-US' });
      useI18nStore.getState().initFromUser(null);
      expect(useI18nStore.getState().locale).toBe('en-US');

      useI18nStore.getState().initFromUser(undefined);
      expect(useI18nStore.getState().locale).toBe('en-US');
    });

    it('does not change locale if serverLocale is unsupported', () => {
      useI18nStore.setState({ locale: 'en-US' });
      useI18nStore.getState().initFromUser('es-ES');
      expect(useI18nStore.getState().locale).toBe('en-US');
    });

    it('does not call patchUserLocale during initFromUser', () => {
      useAuthStore.setState({ isAuthenticated: true });
      useI18nStore.getState().initFromUser('pt-BR');

      expect(authApi.patchUserLocale).not.toHaveBeenCalled();
      expect(useI18nStore.getState().locale).toBe('pt-BR');
    });
  });
});
