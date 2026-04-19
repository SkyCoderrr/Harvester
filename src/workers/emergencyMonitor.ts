import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { EventBus } from '../events/bus.js';
import type { AppConfig } from '../config/schema.js';
import type { ServiceStateStore } from '../services/serviceState.js';
import { getLatestProfileSnapshot } from '../db/queries.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';
import { normalizeMTeamProfile } from '../util/normalize.js';

/**
 * Polls the latest profile_snapshot every 60s and toggles EMERGENCY_TRIGGER /
 * EMERGENCY_CLEAR based on current ratio vs. tier_min + buffer.
 */
export function createEmergencyMonitor(deps: {
  db: Db;
  logger: Logger;
  bus: EventBus;
  config: AppConfig;
  serviceState: ServiceStateStore;
}): LoopWorker {
  const { db, bus, config, serviceState, logger } = deps;
  let lastWarn = 0;

  async function tick(): Promise<void> {
    const snap = getLatestProfileSnapshot(db);
    if (!snap) return;
    // Derive current tier again from the snapshot
    const raw = snap.raw_payload ? (JSON.parse(snap.raw_payload) as Record<string, unknown>) : null;
    if (!raw) return;
    let tier_min: number | null = null;
    try {
      const normalized = normalizeMTeamProfile(
        (raw['raw_payload'] as never) ?? (raw as never),
        config.emergency.tier_thresholds,
      );
      tier_min = normalized.tier_min_ratio;
    } catch {
      return;
    }
    if (tier_min == null) return;

    const ratio = snap.ratio;
    const now = serviceState.get();
    const buffer = config.emergency.ratio_buffer;
    const resume = config.emergency.ratio_resume_buffer;

    if (!now.emergency && ratio < tier_min + buffer) {
      serviceState.dispatch({ type: 'EMERGENCY_TRIGGER', ratio, tier_min });
      bus.emit('emergency.triggered', { type: 'emergency.triggered', ratio, tier_min });
      logger.warn({ component: 'emergency', ratio, tier_min }, 'emergency triggered');
    } else if (now.emergency && ratio >= tier_min + resume) {
      serviceState.dispatch({ type: 'EMERGENCY_CLEAR' });
      bus.emit('emergency.cleared', { type: 'emergency.cleared' });
      logger.info({ component: 'emergency', ratio }, 'emergency cleared');
    } else if (now.emergency && Date.now() - lastWarn > 15 * 60 * 1000) {
      logger.warn({ component: 'emergency', ratio, tier_min }, 'emergency still active');
      lastWarn = Date.now();
    }
  }

  return createLoopWorker({
    name: 'emergencyMonitor',
    intervalMs: () => 60_000,
    tick,
    logger,
  });
}
