import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceEditorPane } from './WorkspaceEditorPane';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { useLayoutStore, INITIAL_LAYOUT_STATE } from '@/stores/useLayoutStore';
import { useRequestStore, getScratchpadKey } from '@/stores/useRequestStore';
import { useEnvironmentStore } from '@/stores/useEnvironmentStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { WorkspaceTreeDto } from '@/lib/treeApi';
import { clearSidecarInfoCache, getCachedSidecarInfo } from '@/lib/desktop/runtime';

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
  usePathname: () => '/',
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
    clearSidecarInfoCache();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
    window.innerWidth = 1024;
    useLayoutStore.setState(INITIAL_LAYOUT_STATE);
    useRequestStore.getState().reset();
    useEnvironmentStore.getState().reset();
    useDeviceStore.getState().reset();

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
    clearSidecarInfoCache();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
    window.innerWidth = 1024;
  });

  it('renders RequestEditor, central PanelSplitter, and ResponseViewer on desktop', async () => {
    await renderEditorPane('ws-1', null);

    // Verify main components are present
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('panel-splitter-request-response-splitter')).toBeInTheDocument();
    expect(screen.getByTestId('response-viewer-container')).toBeInTheDocument();
    expect(screen.getByText(/Send a request to see the response|Dispare uma requisição/i)).toBeInTheDocument();
  });

  it('preserves active tab when navigating between different requests', async () => {
    let result: any;
    await act(async () => {
      result = render(
        <WorkspaceProvider workspaceId="ws-1">
          <WorkspaceEditorPane workspaceId="ws-1" requestId="req-1" />
        </WorkspaceProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /specification|especificação/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });

    // Click Body tab
    const bodyTab = screen.getByRole('tab', { name: /body|corpo/i });
    act(() => {
      fireEvent.click(bodyTab);
    });
    expect(bodyTab).toHaveAttribute('aria-selected', 'true');
    expect(useLayoutStore.getState().activeRequestTab).toBe('body');

    // Switch to another request
    await act(async () => {
      result.rerender(
        <WorkspaceProvider workspaceId="ws-1">
          <WorkspaceEditorPane workspaceId="ws-1" requestId="req-2" />
        </WorkspaceProvider>
      );
    });
    expect(screen.getByRole('tab', { name: /body|corpo/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders request bar spanning full canvas width with bottom split for details and response', async () => {
    await renderEditorPane('ws-1', 'req-1');
    const urlInput = screen.getByRole('textbox', { name: /request url|url da requisição/i });
    expect(urlInput).toBeInTheDocument();
    expect(screen.getByTestId('response-viewer-container')).toBeInTheDocument();
  });

  it('applies requestResponseRatio from useLayoutStore to desktop layout', async () => {
    useLayoutStore.setState({ requestResponseRatio: 65 });
    await renderEditorPane('ws-1', null);

    const splitter = screen.getByTestId('panel-splitter-request-response-splitter');
    expect(splitter).toHaveAttribute('aria-valuenow', '65');
  });

  it('switches between request and response views on mobile', async () => {
    window.innerWidth = 500;
    window.dispatchEvent(new Event('resize'));

    await renderEditorPane('ws-1', null);

    // Click on mobile 'Response' button
    const responseBtn = screen.getByRole('button', { name: /^response$/i });
    fireEvent.click(responseBtn);

    expect(useLayoutStore.getState().activeMobilePane).toBe('response');

    // Click back to 'Request' button
    const requestBtn = screen.getByRole('button', { name: /^Request$/i });
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
    expect(screen.getByText(/Send a request to see the response|Dispare uma requisição/i)).toBeInTheDocument();
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
    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
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

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
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

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
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

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
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

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
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

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
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

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
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

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(capturedHeaders['x-num']).toBe('123');
      expect(capturedHeaders['x-bool']).toBe('true');
    });
  });

  it('dispatches workspaceId in execute payload on handleSend', async () => {
    let capturedBody: any = null;
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
        capturedBody = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ statusCode: 200 }),
        } as any);
      }
      return Promise.resolve({ ok: true } as any);
    });

    await renderEditorPane('ws-1', 'req-1');

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://api.example.com/users')).toBeInTheDocument();
    });

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(capturedBody).toBeDefined();
      expect(capturedBody.workspaceId).toBe('ws-1');
    });
  });

  it('safely encodes unicode characters in Basic auth credentials without throwing', async () => {
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
      url: 'https://api.example.com/basic-unicode',
      target: 'Inherit',
      headers: '',
      body: '',
      auth: { type: 'basic', username: 'usuário', password: 'senh@çã' },
    });

    await renderEditorPane('ws-1', null);

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    const rawCreds = 'usuário:senh@çã';
    const expectedB64 = btoa(unescape(encodeURIComponent(rawCreds)));
    await waitFor(() => {
      expect(capturedHeaders['Authorization']).toBe(`Basic ${expectedB64}`);
    });
  });

  it('does not overwrite currentEditorData when editing an existing request', async () => {
    const scratchData = {
      method: 'POST' as const,
      url: 'https://scratchpad.example.com',
      target: 'Inherit' as const,
      headers: '{"x-scratch": "true"}',
      body: '{"draft": true}',
      auth: { type: 'none' as const },
    };
    useRequestStore.getState().setCurrentEditorData(scratchData);

    await renderEditorPane('ws-1', 'req-1');

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://api.example.com/users')).toBeInTheDocument();
    });

    const urlInput = screen.getByDisplayValue('https://api.example.com/users');
    act(() => {
      fireEvent.change(urlInput, { target: { value: 'https://api.example.com/users/modified' } });
    });

    expect(useRequestStore.getState().currentEditorData?.url).toBe('https://scratchpad.example.com');
  });

  it('enables Send button when target is Agent and an agent is online in useDeviceStore (even with null activeDeviceId)', async () => {
    // Populate useDeviceStore with an online agent, no activeDeviceId set
    useDeviceStore.getState().setDevices([
      {
        id: 'dev-online-1',
        name: 'Online Agent Device',
        tokenPrefix: 'apidot_dev_1111',
        createdAtUtc: '2026-10-27T00:00:00Z',
        isRevoked: false,
        isOnline: true,
      },
    ]);
    useDeviceStore.getState().setActiveDeviceId(null);

    useRequestStore.getState().setCurrentEditorData({
      method: 'GET',
      url: 'https://api.example.com/agent-target',
      target: 'Agent',
      headers: '',
      body: '',
      auth: { type: 'none' },
    });

    await renderEditorPane('ws-1', null);

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
    expect(sendButton).not.toBeDisabled();
  });

  it('disables Send button when target is Agent and all agents are offline', async () => {
    useDeviceStore.getState().setDevices([
      {
        id: 'dev-offline-1',
        name: 'Offline Agent Device',
        tokenPrefix: 'apidot_dev_2222',
        createdAtUtc: '2026-10-27T00:00:00Z',
        isRevoked: false,
        isOnline: false,
      },
    ]);
    useDeviceStore.getState().setActiveDeviceId(null);

    useRequestStore.getState().setCurrentEditorData({
      method: 'GET',
      url: 'https://api.example.com/agent-offline',
      target: 'Agent',
      headers: '',
      body: '',
      auth: { type: 'none' },
    });

    await renderEditorPane('ws-1', null);

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
    expect(sendButton).toBeDisabled();
  });

  it('disables Send button when target is Agent and explicitly chosen active device is offline', async () => {
    useDeviceStore.getState().setDevices([
      {
        id: 'dev-offline-1',
        name: 'Offline Node',
        tokenPrefix: 'apidot_dev_2222',
        createdAtUtc: '2026-10-27T00:00:00Z',
        isRevoked: false,
        isOnline: false,
      },
      {
        id: 'dev-online-2',
        name: 'Online Node',
        tokenPrefix: 'apidot_dev_3333',
        createdAtUtc: '2026-10-27T00:00:00Z',
        isRevoked: false,
        isOnline: true,
      },
    ]);
    // Explicitly select the offline device
    useDeviceStore.getState().setActiveDeviceId('dev-offline-1');

    useRequestStore.getState().setCurrentEditorData({
      method: 'GET',
      url: 'https://api.example.com/agent-explicit-offline',
      target: 'Agent',
      headers: '',
      body: '',
      auth: { type: 'none' },
    });

    await renderEditorPane('ws-1', null);

    const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
    expect(sendButton).toBeDisabled();
  });

  describe('Desktop Sidecar Routing', () => {
    it('dispatches to sidecar loopback endpoint when running in desktop mode with Agent target', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        port: 54321,
        secret: 'tauri-sidecar-secret-123',
      });
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      // Set agent online so Send is enabled
      useDeviceStore.getState().setDevices([
        {
          id: 'dev-1',
          name: 'Local Agent',
          tokenPrefix: 'dev_123',
          createdAtUtc: '2026-11-01T00:00:00Z',
          isRevoked: false,
          isOnline: true,
        },
      ]);

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
        const url = String(input);
        if (url.includes('/api/workspaces/ws-1/tree')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockTree,
          } as any);
        }
        if (url === 'http://127.0.0.1:54321/execute') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              statusCode: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ via: 'desktop-sidecar' }),
            }),
          } as any);
        }
        return Promise.resolve({ ok: true } as any);
      });

      useRequestStore.getState().setCurrentEditorData({
        method: 'GET',
        url: 'http://localhost:3000/api/local',
        target: 'Agent',
        headers: '',
        body: '',
        auth: { type: 'none' },
      });

      await renderEditorPane('ws-1', null);

      const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_sidecar_info');
        expect(fetchSpy).toHaveBeenCalledWith(
          'http://127.0.0.1:54321/execute',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'X-ApiDot-Sidecar-Secret': 'tauri-sidecar-secret-123',
              'Content-Type': 'application/json',
            }),
          })
        );
      });

      // Verify server execute endpoint was never called
      const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(calledUrls).not.toContain('/api/requests/execute');

      // Verify that dispatch payload does NOT contain target string (Finding 1: Native AOT compatibility)
      const executeCall = fetchSpy.mock.calls.find((call) => String(call[0]) === 'http://127.0.0.1:54321/execute');
      expect(executeCall).toBeDefined();
      const postedDispatch = JSON.parse(String(executeCall?.[1]?.body || '{}'));
      expect(postedDispatch.target).toBeUndefined();
      expect(typeof postedDispatch.bodyType).toBe('number');

      // Verify response was saved to store
      const scratchKey = getScratchpadKey('ws-1');
      const response = useRequestStore.getState().responsesByRequestId[scratchKey];
      expect(response).toBeDefined();
      expect(response?.statusCode).toBe(200);
      expect(response?.body).toContain('desktop-sidecar');
    });

    it('dispatches to sidecar loopback when running in desktop mode and browser is offline', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        port: 49152,
        secret: 'offline-secret-456',
      });
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
          const url = String(input);
          if (url.includes('/api/workspaces/ws-1/tree')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => mockTree,
            } as any);
          }
          if (url === 'http://127.0.0.1:49152/execute') {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({
                statusCode: 200,
                statusText: 'OK',
                body: JSON.stringify({ offline: true }),
              }),
            } as any);
          }
          return Promise.resolve({ ok: true } as any);
        });

        // Request has target Server, but we are offline on desktop
        useRequestStore.getState().setCurrentEditorData({
          method: 'GET',
          url: 'http://localhost:8080/data',
          target: 'Server',
          headers: '',
          body: '',
          auth: { type: 'none' },
        });

        await renderEditorPane('ws-1', null);

        const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
        await act(async () => {
          fireEvent.click(sendButton);
        });

        await waitFor(() => {
          expect(fetchSpy).toHaveBeenCalledWith(
            'http://127.0.0.1:49152/execute',
            expect.objectContaining({
              method: 'POST',
              headers: expect.objectContaining({
                'X-ApiDot-Sidecar-Secret': 'offline-secret-456',
              }),
            })
          );
        });
      } finally {
        Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
      }
    });

    it('dispatches to /api/requests/execute when in desktop mode with Server target and online', async () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
        const url = String(input);
        if (url.includes('/api/workspaces/ws-1/tree')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockTree,
          } as any);
        }
        if (url === '/api/requests/execute') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              statusCode: 200,
              statusText: 'OK',
              body: JSON.stringify({ via: 'cloud-server' }),
            }),
          } as any);
        }
        return Promise.resolve({ ok: true } as any);
      });

      useRequestStore.getState().setCurrentEditorData({
        method: 'GET',
        url: 'https://api.cloud.com/items',
        target: 'Server',
        headers: '',
        body: '',
        auth: { type: 'none' },
      });

      await renderEditorPane('ws-1', null);

      const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          '/api/requests/execute',
          expect.objectContaining({ method: 'POST' })
        );
      });

      const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(calledUrls.some((u) => u.startsWith('http://127.0.0.1'))).toBe(false);
    });

    it('dispatches to /api/requests/execute when running in web browser mode even if target is Agent', async () => {
      // Ensure web environment (not desktop)
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).__TAURI__;

      useDeviceStore.getState().setDevices([
        {
          id: 'dev-1',
          name: 'Hub Connected Device',
          tokenPrefix: 'hub_dev',
          createdAtUtc: '2026-11-01T00:00:00Z',
          isRevoked: false,
          isOnline: true,
        },
      ]);

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
        const url = String(input);
        if (url.includes('/api/workspaces/ws-1/tree')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockTree,
          } as any);
        }
        if (url === '/api/requests/execute') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              statusCode: 200,
              statusText: 'OK',
              body: JSON.stringify({ routedVia: 'hub-server' }),
            }),
          } as any);
        }
        return Promise.resolve({ ok: true } as any);
      });

      useRequestStore.getState().setCurrentEditorData({
        method: 'GET',
        url: 'http://my-agent-host/status',
        target: 'Agent',
        headers: '',
        body: '',
        auth: { type: 'none' },
      });

      await renderEditorPane('ws-1', null);

      const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          '/api/requests/execute',
          expect.objectContaining({ method: 'POST' })
        );
      });

      const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(calledUrls.some((u) => u.startsWith('http://127.0.0.1'))).toBe(false);
    });

    it('enables Send button in desktop mode with Agent target even if useDeviceStore has no registered devices (Finding 2)', async () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      useDeviceStore.getState().setDevices([]);
      useDeviceStore.getState().setActiveDeviceId(null);

      useRequestStore.getState().setCurrentEditorData({
        method: 'GET',
        url: 'http://localhost:3000/api/local',
        target: 'Agent',
        headers: '',
        body: '',
        auth: { type: 'none' },
      });

      await renderEditorPane('ws-1', null);

      const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
      expect(sendButton).not.toBeDisabled();
    });

    it('resolves target in nested folders respecting parentFolder.defaultTarget when subFolder is Inherit (Finding 3)', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        port: 54321,
        secret: 'nested-folder-secret',
      });
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      const treeWithNestedFolders: WorkspaceTreeDto = {
        workspaceId: 'ws-nested',
        workspaceName: 'Nested WS',
        collections: [
          {
            id: 'col-nested',
            name: 'API',
            defaultTarget: 'Server', // Collection is explicitly Server
            openApiSpecUrl: null,
            folders: [
              {
                id: 'folder-parent',
                name: 'Parent Folder',
                defaultTarget: 'Agent', // Parent folder overrides collection with Agent!
                collectionId: 'col-nested',
                parentFolderId: null,
                requests: [],
                subFolders: [
                  {
                    id: 'folder-sub',
                    name: 'Sub Folder',
                    defaultTarget: 'Inherit', // Sub folder inherits from parent folder!
                    collectionId: 'col-nested',
                    parentFolderId: 'folder-parent',
                    requests: [
                      {
                        id: 'req-nested',
                        name: 'Nested Request',
                        method: 'GET',
                        url: 'http://localhost:3000/nested',
                        target: 'Inherit', // Request inherits from sub folder!
                        bodyType: 'None',
                        bodyContent: null,
                        headersJson: '',
                        collectionId: 'col-nested',
                        folderId: 'folder-sub',
                      },
                    ],
                    subFolders: [],
                  },
                ],
              },
            ],
            requests: [],
          },
        ],
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
        const url = String(input);
        if (url.includes('/api/workspaces/ws-nested/tree')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => treeWithNestedFolders,
          } as any);
        }
        if (url === 'http://127.0.0.1:54321/execute') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              statusCode: 200,
              statusText: 'OK',
              body: JSON.stringify({ nestedSuccess: true }),
            }),
          } as any);
        }
        return Promise.resolve({ ok: true } as any);
      });

      await renderEditorPane('ws-nested', 'req-nested', treeWithNestedFolders);

      await waitFor(() => {
        expect(screen.getByDisplayValue('http://localhost:3000/nested')).toBeInTheDocument();
      });

      const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      // Because req-nested -> folder-sub (Inherit) -> folder-parent (Agent), resolved target is Agent!
      // In desktop mode, Agent target dispatches to sidecar loopback:
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          'http://127.0.0.1:54321/execute',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'X-ApiDot-Sidecar-Secret': 'nested-folder-secret',
            }),
          })
        );
      });

      const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(calledUrls).not.toContain('/api/requests/execute');
    });

    it('invalidates sidecar info cache when desktop sidecar dispatch fails (Finding 4)', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        port: 54321,
        secret: 'stale-secret',
      });
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

      vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
        const url = String(input);
        if (url.includes('/api/workspaces/ws-1/tree')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => mockTree } as any);
        }
        if (url.startsWith('http://127.0.0.1')) {
          return Promise.reject(new Error('Connection refused at 54321'));
        }
        return Promise.resolve({ ok: true } as any);
      });

      useRequestStore.getState().setCurrentEditorData({
        method: 'GET',
        url: 'http://localhost:3000/api/local',
        target: 'Agent',
        headers: '',
        body: '',
        auth: { type: 'none' },
      });

      await renderEditorPane('ws-1', null);

      const sendButton = screen.getByRole('button', { name: /send request|enviar requisição/i });
      await act(async () => {
        fireEvent.click(sendButton);
      });

      await waitFor(() => {
        const scratchKey = getScratchpadKey('ws-1');
        const resp = useRequestStore.getState().responsesByRequestId[scratchKey];
        expect(resp?.statusCode).toBe(0);
        expect(resp?.errorMessage).toContain('Connection refused');
      });

      // Verify that getCachedSidecarInfo() is now null because clearSidecarInfoCache was called in catch block
      expect(getCachedSidecarInfo()).toBeNull();
    });
  });
});
