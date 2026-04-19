import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, benchArgon2 } from './argon2.js';

// Phase-1 auth test — argon2 round-trip and the one-shot bench helper.

describe('argon2 password verify', () => {
  it('accepts the correct password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery staple 9');
    expect(await verifyPassword(hash, 'correct horse battery staple 9')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  }, 15_000);

  it('returns false on a garbage hash rather than throwing', async () => {
    expect(await verifyPassword('not-a-real-argon2-hash', 'anything')).toBe(false);
  });

  it('benchArgon2 returns a sane millisecond number', async () => {
    const ms = await benchArgon2();
    expect(typeof ms).toBe('number');
    expect(ms).toBeGreaterThan(0);
    // Upper bound is loose — CI runners vary wildly.
    expect(ms).toBeLessThan(10_000);
  }, 15_000);
});
