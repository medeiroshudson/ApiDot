/**
 * Shared session types.
 *
 * These live outside `lib/authApi` and `lib/api/session` because the session
 * store sits below the API client in the import graph: importing them from
 * either facade would close a cycle through `lib/session/boot`.
 */

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

export interface DesktopSession {
  userId?: string | null;
  deviceId?: string | null;
  deviceKey?: string | null;
  accessToken?: string | null;
  expiresAt?: string | null;
  serverUrl?: string | null;
}
