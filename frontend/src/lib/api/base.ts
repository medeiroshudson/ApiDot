/**
 * API base URL compiled into the webview.
 *
 * This is a build input, not a setting: a release build cannot be pointed at
 * another host. The desktop bundle is served from `tauri://localhost`, so
 * relative `/api/...` requests cannot reach a server and the base must be
 * absolute. The web build leaves it empty and keeps same-origin relative
 * requests, which is what the Next server in front of it expects.
 */

const BUILD_API_BASE = process.env.NEXT_PUBLIC_APIDOT_API_BASE;

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

const API_BASE = normalizeApiBase(BUILD_API_BASE);

/** The base compiled into this bundle; empty means same-origin relative URLs. */
export function getApiBase(): string {
  return API_BASE;
}

/**
 * Resolves an API path against the build base. Without a base the path is
 * returned untouched so the web build keeps its relative request semantics.
 */
export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}
