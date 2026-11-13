import { describe, it, expect } from 'vitest';
import { normalizeApiBase, getApiBase, apiUrl } from './base';

describe('api base', () => {
  describe('normalizeApiBase', () => {
    it('keeps absolute http(s) URLs', () => {
      expect(normalizeApiBase('https://apidot.example.com')).toBe('https://apidot.example.com');
      expect(normalizeApiBase('http://localhost:8080')).toBe('http://localhost:8080');
    });

    it('trims whitespace and strips trailing slashes', () => {
      expect(normalizeApiBase('  https://apidot.example.com/  ')).toBe('https://apidot.example.com');
      expect(normalizeApiBase('https://apidot.example.com/base///')).toBe(
        'https://apidot.example.com/base'
      );
    });

    it('rejects relative, non-http and empty values', () => {
      expect(normalizeApiBase('')).toBe('');
      expect(normalizeApiBase('   ')).toBe('');
      expect(normalizeApiBase(null)).toBe('');
      expect(normalizeApiBase(undefined)).toBe('');
      expect(normalizeApiBase('apidot.example.com')).toBe('');
      expect(normalizeApiBase('/api')).toBe('');
      expect(normalizeApiBase('ftp://apidot.example.com')).toBe('');
      expect(normalizeApiBase('javascript:alert(1)')).toBe('');
    });
  });

  describe('getApiBase', () => {
    it('is empty when the build has no base, so the web stays relative', () => {
      expect(getApiBase()).toBe('');
      expect(apiUrl('/api/workspaces')).toBe('/api/workspaces');
    });
  });
});
