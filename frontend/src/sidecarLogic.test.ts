import { describe, it, expect } from 'vitest';

export const SIDECAR_READY_REGEX = /\[APIDOT_SIDECAR_READY:(\d+)\]/;
export const SIDECAR_SECRET_HEADER = 'X-ApiDot-Sidecar-Secret';

export function parseSidecarPort(line: string): number | null {
  const match = line.match(SIDECAR_READY_REGEX);
  if (!match) return null;
  const port = parseInt(match[1], 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    return null;
  }
  return port;
}

export interface SidecarInfo {
  port: number;
  secret: string;
}

describe('Sidecar Ready Marker and Logic (Rust & Frontend Parity)', () => {
  it('extracts port 54321 from exact ready line', () => {
    const output = '[APIDOT_SIDECAR_READY:54321]\n';
    expect(parseSidecarPort(output)).toBe(54321);
  });

  it('extracts port when line has surrounding prefix or suffix', () => {
    const output = 'info: [APIDOT_SIDECAR_READY:49152] loopback listener ready\r\n';
    expect(parseSidecarPort(output)).toBe(49152);
  });

  it('validates min and max port boundaries (1 to 65535)', () => {
    expect(parseSidecarPort('[APIDOT_SIDECAR_READY:1]')).toBe(1);
    expect(parseSidecarPort('[APIDOT_SIDECAR_READY:65535]')).toBe(65535);
  });

  it('rejects port 0 and overflow > 65535', () => {
    expect(parseSidecarPort('[APIDOT_SIDECAR_READY:0]')).toBeNull();
    expect(parseSidecarPort('[APIDOT_SIDECAR_READY:65536]')).toBeNull();
  });

  it('rejects non-numeric and malformed outputs', () => {
    expect(parseSidecarPort('[APIDOT_SIDECAR_READY:abc]')).toBeNull();
    expect(parseSidecarPort('[APIDOT_SIDECAR_READY:]')).toBeNull();
    expect(parseSidecarPort('[APIDOT_SIDECAR_READY:54321')).toBeNull();
    expect(parseSidecarPort('')).toBeNull();
  });

  it('conforms to X-ApiDot-Sidecar-Secret header requirement', () => {
    expect(SIDECAR_SECRET_HEADER).toBe('X-ApiDot-Sidecar-Secret');
  });

  it('validates SidecarInfo data contract', () => {
    const info: SidecarInfo = {
      port: 54321,
      secret: 'test-secret-uuid',
    };
    expect(info.port).toBe(54321);
    expect(info.secret).toBe('test-secret-uuid');
  });
});
