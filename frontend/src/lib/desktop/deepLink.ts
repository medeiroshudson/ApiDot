import { isDesktop } from '@/lib/desktop/runtime';

/**
 * Subscribes to deep-link URLs opened by the operating system for the
 * `apidot://` scheme.
 *
 * On desktop, URLs the application was launched with are delivered first,
 * followed by every URL received while it runs. Outside the Tauri desktop
 * environment the call is a safe no-op, and a missing or broken plugin is
 * reported as a warning instead of breaking the application.
 *
 * @param onUrl Called with each received URL, in arrival order.
 * @returns A cleanup function that removes the subscription.
 */
export async function initDeepLinks(onUrl: (url: string) => void): Promise<() => void> {
  const noop = () => {};

  if (!isDesktop()) {
    return noop;
  }

  try {
    const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');

    const current = await getCurrent();
    if (Array.isArray(current)) {
      for (const url of current) {
        onUrl(url);
      }
    }

    const unlisten = await onOpenUrl((urls) => {
      for (const url of urls) {
        onUrl(url);
      }
    });

    return typeof unlisten === 'function' ? unlisten : noop;
  } catch (err) {
    console.warn('[deep-link] Failed to initialize deep-link listener:', err);
    return noop;
  }
}
