export interface AuthConfig {
  oidcEnabled: boolean;
  localAuthEnabled: boolean;
  providerName: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
  role: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  isRoot: boolean;
  locale?: string | null;
  workspaces: AuthWorkspace[];
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
  const res = await fetch('/api/auth/config');
  return handleResponse<AuthConfig>(res);
}

export async function loginLocal(email: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<AuthUser>(res);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) {
    return null;
  }
  return handleResponse<AuthUser>(res);
}

export async function logout(): Promise<void> {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
  });
  await handleResponse<{ message?: string }>(res);
}

export async function patchUserLocale(locale: string): Promise<void> {
  const res = await fetch('/api/auth/me/locale', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
  if (!res.ok) throw new Error('Failed to update locale preference');
}
