import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Home from './page';
import { resolveVariables, interpolateVariables } from '@/lib/variables';
import { VariableItem } from '@/components/environment/VariableGrid';
import { EnvironmentGroup } from '@/components/environment/EnvironmentModal';
import { useLayoutStore, INITIAL_LAYOUT_STATE } from '@/stores/useLayoutStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useEnvironmentStore } from '@/stores/useEnvironmentStore';
import { useRequestStore } from '@/stores/useRequestStore';

const mockReplace = vi.fn();
const mockPush = vi.fn();
const routerMock = {
  push: mockPush,
  replace: mockReplace,
  prefetch: vi.fn(),
  back: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useLayoutStore.setState(INITIAL_LAYOUT_STATE);
  useWorkspaceStore.getState().reset();
  useEnvironmentStore.getState().reset();
  useRequestStore.getState().reset();
  localStorage.clear();
});

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

describe('Root Redirector (app/page.tsx)', () => {
  const mockWorkspaces = [
    { id: 'ws-1', name: 'Primeiro Workspace', createdAtUtc: '2026-10-27T00:00:00Z' },
    { id: 'ws-2', name: 'Segundo Workspace', createdAtUtc: '2026-10-27T00:00:00Z' },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders accessible loading indicator while redirecting', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-1' });

    render(<Home />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/carregando workspace\.\.\./i)).toBeInTheDocument();
  });

  it('redirects directly to activeWorkspaceId if already present in useWorkspaceStore', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-existing-123' });

    render(<Home />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/workspace/ws-existing-123');
    });
  });

  it('encodes URI component in targetId when redirecting', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws/special 123' });

    render(<Home />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/workspace/ws%2Fspecial%20123');
    });
  });

  it('ensures redirect idempotency so executeRedirect only fires once', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-idempotent' });

    const { rerender } = render(<Home />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/workspace/ws-idempotent');
    });

    rerender(<Home />);

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('fetches workspaces and redirects to the first workspace when activeWorkspaceId is not set', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaces,
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/workspace/ws-1');
    });
  });

  it('creates a default workspace and redirects to it when no workspaces exist', async () => {
    let createCalled = false;
    vi.spyOn(global, 'fetch').mockImplementation((input: any, init?: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces') && init?.method === 'POST') {
        createCalled = true;
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'ws-new-auto',
            name: 'Workspace',
            createdAtUtc: '2026-10-27T00:00:00Z',
          }),
        } as any);
      }
      if (url.includes('/api/workspaces')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => (createCalled ? [{ id: 'ws-new-auto', name: 'Workspace', createdAtUtc: '2026-10-27T00:00:00Z' }] : []),
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/workspace/ws-new-auto');
    });
  });

  it('restores active workspace from localStorage if it exists in fetched workspaces list', async () => {
    localStorage.setItem('apidot_active_workspace_id', 'ws-2');

    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaces,
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/workspace/ws-2');
    });
  });

  it('displays accessible error message and retry button when resolving workspaces fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error on list'));

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Erro ao carregar workspace')).toBeInTheDocument();
      expect(screen.getByText('Network error on list')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    });
  });

  it('retries resolving workspace when "Tentar novamente" is clicked', async () => {
    let callCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes('/api/workspaces')) {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Temporary server glitch'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspaces,
        } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Temporary server glitch')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /tentar novamente/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/workspace/ws-1');
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
