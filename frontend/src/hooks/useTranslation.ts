import { useCallback } from 'react';
import { useI18nStore } from '@/stores/useI18nStore';
import {
  translate,
  type InterpolationParams,
  type Locale,
  type TranslationKey,
} from '@/i18n';

export interface UseTranslationReturn {
  t: (key: TranslationKey | string, params?: InterpolationParams) => string;
  locale: Locale;
  setLocale: (locale: Locale, syncBackend?: boolean) => Promise<void>;
  isLoaded: boolean;
}

export function useTranslation(): UseTranslationReturn {
  const locale = useI18nStore((state) => state.locale);
  const setLocale = useI18nStore((state) => state.setLocale);

  const t = useCallback(
    (key: TranslationKey | string, params?: InterpolationParams): string => {
      return translate(locale, key, params);
    },
    [locale]
  );

  return {
    t,
    locale,
    setLocale,
    isLoaded: true,
  };
}
