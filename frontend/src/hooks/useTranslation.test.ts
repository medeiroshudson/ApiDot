import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTranslation } from './useTranslation';
import { useI18nStore } from '@/stores/useI18nStore';

describe('useTranslation hook', () => {
  beforeEach(() => {
    localStorage.clear();
    useI18nStore.setState({ locale: 'en-US' });
  });

  it('returns default locale en-US and isLoaded true', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.locale).toBe('en-US');
    expect(result.current.isLoaded).toBe(true);
  });

  it('translates static keys for active locale', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.t('common.save')).toBe('Save');
    expect(result.current.t('sidebar.workspace')).toBe('Workspace');
  });

  it('interpolates parameters into translations', () => {
    const { result } = renderHook(() => useTranslation());

    expect(
      result.current.t('settings.devicesCount', { count: 3 })
    ).toBe('Registered Devices (3)');
  });

  it('reactively updates translations when setLocale is called', async () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.locale).toBe('en-US');
    expect(result.current.t('common.save')).toBe('Save');

    await act(async () => {
      await result.current.setLocale('pt-BR', false);
    });

    expect(result.current.locale).toBe('pt-BR');
    expect(result.current.t('common.save')).toBe('Salvar');
  });

  it('falls back to key string when translation key does not exist', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.t('nonexistent.key')).toBe('nonexistent.key');
  });
});
