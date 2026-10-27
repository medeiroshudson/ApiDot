import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as treeApi from '@/lib/treeApi';
import { WorkspaceDto } from '@/lib/treeApi';
import {
  useWorkspaceStore,
  WORKSPACE_STORAGE_KEY,
  INITIAL_WORKSPACE_STATE,
} from './useWorkspaceStore';

vi.mock('@/lib/treeApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/treeApi')>('@/lib/treeApi');
  return {
    ...actual,
    fetchWorkspacesApi: vi.fn(),
    createWorkspaceApi: vi.fn(),
  };
});

const mockWorkspaces: WorkspaceDto[] = [
  { id: 'ws-1', name: 'Personal Workspace', createdAtUtc: '2026-01-01T00:00:00Z' },
  { id: 'ws-2', name: 'Team Workspace', createdAtUtc: '2026-01-02T00:00:00Z' },
  { id: 'ws-3', name: 'Demo Workspace', createdAtUtc: '2026-01-03T00:00:00Z' },
];

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useWorkspaceStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Initial State & Constants', () => {
    it('should initialize with empty workspaces and null activeWorkspaceId', () => {
      const state = useWorkspaceStore.getState();
      expect(state.workspaces).toEqual([]);
      expect(state.activeWorkspaceId).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should export WORKSPACE_STORAGE_KEY and INITIAL_WORKSPACE_STATE', () => {
      expect(WORKSPACE_STORAGE_KEY).toBe('apidot_workspace_storage');
      expect(INITIAL_WORKSPACE_STATE).toEqual({
        workspaces: [],
        activeWorkspaceId: null,
        isLoading: false,
        error: null,
      });
    });
  });

  describe('2. Synchronous State Setters', () => {
    it('should set workspaces list via setWorkspaces', () => {
      useWorkspaceStore.getState().setWorkspaces(mockWorkspaces);
      expect(useWorkspaceStore.getState().workspaces).toEqual(mockWorkspaces);
    });

    it('should handle non-array input safely in setWorkspaces', () => {
      useWorkspaceStore.getState().setWorkspaces(null as unknown as WorkspaceDto[]);
      expect(useWorkspaceStore.getState().workspaces).toEqual([]);
    });

    it('should set activeWorkspaceId via setActiveWorkspaceId', () => {
      useWorkspaceStore.getState().setActiveWorkspaceId('ws-2');
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-2');

      useWorkspaceStore.getState().setActiveWorkspaceId(null);
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
    });
  });

  describe('3. fetchWorkspaces', () => {
    it('should fetch workspaces and select the first one by default when activeWorkspaceId is null', async () => {
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce(mockWorkspaces);

      const result = await useWorkspaceStore.getState().fetchWorkspaces();

      expect(treeApi.fetchWorkspacesApi).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockWorkspaces);
      expect(useWorkspaceStore.getState().workspaces).toEqual(mockWorkspaces);
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-1');
      expect(useWorkspaceStore.getState().isLoading).toBe(false);
      expect(useWorkspaceStore.getState().error).toBeNull();
    });

    it('should select preferredId when it exists in the fetched list', async () => {
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce(mockWorkspaces);

      const result = await useWorkspaceStore.getState().fetchWorkspaces('ws-2');

      expect(result).toEqual(mockWorkspaces);
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-2');
    });

    it('should fall back to current activeWorkspaceId if preferredId is not in the list but activeWorkspaceId is', async () => {
      useWorkspaceStore.setState({ activeWorkspaceId: 'ws-3' });
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce(mockWorkspaces);

      const result = await useWorkspaceStore.getState().fetchWorkspaces('non-existent-ws');

      expect(result).toEqual(mockWorkspaces);
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-3');
    });

    it('should fall back to first workspace if neither preferredId nor current activeWorkspaceId is in the list', async () => {
      useWorkspaceStore.setState({ activeWorkspaceId: 'deleted-ws' });
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce(mockWorkspaces);

      const result = await useWorkspaceStore.getState().fetchWorkspaces('another-deleted-ws');

      expect(result).toEqual(mockWorkspaces);
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-1');
    });

    it('should set activeWorkspaceId to null and workspaces to empty when API returns an empty list', async () => {
      useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1' });
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce([]);

      const result = await useWorkspaceStore.getState().fetchWorkspaces();

      expect(result).toEqual([]);
      expect(useWorkspaceStore.getState().workspaces).toEqual([]);
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
      expect(useWorkspaceStore.getState().isLoading).toBe(false);
      expect(useWorkspaceStore.getState().error).toBeNull();
    });

    it('should handle API errors gracefully, set error state, and return empty array', async () => {
      vi.mocked(treeApi.fetchWorkspacesApi).mockRejectedValueOnce(new Error('Network error'));

      const result = await useWorkspaceStore.getState().fetchWorkspaces();

      expect(result).toEqual([]);
      expect(useWorkspaceStore.getState().workspaces).toEqual([]);
      expect(useWorkspaceStore.getState().isLoading).toBe(false);
      expect(useWorkspaceStore.getState().error).toBe('Network error');
    });

    it('should pick legacy localStorage apidot_active_workspace_id if activeWorkspaceId is null and legacy id exists in list', async () => {
      localStorage.setItem('apidot_active_workspace_id', 'ws-2');
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce(mockWorkspaces);

      await useWorkspaceStore.getState().fetchWorkspaces();

      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-2');
    });
  });

  describe('4. createWorkspace', () => {
    it('should call createWorkspaceApi, refresh workspaces with created ID selected, and return the new workspace', async () => {
      const newWs: WorkspaceDto = {
        id: 'ws-new',
        name: 'New Projects',
        createdAtUtc: '2026-01-04T00:00:00Z',
      };
      const updatedList = [...mockWorkspaces, newWs];

      vi.mocked(treeApi.createWorkspaceApi).mockResolvedValueOnce(newWs);
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce(updatedList);

      const created = await useWorkspaceStore.getState().createWorkspace('New Projects');

      expect(treeApi.createWorkspaceApi).toHaveBeenCalledWith('New Projects');
      expect(treeApi.fetchWorkspacesApi).toHaveBeenCalledTimes(1);
      expect(created).toEqual(newWs);
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-new');
      expect(useWorkspaceStore.getState().workspaces).toEqual(updatedList);
      expect(useWorkspaceStore.getState().isLoading).toBe(false);
      expect(useWorkspaceStore.getState().error).toBeNull();
    });

    it('should ensure activeWorkspaceId and workspaces contain created workspace even if fetchWorkspacesApi returns stale mock', async () => {
      const newWs: WorkspaceDto = {
        id: 'ws-custom',
        name: 'Custom',
        createdAtUtc: '2026-01-04T00:00:00Z',
      };

      vi.mocked(treeApi.createWorkspaceApi).mockResolvedValueOnce(newWs);
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce(mockWorkspaces);

      const created = await useWorkspaceStore.getState().createWorkspace('Custom');

      expect(created).toEqual(newWs);
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-custom');
      expect(useWorkspaceStore.getState().workspaces).toContainEqual(newWs);
    });

    it('should handle creation error, set error state, and re-throw the error', async () => {
      vi.mocked(treeApi.createWorkspaceApi).mockRejectedValueOnce(new Error('Name already in use'));

      await expect(
        useWorkspaceStore.getState().createWorkspace('Duplicate')
      ).rejects.toThrow('Name already in use');

      expect(useWorkspaceStore.getState().error).toBe('Name already in use');
      expect(useWorkspaceStore.getState().isLoading).toBe(false);
    });
  });

  describe('5. ensureWorkspaceId', () => {
    it('should return activeWorkspaceId immediately if it is already set', async () => {
      useWorkspaceStore.setState({ activeWorkspaceId: 'ws-existing' });

      const id = await useWorkspaceStore.getState().ensureWorkspaceId();

      expect(id).toBe('ws-existing');
      expect(treeApi.fetchWorkspacesApi).not.toHaveBeenCalled();
      expect(treeApi.createWorkspaceApi).not.toHaveBeenCalled();
    });

    it('should fetch workspaces and return the first workspace id when activeWorkspaceId is null', async () => {
      useWorkspaceStore.setState({ activeWorkspaceId: null });
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce(mockWorkspaces);

      const id = await useWorkspaceStore.getState().ensureWorkspaceId();

      expect(treeApi.fetchWorkspacesApi).toHaveBeenCalledTimes(1);
      expect(id).toBe('ws-1');
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-1');
    });

    it('should create default "Workspace" when activeWorkspaceId is null and no workspaces exist', async () => {
      useWorkspaceStore.setState({ activeWorkspaceId: null });
      const defaultWs: WorkspaceDto = {
        id: 'ws-auto-created',
        name: 'Workspace',
        createdAtUtc: '2026-01-05T00:00:00Z',
      };

      // fetchWorkspaces returns empty list
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce([]);
      // createWorkspace returns new default workspace
      vi.mocked(treeApi.createWorkspaceApi).mockResolvedValueOnce(defaultWs);
      // second fetchWorkspaces (inside createWorkspace) returns the new workspace
      vi.mocked(treeApi.fetchWorkspacesApi).mockResolvedValueOnce([defaultWs]);

      const id = await useWorkspaceStore.getState().ensureWorkspaceId();

      expect(treeApi.createWorkspaceApi).toHaveBeenCalledWith('Workspace');
      expect(id).toBe('ws-auto-created');
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-auto-created');
    });
  });

  describe('6. reset', () => {
    it('should reset store to initial state', () => {
      useWorkspaceStore.setState({
        workspaces: mockWorkspaces,
        activeWorkspaceId: 'ws-2',
        isLoading: true,
        error: 'Some error',
      });

      useWorkspaceStore.getState().reset();

      expect(useWorkspaceStore.getState()).toMatchObject({
        workspaces: [],
        activeWorkspaceId: null,
        isLoading: false,
        error: null,
      });
    });
  });

  describe('7. Persistence & Partialize', () => {
    it('should persist only activeWorkspaceId in storage and exclude transient fields', () => {
      useWorkspaceStore.setState({
        workspaces: mockWorkspaces,
        activeWorkspaceId: 'ws-persisted',
        isLoading: true,
        error: 'Transient error',
      });

      const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);

      expect(parsed.state).toEqual({
        activeWorkspaceId: 'ws-persisted',
      });
      expect(parsed.state.workspaces).toBeUndefined();
      expect(parsed.state.isLoading).toBeUndefined();
      expect(parsed.state.error).toBeUndefined();
    });
  });
});
