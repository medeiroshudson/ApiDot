import { describe, it, expect } from 'vitest';
import {
  generateCurlCommand,
  GenerateCurlOptions,
  CurlRequestInput,
} from './curlGenerator';
import { parseCurl } from './curlParser';

describe('curlGenerator', () => {
  describe('Basic command generation', () => {
    it('generates a simple GET command on a single line when no headers or body are present', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/items',
      });
      expect(curl).toBe("curl -X GET 'https://api.example.com/items'");
    });

    it('defaults method to GET if method is omitted or empty', () => {
      const curl = generateCurlCommand({
        method: '',
        url: 'https://api.example.com/users',
      });
      expect(curl).toBe("curl -X GET 'https://api.example.com/users'");
    });

    it('normalizes lowercase HTTP methods to uppercase', () => {
      const curl = generateCurlCommand({
        method: 'post',
        url: 'https://api.example.com/users',
      });
      expect(curl).toBe("curl -X POST 'https://api.example.com/users'");
    });

    it('handles empty URL string gracefully', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: '',
      });
      expect(curl).toBe("curl -X GET ''");
    });
  });

  describe('Headers and multiline formatting', () => {
    it('formats headers with -H and joins lines with backslash continuations', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/data',
        headers: {
          'Accept': 'application/json',
          'X-Client-Version': '1.0.0',
        },
      });

      const expected = [
        "curl -X GET 'https://api.example.com/data' \\",
        "  -H 'Accept: application/json' \\",
        "  -H 'X-Client-Version: 1.0.0'",
      ].join('\n');

      expect(curl).toBe(expected);
    });

    it('parses headers passed as a JSON string', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/data',
        headers: '{\n  "Accept": "application/json",\n  "X-Request-Id": "req-123"\n}',
      });

      expect(curl).toContain("-H 'Accept: application/json'");
      expect(curl).toContain("-H 'X-Request-Id: req-123'");
    });

    it('parses headers passed as raw newline-separated lines', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/data',
        headers: 'Accept: text/html\nX-Custom-Header: CustomVal',
      });

      expect(curl).toContain("-H 'Accept: text/html'");
      expect(curl).toContain("-H 'X-Custom-Header: CustomVal'");
    });

    it('escapes single quotes inside header keys and values', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com',
        headers: {
          "X-User's-Role": "Manager's Assistant",
        },
      });

      expect(curl).toContain("-H 'X-User'\\''s-Role: Manager'\\''s Assistant'");
    });
  });

  describe('Body handling and Content-Type auto-injection', () => {
    it('emits -H Content-Type: application/json and --data-raw for POST with JSON body', () => {
      const curl = generateCurlCommand({
        method: 'POST',
        url: 'https://api.example.com/items',
        body: '{"key":"value"}',
      });

      const expected = [
        "curl -X POST 'https://api.example.com/items' \\",
        "  -H 'Content-Type: application/json' \\",
        "  --data-raw '{\"key\":\"value\"}'",
      ].join('\n');

      expect(curl).toBe(expected);
    });

    it('auto-injects Content-Type: application/json when bodyFormat is json', () => {
      const curl = generateCurlCommand({
        method: 'POST',
        url: 'https://api.example.com/items',
        body: '{"name":"widget"}',
        bodyFormat: 'json',
      });

      expect(curl).toContain("-H 'Content-Type: application/json'");
      expect(curl).toContain("--data-raw '{\"name\":\"widget\"}'");
    });

    it('does not duplicate Content-Type if already provided in headers', () => {
      const curl = generateCurlCommand({
        method: 'POST',
        url: 'https://api.example.com/items',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: '{"key":"value"}',
      });

      // Should only have the provided content-type, not two
      const occurrences = (curl.match(/content-type/gi) || []).length;
      expect(occurrences).toBe(1);
      expect(curl).toContain("-H 'content-type: application/json; charset=utf-8'");
    });

    it('does not overwrite non-json Content-Type header', () => {
      const curl = generateCurlCommand({
        method: 'POST',
        url: 'https://api.example.com/upload',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'param1=val1&param2=val2',
      });

      expect(curl).toContain("-H 'Content-Type: application/x-www-form-urlencoded'");
      expect(curl).not.toContain('application/json');
      expect(curl).toContain("--data-raw 'param1=val1&param2=val2'");
    });

    it('does not inject Content-Type: application/json for plain text bodies when bodyFormat is text', () => {
      const curl = generateCurlCommand({
        method: 'POST',
        url: 'https://api.example.com/raw',
        body: 'Plain text payload',
        bodyFormat: 'text',
      });

      expect(curl).not.toContain('Content-Type');
      expect(curl).toContain("--data-raw 'Plain text payload'");
    });

    it('suppresses body when bodyFormat is none even if body content exists', () => {
      const curl = generateCurlCommand({
        method: 'POST',
        url: 'https://api.example.com/action',
        body: '{"stale":"payload"}',
        bodyFormat: 'none',
      });

      expect(curl).not.toContain('--data-raw');
      expect(curl).not.toContain('Content-Type');
      expect(curl).toBe("curl -X POST 'https://api.example.com/action'");
    });

    it('does not emit body for GET requests even if body property is populated', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/items',
        body: '{"should":"not appear"}',
      });

      expect(curl).not.toContain('--data-raw');
      expect(curl).toBe("curl -X GET 'https://api.example.com/items'");
    });

    it('supports body on PUT, PATCH, and DELETE methods', () => {
      const putCurl = generateCurlCommand({
        method: 'PUT',
        url: 'https://api.example.com/items/1',
        body: '{"title":"new"}',
      });
      expect(putCurl).toContain('-X PUT');
      expect(putCurl).toContain("--data-raw '{\"title\":\"new\"}'");

      const patchCurl = generateCurlCommand({
        method: 'PATCH',
        url: 'https://api.example.com/items/1',
        body: '{"active":true}',
      });
      expect(patchCurl).toContain('-X PATCH');
      expect(patchCurl).toContain("--data-raw '{\"active\":true}'");

      const deleteCurl = generateCurlCommand({
        method: 'DELETE',
        url: 'https://api.example.com/items',
        body: '{"ids":[1,2,3]}',
      });
      expect(deleteCurl).toContain('-X DELETE');
      expect(deleteCurl).toContain("--data-raw '{\"ids\":[1,2,3]}'");
    });
  });

  describe('Shell quote escaping', () => {
    it("safely escapes single quotes in body payload using bash '\\'' idiom", () => {
      const curl = generateCurlCommand({
        method: 'POST',
        url: 'https://api.example.com/comments',
        body: "It's ok",
      });

      expect(curl).toContain("--data-raw 'It'\\''s ok'");
    });

    it('escapes multiple single quotes in complex JSON bodies', () => {
      const curl = generateCurlCommand({
        method: 'POST',
        url: 'https://api.example.com/items',
        body: '{"text": "John\'s item and Mary\'s book"}',
      });

      expect(curl).toContain("--data-raw '{\"text\": \"John'\\''s item and Mary'\\''s book\"}'");
    });

    it('safely escapes single quotes in URL and query parameters', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: "https://api.example.com/search?query=O'Reilly",
      });

      expect(curl).toBe("curl -X GET 'https://api.example.com/search?query=O'\\''Reilly'");
    });
  });

  describe('Path parameter resolution', () => {
    it('resolves single path param in URL', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.com/users/:id',
        pathParams: { id: '42' },
      });

      expect(curl).toBe("curl -X GET 'https://api.com/users/42'");
    });

    it('resolves multiple path params across the URL', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.com/orgs/:orgId/teams/:teamId/members/:userId',
        pathParams: {
          orgId: 'corp',
          teamId: 'engineering',
          userId: 'usr_99',
        },
      });

      expect(curl).toBe("curl -X GET 'https://api.com/orgs/corp/teams/engineering/members/usr_99'");
    });

    it('keeps unmapped path params intact', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.com/users/:id/posts/:postId',
        pathParams: { id: '10' },
      });

      expect(curl).toBe("curl -X GET 'https://api.com/users/10/posts/:postId'");
    });
  });

  describe('Environment variable interpolation', () => {
    it('interpolates variables in URL when variables are provided', () => {
      const curl = generateCurlCommand(
        { method: 'GET', url: '{{baseUrl}}/users' },
        { variables: { baseUrl: 'https://dev.api.com' } }
      );

      expect(curl).toBe("curl -X GET 'https://dev.api.com/users'");
    });

    it('interpolates variables in headers and body', () => {
      const curl = generateCurlCommand(
        {
          method: 'POST',
          url: '{{baseUrl}}/orders',
          headers: {
            'X-Tenant-Id': '{{tenantId}}',
          },
          body: '{"tenant": "{{tenantId}}", "amount": {{amount}}}',
        },
        {
          variables: {
            baseUrl: 'https://api.store.com',
            tenantId: 'tenant-456',
            amount: '99',
          },
        }
      );

      expect(curl).toContain("curl -X POST 'https://api.store.com/orders'");
      expect(curl).toContain("-H 'X-Tenant-Id: tenant-456'");
      expect(curl).toContain('--data-raw \'{"tenant": "tenant-456", "amount": 99}\'');
    });

    it('respects resolveVariables: false by keeping {{var}} tokens intact', () => {
      const curl = generateCurlCommand(
        {
          method: 'GET',
          url: '{{baseUrl}}/users/{{userId}}',
          headers: {
            'Authorization': 'Bearer {{token}}',
          },
        },
        {
          variables: {
            baseUrl: 'https://dev.api.com',
            userId: '123',
            token: 'secret',
          },
          resolveVariables: false,
        }
      );

      expect(curl).toContain("curl -X GET '{{baseUrl}}/users/{{userId}}'");
      expect(curl).toContain("-H 'Authorization: Bearer {{token}}'");
    });

    it('combines path parameters and variable interpolation seamlessly', () => {
      const curl = generateCurlCommand(
        {
          method: 'GET',
          url: '{{baseUrl}}/users/:id',
          pathParams: { id: '42' },
        },
        {
          variables: { baseUrl: 'https://api.example.com' },
        }
      );

      expect(curl).toBe("curl -X GET 'https://api.example.com/users/42'");
    });
  });

  describe('Authentication injection', () => {
    it('injects Bearer token header when auth type is bearer', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/secure',
        auth: {
          type: 'bearer',
          token: 'jwt-access-token-xyz',
        },
      });

      expect(curl).toContain("-H 'Authorization: Bearer jwt-access-token-xyz'");
    });

    it('injects Basic auth header with Base64 encoding when auth type is basic', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/admin',
        auth: {
          type: 'basic',
          username: 'admin',
          password: 'secret',
        },
      });

      expect(curl).toContain("-H 'Authorization: Basic YWRtaW46c2VjcmV0'");
    });

    it('resolves variables inside basic credentials before base64 encoding', () => {
      const curl = generateCurlCommand(
        {
          method: 'GET',
          url: 'https://api.example.com/admin',
          auth: {
            type: 'basic',
            username: '{{user}}',
            password: '{{pass}}',
          },
        },
        {
          variables: { user: 'admin', pass: 'secret' },
        }
      );

      expect(curl).toContain("-H 'Authorization: Basic YWRtaW46c2VjcmV0'");
    });

    it('resolves variables inside bearer token', () => {
      const curl = generateCurlCommand(
        {
          method: 'GET',
          url: 'https://api.example.com/secure',
          auth: {
            type: 'bearer',
            token: '{{authToken}}',
          },
        },
        {
          variables: { authToken: 'resolved-bearer-123' },
        }
      );

      expect(curl).toContain("-H 'Authorization: Bearer resolved-bearer-123'");
    });

    it('injects API Key header when auth type is apikey', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/data',
        auth: {
          type: 'apikey',
          key: 'X-API-Key',
          value: 'key_12345',
        },
      });

      expect(curl).toContain("-H 'X-API-Key: key_12345'");
    });

    it('does not inject Authorization header if already present in request headers', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/profile',
        headers: {
          'Authorization': 'Bearer existing-token-preserved',
        },
        auth: {
          type: 'bearer',
          token: 'new-token-ignored',
        },
      });

      expect(curl).toContain("-H 'Authorization: Bearer existing-token-preserved'");
      expect(curl).not.toContain('new-token-ignored');
    });

    it('does not inject API key header if already present in request headers (case-insensitive)', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com/profile',
        headers: {
          'x-api-key': 'existing-key',
        },
        auth: {
          type: 'apikey',
          key: 'X-API-KEY',
          value: 'new-key-ignored',
        },
      });

      expect(curl).toContain("-H 'x-api-key: existing-key'");
      expect(curl).not.toContain('new-key-ignored');
    });

    it('does not inject any auth headers when auth type is none or inherit', () => {
      const curl1 = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com',
        auth: { type: 'none' },
      });
      expect(curl1).toBe("curl -X GET 'https://api.example.com'");

      const curl2 = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com',
        auth: { type: 'inherit' },
      });
      expect(curl2).toBe("curl -X GET 'https://api.example.com'");
    });
  });

  describe('Roundtrip interoperability with curlParser', () => {
    it('produces cURL command that parseCurl parses back into equivalent request properties', () => {
      const initialRequest: CurlRequestInput = {
        method: 'POST',
        url: 'https://api.example.com/v1/orders',
        headers: {
          'Accept': 'application/json',
          'X-Client-Id': 'client-987',
        },
        body: '{"item": "book", "qty": 2}',
        bodyFormat: 'json',
        auth: {
          type: 'bearer',
          token: 'token-xyz',
        },
      };

      const command = generateCurlCommand(initialRequest);
      const parsed = parseCurl(command);

      expect(parsed.success).toBe(true);
      expect(parsed.request?.method).toBe('POST');
      expect(parsed.request?.url).toBe('https://api.example.com/v1/orders');
      expect(parsed.request?.headers['Accept']).toBe('application/json');
      expect(parsed.request?.headers['X-Client-Id']).toBe('client-987');
      expect(parsed.request?.headers['Authorization']).toBe('Bearer token-xyz');
      expect(parsed.request?.headers['Content-Type']).toBe('application/json');
      expect(parsed.request?.bodyContent).toBe('{"item": "book", "qty": 2}');
      expect(parsed.request?.bodyType).toBe('Json');
    });

    it('falls back to GET if invalid or malicious method is passed', () => {
      const curl = generateCurlCommand({
        method: 'GET; rm -rf /; #',
        url: 'https://api.example.com',
      });
      expect(curl).toBe("curl -X GET 'https://api.example.com'");
    });

    it('sanitizes CRLF from header keys and values', () => {
      const curl = generateCurlCommand({
        method: 'GET',
        url: 'https://api.example.com',
        headers: {
          'X-Custom\r\nHeader': 'val\r\nue',
        },
      });
      expect(curl).toContain("-H 'X-Custom Header: val ue'");
      expect(curl).not.toContain('\r');
    });

    it('does not treat template variables {{xmlBody}} as JSON braces', () => {
      const curl = generateCurlCommand({
        method: 'POST',
        url: 'https://api.example.com',
        body: '{{xmlBody}}',
      });
      expect(curl).not.toContain("Content-Type: application/json");
    });
  });
});
