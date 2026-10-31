import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WorkspaceProvider,
  useWorkspaceContext,
  findRequestInTree,
} from './WorkspaceContext';
import { WorkspaceTreeDto, RequestItemNodeDto } from '@/lib/treeApi';
import { useRequestStore } from '@/stores/useRequestStore';
import { useLayoutStore, INITIAL_LAYOUT_STATE } from '@/stores/useLayoutStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

const mockTreeData: WorkspaceTreeDto = {
  workspaceId: 'ws-123',
  workspaceName: 'Dev Workspace',
  collections: [
    {
      id: 'col-1',
      name: 'Auth Collection',
      defaultTarget: 'Inherit',
      openApiSpecUrl: null,
      folders: [
        {
          id: 'folder-1',
          name: 'Tokens',
          collectionId: 'col-1',
          parentFolderId: null,
          defaultTarget: 'Inherit',
          subFolders: [],
          requests: [
            {
              id: 'req-token',
              name: 'Get Bearer Token',
              method: 'POST',
              url: 'https://api.example.com/oauth/token',
              target: 'Inherit',
              bodyType: 'Json',
              bodyContent: '{"grant_type": "client_credentials"}',
              headersJson: '{"Content-Type": "application/json"}',
              collectionId: 'col-1',
              folderId: 'folder-1',
            },
          ],
        },
      ],
      requests: [
        {
          id: 'req-root',
          name: 'Root Status',
          method: 'GET',
          url: 'https://api.example.com/status',
          target: 'Server',
          bodyType: 'None',
          bodyContent: null,
          headersJson: '{}',
          collectionId: 'col-1',
          folderId: null,
        },
      ],
    },
  ],
};

function ConsumerComponent() {
  const ctx = useWorkspaceContext();
  return (
    <div>
      <div data-testid="workspace-id">{ctx.workspaceId}</div>
      <div data-testid="is-loading">{ctx.isTreeLoading ? 'loading' : 'ready'}</div>
      <div data-testid="collection-count">{ctx.filteredTree?.collections.length ?? 0}</div>
      <div data-testid="active-item-id">{ctx.activeItem?.id || 'none'}</div>
      <div data-testid="filter-text">{ctx.filterText}</div>

      <button
        onClick={() =>
          ctx.handleSelectItem({
            type: 'request',
            id: 'req-root',
            data: ctx.tree?.collections[0]?.requests[0],
          })
        }
      >
        Select Root Request
      </button>

      <button
        onClick={() =>
          ctx.handleSelectItem({
            type: 'collection',
            id: 'col-1',
          })
        }
      >
        Select Collection
      </button>

      <button onClick={() => ctx.handleCreateRequest('New Req', 'col-1', null)}>
        Create Request
      </button>

      <button onClick={() => ctx.handleUpdateRequestName('req-root', 'Updated Status')}>
        Update Request Name
      </button>

      <button onClick={() => ctx.deleteRequest('req-root')}>Delete Root Request</button>

      <button
        onClick={() =>
          ctx.handleSaveExisting({
            method: 'PATCH',
            url: 'https://api.example.com/updated',
            target: 'Inherit',
            headers: '{"x-test": "1"}',
            body: '{"status": "ok"}',
            auth: { type: 'none' },
          })
        }
      >
        Save Existing
      </button>

      <button
        onClick={() =>
          ctx.handleSaveAs({
            method: 'POST',
            url: 'https://api.example.com/save-as',
            target: 'Inherit',
            headers: '{}',
            body: '',
            auth: { type: 'none' },
          })
        }
      >
        Save As
      </button>

      <button onClick={() => ctx.setFilterText('token')}>Filter Token</button>
    </div>
  );
}

describe('WorkspaceContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLayoutStore.setState(INITIAL_LAYOUT_STATE);
    useRequestStore.getState().reset();
    useWorkspaceStore.getState().reset();

    vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTreeData,
        } as any);
      }
      if (url.includes('/api/requests') && init?.method === 'POST') {
        const body = JSON.parse(init.body || '{}');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'req-created-new',
            name: body.name,
            method: body.method || 'GET',
            url: body.url || '',
            target: body.target || 'Inherit',
            headersJson: body.headersJson || '{}',
            bodyType: body.bodyType || 'None',
            bodyContent: body.bodyContent || null,
            collectionId: body.collectionId || 'col-1',
            folderId: body.folderId || null,
          }),
        } as any);
      }
      if (url.includes('/api/requests/') && init?.method === 'PUT') {
        const body = JSON.parse(init.body || '{}');
        const id = url.split('/api/requests/')[1];
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id,
            name: body.name,
            method: body.method,
            url: body.url,
            target: body.target,
            headersJson: body.headersJson,
            bodyType: body.bodyType,
            bodyContent: body.bodyContent,
            collectionId: body.collectionId,
            folderId: body.folderId,
            schemaDefinition: body.schemaDefinition,
          }),
        } as any);
      }
      if (url.includes('/api/requests/') && init?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as any);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if useWorkspaceContext is called outside WorkspaceProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ConsumerComponent />)).toThrow(
      'useWorkspaceContext must be used within a WorkspaceProvider'
    );
    consoleError.mockRestore();
  });

  it('provides workspace tree and initializes active workspace in store', async () => {
    render(
      <WorkspaceProvider workspaceId="ws-123">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    expect(screen.getByTestId('workspace-id')).toHaveTextContent('ws-123');

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('collection-count')).toHaveTextContent('1');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-123');
  });

  it('handles item selection and navigates when selecting a request', async () => {
    render(
      <WorkspaceProvider workspaceId="ws-123">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select Root Request' }));

    expect(screen.getByTestId('active-item-id')).toHaveTextContent('req-root');
    expect(mockPush).toHaveBeenCalledWith('/workspace/ws-123/request/req-root');
    expect(useRequestStore.getState().activeRequestId).toBe('req-root');
    expect(useRequestStore.getState().activeRequestDetails?.name).toBe('Root Status');
  });

  it('handles item selection without routing when selecting a collection', async () => {
    render(
      <WorkspaceProvider workspaceId="ws-123">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select Collection' }));

    expect(screen.getByTestId('active-item-id')).toHaveTextContent('col-1');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('handles creating a new request and navigates to the new request URL', async () => {
    render(
      <WorkspaceProvider workspaceId="ws-123">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Request' }));
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/workspace/ws-123/request/req-created-new');
    });
    expect(useRequestStore.getState().activeRequestId).toBe('req-created-new');
  });

  it('handles updating request name and syncs active request name in store', async () => {
    useRequestStore.getState().setActiveRequest('req-root', {
      id: 'req-root',
      name: 'Root Status',
      method: 'GET',
      url: 'https://api.example.com/status',
      target: 'Server',
      headers: '{}',
      body: '',
      auth: { type: 'none' },
    });

    render(
      <WorkspaceProvider workspaceId="ws-123">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update Request Name' }));
    });

    expect(useRequestStore.getState().activeRequestDetails?.name).toBe('Updated Status');
  });

  it('handles deleting request, cleans cached response, and redirects to workspace root if active request is deleted', async () => {
    useRequestStore.getState().setActiveRequest('req-root', {
      id: 'req-root',
      name: 'Root Status',
      method: 'GET',
      url: 'https://api.example.com/status',
      target: 'Server',
      headers: '{}',
      body: '',
      auth: { type: 'none' },
    });
    useRequestStore.getState().setResponse(
      { statusCode: 200, body: 'cached-response-data' },
      'req-root',
      'ws-123'
    );
    expect(useRequestStore.getState().responsesByRequestId['req-root']).toBeDefined();

    render(
      <WorkspaceProvider workspaceId="ws-123">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete Root Request' }));
    });

    expect(mockPush).toHaveBeenCalledWith('/workspace/ws-123');
    expect(useRequestStore.getState().activeRequestId).toBeNull();
    expect(useRequestStore.getState().responsesByRequestId['req-root']).toBeUndefined();
  });

  it('encodes dynamic route parameters with encodeURIComponent on router.push', async () => {
    render(
      <WorkspaceProvider workspaceId="ws with spaces">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Select Root Request' }));
    });
    expect(mockPush).toHaveBeenCalledWith('/workspace/ws%20with%20spaces/request/req-root');

    act(() => {
      useRequestStore.getState().setActiveRequest('req-root', {
        id: 'req-root',
        name: 'Root',
        method: 'GET',
        url: '',
        target: 'Inherit',
        headers: '{}',
        body: '',
        auth: { type: 'none' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete Root Request' }));
    });
    expect(mockPush).toHaveBeenCalledWith('/workspace/ws%20with%20spaces');
  });

  it('handles saving existing request and updates store', async () => {
    useRequestStore.getState().setActiveRequest('req-root', {
      id: 'req-root',
      name: 'Root Status',
      method: 'GET',
      url: 'https://api.example.com/status',
      target: 'Server',
      headers: '{}',
      body: '',
      auth: { type: 'none' },
    });

    render(
      <WorkspaceProvider workspaceId="ws-123">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Existing' }));
    });

    const active = useRequestStore.getState().activeRequestDetails;
    expect(active?.method).toBe('PATCH');
    expect(active?.url).toBe('https://api.example.com/updated');
    expect(active?.target).toBe('Inherit');
  });

  it('handles save as by setting pendingSaveData and opening save modal', async () => {
    render(
      <WorkspaceProvider workspaceId="ws-123">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save As' }));

    expect(useRequestStore.getState().pendingSaveData?.url).toBe('https://api.example.com/save-as');
    expect(useLayoutStore.getState().isSaveModalOpen).toBe(true);
  });

  it('filters tree items when filter text is updated', async () => {
    render(
      <WorkspaceProvider workspaceId="ws-123">
        <ConsumerComponent />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('ready');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Filter Token' }));
    expect(screen.getByTestId('filter-text')).toHaveTextContent('token');
  });

  describe('findRequestInTree helper', () => {
    it('finds direct collection request', () => {
      const found = findRequestInTree(mockTreeData, 'req-root');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Root Status');
    });

    it('finds nested folder request', () => {
      const found = findRequestInTree(mockTreeData, 'req-token');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Get Bearer Token');
    });

    it('returns null when request not found or tree is null', () => {
      expect(findRequestInTree(mockTreeData, 'non-existent')).toBeNull();
      expect(findRequestInTree(null, 'req-root')).toBeNull();
    });

    it('handles defensive fallback with undefined collections, folders, and requests', () => {
      const sparseTree: any = {
        workspaceId: 'ws-sparse',
        workspaceName: 'Sparse Workspace',
        collections: [
          {
            id: 'col-sparse',
            name: 'Sparse Col',
            folders: [
              {
                id: 'fold-sparse',
                name: 'Sparse Folder',
              },
            ],
          },
        ],
      };
      expect(findRequestInTree(sparseTree, 'missing-req')).toBeNull();

      const nullCollectionsTree: any = {
        workspaceId: 'ws-null-cols',
        workspaceName: 'Null Cols',
        collections: null,
      };
      expect(findRequestInTree(nullCollectionsTree, 'req-1')).toBeNull();
    });
  });
});
