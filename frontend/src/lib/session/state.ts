/**
 * In-memory session state shared by the API facades and the boot sequence.
 *
 * This module is the bottom of the session import graph: it must not import the
 * API client, `lib/authApi` or the boot, or the client would form a cycle with
 * the code that makes it wait.
 *
 * The store is also the boot signal. `status` only becomes `ready` or `failed`
 * once hydration has finished, which is what `lib/session/boot` and the
 * bootstrap component gate on.
 */

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { AuthUser, DesktopSession } from './types';

export type SessionStatus = 'idle' | 'hydrating' | 'ready' | 'failed';

export interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  session: DesktopSession | null;
  user: AuthUser | null;

  setAccessToken: (token: string | null) => void;
  setSession: (session: DesktopSession | null) => DesktopSession | null;
  setUser: (user: AuthUser | null) => void;
  setStatus: (status: SessionStatus) => void;
  clearKeepingDeviceIdentity: () => DesktopSession | null;
  reset: () => void;
}

export const INITIAL_SESSION_STATE = {
  status: 'idle' as SessionStatus,
  accessToken: null as string | null,
  session: null as DesktopSession | null,
  user: null as AuthUser | null,
};

export const sessionStore = createStore<SessionState>()((set, get) => ({
  ...INITIAL_SESSION_STATE,

  setAccessToken: (token: string | null) => {
    set({ accessToken: token && token.length > 0 ? token : null });
  },

  setSession: (session: DesktopSession | null) => {
    const next = session ? { ...session } : null;
    set({ session: next });
    return next;
  },

  setUser: (user: AuthUser | null) => {
    set({ user });
  },

  setStatus: (status: SessionStatus) => {
    set({ status });
  },

  /**
   * Drops the credential but keeps the machine row identity so the next login
   * reuses it. `deviceKey` is not a secret.
   */
  clearKeepingDeviceIdentity: () => {
    const current = get().session;
    const preserved: DesktopSession = {};

    if (current?.deviceKey) {
      preserved.deviceKey = current.deviceKey;
    }

    const next = Object.keys(preserved).length > 0 ? preserved : null;
    set({ session: next, accessToken: null, user: null });
    return next;
  },

  reset: () => {
    set({ ...INITIAL_SESSION_STATE });
  },
}));

export function useSessionStore<T>(selector: (state: SessionState) => T): T {
  return useStore(sessionStore, selector);
}
