import { create } from 'zustand';
import {
  AgentDeviceDto,
  CreateAgentDeviceResponse,
  RegenerateDeviceTokenResponse,
  fetchDevices as fetchDevicesApi,
  createDevice as createDeviceApi,
  revokeDevice as revokeDeviceApi,
  regenerateToken as regenerateTokenApi,
} from '@/lib/deviceApi';

export const DEVICE_STORAGE_KEY = 'apidot_device_id';

export const INITIAL_DEVICE_STATE = {
  devices: [] as AgentDeviceDto[],
  activeDeviceId: null as string | null,
  isLoading: false,
  error: null as string | null,
  isPolling: false,
};

function getStoredDeviceId(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(DEVICE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

function setStoredDeviceId(id: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (id && id.trim()) {
        localStorage.setItem(DEVICE_STORAGE_KEY, id.trim());
      } else {
        localStorage.removeItem(DEVICE_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage access errors
  }
}

let pollingIntervalId: ReturnType<typeof setInterval> | null = null;

export interface DeviceState {
  devices: AgentDeviceDto[];
  activeDeviceId: string | null;
  isLoading: boolean;
  error: string | null;
  isPolling: boolean;

  setDevices: (devices: AgentDeviceDto[]) => void;
  setActiveDeviceId: (id: string | null) => void;
  fetchDevices: (options?: { silent?: boolean }) => Promise<AgentDeviceDto[]>;
  createDevice: (name: string) => Promise<CreateAgentDeviceResponse>;
  revokeDevice: (id: string) => Promise<AgentDeviceDto>;
  regenerateToken: (id: string) => Promise<RegenerateDeviceTokenResponse>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
  getActiveDevice: () => AgentDeviceDto | null;
  isCurrentDeviceOnline: () => boolean;
  initFromLocalStorage: () => string | null;
  reset: () => void;
}

export const useDeviceStore = create<DeviceState>()((set, get) => ({
  devices: [],
  activeDeviceId: getStoredDeviceId(),
  isLoading: false,
  error: null,
  isPolling: false,

  setDevices: (devices: AgentDeviceDto[]) => {
    const validList = Array.isArray(devices) ? devices : [];
    set({ devices: validList });
  },

  setActiveDeviceId: (id: string | null) => {
    const cleanId = id && id.trim() ? id.trim() : null;
    setStoredDeviceId(cleanId);
    set({ activeDeviceId: cleanId });
  },

  fetchDevices: async (options?: { silent?: boolean }): Promise<AgentDeviceDto[]> => {
    if (!options?.silent) {
      set({ isLoading: true, error: null });
    }
    try {
      const list = await fetchDevicesApi();
      const validList = Array.isArray(list) ? list : [];

      set((state) => ({
        devices: validList,
        activeDeviceId: state.activeDeviceId ?? getStoredDeviceId(),
        isLoading: false,
        error: null,
      }));
      return validList;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao buscar dispositivos';
      set({ isLoading: false, error: message });
      return [];
    }
  },

  createDevice: async (name: string): Promise<CreateAgentDeviceResponse> => {
    set({ isLoading: true, error: null });
    try {
      const response = await createDeviceApi(name);
      const list = await fetchDevicesApi().catch(() => get().devices);
      set({ devices: list, isLoading: false, error: null });
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao criar dispositivo';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  revokeDevice: async (id: string): Promise<AgentDeviceDto> => {
    set({ isLoading: true, error: null });
    try {
      const revoked = await revokeDeviceApi(id);
      set((state) => ({
        devices: state.devices.map((d) => (d.id === id ? revoked : d)),
        isLoading: false,
        error: null,
      }));
      return revoked;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao revogar dispositivo';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  regenerateToken: async (id: string): Promise<RegenerateDeviceTokenResponse> => {
    set({ isLoading: true, error: null });
    try {
      const response = await regenerateTokenApi(id);
      const list = await fetchDevicesApi().catch(() => get().devices);
      set({ devices: list, isLoading: false, error: null });
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao regenerar token';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  startPolling: (intervalMs: number = 3000) => {
    if (pollingIntervalId !== null) {
      clearInterval(pollingIntervalId);
      pollingIntervalId = null;
    }

    set({ isPolling: true });
    void get().fetchDevices();

    pollingIntervalId = setInterval(() => {
      void get().fetchDevices({ silent: true });
    }, intervalMs);
  },

  stopPolling: () => {
    if (pollingIntervalId !== null) {
      clearInterval(pollingIntervalId);
      pollingIntervalId = null;
    }
    set({ isPolling: false });
  },

  getActiveDevice: (): AgentDeviceDto | null => {
    const { activeDeviceId, devices } = get();
    if (!activeDeviceId) return null;
    return devices.find((d) => d.id === activeDeviceId) || null;
  },

  isCurrentDeviceOnline: (): boolean => {
    const active = get().getActiveDevice();
    return Boolean(active && active.isOnline && !active.isRevoked);
  },

  initFromLocalStorage: (): string | null => {
    const stored = getStoredDeviceId();
    if (stored) {
      set({ activeDeviceId: stored });
    }
    return stored;
  },

  reset: () => {
    if (pollingIntervalId !== null) {
      clearInterval(pollingIntervalId);
      pollingIntervalId = null;
    }
    setStoredDeviceId(null);
    set({
      devices: [],
      activeDeviceId: null,
      isLoading: false,
      error: null,
      isPolling: false,
    });
  },
}));
