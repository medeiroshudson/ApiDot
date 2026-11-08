import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as runtime from './runtime';
import { initDeepLinks } from './deepLink';

const mockGetCurrent = vi.fn();
const mockOnOpenUrl = vi.fn();

function mockDeepLinkPlugin(): void {
  vi.doMock('@tauri-apps/plugin-deep-link', () => ({
    getCurrent: (...args: unknown[]) => mockGetCurrent(...args),
    onOpenUrl: (...args: unknown[]) => mockOnOpenUrl(...args),
  }));
}

describe('desktop deep-link bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeepLinkPlugin();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetCurrent.mockResolvedValue(null);
    mockOnOpenUrl.mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op outside the desktop environment', async () => {
    vi.spyOn(runtime, 'isDesktop').mockReturnValue(false);
    const onUrl = vi.fn();

    const unlisten = await initDeepLinks(onUrl);

    expect(mockGetCurrent).not.toHaveBeenCalled();
    expect(mockOnOpenUrl).not.toHaveBeenCalled();
    expect(onUrl).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });

  it('forwards URLs the app was launched with and URLs received while running', async () => {
    vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
    mockGetCurrent.mockResolvedValue(['apidot://open/request/1']);

    let subscriptionHandler: ((urls: string[]) => void) | undefined;
    mockOnOpenUrl.mockImplementation((handler: (urls: string[]) => void) => {
      subscriptionHandler = handler;
      return Promise.resolve(() => {});
    });

    const onUrl = vi.fn();
    await initDeepLinks(onUrl);

    expect(mockGetCurrent).toHaveBeenCalledTimes(1);
    expect(onUrl).toHaveBeenNthCalledWith(1, 'apidot://open/request/1');

    expect(subscriptionHandler).toBeTypeOf('function');
    subscriptionHandler!(['apidot://open/collection/2', 'apidot://open/env/3']);

    expect(onUrl).toHaveBeenCalledTimes(3);
    expect(onUrl).toHaveBeenNthCalledWith(2, 'apidot://open/collection/2');
    expect(onUrl).toHaveBeenNthCalledWith(3, 'apidot://open/env/3');
  });

  it('tolerates a null launch URL list', async () => {
    vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
    mockGetCurrent.mockResolvedValue(null);

    const onUrl = vi.fn();
    await initDeepLinks(onUrl);

    expect(onUrl).not.toHaveBeenCalled();
    expect(mockOnOpenUrl).toHaveBeenCalledTimes(1);
  });

  it('returns an unsubscribe that removes the subscription', async () => {
    vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
    const unlisten = vi.fn();
    mockOnOpenUrl.mockResolvedValue(unlisten);

    const unsubscribe = await initDeepLinks(vi.fn());
    unsubscribe();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected plugin import and keeps the app running', async () => {
    vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
    vi.resetModules();
    vi.doMock('@tauri-apps/plugin-deep-link', () => {
      throw new Error('plugin not installed');
    });

    const onUrl = vi.fn();
    const unlisten = await initDeepLinks(onUrl);

    expect(onUrl).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });

  it('swallows a failing plugin call and keeps the app running', async () => {
    vi.spyOn(runtime, 'isDesktop').mockReturnValue(true);
    mockGetCurrent.mockRejectedValue(new Error('deep-link state unavailable'));

    const unlisten = await initDeepLinks(vi.fn());

    expect(console.warn).toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });
});
