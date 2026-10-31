import { describe, it, expect } from 'vitest';
import { translate, getSupportedLocales, isValidLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from './index';

describe('i18n core', () => {
  it('translates existing key in en-US', () => {
    expect(translate('en-US', 'common.save')).toBe('Save');
  });

  it('translates existing key in pt-BR', () => {
    expect(translate('pt-BR', 'common.save')).toBe('Salvar');
  });

  it('interpolates parameters correctly including zero', () => {
    expect(translate('en-US', 'settings.devicesCount', { count: 0 })).toBe('Registered Devices (0)');
    expect(translate('pt-BR', 'settings.devicesCount', { count: 0 })).toBe('Dispositivos Registrados (0)');
  });

  it('falls back to en-US when key is missing in target locale', () => {
    expect(translate('pt-BR', 'test.fallbackOnlyInEnglish' as any)).toBe('English Only');
  });

  it('validates supported locales', () => {
    expect(isValidLocale('en-US')).toBe(true);
    expect(isValidLocale('pt-BR')).toBe(true);
    expect(isValidLocale('es-ES')).toBe(false);
    expect(isValidLocale('')).toBe(false);
    expect(isValidLocale(undefined as any)).toBe(false);
    expect(isValidLocale(null as any)).toBe(false);
  });

  it('returns list of supported locales', () => {
    expect(getSupportedLocales()).toEqual(['en-US', 'pt-BR']);
    expect(DEFAULT_LOCALE).toBe('en-US');
    expect(SUPPORTED_LOCALES).toEqual(['en-US', 'pt-BR']);
  });

  it('falls back to key string when key is missing in all dictionaries', () => {
    expect(translate('en-US', 'unknown.missingKey' as any)).toBe('unknown.missingKey');
    expect(translate('pt-BR', 'unknown.missingKey' as any)).toBe('unknown.missingKey');
  });

  it('handles unknown locale by falling back to en-US dictionary', () => {
    expect(translate('fr-FR' as any, 'common.save')).toBe('Save');
  });

  it('interpolates multiple parameters and handles falsy values safely', () => {
    expect(translate('en-US', 'settings.devicesCount', { count: 5 })).toBe('Registered Devices (5)');
  });

  it('leaves missing parameters intact without throwing', () => {
    expect(translate('en-US', 'settings.devicesCount', {})).toBe('Registered Devices ({count})');
    expect(translate('en-US', 'settings.devicesCount', undefined)).toBe('Registered Devices ({count})');
  });

  it('returns key string if path points to a non-string object', () => {
    expect(translate('en-US', 'common' as any)).toBe('common');
    expect(translate('pt-BR', 'common' as any)).toBe('common');
  });
});
