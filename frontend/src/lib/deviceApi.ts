export interface AgentDeviceDto {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAtUtc: string;
  lastConnectedAtUtc?: string | null;
  lastConnectedHostname?: string | null;
  lastConnectedOs?: string | null;
  agentVersion?: string | null;
  isRevoked: boolean;
  isOnline: boolean;
}

export interface CreateAgentDeviceRequest {
  name: string;
}

export interface CreateAgentDeviceResponse {
  id: string;
  deviceId?: string;
  name: string;
  rawToken: string;
  tokenPrefix: string;
  createdAtUtc: string;
  device?: AgentDeviceDto | null;
}

export interface RegenerateDeviceTokenResponse {
  id: string;
  deviceId?: string;
  rawToken: string;
  tokenPrefix: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      if (typeof res.json === 'function') {
        const data = await res.json().catch(() => null);
        if (data && typeof data === 'object') {
          message = data.detail || data.title || data.message || message;
        }
      }
      if (message === `Request failed with status ${res.status}` && typeof res.text === 'function') {
        const text = await res.text().catch(() => null);
        if (text) {
          message = text;
        }
      }
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

export async function fetchDevices(): Promise<AgentDeviceDto[]> {
  const res = await fetch('/api/agent/devices');
  return handleResponse<AgentDeviceDto[]>(res);
}

export async function getDevice(id: string): Promise<AgentDeviceDto> {
  const res = await fetch(`/api/agent/devices/${encodeURIComponent(id)}`);
  return handleResponse<AgentDeviceDto>(res);
}

export async function createDevice(name: string): Promise<CreateAgentDeviceResponse> {
  const res = await fetch('/api/agent/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return handleResponse<CreateAgentDeviceResponse>(res);
}

export async function revokeDevice(id: string): Promise<AgentDeviceDto> {
  const res = await fetch(`/api/agent/devices/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
  });
  return handleResponse<AgentDeviceDto>(res);
}

export async function regenerateToken(id: string): Promise<RegenerateDeviceTokenResponse> {
  const res = await fetch(`/api/agent/devices/${encodeURIComponent(id)}/regenerate-token`, {
    method: 'POST',
  });
  return handleResponse<RegenerateDeviceTokenResponse>(res);
}
