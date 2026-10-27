import { describe, it, expect } from 'vitest';
import {
  tokenizeShellArgs,
  parseCurl,
  ParsedCurlRequest,
  CurlParseResult,
} from './curlParser';

describe('curlParser', () => {
  describe('tokenizeShellArgs', () => {
    it('tokenizes simple space-separated arguments', () => {
      const args = tokenizeShellArgs('curl https://api.example.com/users');
      expect(args).toEqual(['curl', 'https://api.example.com/users']);
    });

    it('preserves single-quoted arguments with internal spaces and symbols', () => {
      const args = tokenizeShellArgs("curl -d '{\"foo\": \"bar\"}' https://api.example.com");
      expect(args).toEqual(['curl', '-d', '{"foo": "bar"}', 'https://api.example.com']);
    });

    it('handles double-quoted arguments and unescapes quotes', () => {
      const args = tokenizeShellArgs('curl -H "X-Custom: \\"hello world\\"" https://api.example.com');
      expect(args).toEqual(['curl', '-H', 'X-Custom: "hello world"', 'https://api.example.com']);
    });

    it('handles line continuations with backslash and newlines (\\n and \\r\\n)', () => {
      const command = `curl 'https://api.example.com/users' \\
  -H 'Accept: application/json' \\\r
  --compressed`;
      const args = tokenizeShellArgs(command);
      expect(args).toEqual([
        'curl',
        'https://api.example.com/users',
        '-H',
        'Accept: application/json',
        '--compressed',
      ]);
    });

    it('handles backslash line continuation with trailing spaces before newline', () => {
      const command = 'curl "https://api.example.com" \\  \n  -X POST';
      const args = tokenizeShellArgs(command);
      expect(args).toEqual(['curl', 'https://api.example.com', '-X', 'POST']);
    });

    it('handles escaped spaces outside quotes', () => {
      const args = tokenizeShellArgs('curl https://api.example.com/my\\ path');
      expect(args).toEqual(['curl', 'https://api.example.com/my path']);
    });

    it('returns empty array for empty or whitespace-only command', () => {
      expect(tokenizeShellArgs('')).toEqual([]);
      expect(tokenizeShellArgs('   \n  \t ')).toEqual([]);
    });
  });

  describe('parseCurl', () => {
    it('parses a simple GET request', () => {
      const result = parseCurl('curl https://api.example.com/users');
      expect(result.success).toBe(true);
      expect(result.request).toBeDefined();

      const req = result.request as ParsedCurlRequest;
      expect(req.method).toBe('GET');
      expect(req.url).toBe('https://api.example.com/users');
      expect(req.name).toBe('Users');
      expect(req.headers).toEqual({});
      expect(JSON.parse(req.headersJson)).toEqual({});
      expect(req.bodyContent).toBeNull();
      expect(req.bodyType).toBe('None');
      expect(req.auth).toEqual({ type: 'none' });
    });

    it('parses an explicit method with -X and --request', () => {
      const res1 = parseCurl('curl -X DELETE https://api.example.com/items/123');
      expect(res1.success).toBe(true);
      expect(res1.request?.method).toBe('DELETE');
      expect(res1.request?.url).toBe('https://api.example.com/items/123');

      const res2 = parseCurl('curl --request patch https://api.example.com/items/123');
      expect(res2.success).toBe(true);
      expect(res2.request?.method).toBe('PATCH');

      const res3 = parseCurl('curl -XPOST https://api.example.com/items');
      expect(res3.success).toBe(true);
      expect(res3.request?.method).toBe('POST');
    });

    it('parses headers with -H and --header', () => {
      const command = 'curl -H "Accept: application/json" -H "X-Custom: 123" --header "Authorization: CustomToken" https://api.example.com';
      const result = parseCurl(command);
      expect(result.success).toBe(true);
      expect(result.request?.headers).toEqual({
        'Accept': 'application/json',
        'X-Custom': '123',
        'Authorization': 'CustomToken',
      });
      const parsedJson = JSON.parse(result.request?.headersJson || '{}');
      expect(parsedJson['Accept']).toBe('application/json');
      expect(parsedJson['X-Custom']).toBe('123');
    });

    it('maps cookies with -b and --cookie to Cookie header', () => {
      const res1 = parseCurl('curl -b "session=abc123" https://api.example.com');
      expect(res1.success).toBe(true);
      expect(res1.request?.headers['Cookie']).toBe('session=abc123');
      const json1 = JSON.parse(res1.request?.headersJson || '{}');
      expect(json1['Cookie']).toBe('session=abc123');

      const res2 = parseCurl('curl --cookie "theme=dark; lang=pt-BR" https://api.example.com');
      expect(res2.success).toBe(true);
      expect(res2.request?.headers['Cookie']).toBe('theme=dark; lang=pt-BR');
    });

    it('parses data flags with valid JSON body and sets bodyType to Json and method to POST', () => {
      const res1 = parseCurl("curl -d '{\"foo\":\"bar\"}' https://api.example.com");
      expect(res1.success).toBe(true);
      expect(res1.request?.method).toBe('POST');
      expect(res1.request?.bodyContent).toBe('{"foo":"bar"}');
      expect(res1.request?.bodyType).toBe('Json');

      const res2 = parseCurl('curl --data-raw \'[{"id":1},{"id":2}]\' https://api.example.com');
      expect(res2.success).toBe(true);
      expect(res2.request?.method).toBe('POST');
      expect(res2.request?.bodyContent).toBe('[{"id":1},{"id":2}]');
      expect(res2.request?.bodyType).toBe('Json');
    });

    it('parses plain text data flags and sets bodyType to RawText', () => {
      const result = parseCurl("curl -d 'hello world' https://api.example.com");
      expect(result.success).toBe(true);
      expect(result.request?.method).toBe('POST');
      expect(result.request?.bodyContent).toBe('hello world');
      expect(result.request?.bodyType).toBe('RawText');
    });

    it('preserves explicit method when body is present', () => {
      const result = parseCurl("curl -X PUT -d '{\"active\":true}' https://api.example.com/users/1");
      expect(result.success).toBe(true);
      expect(result.request?.method).toBe('PUT');
      expect(result.request?.bodyType).toBe('Json');
    });

    it('parses basic auth with -u and sets Authorization header and auth object', () => {
      const result = parseCurl('curl -u admin:secret https://api.example.com');
      expect(result.success).toBe(true);
      expect(result.request?.auth).toEqual({
        type: 'basic',
        username: 'admin',
        password: 'secret',
      });
      expect(result.request?.headers['Authorization']).toBe('Basic YWRtaW46c2VjcmV0');
      const json = JSON.parse(result.request?.headersJson || '{}');
      expect(json['Authorization']).toBe('Basic YWRtaW46c2VjcmV0');
    });

    it('parses basic auth with -u username only (no password)', () => {
      const result = parseCurl('curl -u admin https://api.example.com');
      expect(result.success).toBe(true);
      expect(result.request?.auth).toEqual({
        type: 'basic',
        username: 'admin',
        password: '',
      });
      expect(result.request?.headers['Authorization']).toBe('Basic YWRtaW46');
    });

    it('extracts bearer auth from Authorization header', () => {
      const result = parseCurl('curl -H "Authorization: Bearer mytoken" https://api.example.com');
      expect(result.success).toBe(true);
      expect(result.request?.auth).toEqual({
        type: 'bearer',
        token: 'mytoken',
      });
      expect(result.request?.headers['Authorization']).toBe('Bearer mytoken');
    });

    it('extracts basic auth from Authorization header if passed directly', () => {
      const result = parseCurl('curl -H "Authorization: Basic YWRtaW46c2VjcmV0" https://api.example.com');
      expect(result.success).toBe(true);
      expect(result.request?.auth).toEqual({
        type: 'basic',
        username: 'admin',
        password: 'secret',
      });
    });

    it('tolerates DevTools browser copy-paste with continuations, --compressed, and -k', () => {
      const command = `curl 'https://api.example.com/v1/data?page=1' \\
  -H 'Accept: application/json, text/plain, */*' \\
  -H 'User-Agent: Mozilla/5.0' \\
  --compressed \\
  -k \\
  -s \\
  -L \\
  -i`;
      const result = parseCurl(command);
      expect(result.success).toBe(true);
      expect(result.request?.url).toBe('https://api.example.com/v1/data?page=1');
      expect(result.request?.method).toBe('GET');
      expect(result.request?.headers['Accept']).toBe('application/json, text/plain, */*');
      expect(result.request?.headers['User-Agent']).toBe('Mozilla/5.0');
      expect(result.error).toBeUndefined();
    });

    it('suggests clean request name from URL and handles trailing slash / query params', () => {
      const res1 = parseCurl('curl -X POST https://api.example.com/v1/orders');
      expect(res1.request?.name).toBe('Orders');

      const res2 = parseCurl('curl https://api.com/v1/orders/?sort=desc');
      expect(res2.request?.name).toBe('Orders');

      const res3 = parseCurl('curl https://api.example.com/users');
      expect(res3.request?.name).toBe('Users');

      const res4 = parseCurl('curl https://api.example.com/order-items');
      expect(res4.request?.name).toBe('Order Items');

      const res5 = parseCurl('curl -X DELETE https://api.example.com/items/123');
      expect(res5.request?.name).toContain('123');
    });

    it('supports --url flag explicitly', () => {
      const result = parseCurl('curl --url https://api.example.com/test -X GET');
      expect(result.success).toBe(true);
      expect(result.request?.url).toBe('https://api.example.com/test');
    });

    it('fails on empty string or whitespace-only inputs', () => {
      const res1 = parseCurl('');
      expect(res1.success).toBe(false);
      expect(res1.error).toBeDefined();

      const res2 = parseCurl('   \n  \t ');
      expect(res2.success).toBe(false);
      expect(res2.error).toBeDefined();
    });

    it('fails on non-curl commands', () => {
      const res1 = parseCurl('git clone https://github.com/example/repo.git');
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('curl');

      const res2 = parseCurl('wget https://api.example.com');
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('curl');
    });

    it('fails on URLs without protocol (HTTP/HTTPS)', () => {
      const res1 = parseCurl('curl api.example.com/users');
      expect(res1.success).toBe(false);
      expect(res1.error).toBeDefined();

      const res2 = parseCurl('curl /api/v1/users');
      expect(res2.success).toBe(false);
      expect(res2.error).toBeDefined();
    });

    it('fails when no URL is provided', () => {
      const res = parseCurl('curl -X POST -H "Accept: application/json"');
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });
  });
});
