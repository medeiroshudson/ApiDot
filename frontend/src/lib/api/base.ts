/**
 * Runtime API base URL for the webview.
 *
 * The desktop build is served from `tauri://localhost`, so relative `/api/...`
 * requests cannot reach the server. The origin is configurable at runtime and
 * mirrored to localStorage; an empty base keeps the web behaviour unchanged.
 *
 * The value itself lives in the session store; this module keeps the existing
 * facade so callers do not depend on the store layout.
 */

import { sessionStore } from '@/lib/session/state';

export const API_BASE_STORAGE_KEY = 'apidot_api_base';

/**
 * Normalizes a configured base URL: trims whitespace, drops trailing slashes
 * and keeps only absolute http(s) URLs. Anything else becomes an empty string,
 * which means "use relative URLs" (the web default).
 */
export function normalizeApiBase(value: string | null | undefined): string {
  if (!value) return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
  } catch {
    return '';
  }

  return trimmed.replace(/\/+$/, '');
}

export function getApiBase(): string {
  return sessionStore.getState().baseUrl;
}

/**
 * Sets the in-memory base and mirrors it to localStorage when available.
 * Storage failures (private mode, quota, SSR) are ignored on purpose.
 */
export function setApiBase(value: string | null | undefined): void {
  const normalized = normalizeApiBase(value);
  sessionStore.getState().setBaseUrl(normalized);

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
  } catch {
    // Storage is best effort; the in-memory value still applies.
  }
}

/**
 * Resolves an API path against the configured base. Without a base the path is
 * returned untouched so the web build keeps its relative request semantics.
 */
export function apiUrl(path: string): string {
  const base = getApiBase();
  if (!base) return path;
  return `${base}${path}`;
}
