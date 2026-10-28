import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('version utility', () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_VERSION;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_APP_VERSION;
    } else {
      process.env.NEXT_PUBLIC_APP_VERSION = originalEnv;
    }
  });

  describe('formatDisplayVersion', () => {
    it('returns "dev" when version is "dev" or case variant', async () => {
      const { formatDisplayVersion } = await import('./version');
      expect(formatDisplayVersion('dev')).toBe('dev');
      expect(formatDisplayVersion('DEV')).toBe('dev');
      expect(formatDisplayVersion('Dev')).toBe('dev');
    });

    it('prefixes "v" if version does not start with "v"', async () => {
      const { formatDisplayVersion } = await import('./version');
      expect(formatDisplayVersion('0.1.0')).toBe('v0.1.0');
      expect(formatDisplayVersion('1.2.3')).toBe('v1.2.3');
    });

    it('preserves version if it already starts with "v"', async () => {
      const { formatDisplayVersion } = await import('./version');
      expect(formatDisplayVersion('v0.1.0')).toBe('v0.1.0');
      expect(formatDisplayVersion('v1.0.0-rc.1')).toBe('v1.0.0-rc.1');
    });

    it('defaults to APP_VERSION when no argument is passed', async () => {
      const { formatDisplayVersion, APP_VERSION } = await import('./version');
      expect(formatDisplayVersion()).toBe(formatDisplayVersion(APP_VERSION));
    });
  });

  describe('APP_VERSION environment resolution', () => {
    it('defaults to "dev" when NEXT_PUBLIC_APP_VERSION is not set', async () => {
      vi.resetModules();
      delete process.env.NEXT_PUBLIC_APP_VERSION;
      const { APP_VERSION, formatDisplayVersion } = await import('./version');
      expect(APP_VERSION).toBe('dev');
      expect(formatDisplayVersion(APP_VERSION)).toBe('dev');
    });

    it('resolves custom version from NEXT_PUBLIC_APP_VERSION', async () => {
      vi.resetModules();
      process.env.NEXT_PUBLIC_APP_VERSION = '0.1.0';
      const { APP_VERSION, formatDisplayVersion } = await import('./version');
      expect(APP_VERSION).toBe('0.1.0');
      expect(formatDisplayVersion(APP_VERSION)).toBe('v0.1.0');
    });

    it('resolves version when NEXT_PUBLIC_APP_VERSION has v prefix', async () => {
      vi.resetModules();
      process.env.NEXT_PUBLIC_APP_VERSION = 'v0.1.0';
      const { APP_VERSION, formatDisplayVersion } = await import('./version');
      expect(APP_VERSION).toBe('v0.1.0');
      expect(formatDisplayVersion(APP_VERSION)).toBe('v0.1.0');
    });
  });
});
