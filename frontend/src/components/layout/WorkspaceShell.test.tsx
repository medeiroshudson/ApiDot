import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceShell } from './WorkspaceShell';
import { WorkspaceTreeDto, WorkspaceDto } from '@/lib/treeApi';
import { useLayoutStore, INITIAL_LAYOUT_STATE } from '@/stores/useLayoutStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useEnvironmentStore } from '@/stores/useEnvironmentStore';
import { useRequestStore } from '@/stores/useRequestStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useUpdateStore } from '@/stores/useUpdateStore';

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

const mockTree: WorkspaceTreeDto = {
  workspaceId: 'ws-test',
  workspaceName: 'Test Workspace',
  collections: [
    {
      id: 'col-1',
      name: 'Auth Collection',
      defaultTarget: 'Inherit',
      openApiSpecUrl: null,
      folders: [],
      requests: [
        {
          id: 'req-1',
          name: 'Login Request',
          method: 'POST',
          url: 'https://api.test/login',
          target: 'Inherit',
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

const mockWorkspaces: WorkspaceDto[] = [
  { id: 'ws-test', name: 'Test Workspace', createdAtUtc: '2026-10-27T00:00:00Z' },
  { id: 'ws-other', name: 'Other Workspace', createdAtUtc: '2026-10-27T00:00:00Z' },
];

const originalCheckForUpdates = useUpdateStore.getState().checkForUpdates;

describe('WorkspaceShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLayoutStore.setState(INITIAL_LAYOUT_STATE);
    useWorkspaceStore.getState().reset();
    useEnvironmentStore.getState().reset();
    useRequestStore.getState().reset();
    useDeviceStore.getState().reset();
    useUpdateStore.getState().reset();
    useUpdateStore.setState({ checkForUpdates: originalCheckForUpdates });

    useWorkspaceStore.setState({
      workspaces: mockWorkspaces,
      activeWorkspaceId: 'ws-test',
    });

    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces/ws-test/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTree,
        } as any);
      }
      if (url.includes('/api/workspaces') && !url.includes('/tree')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaces,
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
    vi.useRealTimers();
    cleanup();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    useUpdateStore.setState({ checkForUpdates: originalCheckForUpdates });
  });

  it('renders AppHeader, CollectionTree sidebar, PanelSplitter and children', async () => {
    render(
      <WorkspaceShell workspaceId="ws-test">
        <div data-testid="test-child">Child Content</div>
      </WorkspaceShell>
    );

    expect(screen.getByText('ApiDot')).toBeInTheDocument();
    expect(screen.getByTestId('test-child')).toBeInTheDocument();
    expect(
      screen.getByRole('separator', { name: /resize sidebar/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Auth Collection')).toBeInTheDocument();
      expect(screen.getByText('Login Request')).toBeInTheDocument();
    });
  });

  it('navigates to request URL when a request item in CollectionTree is clicked', async () => {
    render(
      <WorkspaceShell workspaceId="ws-test">
        <div data-testid="child-area">Editor Area</div>
      </WorkspaceShell>
    );

    const requestItem = await screen.findByText('Login Request');
    fireEvent.click(requestItem);

    expect(mockPush).toHaveBeenCalledWith('/workspace/ws-test/request/req-1');
  });

  it('navigates to selected workspace when switching workspaces in tree header', async () => {
    render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    });

    const switcherBtn = screen.getByRole('button', { name: /workspace: test workspace/i });
    fireEvent.click(switcherBtn);

    const otherOption = await screen.findByText('Other Workspace');
    fireEvent.click(otherOption);

    expect(mockPush).toHaveBeenCalledWith('/workspace/ws-other');
  });

  it('adjusts sidebar width when PanelSplitter is dragged or resized', async () => {
    render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    });

    const splitter = screen.getByRole('separator', { name: /resize sidebar/i });
    const initialWidth = useLayoutStore.getState().sidebarWidth;

    act(() => {
      fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    });
    expect(useLayoutStore.getState().sidebarWidth).toBe(initialWidth + 10);
  });

  it('renders and dismisses audit summary banner', async () => {
    useLayoutStore.getState().setAuditBanner({
      collectionName: 'Auth Collection',
      report: {
        addedRequests: 2,
        updatedRequests: 1,
        fieldsAdded: 0,
        fieldsRemoved: 0,
        fieldsPreserved: 5,
      },
    });

    render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    });

    const banner = screen.getByTestId('audit-summary-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Sync of “Auth Collection”/);

    const closeBtn = screen.getByRole('button', { name: /close audit notification/i });
    act(() => {
      fireEvent.click(closeBtn);
    });

    expect(screen.queryByTestId('audit-summary-banner')).not.toBeInTheDocument();
    expect(useLayoutStore.getState().auditBanner).toBeNull();
  });

  it('renders and dismisses sync error banner', async () => {
    useLayoutStore.getState().setSyncError('Connection timed out');

    render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    });

    const alertBanner = screen.getByTestId('sync-error-banner');
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent('Connection timed out');

    const closeBtn = screen.getByRole('button', { name: /close error notification/i });
    act(() => {
      fireEvent.click(closeBtn);
    });

    expect(screen.queryByTestId('sync-error-banner')).not.toBeInTheDocument();
    expect(useLayoutStore.getState().syncError).toBeNull();
  });

  it('renders modals when triggered via useLayoutStore', async () => {
    render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    });

    // Open Workspace Modal
    act(() => {
      useLayoutStore.getState().setModalOpen('workspace', true);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New Workspace')).toBeInTheDocument();

    // Close Workspace Modal
    act(() => {
      useLayoutStore.getState().setModalOpen('workspace', false);
    });

    // Open Environment Modal
    act(() => {
      useLayoutStore.getState().setModalOpen('env', true);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/environments & variables|ambientes e variáveis/i)).toBeInTheDocument();
  });

  it('opens GlobalSettingsModal when clicking global settings button in AppHeader', async () => {
    render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    });

    const settingsBtn = screen.getByRole('button', { name: /global settings|configurações globais/i });
    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/global settings|configurações globais/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /local agents/i })).toBeInTheDocument();
  });

  it('calls fetchWorkspaces with current workspaceId on mount', async () => {
    const fetchSpy = vi.spyOn(useWorkspaceStore.getState(), 'fetchWorkspaces');
    render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('ws-test');
    });
  });

  it('encodes workspaceId in router.push when switching to workspace with special characters', async () => {
    const customWorkspaces = [
      ...mockWorkspaces,
      { id: 'ws with spaces', name: 'Spaces Workspace', createdAtUtc: '2026-10-27T00:00:00Z' },
    ];
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/tree')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => mockTree } as any);
      }
      if (url.includes('/api/workspaces')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => customWorkspaces } as any);
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as any);
    });

    useWorkspaceStore.setState({
      workspaces: customWorkspaces,
      activeWorkspaceId: 'ws-test',
    });

    render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    });

    const switcherBtn = screen.getByRole('button', { name: /workspace: test workspace/i });
    fireEvent.click(switcherBtn);

    const spacesOption = await screen.findByText('Spaces Workspace');
    fireEvent.click(spacesOption);

    expect(mockPush).toHaveBeenCalledWith('/workspace/ws%20with%20spaces');
  });

  it('starts device polling on mount and stops on unmount', async () => {
    const startPollingSpy = vi.spyOn(useDeviceStore.getState(), 'startPolling');
    const stopPollingSpy = vi.spyOn(useDeviceStore.getState(), 'stopPolling');

    const { unmount } = render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    expect(startPollingSpy).toHaveBeenCalledWith(5000);

    unmount();
    expect(stopPollingSpy).toHaveBeenCalled();
  });

  it('starts sync listener when isDesktop() is true and cleans up on unmount', async () => {
    (window as any).__TAURI__ = {};
    const mockCleanup = vi.fn();
    const syncManager = await import('@/lib/sync/syncManager');
    const startSyncSpy = vi.spyOn(syncManager, 'startSyncListener').mockReturnValue(mockCleanup);

    const { unmount } = render(
      <WorkspaceShell workspaceId="ws-test">
        <div>Child Area</div>
      </WorkspaceShell>
    );

    expect(startSyncSpy).toHaveBeenCalled();

    unmount();
    expect(mockCleanup).toHaveBeenCalled();

    delete (window as any).__TAURI__;
  });

  describe('Background auto-update check on startup', () => {
    it('schedules background update check on desktop after 5000ms delay', () => {
      vi.useFakeTimers();
      (window as any).__TAURI__ = {};
      const checkSpy = vi.fn().mockResolvedValue(undefined);
      useUpdateStore.setState({ checkForUpdates: checkSpy });

      const { unmount } = render(
        <WorkspaceShell workspaceId="ws-test">
          <div>Child Area</div>
        </WorkspaceShell>
      );

      expect(checkSpy).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(4999);
      });
      expect(checkSpy).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(checkSpy).toHaveBeenCalledTimes(1);
      expect(checkSpy).toHaveBeenCalledWith(false);

      unmount();
      vi.useRealTimers();
      cleanup();
    });

    it('does not schedule update check when not in desktop environment (standard web browser)', () => {
      vi.useFakeTimers();
      delete (window as any).__TAURI__;
      delete (window as any).__TAURI_INTERNALS__;
      const checkSpy = vi.fn().mockResolvedValue(undefined);
      useUpdateStore.setState({ checkForUpdates: checkSpy });

      const { unmount } = render(
        <WorkspaceShell workspaceId="ws-test">
          <div>Child Area</div>
        </WorkspaceShell>
      );

      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(checkSpy).not.toHaveBeenCalled();

      unmount();
      vi.useRealTimers();
      cleanup();
    });

    it('clears update check timer when unmounted before 5000ms', () => {
      vi.useFakeTimers();
      (window as any).__TAURI__ = {};
      const checkSpy = vi.fn().mockResolvedValue(undefined);
      useUpdateStore.setState({ checkForUpdates: checkSpy });

      const { unmount } = render(
        <WorkspaceShell workspaceId="ws-test">
          <div>Child Area</div>
        </WorkspaceShell>
      );

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(checkSpy).not.toHaveBeenCalled();

      unmount();

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(checkSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
      cleanup();
    });
  });
});
