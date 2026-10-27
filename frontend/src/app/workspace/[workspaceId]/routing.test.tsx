import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useParams, useRouter } from 'next/navigation';
import WorkspacePage from './page';
import RequestPage from './request/[requestId]/page';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { useRequestStore } from '@/stores/useRequestStore';
import { useLayoutStore, INITIAL_LAYOUT_STATE } from '@/stores/useLayoutStore';
import { WorkspaceTreeDto } from '@/lib/treeApi';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

const mockTree: WorkspaceTreeDto = {
  workspaceId: 'ws-test',
  workspaceName: 'Test Workspace',
  collections: [
    {
      id: 'col-1',
      name: 'Users Collection',
      defaultTarget: 'Inherit',
      openApiSpecUrl: null,
      folders: [
        {
          id: 'folder-1',
          name: 'Admin Folders',
          collectionId: 'col-1',
          parentFolderId: null,
          defaultTarget: 'Inherit',
          subFolders: [],
          requests: [
            {
              id: 'req-nested',
              name: 'Nested Admin Req',
              method: 'DELETE',
              url: 'https://api.test/admin/user/1',
              target: 'Inherit',
              bodyType: 'None',
              bodyContent: null,
              headersJson: '{}',
              collectionId: 'col-1',
              folderId: 'folder-1',
            },
          ],
        },
      ],
      requests: [
        {
          id: 'req-1',
          name: 'List Users',
          method: 'GET',
          url: 'https://api.test/users',
          target: 'Inherit',
          bodyType: 'None',
          bodyContent: null,
          headersJson: '{"Accept": "application/json"}',
          collectionId: 'col-1',
          folderId: null,
        },
      ],
    },
  ],
};

describe('Workspace Routing Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLayoutStore.setState(INITIAL_LAYOUT_STATE);
    useRequestStore.getState().reset();

    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-test/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
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

  describe('Scratchpad Route (/workspace/:workspaceId)', () => {
    it('mounts with blank scratchpad and activeRequestId = null', async () => {
      vi.mocked(useParams).mockReturnValue({ workspaceId: 'ws-test' });

      // Simulate a previously active request in the store
      useRequestStore.setState({
        activeRequestId: 'req-old',
        activeRequestDetails: {
          id: 'req-old',
          name: 'Old Request',
          method: 'POST',
          url: 'https://old.test',
          target: 'Inherit',
          headers: '{}',
          body: '',
          auth: { type: 'none' },
        },
      });

      render(
        <WorkspaceProvider workspaceId="ws-test">
          <WorkspacePage />
        </WorkspaceProvider>
      );

      // On mount, activeRequestId should be cleared to null
      await waitFor(() => {
        expect(useRequestStore.getState().activeRequestId).toBeNull();
        expect(useRequestStore.getState().activeRequestDetails).toBeNull();
      });

      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByTestId('panel-splitter-request-response-splitter')).toBeInTheDocument();
    });

    it('supports React 19 Promise params for scratchpad route', async () => {
      vi.mocked(useParams).mockReturnValue({});

      const paramsPromise = Promise.resolve({ workspaceId: 'ws-test' });

      await act(async () => {
        render(
          <React.Suspense fallback={<div>Loading...</div>}>
            <WorkspaceProvider workspaceId="ws-test">
              <WorkspacePage params={paramsPromise} />
            </WorkspaceProvider>
          </React.Suspense>
        );
      });

      expect(useRequestStore.getState().activeRequestId).toBeNull();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });
  });

  describe('Request Route (/workspace/:workspaceId/request/:requestId)', () => {
    it('syncs request data from tree and sets activeRequestId', async () => {
      vi.mocked(useParams).mockReturnValue({
        workspaceId: 'ws-test',
        requestId: 'req-1',
      });

      render(
        <WorkspaceProvider workspaceId="ws-test">
          <RequestPage />
        </WorkspaceProvider>
      );

      // Wait for tree to finish loading and sync request details
      await waitFor(() => {
        const state = useRequestStore.getState();
        expect(state.activeRequestId).toBe('req-1');
        expect(state.activeRequestDetails?.name).toBe('List Users');
        expect(state.activeRequestDetails?.url).toBe('https://api.test/users');
        expect(state.activeRequestDetails?.method).toBe('GET');
      });
    });

    it('syncs nested folder request from tree properly', async () => {
      vi.mocked(useParams).mockReturnValue({
        workspaceId: 'ws-test',
        requestId: 'req-nested',
      });

      render(
        <WorkspaceProvider workspaceId="ws-test">
          <RequestPage />
        </WorkspaceProvider>
      );

      await waitFor(() => {
        const state = useRequestStore.getState();
        expect(state.activeRequestId).toBe('req-nested');
        expect(state.activeRequestDetails?.name).toBe('Nested Admin Req');
        expect(state.activeRequestDetails?.method).toBe('DELETE');
      });
    });

    it('redirects to /workspace/:workspaceId when requestId is not found in tree', async () => {
      vi.mocked(useParams).mockReturnValue({
        workspaceId: 'ws-test',
        requestId: 'req-non-existent',
      });

      render(
        <WorkspaceProvider workspaceId="ws-test">
          <RequestPage />
        </WorkspaceProvider>
      );

      // Wait for tree to finish loading and trigger redirect fallback
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/workspace/ws-test');
      });

      // Also verify syncError notice was set
      expect(useLayoutStore.getState().syncError).toContain('req-non-existent');
    });

    it('does not redirect while tree is still loading', async () => {
      // Delay tree response
      let resolveTree: any;
      const delayedTreePromise = new Promise((resolve) => {
        resolveTree = resolve;
      });

      vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
        const url = String(input);
        if (url.includes('/api/workspaces/ws-test/tree')) {
          return delayedTreePromise as any;
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as any);
      });

      vi.mocked(useParams).mockReturnValue({
        workspaceId: 'ws-test',
        requestId: 'req-1',
      });

      render(
        <WorkspaceProvider workspaceId="ws-test">
          <RequestPage />
        </WorkspaceProvider>
      );

      // Initially while tree is loading, redirect should NOT happen
      expect(mockReplace).not.toHaveBeenCalled();

      // Now resolve the tree
      await act(async () => {
        resolveTree({
          ok: true,
          status: 200,
          json: async () => mockTree,
        });
      });

      await waitFor(() => {
        expect(useRequestStore.getState().activeRequestId).toBe('req-1');
      });

      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('displays response corresponding to requestId and preserves isolation', async () => {
      vi.mocked(useParams).mockReturnValue({
        workspaceId: 'ws-test',
        requestId: 'req-1',
      });

      useRequestStore.getState().setResponse(
        {
          statusCode: 200,
          statusText: 'OK',
          body: JSON.stringify({ users: ['Alice', 'Bob'] }),
        },
        'req-1',
        'ws-test'
      );

      render(
        <WorkspaceProvider workspaceId="ws-test">
          <RequestPage />
        </WorkspaceProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('200 OK')).toBeInTheDocument();
      });
    });

    it('supports React 19 Promise params for request route', async () => {
      vi.mocked(useParams).mockReturnValue({});

      const paramsPromise = Promise.resolve({ workspaceId: 'ws-test', requestId: 'req-1' });

      await act(async () => {
        render(
          <React.Suspense fallback={<div>Loading...</div>}>
            <WorkspaceProvider workspaceId="ws-test">
              <RequestPage params={paramsPromise} />
            </WorkspaceProvider>
          </React.Suspense>
        );
      });

      await waitFor(() => {
        expect(useRequestStore.getState().activeRequestId).toBe('req-1');
      });
      expect(screen.getByRole('main')).toBeInTheDocument();
    });
  });
});
