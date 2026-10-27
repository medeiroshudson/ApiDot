import { interpolateVariables, DependencyRequest } from '@/lib/variables';
import { resolvePathParams } from '@/components/request/RequestEditor';

export interface GenerateCurlOptions {
  variables?: Record<string, string>;
  requestHistory?: DependencyRequest[] | any[];
  resolveVariables?: boolean;
}

export interface CurlRequestInput {
  method: string;
  url: string;
  headers?: string | Record<string, string>;
  body?: string | null;
  bodyFormat?: string;
  auth?: {
    type: string;
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
  };
  pathParams?: Record<string, string>;
}

function escapeForSingleQuotes(str: string): string {
  return str.replace(/'/g, "'\\''");
}

function encodeBase64(str: string): string {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf-8').toString('base64');
    }
    if (typeof btoa === 'function') {
      try {
        if (typeof unescape === 'function') {
          return btoa(unescape(encodeURIComponent(str)));
        }
      } catch {
        // Fallback to standard btoa
      }
      return btoa(str);
    }
  } catch {
    return '';
  }
  return '';
}

function isJsonPayload(body: string, format?: string): boolean {
  if (format?.toLowerCase() === 'json') {
    return true;
  }
  if (format && format.toLowerCase() !== 'json') {
    return false;
  }
  const trimmed = body.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return true;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a formatted cURL command string with multiline formatting and backslashes,
 * environment variable interpolation, path parameter substitution, and safe shell quote escaping.
 */
export function generateCurlCommand(
  request: CurlRequestInput,
  options?: GenerateCurlOptions
): string {
  const method = (request.method || 'GET').toUpperCase().trim();
  let url = request.url || '';

  // 1. Resolve path parameters
  if (request.pathParams && Object.keys(request.pathParams).length > 0) {
    url = resolvePathParams(url, request.pathParams);
  }

  // 2. Resolve environment variables if enabled or provided
  const shouldResolveVariables =
    options?.resolveVariables !== undefined
      ? options.resolveVariables
      : Boolean(options?.variables && Object.keys(options.variables).length > 0);

  if (shouldResolveVariables) {
    url = interpolateVariables(url, options?.variables || {}, options?.requestHistory);
  }

  // 3. Normalize headers into key-value map
  const headersMap: Record<string, string> = {};

  if (request.headers) {
    if (typeof request.headers === 'string') {
      const trimmed = request.headers.trim();
      if (trimmed.length > 0) {
        let parsedAsJson = false;
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              for (const [k, v] of Object.entries(parsed)) {
                if (k.trim()) {
                  headersMap[k.trim()] = String(v ?? '');
                }
              }
              parsedAsJson = true;
            }
          } catch {
            // Fallback to line-by-line parsing below
          }
        }

        if (!parsedAsJson) {
          const lines = trimmed.split('\n');
          for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
              const k = line.slice(0, colonIdx).trim();
              const v = line.slice(colonIdx + 1).trim();
              if (k) {
                headersMap[k] = v;
              }
            }
          }
        }
      }
    } else if (typeof request.headers === 'object') {
      for (const [k, v] of Object.entries(request.headers)) {
        if (k && k.trim()) {
          headersMap[k.trim()] = String(v ?? '');
        }
      }
    }
  }

  // 4. Inject authentication headers if not already present
  if (request.auth) {
    const authType = request.auth.type?.toLowerCase();
    const hasAuthHeader = Object.keys(headersMap).some(
      (k) => k.toLowerCase() === 'authorization'
    );

    if (!hasAuthHeader) {
      if (authType === 'bearer') {
        const rawToken = request.auth.token ?? '';
        const token = shouldResolveVariables
          ? interpolateVariables(rawToken, options?.variables || {}, options?.requestHistory)
          : rawToken;
        if (token.trim().length > 0) {
          headersMap['Authorization'] = `Bearer ${token}`;
        }
      } else if (authType === 'basic') {
        const rawUser = request.auth.username || '';
        const rawPass = request.auth.password || '';
        if (rawUser || rawPass) {
          const user = shouldResolveVariables
            ? interpolateVariables(rawUser, options?.variables || {}, options?.requestHistory)
            : rawUser;
          const pass = shouldResolveVariables
            ? interpolateVariables(rawPass, options?.variables || {}, options?.requestHistory)
            : rawPass;
          const credentials = `${user}:${pass}`;
          headersMap['Authorization'] = `Basic ${encodeBase64(credentials)}`;
        }
      }
    }

    if (authType === 'apikey' && request.auth.key) {
      const rawKey = request.auth.key.trim();
      const rawVal = request.auth.value ?? '';
      const key = shouldResolveVariables
        ? interpolateVariables(rawKey, options?.variables || {}, options?.requestHistory)
        : rawKey;
      const val = shouldResolveVariables
        ? interpolateVariables(rawVal, options?.variables || {}, options?.requestHistory)
        : rawVal;

      const hasKeyHeader = Object.keys(headersMap).some(
        (k) => k.toLowerCase() === key.toLowerCase()
      );
      if (!hasKeyHeader && key) {
        headersMap[key] = val;
      }
    }
  }

  // 5. Evaluate body permissions by method and format
  const methodsWithBody = ['POST', 'PUT', 'PATCH', 'DELETE'];
  const canHaveBody = methodsWithBody.includes(method);

  let rawBody: string | null = null;
  if (
    canHaveBody &&
    request.bodyFormat !== 'none' &&
    request.body !== undefined &&
    request.body !== null &&
    request.body !== ''
  ) {
    rawBody = request.body;
  }

  // 6. Auto-inject Content-Type for JSON body if not explicitly set
  if (rawBody !== null) {
    const hasContentType = Object.keys(headersMap).some(
      (k) => k.toLowerCase() === 'content-type'
    );
    if (!hasContentType && isJsonPayload(rawBody, request.bodyFormat)) {
      headersMap['Content-Type'] = 'application/json';
    }
  }

  // 7. Resolve variables in headers and body
  if (shouldResolveVariables) {
    for (const [k, v] of Object.entries(headersMap)) {
      const resolvedK = interpolateVariables(k, options?.variables || {}, options?.requestHistory);
      const resolvedV = interpolateVariables(v, options?.variables || {}, options?.requestHistory);
      if (resolvedK !== k) {
        delete headersMap[k];
      }
      headersMap[resolvedK] = resolvedV;
    }
    if (rawBody !== null) {
      rawBody = interpolateVariables(rawBody, options?.variables || {}, options?.requestHistory);
    }
  }

  // 8. Assemble formatted lines with backslash continuations
  const lines: string[] = [];
  lines.push(`curl -X ${method} '${escapeForSingleQuotes(url)}'`);

  for (const [k, v] of Object.entries(headersMap)) {
    lines.push(`  -H '${escapeForSingleQuotes(k)}: ${escapeForSingleQuotes(v)}'`);
  }

  if (rawBody !== null) {
    lines.push(`  --data-raw '${escapeForSingleQuotes(rawBody)}'`);
  }

  if (lines.length === 1) {
    return lines[0];
  }

  return lines.join(' \\\n');
}
