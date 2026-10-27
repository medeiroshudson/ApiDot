import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceEditorPane } from './WorkspaceEditorPane';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { useLayoutStore, INITIAL_LAYOUT_STATE } from '@/stores/useLayoutStore';
import { useRequestStore, getScratchpadKey } from '@/stores/useRequestStore';
import { useEnvironmentStore } from '@/stores/useEnvironmentStore';
import { WorkspaceTreeDto } from '@/lib/treeApi';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useParams: () => ({}),
}));

const mockTree: WorkspaceTreeDto = {
  workspaceId: 'ws-1',
  workspaceName: 'Workspace 1',
  collections: [
    {
      id: 'col-1',
      name: 'Users API',
      defaultTarget: 'Inherit',
      openApiSpecUrl: null,
      folders: [],
      requests: [
        {
          id: 'req-1',
          name: 'Get Users',
          method: 'GET',
          url: 'https://api.example.com/users',
          target: 'Inherit',
          bodyType: 'None',
          bodyContent: null,
          headersJson: '{"Accept": "application/json"}',
          collectionId: 'col-1',
          folderId: null,
        },
        {
          id: 'req-2',
          name: 'Create User',
          method: 'POST',
          url: 'https://api.example.com/users',
          target: 'Server',
          bodyType: 'Json',
          bodyContent: '{"name": "Alice"}',
          headersJson: '{"Content-Type": "application/json"}',
          collectionId: 'col-1',
          folderId: null,
        },
      ],
    },
  ],
};

async function renderEditorPane(
  workspaceId = 'ws-1',
  requestId: string | null = null,
  treeData: WorkspaceTreeDto = mockTree
) {
  let result: any;
  await act(async () => {
    result = render(
      <WorkspaceProvider workspaceId={workspaceId}>
        <WorkspaceEditorPane workspaceId={workspaceId} requestId={requestId} />
      </WorkspaceProvider>
    );
  });
  return result;
}

describe('WorkspaceEditorPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLayoutStore.setState(INITIAL_LAYOUT_STATE);
    useRequestStore.getState().reset();
    useEnvironmentStore.getState().reset();

    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-1/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'Success' }),
          timing: { dnsLookupMs: 5, tcpHandshakeMs: 10, tlsHandshakeMs: 15, ttfbMs: 30, contentDownloadMs: 20, totalMs: 80 },
        }),
      } as any);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders RequestEditor, central PanelSplitter, and ResponseViewer on desktop', async () => {
    await renderEditorPane('ws-1', null);

    // Verify main components are present
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('panel-splitter-request-response-splitter')).toBeInTheDocument();
    expect(screen.getByText('Requisição')).toBeInTheDocument();
    expect(screen.getByText('Resposta')).toBeInTheDocument();
    expect(screen.getByText('Dispare uma requisição para visualizar a resposta')).toBeInTheDocument();
  });

  it('applies requestResponseRatio from useLayoutStore to desktop layout', async () => {
    useLayoutStore.setState({ requestResponseRatio: 65 });
    await renderEditorPane('ws-1', null);

    const splitter = screen.getByTestId('panel-splitter-request-response-splitter');
    expect(splitter).toHaveAttribute('aria-valuenow', '65');
  });

  it('switches between request and response views on mobile', async () => {
    await renderEditorPane('ws-1', null);

    // Click on mobile 'Resposta' button
    const responseBtn = screen.getByRole('button', { name: /Resposta/i });
    fireEvent.click(responseBtn);

    expect(useLayoutStore.getState().activeMobilePane).toBe('response');

    // Click back to 'Requisição' button
    const requestBtn = screen.getByRole('button', { name: /^Requisição$/i });
    fireEvent.click(requestBtn);

    expect(useLayoutStore.getState().activeMobilePane).toBe('request');
  });

  it('displays isolated response for scratchpad', async () => {
    const scratchKey = getScratchpadKey('ws-1');
    useRequestStore.getState().setResponse(
      {
        statusCode: 200,
        statusText: 'OK',
        body: JSON.stringify({ scratchpad: true }),
      },
      null,
      'ws-1'
    );

    // Also set a response on a specific request
    useRequestStore.getState().setResponse(
      {
        statusCode: 404,
        statusText: 'Not Found',
        body: JSON.stringify({ request: 'req-1' }),
      },
      'req-1',
      'ws-1'
    );

    await renderEditorPane('ws-1', null);

    // The scratchpad should display its own response (200 OK), not req-1's (404 Not Found)
    expect(screen.getByText('200 OK')).toBeInTheDocument();
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
  });

  it('displays isolated response for a specific requestId', async () => {
    useRequestStore.getState().setResponse(
      {
        statusCode: 201,
        statusText: 'Created',
        body: JSON.stringify({ id: 123 }),
      },
      'req-2',
      'ws-1'
    );

    await renderEditorPane('ws-1', 'req-2');

    expect(screen.getByText('201 Created')).toBeInTheDocument();
  });

  it('does not leak response from req-1 when viewing req-2 with no response', async () => {
    useRequestStore.getState().setResponse(
      {
        statusCode: 200,
        statusText: 'OK',
        body: JSON.stringify({ req1: true }),
      },
      'req-1',
      'ws-1'
    );

    await renderEditorPane('ws-1', 'req-2');

    // req-2 has no response, so it should display empty response viewer state
    expect(screen.getByText('Dispare uma requisição para visualizar a resposta')).toBeInTheDocument();
    expect(screen.queryByText(/200 OK/)).not.toBeInTheDocument();
  });

  it('executes request on handleSend and isolates the response by requestId', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-1/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      if (url.includes('/api/requests/execute')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            statusCode: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ executed: 'req-1' }),
            timing: { dnsLookupMs: 1, tcpHandshakeMs: 2, tlsHandshakeMs: 3, ttfbMs: 10, contentDownloadMs: 5, totalMs: 21 },
          }),
        } as any);
      }
      return Promise.resolve({ ok: true } as any);
    });

    await renderEditorPane('ws-1', 'req-1');

    // Wait for req-1 to load into editor
    await waitFor(() => {
      expect(screen.getByDisplayValue('https://api.example.com/users')).toBeInTheDocument();
    });

    // Click Send
    const sendButton = screen.getByRole('button', { name: /Enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/requests/execute',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    // Check that response was stored in useRequestStore scoped to 'req-1'
    const stored = useRequestStore.getState().responsesByRequestId['req-1'];
    expect(stored).toBeDefined();
    expect(stored?.statusCode).toBe(200);

    // Scratchpad should remain empty
    const scratchKey = getScratchpadKey('ws-1');
    expect(useRequestStore.getState().responsesByRequestId[scratchKey]).toBeUndefined();
  });

  it('interpolates environment variables on send', async () => {
    useEnvironmentStore.getState().setGlobals([
      { id: '1', key: 'baseUrl', value: 'https://api.global.com', isActive: true },
    ]);

    let executedBody: any = null;
    vi.spyOn(global, 'fetch').mockImplementation((input: any, init: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-1/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      if (url.includes('/api/requests/execute')) {
        executedBody = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            statusCode: 200,
            body: 'OK',
          }),
        } as any);
      }
      return Promise.resolve({ ok: true } as any);
    });

    // Prepopulate editor with a template URL
    useRequestStore.getState().setCurrentEditorData({
      method: 'GET',
      url: '{{baseUrl}}/users',
      target: 'Inherit',
      headers: '',
      body: '',
      auth: { type: 'none' },
    });

    await renderEditorPane('ws-1', null);

    const sendButton = screen.getByRole('button', { name: /Enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(executedBody).toBeDefined();
      expect(executedBody.url).toBe('https://api.global.com/users');
    });
  });

  it('handles execution error gracefully without crashing', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-1/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      if (url.includes('/api/requests/execute')) {
        return Promise.reject(new Error('Network failure'));
      }
      return Promise.resolve({ ok: true } as any);
    });

    await renderEditorPane('ws-1', 'req-1');

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://api.example.com/users')).toBeInTheDocument();
    });

    const sendButton = screen.getByRole('button', { name: /Enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      const stored = useRequestStore.getState().responsesByRequestId['req-1'];
      expect(stored).toBeDefined();
      expect(stored?.statusCode).toBe(0);
      expect(stored?.errorMessage).toBe('Network failure');
    });
  });

  it('handles base64 encoded response body from execute endpoint', async () => {
    const rawJson = JSON.stringify({ hello: 'world' });
    const b64 = btoa(rawJson);

    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-1/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      if (url.includes('/api/requests/execute')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            statusCode: 200,
            statusText: 'OK',
            body: b64,
          }),
        } as any);
      }
      return Promise.resolve({ ok: true } as any);
    });

    await renderEditorPane('ws-1', 'req-1');

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://api.example.com/users')).toBeInTheDocument();
    });

    const sendButton = screen.getByRole('button', { name: /Enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      const stored = useRequestStore.getState().responsesByRequestId['req-1'];
      expect(stored?.body).toBe(rawJson);
    });
  });

  it('injects Bearer auth into headers on send', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.spyOn(global, 'fetch').mockImplementation((input: any, init: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-1/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      if (url.includes('/api/requests/execute')) {
        const parsed = JSON.parse(init.body);
        capturedHeaders = parsed.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ statusCode: 200 }),
        } as any);
      }
      return Promise.resolve({ ok: true } as any);
    });

    useRequestStore.getState().setCurrentEditorData({
      method: 'GET',
      url: 'https://api.example.com/secure',
      target: 'Inherit',
      headers: '{"Accept": "application/json"}',
      body: '',
      auth: { type: 'bearer', token: 'secret-token-123' },
    });

    await renderEditorPane('ws-1', null);

    const sendButton = screen.getByRole('button', { name: /Enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(capturedHeaders['Authorization']).toBe('Bearer secret-token-123');
      expect(capturedHeaders['Accept']).toBe('application/json');
    });
  });

  it('injects Basic auth credentials into headers on send', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.spyOn(global, 'fetch').mockImplementation((input: any, init: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-1/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      if (url.includes('/api/requests/execute')) {
        const parsed = JSON.parse(init.body);
        capturedHeaders = parsed.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ statusCode: 200 }),
        } as any);
      }
      return Promise.resolve({ ok: true } as any);
    });

    useRequestStore.getState().setCurrentEditorData({
      method: 'GET',
      url: 'https://api.example.com/basic',
      target: 'Inherit',
      headers: '',
      body: '',
      auth: { type: 'basic', username: 'admin', password: 'password123' },
    });

    await renderEditorPane('ws-1', null);

    const sendButton = screen.getByRole('button', { name: /Enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    const expectedB64 = btoa('admin:password123');
    await waitFor(() => {
      expect(capturedHeaders['Authorization']).toBe(`Basic ${expectedB64}`);
    });
  });

  it('injects ApiKey into headers on send', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.spyOn(global, 'fetch').mockImplementation((input: any, init: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-1/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      if (url.includes('/api/requests/execute')) {
        const parsed = JSON.parse(init.body);
        capturedHeaders = parsed.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ statusCode: 200 }),
        } as any);
      }
      return Promise.resolve({ ok: true } as any);
    });

    useRequestStore.getState().setCurrentEditorData({
      method: 'GET',
      url: 'https://api.example.com/apikey',
      target: 'Inherit',
      headers: '',
      body: '',
      auth: { type: 'apikey', key: 'X-API-KEY', value: 'key-val-456' },
    });

    await renderEditorPane('ws-1', null);

    const sendButton = screen.getByRole('button', { name: /Enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(capturedHeaders['X-API-KEY']).toBe('key-val-456');
    });
  });

  it('guards against non-object or non-string values in parsed headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.spyOn(global, 'fetch').mockImplementation((input: any, init: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-1/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      if (url.includes('/api/requests/execute')) {
        const parsed = JSON.parse(init.body);
        capturedHeaders = parsed.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ statusCode: 200 }),
        } as any);
      }
      return Promise.resolve({ ok: true } as any);
    });

    useRequestStore.getState().setCurrentEditorData({
      method: 'GET',
      url: 'https://api.example.com/defensive',
      target: 'Inherit',
      headers: '{"x-num": 123, "x-bool": true}',
      body: '',
      auth: { type: 'none' },
    });

    await renderEditorPane('ws-1', null);

    const sendButton = screen.getByRole('button', { name: /Enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(capturedHeaders['x-num']).toBe('123');
      expect(capturedHeaders['x-bool']).toBe('true');
    });
  });
});
