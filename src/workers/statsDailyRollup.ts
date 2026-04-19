import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { QbtClient } from '../qbt/client.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';
import { upsertStatsDaily, getLatestProfileSnapshot } from '../db/queries.js';
import { unixSec } from '../util/time.js';

/**
 * Rolls up per-day KPIs into the stats_daily table. Runs every 15 minutes — cheap enough
 * that we don't need a cron-at-00:05 scheduler. Always writes today's row; also fills
 * yesterday's if it doesn't exist yet.
 */
export function createStatsDailyRollupWorker(deps: {
  db: Db;
  logger: Logger;
  qbt: QbtClient;
}): LoopWorker {
  const { db, logger, qbt } = deps;

  async function tick(): Promise<void> {
    try {
      const now = unixSec();
      const today = todayLocal(now);
      const yesterday = todayLocal(now - 86400);

      await rollup(today);
      await rollup(yesterday);
    } catch (err) {
      logger.warn({ component: 'statsDailyRollup', err }, 'rollup failed');
    }
  }

  async function rollup(date: string): Promise<void> {
    // Grabs for the date (local day).
    const grabs = db
      .prepare(
        `SELECT COUNT(*) AS c FROM torrent_events
         WHERE date(seen_at, 'unixepoch', 'localtime') = ?
           AND decision IN ('GRABBED','RE_EVALUATED_GRABBED')`,
      )
      .get(date) as { c: number };

    // qBt global totals — snapshot current, not historical. Useful for "today so far".
    let uploaded = 0;
    let downloaded = 0;
    let activePeak = 0;
    try {
      const info = await qbt.getTransferInfo();
      uploaded = info.up_info_data ?? 0;
      downloaded = info.dl_info_data ?? 0;
      const torrents = await qbt.listTorrents({ tag: 'harvester' });
      activePeak = torrents.filter((t) => /^(?:downloading|uploading|stalledDL|stalledUP)/i.test(t.state)).length;
    } catch {
      /* qBt may be unreachable; leave zeros */
    }

    const snap = getLatestProfileSnapshot(db);
    upsertStatsDaily(db, {
      date,
      grabbed_count: grabs.c,
      uploaded_bytes: uploaded,
      downloaded_bytes: downloaded,
      active_torrents_peak: activePeak,
      ratio_end_of_day: snap?.ratio ?? null,
      bonus_points_end_of_day: snap?.bonus_points ?? null,
    });
  }

  return createLoopWorker({
    name: 'statsDailyRollup',
    intervalMs: () => 15 * 60 * 1000,
    tick,
    logger,
    runOnStart: true,
  });
}

function todayLocal(ts_sec: number): string {
  const d = new Date(ts_sec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
