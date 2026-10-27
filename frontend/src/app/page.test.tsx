import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Home from './page';
import { resolveVariables, interpolateVariables } from '@/lib/variables';
import { VariableItem } from '@/components/environment/VariableGrid';
import { EnvironmentGroup } from '@/components/environment/EnvironmentModal';
import { WorkspaceTreeDto } from '@/lib/treeApi';

describe('page variable resolution and interpolation helpers', () => {
  describe('resolveVariables', () => {
    it('should resolve cascading variables from Globals -> Collection -> Active Environment', () => {
      const globals: VariableItem[] = [
        { key: 'baseUrl', value: 'https://global.api.com', isActive: true },
        { key: 'timeout', value: '1000', isActive: true },
        { key: 'inactiveVar', value: 'skipped', isActive: false },
      ];

      const collectionVariables: VariableItem[] = [
        { key: 'timeout', value: '5000', isActive: true }, // overrides global
        { key: 'collectionHeader', value: 'coll-1', isActive: true },
      ];

      const environments: EnvironmentGroup[] = [
        {
          name: 'Development',
          variables: [
            { key: 'baseUrl', value: 'https://dev.api.com', isActive: true }, // overrides collection & global
            { key: 'envSecret', value: 'dev-token', isActive: true, isSecret: true },
          ],
        },
        {
          name: 'Production',
          variables: [
            { key: 'baseUrl', value: 'https://prod.api.com', isActive: true },
          ],
        },
      ];

      const resolved = resolveVariables(globals, collectionVariables, environments, 'Development');

      expect(resolved).toEqual({
        baseUrl: 'https://dev.api.com',
        timeout: '5000',
        collectionHeader: 'coll-1',
        envSecret: 'dev-token',
      });
      expect(resolved['inactiveVar']).toBeUndefined();
    });

    it('should resolve without active environment', () => {
      const globals: VariableItem[] = [
        { key: 'baseUrl', value: 'https://global.api.com', isActive: true },
      ];
      const collectionVariables: VariableItem[] = [];
      const environments: EnvironmentGroup[] = [
        {
          name: 'Development',
          variables: [{ key: 'baseUrl', value: 'https://dev.api.com', isActive: true }],
        },
      ];

      const resolved = resolveVariables(globals, collectionVariables, environments, null);

      expect(resolved).toEqual({
        baseUrl: 'https://global.api.com',
      });
    });
  });

  describe('interpolateVariables', () => {
    it('should replace {{var}} and {{ var }} with resolved values', () => {
      const variables = {
        baseUrl: 'https://api.example.com',
        version: 'v2',
      };

      const result = interpolateVariables('{{baseUrl}}/{{ version }}/users', variables);
      expect(result).toBe('https://api.example.com/v2/users');
    });

    it('should leave unknown variables intact', () => {
      const variables = { baseUrl: 'https://api.example.com' };
      const result = interpolateVariables('{{baseUrl}}/{{unknown}}', variables);
      expect(result).toBe('https://api.example.com/{{unknown}}');
    });

    it('should handle dynamic variables ($guid, $timestamp, $randomInt)', () => {
      const guidResult = interpolateVariables('{{$guid}}', {});
      expect(guidResult).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const timestampResult = interpolateVariables('{{$timestamp}}', {});
      expect(Number(timestampResult)).toBeGreaterThan(0);

      const randomIntResult = interpolateVariables('{{$randomInt}}', {});
      const parsedNum = Number(randomIntResult);
      expect(parsedNum).toBeGreaterThanOrEqual(1000);
      expect(parsedNum).toBeLessThan(10000);
    });

    it('should return empty/null template as-is', () => {
      expect(interpolateVariables('', {})).toBe('');
    });

    it('should interpolate response chaining tokens {{$request["id"].response...}}', () => {
      const mockRequests = [
        {
          id: 'auth-req',
          name: 'Login Auth',
          method: 'POST',
          response: {
            statusCode: 200,
            headers: {
              'x-access-token': 'jwt-access-abc-123',
            },
            body: {
              token: 'secret-token-xyz',
              user: {
                id: 42,
                roles: ['admin', 'editor'],
              },
            },
          },
        },
      ];

      // Body property
      expect(
        interpolateVariables('Bearer {{$request["auth-req"].response.body.token}}', {}, mockRequests)
      ).toBe('Bearer secret-token-xyz');

      // Nested property and array index
      expect(
        interpolateVariables('User ID: {{$request["auth-req"].response.body.user.id}}', {}, mockRequests)
      ).toBe('User ID: 42');
      expect(
        interpolateVariables('Role: {{$request["auth-req"].response.body.user.roles[0]}}', {}, mockRequests)
      ).toBe('Role: admin');

      // Status code
      expect(
        interpolateVariables('Status: {{$request["auth-req"].response.status}}', {}, mockRequests)
      ).toBe('Status: 200');

      // Header lookup
      expect(
        interpolateVariables('Token: {{$request["auth-req"].response.headers["x-access-token"]}}', {}, mockRequests)
      ).toBe('Token: jwt-access-abc-123');

      // Safe fallback for non-existent request or field
      expect(
        interpolateVariables('{{$request["missing"].response.body.token}}', {}, mockRequests)
      ).toBe('{{$request["missing"].response.body.token}}');
      expect(
        interpolateVariables('{{$request["auth-req"].response.body.nonExistent}}', {}, mockRequests)
      ).toBe('{{$request["auth-req"].response.body.nonExistent}}');
    });
  });
});

describe('Home Page Collection Sync and Settings Integration', () => {
  const mockSyncWorkspace = {
    id: 'ws-sync-1',
    name: 'Sync Workspace',
    createdAtUtc: '2026-10-26T00:00:00Z',
  };

  const mockSyncTree: WorkspaceTreeDto = {
    workspaceId: 'ws-sync-1',
    workspaceName: 'Sync Workspace',
    collections: [
      {
        id: 'col-sync-1',
        name: 'Coleção Teste',
        defaultTarget: 'Inherit',
        openApiSpecUrl: 'https://api.example.com/openapi.json',
        folders: [],
        requests: [],
      },
    ],
  };

  const mockFetchForSync = (customHandler?: (url: string, init?: any) => Promise<any> | undefined) => {
    return vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
      const url = String(input);
      if (customHandler) {
        const customRes = customHandler(url, init);
        if (customRes !== undefined) return customRes;
      }
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockSyncTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockSyncWorkspace],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens collection settings modal when settings button is clicked on collection nav', async () => {
    mockFetchForSync();
    render(<Home />);

    const settingsBtns = await screen.findAllByRole('button', {
      name: /configurações da coleção|configurações/i,
    });
    expect(settingsBtns.length).toBeGreaterThan(0);
    fireEvent.click(settingsBtns[0]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/configurações da coleção/i)).toBeInTheDocument();
  });

  it('displays audit summary banner after successful synchronization in settings modal', async () => {
    const mockSyncReport = {
      addedRequests: 4,
      updatedRequests: 1,
      fieldsAdded: 2,
      fieldsRemoved: 0,
      fieldsPreserved: 3,
    };
    mockFetchForSync((url) => {
      if (url.includes('/sync')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSyncReport,
        } as any);
      }
    });

    render(<Home />);

    const settingsBtns = await screen.findAllByRole('button', {
      name: /configurações da coleção|configurações/i,
    });
    fireEvent.click(settingsBtns[0]);

    const dialog = screen.getByRole('dialog');
    const openApiTab = within(dialog).getByRole('tab', { name: /openapi \/ sync/i });
    fireEvent.click(openApiTab);
    const urlInput = within(dialog).getByLabelText(/url da especificação/i);
    fireEvent.change(urlInput, { target: { value: 'https://api.example.com/openapi.json' } });
    const syncBtn = within(dialog).getByRole('button', { name: /sincronizar coleção/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(screen.getByTestId('audit-summary-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/4 requisições adicionadas/i)).toBeInTheDocument();
    expect(screen.getByText(/1 atualizadas/i)).toBeInTheDocument();
  });

  it('dismisses audit summary banner when close button is clicked', async () => {
    const mockSyncReport = {
      addedRequests: 2,
      updatedRequests: 0,
      fieldsAdded: 1,
      fieldsRemoved: 1,
      fieldsPreserved: 5,
    };
    mockFetchForSync((url) => {
      if (url.includes('/sync')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSyncReport,
        } as any);
      }
    });

    render(<Home />);

    const settingsBtns = await screen.findAllByRole('button', {
      name: /configurações da coleção|configurações/i,
    });
    fireEvent.click(settingsBtns[0]);

    const dialog = screen.getByRole('dialog');
    const openApiTab = within(dialog).getByRole('tab', { name: /openapi \/ sync/i });
    fireEvent.click(openApiTab);
    const syncBtn = within(dialog).getByRole('button', { name: /sincronizar coleção/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(screen.getByTestId('audit-summary-banner')).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: /fechar notificação de auditoria/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('audit-summary-banner')).toBeNull();
  });

  it('triggers sync in collection settings and shows audit banner', async () => {
    const mockSyncReport = {
      addedRequests: 2,
      updatedRequests: 0,
      fieldsAdded: 1,
      fieldsRemoved: 1,
      fieldsPreserved: 5,
    };
    mockFetchForSync((url) => {
      if (url.includes('/sync')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSyncReport,
        } as any);
      }
    });

    render(<Home />);

    const settingsBtns = await screen.findAllByRole('button', {
      name: /configurações da coleção|configurações/i,
    });
    fireEvent.click(settingsBtns[0]);

    const dialog = screen.getByRole('dialog');
    const openApiTab = within(dialog).getByRole('tab', { name: /openapi \/ sync/i });
    fireEvent.click(openApiTab);
    const syncBtn = within(dialog).getByRole('button', { name: /sincronizar coleção/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(screen.getByTestId('audit-summary-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/2 requisições adicionadas/i)).toBeInTheDocument();
  });

  it('displays sync error banner when sync fails with non-ok response', async () => {
    mockFetchForSync((url) => {
      if (url.includes('/sync')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ detail: 'Falha ao conectar ao servidor remoto de OpenAPI' }),
        } as any);
      }
    });

    render(<Home />);

    const settingsBtns = await screen.findAllByRole('button', {
      name: /configurações da coleção|configurações/i,
    });
    fireEvent.click(settingsBtns[0]);

    const dialog = screen.getByRole('dialog');
    const openApiTab = within(dialog).getByRole('tab', { name: /openapi \/ sync/i });
    fireEvent.click(openApiTab);
    const syncBtn = within(dialog).getByRole('button', { name: /sincronizar coleção/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toBeInTheDocument();
      expect(
        within(dialog).getByText('Falha ao conectar ao servidor remoto de OpenAPI')
      ).toBeInTheDocument();
    });
  });

  it('displays sync error banner when sync network fetch throws', async () => {
    mockFetchForSync((url) => {
      if (url.includes('/sync')) {
        return Promise.reject(new Error('Network error on quick sync'));
      }
    });

    render(<Home />);

    const settingsBtns = await screen.findAllByRole('button', {
      name: /configurações da coleção|configurações/i,
    });
    fireEvent.click(settingsBtns[0]);

    const dialog = screen.getByRole('dialog');
    const openApiTab = within(dialog).getByRole('tab', { name: /openapi \/ sync/i });
    fireEvent.click(openApiTab);
    const syncBtn = within(dialog).getByRole('button', { name: /sincronizar coleção/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toBeInTheDocument();
      expect(within(dialog).getByText('Network error on quick sync')).toBeInTheDocument();
    });
  });

  it('propagates error when saving collection spec fails with HTTP error', async () => {
    mockFetchForSync((url) => {
      if (url.includes('/openapi')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ detail: 'Especificação OpenAPI inválida fornecida' }),
        } as any);
      }
    });

    render(<Home />);

    const settingsBtns = await screen.findAllByRole('button', {
      name: /configurações da coleção|configurações/i,
    });
    fireEvent.click(settingsBtns[0]);

    const dialog = screen.getByRole('dialog');
    const openApiTab = within(dialog).getByRole('tab', { name: /openapi \/ sync/i });
    fireEvent.click(openApiTab);
    const urlInput = within(dialog).getByLabelText(/url da especificação/i);
    fireEvent.change(urlInput, { target: { value: 'https://bad.spec.url/spec.json' } });

    const saveBtn = within(dialog).getByRole('button', { name: /salvar alterações/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toBeInTheDocument();
      expect(
        within(dialog).getByText('Especificação OpenAPI inválida fornecida')
      ).toBeInTheDocument();
    });

    // Modal should remain open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('decodes Base64 response body from /api/requests/execute into decoded UTF-8 text', async () => {
    const rawContent = '{"message":"hello world"}';
    const base64Body = btoa(rawContent);

    mockFetchForSync((url) => {
      if (url.includes('/api/requests/execute')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
            forEach: () => {},
          },
          json: async () => ({
            statusCode: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: base64Body,
          }),
        } as any);
      }
    });

    render(<Home />);

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.change(urlInput, { target: { value: 'https://api.example.com/test' } });

    const sendBtn = screen.getByRole('button', { name: /enviar requisição|enviar/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText(/"hello world"/i)).toBeInTheDocument();
    });
  });

  it('handles empty Base64 body from /api/requests/execute cleanly', async () => {
    mockFetchForSync((url) => {
      if (url.includes('/api/requests/execute')) {
        return Promise.resolve({
          ok: true,
          status: 204,
          statusText: 'No Content',
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
            forEach: () => {},
          },
          json: async () => ({
            statusCode: 204,
            statusText: 'No Content',
            headers: {},
            body: '',
          }),
        } as any);
      }
    });

    render(<Home />);

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.change(urlInput, { target: { value: 'https://api.example.com/empty' } });

    const sendBtn = screen.getByRole('button', { name: /enviar requisição|enviar/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('204')).toBeInTheDocument();
    });
  });
});

describe('Home Page Collection Tree & Request Lifecycle Integration', () => {
  const mockWorkspaceTree: WorkspaceTreeDto = {
    workspaceId: '00000000-0000-0000-0000-000000000001',
    workspaceName: 'Default Workspace',
    collections: [
      {
        id: 'col-auth',
        name: 'Auth API Collection',
        defaultTarget: 'Inherit',
        openApiSpecUrl: 'https://api.example.com/openapi.json',
        folders: [
          {
            id: 'fold-v1',
            name: 'V1 Auth',
            collectionId: 'col-auth',
            parentFolderId: null,
            defaultTarget: 'Inherit',
            subFolders: [],
            requests: [
              {
                id: 'req-login',
                name: 'Login User',
                method: 'POST',
                url: 'https://api.example.com/v1/auth/login',
                target: 'Inherit',
                bodyType: 'Json',
                headersJson: '{"Content-Type": "application/json"}',
                bodyContent: '{"user": "admin"}',
                collectionId: 'col-auth',
                folderId: 'fold-v1',
              },
            ],
          },
        ],
        requests: [
          {
            id: 'req-ping',
            name: 'Ping Service',
            method: 'GET',
            url: 'https://api.example.com/health/ping',
            target: 'Server',
            bodyType: 'None',
            headersJson: '{"Accept": "application/json"}',
            bodyContent: null,
            collectionId: 'col-auth',
            folderId: null,
          },
        ],
      },
    ],
  };

  const mockDefaultWorkspace = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Default Workspace',
    createdAtUtc: '2026-10-26T00:00:00Z',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads tree from /api/workspaces/.../tree on mount and renders collections, folders, and requests', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaceTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockDefaultWorkspace],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Auth API Collection')).toBeInTheDocument();
      expect(screen.getByText('V1 Auth')).toBeInTheDocument();
      expect(screen.getByText('Login User')).toBeInTheDocument();
      expect(screen.getByText('Ping Service')).toBeInTheDocument();
    });

    // Verify unified sidebar header displays workspace switcher and quick actions
    const switcherTrigger = screen.getByTestId('workspace-switcher-trigger');
    const novoBtn = screen.getByRole('button', { name: /^novo$/i });
    const reloadBtn = screen.getByRole('button', { name: /recarregar árvore/i });
    const searchInput = screen.getByPlaceholderText(/filtrar por nome ou rota/i);

    expect(switcherTrigger).toBeInTheDocument();
    expect(switcherTrigger).toHaveTextContent('Default Workspace');
    expect(novoBtn).toBeInTheDocument();
    expect(reloadBtn).toBeInTheDocument();
    expect(searchInput).toBeInTheDocument();
  });

  it('loads request details into RequestEditor when clicking a request node in the tree', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaceTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockDefaultWorkspace],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Ping Service')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Ping Service'));

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    expect(urlInput).toHaveValue('https://api.example.com/health/ping');

    const methodSelect = screen.getByRole('combobox', { name: /método http/i });
    expect(methodSelect).toHaveValue('GET');

    expect(screen.getByTestId('request-title')).toHaveTextContent('Ping Service');
    expect(screen.getByTestId('headers-code-editor')).toBeInTheDocument();
  });

  it('loads folder request details and body into RequestEditor', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaceTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockDefaultWorkspace],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Login User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Login User'));

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    expect(urlInput).toHaveValue('https://api.example.com/v1/auth/login');

    const methodSelect = screen.getByRole('combobox', { name: /método http/i });
    expect(methodSelect).toHaveValue('POST');

    expect(screen.getByTestId('request-title')).toHaveTextContent('Login User');

    // Switch to Body tab and verify body editor is rendered
    const bodyTab = screen.getByRole('tab', { name: /corpo/i });
    fireEvent.click(bodyTab);
    expect(screen.getByTestId('body-code-editor')).toBeInTheDocument();
  });

  it('opens SaveRequestModal when pressing Ctrl+S on unsaved request and creates new request on submit', async () => {
    let postCalled = false;
    let postBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaceTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockDefaultWorkspace],
        } as any);
      }
      if (url.includes('/api/requests') && init?.method === 'POST') {
        postCalled = true;
        postBody = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'req-new-999',
            name: postBody.name,
            method: postBody.method,
            url: postBody.url,
            target: postBody.target,
            bodyType: postBody.bodyType,
            headersJson: postBody.headersJson,
            bodyContent: postBody.bodyContent,
            collectionId: postBody.collectionId,
            folderId: postBody.folderId,
          }),
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Auth API Collection')).toBeInTheDocument();
    });

    // Enter URL on scratchpad
    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.change(urlInput, { target: { value: 'https://api.example.com/v1/new-endpoint' } });

    // Press Ctrl+S
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    // Modal opens
    const modalTitle = await screen.findByRole('heading', { name: /salvar requisição/i });
    expect(modalTitle).toBeInTheDocument();

    const dialog = screen.getByRole('dialog', { name: /salvar requisição/i });
    const nameInput = within(dialog).getByRole('textbox', { name: /nome da requisição/i });
    fireEvent.change(nameInput, { target: { value: 'Minha Nova Rota' } });

    // Click submit in modal
    const submitBtn = within(dialog).getByRole('button', { name: /^salvar$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postCalled).toBe(true);
      expect(postBody.name).toBe('Minha Nova Rota');
      expect(postBody.url).toBe('https://api.example.com/v1/new-endpoint');
      expect(postBody.collectionId).toBe('col-auth');
      expect(screen.getByTestId('request-title')).toHaveTextContent('Minha Nova Rota');
    });

    // Modal closed
    expect(screen.queryByRole('dialog', { name: /salvar requisição/i })).toBeNull();
  });

  it('calls PUT /api/requests/{id} and clears dirty state when saving an existing request', async () => {
    let putCalled = false;
    let putBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaceTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockDefaultWorkspace],
        } as any);
      }
      if (url.includes('/api/requests/req-ping') && init?.method === 'PUT') {
        putCalled = true;
        putBody = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'req-ping',
            name: 'Ping Service',
            method: putBody.method,
            url: putBody.url,
            target: putBody.target,
            bodyType: putBody.bodyType,
            headersJson: putBody.headersJson,
            bodyContent: putBody.bodyContent,
            collectionId: 'col-auth',
            folderId: null,
          }),
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Ping Service')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Ping Service'));

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    expect(urlInput).toHaveValue('https://api.example.com/health/ping');
    expect(screen.queryByTestId('dirty-indicator')).toBeNull();

    // Modify URL
    fireEvent.change(urlInput, { target: { value: 'https://api.example.com/health/ping-v2' } });
    expect(screen.getByTestId('dirty-indicator')).toBeInTheDocument();

    // Click "Salvar" button in RequestEditor
    const saveBtn = screen.getByRole('button', { name: /salvar requisição/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(putCalled).toBe(true);
      expect(putBody.url).toBe('https://api.example.com/health/ping-v2');
      expect(screen.queryByTestId('dirty-indicator')).toBeNull();
    });
  });

  it('resets RequestEditor to a blank scratchpad when an active request is deleted', async () => {
    let deleteCalled = false;

    vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaceTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockDefaultWorkspace],
        } as any);
      }
      if (url.includes('/api/requests/req-ping') && init?.method === 'DELETE') {
        deleteCalled = true;
        return Promise.resolve({
          ok: true,
          status: 204,
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Ping Service')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Ping Service'));

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    expect(urlInput).toHaveValue('https://api.example.com/health/ping');
    expect(screen.getByTestId('request-title')).toHaveTextContent('Ping Service');

    // Right-click request in tree to open context menu
    fireEvent.contextMenu(screen.getAllByText('Ping Service')[0]);
    const deleteOption = screen.getByText(/^excluir$/i);
    fireEvent.click(deleteOption);

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
      expect(urlInput).toHaveValue('');
      expect(screen.getByTestId('request-title')).toHaveTextContent('Nova Requisição');
    });
  });
});

describe('Home Page Workspace Management & Clean State Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders clean empty workspace state when /api/workspaces returns []', async () => {
    localStorage.clear();
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    // Empty state heading and button rendered
    expect(await screen.findByText('Comece criando seu Workspace')).toBeInTheDocument();
    const createBtn = screen.getByRole('button', { name: /^criar workspace$/i });
    expect(createBtn).toBeInTheDocument();

    // WorkspaceSwitcher shows "Selecionar Workspace"
    const trigger = screen.getByTestId('workspace-switcher-trigger');
    expect(trigger).toHaveTextContent('Selecionar Workspace');

    // Verify zero-workspace state renders cleanly without duplicate toolbars or action buttons
    expect(screen.queryByRole('button', { name: /^novo$/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/filtrar por nome ou rota/i)).toBeNull();

    // No mock collections or fake default tree nodes exist
    expect(screen.queryByText('Coleção Padrão')).toBeNull();
    expect(screen.queryByText('Minha API')).toBeNull();

    // Verify /tree was NEVER fetched
    const treeCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).includes('/tree'));
    expect(treeCalls).toHaveLength(0);
  });

  it('opens WorkspaceModal when clicking Criar Workspace in empty state', async () => {
    localStorage.clear();
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    const createBtn = await screen.findByRole('button', { name: /^criar workspace$/i });
    fireEvent.click(createBtn);

    // Modal dialog is opened
    expect(screen.getByRole('dialog', { name: /novo workspace/i })).toBeInTheDocument();
    const nameInput = screen.getByRole('textbox', { name: /nome do workspace/i });
    expect(nameInput).toBeInTheDocument();
  });

  it('submitting WorkspaceModal creates workspace, updates switcher and loads its tree', async () => {
    localStorage.clear();
    let workspacesList: any[] = [];
    let createdWorkspace: any = null;

    vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces') && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        createdWorkspace = {
          id: 'ws-fin-100',
          name: body.name,
          createdAtUtc: '2026-10-26T00:00:00Z',
        };
        workspacesList = [createdWorkspace];
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => createdWorkspace,
        } as any);
      }
      if (url.includes('/api/workspaces/ws-fin-100/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workspaceId: 'ws-fin-100',
            workspaceName: 'Financeiro',
            collections: [
              {
                id: 'col-fin',
                name: 'Contas a Pagar',
                defaultTarget: 'Inherit',
                openApiSpecUrl: null,
                folders: [],
                requests: [],
              },
            ],
          }),
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => workspacesList,
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    const createBtn = await screen.findByRole('button', { name: /^criar workspace$/i });
    fireEvent.click(createBtn);

    const nameInput = screen.getByRole('textbox', { name: /nome do workspace/i });
    fireEvent.change(nameInput, { target: { value: 'Financeiro' } });

    const submitBtn = within(screen.getByRole('dialog', { name: /novo workspace/i })).getByRole('button', {
      name: /^criar workspace$/i,
    });
    fireEvent.click(submitBtn);

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /novo workspace/i })).toBeNull();
    });

    // Switcher reflects new active workspace
    expect(screen.getByTestId('workspace-switcher-trigger')).toHaveTextContent('Financeiro');

    // Tree renders the newly created workspace collections
    expect(await screen.findByText('Contas a Pagar')).toBeInTheDocument();

    // Persisted to localStorage
    expect(localStorage.getItem('apidot_active_workspace_id')).toBe('ws-fin-100');
  });

  it('switching workspace via WorkspaceSwitcher changes active tree and persists in localStorage', async () => {
    localStorage.clear();
    const ws1 = { id: 'ws-alpha', name: 'Workspace Alpha', createdAtUtc: '2026-10-26T00:00:00Z' };
    const ws2 = { id: 'ws-beta', name: 'Workspace Beta', createdAtUtc: '2026-10-26T00:00:00Z' };

    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-alpha/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workspaceId: 'ws-alpha',
            workspaceName: 'Workspace Alpha',
            collections: [
              {
                id: 'col-alpha',
                name: 'Alpha Collection',
                defaultTarget: 'Inherit',
                openApiSpecUrl: null,
                folders: [],
                requests: [],
              },
            ],
          }),
        } as any);
      }
      if (url.includes('/api/workspaces/ws-beta/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workspaceId: 'ws-beta',
            workspaceName: 'Workspace Beta',
            collections: [
              {
                id: 'col-beta',
                name: 'Beta Collection',
                defaultTarget: 'Inherit',
                openApiSpecUrl: null,
                folders: [],
                requests: [],
              },
            ],
          }),
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [ws1, ws2],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    // Initially loads Workspace Alpha
    expect(await screen.findByText('Alpha Collection')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-switcher-trigger')).toHaveTextContent('Workspace Alpha');

    // Click trigger to open dropdown
    fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));

    // Click Workspace Beta option
    const optionBeta = screen.getByTestId('workspace-option-ws-beta');
    fireEvent.click(optionBeta);

    // Switcher now displays Workspace Beta and loads Beta Collection
    expect(screen.getByTestId('workspace-switcher-trigger')).toHaveTextContent('Workspace Beta');
    expect(await screen.findByText('Beta Collection')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Collection')).toBeNull();

    // Persisted to localStorage
    expect(localStorage.getItem('apidot_active_workspace_id')).toBe('ws-beta');
  });

  it('restores active workspace from localStorage if it exists in the workspace list', async () => {
    const ws1 = { id: 'ws-alpha', name: 'Workspace Alpha', createdAtUtc: '2026-10-26T00:00:00Z' };
    const ws2 = { id: 'ws-beta', name: 'Workspace Beta', createdAtUtc: '2026-10-26T00:00:00Z' };
    localStorage.setItem('apidot_active_workspace_id', 'ws-beta');

    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-beta/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workspaceId: 'ws-beta',
            workspaceName: 'Workspace Beta',
            collections: [
              {
                id: 'col-beta',
                name: 'Beta Collection',
                defaultTarget: 'Inherit',
                openApiSpecUrl: null,
                folders: [],
                requests: [],
              },
            ],
          }),
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [ws1, ws2],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    expect(await screen.findByText('Beta Collection')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-switcher-trigger')).toHaveTextContent('Workspace Beta');
  });
});

describe('Home Page OpenAPI Import Modal & Global "+ Novo" Trigger Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const mockWs = { id: 'ws-import-1', name: 'Import Workspace', createdAtUtc: '2026-10-26T00:00:00Z' };

  const initialTree: WorkspaceTreeDto = {
    workspaceId: 'ws-import-1',
    workspaceName: 'Import Workspace',
    collections: [
      {
        id: 'col-existing-1',
        name: 'Coleção Existente',
        defaultTarget: 'Inherit',
        openApiSpecUrl: null,
        folders: [],
        requests: [],
      },
    ],
  };

  const importedCollectionDto: CollectionNodeDto = {
    id: 'col-imported-99',
    name: 'Petstore API',
    defaultTarget: 'Inherit',
    openApiSpecUrl: 'https://petstore.swagger.io/v2/swagger.json',
    folders: [
      {
        id: 'fold-pets',
        name: 'Pets',
        collectionId: 'col-imported-99',
        parentFolderId: null,
        defaultTarget: 'Inherit',
        subFolders: [],
        requests: [
          {
            id: 'req-pet-1',
            name: 'Find Pet by ID',
            method: 'GET',
            url: 'https://petstore.swagger.io/v2/pet/1',
            target: 'Inherit',
            bodyType: 'None',
            headersJson: '{}',
            collectionId: 'col-imported-99',
            folderId: 'fold-pets',
          },
        ],
      },
    ],
    requests: [
      {
        id: 'req-pet-top',
        name: 'Get Store Info',
        method: 'GET',
        url: 'https://petstore.swagger.io/v2/store',
        target: 'Inherit',
        bodyType: 'None',
        headersJson: '{}',
        collectionId: 'col-imported-99',
        folderId: null,
      },
    ],
  };

  it('opens OpenApiImportModal when clicking "+ Novo" -> "Importar OpenAPI" in toolbar', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => initialTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockWs],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Coleção Existente')).toBeInTheDocument();
    });

    // Click "+ Novo" in CollectionTree toolbar
    const newBtn = screen.getByRole('button', { name: /^novo$/i });
    fireEvent.click(newBtn);

    // Click "Importar OpenAPI" in dropdown menu
    const importOption = screen.getByText(/importar openapi/i);
    fireEvent.click(importOption);

    // OpenApiImportModal opens
    const dialog = screen.getByRole('dialog', { name: /importar especificação openapi/i });
    expect(dialog).toBeInTheDocument();
  });

  it('submits OpenAPI import, reloads tree, selects new collection, and shows audit banner', async () => {
    let importCalled = false;
    let importPayload: any = null;
    let treeFetchCount = 0;

    vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/api/collections/import-openapi') && init?.method === 'POST') {
        importCalled = true;
        importPayload = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => importedCollectionDto,
        } as any);
      }
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        treeFetchCount++;
        const currentTree = treeFetchCount > 1
          ? {
              ...initialTree,
              collections: [...initialTree.collections, importedCollectionDto],
            }
          : initialTree;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => currentTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockWs],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Coleção Existente')).toBeInTheDocument();
    });

    // Open modal via "+ Novo"
    fireEvent.click(screen.getByRole('button', { name: /^novo$/i }));
    fireEvent.click(screen.getByText(/importar openapi/i));

    const dialog = screen.getByRole('dialog', { name: /importar especificação openapi/i });
    const urlInput = within(dialog).getByLabelText(/url da especificação/i);
    fireEvent.change(urlInput, { target: { value: 'https://petstore.swagger.io/v2/swagger.json' } });

    const submitBtn = within(dialog).getByRole('button', { name: /criar e importar/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(importCalled).toBe(true);
      expect(importPayload).toEqual(
        expect.objectContaining({
          workspaceId: 'ws-import-1',
          specUrl: 'https://petstore.swagger.io/v2/swagger.json',
        })
      );
    });

    // Tree reloaded and shows Petstore API
    await waitFor(() => {
      expect(screen.getByText('Petstore API')).toBeInTheDocument();
    });

    // Audit summary banner is displayed with total requests (2)
    const banner = await screen.findByTestId('audit-summary-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Petstore API/i);
    expect(banner).toHaveTextContent(/2 requisições adicionadas/i);
  });

  it('opens OpenApiImportModal when right-clicking on empty tree area and selecting Importar OpenAPI', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => initialTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockWs],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Coleção Existente')).toBeInTheDocument();
    });

    const emptyArea = screen.getByTestId('collection-tree-empty-area');
    fireEvent.contextMenu(emptyArea);

    const importOption = screen.getByText(/importar openapi/i);
    fireEvent.click(importOption);

    expect(screen.getByRole('dialog', { name: /importar especificação openapi/i })).toBeInTheDocument();
  });
});

describe('Home Page cURL Import & Export Integration', () => {
  const originalClipboard = navigator.clipboard;
  let writeTextMock: ReturnType<typeof vi.fn>;

  const mockCurlTree: WorkspaceTreeDto = {
    workspaceId: '00000000-0000-0000-0000-000000000001',
    workspaceName: 'cURL Workspace',
    collections: [
      {
        id: 'col-curl',
        name: 'cURL Test Collection',
        defaultTarget: 'Inherit',
        openApiSpecUrl: null,
        folders: [
          {
            id: 'fold-curl',
            name: 'cURL Folder',
            collectionId: 'col-curl',
            parentFolderId: null,
            defaultTarget: 'Inherit',
            subFolders: [],
            requests: [
              {
                id: 'req-folder-child',
                name: 'Folder Request',
                method: 'GET',
                url: 'https://api.example.com/folder/item',
                target: 'Inherit',
                bodyType: 'None',
                headersJson: '{"Accept": "application/json"}',
                bodyContent: null,
                collectionId: 'col-curl',
                folderId: 'fold-curl',
              },
            ],
          },
        ],
        requests: [
          {
            id: 'req-active-test',
            name: 'Active Test Request',
            method: 'GET',
            url: 'https://api.example.com/items/ping',
            target: 'Inherit',
            bodyType: 'None',
            headersJson: '{"Accept": "application/json"}',
            bodyContent: null,
            collectionId: 'col-curl',
            folderId: null,
          },
        ],
      },
    ],
  };

  const mockCurlWorkspace = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'cURL Workspace',
    createdAtUtc: '2026-10-26T00:00:00Z',
  };

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    Object.assign(navigator, { clipboard: originalClipboard });
  });

  it('opens CurlImportModal when right-clicking a collection or folder and clicking "Importar cURL"', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockCurlTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockCurlWorkspace],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('cURL Test Collection')).toBeInTheDocument();
      expect(screen.getByText('cURL Folder')).toBeInTheDocument();
    });

    // Right-click collection and select "Importar cURL"
    fireEvent.contextMenu(screen.getByText('cURL Test Collection'));
    const colImportOption = screen.getByText('Importar cURL');
    expect(colImportOption).toBeInTheDocument();
    fireEvent.click(colImportOption);

    // CurlImportModal is open with destination showing collection name
    const modal = screen.getByRole('dialog', { name: /importar requisição via curl/i });
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText('cURL Test Collection')).toBeInTheDocument();

    // Close modal
    const closeBtn = within(modal).getByRole('button', { name: /fechar/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog', { name: /importar requisição via curl/i })).toBeNull();

    // Right-click folder and select "Importar cURL"
    fireEvent.contextMenu(screen.getByText('cURL Folder'));
    const folderImportOption = screen.getByText('Importar cURL');
    expect(folderImportOption).toBeInTheDocument();
    fireEvent.click(folderImportOption);

    // CurlImportModal is open with destination showing folder name
    const folderModal = screen.getByRole('dialog', { name: /importar requisição via curl/i });
    expect(folderModal).toBeInTheDocument();
    expect(within(folderModal).getByText('cURL Folder')).toBeInTheDocument();
  });

  it('submits a cURL command, calls createRequest, reloads tree, sets imported request active, and closes modal', async () => {
    let postCalled = false;
    let postPayload: any = null;
    let treeFetchCount = 0;

    const importedRequest = {
      id: 'req-imported-999',
      name: 'Created Orders',
      method: 'POST',
      url: 'https://api.example.com/v1/orders',
      target: 'Inherit',
      bodyType: 'Json',
      headersJson: '{"Content-Type": "application/json"}',
      bodyContent: '{"qty": 5}',
      collectionId: 'col-curl',
      folderId: null,
    };

    vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/api/requests') && init?.method === 'POST') {
        postCalled = true;
        postPayload = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => importedRequest,
        } as any);
      }
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        treeFetchCount++;
        const currentTree = treeFetchCount > 1
          ? {
              ...mockCurlTree,
              collections: [
                {
                  ...mockCurlTree.collections[0],
                  requests: [...mockCurlTree.collections[0].requests, importedRequest],
                },
              ],
            }
          : mockCurlTree;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => currentTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockCurlWorkspace],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('cURL Test Collection')).toBeInTheDocument();
    });

    // Open import modal on collection
    fireEvent.contextMenu(screen.getByText('cURL Test Collection'));
    fireEvent.click(screen.getByText('Importar cURL'));

    const modal = screen.getByRole('dialog', { name: /importar requisição via curl/i });
    expect(modal).toBeInTheDocument();

    // Paste cURL command
    const textarea = within(modal).getByRole('textbox', { name: /comando curl/i });
    fireEvent.change(textarea, {
      target: {
        value: `curl -X POST https://api.example.com/v1/orders \\\n  -H "Content-Type: application/json" \\\n  -d '{"qty": 5}'`,
      },
    });

    // Preview card rendered
    expect(await within(modal).findByTestId('curl-preview-card')).toBeInTheDocument();

    // Custom request name
    const nameInput = within(modal).getByRole('textbox', { name: /nome da requisição/i });
    fireEvent.change(nameInput, { target: { value: 'Created Orders' } });

    // Click Import
    const submitBtn = within(modal).getByRole('button', { name: /importar requisição/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postCalled).toBe(true);
      expect(postPayload).toEqual(
        expect.objectContaining({
          workspaceId: '00000000-0000-0000-0000-000000000001',
          name: 'Created Orders',
          method: 'POST',
          url: 'https://api.example.com/v1/orders',
          collectionId: 'col-curl',
          bodyType: 'Json',
          bodyContent: '{"qty": 5}',
        })
      );
    });

    // Modal closed
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /importar requisição via curl/i })).toBeNull();
    });

    // Imported request is loaded into editor and active in UI
    expect(screen.getByTestId('request-title')).toHaveTextContent('Created Orders');
    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    expect(urlInput).toHaveValue('https://api.example.com/v1/orders');
  });

  it('right-clicking an active request item in tree to "Copiar cURL" uses active editor data with interpolated variables', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockCurlTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockCurlWorkspace],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Active Test Request')).toBeInTheDocument();
      expect(screen.getByText('Folder Request')).toBeInTheDocument();
    });

    // Click request to make it active in editor
    fireEvent.click(screen.getByText('Active Test Request'));

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    expect(urlInput).toHaveValue('https://api.example.com/items/ping');

    // Modify URL in editor with dynamic variable without saving (disagreeing edits)
    fireEvent.change(urlInput, {
      target: { value: 'https://api.example.com/items/ping-v2/{{$guid}}' },
    });

    // Right-click the active request item in the tree and select "Copiar cURL"
    fireEvent.contextMenu(screen.getAllByText('Active Test Request')[0]);
    const contextMenu1 = screen.getByRole('menu');
    const copyCurlOption = within(contextMenu1).getByText('Copiar cURL');
    expect(copyCurlOption).toBeInTheDocument();
    fireEvent.click(copyCurlOption);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });

    const copiedCommand = writeTextMock.mock.calls[0][0];
    expect(copiedCommand).toContain('https://api.example.com/items/ping-v2/');
    // Confirms {{$guid}} was interpolated into a valid UUID
    expect(copiedCommand).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // Confirms it did NOT use the unedited tree node URL
    expect(copiedCommand).not.toBe(`curl -X GET 'https://api.example.com/items/ping'`);

    // Now right-click an inactive request in the tree ("Folder Request")
    writeTextMock.mockClear();
    fireEvent.contextMenu(screen.getAllByText('Folder Request')[0]);
    const contextMenu2 = screen.getByRole('menu');
    fireEvent.click(within(contextMenu2).getByText('Copiar cURL'));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });

    const inactiveCopied = writeTextMock.mock.calls[0][0];
    expect(inactiveCopied).toContain('https://api.example.com/folder/item');
  });

  it('passes executedCurl to ResponseViewer after handleSend and enables "Copiar cURL" button', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/requests/execute')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
            forEach: () => {},
          },
          json: async () => ({
            statusCode: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: btoa('{"status":"healthy"}'),
          }),
        } as any);
      }
      if (url.includes('/api/workspaces/') && url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockCurlTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockCurlWorkspace],
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('cURL Test Collection')).toBeInTheDocument();
    });

    // Set URL and click "Enviar"
    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.change(urlInput, { target: { value: 'https://api.example.com/health/check' } });

    const sendBtn = screen.getByRole('button', { name: /enviar requisição|enviar/i });
    fireEvent.click(sendBtn);

    // Wait for response to render
    await waitFor(() => {
      expect(screen.getByTestId('status-badge')).toHaveTextContent(/200/);
    });

    // In ResponseViewer, "Copiar cURL" button is present and enabled with executedCurl
    const copyExecutedCurlBtn = screen.getByRole('button', { name: /copiar curl da requisição/i });
    expect(copyExecutedCurlBtn).not.toBeDisabled();

    // Click "Copiar cURL"
    fireEvent.click(copyExecutedCurlBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });

    const copiedCurl = writeTextMock.mock.calls[0][0];
    expect(copiedCurl).toContain(`curl -X GET 'https://api.example.com/health/check'`);
  });
});

