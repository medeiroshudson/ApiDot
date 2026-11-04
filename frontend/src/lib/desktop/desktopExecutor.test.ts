import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeViaDesktopSidecar,
  decodeResponseBody,
  SIDECAR_SECRET_HEADER,
} from './desktopExecutor';
import {
  isDesktop,
  getSidecarInfo,
  setCachedSidecarInfo,
  clearSidecarInfoCache,
} from './runtime';

describe('desktopExecutor & runtime', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    clearSidecarInfoCache();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearSidecarInfoCache();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  describe('isDesktop', () => {
    it('returns false in browser environment when Tauri globals are not set', () => {
      expect(isDesktop()).toBe(false);
    });

    it('returns true when window.__TAURI_INTERNALS__ exists', () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      expect(isDesktop()).toBe(true);
    });

    it('returns true when window.__TAURI__ exists', () => {
      (window as any).__TAURI__ = { core: { invoke: vi.fn() } };
      expect(isDesktop()).toBe(true);
    });
  });

  describe('getSidecarInfo', () => {
    it('throws when called outside of Tauri desktop environment', async () => {
      await expect(getSidecarInfo()).rejects.toThrow(/not running in tauri/i);
    });

    it('calls invoke("get_sidecar_info") and caches the result', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        port: 54321,
        secret: 'test-secret-uuid',
      });
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      const info1 = await getSidecarInfo();
      expect(mockInvoke).toHaveBeenCalledWith('get_sidecar_info');
      expect(info1).toEqual({ port: 54321, secret: 'test-secret-uuid' });

      // Second call should return cached info without calling IPC again
      const info2 = await getSidecarInfo();
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(info2).toEqual({ port: 54321, secret: 'test-secret-uuid' });
    });

    it('supports manually setting and clearing cached sidecar info', async () => {
      setCachedSidecarInfo({ port: 12345, secret: 'manual-secret' });
      const info = await getSidecarInfo();
      expect(info).toEqual({ port: 12345, secret: 'manual-secret' });

      clearSidecarInfoCache();
      await expect(getSidecarInfo()).rejects.toThrow();
    });

    it('throws when invoke returns invalid payload structure', async () => {
      (window as any).__TAURI_INTERNALS__ = {
        invoke: vi.fn().mockResolvedValue({ invalid: true }),
      };
      await expect(getSidecarInfo()).rejects.toThrow(/invalid sidecar info/i);
    });
  });

  describe('executeViaDesktopSidecar', () => {
    it('dispatches request to sidecar loopback port with X-ApiDot-Sidecar-Secret header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ statusCode: 200, statusText: 'OK', body: '{"ok":true}' }),
      });
      globalThis.fetch = mockFetch;

      const result = await executeViaDesktopSidecar({
        port: 54321,
        secret: 'test-secret',
        dispatch: { method: 'GET', url: 'http://localhost:3000/api/health', headers: {} } as any,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:54321/execute',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            [SIDECAR_SECRET_HEADER]: 'test-secret',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result.statusCode).toBe(200);
      expect(result.statusText).toBe('OK');
      expect(result.body).toBe('{"ok":true}');
    });

    it('serializes dispatch with integer bodyType and without string target for Native AOT', async () => {
      let sentBody = '';
      const mockFetch = vi.fn().mockImplementation((_url: any, init: any) => {
        sentBody = init.body;
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ statusCode: 200, statusText: 'OK', body: '' }),
        });
      });
      globalThis.fetch = mockFetch;

      await executeViaDesktopSidecar({
        port: 54321,
        secret: 'test-secret',
        dispatch: {
          method: 'POST',
          url: 'http://localhost:3000/api/items',
          headers: { 'Content-Type': 'application/json' },
          bodyType: 1,
          bodyContent: '{"test":true}',
        },
      });

      const parsed = JSON.parse(sentBody);
      expect(parsed.bodyType).toBe(1);
      expect(parsed.target).toBeUndefined();
    });

    it('decodes base64-encoded response body from sidecar byte payload', async () => {
      const rawText = JSON.stringify({ message: 'Hello from sidecar!' });
      const base64Body = btoa(rawText);

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 200,
          statusText: 'OK',
          headers: { 'Content-Type': ['application/json'] },
          body: base64Body,
          timing: {
            dnsLookupMs: 1.2,
            tlsHandshakeMs: 0,
            timeToFirstByteMs: 5.4,
            contentTransferMs: 2.1,
            totalDurationMs: 8.7,
          },
        }),
      });
      globalThis.fetch = mockFetch;

      const result = await executeViaDesktopSidecar({
        port: 49152,
        secret: 'sidecar-secret',
        dispatch: { method: 'POST', url: 'https://example.com/api', headers: {} } as any,
      });

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe(rawText);
      expect(result.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(result.timing).toBeDefined();
      expect(result.timing?.dnsLookupMs).toBe(1.2);
    });

    it('handles sidecar 401 Unauthorized response gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 401,
          statusText: 'Unauthorized',
          errorMessage: 'Invalid sidecar authentication secret',
        }),
      });
      globalThis.fetch = mockFetch;

      const result = await executeViaDesktopSidecar({
        port: 54321,
        secret: 'wrong-secret',
        dispatch: { method: 'GET', url: 'http://localhost:3000/api/health' } as any,
      });

      expect(result.statusCode).toBe(401);
      expect(result.statusText).toBe('Unauthorized');
      expect(result.errorMessage).toBe('Invalid sidecar authentication secret');
    });

    it('handles plain text / non-JSON responses from sidecar', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 502,
        ok: false,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => '502 Bad Gateway',
      });
      globalThis.fetch = mockFetch;

      const result = await executeViaDesktopSidecar({
        port: 54321,
        secret: 'test-secret',
        dispatch: { method: 'GET', url: 'http://localhost:3000/api/broken' } as any,
      });

      expect(result.statusCode).toBe(502);
      expect(result.body).toBe('502 Bad Gateway');
    });

    it('validates port number range and rejects invalid port', async () => {
      await expect(
        executeViaDesktopSidecar({
          port: 0,
          secret: 'secret',
          dispatch: { method: 'GET', url: 'http://localhost' } as any,
        })
      ).rejects.toThrow(/invalid sidecar port/i);

      await expect(
        executeViaDesktopSidecar({
          port: 70000,
          secret: 'secret',
          dispatch: { method: 'GET', url: 'http://localhost' } as any,
        })
      ).rejects.toThrow(/invalid sidecar port/i);
    });

    it('propagates network error when sidecar connection fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused at 127.0.0.1:54321'));

      await expect(
        executeViaDesktopSidecar({
          port: 54321,
          secret: 'test-secret',
          dispatch: { method: 'GET', url: 'http://localhost:3000/api/health' } as any,
        })
      ).rejects.toThrow('Connection refused at 127.0.0.1:54321');
    });
  });

  describe('decodeResponseBody', () => {
    it('returns empty string for null, undefined, or empty string', () => {
      expect(decodeResponseBody(null)).toBe('');
      expect(decodeResponseBody(undefined)).toBe('');
      expect(decodeResponseBody('')).toBe('');
    });

    it('decodes base64 UTF-8 string correctly', () => {
      const original = 'Hello, Tauri sidecar!';
      const b64 = btoa(original);
      expect(decodeResponseBody(b64)).toBe(original);
    });

    it('decodes multibyte UTF-8 characters from base64 bytes', () => {
      const original = 'Ação de teste com acentuação e emojis: 🚀✨';
      // Encode as UTF-8 bytes then base64
      const utf8Bytes = new TextEncoder().encode(original);
      let binaryStr = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binaryStr += String.fromCharCode(utf8Bytes[i]);
      }
      const b64 = btoa(binaryStr);
      expect(decodeResponseBody(b64)).toBe(original);
    });

    it('falls back to raw string if input is plain text or invalid base64', () => {
      expect(decodeResponseBody('{"not":"base64"}')).toBe('{"not":"base64"}');
      expect(decodeResponseBody('plain text message')).toBe('plain text message');
    });

    it('serializes objects to JSON formatted string', () => {
      const obj = { success: true, count: 42 };
      expect(decodeResponseBody(obj)).toBe(JSON.stringify(obj, null, 2));
    });
  });
});
