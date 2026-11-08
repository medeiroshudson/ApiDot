import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppRoute } from './useAppRoute';
import { isDesktop } from '@/lib/desktop/runtime';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: { current: {} as Record<string, string | string[] | undefined> },
  pathname: { current: '/' },
}));

vi.mock('next/navigation', () => ({
  useParams: () => mocks.params.current,
  usePathname: () => mocks.pathname.current,
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/lib/desktop/runtime', () => ({
  isDesktop: vi.fn(() => false),
}));

const mockedIsDesktop = vi.mocked(isDesktop);

describe('useAppRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsDesktop.mockReturnValue(false);
    mocks.params.current = {};
    mocks.pathname.current = '/';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  describe('web adapter', () => {
    it('derives a workspace route from the dynamic params', () => {
      mocks.params.current = { workspaceId: 'ws-1' };

      const { result } = renderHook(() => useAppRoute());

      expect(result.current.route).toEqual({ kind: 'workspace', workspaceId: 'ws-1' });
    });

    it('derives a request route from the dynamic params', () => {
      mocks.params.current = { workspaceId: 'ws-1', requestId: 'req-1' };

      const { result } = renderHook(() => useAppRoute());

      expect(result.current.route).toEqual({
        kind: 'request',
        workspaceId: 'ws-1',
        requestId: 'req-1',
      });
    });

    it('uses the first value when a param is an array', () => {
      mocks.params.current = { workspaceId: ['ws-1', 'nested'] };

      const { result } = renderHook(() => useAppRoute());

      expect(result.current.route).toEqual({ kind: 'workspace', workspaceId: 'ws-1' });
    });

    it('falls back to the pathname when params are empty', () => {
      mocks.pathname.current = '/workspace/ws-9/request/req-9';

      const { result } = renderHook(() => useAppRoute());

      expect(result.current.route).toEqual({
        kind: 'request',
        workspaceId: 'ws-9',
        requestId: 'req-9',
      });
    });

    it('resolves to home on the root path', () => {
      const { result } = renderHook(() => useAppRoute());

      expect(result.current.route).toEqual({ kind: 'home' });
    });

    it('navigates with router.push and the web path', () => {
      mocks.params.current = { workspaceId: 'ws-1' };

      const { result } = renderHook(() => useAppRoute());

      act(() => {
        result.current.navigate({ kind: 'request', workspaceId: 'ws-1', requestId: 'req-2' });
      });

      expect(mocks.push).toHaveBeenCalledWith('/workspace/ws-1/request/req-2');
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(window.location.hash).toBe('');
    });

    it('navigates with router.replace when replace is requested', () => {
      const { result } = renderHook(() => useAppRoute());

      act(() => {
        result.current.navigate({ kind: 'workspace', workspaceId: 'ws 2' }, { replace: true });
      });

      expect(mocks.replace).toHaveBeenCalledWith('/workspace/ws%202');
      expect(mocks.push).not.toHaveBeenCalled();
    });
  });

  describe('desktop adapter', () => {
    beforeEach(() => {
      mockedIsDesktop.mockReturnValue(true);
    });

    it('initialises the route from the current hash', () => {
      window.history.replaceState(null, '', '/#/workspace/ws-d/request/req-d');

      const { result } = renderHook(() => useAppRoute());

      expect(result.current.route).toEqual({
        kind: 'request',
        workspaceId: 'ws-d',
        requestId: 'req-d',
      });
    });

    it('resolves to home when there is no hash', () => {
      const { result } = renderHook(() => useAppRoute());

      expect(result.current.route).toEqual({ kind: 'home' });
    });

    it('ignores the Next.js params on desktop', () => {
      mocks.params.current = { workspaceId: 'ws-web' };
      window.history.replaceState(null, '', '/#/workspace/ws-desktop');

      const { result } = renderHook(() => useAppRoute());

      expect(result.current.route).toEqual({ kind: 'workspace', workspaceId: 'ws-desktop' });
    });

    it('reacts to hashchange events', () => {
      const { result } = renderHook(() => useAppRoute());

      act(() => {
        window.location.hash = '#/workspace/ws-live';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });

      expect(result.current.route).toEqual({ kind: 'workspace', workspaceId: 'ws-live' });
    });

    it('ignores malformed hashes by resolving to home', () => {
      window.history.replaceState(null, '', '/#/workspace/%E0%A4%A');

      const { result } = renderHook(() => useAppRoute());

      expect(result.current.route).toEqual({ kind: 'home' });
    });

    it('sets the hash without using the Next.js router', () => {
      const { result } = renderHook(() => useAppRoute());

      act(() => {
        result.current.navigate({ kind: 'request', workspaceId: 'ws-1', requestId: 'req-2' });
      });

      expect(window.location.hash).toBe('#/workspace/ws-1/request/req-2');
      expect(result.current.route).toEqual({
        kind: 'request',
        workspaceId: 'ws-1',
        requestId: 'req-2',
      });
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it('replaces the history entry when replace is requested', () => {
      const { result } = renderHook(() => useAppRoute());
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      act(() => {
        result.current.navigate({ kind: 'workspace', workspaceId: 'ws-3' }, { replace: true });
      });

      expect(replaceStateSpy).toHaveBeenCalled();
      expect(window.location.hash).toBe('#/workspace/ws-3');
    });

    it('keeps every hook instance in sync after a desktop navigation', () => {
      const first = renderHook(() => useAppRoute());
      const second = renderHook(() => useAppRoute());

      act(() => {
        first.result.current.navigate({ kind: 'workspace', workspaceId: 'ws-shared' });
      });

      expect(window.location.hash).toBe('#/workspace/ws-shared');
      expect(second.result.current.route).toEqual({ kind: 'workspace', workspaceId: 'ws-shared' });
    });

    it('returns to the hash form of home', () => {
      window.history.replaceState(null, '', '/#/workspace/ws-1');

      const { result } = renderHook(() => useAppRoute());

      act(() => {
        result.current.navigate({ kind: 'home' });
      });

      expect(window.location.hash).toBe('#/');
      expect(result.current.route).toEqual({ kind: 'home' });
    });
  });
});
