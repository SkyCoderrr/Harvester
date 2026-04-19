import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { QbtClient } from '../qbt/client.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';
import { unixSec } from '../util/time.js';

/**
 * Samples global qBt transfer speeds every 60s into transfer_snapshots.
 * Prunes rows older than 7 days on each tick.
 */
export function createTransferProbeWorker(deps: {
  db: Db;
  logger: Logger;
  qbt: QbtClient;
}): LoopWorker {
  const { db, logger, qbt } = deps;

  async function tick(): Promise<void> {
    try {
      const info = await qbt.getTransferInfo();
      const ts = unixSec();
      db.prepare(
        'INSERT OR REPLACE INTO transfer_snapshots (ts, dlspeed, upspeed) VALUES (?, ?, ?)',
      ).run(ts, info.dl_info_speed ?? 0, info.up_info_speed ?? 0);
      db.prepare('DELETE FROM transfer_snapshots WHERE ts < ?').run(ts - 7 * 86400);
    } catch (err) {
      logger.warn({ component: 'transferProbe', err }, 'transfer probe failed');
    }
  }

  return createLoopWorker({
    name: 'transferProbe',
    // Users want responsive live-speed numbers on the dashboard. qBt's
    // /api/v2/transfer/info is a cheap call; sampling every 10s costs a few
    // extra KB/day in the transfer_snapshots table.
    intervalMs: () => 10_000,
    tick,
    logger,
  });
}
