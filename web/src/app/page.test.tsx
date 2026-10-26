import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import Home from './page';
import { resolveVariables, interpolateVariables } from '@/lib/variables';
import { VariableItem } from '@/components/environment/VariableGrid';
import { EnvironmentGroup } from '@/components/environment/EnvironmentModal';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens collection settings modal when settings button is clicked on collection nav', async () => {
    render(<Home />);

    const settingsBtns = screen.getAllByRole('button', {
      name: /configurações da coleção|configurações/i,
    });
    expect(settingsBtns.length).toBeGreaterThan(0);
    fireEvent.click(settingsBtns[0]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/configurações da coleção & sincronização/i)).toBeInTheDocument();
  });

  it('displays audit summary banner after successful synchronization in settings modal', async () => {
    const mockSyncReport = {
      addedRequests: 4,
      updatedRequests: 1,
      fieldsAdded: 2,
      fieldsRemoved: 0,
      fieldsPreserved: 3,
    };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockSyncReport,
    } as any);

    render(<Home />);

    const settingsBtns = screen.getAllByRole('button', {
      name: /configurações da coleção|configurações/i,
    });
    fireEvent.click(settingsBtns[0]);

    const dialog = screen.getByRole('dialog');
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
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockSyncReport,
    } as any);

    render(<Home />);

    const syncBtns = screen.getAllByRole('button', {
      name: /sincronizar coleção|sincronizar/i,
    });
    fireEvent.click(syncBtns[0]);

    await waitFor(() => {
      expect(screen.getByTestId('audit-summary-banner')).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: /fechar notificação de auditoria/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('audit-summary-banner')).toBeNull();
  });

  it('triggers quick sync on collection nav item and shows audit banner', async () => {
    const mockSyncReport = {
      addedRequests: 2,
      updatedRequests: 0,
      fieldsAdded: 1,
      fieldsRemoved: 1,
      fieldsPreserved: 5,
    };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockSyncReport,
    } as any);

    render(<Home />);

    const syncBtns = screen.getAllByRole('button', {
      name: /sincronizar coleção|sincronizar/i,
    });
    fireEvent.click(syncBtns[0]);

    await waitFor(() => {
      expect(screen.getByTestId('audit-summary-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/2 requisições adicionadas/i)).toBeInTheDocument();
  });
});
