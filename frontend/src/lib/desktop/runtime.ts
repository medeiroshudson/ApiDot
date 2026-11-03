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
