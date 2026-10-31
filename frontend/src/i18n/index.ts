import enUS from './locales/en-US';
import ptBR from './locales/pt-BR';
import type { Locale, TranslationKey, TranslationSchema, InterpolationParams } from './types';

export type { Locale, TranslationKey, TranslationSchema, InterpolationParams };

export const DEFAULT_LOCALE: Locale = 'en-US';
export const SUPPORTED_LOCALES: readonly Locale[] = ['en-US', 'pt-BR'] as const;

const dictionaries: Record<Locale, Record<string, unknown>> = {
  'en-US': enUS,
  'pt-BR': ptBR,
};

export function getSupportedLocales(): readonly Locale[] {
  return SUPPORTED_LOCALES;
}

export function isValidLocale(locale: string | null | undefined): locale is Locale {
  if (!locale) return false;
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, paramKey) => {
    const val = Object.prototype.hasOwnProperty.call(params, paramKey)
      ? params[paramKey]
      : undefined;
    if (val !== undefined && val !== null) {
      return String(val);
    }
    return match;
  });
}

export function translate(
  locale: Locale | string,
  key: TranslationKey | string,
  params?: InterpolationParams
): string {
  if (!key || typeof key !== 'string') return '';

  const activeLocale: Locale = isValidLocale(locale) ? locale : DEFAULT_LOCALE;
  const activeDict = dictionaries[activeLocale];

  let rawValue = getNestedValue(activeDict, key);

  // If missing or not a string in active locale, fall back to en-US
  if (typeof rawValue !== 'string' && activeLocale !== DEFAULT_LOCALE) {
    rawValue = getNestedValue(dictionaries[DEFAULT_LOCALE], key);
  }

  // If still missing or not a string, return the key itself
  if (typeof rawValue !== 'string') {
    return key;
  }

  return interpolate(rawValue, params);
}

export { useTranslation } from '@/hooks/useTranslation';
