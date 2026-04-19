import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { EventBus } from '../events/bus.js';
import type { AppConfig } from '../config/schema.js';
import type { QbtClient, QbtTorrentInfo } from '../qbt/client.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';
import {
  addToBlacklist,
  deleteLifecyclePeerState,
  getTorrentEventByInfohash,
} from '../db/queries.js';
import { unixSec } from '../util/time.js';

/**
 * stuckChecker: permanently evict harvester torrents that have been stuck
 * in qBt's checking states past `config.stuck_checker.stuck_timeout_sec`.
 *
 * A qBt torrent sits in `checkingDL` / `checkingUP` / `checkingResumeData`
 * / `metaDL` while libtorrent hash-verifies local files. Normally these
 * finish in seconds; "stuck" for half an hour usually means the on-disk
 * data is corrupt or the drive is unhappy, and just leaving the torrent
 * wedges the downloader worker and blocks seeding.
 *
 * Behaviour per tick:
 *   1. List harvester-tagged torrents.
 *   2. For each torrent whose state matches the checking regex, record
 *      the first-seen timestamp in the in-memory `checkingSince` map.
 *      Torrents that leave the checking state drop from the map so a
 *      later re-check starts a fresh clock.
 *   3. If a torrent has been in checking for >= stuck_timeout_sec, delete
 *      it from qBt (with data) and — critically — add its mteam_id to
 *      the `torrent_blacklist` table so the poller's blacklist gate
 *      never reconsiders it.
 *
 * In-memory tracking is fine across crashes: after a restart the clock
 * restarts too, giving each torrent a fresh grace period. No false
 * positives, only a possible delay before a truly stuck torrent is
 * caught again.
 */

const CHECKING_RE = /^(?:checkingDL|checkingUP|checkingResumeData|metaDL)$/;

export function createStuckCheckerWorker(deps: {
  db: Db;
  logger: Logger;
  bus: EventBus;
  config: AppConfig;
  qbt: QbtClient;
}): LoopWorker {
  const { db, logger, bus, config, qbt } = deps;
  const checkingSince = new Map<string, number>();

  async function tick(): Promise<void> {
    const cfg = config.stuck_checker;
    if (!cfg.enabled) return;

    let torrents: QbtTorrentInfo[];
    try {
      torrents = await qbt.listTorrents({ tag: 'harvester' });
    } catch (err) {
      logger.warn({ component: 'stuckChecker', err }, 'qbt.listTorrents failed');
      return;
    }

    const now = unixSec();
    const liveHashes = new Set<string>();

    for (const t of torrents) {
      const hash = t.hash.toLowerCase();
      liveHashes.add(hash);

      if (!CHECKING_RE.test(t.state)) {
        checkingSince.delete(hash);
        continue;
      }

      const since = checkingSince.get(hash);
      if (since == null) {
        checkingSince.set(hash, now);
        continue;
      }

      const stuckSec = now - since;
      if (stuckSec < cfg.stuck_timeout_sec) continue;

      // Stuck past threshold — blacklist then delete.
      const evt = getTorrentEventByInfohash(db, hash);
      const mteamId = evt?.mteam_id ?? `unknown:${hash}`;
      try {
        addToBlacklist(db, {
          mteam_id: mteamId,
          infohash: hash,
          reason: 'stuck_checking',
          added_at: now,
        });
        await qbt.deleteTorrents([t.hash], true);
        deleteLifecyclePeerState(db, t.hash);
        checkingSince.delete(hash);
        bus.emit('lifecycle.removed', {
          type: 'lifecycle.removed',
          infohash: t.hash,
          reason: 'stuck_checking',
        });
        logger.warn(
          {
            component: 'stuckChecker',
            op: 'evict',
            infohash: t.hash,
            mteam_id: mteamId,
            name: t.name,
            size_bytes: t.size,
            state: t.state,
            stuck_sec: stuckSec,
          },
          'evicted stuck torrent (blacklisted, will not be re-grabbed)',
        );
      } catch (err) {
        logger.warn(
          { component: 'stuckChecker', hash: t.hash, err },
          'stuck torrent evict failed — will retry next tick',
        );
      }
    }

    // Garbage-collect state for torrents that no longer exist in qBt
    // (manually removed, or evicted by lifecycle / diskGuard above).
    for (const hash of checkingSince.keys()) {
      if (!liveHashes.has(hash)) checkingSince.delete(hash);
    }
  }

  return createLoopWorker({
    name: 'stuckChecker',
    intervalMs: () => config.stuck_checker.interval_sec * 1000,
    tick,
    logger,
    runOnStart: false,
  });
}
