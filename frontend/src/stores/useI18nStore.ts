import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { DEFAULT_LOCALE, isValidLocale, type Locale } from '@/i18n';
import { patchUserLocale } from '@/lib/authApi';
import { useAuthStore } from './useAuthStore';

export const LOCALE_STORAGE_KEY = 'apidot_locale';

export interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale, syncBackend?: boolean) => Promise<void>;
  initFromUser: (serverLocale?: string | null) => void;
}

type PersistedState = Pick<I18nState, 'locale'>;

const customStorage: PersistStorage<PersistedState> = {
  getItem: (name: string): StorageValue<PersistedState> | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const item = localStorage.getItem(name);
      if (!item) return null;
      try {
        const parsed = JSON.parse(item);
        if (parsed && typeof parsed === 'object' && 'state' in parsed) {
          return parsed;
        }
      } catch {
        // Raw string in localStorage
      }
      return {
        state: {
          locale: isValidLocale(item) ? item : DEFAULT_LOCALE,
        },
        version: 0,
      };
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: StorageValue<PersistedState>): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const loc = value?.state?.locale;
        localStorage.setItem(name, isValidLocale(loc) ? loc : DEFAULT_LOCALE);
      }
    } catch {
      // ignore localStorage access errors
    }
  },
  removeItem: (name: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(name);
      }
    } catch {
      // ignore localStorage access errors
    }
  },
};

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,

      setLocale: async (locale: Locale, syncBackend = true) => {
        const nextLocale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;
        set({ locale: nextLocale });

        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
          }
        } catch {
          // ignore localStorage access errors
        }

        if (syncBackend !== false && useAuthStore.getState().isAuthenticated) {
          try {
            await patchUserLocale(nextLocale);
          } catch (err) {
            console.error('Failed to update locale preference on server:', err);
          }
        }
      },

      initFromUser: (serverLocale?: string | null) => {
        if (serverLocale && isValidLocale(serverLocale)) {
          set({ locale: serverLocale });
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              localStorage.setItem(LOCALE_STORAGE_KEY, serverLocale);
            }
          } catch {
            // ignore localStorage access errors
          }
        }
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      storage: customStorage,
      partialize: (state): PersistedState => ({
        locale: state.locale,
      }),
    }
  )
);
