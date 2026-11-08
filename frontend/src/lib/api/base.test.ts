import { describe, it, expect, beforeEach } from 'vitest';
import {
  API_BASE_STORAGE_KEY,
  normalizeApiBase,
  getApiBase,
  setApiBase,
  apiUrl,
} from './base';

describe('api base', () => {
  beforeEach(() => {
    localStorage.clear();
    setApiBase(null);
  });

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

  describe('getApiBase / setApiBase', () => {
    it('starts empty and persists the normalized value', () => {
      expect(getApiBase()).toBe('');

      setApiBase(' https://apidot.example.com/ ');

      expect(getApiBase()).toBe('https://apidot.example.com');
      expect(localStorage.getItem(API_BASE_STORAGE_KEY)).toBe('https://apidot.example.com');
    });

    it('clears the stored value for an invalid base', () => {
      setApiBase('https://apidot.example.com');
      setApiBase('not-a-url');

      expect(getApiBase()).toBe('');
      expect(localStorage.getItem(API_BASE_STORAGE_KEY)).toBe('');
    });
  });

  describe('apiUrl', () => {
    it('returns the path unchanged without a base', () => {
      expect(apiUrl('/api/workspaces')).toBe('/api/workspaces');
    });

    it('prefixes the configured base', () => {
      setApiBase('https://apidot.example.com/');
      expect(apiUrl('/api/workspaces')).toBe('https://apidot.example.com/api/workspaces');
    });
  });
});
