import { describe, it, expect } from 'vitest';
import {
  AppRoute,
  parseDeepLink,
  parseHashRoute,
  parsePathRoute,
  toDeepLink,
  toHash,
  toPath,
} from './route';

const HOME: AppRoute = { kind: 'home' };
const WORKSPACE: AppRoute = { kind: 'workspace', workspaceId: 'ws-1' };
const REQUEST: AppRoute = { kind: 'request', workspaceId: 'ws-1', requestId: 'req-1' };

describe('route model', () => {
  describe('toPath', () => {
    it('serialises every route kind', () => {
      expect(toPath(HOME)).toBe('/');
      expect(toPath(WORKSPACE)).toBe('/workspace/ws-1');
      expect(toPath(REQUEST)).toBe('/workspace/ws-1/request/req-1');
    });

    it('encodes ids', () => {
      const route: AppRoute = {
        kind: 'request',
        workspaceId: 'my workspace',
        requestId: 'a&b/c?',
      };
      expect(toPath(route)).toBe('/workspace/my%20workspace/request/a%26b%2Fc%3F');
    });
  });

  describe('toHash', () => {
    it('serialises every route kind with a leading hash', () => {
      expect(toHash(HOME)).toBe('#/');
      expect(toHash(WORKSPACE)).toBe('#/workspace/ws-1');
      expect(toHash(REQUEST)).toBe('#/workspace/ws-1/request/req-1');
    });
  });

  describe('toDeepLink', () => {
    it('serialises every route kind', () => {
      expect(toDeepLink(HOME)).toBe('apidot://open');
      expect(toDeepLink(WORKSPACE)).toBe('apidot://workspace/ws-1');
      expect(toDeepLink(REQUEST)).toBe('apidot://workspace/ws-1/request/req-1');
    });

    it('encodes ids', () => {
      const route: AppRoute = {
        kind: 'request',
        workspaceId: 'my workspace',
        requestId: 'a&b/c?',
      };
      expect(toDeepLink(route)).toBe(
        'apidot://workspace/my%20workspace/request/a%26b%2Fc%3F'
      );
      expect(toDeepLink({ kind: 'workspace', workspaceId: 'espaço ção' })).toBe(
        'apidot://workspace/espac%CC%A7o%20%C3%A7%C3%A3o'
      );
    });

    it('round-trips through parseDeepLink for resumable routes', () => {
      const routes: AppRoute[] = [
        WORKSPACE,
        REQUEST,
        { kind: 'workspace', workspaceId: 'my workspace' },
        { kind: 'request', workspaceId: 'a b', requestId: 'x_y' },
        { kind: 'request', workspaceId: 'ws%2Fraw', requestId: 'req%20space' },
      ];

      for (const route of routes) {
        expect(parseDeepLink(toDeepLink(route))).toEqual(route);
      }
    });

    it('serialises home as the bare app opener', () => {
      // `apidot://open` carries no destination: parseDeepLink treats it as a
      // plain launch and returns null, so home is intentionally not resumable.
      expect(toDeepLink(HOME)).toBe('apidot://open');
      expect(parseDeepLink(toDeepLink(HOME))).toBeNull();
    });
  });

  describe('round-trips', () => {
    const routes: AppRoute[] = [
      HOME,
      WORKSPACE,
      REQUEST,
      { kind: 'workspace', workspaceId: 'espaço ção' },
      { kind: 'request', workspaceId: 'a b', requestId: 'x_y' },
      { kind: 'request', workspaceId: 'ws%2Fraw', requestId: 'req%20space' },
    ];

    it.each(routes)('toPath -> parsePathRoute for %j', (route) => {
      expect(parsePathRoute(toPath(route))).toEqual(route);
    });

    it.each(routes)('toHash -> parseHashRoute for %j', (route) => {
      expect(parseHashRoute(toHash(route))).toEqual(route);
    });
  });

  describe('parsePathRoute', () => {
    it('parses the known routes', () => {
      expect(parsePathRoute('/')).toEqual(HOME);
      expect(parsePathRoute('')).toEqual(HOME);
      expect(parsePathRoute('/workspace/ws-1')).toEqual(WORKSPACE);
      expect(parsePathRoute('/workspace/ws-1/request/req-1')).toEqual(REQUEST);
    });

    it('URL-decodes ids', () => {
      expect(parsePathRoute('/workspace/my%20workspace')).toEqual({
        kind: 'workspace',
        workspaceId: 'my workspace',
      });
      expect(parsePathRoute('/workspace/a%26b/request/c%3Fd')).toEqual({
        kind: 'request',
        workspaceId: 'a&b',
        requestId: 'c?d',
      });
    });

    it('tolerates trailing slashes', () => {
      expect(parsePathRoute('/workspace/ws-1/')).toEqual(WORKSPACE);
      expect(parsePathRoute('/workspace/ws-1/request/req-1//')).toEqual(REQUEST);
      expect(parsePathRoute('//')).toEqual(HOME);
    });

    it('ignores query strings and fragments', () => {
      expect(parsePathRoute('/workspace/ws-1?tab=tree')).toEqual(WORKSPACE);
      expect(parsePathRoute('/workspace/ws-1/request/req-1#response')).toEqual(REQUEST);
    });

    it('returns home for unknown or malformed paths', () => {
      expect(parsePathRoute('/unknown')).toEqual(HOME);
      expect(parsePathRoute('/workspace')).toEqual(HOME);
      expect(parsePathRoute('/workspace/')).toEqual(HOME);
      expect(parsePathRoute('/workspace/ws-1/request')).toEqual(HOME);
      expect(parsePathRoute('/workspace/ws-1/request/')).toEqual(HOME);
      expect(parsePathRoute('/workspace/ws-1/other/req-1')).toEqual(HOME);
      expect(parsePathRoute('/workspace/ws-1/request/req-1/extra')).toEqual(HOME);
    });

    it('rejects empty ids and ids containing a slash', () => {
      expect(parsePathRoute('/workspace//')).toEqual(HOME);
      expect(parsePathRoute('/workspace/%2F')).toEqual(HOME);
      expect(parsePathRoute('/workspace/ws-1/request/%2F')).toEqual(HOME);
      expect(parsePathRoute('/workspace//request/req-1')).toEqual(HOME);
    });

    it('never throws on malformed percent-encoding', () => {
      expect(parsePathRoute('/workspace/%E0%A4%A')).toEqual(HOME);
      expect(parsePathRoute('/workspace/%')).toEqual(HOME);
    });
  });

  describe('parseHashRoute', () => {
    it('parses hashes with and without the leading "#"', () => {
      expect(parseHashRoute('#/')).toEqual(HOME);
      expect(parseHashRoute('#')).toEqual(HOME);
      expect(parseHashRoute('')).toEqual(HOME);
      expect(parseHashRoute('#/workspace/ws-1')).toEqual(WORKSPACE);
      expect(parseHashRoute('/workspace/ws-1')).toEqual(WORKSPACE);
      expect(parseHashRoute('#/workspace/ws-1/request/req-1')).toEqual(REQUEST);
    });

    it('decodes ids and returns home for unknown hashes', () => {
      expect(parseHashRoute('#/workspace/ws%20one')).toEqual({
        kind: 'workspace',
        workspaceId: 'ws one',
      });
      expect(parseHashRoute('#/nope')).toEqual(HOME);
    });
  });

  describe('parseDeepLink', () => {
    it('parses the direct deep-link form', () => {
      expect(parseDeepLink('apidot://workspace/ws-1')).toEqual(WORKSPACE);
      expect(parseDeepLink('apidot://workspace/ws-1/request/req-1')).toEqual(REQUEST);
    });

    it('parses the query (?path=) form', () => {
      expect(parseDeepLink('apidot://open?path=/workspace/ws-1')).toEqual(WORKSPACE);
      expect(parseDeepLink('apidot://open?path=/workspace/ws-1/request/req-1')).toEqual(REQUEST);
      expect(parseDeepLink('apidot://open?path=%2Fworkspace%2Fws-1%2Frequest%2Freq-1')).toEqual(
        REQUEST
      );
    });

    it('decodes ids coming from the deep link', () => {
      expect(parseDeepLink('apidot://workspace/my%20workspace')).toEqual({
        kind: 'workspace',
        workspaceId: 'my workspace',
      });
    });

    it('returns null for non-apidot URLs', () => {
      expect(parseDeepLink('https://example.com/workspace/ws-1')).toBeNull();
      expect(parseDeepLink('/workspace/ws-1')).toBeNull();
      expect(parseDeepLink('not a url')).toBeNull();
      expect(parseDeepLink('')).toBeNull();
    });

    it('returns null for unparsable deep links', () => {
      expect(parseDeepLink('apidot://')).toBeNull();
      expect(parseDeepLink('apidot://open')).toBeNull();
      expect(parseDeepLink('apidot://open?path=')).toBeNull();
      expect(parseDeepLink('apidot://workspace/%E0%A4%A')).toBeNull();
    });

    it('falls back to home for unknown apidot routes', () => {
      expect(parseDeepLink('apidot://unknown')).toEqual(HOME);
      expect(parseDeepLink('apidot://open?path=/unknown')).toEqual(HOME);
    });
  });
});
