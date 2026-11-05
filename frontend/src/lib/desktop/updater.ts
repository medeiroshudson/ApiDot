import { isDesktop } from '@/lib/desktop/runtime';
import type { CheckOptions, DownloadEvent, Update } from '@tauri-apps/plugin-updater';

export interface DesktopUpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

export type UpdateMetadata = DesktopUpdateInfo;

export interface UpdateProgress {
  chunkLength: number;
  contentLength?: number;
  downloadedBytes: number;
  percent: number;
}

let activeUpdate: Update | null = null;

export function getActiveUpdate(): Update | null {
  return activeUpdate;
}

export function setActiveUpdate(update: Update | null): void {
  activeUpdate = update;
}

export function clearActiveUpdate(): void {
  activeUpdate = null;
}

/**
 * Checks for application updates using the Tauri updater plugin.
 * Returns null immediately if running outside the Tauri desktop environment.
 */
export async function checkDesktopUpdate(
  options?: CheckOptions
): Promise<DesktopUpdateInfo | null> {
  if (!isDesktop()) {
    return null;
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check(options);

    if (!update || update.available === false) {
      activeUpdate = null;
      return null;
    }

    activeUpdate = update;

    return {
      version: update.version || '',
      currentVersion: update.currentVersion || '',
      body: update.body ?? undefined,
      date: update.date ?? undefined,
    };
  } catch (err: unknown) {
    activeUpdate = null;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message || 'Failed to check for desktop update');
  }
}

/**
 * Downloads and installs the active update.
 * In non-desktop environments, this resolves safely as a no-op.
 * Invokes the onProgress callback with download statistics and percent completion.
 */
export async function downloadAndInstallUpdate(
  onProgress?: (progress: UpdateProgress) => void
): Promise<void> {
  if (!isDesktop()) {
    return;
  }

  if (!activeUpdate) {
    throw new Error('No active update available to download and install');
  }

  try {
    let contentLength: number | undefined = undefined;
    let downloadedBytes = 0;

    await activeUpdate.downloadAndInstall((event: DownloadEvent) => {
      if (!event || !onProgress) {
        return;
      }

      if (event.event === 'Started') {
        contentLength = event.data?.contentLength;
        downloadedBytes = 0;
        const percent = contentLength && contentLength > 0
          ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
          : 0;

        onProgress({
          chunkLength: 0,
          contentLength,
          downloadedBytes,
          percent,
        });
      } else if (event.event === 'Progress') {
        const chunk = event.data?.chunkLength ?? 0;
        downloadedBytes += chunk;
        const percent = contentLength && contentLength > 0
          ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
          : 0;

        onProgress({
          chunkLength: chunk,
          contentLength,
          downloadedBytes,
          percent,
        });
      } else if (event.event === 'Finished') {
        if (contentLength !== undefined && contentLength > 0) {
          downloadedBytes = contentLength;
        }
        onProgress({
          chunkLength: 0,
          contentLength,
          downloadedBytes,
          percent: 100,
        });
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message || 'Failed to download and install update');
  }
}

/**
 * Restarts the desktop application cleanly.
 * Invokes the Tauri IPC command 'restart_app_cleanly' to guarantee that
 * the ApiDot.Agent sidecar child process is stopped before the application restarts.
 * In non-desktop environments, this resolves safely as a no-op.
 */
export async function relaunchAppCleanly(): Promise<void> {
  if (!isDesktop()) {
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  const tauriInternals = (window as any).__TAURI_INTERNALS__;
  const tauriGlobal = (window as any).__TAURI__;

  let invokeFn: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | undefined;

  if (typeof tauriInternals?.invoke === 'function') {
    invokeFn = tauriInternals.invoke.bind(tauriInternals);
  } else if (typeof tauriGlobal?.core?.invoke === 'function') {
    invokeFn = tauriGlobal.core.invoke.bind(tauriGlobal.core);
  } else if (typeof tauriGlobal?.invoke === 'function') {
    invokeFn = tauriGlobal.invoke.bind(tauriGlobal);
  }

  if (!invokeFn) {
    throw new Error('Tauri IPC invoke is not available');
  }

  try {
    await invokeFn('restart_app_cleanly');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message || 'Failed to restart application cleanly');
  }
}
