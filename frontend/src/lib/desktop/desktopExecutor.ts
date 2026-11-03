import { ResponseData } from '@/components/response/ResponseViewer';
import { TimingBreakdown } from '@/components/response/TimingWaterfall';

export const SIDECAR_SECRET_HEADER = 'X-ApiDot-Sidecar-Secret';

export interface HttpRequestDispatch {
  id?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  bodyType?: number | string;
  bodyContent?: string | null;
  target?: string;
  timeoutSeconds?: number;
  ignoreSslErrors?: boolean;
}

export interface ExecuteDesktopSidecarOptions {
  port: number;
  secret: string;
  dispatch: HttpRequestDispatch | any;
}

/**
 * Decodes the response body payload returned by the sidecar.
 * Handles base64 encoded byte payloads, plain text, and JSON objects.
 */
export function decodeResponseBody(rawBody: unknown): string {
  if (rawBody === undefined || rawBody === null) {
    return '';
  }

  if (typeof rawBody === 'string') {
    if (rawBody.length === 0) {
      return '';
    }

    // Attempt base64 decoding (standard for byte[] payload from sidecar)
    try {
      const binary = atob(rawBody);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      // Fallback to raw string if not valid base64 or not UTF-8
      return rawBody;
    }
  }

  if (typeof rawBody === 'object') {
    return JSON.stringify(rawBody, null, 2);
  }

  return String(rawBody);
}

/**
 * Dispatches an HTTP request directly to the local Tauri desktop sidecar loopback listener.
 * Communicates with http://127.0.0.1:${port}/execute with the X-ApiDot-Sidecar-Secret header.
 */
export async function executeViaDesktopSidecar(
  optionsOrDispatch: ExecuteDesktopSidecarOptions | HttpRequestDispatch,
  fallbackOptions?: { port: number; secret: string }
): Promise<ResponseData> {
  let port: number;
  let secret: string;
  let dispatch: HttpRequestDispatch | any;

  if (
    optionsOrDispatch &&
    typeof optionsOrDispatch === 'object' &&
    'port' in optionsOrDispatch &&
    'secret' in optionsOrDispatch &&
    'dispatch' in optionsOrDispatch
  ) {
    port = optionsOrDispatch.port;
    secret = optionsOrDispatch.secret;
    dispatch = optionsOrDispatch.dispatch;
  } else if (fallbackOptions) {
    port = fallbackOptions.port;
    secret = fallbackOptions.secret;
    dispatch = optionsOrDispatch;
  } else {
    throw new Error('executeViaDesktopSidecar requires port, secret, and dispatch payload');
  }

  if (!port || isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid sidecar port: ${port}`);
  }

  if (typeof secret !== 'string') {
    throw new Error('Invalid sidecar secret');
  }

  const startTime = Date.now();

  const res = await fetch(`http://127.0.0.1:${port}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [SIDECAR_SECRET_HEADER]: secret,
    },
    body: JSON.stringify(dispatch),
  });

  const durationMs = Date.now() - startTime;
  const contentType = res.headers.get('content-type') || '';
  let targetStatusCode = res.status;
  let targetStatusText = res.statusText || (res.ok ? 'OK' : 'Error');
  const targetHeaders: Record<string, string> = {};
  let bodyText = '';
  let timing: TimingBreakdown | null = null;
  let errorMessage: string | null = null;

  if (
    contentType.includes('application/json') ||
    contentType.includes('application/problem+json')
  ) {
    const json = await res.json();
    if (json.timing) {
      timing = json.timing;
    }
    if (typeof json.statusCode === 'number') {
      targetStatusCode = json.statusCode;
    }
    if (json.statusText) {
      targetStatusText = json.statusText;
    }
    if (json.errorMessage) {
      errorMessage = json.errorMessage;
    }
    if (json.headers && typeof json.headers === 'object') {
      Object.entries(json.headers).forEach(([k, v]) => {
        targetHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
      });
    }

    bodyText = decodeResponseBody(json.body !== undefined ? json.body : json);
  } else {
    bodyText = await res.text();
    res.headers.forEach((val, key) => {
      targetHeaders[key] = val;
    });
  }

  // If the sidecar itself returned an HTTP error (e.g. 401 Unauthorized or 500 error)
  if (!res.ok && !errorMessage) {
    errorMessage = bodyText || targetStatusText;
  }

  return {
    statusCode: targetStatusCode,
    statusText: targetStatusText,
    durationMs,
    headers: targetHeaders,
    body: bodyText,
    timing,
    errorMessage: errorMessage ?? undefined,
  };
}
