import argon2 from 'argon2';

/**
 * Argon2id params chosen to target ≥200ms verify on a modern laptop (IMPLEMENTATION.md §4.13).
 * Phase 0 spike didn't measure this on the user's machine; these are the reference defaults.
 * If the verify time exceeds 500ms in practice, reduce memoryCost; below 200ms, raise it.
 */
const ARGON2_OPTS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // KiB
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * TECH_DEBT L1 (V2 drive-by): measure one argon2 hash under the live params.
 * Called once at boot; surfaces a warning if the cost is far from the ≥200 ms
 * target so the operator knows to tune `memoryCost`. Never mutates params.
 */
export async function benchArgon2(): Promise<number> {
  const t0 = performance.now();
  await argon2.hash('bench_argon2_probe_' + Date.now(), ARGON2_OPTS);
  return Math.round(performance.now() - t0);
}

