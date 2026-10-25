import { VariableItem } from '@/components/environment/VariableGrid';
import { EnvironmentGroup } from '@/components/environment/EnvironmentModal';

export interface DependencyResponse {
  status?: number;
  statusCode?: number;
  headers?: Record<string, string | string[]> | [string, string][] | null;
  body?: string | Record<string, unknown> | unknown[] | null;
}

export interface DependencyRequest {
  id: string;
  name: string;
  method: string;
  url?: string;
  response?: DependencyResponse | null;
}

export function resolveVariables(
  globals: VariableItem[],
  collectionVariables: VariableItem[],
  environments: EnvironmentGroup[],
  activeEnvironment: string | null
): Record<string, string> {
  const merged: Record<string, string> = {};

  // 1. Globals (active only)
  globals.forEach((v) => {
    if (v.isActive !== false && v.key.trim()) {
      merged[v.key.trim()] = v.value;
    }
  });

  // 2. Collection (active only, overrides globals)
  collectionVariables.forEach((v) => {
    if (v.isActive !== false && v.key.trim()) {
      merged[v.key.trim()] = v.value;
    }
  });

  // 3. Active environment (active only, overrides collection & globals)
  if (activeEnvironment) {
    const envObj = environments.find(
      (e) => e.name.toLowerCase() === activeEnvironment.toLowerCase()
    );
    if (envObj) {
      envObj.variables.forEach((v) => {
        if (v.isActive !== false && v.key.trim()) {
          merged[v.key.trim()] = v.value;
        }
      });
    }
  }

  return merged;
}

function extractPathSegments(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  const segmentRegex = /(?:\.([a-zA-Z0-9_$-]+))|(?:\[['"]([^'"]+)['"]\])|(?:\[(\d+)\])/g;
  let match: RegExpExecArray | null;
  while ((match = segmentRegex.exec(path)) !== null) {
    if (match[1] !== undefined) {
      segments.push(match[1]);
    } else if (match[2] !== undefined) {
      segments.push(match[2]);
    } else if (match[3] !== undefined) {
      segments.push(parseInt(match[3], 10));
    }
  }
  return segments;
}

function resolveRequestChaining(expr: string, requests?: DependencyRequest[]): string | null {
  if (!requests || requests.length === 0) return null;

  const reqMatch = expr.match(/^\$request\s*\[\s*['"]([^'"]+)['"]\s*\]\s*\.\s*(response(?:\..+)?)$/i);
  if (!reqMatch) return null;

  const reqId = reqMatch[1].trim();
  const fullPath = reqMatch[2].trim();

  const req = requests.find(
    (r) => r.id.toLowerCase() === reqId.toLowerCase() || r.name.toLowerCase() === reqId.toLowerCase()
  );
  if (!req || !req.response) return null;

  const pathAfterResponse = fullPath.replace(/^response/i, '');

  // 1. Status: response.status or response.statusCode
  if (/^\.status(Code)?$/i.test(pathAfterResponse)) {
    const code = req.response.statusCode ?? req.response.status;
    return code !== undefined ? String(code) : null;
  }

  // 2. Headers: response.headers['header-name'] or response.headers.headerName
  const headerMatch = pathAfterResponse.match(/^\.headers(?:\s*\[\s*['"]([^'"]+)['"]\s*\]|\.([a-zA-Z0-9_-]+))$/i);
  if (headerMatch) {
    const headerName = (headerMatch[1] || headerMatch[2]).toLowerCase();
    const headers = req.response.headers;
    if (!headers) return null;

    if (Array.isArray(headers)) {
      const entry = headers.find(([k]) => k.toLowerCase() === headerName);
      return entry ? entry[1] : null;
    }

    const key = Object.keys(headers).find((k) => k.toLowerCase() === headerName);
    if (!key) return null;
    const val = headers[key];
    return Array.isArray(val) ? val.join(', ') : String(val);
  }

  // 3. Body: response.body or response.body...
  if (/^\.body(\..+|\[.+)?$/i.test(pathAfterResponse) || pathAfterResponse === '') {
    const bodySubPath = pathAfterResponse.replace(/^\.body/i, '');
    let bodyObj: unknown = req.response.body;

    if (typeof bodyObj === 'string') {
      try {
        bodyObj = JSON.parse(bodyObj);
      } catch {
        if (!bodySubPath) return typeof bodyObj === 'string' ? bodyObj : String(bodyObj);
        return null;
      }
    }

    if (!bodySubPath) {
      if (bodyObj === undefined || bodyObj === null) return null;
      return typeof bodyObj === 'object' ? JSON.stringify(bodyObj) : String(bodyObj);
    }

    const segments = extractPathSegments(bodySubPath);
    if (segments.length === 0) {
      return typeof bodyObj === 'object' && bodyObj !== null ? JSON.stringify(bodyObj) : String(bodyObj);
    }

    let current: any = bodyObj;
    for (const seg of segments) {
      if (current === null || current === undefined) return null;
      if (typeof seg === 'number') {
        if (!Array.isArray(current) || seg < 0 || seg >= current.length) return null;
        current = current[seg];
      } else {
        if (typeof current !== 'object') return null;
        current = current[seg];
      }
    }

    if (current === undefined || current === null) return null;
    return typeof current === 'object' ? JSON.stringify(current) : String(current);
  }

  return null;
}

export function interpolateVariables(
  template: string,
  variables: Record<string, string>,
  requests?: DependencyRequest[]
): string {
  if (!template) return template;
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_\.$-]+|\$request\s*\[\s*['"][^'"]+['"]\s*\]\s*\.\s*[a-zA-Z0-9_\.\[\]'" -]+)\s*\}\}/g,
    (match, key) => {
      const trimmedKey = key.trim();

      if (trimmedKey.toLowerCase() === '$guid') {
        return typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : '00000000-0000-0000-0000-000000000000';
      }
      if (trimmedKey.toLowerCase() === '$timestamp') {
        return Math.floor(Date.now() / 1000).toString();
      }
      if (trimmedKey.toLowerCase() === '$randomint') {
        return Math.floor(1000 + Math.random() * 9000).toString();
      }

      if (/^\$request\s*\[/i.test(trimmedKey)) {
        const chainedVal = resolveRequestChaining(trimmedKey, requests);
        if (chainedVal !== null) {
          return chainedVal;
        }
        return match;
      }

      return Object.prototype.hasOwnProperty.call(variables, trimmedKey) ? variables[trimmedKey] : match;
    }
  );
}
