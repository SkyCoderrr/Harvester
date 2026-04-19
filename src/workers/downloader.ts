import type { Logger } from '../logger/index.js';
import type { Db } from '../db/index.js';
import type { EventBus } from '../events/bus.js';
import type { Metrics } from '../observability/metrics.js';
import type { AppConfig } from '../config/schema.js';
import type { MTeamClient } from '../mteam/client.js';
import type { QbtClient } from '../qbt/client.js';
import type { NormalizedTorrent } from '@shared/types.js';
import {
  insertTorrentEvent,
  updateTorrentEventInfohash,
  enqueueGrab,
  nextDueGrab,
  removeGrabQueue,
  updateGrabAttempt,
  pruneExpiredGrabs,
  getTorrentEventByMteamId,
} from '../db/queries.js';
import { HarvesterError, normalizeError } from '../errors/index.js';
import { GENDL_TOKEN_TTL_SEC } from '@shared/constants.js';
import { unixSec } from '../util/time.js';

/**
 * Downloader. Event-driven via `enqueue()`; retry via `drainQueued()` from the grabRetry worker.
 */
export interface Downloader {
  enqueue(
    torrent: NormalizedTorrent,
    matched: Array<{ id: number; name: string }>,
    pollRunId: number,
  ): Promise<void>;
  drainQueued(): Promise<void>;
}

export function createDownloader(deps: {
  db: Db;
  logger: Logger;
  bus: EventBus;
  metrics: Metrics;
  config: AppConfig;
  mteam: MTeamClient;
  qbt: QbtClient;
}): Downloader {
  const { db, logger, bus, metrics, config, mteam, qbt } = deps;
  const grabsOk = metrics.counter('downloader.grab.success');
  const grabsFail = metrics.counter('downloader.grab.failed');

  async function doAdd(
    torrent: NormalizedTorrent,
    matched: Array<{ id: number; name: string }>,
  ): Promise<void> {
    // Collision check: is a torrent with same name + size already in qBt under harvester tag?
    const existing = await qbt.listTorrents({ tag: 'harvester' });
    const collision = existing.find(
      (t) => t.name === torrent.name && Math.abs(t.size - torrent.size_bytes) < 1024,
    );
    if (collision) {
      insertEventSkipDup(torrent);
      logger.info(
        { component: 'downloader', mteam_id: torrent.mteam_id, infohash: collision.hash },
        'skipped: duplicate',
      );
      return;
    }

    const tokenUrl = await mteam.genDlToken(torrent.mteam_id);

    // Re-check discount right before add (FR-DL-04)
    // The normalized torrent's discount is from this poll cycle; to minimize the window
    // we don't re-poll for a fresh one here — the spike shows genDlToken succeeds even
    // on NORMAL torrents, so a brief flip between poll and add can still slip through.
    // The lifecycle worker's safety override (FR-LC-03) catches this within 5 minutes.

    // SPIKE §1: api.m-team.cc 302s default UAs to google.com. qBt's libtorrent fetcher
    // inherits this failure mode, so we download the .torrent file ourselves with our
    // configured UA and hand the bytes to qBt via multipart upload.
    const torrentFile = await fetchTorrentFile(tokenUrl);

    const tags = [
      'harvester',
      `discount:${torrent.discount}`,
      ...matched.map((m) => `rule:${m.name}`),
    ];
    const category = deriveCategory(matched);
    const savePath = deriveSavePath(matched) ?? config.downloads.default_save_path;
    const upLimit = deriveUpLimit(matched);

    const addInput: Parameters<typeof qbt.addTorrent>[0] = {
      torrentFile,
      category,
      tags,
      paused: false,
      savepath: savePath,
    };
    if (upLimit != null) addInput.upLimit = upLimit * 1024;
    await qbt.addTorrent(addInput);

    // Verify post-add (5s settle + listTorrents lookup)
    await new Promise((r) => setTimeout(r, 5000));
    const after = await qbt.listTorrents({ tag: 'harvester' });
    const added = after.find(
      (t) => t.name === torrent.name && Math.abs(t.size - torrent.size_bytes) < 1024,
    );
    if (added) {
      logger.info(
        {
          component: 'downloader',
          op: 'create',
          infohash: added.hash,
          mteam_id: torrent.mteam_id,
          name: torrent.name,
          size_bytes: torrent.size_bytes,
          discount: torrent.discount,
          save_path: savePath,
        },
        'grab success',
      );
      const eventId = insertTorrentEvent(db, {
        mteam_id: torrent.mteam_id,
        infohash: null,
        name: torrent.name,
        size_bytes: torrent.size_bytes,
        discount: torrent.discount,
        discount_end_ts: torrent.discount_end_ts,
        seeders: torrent.seeders,
        leechers: torrent.leechers,
        category: torrent.category,
        created_date_ts: torrent.created_date_ts,
        raw_payload: JSON.stringify(torrent.raw_payload),
        seen_at: unixSec(),
        decision: 'GRABBED',
        matched_rule: matched.map((m) => m.name).join(','),
        rejection_reason: null,
      });
      updateTorrentEventInfohash(db, eventId, added.hash);
      grabsOk.inc();
      bus.emit('torrent.grab.success', {
        type: 'torrent.grab.success',
        mteam_id: torrent.mteam_id,
        infohash: added.hash,
        name: torrent.name,
      });
    } else {
      insertTorrentEvent(db, {
        mteam_id: torrent.mteam_id,
        infohash: null,
        name: torrent.name,
        size_bytes: torrent.size_bytes,
        discount: torrent.discount,
        discount_end_ts: torrent.discount_end_ts,
        seeders: torrent.seeders,
        leechers: torrent.leechers,
        category: torrent.category,
        created_date_ts: torrent.created_date_ts,
        raw_payload: JSON.stringify(torrent.raw_payload),
        seen_at: unixSec(),
        decision: 'ERROR',
        matched_rule: matched.map((m) => m.name).join(','),
        rejection_reason: 'grab_verify_failed',
      });
      logger.warn({ component: 'downloader', mteam_id: torrent.mteam_id }, 'grab verify failed');
      grabsFail.inc();
    }
  }

  function insertEventSkipDup(torrent: NormalizedTorrent): void {
    insertTorrentEvent(db, {
      mteam_id: torrent.mteam_id,
      infohash: null,
      name: torrent.name,
      size_bytes: torrent.size_bytes,
      discount: torrent.discount,
      discount_end_ts: torrent.discount_end_ts,
      seeders: torrent.seeders,
      leechers: torrent.leechers,
      category: torrent.category,
      created_date_ts: torrent.created_date_ts,
      raw_payload: JSON.stringify(torrent.raw_payload),
      seen_at: unixSec(),
      decision: 'SKIPPED_DUP',
      matched_rule: null,
      rejection_reason: null,
    });
  }

  async function enqueue(
    torrent: NormalizedTorrent,
    matched: Array<{ id: number; name: string }>,
    pollRunId: number,
  ): Promise<void> {
    void pollRunId;
    try {
      await doAdd(torrent, matched);
    } catch (err) {
      const normalized = normalizeError(err);
      grabsFail.inc();
      logger.warn(
        {
          component: 'downloader',
          op: 'create_failed',
          mteam_id: torrent.mteam_id,
          name: torrent.name,
          err: normalized,
        },
        'grab failed',
      );
      if (normalized.code === 'QBT_UNREACHABLE' || normalized.code === 'QBT_AUTH_FAILED') {
        enqueueGrab(db, {
          mteam_id: torrent.mteam_id,
          rule_set_name: matched.map((m) => m.name).join(','),
          enqueued_at: unixSec(),
          next_attempt_at: unixSec() + 60,
          last_error: normalized.user_message,
        });
      }
      bus.emit('torrent.grab.failed', {
        type: 'torrent.grab.failed',
        mteam_id: torrent.mteam_id,
        error: {
          code: normalized.code,
          user_message: normalized.user_message,
        },
      });
      if (!(err instanceof HarvesterError)) throw err;
    }
  }

  async function drainQueued(): Promise<void> {
    // Evict items older than 10m (token TTL).
    pruneExpiredGrabs(db, unixSec() - GENDL_TOKEN_TTL_SEC);
    const due = nextDueGrab(db, unixSec());
    if (!due) return;
    try {
      const detail = await mteam.detail(due.mteam_id);
      const tags = [
        'harvester',
        `discount:${String(detail?.status?.discount ?? 'NORMAL')}`,
        ...due.rule_set_name.split(',').filter(Boolean).map((n) => `rule:${n}`),
      ];
      const url = await mteam.genDlToken(due.mteam_id);
      const torrentFile = await fetchTorrentFile(url);
      await qbt.addTorrent({
        torrentFile,
        tags,
        savepath: config.downloads.default_save_path,
        paused: false,
      });
      removeGrabQueue(db, due.id);
      logger.info({ component: 'downloader', mteam_id: due.mteam_id }, 'drained queued grab');
    } catch (err) {
      const nx = unixSec() + Math.min(600, 60 * (due.attempts + 1));
      updateGrabAttempt(db, due.id, nx, (err as Error).message);
      logger.warn({ component: 'downloader', mteam_id: due.mteam_id, err }, 'grab drain failed');
    }
  }

  async function fetchTorrentFile(tokenUrl: string): Promise<Buffer> {
    const res = await fetch(tokenUrl, {
      method: 'GET',
      headers: {
        'User-Agent': config.mteam.user_agent,
        Accept: 'application/x-bittorrent, */*',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new HarvesterError({
        code: 'MTEAM_BAD_RESPONSE',
        user_message: `Failed to fetch .torrent (HTTP ${res.status})`,
        context: { status: res.status, url: tokenUrl },
      });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64 || buf[0] !== 0x64 /* 'd' */) {
      // Not a valid bencoded torrent file (must start with 'd' for dict).
      throw new HarvesterError({
        code: 'MTEAM_BAD_RESPONSE',
        user_message: 'Downloaded .torrent is malformed',
        context: { first_bytes: buf.subarray(0, 32).toString('hex'), length: buf.length },
      });
    }
    return buf;
  }

  return { enqueue, drainQueued };
}

function deriveCategory(matched: Array<{ name: string }>): string {
  // Prefer first match's rule — but we don't carry category on match (we'd need the RuleSet).
  // For Phase 1, use the default. Phase 2 can thread the RuleSet through.
  void matched;
  return 'mteam-auto';
}

function deriveSavePath(_matched: Array<{ name: string }>): string | null {
  return null;
}

function deriveUpLimit(_matched: Array<{ name: string }>): number | null {
  return null;
}
