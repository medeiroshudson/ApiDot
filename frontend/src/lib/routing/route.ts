/**
 * Pure route model shared by the browser router (path based) and the desktop
 * shell (hash based).
 *
 * The parsers never throw: anything that is not a well-known route resolves to
 * `{ kind: 'home' }` so callers can render a safe fallback.
 */

export type AppRoute =
  | { kind: 'home' }
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'request'; workspaceId: string; requestId: string };

const WORKSPACE_SEGMENT = 'workspace';
const REQUEST_SEGMENT = 'request';
const DEEP_LINK_PREFIX = /^apidot:\/\//i;

/**
 * URL-decodes one path segment and rejects ids that would break the route
 * grammar (empty ids or ids containing a slash).
 */
function decodeId(segment: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('/')) {
    return null;
  }
  return decoded;
}

/**
 * Splits a path-like string into segments, ignoring the query string, the
 * fragment and trailing slashes.
 */
function splitSegments(path: string): string[] {
  const withoutFragment = path.split('#')[0];
  const withoutQuery = withoutFragment.split('?')[0];
  const trimmed = withoutQuery.replace(/\/+$/, '');
  if (!trimmed) {
    return [];
  }
  const segments = trimmed.split('/');
  if (segments[0] === '') {
    segments.shift();
  }
  return segments;
}

function isDecodable(path: string): boolean {
  try {
    decodeURIComponent(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a web pathname such as `/workspace/<ws>/request/<rid>`.
 */
export function parsePathRoute(pathname: string): AppRoute {
  if (!pathname) {
    return { kind: 'home' };
  }

  const segments = splitSegments(pathname);
  if (segments.length === 0 || segments[0] !== WORKSPACE_SEGMENT) {
    return { kind: 'home' };
  }

  if (segments.length === 2) {
    const workspaceId = decodeId(segments[1]);
    return workspaceId ? { kind: 'workspace', workspaceId } : { kind: 'home' };
  }

  if (segments.length === 4 && segments[2] === REQUEST_SEGMENT) {
    const workspaceId = decodeId(segments[1]);
    const requestId = decodeId(segments[3]);
    if (workspaceId && requestId) {
      return { kind: 'request', workspaceId, requestId };
    }
  }

  return { kind: 'home' };
}

/**
 * Parses a desktop hash such as `#/workspace/<ws>/request/<rid>`.
 */
export function parseHashRoute(hash: string): AppRoute {
  if (!hash) {
    return { kind: 'home' };
  }
  const path = hash.startsWith('#') ? hash.slice(1) : hash;
  return parsePathRoute(path);
}

/**
 * Parses an OS deep link. Supported forms:
 *   apidot://workspace/<ws>/request/<rid>
 *   apidot://open?path=/workspace/<ws>/request/<rid>
 *
 * Returns null for a non `apidot://` URL or for one that cannot be parsed.
 */
export function parseDeepLink(url: string): AppRoute | null {
  if (typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  if (!DEEP_LINK_PREFIX.test(trimmed)) {
    return null;
  }

  const schemeEnd = trimmed.indexOf('://');
  const rest = trimmed.slice(schemeEnd + 3);
  if (!rest) {
    return null;
  }

  const queryIndex = rest.indexOf('?');
  const pathPart = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  const search = queryIndex >= 0 ? rest.slice(queryIndex) : '';

  const segments = splitSegments(pathPart);
  if (segments[0] === 'open') {
    const params = new URLSearchParams(search);
    const path = params.get('path');
    if (!path || !isDecodable(path)) {
      return null;
    }
    return parsePathRoute(path);
  }

  const path = `/${pathPart}`;
  if (!isDecodable(path)) {
    return null;
  }
  return parsePathRoute(path);
}

/**
 * Serialises a route as a web pathname.
 */
export function toPath(route: AppRoute): string {
  switch (route.kind) {
    case 'workspace':
      return `/workspace/${encodeURIComponent(route.workspaceId)}`;
    case 'request':
      return `/workspace/${encodeURIComponent(route.workspaceId)}/request/${encodeURIComponent(
        route.requestId
      )}`;
    default:
      return '/';
  }
}

/**
 * Serialises a route as a desktop hash.
 */
export function toHash(route: AppRoute): string {
  return `#${toPath(route)}`;
}
