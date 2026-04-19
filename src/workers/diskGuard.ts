import type { Logger } from '../logger/index.js';
import type { EventBus } from '../events/bus.js';
import type { AppConfig } from '../config/schema.js';
import type { QbtClient, QbtTorrentInfo } from '../qbt/client.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';
import { clearDiskCache, diskStats } from '../util/disk.js';
import { unixSec } from '../util/time.js';

const GIB = 1024 ** 3;

/**
 * Disk-guard worker. When free space on the downloads path drops below
 * `disk_guard.low_free_gib`, delete harvester-tagged torrents — worst-first by
 * share ratio, stalled state, then age — until free space climbs back above
 * `disk_guard.target_free_gib`. Runs independently of the lifecycle worker so
 * it can evict BEFORE the natural end-of-lifecycle kicks in.
 *
 * Safety: never deletes torrents younger than `min_age_hours` (so in-flight
 * downloads aren't nuked), caps deletes at `max_delete_per_tick`, and emits
 * `lifecycle.removed` with reason `disk_guard` for each deletion.
 */
export function createDiskGuardWorker(deps: {
  logger: Logger;
  bus: EventBus;
  config: AppConfig;
  qbt: QbtClient;
}): LoopWorker {
  const { logger, bus, config, qbt } = deps;

  async function tick(): Promise<void> {
    const cfg = config.disk_guard;
    if (!cfg.enabled) return;

    const path = config.downloads.default_save_path;
    const { freeGib } = diskStats(path);
    if (freeGib === 0) {
      // 0 means statfs failed — treat as unreachable, don't delete anything.
      logger.warn({ component: 'diskGuard', path }, 'disk unreachable; skipping tick');
      return;
    }
    if (freeGib >= cfg.low_free_gib) return;

    let torrents: QbtTorrentInfo[];
    try {
      torrents = await qbt.listTorrents({ tag: 'harvester' });
    } catch (err) {
      logger.warn({ component: 'diskGuard', err }, 'qbt.listTorrents failed');
      return;
    }

    const now = unixSec();
    const minAgeSec = cfg.min_age_hours * 3600;
    const candidates = torrents
      .filter((t) => now - (t.added_on || 0) >= minAgeSec)
      .map((t) => ({ t, score: evictionScore(t, now) }))
      // Worst score first.
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      logger.warn(
        { component: 'diskGuard', freeGib, low: cfg.low_free_gib },
        'disk low but no eligible torrents to evict',
      );
      return;
    }

    const bytesNeeded = Math.max(0, cfg.target_free_gib - freeGib) * GIB;
    let bytesFreed = 0;
    const toDelete: typeof candidates = [];
    for (const c of candidates) {
      if (toDelete.length >= cfg.max_delete_per_tick) break;
      toDelete.push(c);
      bytesFreed += c.t.size;
      if (bytesFreed >= bytesNeeded) break;
    }

    logger.info(
      {
        component: 'diskGuard',
        freeGib,
        low: cfg.low_free_gib,
        target: cfg.target_free_gib,
        bytesNeeded,
        plannedDeletes: toDelete.length,
        plannedBytes: bytesFreed,
      },
      'disk low — evicting',
    );

    for (const { t, score } of toDelete) {
      try {
        await qbt.deleteTorrents([t.hash], cfg.remove_with_data);
        bus.emit('lifecycle.removed', {
          type: 'lifecycle.removed',
          infohash: t.hash,
          reason: 'disk_guard',
        });
        logger.info(
          {
            component: 'diskGuard',
            op: 'delete',
            infohash: t.hash,
            name: t.name,
            size_bytes: t.size,
            ratio: t.ratio,
            state: t.state,
            age_hours: Math.round((now - (t.added_on || 0)) / 3600),
            score: Number(score.toFixed(3)),
          },
          'evicted torrent',
        );
      } catch (err) {
        logger.warn({ component: 'diskGuard', hash: t.hash, err }, 'delete failed');
      }
    }

    // Force a fresh statfs on the next tick — 30s TTL would otherwise hide the
    // space we just freed from the lifecycle worker and dashboard.
    clearDiskCache();
  }

  return createLoopWorker({
    name: 'diskGuard',
    intervalMs: () => config.disk_guard.interval_sec * 1000,
    tick,
    logger,
    // Don't evict in the first few seconds after boot — give workers time to
    // settle and for the user to notice if something is wrong.
    runOnStart: false,
  });
}

/**
 * Eviction ranking. Higher = delete first.
 *
 * Three signals, each normalized into [0, 1]-ish ranges:
 *   - shareDeficit  — how far below ratio 1.0 (weight 2.0). Matches
 *                     "low on share".
 *   - stalledBonus  — currently in stalled state (weight 0.5). Matches
 *                     "stalled a lot".
 *   - ageNorm       — age capped at 7 days (weight 0.3). Matches
 *                     "older than other files" as a tie-breaker.
 *
 * A stalled torrent with ratio 0.2 scores 2*0.8 + 0.5 + age ≈ 2.1, which beats
 * a seeding torrent with ratio 0.9 (score ≈ 0.2 + age). That matches the
 * intended order: worst-share-and-stalled first, then low-share, then oldest.
 */
function evictionScore(t: QbtTorrentInfo, now: number): number {
  const ageDays = Math.max(0, (now - (t.added_on || now)) / 86400);
  const shareDeficit = Math.max(0, 1 - (t.ratio || 0));
  const isStalled = /^stalled(UP|DL)$/i.test(t.state);
  const ageNorm = Math.min(ageDays / 7, 1);
  return shareDeficit * 2 + (isStalled ? 0.5 : 0) + ageNorm * 0.3;
}
