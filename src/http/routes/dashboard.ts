import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import type { DashboardSummary } from '@shared/types.js';
import {
  getLatestProfileSnapshot,
  getProfileSnapshotAtOrBefore,
} from '../../db/queries.js';
import { diskStats, freeGib } from '../../util/disk.js';
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

    // FR-V2-35 / TECH_DEBT M10: single aggregate replaces the prior pair of
    // queries. Each row is counted into either 'today' (last 24h) or
    // 'yesterday' (the 24h before that) based on `seen_at`.
    const cutoff24 = now - 86400;
    const cutoff48 = now - 2 * 86400;
    const grabsAgg = deps.db
      .prepare(
        `SELECT
           SUM(CASE WHEN seen_at >= ? THEN 1 ELSE 0 END) AS today,
           SUM(CASE WHEN seen_at >= ? AND seen_at < ? THEN 1 ELSE 0 END) AS yesterday
         FROM torrent_events
         WHERE decision IN ('GRABBED','RE_EVALUATED_GRABBED')`,
      )
      .get(cutoff24, cutoff48, cutoff24) as { today: number | null; yesterday: number | null };
    const grabs_24h = Number(grabsAgg.today ?? 0);
    const grabs_delta_24h = grabs_24h - Number(grabsAgg.yesterday ?? 0);

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

    // FR-V2-32: 24h baseline snapshot for upload/download/seedtime deltas.
    const snap24 = getProfileSnapshotAtOrBefore(deps.db, now - 86400);

    const uploaded_total = snap?.uploaded_bytes ?? null;
    const downloaded_total = snap?.downloaded_bytes ?? null;
    const uploaded_24h = snap24?.uploaded_bytes ?? null;
    const downloaded_24h = snap24?.downloaded_bytes ?? null;
    const seedtime_total = snap?.seedtime_sec ?? null;
    const seedtime_24h = snap24?.seedtime_sec ?? null;

    const disk = diskStats(cfg.downloads.default_save_path);

    // FR-V2-32: surface persisted user intent.
    const desired_intent = deps.serviceState.get().desired_user_intent;

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
      // Phase-1 additive fields:
      uploaded_bytes_total: uploaded_total,
      uploaded_bytes_24h: uploaded_24h,
      uploaded_bytes_delta_24h:
        uploaded_total != null && uploaded_24h != null
          ? uploaded_total - uploaded_24h
          : null,
      downloaded_bytes_total: downloaded_total,
      downloaded_bytes_24h: downloaded_24h,
      downloaded_bytes_delta_24h:
        downloaded_total != null && downloaded_24h != null
          ? downloaded_total - downloaded_24h
          : null,
      disk_total_gib: disk.totalGib || null,
      disk_used_gib: disk.usedGib || null,
      account_warned: (snap?.warned ?? null) as 0 | 1 | null,
      account_leech_warn: (snap?.leech_warn ?? null) as 0 | 1 | null,
      account_vip: (snap?.vip ?? null) as 0 | 1 | null,
      seedtime_sec: seedtime_total,
      seedtime_sec_delta_24h:
        seedtime_total != null && seedtime_24h != null
          ? seedtime_total - seedtime_24h
          : null,
      service_desired_user_intent: desired_intent,
    };
    return { ok: true, data: summary };
  });
}
