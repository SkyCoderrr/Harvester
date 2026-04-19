import type { Db } from '../db/index.js';
import type { Logger } from '../logger/index.js';
import type { EventBus } from '../events/bus.js';
import type { ServiceStatus, ServiceStateView } from '@shared/types.js';
import type { HarvesterError } from '../errors/index.js';
import {
  getServiceStateRow,
  upsertServiceStateRow,
  setDesiredUserIntent as setDesiredUserIntentRow,
} from '../db/queries.js';

export type ServiceStateAction =
  | { type: 'START' }
  | { type: 'POLL_STARTED' }
  | { type: 'POLL_FINISHED' }
  | { type: 'POLL_FAILED'; error: HarvesterError }
  | { type: 'USER_PAUSE' }
  | { type: 'USER_RESUME' }
  | { type: 'EMERGENCY_TRIGGER'; ratio: number; tier_min: number }
  | { type: 'EMERGENCY_CLEAR' }
  | { type: 'PREFLIGHT_UPDATE'; preflight: ServiceStateView['preflight'] }
  | { type: 'ALLOWED_CLIENT_ACK' }
  | { type: 'ALLOWED_CLIENT_WARN' }
  | { type: 'LAN_BIND_UPDATE'; enabled: boolean; listening_on: string }
  | { type: 'SHUTDOWN' };

export interface ServiceStateStore {
  get(): ServiceStateView;
  dispatch(action: ServiceStateAction): void;
  subscribe(fn: (s: ServiceStateView) => void): () => void;
  /** FR-V2-37: write user intent to DB without going through reduce(). */
  setDesiredUserIntent(intent: 'running' | 'paused'): void;
}

export function createServiceState(
  db: Db,
  bus: EventBus,
  logger: Logger,
): ServiceStateStore {
  const row = getServiceStateRow(db);
  // FR-V2-03 / FR-V2-36: if the persisted intent says paused, surface that
  // immediately in the in-memory state so /service/state shows the right
  // thing even before the boot path has finished preflight.
  const initialStatus: ServiceStatus =
    row.desired_user_intent === 'paused' ? 'PAUSED_USER' : row.status;
  let state: ServiceStateView = {
    status: initialStatus,
    last_poll_at: row.last_poll_at,
    consecutive_errors: row.consecutive_errors,
    backoff_factor: 1,
    allowed_client_ok: row.allowed_client_ok === 1,
    preflight: { mteam: false, qbt: false, allowed_client: false, disk: false },
    emergency: null,
    lan: { enabled: false, listening_on: '127.0.0.1' },
    desired_user_intent: row.desired_user_intent,
  };
  const subscribers = new Set<(s: ServiceStateView) => void>();

  function persist(): void {
    upsertServiceStateRow(db, {
      status: state.status,
      last_poll_at: state.last_poll_at,
      consecutive_errors: state.consecutive_errors,
      allowed_client_ok: state.allowed_client_ok ? 1 : 0,
      updated_at: Math.floor(Date.now() / 1000),
      desired_user_intent: state.desired_user_intent,
    });
  }

  function broadcast(): void {
    for (const s of subscribers) {
      try {
        s(state);
      } catch (err) {
        logger.warn({ err }, 'serviceState subscriber threw');
      }
    }
    bus.emit('service.state', { type: 'service.state', status: state.status });
  }

  function dispatch(action: ServiceStateAction): void {
    const prev = state;
    state = reduce(prev, action);
    persist();
    broadcast();
  }

  function reduce(prev: ServiceStateView, a: ServiceStateAction): ServiceStateView {
    switch (a.type) {
      case 'START':
        if (prev.status === 'STOPPED') return { ...prev, status: 'RUNNING', consecutive_errors: 0, backoff_factor: 1 };
        return prev;
      case 'POLL_STARTED':
        return prev;
      case 'POLL_FINISHED':
        return {
          ...prev,
          last_poll_at: Math.floor(Date.now() / 1000),
          consecutive_errors: 0,
          backoff_factor: 1,
          status: prev.status === 'PAUSED_BACKOFF' ? 'RUNNING' : prev.status,
        };
      case 'POLL_FAILED': {
        const next_errors = prev.consecutive_errors + 1;
        const factor = Math.min(2 ** Math.max(0, next_errors - 1), 16);
        const nextStatus: ServiceStatus =
          next_errors >= 3 ? 'PAUSED_BACKOFF' : prev.status;
        return {
          ...prev,
          consecutive_errors: next_errors,
          backoff_factor: factor,
          status: nextStatus,
        };
      }
      case 'USER_PAUSE':
        return { ...prev, status: 'PAUSED_USER', desired_user_intent: 'paused' };
      case 'USER_RESUME':
        return {
          ...prev,
          status: 'RUNNING',
          consecutive_errors: 0,
          backoff_factor: 1,
          desired_user_intent: 'running',
        };
      case 'EMERGENCY_TRIGGER':
        return {
          ...prev,
          status: 'PAUSED_EMERGENCY',
          emergency: { active: true, current_ratio: a.ratio, tier_min: a.tier_min },
        };
      case 'EMERGENCY_CLEAR':
        return {
          ...prev,
          status: prev.status === 'PAUSED_EMERGENCY' ? 'RUNNING' : prev.status,
          emergency: null,
        };
      case 'PREFLIGHT_UPDATE':
        return { ...prev, preflight: a.preflight };
      case 'ALLOWED_CLIENT_ACK':
        return { ...prev, allowed_client_ok: true };
      case 'ALLOWED_CLIENT_WARN':
        return { ...prev, allowed_client_ok: false };
      case 'LAN_BIND_UPDATE':
        return { ...prev, lan: { enabled: a.enabled, listening_on: a.listening_on } };
      case 'SHUTDOWN':
        return { ...prev, status: 'STOPPED' };
    }
  }

  return {
    get: () => state,
    dispatch,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    setDesiredUserIntent(intent) {
      // Single-purpose direct write so /service/restart and other paths can
      // change intent without touching status/emergency/etc.
      setDesiredUserIntentRow(db, intent);
      state = { ...state, desired_user_intent: intent };
      broadcast();
    },
  };
}
