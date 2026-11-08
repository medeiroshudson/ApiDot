import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepLinkBridge } from './DeepLinkBridge';
import { useAuthStore } from '@/stores/useAuthStore';

const mocks = vi.hoisted(() => ({
  initDeepLinks: vi.fn(),
  navigate: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/lib/desktop/deepLink', () => ({
  initDeepLinks: mocks.initDeepLinks,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock('@/hooks/useAppRoute', () => ({
  useAppRoute: () => ({ route: { kind: 'home' as const }, navigate: mocks.navigate }),
}));

type UrlHandler = (url: string) => void;

/**
 * Makes `initDeepLinks` expose the handler it was given so tests can emit
 * URLs synchronously, and returns the unlisten spy it resolves with.
 */
function captureHandler(): { unlisten: ReturnType<typeof vi.fn>; handler: () => UrlHandler } {
  const unlisten = vi.fn();
  let onUrl: UrlHandler | null = null;

  mocks.initDeepLinks.mockImplementation(async (handler: UrlHandler) => {
    onUrl = handler;
    return unlisten;
  });

  return {
    unlisten,
    handler: () => {
      if (!onUrl) {
        throw new Error('initDeepLinks was not called with a handler');
      }
      return onUrl;
    },
  };
}

describe('DeepLinkBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().reset();
    mocks.initDeepLinks.mockResolvedValue(() => {});
  });

  afterEach(() => {
    useAuthStore.getState().reset();
  });

  it('navigates to the hash route for an authenticated desktop URL', async () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    const { handler } = captureHandler();

    render(<DeepLinkBridge />);
    await waitFor(() => expect(mocks.initDeepLinks).toHaveBeenCalledTimes(1));

    act(() => {
      handler()('apidot://workspace/ws-1/request/req-1');
    });

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith({
      kind: 'request',
      workspaceId: 'ws-1',
      requestId: 'req-1',
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().pendingRoute).toBeNull();
  });

  it('stores the pending route and redirects to /login when unauthenticated', async () => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: false });
    const { handler } = captureHandler();

    render(<DeepLinkBridge />);
    await waitFor(() => expect(mocks.initDeepLinks).toHaveBeenCalledTimes(1));

    act(() => {
      handler()('apidot://workspace/ws-1');
    });

    expect(useAuthStore.getState().pendingRoute).toEqual({
      kind: 'workspace',
      workspaceId: 'ws-1',
    });
    expect(mocks.replace).toHaveBeenCalledWith('/login');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('ignores invalid URLs and bare app launches', async () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    const { handler } = captureHandler();

    render(<DeepLinkBridge />);
    await waitFor(() => expect(mocks.initDeepLinks).toHaveBeenCalledTimes(1));

    act(() => {
      handler()('https://example.com/workspace/ws-1');
      handler()('not a url');
      handler()('apidot://');
      handler()('apidot://unknown');
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().pendingRoute).toBeNull();
  });

  it('calls the unlisten returned by initDeepLinks on cleanup', async () => {
    const { unlisten } = captureHandler();

    const { unmount } = render(<DeepLinkBridge />);
    await waitFor(() => expect(mocks.initDeepLinks).toHaveBeenCalledTimes(1));

    unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes when initDeepLinks resolves after the effect was cleaned up', async () => {
    const unlisten = vi.fn();
    let resolveInit: ((cleanup: () => void) => void) | null = null;

    mocks.initDeepLinks.mockImplementation(
      () =>
        new Promise<() => void>((resolve) => {
          resolveInit = resolve;
        })
    );

    const { unmount } = render(<DeepLinkBridge />);
    unmount();

    await act(async () => {
      resolveInit?.(unlisten);
      await Promise.resolve();
    });

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('drops URLs that arrive after the effect was cleaned up', async () => {
    const { handler } = captureHandler();

    const { unmount } = render(<DeepLinkBridge />);
    await waitFor(() => expect(mocks.initDeepLinks).toHaveBeenCalledTimes(1));

    unmount();

    act(() => {
      handler()('apidot://workspace/ws-1');
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
