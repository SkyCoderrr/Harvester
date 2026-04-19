import { format } from 'date-fns-tz';
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

    // qBt active-torrent peak is still useful at-this-moment.
    let activePeak = 0;
    try {
      const torrents = await qbt.listTorrents({ tag: 'harvester' });
      activePeak = torrents.filter((t) => /^(?:downloading|uploading|stalledDL|stalledUP)/i.test(t.state)).length;
    } catch {
      /* qBt may be unreachable; leave zero */
    }

    // FR-V2-34: stats_daily.{uploaded,downloaded}_bytes are now the per-day
    // delta of M-Team account totals (NOT qBt session counters, which reset
    // every restart and don't reflect lifetime). Computed as
    // (max(profile_snapshots.uploaded_bytes today) − max(yesterday)). If
    // yesterday has no snapshot we fall back to (min(today) − 0) which
    // approximates "today's first observation" — non-zero but inaccurate.
    // Historical rows written before this change are stale (qBt session
    // counters); clients should chart only forward.
    const dayDeltas = db
      .prepare(
        `WITH today AS (
           SELECT MAX(uploaded_bytes) AS up, MAX(downloaded_bytes) AS down,
                  MIN(uploaded_bytes) AS up_min, MIN(downloaded_bytes) AS down_min
             FROM profile_snapshots
            WHERE date(ts, 'unixepoch', 'localtime') = ?
         ), yesterday AS (
           SELECT MAX(uploaded_bytes) AS up, MAX(downloaded_bytes) AS down
             FROM profile_snapshots
            WHERE date(ts, 'unixepoch', 'localtime') = date(?, '-1 day')
         )
         SELECT today.up   AS today_up,
                today.down AS today_down,
                today.up_min AS today_up_min,
                today.down_min AS today_down_min,
                yesterday.up   AS y_up,
                yesterday.down AS y_down
           FROM today LEFT JOIN yesterday`,
      )
      .get(date, date) as
      | {
          today_up: number | null;
          today_down: number | null;
          today_up_min: number | null;
          today_down_min: number | null;
          y_up: number | null;
          y_down: number | null;
        }
      | undefined;

    let uploaded = 0;
    let downloaded = 0;
    if (dayDeltas?.today_up != null) {
      const baseUp = dayDeltas.y_up ?? dayDeltas.today_up_min ?? 0;
      const baseDown = dayDeltas.y_down ?? dayDeltas.today_down_min ?? 0;
      uploaded = Math.max(0, dayDeltas.today_up - baseUp);
      downloaded = Math.max(0, (dayDeltas.today_down ?? 0) - baseDown);
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

/**
 * FR-V2-61: TZ-aware day stamp matching `src/util/time.ts::isScheduleActive`'s
 * convention (system TZ when no explicit override). Using date-fns-tz makes
 * the choice explicit and survives any future `process.env.TZ` change.
 */
function todayLocal(ts_sec: number): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return format(new Date(ts_sec * 1000), 'yyyy-MM-dd', { timeZone: tz });
}
