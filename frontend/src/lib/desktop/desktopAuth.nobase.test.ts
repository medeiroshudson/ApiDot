import { describe, it, expect, vi } from 'vitest';
import { exchangeDesktopToken, startDesktopSsoFlow } from './desktopAuth';

describe('desktopAuth without a build API server', () => {
  it('refuses to open the browser and reports the misconfigured build', async () => {
    const openBrowser = vi.fn().mockResolvedValue(undefined);

    const result = await startDesktopSsoFlow({
      openBrowser,
      pollSession: vi.fn(),
      exchangeToken: vi.fn(),
      getState: vi.fn().mockResolvedValue('state-1'),
      port: 54321,
    });

    expect(result).toEqual({
      success: false,
      error: 'This build has no API server configured',
    });
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('refuses to exchange a token', async () => {
    await expect(exchangeDesktopToken('tok-1')).rejects.toThrow(
      'This build has no API server configured'
    );
  });
});
