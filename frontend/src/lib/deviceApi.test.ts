import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchDevices,
  getDevice,
  createDevice,
  revokeDevice,
  regenerateToken,
  AgentDeviceDto,
  CreateAgentDeviceResponse,
  RegenerateDeviceTokenResponse,
} from './deviceApi';

describe('deviceApi', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchDevices', () => {
    it('sends GET to /api/agent/devices and returns device list', async () => {
      const mockDevices: AgentDeviceDto[] = [
        {
          id: 'dev-1',
          name: 'MacBook Pro',
          tokenPrefix: 'apidot_dev_12345678',
          createdAtUtc: '2026-10-27T10:00:00Z',
          lastConnectedAtUtc: '2026-10-27T10:05:00Z',
          lastConnectedHostname: 'macbook.local',
          lastConnectedOs: 'macOS',
          agentVersion: '0.4.0',
          isRevoked: false,
          isOnline: true,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockDevices,
      } as Response);

      const result = await fetchDevices();

      expect(global.fetch).toHaveBeenCalledWith('/api/agent/devices');
      expect(result).toEqual(mockDevices);
    });

    it('throws error with detail when server returns 500 problem details', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Database connection failed' }),
      } as Response);

      await expect(fetchDevices()).rejects.toThrow('Database connection failed');
    });

    it('falls back to status code message when error json parsing fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Not JSON');
        },
        text: async () => 'Bad Gateway',
      } as unknown as Response);

      await expect(fetchDevices()).rejects.toThrow('Bad Gateway');
    });
  });

  describe('getDevice', () => {
    it('sends GET to /api/agent/devices/:id and returns device DTO', async () => {
      const mockDevice: AgentDeviceDto = {
        id: 'dev-123',
        name: 'Workstation',
        tokenPrefix: 'apidot_dev_abcdef12',
        createdAtUtc: '2026-10-27T12:00:00Z',
        isRevoked: false,
        isOnline: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockDevice,
      } as Response);

      const result = await getDevice('dev-123');

      expect(global.fetch).toHaveBeenCalledWith('/api/agent/devices/dev-123');
      expect(result).toEqual(mockDevice);
    });

    it('throws error when device is not found (404)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "Agent device with ID 'missing' was not found." }),
      } as Response);

      await expect(getDevice('missing')).rejects.toThrow(
        "Agent device with ID 'missing' was not found."
      );
    });
  });

  describe('createDevice', () => {
    it('sends POST to /api/agent/devices with name and returns response with raw token', async () => {
      const mockResponse: CreateAgentDeviceResponse = {
        id: 'dev-new-1',
        name: 'Home Server',
        rawToken: 'apidot_dev_secret_token_123',
        tokenPrefix: 'apidot_dev_secret_t',
        createdAtUtc: '2026-10-27T12:30:00Z',
        device: {
          id: 'dev-new-1',
          name: 'Home Server',
          tokenPrefix: 'apidot_dev_secret_t',
          createdAtUtc: '2026-10-27T12:30:00Z',
          isRevoked: false,
          isOnline: false,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createDevice('Home Server');

      expect(global.fetch).toHaveBeenCalledWith('/api/agent/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Home Server' }),
      });
      expect(result).toEqual(mockResponse);
    });

    it('throws error when creation fails with 400 bad request', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'Device name cannot be empty or whitespace.' }),
      } as Response);

      await expect(createDevice('   ')).rejects.toThrow(
        'Device name cannot be empty or whitespace.'
      );
    });
  });

  describe('revokeDevice', () => {
    it('sends POST to /api/agent/devices/:id/revoke and returns updated device', async () => {
      const mockRevoked: AgentDeviceDto = {
        id: 'dev-1',
        name: 'Old Laptop',
        tokenPrefix: 'apidot_dev_oldtoken',
        createdAtUtc: '2026-10-27T08:00:00Z',
        isRevoked: true,
        isOnline: false,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRevoked,
      } as Response);

      const result = await revokeDevice('dev-1');

      expect(global.fetch).toHaveBeenCalledWith('/api/agent/devices/dev-1/revoke', {
        method: 'POST',
      });
      expect(result).toEqual(mockRevoked);
      expect(result.isRevoked).toBe(true);
    });
  });

  describe('regenerateToken', () => {
    it('sends POST to /api/agent/devices/:id/regenerate-token and returns new token', async () => {
      const mockResponse: RegenerateDeviceTokenResponse = {
        id: 'dev-1',
        rawToken: 'apidot_dev_new_secret_456',
        tokenPrefix: 'apidot_dev_new_secr',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await regenerateToken('dev-1');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/agent/devices/dev-1/regenerate-token',
        { method: 'POST' }
      );
      expect(result).toEqual(mockResponse);
      expect(result.rawToken).toBe('apidot_dev_new_secret_456');
    });
  });
});
