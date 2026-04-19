import fs from 'node:fs';
import { gib } from './iec.js';

/** In-process TTL cache. Prevents hammering statfs during tight eval loops. */
const freeCache = new Map<string, { ts: number; free_gib: number }>();
const fullCache = new Map<string, { ts: number; stats: DiskStats }>();
const TTL_MS = 30_000;

/**
 * Returns free space in GiB on the filesystem containing `p`. Cached for 30s.
 * If `p` doesn't exist or statfs fails, returns 0 (treat as disk unreachable upstream).
 */
export function freeGib(p: string): number {
  const now = Date.now();
  const cached = freeCache.get(p);
  if (cached && now - cached.ts < TTL_MS) return cached.free_gib;
  let free = 0;
  try {
    const stats = (fs as unknown as { statfsSync(path: string): { bsize: number; bavail: number } }).statfsSync(p);
    free = gib(stats.bsize * stats.bavail);
  } catch {
    free = 0;
  }
  freeCache.set(p, { ts: now, free_gib: free });
  return free;
}

export interface DiskStats {
  freeGib: number;
  totalGib: number;
  usedGib: number;
}

interface StatfsLike {
  bsize: number;
  blocks: number;
  bavail: number;
  bfree: number;
}

/**
 * FR-V2-19 (backend): full-disk stats — used + free + total in GiB. Used by
 * the dashboard DiskTile dual-bar. 30s TTL cached. On error returns zeros so
 * the UI degrades to "—" without crashing.
 */
export function diskStats(p: string): DiskStats {
  const now = Date.now();
  const cached = fullCache.get(p);
  if (cached && now - cached.ts < TTL_MS) return cached.stats;
  let stats: DiskStats = { freeGib: 0, totalGib: 0, usedGib: 0 };
  try {
    const s = (fs as unknown as { statfsSync(path: string): StatfsLike }).statfsSync(p);
    const totalBytes = s.blocks * s.bsize;
    const freeBytes = s.bavail * s.bsize;
    const usedBytes = totalBytes - freeBytes;
    stats = {
      freeGib: round2(gib(freeBytes)),
      totalGib: round2(gib(totalBytes)),
      usedGib: round2(gib(usedBytes)),
    };
  } catch {
    /* fall through to zeros */
  }
  fullCache.set(p, { ts: now, stats });
  return stats;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clearDiskCache(): void {
  freeCache.clear();
  fullCache.clear();
}
