import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WorkspaceLayout from './layout';
import { useParams } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useAuthStore } from '@/stores/useAuthStore';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/components/layout/WorkspaceShell', () => ({
  WorkspaceShell: ({
    workspaceId,
    children,
  }: {
    workspaceId: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="workspace-shell" data-workspace-id={workspaceId}>
      {children}
    </div>
  ),
}));

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    useAuthStore.getState().reset();

    vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'user-default',
            email: 'test@example.com',
            displayName: 'Test User',
            isRoot: false,
            workspaces: [{ id: 'ws-123', name: 'Default', role: 'Owner' }],
          }),
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => [],
      } as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads workspaceId from useParams and passes it to WorkspaceShell with children', () => {
    vi.mocked(useParams).mockReturnValue({ workspaceId: 'ws-123' });

    render(
      <WorkspaceLayout>
        <span data-testid="child-content">Workspace Content</span>
      </WorkspaceLayout>
    );

    const shell = screen.getByTestId('workspace-shell');
    expect(shell).toBeInTheDocument();
    expect(shell).toHaveAttribute('data-workspace-id', 'ws-123');
    expect(screen.getByTestId('child-content')).toHaveTextContent('Workspace Content');
  });

  it('syncs active workspace in useWorkspaceStore when mounted', () => {
    vi.mocked(useParams).mockReturnValue({ workspaceId: 'ws-active-456' });

    render(
      <WorkspaceLayout>
        <div>Content</div>
      </WorkspaceLayout>
    );

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-active-456');
  });

  it('updates active workspace in useWorkspaceStore when workspaceId param changes', () => {
    vi.mocked(useParams).mockReturnValue({ workspaceId: 'ws-first' });

    const { rerender } = render(
      <WorkspaceLayout>
        <div>First</div>
      </WorkspaceLayout>
    );

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-first');

    vi.mocked(useParams).mockReturnValue({ workspaceId: 'ws-second' });

    rerender(
      <WorkspaceLayout>
        <div>Second</div>
      </WorkspaceLayout>
    );

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-second');
    const shell = screen.getByTestId('workspace-shell');
    expect(shell).toHaveAttribute('data-workspace-id', 'ws-second');
  });

  it('handles array workspaceId from catch-all route params correctly', () => {
    vi.mocked(useParams).mockReturnValue({ workspaceId: ['ws-array-0', 'nested'] as any });

    render(
      <WorkspaceLayout>
        <div>Nested</div>
      </WorkspaceLayout>
    );

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-array-0');
    expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-workspace-id', 'ws-array-0');
  });

  it('handles missing or empty workspaceId safely', () => {
    vi.mocked(useParams).mockReturnValue({});

    render(
      <WorkspaceLayout>
        <div>Empty workspaceId</div>
      </WorkspaceLayout>
    );

    const shell = screen.getByTestId('workspace-shell');
    expect(shell).toBeInTheDocument();
    expect(shell).toHaveAttribute('data-workspace-id', '');
    expect(screen.getByText('Empty workspaceId')).toBeInTheDocument();
  });

  it('safely unwraps params when passed as a Promise using React 19 use()', async () => {
    const paramsPromise = Promise.resolve({ workspaceId: 'ws-promise-789' });

    await act(async () => {
      render(
        <React.Suspense fallback={<div>Carregando...</div>}>
          <WorkspaceLayout params={paramsPromise}>
            <div data-testid="promise-child">From Promise</div>
          </WorkspaceLayout>
        </React.Suspense>
      );
    });

    const shell = screen.getByTestId('workspace-shell');
    expect(shell).toHaveAttribute('data-workspace-id', 'ws-promise-789');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-promise-789');
    expect(screen.getByTestId('promise-child')).toBeInTheDocument();
  });

  it('uses params when passed as a plain object directly', () => {
    render(
      <WorkspaceLayout params={{ workspaceId: 'ws-object-direct' }}>
        <div>Direct Object</div>
      </WorkspaceLayout>
    );

    const shell = screen.getByTestId('workspace-shell');
    expect(shell).toHaveAttribute('data-workspace-id', 'ws-object-direct');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-object-direct');
  });

  describe('reactive document.title synchronization', () => {
    it('sets document.title to "ApiDot - [Workspace Name]" when active workspace has name', () => {
      useWorkspaceStore.setState({
        workspaces: [
          { id: 'ws-test', name: 'My Core API', createdAtUtc: '2026-10-27T00:00:00Z' },
        ],
        activeWorkspaceId: 'ws-test',
      });
      vi.mocked(useParams).mockReturnValue({ workspaceId: 'ws-test' });

      render(
        <WorkspaceLayout>
          <div>Workspace Body</div>
        </WorkspaceLayout>
      );

      expect(document.title).toBe('ApiDot - My Core API');
    });

    it('falls back to default title when workspace is not found', () => {
      useWorkspaceStore.setState({
        workspaces: [],
        activeWorkspaceId: null,
      });
      vi.mocked(useParams).mockReturnValue({ workspaceId: 'unknown-ws' });

      render(
        <WorkspaceLayout>
          <div>Workspace Body</div>
        </WorkspaceLayout>
      );

      expect(document.title).toBe('ApiDot - Test and debug any API, anywhere');
    });

    it('reactively updates document.title when workspace name changes', () => {
      useWorkspaceStore.setState({
        workspaces: [
          { id: 'ws-live', name: 'Old Name', createdAtUtc: '2026-10-27T00:00:00Z' },
        ],
        activeWorkspaceId: 'ws-live',
      });
      vi.mocked(useParams).mockReturnValue({ workspaceId: 'ws-live' });

      render(
        <WorkspaceLayout>
          <div>Workspace Body</div>
        </WorkspaceLayout>
      );

      expect(document.title).toBe('ApiDot - Old Name');

      act(() => {
        useWorkspaceStore.setState({
          workspaces: [
            { id: 'ws-live', name: 'New Staging Name', createdAtUtc: '2026-10-27T00:00:00Z' },
          ],
        });
      });

      expect(document.title).toBe('ApiDot - New Staging Name');
    });
  });

  describe('Route Guard and Authentication', () => {
    it('redirects to /login?returnUrl=... when user is unauthenticated', async () => {
      vi.mocked(useParams).mockReturnValue({ workspaceId: 'ws-protected' });
      vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input);
        if (url.includes('/api/auth/me')) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ message: 'Unauthorized' }),
          } as any;
        }
        return { ok: true, json: async () => ({}) } as any;
      });

      render(
        <WorkspaceLayout>
          <div>Guarded Content</div>
        </WorkspaceLayout>
      );

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/login?returnUrl=%2Fworkspace%2Fws-protected');
      });
    });
  });
});
