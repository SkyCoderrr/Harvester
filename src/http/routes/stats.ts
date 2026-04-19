import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { HttpDeps } from '../server.js';
import { unixSec } from '../../util/time.js';
import { listStatsDaily } from '../../db/queries.js';

/**
 * Stats endpoints backing the dashboard charts. Light-weight aggregates only — no joins
 * across large tables, always bounded by a time window.
 */
export function registerStatsRoutes(app: FastifyInstance, deps: HttpDeps): void {
  // Ratio + bonus over time. Window defaults to 24 hours of 15-min samples.
  app.get('/stats/profile-snapshots', async (req) => {
    const q = req.query as { hours?: string };
    const hours = Math.min(720, Math.max(1, Number(q.hours ?? 24)));
    const since = unixSec() - hours * 3600;
    const rows = deps.db
      .prepare(
        'SELECT ts, ratio, bonus_points, uploaded_bytes, downloaded_bytes FROM profile_snapshots WHERE ts >= ? ORDER BY ts ASC',
      )
      .all(since) as Array<{
      ts: number;
      ratio: number;
      bonus_points: number | null;
      uploaded_bytes: number;
      downloaded_bytes: number;
    }>;
    return { ok: true, data: { items: rows } };
  });

  // Grabs per local-day bucketed by discount. Default: last 14 days.
  //
  // `since` is anchored to LOCAL midnight (N - 1) days ago so the oldest day
  // in the window is complete — a rolling `now - N*86400` cutoff would clip
  // part of the oldest day and cause counts to shift when switching windows.
  app.get('/stats/grabs-by-day', async (req) => {
    const q = req.query as { days?: string };
    const days = Math.min(90, Math.max(1, Number(q.days ?? 14)));
    const since = localMidnightEpoch(days);
    const rows = deps.db
      .prepare(
        `SELECT
           date(seen_at, 'unixepoch', 'localtime') AS day,
           discount,
           COUNT(*) AS c
         FROM torrent_events
         WHERE seen_at >= ?
           AND decision IN ('GRABBED','RE_EVALUATED_GRABBED')
         GROUP BY day, discount
         ORDER BY day ASC`,
      )
      .all(since) as Array<{ day: string; discount: string; c: number }>;
    return { ok: true, data: { items: rows } };
  });

  // Torrent state distribution — live from qBt, tagged harvester.
  app.get('/stats/torrent-states', async () => {
    let torrents: Awaited<ReturnType<typeof deps.qbt.listTorrents>> = [];
    try {
      torrents = await deps.qbt.listTorrents({ tag: 'harvester' });
    } catch {
      torrents = [];
    }
    const buckets: Record<string, number> = {};
    for (const t of torrents) {
      const group = stateGroup(t.state);
      buckets[group] = (buckets[group] ?? 0) + 1;
    }
    return {
      ok: true,
      data: {
        items: Object.entries(buckets).map(([name, count]) => ({ name, count })),
        total: torrents.length,
      },
    };
  });

  // Download/upload speed time-series (60s samples) from transfer_snapshots.
  app.get('/stats/transfer-snapshots', async (req) => {
    const q = req.query as { minutes?: string };
    const minutes = Math.min(10080, Math.max(5, Number(q.minutes ?? 60)));
    const since = unixSec() - minutes * 60;
    const rows = deps.db
      .prepare(
        'SELECT ts, dlspeed, upspeed FROM transfer_snapshots WHERE ts >= ? ORDER BY ts ASC',
      )
      .all(since) as Array<{ ts: number; dlspeed: number; upspeed: number }>;
    return { ok: true, data: { items: rows } };
  });

  // Per-rule performance — grab count + skip count over the last `days`.
  app.get('/stats/ruleset-performance', async (req) => {
    const q = req.query as { days?: string };
    const days = Math.min(90, Math.max(1, Number(q.days ?? 14)));
    const since = unixSec() - days * 86400;
    const rows = deps.db
      .prepare(
        `SELECT
           COALESCE(matched_rule, 'unmatched') AS rule,
           SUM(CASE WHEN decision IN ('GRABBED','RE_EVALUATED_GRABBED') THEN 1 ELSE 0 END) AS grabs,
           SUM(CASE WHEN decision IN ('SKIPPED_RULE','RE_EVALUATED_SKIPPED') THEN 1 ELSE 0 END) AS skips,
           SUM(CASE WHEN decision = 'ERROR' THEN 1 ELSE 0 END) AS errors
         FROM torrent_events
         WHERE seen_at >= ?
         GROUP BY rule
         ORDER BY grabs DESC`,
      )
      .all(since) as Array<{ rule: string; grabs: number; skips: number; errors: number }>;
    return { ok: true, data: { items: rows } };
  });

  // FR-V2-33: per-day uploaded/downloaded delta time-series for the
  // VolumeButterflyChart. Uses LAG() over the per-day MAX of profile_snapshots
  // so it survives gaps in the polling cadence. The first row's LAG is 0, so
  // its delta equals that day's max (documented; UI shows muted).
  const profileVolumeQuery = z.object({
    days: z.coerce.number().int().min(1).max(365).default(14),
  });
  app.get('/stats/profile-volume', async (req) => {
    const { days } = profileVolumeQuery.parse(req.query);
    const since = unixSec() - days * 86400;
    const rows = deps.db
      .prepare(
        `WITH per_day AS (
           SELECT date(ts, 'unixepoch', 'localtime') AS day,
                  MAX(uploaded_bytes)   AS up_end,
                  MAX(downloaded_bytes) AS down_end
             FROM profile_snapshots
            WHERE ts >= ?
            GROUP BY day
         )
         SELECT day,
                up_end   - LAG(up_end,   1, 0) OVER (ORDER BY day) AS uploaded_delta,
                down_end - LAG(down_end, 1, 0) OVER (ORDER BY day) AS downloaded_delta
           FROM per_day
          ORDER BY day ASC`,
      )
      .all(since) as Array<{ day: string; uploaded_delta: number; downloaded_delta: number }>;
    return { ok: true, data: { rows } };
  });

  // Rolled-up daily stats from stats_daily table (stats_daily rollup worker).
  app.get('/stats/daily', async (req) => {
    const q = req.query as { from?: string; to?: string };
    const today = new Date().toISOString().slice(0, 10);
    const to = q.to ?? today;
    const from = q.from ?? new Date(Date.now() - 13 * 86400 * 1000).toISOString().slice(0, 10);
    const items = listStatsDaily(deps.db, from, to);
    return { ok: true, data: { items } };
  });
}

/**
 * Epoch seconds of local midnight (N - 1) days ago. Used so "N days of grabs"
 * includes exactly N full local calendar days ending today.
 */
function localMidnightEpoch(days: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return Math.floor(d.getTime() / 1000);
}

function stateGroup(qbtState: string): string {
  if (/^downloading$/i.test(qbtState)) return 'downloading';
  if (/^(?:uploading|queuedUP)$/i.test(qbtState)) return 'seeding';
  if (/^stalledDL$/i.test(qbtState)) return 'stalled_dl';
  if (/^stalledUP$/i.test(qbtState)) return 'stalled_up';
  if (/^(?:pausedDL|pausedUP)$/i.test(qbtState)) return 'paused';
  if (/^(?:metaDL|checkingDL|checkingUP|checkingResumeData)$/i.test(qbtState)) return 'checking';
  if (/error/i.test(qbtState)) return 'error';
  return 'other';
}
