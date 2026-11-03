export interface SidecarInfo {
  port: number;
  secret: string;
}

let cachedSidecarInfo: SidecarInfo | null = null;

/**
 * Checks whether the application is running inside a Tauri desktop environment.
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
}

/**
 * Manually sets the cached sidecar info (useful for initialization or testing).
 */
export function setCachedSidecarInfo(info: SidecarInfo | null): void {
  cachedSidecarInfo = info;
}

/**
 * Clears the cached sidecar info.
 */
export function clearSidecarInfoCache(): void {
  cachedSidecarInfo = null;
}

/**
 * Returns currently cached sidecar info, if available.
 */
export function getCachedSidecarInfo(): SidecarInfo | null {
  return cachedSidecarInfo;
}

/**
 * Retrieves sidecar connection details (port and ephemeral secret).
 * Returns the cached info if available, otherwise invokes Tauri IPC `get_sidecar_info`.
 */
export async function getSidecarInfo(): Promise<SidecarInfo> {
  if (cachedSidecarInfo) {
    return cachedSidecarInfo;
  }

  if (typeof window === 'undefined') {
    throw new Error('getSidecarInfo can only be called in browser/desktop environment');
  }

  const tauriInternals = (window as any).__TAURI_INTERNALS__;
  const tauriGlobal = (window as any).__TAURI__;

  let invokeFn: ((cmd: string, args?: Record<string, unknown>) => Promise<any>) | undefined;

  if (typeof tauriInternals?.invoke === 'function') {
    invokeFn = tauriInternals.invoke.bind(tauriInternals);
  } else if (typeof tauriGlobal?.core?.invoke === 'function') {
    invokeFn = tauriGlobal.core.invoke.bind(tauriGlobal.core);
  } else if (typeof tauriGlobal?.invoke === 'function') {
    invokeFn = tauriGlobal.invoke.bind(tauriGlobal);
  }

  if (!invokeFn) {
    if (!isDesktop()) {
      throw new Error('Not running in Tauri desktop environment');
    }
    throw new Error('Tauri IPC invoke is not available');
  }

  const rawInfo = await invokeFn('get_sidecar_info');
  if (!rawInfo || typeof rawInfo.port !== 'number' || typeof rawInfo.secret !== 'string') {
    throw new Error('Invalid sidecar info received from Tauri IPC');
  }

  cachedSidecarInfo = {
    port: rawInfo.port,
    secret: rawInfo.secret,
  };

  return cachedSidecarInfo;
}

/**
 * Subscribes to a Tauri desktop event if running in a desktop environment.
 * Resolves to an unlisten cleanup function.
 */
export async function listenDesktopEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  if (typeof window === 'undefined' || !isDesktop()) {
    return () => {};
  }

  const tauriInternals = (window as any).__TAURI_INTERNALS__;
  const tauriGlobal = (window as any).__TAURI__;

  let listenFn: ((eventName: string, cb: (e: any) => void) => Promise<any> | any) | undefined;

  if (typeof tauriGlobal?.event?.listen === 'function') {
    listenFn = tauriGlobal.event.listen.bind(tauriGlobal.event);
  } else if (typeof tauriGlobal?.listen === 'function') {
    listenFn = tauriGlobal.listen.bind(tauriGlobal);
  } else if (typeof tauriInternals?.event?.listen === 'function') {
    listenFn = tauriInternals.event.listen.bind(tauriInternals.event);
  } else if (typeof tauriInternals?.listen === 'function') {
    listenFn = tauriInternals.listen.bind(tauriInternals);
  }

  let unlistenTauri: (() => void) | undefined;

  if (listenFn) {
    try {
      const rawUnlisten = await listenFn(event, (eventObj: any) => {
        const payload =
          eventObj && typeof eventObj === 'object' && 'payload' in eventObj
            ? eventObj.payload
            : eventObj;
        handler(payload as T);
      });
      if (typeof rawUnlisten === 'function') {
        unlistenTauri = rawUnlisten;
      }
    } catch (err) {
      console.error(`Failed to register desktop event listener for "${event}":`, err);
    }
  }

  const windowListener = (customEv: Event) => {
    const detail = (customEv as CustomEvent).detail;
    handler(detail as T);
  };
  window.addEventListener(event, windowListener);

  return () => {
    if (unlistenTauri) {
      unlistenTauri();
    }
    window.removeEventListener(event, windowListener);
  };
}
