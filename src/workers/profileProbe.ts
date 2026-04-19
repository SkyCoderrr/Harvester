import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { EventBus } from '../events/bus.js';
import type { AppConfig } from '../config/schema.js';
import type { MTeamClient } from '../mteam/client.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';
import { insertProfileSnapshot } from '../db/queries.js';
import { normalizeMTeamProfile } from '../util/normalize.js';

export function createProfileProbeWorker(deps: {
  db: Db;
  logger: Logger;
  bus: EventBus;
  config: AppConfig;
  mteam: MTeamClient;
}): LoopWorker {
  const { db, logger, bus, config, mteam } = deps;

  async function tick(): Promise<void> {
    try {
      const raw = await mteam.profile();
      const snap = normalizeMTeamProfile(raw, config.emergency.tier_thresholds);
      insertProfileSnapshot(db, {
        ts: snap.ts,
        uploaded_bytes: snap.uploaded_bytes,
        downloaded_bytes: snap.downloaded_bytes,
        ratio: snap.ratio,
        bonus_points: snap.bonus_points,
        account_tier: snap.account_tier,
        raw_payload: JSON.stringify(snap.raw_payload),
        warned: snap.warned,
        leech_warn: snap.leech_warn,
        vip: snap.vip,
        seedtime_sec: snap.seedtime_sec,
        leechtime_sec: snap.leechtime_sec,
      });
      bus.emit('kpi.delta', {
        type: 'kpi.delta',
        partial: {
          ratio: snap.ratio,
          bonus_points: snap.bonus_points,
          tier: snap.account_tier,
          tier_min_ratio: snap.tier_min_ratio,
        },
      });
    } catch (err) {
      logger.warn({ component: 'profileProbe', err }, 'profile probe failed');
    }
  }

  return createLoopWorker({
    name: 'profileProbe',
    intervalMs: () => 15 * 60 * 1000,
    tick,
    logger,
  });
}
