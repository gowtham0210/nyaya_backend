import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, getTokenExpiryMs } from '@/lib/jwt';

function createTestToken(payload: Record<string, unknown>) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('jwt helpers', () => {
  it('decodes the token payload safely', () => {
    const token = createTestToken({
      sub: '42',
      role: 'admin',
      exp: 1_900_000_000,
    });

    expect(decodeJwtPayload(token)).toMatchObject({
      sub: '42',
      role: 'admin',
      exp: 1_900_000_000,
    });
  });

  it('returns zero for missing or invalid tokens', () => {
    expect(getTokenExpiryMs('')).toBe(0);
    expect(getTokenExpiryMs('broken.token')).toBe(0);
  });
});
