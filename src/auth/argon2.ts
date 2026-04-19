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
