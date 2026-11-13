import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APIDOT_API_BASE = ' https://apidot.example.com/ ';
});

import { apiUrl, getApiBase } from './base';
import { apiFetch } from './client';

describe('api base compiled into the build', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes the value once at module load', () => {
    expect(getApiBase()).toBe('https://apidot.example.com');
    expect(apiUrl('/api/workspaces')).toBe('https://apidot.example.com/api/workspaces');
  });

  it('reaches apiFetch', async () => {
    await apiFetch('/api/workspaces');

    expect(fetchMock).toHaveBeenCalledWith('https://apidot.example.com/api/workspaces');
  });
});
