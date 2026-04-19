import fs from 'node:fs';
import { gib } from './iec.js';

/** In-process TTL cache. Prevents hammering statfs during tight eval loops. */
const cache = new Map<string, { ts: number; free_gib: number }>();
const TTL_MS = 30_000;

/**
 * Returns free space in GiB on the filesystem containing `p`. Cached for 30s.
 * If `p` doesn't exist or statfs fails, returns 0 (treat as disk unreachable upstream).
 */
export function freeGib(p: string): number {
  const now = Date.now();
  const cached = cache.get(p);
  if (cached && now - cached.ts < TTL_MS) return cached.free_gib;
  let free = 0;
  try {
    // statfsSync — available on Node 18+. Returns bsize + bavail.
    const stats = (fs as unknown as { statfsSync(path: string): { bsize: number; bavail: number } }).statfsSync(p);
    free = gib(stats.bsize * stats.bavail);
  } catch {
    free = 0;
  }
  cache.set(p, { ts: now, free_gib: free });
  return free;
}

export function clearDiskCache(): void {
  cache.clear();
}
