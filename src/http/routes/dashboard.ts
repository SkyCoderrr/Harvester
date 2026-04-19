import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import type { DashboardSummary } from '@shared/types.js';
import { getLatestProfileSnapshot, countGrabsSince } from '../../db/queries.js';
import { freeGib } from '../../util/disk.js';
import { unixSec } from '../../util/time.js';

export function registerDashboardRoute(app: FastifyInstance, deps: HttpDeps): void {
  app.get('/dashboard/summary', async () => {
    const snap = getLatestProfileSnapshot(deps.db);
    const cfg = deps.config.get();
    let torrents: Awaited<ReturnType<typeof deps.qbt.listTorrents>> = [];
    try {
      torrents = await deps.qbt.listTorrents({ tag: 'harvester' });
    } catch {
      torrents = [];
    }
    const now = unixSec();

    // Active vs stalled vs error split.
    let active = 0;
    let stalled = 0;
    let error = 0;
    for (const t of torrents) {
      if (/^(?:downloading|uploading)$/i.test(t.state)) active++;
      else if (/^stalled/i.test(t.state)) stalled++;
      else if (/error/i.test(t.state)) error++;
    }
    // Legacy fields (kept for wire compat).
    const leeching = torrents.filter((t) => /^(?:downloading|stalledDL|metaDL)/i.test(t.state)).length;
    const seeding = torrents.filter((t) => /^(?:uploading|stalledUP|queuedUP)/i.test(t.state)).length;

    // Disk usage of harvester torrents.
    const harvesterUsed = torrents.reduce((acc, t) => acc + t.size * (t.progress ?? 0), 0);

    // Grabs: current 24h and delta vs. the 24h before that.
    const grabs_24h = countGrabsSince(deps.db, now - 86400);
    const grabs_prev_24h =
      countGrabsSince(deps.db, now - 2 * 86400) - grabs_24h;
    const grabs_delta_24h = grabs_24h - grabs_prev_24h;

    // Ratio + bonus deltas: compare latest snapshot against the oldest snapshot in
    // (now-2h .. now-30m). That buffer avoids noisy deltas at startup.
    const since1h = now - 4200; // 70min
    const baseline = deps.db
      .prepare(
        'SELECT ratio, bonus_points FROM profile_snapshots WHERE ts <= ? ORDER BY ts DESC LIMIT 1',
      )
      .get(since1h) as { ratio: number; bonus_points: number | null } | undefined;
    const ratio_delta_1h =
      snap && baseline ? Number((snap.ratio - baseline.ratio).toFixed(4)) : null;
    const bonus_delta_1h =
      snap && baseline && snap.bonus_points != null && baseline.bonus_points != null
        ? snap.bonus_points - baseline.bonus_points
        : null;

    const summary: DashboardSummary = {
      ratio: snap?.ratio ?? null,
      ratio_delta_1h,
      uploaded_today: 0,
      downloaded_today: 0,
      active_count: active,
      stalled_count: stalled,
      error_count: error,
      active_leeching: leeching,
      active_seeding: seeding,
      grabs_24h,
      grabs_delta_24h,
      expiring_1h: 0,
      disk_free_gib: freeGib(cfg.downloads.default_save_path),
      harvester_used_bytes: Math.round(harvesterUsed),
      bonus_points: snap?.bonus_points ?? null,
      bonus_delta_1h,
      tier: snap?.account_tier ?? null,
      tier_min_ratio: null,
      harvester_torrent_count: torrents.length,
    };
    return { ok: true, data: summary };
  });
}
