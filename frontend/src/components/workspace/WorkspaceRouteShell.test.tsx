import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceRouteShell } from './WorkspaceRouteShell';
import { useAuthStore } from '@/stores/useAuthStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/components/layout/WorkspaceShell', () => ({
  WorkspaceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/workspace/WorkspaceEditorPane', () => ({
  WorkspaceEditorPane: () => <div data-testid="editor-pane" />,
}));

describe('WorkspaceRouteShell route guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    useWorkspaceStore.getState().reset();
    useAuthStore.getState().reset();
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  function mockUnauthenticated(): void {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({ message: 'Unauthorized' }),
        }) as any
    );
  }

  it('resumes the exact request after login on desktop', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockUnauthenticated();

    render(<WorkspaceRouteShell workspaceId="ws-desktop" requestId="req-42" />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });

    expect(useAuthStore.getState().pendingRoute).toEqual({
      kind: 'request',
      workspaceId: 'ws-desktop',
      requestId: 'req-42',
    });
  });

  it('falls back to the workspace when no request is selected', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockUnauthenticated();

    render(<WorkspaceRouteShell workspaceId="ws-desktop" />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });

    expect(useAuthStore.getState().pendingRoute).toEqual({
      kind: 'workspace',
      workspaceId: 'ws-desktop',
    });
  });
});
