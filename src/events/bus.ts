import { EventEmitter } from 'node:events';
import type { Decision, DashboardSummary, ServiceStatus, ApiError, LogRow } from '@shared/types.js';
import type { Logger } from '../logger/index.js';

export type DomainEvent =
  | { type: 'poll.started' }
  | { type: 'poll.finished'; torrents_seen: number; torrents_grabbed: number }
  | { type: 'poll.failed'; error: ApiError }
  | {
      type: 'torrent.decision';
      mteam_id: string;
      decision: Decision;
      matched?: string[];
      reason?: string;
    }
  | { type: 'torrent.grab.success'; mteam_id: string; infohash: string; name: string }
  | { type: 'torrent.grab.failed'; mteam_id: string; error: ApiError }
  | {
      type: 'lifecycle.removed';
      infohash: string;
      reason: 'seed_time' | 'zero_peers' | 'discount_flipped' | 'disk_guard';
    }
  | { type: 'emergency.triggered'; ratio: number; tier_min: number }
  | { type: 'emergency.cleared' }
  | { type: 'service.state'; status: ServiceStatus; meta?: Record<string, unknown> }
  | { type: 'log.entry'; row: LogRow }
  | { type: 'kpi.delta'; partial: Partial<DashboardSummary> }
  | { type: 'config.updated'; patch: Record<string, unknown> }
  | { type: 'auth.unauthenticated'; ip: string; path: string }
  | { type: 'auth.rate_limited'; ip: string };

export interface EventBus {
  emit<T extends DomainEvent['type']>(
    type: T,
    payload: Extract<DomainEvent, { type: T }>,
  ): void;
  on<T extends DomainEvent['type']>(
    type: T,
    handler: (ev: Extract<DomainEvent, { type: T }>) => void,
  ): () => void;
  onAny(handler: (ev: DomainEvent) => void): () => void;
}

export function createEventBus(logger: Logger): EventBus {
  const em = new EventEmitter();
  // FR-V2-11 / TECH_DEBT H3: SSE handlers correctly off() on close, so the
  // historical workaround of bumping MaxListeners to 100 is unneeded. Set to
  // Infinity and rely on a metric to surface real leaks.
  em.setMaxListeners(Infinity);

  function wrap<T>(fn: (ev: T) => void): (ev: T) => void {
    return (ev) => {
      try {
        fn(ev);
      } catch (err) {
        logger.warn({ err, ev }, 'event handler threw');
      }
    };
  }

  return {
    emit(type, payload) {
      em.emit(type, payload);
      em.emit('*', payload);
    },
    on(type, handler) {
      const w = wrap(handler as (ev: unknown) => void);
      em.on(type, w);
      return () => em.off(type, w);
    },
    onAny(handler) {
      const w = wrap(handler as (ev: unknown) => void);
      em.on('*', w);
      return () => em.off('*', w);
    },
  };
}
