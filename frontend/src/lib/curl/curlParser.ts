export interface ParsedCurlRequest {
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  headersJson: string;
  bodyContent: string | null;
  bodyType: 'None' | 'Json' | 'RawText';
  auth: {
    type: 'none' | 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
  };
}

export interface CurlParseResult {
  success: boolean;
  request?: ParsedCurlRequest;
  error?: string;
}

/**
 * Tokenizes shell arguments respecting single quotes, double quotes,
 * escape characters, and multi-line backslash continuations.
 */
export function tokenizeShellArgs(command: string): string[] {
  const tokens: string[] = [];
  let currentToken = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let hasToken = false;

  let i = 0;
  const len = command.length;

  while (i < len) {
    const char = command[i];

    if (inSingleQuote) {
      if (char === "'") {
        inSingleQuote = false;
      } else {
        currentToken += char;
      }
      hasToken = true;
      i++;
    } else if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
        hasToken = true;
        i++;
      } else if (char === '\\') {
        const remainder = command.slice(i);
        const lineContinuationMatch = remainder.match(/^\\([ \t]*\r?\n)/);
        if (lineContinuationMatch) {
          i += lineContinuationMatch[0].length;
          continue;
        }

        const nextChar = command[i + 1];
        if (nextChar === '"' || nextChar === '\\' || nextChar === '$' || nextChar === '`') {
          currentToken += nextChar;
          hasToken = true;
          i += 2;
        } else {
          currentToken += char;
          hasToken = true;
          i++;
        }
      } else {
        currentToken += char;
        hasToken = true;
        i++;
      }
    } else {
      // Outside quotes
      if (char === '\\') {
        const remainder = command.slice(i);
        const lineContinuationMatch = remainder.match(/^\\([ \t]*\r?\n)/);
        if (lineContinuationMatch) {
          i += lineContinuationMatch[0].length;
          continue;
        }

        const nextChar = command[i + 1];
        if (nextChar !== undefined) {
          currentToken += nextChar;
          hasToken = true;
          i += 2;
        } else {
          i++;
        }
      } else if (char === "'") {
        inSingleQuote = true;
        hasToken = true;
        i++;
      } else if (char === '"') {
        inDoubleQuote = true;
        hasToken = true;
        i++;
      } else if (/\s/.test(char)) {
        if (hasToken) {
          tokens.push(currentToken);
          currentToken = '';
          hasToken = false;
        }
        i++;
      } else {
        currentToken += char;
        hasToken = true;
        i++;
      }
    }
  }

  if (hasToken) {
    tokens.push(currentToken);
  }

  return tokens;
}

function encodeBase64(str: string): string {
  if (typeof btoa === 'function') {
    return btoa(str);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  return '';
}

function decodeBase64(b64: string): string {
  try {
    if (typeof atob === 'function') {
      return atob(b64);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(b64, 'base64').toString('utf-8');
    }
  } catch {
    // Return empty on invalid base64
  }
  return '';
}

function formatSuggestion(raw: string): string {
  const words = raw.split(/[-_]+/).filter(Boolean);
  if (words.length > 0) {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function suggestRequestName(url: string, _method?: string): string {
  if (!url || typeof url !== 'string') return 'New Request';

  const cleanUrl = url.split(/[?#]/)[0].trim();
  const withoutProto = cleanUrl.replace(/^[a-zA-Z]+:\/\//, '');
  const slashIdx = withoutProto.indexOf('/');
  const pathname = slashIdx !== -1 ? withoutProto.slice(slashIdx) : '';
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    if (/^\d+$/.test(last) && segments.length > 1) {
      const prev = segments[segments.length - 2];
      return `${formatSuggestion(prev)} ${last}`;
    }
    return formatSuggestion(decodeURIComponent(last));
  }

  const host = slashIdx !== -1 ? withoutProto.slice(0, slashIdx) : withoutProto;
  if (host) {
    return host;
  }

  return 'New Request';
}

// Flags that never take an argument and can safely be ignored from browser devtools copy-paste
const BOOLEAN_FLAGS = new Set([
  '--compressed',
  '-k',
  '--insecure',
  '-s',
  '-s',
  '--silent',
  '--show-error',
  '-v',
  '--verbose',
  '-l',
  '-l',
  '--location',
  '--location-trusted',
  '-i',
  '--include',
  '-g',
  '--globoff',
  '-q',
  '--disable',
  '-n',
  '--no-buffer',
  '--raw',
  '--http1.0',
  '--http1.1',
  '--http2',
  '--http2-prior-knowledge',
  '--http3',
  '--ssl-reqd',
  '--tlsv1.2',
  '--tlsv1.3',
  '-f',
  '--fail',
  '--fail-with-body',
  '--retry-all-errors',
]);

// Flags that take an argument which we can skip if unknown
const ARG_FLAGS_TO_SKIP = new Set([
  '-m',
  '--max-time',
  '--connect-timeout',
  '--proxy',
  '-x',
  '--cacert',
  '--cert',
  '--key',
  '-o',
  '--output',
  '-w',
  '--write-out',
  '--resolve',
  '--retry',
  '--retry-delay',
]);

export function parseCurl(curlCommand: string): CurlParseResult {
  if (!curlCommand || !curlCommand.trim()) {
    return {
      success: false,
      error: 'Comando cURL vazio.',
    };
  }

  const tokens = tokenizeShellArgs(curlCommand);
  if (tokens.length === 0) {
    return {
      success: false,
      error: 'Comando cURL vazio.',
    };
  }

  const firstToken = tokens[0].toLowerCase();
  if (firstToken !== 'curl' && firstToken !== 'curl.exe') {
    return {
      success: false,
      error: 'Comando inválido: deve começar com "curl".',
    };
  }

  let method: string | undefined;
  let url: string | undefined;
  const headers: Record<string, string> = {};
  const dataParts: string[] = [];
  let auth: ParsedCurlRequest['auth'] = { type: 'none' };

  function addHeader(headerStr: string) {
    if (!headerStr) return;
    const colonIdx = headerStr.indexOf(':');
    if (colonIdx === -1) return;
    const key = headerStr.slice(0, colonIdx).trim();
    const val = headerStr.slice(colonIdx + 1).trim();
    if (!key) return;

    headers[key] = val;

    if (key.toLowerCase() === 'authorization') {
      if (val.toLowerCase().startsWith('bearer ')) {
        auth = {
          type: 'bearer',
          token: val.slice(7).trim(),
        };
      } else if (val.toLowerCase().startsWith('basic ')) {
        const b64 = val.slice(6).trim();
        const decoded = decodeBase64(b64);
        const cIdx = decoded.indexOf(':');
        if (cIdx !== -1) {
          auth = {
            type: 'basic',
            username: decoded.slice(0, cIdx),
            password: decoded.slice(cIdx + 1),
          };
        } else {
          auth = {
            type: 'basic',
            username: decoded,
            password: '',
          };
        }
      }
    }
  }

  function addCookie(cookieVal: string) {
    if (!cookieVal) return;
    if (headers['Cookie']) {
      headers['Cookie'] += '; ' + cookieVal;
    } else {
      headers['Cookie'] = cookieVal;
    }
  }

  function handleUser(userPass: string) {
    if (!userPass) return;
    const colonIdx = userPass.indexOf(':');
    const username = colonIdx !== -1 ? userPass.slice(0, colonIdx) : userPass;
    const password = colonIdx !== -1 ? userPass.slice(colonIdx + 1) : '';
    auth = {
      type: 'basic',
      username,
      password,
    };
    const b64 = encodeBase64(`${username}:${password}`);
    headers['Authorization'] = `Basic ${b64}`;
  }

  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];

    // Method flags: -X, --request
    if (token === '-X' || token === '--request') {
      if (i + 1 < tokens.length) {
        method = tokens[++i].toUpperCase();
      }
    } else if (token.startsWith('-X') && token.length > 2) {
      method = token.slice(2).toUpperCase();
    } else if (token.startsWith('--request=')) {
      method = token.slice('--request='.length).toUpperCase();
    } else if (token === '-I' || token === '--head') {
      method = 'HEAD';
    }

    // Header flags: -H, --header
    else if (token === '-H' || token === '--header') {
      if (i + 1 < tokens.length) {
        addHeader(tokens[++i]);
      }
    } else if (token.startsWith('-H') && token.length > 2) {
      addHeader(token.slice(2));
    } else if (token.startsWith('--header=')) {
      addHeader(token.slice('--header='.length));
    }

    // Cookie flags: -b, --cookie
    else if (token === '-b' || token === '--cookie') {
      if (i + 1 < tokens.length) {
        addCookie(tokens[++i]);
      }
    } else if (token.startsWith('-b') && token.length > 2) {
      addCookie(token.slice(2));
    } else if (token.startsWith('--cookie=')) {
      addCookie(token.slice('--cookie='.length));
    }

    // Basic Auth flags: -u, --user
    else if (token === '-u' || token === '--user') {
      if (i + 1 < tokens.length) {
        handleUser(tokens[++i]);
      }
    } else if (token.startsWith('-u') && token.length > 2) {
      handleUser(token.slice(2));
    } else if (token.startsWith('--user=')) {
      handleUser(token.slice('--user='.length));
    }

    // Body / Data flags
    else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii' ||
      token === '--data-urlencode'
    ) {
      if (i + 1 < tokens.length) {
        dataParts.push(tokens[++i]);
      }
    } else if (token.startsWith('-d') && token.length > 2) {
      dataParts.push(token.slice(2));
    } else if (
      token.startsWith('--data=') ||
      token.startsWith('--data-raw=') ||
      token.startsWith('--data-binary=') ||
      token.startsWith('--data-ascii=') ||
      token.startsWith('--data-urlencode=')
    ) {
      dataParts.push(token.slice(token.indexOf('=') + 1));
    }

    // URL flag
    else if (token === '--url') {
      if (i + 1 < tokens.length) {
        url = tokens[++i];
      }
    } else if (token.startsWith('--url=')) {
      url = token.slice('--url='.length);
    }

    // DevTools flags with argument
    else if (token === '-A' || token === '--user-agent') {
      if (i + 1 < tokens.length) {
        headers['User-Agent'] = tokens[++i];
      }
    } else if (token === '-e' || token === '--referer') {
      if (i + 1 < tokens.length) {
        headers['Referer'] = tokens[++i];
      }
    } else if (ARG_FLAGS_TO_SKIP.has(token)) {
      if (i + 1 < tokens.length && !/^https?:\/\//i.test(tokens[i + 1])) {
        i++;
      }
    }

    // DevTools boolean flags (ignore)
    else if (BOOLEAN_FLAGS.has(token.toLowerCase())) {
      // Ignored
    }

    // Unknown flags
    else if (token.startsWith('-')) {
      // If unknown flag has an argument that is not a URL and not another flag, skip it
      if (
        i + 1 < tokens.length &&
        !tokens[i + 1].startsWith('-') &&
        !/^https?:\/\//i.test(tokens[i + 1])
      ) {
        i++;
      }
    }

    // Positional argument (URL)
    else if (!url) {
      url = token;
    }

    i++;
  }

  if (!url) {
    return {
      success: false,
      error: 'Nenhuma URL encontrada no comando cURL.',
    };
  }

  // Verify protocol
  if (!/^https?:\/\//i.test(url)) {
    return {
      success: false,
      error: 'URL inválida: o ApiDot requer que a URL comece com http:// ou https://.',
    };
  }

  let bodyContent: string | null = null;
  let bodyType: 'None' | 'Json' | 'RawText' = 'None';

  if (dataParts.length > 0) {
    bodyContent = dataParts.join('&');
    const trimmed = bodyContent.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmed);
        bodyType = 'Json';
      } catch {
        bodyType = 'RawText';
      }
    } else {
      bodyType = 'RawText';
    }
  }

  if (!method) {
    method = bodyContent !== null ? 'POST' : 'GET';
  }

  const name = suggestRequestName(url, method);
  const headersJson = JSON.stringify(headers, null, 2);

  const request: ParsedCurlRequest = {
    name,
    method,
    url,
    headers,
    headersJson,
    bodyContent,
    bodyType,
    auth,
  };

  return {
    success: true,
    request,
  };
}
