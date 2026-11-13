/**
 * API client used by the rest of the app.
 *
 * Every request waits for the boot to settle first, so a caller cannot fire
 * before the base and the stored credential are known. The gate that hides the
 * children is a UI detail; this await is the actual invariant.
 */

import { ensureBooted } from '@/lib/session/boot';
import { rawFetch } from './rawFetch';

export { setUnauthorizedHandler } from './rawFetch';
export type { UnauthorizedHandler } from './rawFetch';

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  await ensureBooted();
  return rawFetch(path, init);
}
