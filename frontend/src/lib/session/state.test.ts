import { describe, it, expect, beforeEach } from 'vitest';
import { INITIAL_SESSION_STATE, sessionStore } from './state';

const state = () => sessionStore.getState();

describe('session store', () => {
  beforeEach(() => {
    state().reset();
  });

  it('starts idle with no token, session or user', () => {
    expect(state().status).toBe('idle');
    expect(state().accessToken).toBeNull();
    expect(state().session).toBeNull();
    expect(state().user).toBeNull();
  });

  it('treats an empty token as signed out', () => {
    state().setAccessToken('tok-1');
    expect(state().accessToken).toBe('tok-1');

    state().setAccessToken('');
    expect(state().accessToken).toBeNull();

    state().setAccessToken('tok-2');
    state().setAccessToken(null);
    expect(state().accessToken).toBeNull();
  });

  it('clones the session it stores', () => {
    const session = { userId: 'u1', accessToken: 'tok-1' };

    const stored = state().setSession(session);

    expect(stored).toEqual(session);
    expect(stored).not.toBe(session);
    expect(state().session).not.toBe(session);

    state().setSession(null);
    expect(state().session).toBeNull();
  });

  it('records the hydrated user', () => {
    const user = {
      id: 'u1',
      email: 'u1@example.com',
      displayName: 'User One',
      isRoot: false,
      workspaces: [],
    };

    state().setUser(user);
    expect(state().user).toEqual(user);

    state().setUser(null);
    expect(state().user).toBeNull();
  });

  it('tracks every boot status transition', () => {
    const transitions = ['hydrating', 'ready', 'failed'] as const;

    for (const status of transitions) {
      state().setStatus(status);
      expect(state().status).toBe(status);
    }
  });

  it('clears the identity and token while preserving deviceKey', () => {
    state().setAccessToken('tok-1');
    state().setSession({
      userId: 'u1',
      deviceId: 'dev-1',
      deviceKey: 'key-1',
      accessToken: 'tok-1',
      expiresAt: '2026-12-09T00:00:00Z',
    });
    state().setUser({
      id: 'u1',
      email: 'u1@example.com',
      displayName: 'User One',
      isRoot: false,
      workspaces: [],
    });

    const cleared = state().clearKeepingDeviceIdentity();

    expect(cleared).toEqual({ deviceKey: 'key-1' });
    expect(state().session).toEqual(cleared);
    expect(state().accessToken).toBeNull();
    expect(state().user).toBeNull();
  });

  it('clears everything when the session had no machine identity', () => {
    state().setAccessToken('tok-1');
    state().setSession({ userId: 'u1', accessToken: 'tok-1' });

    expect(state().clearKeepingDeviceIdentity()).toBeNull();
    expect(state().session).toBeNull();
  });

  it('reset restores the initial state', () => {
    state().setAccessToken('tok-1');
    state().setSession({ deviceKey: 'key-1' });
    state().setStatus('ready');

    state().reset();

    expect(state()).toMatchObject(INITIAL_SESSION_STATE);
    expect(state().status).toBe('idle');
  });
});
