import { apiFetch } from '@/lib/api/client';
import { getApiBase } from '@/lib/api/base';
import { getSession, persistDeviceCredential } from '@/lib/api/session';
import type { AuthUser, AuthWorkspace } from '@/lib/session/types';

// Defined in `lib/session/types` so the session store can use them without
// importing this module, which reaches the API client.
export type { AuthUser, AuthWorkspace } from '@/lib/session/types';

export interface AuthConfig {
  oidcEnabled: boolean;
  localAuthEnabled: boolean;
  providerName: string;
}

export type AuthConfigDto = AuthConfig;
export type AuthUserDto = AuthUser;
export type AuthWorkspaceDto = AuthWorkspace;

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

export async function getAuthConfig(): Promise<AuthConfig> {
  const res = await apiFetch('/api/auth/config');
  return handleResponse<AuthConfig>(res);
}

export async function loginLocal(email: string, password: string): Promise<AuthUser> {
  // The stored key reuses this machine's device row; without it the body is the web request.
  const deviceKey = getSession()?.deviceKey;
  const body = deviceKey ? { email, password, deviceKey } : { email, password };

  const res = await apiFetch('/api/auth/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const user = await handleResponse<AuthUser>(res);

  // Self-hosted deployments receive the same device credential headers as the
  // SSO exchange; on the web the helper is a no-op.
  await persistDeviceCredential(res, {
    userId: user.id,
    serverUrl: getApiBase() || null,
  });

  return user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await apiFetch('/api/auth/me');
  if (res.status === 401) {
    return null;
  }
  return handleResponse<AuthUser>(res);
}

export async function logout(): Promise<void> {
  const res = await apiFetch('/api/auth/logout', {
    method: 'POST',
  });
  await handleResponse<{ message?: string }>(res);
}

/**
 * Revokes the presented device token (logout, not operator revocation).
 *
 * The server clears the token hash and keeps the device row reusable. A 401
 * means the token was already invalid: there is nothing left to revoke.
 */
export async function revokeDeviceToken(): Promise<void> {
  const res = await apiFetch('/api/auth/device-token', {
    method: 'DELETE',
  });

  if (res.status === 401 || res.status === 204) {
    return;
  }

  await handleResponse<void>(res);
}

export async function patchUserLocale(locale: string): Promise<void> {
  const res = await apiFetch('/api/auth/me/locale', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
  if (!res.ok) throw new Error('Failed to update locale preference');
}
