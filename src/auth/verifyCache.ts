/**
 * Tiny LRU cache for argon2 verify results. Entries expire after `ttlMs`.
 * An `epoch` field bumps on password change → invalidates every prior entry.
 */

export interface VerifyCache {
  get(key: string): 'ok' | 'bad' | undefined;
  set(key: string, value: 'ok' | 'bad'): void;
  epoch(): number;
  bumpEpoch(): void;
  clear(): void;
}

export function createVerifyCache(opts: { ttlMs?: number; cap?: number } = {}): VerifyCache {
  const ttl = opts.ttlMs ?? 60_000;
  const cap = opts.cap ?? 16;
  const entries = new Map<string, { value: 'ok' | 'bad'; expiresAt: number }>();
  let ep = 1;

  function prune(): void {
    const now = Date.now();
    for (const [k, v] of entries) if (v.expiresAt < now) entries.delete(k);
    while (entries.size > cap) {
      const first = entries.keys().next();
      if (first.done) break;
      entries.delete(first.value);
    }
  }

  return {
    get(key) {
      const now = Date.now();
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt < now) {
        entries.delete(key);
        return undefined;
      }
      // LRU touch: re-insert so it's last in iteration order.
      entries.delete(key);
      entries.set(key, hit);
      return hit.value;
    },
    set(key, value) {
      entries.set(key, { value, expiresAt: Date.now() + ttl });
      prune();
    },
    epoch() {
      return ep;
    },
    bumpEpoch() {
      ep++;
      entries.clear();
    },
    clear() {
      entries.clear();
    },
  };
}
