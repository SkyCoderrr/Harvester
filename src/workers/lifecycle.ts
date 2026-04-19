import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { EventBus } from '../events/bus.js';
import type { AppConfig } from '../config/schema.js';
import type { QbtClient } from '../qbt/client.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';
import {
  getLifecyclePeerState,
  upsertLifecyclePeerState,
  deleteLifecyclePeerState,
} from '../db/queries.js';
import { unixSec } from '../util/time.js';

export function createLifecycleWorker(deps: {
  db: Db;
  logger: Logger;
  bus: EventBus;
  config: AppConfig;
  qbt: QbtClient;
}): LoopWorker {
  const { db, logger, bus, config, qbt } = deps;

  async function tick(): Promise<void> {
    let torrents;
    try {
      torrents = await qbt.listTorrents({ tag: 'harvester' });
    } catch (err) {
      logger.warn({ component: 'lifecycle', err }, 'qbt.listTorrents failed');
      return;
    }

    const now = unixSec();
    for (const t of torrents) {
      let state = getLifecyclePeerState(db, t.hash);
      if (!state) {
        state = {
          infohash: t.hash,
          first_seen_at: now,
          zero_peers_since: null,
          last_checked_at: now,
        };
      }
      const peers = t.num_incomplete + t.num_complete;
      if (peers === 0 && state.zero_peers_since == null) state.zero_peers_since = now;
      if (peers > 0) state.zero_peers_since = null;
      state.last_checked_at = now;
      upsertLifecyclePeerState(db, state);

      const lifeHours = config.lifecycle.seed_time_hours;
      const zeroMin = config.lifecycle.zero_peers_minutes;
      const removeWithData = config.lifecycle.remove_with_data;

      // Total lifetime: from the moment qBt added the torrent (download start),
      // not when seeding started. Falls back to first_seen_at if added_on is missing.
      const addedAt = t.added_on && t.added_on > 0 ? t.added_on : state.first_seen_at;
      const lifeSec = Math.max(0, now - addedAt);
      const overLifetime = lifeSec >= lifeHours * 3600;
      const overZeroPeers =
        state.zero_peers_since != null && now - state.zero_peers_since >= zeroMin * 60;

      if (overLifetime || overZeroPeers) {
        try {
          await qbt.deleteTorrents([t.hash], removeWithData);
          deleteLifecyclePeerState(db, t.hash);
          bus.emit('lifecycle.removed', {
            type: 'lifecycle.removed',
            infohash: t.hash,
            reason: overLifetime ? 'seed_time' : 'zero_peers',
          });
          logger.info(
            {
              component: 'lifecycle',
              op: 'delete',
              infohash: t.hash,
              name: t.name,
              size_bytes: t.size,
              reason: overLifetime ? 'seed_time' : 'zero_peers',
              life_sec: lifeSec,
            },
            'removed torrent',
          );
        } catch (err) {
          logger.warn({ component: 'lifecycle', hash: t.hash, err }, 'delete failed');
        }
      }
    }
  }

  return createLoopWorker({
    name: 'lifecycle',
    intervalMs: () => 5 * 60 * 1000,
    tick,
    logger,
  });
}
