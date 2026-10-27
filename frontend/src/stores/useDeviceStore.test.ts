import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as deviceApi from '@/lib/deviceApi';
import { AgentDeviceDto, CreateAgentDeviceResponse, RegenerateDeviceTokenResponse } from '@/lib/deviceApi';
import {
  useDeviceStore,
  DEVICE_STORAGE_KEY,
  INITIAL_DEVICE_STATE,
} from './useDeviceStore';

vi.mock('@/lib/deviceApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/deviceApi')>('@/lib/deviceApi');
  return {
    ...actual,
    fetchDevices: vi.fn(),
    createDevice: vi.fn(),
    revokeDevice: vi.fn(),
    regenerateToken: vi.fn(),
  };
});

const mockDevices: AgentDeviceDto[] = [
  {
    id: 'device-guid-123',
    name: 'Primary Workstation',
    tokenPrefix: 'apidot_dev_12345678',
    createdAtUtc: '2026-10-27T10:00:00Z',
    lastConnectedAtUtc: '2026-10-27T10:05:00Z',
    lastConnectedHostname: 'workstation.local',
    lastConnectedOs: 'macOS',
    agentVersion: '0.4.0',
    isRevoked: false,
    isOnline: true,
  },
  {
    id: 'device-guid-456',
    name: 'Backup Laptop',
    tokenPrefix: 'apidot_dev_87654321',
    createdAtUtc: '2026-10-27T11:00:00Z',
    isRevoked: false,
    isOnline: false,
  },
  {
    id: 'device-guid-revoked',
    name: 'Retired VM',
    tokenPrefix: 'apidot_dev_00000000',
    createdAtUtc: '2026-10-26T09:00:00Z',
    isRevoked: true,
    isOnline: true, // revoked takes precedence
  },
];

describe('useDeviceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useDeviceStore.getState().reset();
  });

  afterEach(() => {
    useDeviceStore.getState().stopPolling();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('1. Initial State & Constants', () => {
    it('should initialize with default state', () => {
      const state = useDeviceStore.getState();
      expect(state.devices).toEqual([]);
      expect(state.activeDeviceId).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.isPolling).toBe(false);
    });

    it('should export DEVICE_STORAGE_KEY and INITIAL_DEVICE_STATE', () => {
      expect(DEVICE_STORAGE_KEY).toBe('apidot_device_id');
      expect(INITIAL_DEVICE_STATE).toEqual({
        devices: [],
        activeDeviceId: null,
        isLoading: false,
        error: null,
        isPolling: false,
      });
    });
  });

  describe('2. LocalStorage Pairing & Synchronization', () => {
    it('useDeviceStore initializes activeDeviceId from localStorage and fetches device list', async () => {
      localStorage.setItem('apidot_device_id', 'device-guid-123');
      vi.mocked(deviceApi.fetchDevices).mockResolvedValueOnce(mockDevices);

      const store = useDeviceStore.getState();
      const result = await store.fetchDevices();

      expect(deviceApi.fetchDevices).toHaveBeenCalled();
      expect(result).toEqual(mockDevices);
      expect(useDeviceStore.getState().activeDeviceId).toBe('device-guid-123');
      expect(useDeviceStore.getState().devices).toEqual(mockDevices);
      expect(useDeviceStore.getState().isCurrentDeviceOnline()).toBe(true);
    });

    it('setActiveDeviceId saves to state and localStorage', () => {
      useDeviceStore.getState().setActiveDeviceId('device-guid-456');

      expect(useDeviceStore.getState().activeDeviceId).toBe('device-guid-456');
      expect(localStorage.getItem(DEVICE_STORAGE_KEY)).toBe('device-guid-456');
    });

    it('setActiveDeviceId with null removes key from localStorage', () => {
      localStorage.setItem(DEVICE_STORAGE_KEY, 'device-guid-456');
      useDeviceStore.getState().setActiveDeviceId(null);

      expect(useDeviceStore.getState().activeDeviceId).toBeNull();
      expect(localStorage.getItem(DEVICE_STORAGE_KEY)).toBeNull();
    });

    it('setActiveDeviceId with empty string clears activeId and removes key', () => {
      localStorage.setItem(DEVICE_STORAGE_KEY, 'device-guid-456');
      useDeviceStore.getState().setActiveDeviceId('   ');

      expect(useDeviceStore.getState().activeDeviceId).toBeNull();
      expect(localStorage.getItem(DEVICE_STORAGE_KEY)).toBeNull();
    });

    it('initFromLocalStorage re-reads from localStorage', () => {
      localStorage.setItem(DEVICE_STORAGE_KEY, 'device-from-storage');
      const loaded = useDeviceStore.getState().initFromLocalStorage();

      expect(loaded).toBe('device-from-storage');
      expect(useDeviceStore.getState().activeDeviceId).toBe('device-from-storage');
    });
  });

  describe('3. Synchronous State Setters', () => {
    it('setDevices updates the devices list', () => {
      useDeviceStore.getState().setDevices(mockDevices);
      expect(useDeviceStore.getState().devices).toEqual(mockDevices);
    });

    it('setDevices handles non-array safely', () => {
      useDeviceStore.getState().setDevices(null as unknown as AgentDeviceDto[]);
      expect(useDeviceStore.getState().devices).toEqual([]);
    });
  });

  describe('4. fetchDevices', () => {
    it('populates devices and clears isLoading on success', async () => {
      vi.mocked(deviceApi.fetchDevices).mockResolvedValueOnce(mockDevices);

      const fetchPromise = useDeviceStore.getState().fetchDevices();
      expect(useDeviceStore.getState().isLoading).toBe(true);

      const result = await fetchPromise;
      expect(result).toEqual(mockDevices);
      expect(useDeviceStore.getState().devices).toEqual(mockDevices);
      expect(useDeviceStore.getState().isLoading).toBe(false);
      expect(useDeviceStore.getState().error).toBeNull();
    });

    it('sets error and resets isLoading on API failure', async () => {
      vi.mocked(deviceApi.fetchDevices).mockRejectedValueOnce(new Error('Network disconnected'));

      const result = await useDeviceStore.getState().fetchDevices();

      expect(result).toEqual([]);
      expect(useDeviceStore.getState().devices).toEqual([]);
      expect(useDeviceStore.getState().isLoading).toBe(false);
      expect(useDeviceStore.getState().error).toBe('Network disconnected');
    });
  });

  describe('5. createDevice', () => {
    it('creates device via API and refreshes device list', async () => {
      const createResponse: CreateAgentDeviceResponse = {
        id: 'new-dev-id',
        name: 'New Node',
        rawToken: 'apidot_dev_secret_token',
        tokenPrefix: 'apidot_dev_secr',
        createdAtUtc: '2026-10-27T12:00:00Z',
      };

      vi.mocked(deviceApi.createDevice).mockResolvedValueOnce(createResponse);
      vi.mocked(deviceApi.fetchDevices).mockResolvedValueOnce([
        ...mockDevices,
        {
          id: 'new-dev-id',
          name: 'New Node',
          tokenPrefix: 'apidot_dev_secr',
          createdAtUtc: '2026-10-27T12:00:00Z',
          isRevoked: false,
          isOnline: false,
        },
      ]);

      const result = await useDeviceStore.getState().createDevice('New Node');

      expect(deviceApi.createDevice).toHaveBeenCalledWith('New Node');
      expect(result).toEqual(createResponse);
      expect(useDeviceStore.getState().devices).toHaveLength(4);
      expect(useDeviceStore.getState().isLoading).toBe(false);
      expect(useDeviceStore.getState().error).toBeNull();
    });

    it('sets error and throws when createDevice fails', async () => {
      vi.mocked(deviceApi.createDevice).mockRejectedValueOnce(new Error('Name already taken'));

      await expect(useDeviceStore.getState().createDevice('Bad Name')).rejects.toThrow(
        'Name already taken'
      );
      expect(useDeviceStore.getState().error).toBe('Name already taken');
      expect(useDeviceStore.getState().isLoading).toBe(false);
    });
  });

  describe('6. revokeDevice', () => {
    it('revokes device via API and updates store state', async () => {
      useDeviceStore.getState().setDevices(mockDevices);

      const revokedDevice: AgentDeviceDto = {
        ...mockDevices[0],
        isRevoked: true,
        isOnline: false,
      };

      vi.mocked(deviceApi.revokeDevice).mockResolvedValueOnce(revokedDevice);

      const result = await useDeviceStore.getState().revokeDevice('device-guid-123');

      expect(deviceApi.revokeDevice).toHaveBeenCalledWith('device-guid-123');
      expect(result).toEqual(revokedDevice);

      const updated = useDeviceStore.getState().devices.find((d) => d.id === 'device-guid-123');
      expect(updated?.isRevoked).toBe(true);
      expect(updated?.isOnline).toBe(false);
      expect(useDeviceStore.getState().isLoading).toBe(false);
    });

    it('sets error and throws when revokeDevice fails', async () => {
      vi.mocked(deviceApi.revokeDevice).mockRejectedValueOnce(new Error('Device not found'));

      await expect(useDeviceStore.getState().revokeDevice('missing')).rejects.toThrow(
        'Device not found'
      );
      expect(useDeviceStore.getState().error).toBe('Device not found');
      expect(useDeviceStore.getState().isLoading).toBe(false);
    });
  });

  describe('7. regenerateToken', () => {
    it('regenerates token via API and refreshes device list', async () => {
      const regenResponse: RegenerateDeviceTokenResponse = {
        id: 'device-guid-123',
        rawToken: 'apidot_dev_brand_new_token',
        tokenPrefix: 'apidot_dev_brand',
      };

      vi.mocked(deviceApi.regenerateToken).mockResolvedValueOnce(regenResponse);
      vi.mocked(deviceApi.fetchDevices).mockResolvedValueOnce(mockDevices);

      const result = await useDeviceStore.getState().regenerateToken('device-guid-123');

      expect(deviceApi.regenerateToken).toHaveBeenCalledWith('device-guid-123');
      expect(result).toEqual(regenResponse);
      expect(useDeviceStore.getState().isLoading).toBe(false);
    });

    it('sets error and throws when regenerateToken fails', async () => {
      vi.mocked(deviceApi.regenerateToken).mockRejectedValueOnce(new Error('Failed to regenerate'));

      await expect(useDeviceStore.getState().regenerateToken('device-guid-123')).rejects.toThrow(
        'Failed to regenerate'
      );
      expect(useDeviceStore.getState().error).toBe('Failed to regenerate');
    });
  });

  describe('8. Polling (startPolling & stopPolling)', () => {
    it('starts polling and invokes fetchDevices periodically', async () => {
      vi.useFakeTimers();
      vi.mocked(deviceApi.fetchDevices).mockResolvedValue(mockDevices);

      useDeviceStore.getState().startPolling(3000);

      expect(useDeviceStore.getState().isPolling).toBe(true);
      // Immediately calls fetchDevices once
      expect(deviceApi.fetchDevices).toHaveBeenCalledTimes(1);

      // Advance by 3000ms
      await vi.advanceTimersByTimeAsync(3000);
      expect(deviceApi.fetchDevices).toHaveBeenCalledTimes(2);

      // Advance by another 3000ms
      await vi.advanceTimersByTimeAsync(3000);
      expect(deviceApi.fetchDevices).toHaveBeenCalledTimes(3);

      // Stop polling
      useDeviceStore.getState().stopPolling();
      expect(useDeviceStore.getState().isPolling).toBe(false);

      // Advancing further should not trigger additional calls
      await vi.advanceTimersByTimeAsync(3000);
      expect(deviceApi.fetchDevices).toHaveBeenCalledTimes(3);
    });

    it('restarting polling cleans up previous interval', async () => {
      vi.useFakeTimers();
      vi.mocked(deviceApi.fetchDevices).mockResolvedValue(mockDevices);

      useDeviceStore.getState().startPolling(3000);
      useDeviceStore.getState().startPolling(5000);

      expect(useDeviceStore.getState().isPolling).toBe(true);
      expect(deviceApi.fetchDevices).toHaveBeenCalledTimes(2); // once per startPolling

      await vi.advanceTimersByTimeAsync(5000);
      expect(deviceApi.fetchDevices).toHaveBeenCalledTimes(3);

      useDeviceStore.getState().stopPolling();
    });
  });

  describe('9. Computed Getters', () => {
    beforeEach(() => {
      useDeviceStore.getState().setDevices(mockDevices);
    });

    it('getActiveDevice returns matching device when activeDeviceId is set', () => {
      useDeviceStore.getState().setActiveDeviceId('device-guid-123');
      expect(useDeviceStore.getState().getActiveDevice()).toEqual(mockDevices[0]);
    });

    it('getActiveDevice returns null when activeDeviceId is null', () => {
      useDeviceStore.getState().setActiveDeviceId(null);
      expect(useDeviceStore.getState().getActiveDevice()).toBeNull();
    });

    it('getActiveDevice returns null when activeDeviceId does not match any device', () => {
      useDeviceStore.getState().setActiveDeviceId('non-existent');
      expect(useDeviceStore.getState().getActiveDevice()).toBeNull();
    });

    it('isCurrentDeviceOnline returns true only when active device is online and not revoked', () => {
      // Online and not revoked
      useDeviceStore.getState().setActiveDeviceId('device-guid-123');
      expect(useDeviceStore.getState().isCurrentDeviceOnline()).toBe(true);

      // Offline
      useDeviceStore.getState().setActiveDeviceId('device-guid-456');
      expect(useDeviceStore.getState().isCurrentDeviceOnline()).toBe(false);

      // Revoked (even if isOnline was true)
      useDeviceStore.getState().setActiveDeviceId('device-guid-revoked');
      expect(useDeviceStore.getState().isCurrentDeviceOnline()).toBe(false);

      // Null device
      useDeviceStore.getState().setActiveDeviceId(null);
      expect(useDeviceStore.getState().isCurrentDeviceOnline()).toBe(false);
    });
  });

  describe('10. reset', () => {
    it('resets state, clears localStorage, and stops active polling', () => {
      vi.useFakeTimers();
      useDeviceStore.getState().setDevices(mockDevices);
      useDeviceStore.getState().setActiveDeviceId('device-guid-123');
      useDeviceStore.getState().startPolling(3000);

      expect(useDeviceStore.getState().isPolling).toBe(true);
      expect(localStorage.getItem(DEVICE_STORAGE_KEY)).toBe('device-guid-123');

      useDeviceStore.getState().reset();

      expect(useDeviceStore.getState().devices).toEqual([]);
      expect(useDeviceStore.getState().activeDeviceId).toBeNull();
      expect(useDeviceStore.getState().isLoading).toBe(false);
      expect(useDeviceStore.getState().error).toBeNull();
      expect(useDeviceStore.getState().isPolling).toBe(false);
      expect(localStorage.getItem(DEVICE_STORAGE_KEY)).toBeNull();
    });
  });
});
