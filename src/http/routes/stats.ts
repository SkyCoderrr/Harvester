import type { FastifyInstance } from 'fastify';
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
  app.get('/stats/grabs-by-day', async (req) => {
    const q = req.query as { days?: string };
    const days = Math.min(90, Math.max(1, Number(q.days ?? 14)));
    const since = unixSec() - days * 86400;
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
