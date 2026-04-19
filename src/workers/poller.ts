import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { EventBus } from '../events/bus.js';
import type { Metrics } from '../observability/metrics.js';
import type { AppConfig } from '../config/schema.js';
import type { MTeamClient } from '../mteam/client.js';
import type { QbtClient } from '../qbt/client.js';
import type { ServiceStateStore } from '../services/serviceState.js';
import type { Downloader } from './downloader.js';
import { createLoopWorker, type LoopWorker } from './loopWorker.js';
import { normalizeMTeamTorrent } from '../util/normalize.js';
import { freeGib } from '../util/disk.js';
import { evaluate } from '../rules/evaluator.js';
import { rowToRuleSet } from '../rules/migrate.js';
import {
  insertPollRun,
  finishPollRun,
  insertTorrentEvent,
  getTorrentEventByMteamId,
  countReEvals,
  listRuleSetRows,
  isBlacklisted,
} from '../db/queries.js';
import type { RuleSet, NormalizedTorrent } from '@shared/types.js';
import { unixSec } from '../util/time.js';
import { normalizeError } from '../errors/index.js';

export function createPoller(deps: {
  db: Db;
  logger: Logger;
  bus: EventBus;
  metrics: Metrics;
  config: AppConfig;
  mteam: MTeamClient;
  qbt: QbtClient;
  serviceState: ServiceStateStore;
  downloader: Downloader;
}): LoopWorker {
  const { db, logger, bus, metrics, config, mteam, serviceState, downloader } = deps;

  async function tick(): Promise<void> {
    const svc = serviceState.get();
    if (svc.status !== 'RUNNING') {
      logger.debug({ component: 'poller', status: svc.status }, 'skipping tick: not running');
      return;
    }
    // Respect allowed-client gate: if not ok, don't attempt to grab (still poll for UI).
    const pollRunId = insertPollRun(db, unixSec());
    bus.emit('poll.started', { type: 'poll.started' });
    const cycleTimer = metrics.histogram('poll.cycle.duration_ms');
    const t0 = performance.now();
    let seen = 0;
    let grabbed = 0;
    let skippedRule = 0;
    let skippedDup = 0;
    let skippedFlipped = 0;
    let reGrabbed = 0;
    let reSkipped = 0;
    logger.info({ component: 'poller', poll_run_id: pollRunId }, 'poll tick started');
    try {
      const res = await mteam.search({
        mode: 'normal',
        pageSize: 50,
        pageNumber: 1,
        sortField: 'CREATED_DATE',
        sortDirection: 'DESC',
      });
      seen = res.items.length;
      const rules: RuleSet[] = listRuleSetRows(db, true).map(rowToRuleSet);

      for (const raw of res.items) {
        const torrent = normalizeMTeamTorrent(raw);
        // Blacklist gate: torrents the stuckChecker (or future watchdogs)
        // have given up on are skipped silently — no event row, no grab
        // attempt, no re-eval. See db/migrations/0007_torrent_blacklist.sql.
        if (isBlacklisted(db, torrent.mteam_id)) continue;
        const existing = getTorrentEventByMteamId(db, torrent.mteam_id);

        if (existing) {
          if (canReEval(existing, torrent)) {
            const decision = evaluate(torrent, rules, {
              now_ms: Date.now(),
              free_disk_gib: (p) => freeGib(p ?? config.downloads.default_save_path),
            });
            if (decision.kind === 'GRABBED' && svc.allowed_client_ok) {
              // downloader.enqueue is responsible for writing the definitive
              // torrent_event row (GRABBED w/ infohash on success, ERROR w/
              // rejection_reason on verify-fail). The poller previously wrote
              // its own optimistic GRABBED row here too, which caused a
              // double-entry on every grab (one with infohash, one without)
              // and inflated dashboard grab counts. Don't write here.
              await downloader.enqueue(torrent, decision.matched, pollRunId);
              grabbed++;
              reGrabbed++;
              bus.emit('torrent.decision', {
                type: 'torrent.decision',
                mteam_id: torrent.mteam_id,
                decision: 'RE_EVALUATED_GRABBED',
                matched: decision.matched.map((m) => m.name),
              });
            } else if (decision.kind === 'SKIPPED_RULE') {
              const reason = decision.per_rule_set[0]?.rejection_reason ?? 'unknown';
              insertDecision(torrent, 'RE_EVALUATED_SKIPPED', null, reason);
              reSkipped++;
            }
          }
          continue;
        }

        const decision = evaluate(torrent, rules, {
          now_ms: Date.now(),
          free_disk_gib: (p) => freeGib(p ?? config.downloads.default_save_path),
        });

        if (decision.kind === 'GRABBED' && svc.allowed_client_ok) {
          // See the RE_EVALUATED_GRABBED branch above — downloader.enqueue
          // owns the torrent_event row for GRABBED outcomes. No insert here.
          await downloader.enqueue(torrent, decision.matched, pollRunId);
          grabbed++;
          bus.emit('torrent.decision', {
            type: 'torrent.decision',
            mteam_id: torrent.mteam_id,
            decision: 'GRABBED',
            matched: decision.matched.map((m) => m.name),
          });
        } else if (decision.kind === 'SKIPPED_RULE') {
          const reason = decision.per_rule_set[0]?.rejection_reason ?? 'unknown';
          insertDecision(torrent, 'SKIPPED_RULE', null, reason);
          skippedRule++;
          bus.emit('torrent.decision', {
            type: 'torrent.decision',
            mteam_id: torrent.mteam_id,
            decision: 'SKIPPED_RULE',
            reason,
          });
        } else if (decision.kind === 'SKIPPED_DUP') {
          insertDecision(torrent, 'SKIPPED_DUP', null, null);
          skippedDup++;
        } else if (decision.kind === 'SKIPPED_FLIPPED') {
          insertDecision(torrent, 'SKIPPED_FLIPPED', null, null);
          skippedFlipped++;
        }
      }

      finishPollRun(db, pollRunId, {
        finished_at: unixSec(),
        torrents_seen: seen,
        torrents_grabbed: grabbed,
      });
      serviceState.dispatch({ type: 'POLL_FINISHED' });
      bus.emit('poll.finished', {
        type: 'poll.finished',
        torrents_seen: seen,
        torrents_grabbed: grabbed,
      });
      cycleTimer.observe(performance.now() - t0);
      logger.info(
        {
          component: 'poller',
          poll_run_id: pollRunId,
          seen,
          grabbed,
          re_grabbed: reGrabbed,
          skipped_rule: skippedRule,
          re_skipped: reSkipped,
          skipped_dup: skippedDup,
          skipped_flipped: skippedFlipped,
          duration_ms: Math.round(performance.now() - t0),
        },
        'poll tick finished',
      );
    } catch (err) {
      const normalized = normalizeError(err);
      finishPollRun(db, pollRunId, {
        finished_at: unixSec(),
        torrents_seen: seen,
        torrents_grabbed: grabbed,
        error: normalized.user_message,
      });
      serviceState.dispatch({ type: 'POLL_FAILED', error: normalized });
      bus.emit('poll.failed', {
        type: 'poll.failed',
        error: { code: normalized.code, user_message: normalized.user_message },
      });
      logger.warn({ component: 'poller', err: normalized }, 'poll tick failed');
    }
  }

  function insertDecision(
    t: NormalizedTorrent,
    decision:
      | 'GRABBED'
      | 'SKIPPED_RULE'
      | 'SKIPPED_DUP'
      | 'SKIPPED_FLIPPED'
      | 'RE_EVALUATED_GRABBED'
      | 'RE_EVALUATED_SKIPPED'
      | 'ERROR',
    matchedRule: string | null,
    rejectionReason: string | null,
  ): void {
    insertTorrentEvent(db, {
      mteam_id: t.mteam_id,
      infohash: null,
      name: t.name,
      size_bytes: t.size_bytes,
      discount: t.discount,
      discount_end_ts: t.discount_end_ts,
      seeders: t.seeders,
      leechers: t.leechers,
      category: t.category,
      created_date_ts: t.created_date_ts,
      raw_payload: JSON.stringify(t.raw_payload),
      seen_at: unixSec(),
      decision,
      matched_rule: matchedRule,
      rejection_reason: rejectionReason,
      re_eval_count: decision.startsWith('RE_EVALUATED') ? countReEvals(db, t.mteam_id) + 1 : 0,
    });
  }

  function canReEval(
    existing: ReturnType<typeof getTorrentEventByMteamId>,
    torrent: NormalizedTorrent,
  ): boolean {
    if (!existing) return false;
    // Retry on prior skips AND on prior grab errors (e.g., verify failure).
    if (!['SKIPPED_RULE', 'RE_EVALUATED_SKIPPED', 'ERROR'].includes(existing.decision)) {
      return false;
    }
    const re = config.poller.reeval;
    if (unixSec() - existing.seen_at > re.window_sec) return false;
    if (
      torrent.discount_end_ts != null &&
      torrent.discount_end_ts - unixSec() < re.min_discount_headroom_sec
    ) {
      return false;
    }
    if (countReEvals(db, torrent.mteam_id) >= re.max_attempts) return false;
    return true;
  }

  return createLoopWorker({
    name: 'poller',
    intervalMs: () => serviceState.get().backoff_factor * config.poller.interval_sec * 1000,
    tick,
    onWakeFromSleep: async () => {
      logger.info({ component: 'poller' }, 'catch-up tick after sleep');
    },
    logger,
  });
}
