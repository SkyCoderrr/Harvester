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
import { fetchWithTimeout } from '../util/fetchWithTimeout.js';
import { extractInfohash } from '../util/torrentInfohash.js';

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
    // SPIKE §1: api.m-team.cc 302s default UAs to google.com. qBt's libtorrent fetcher
    // inherits this failure mode, so we download the .torrent file ourselves with our
    // configured UA and hand the bytes to qBt via multipart upload.
    const tokenUrl = await mteam.genDlToken(torrent.mteam_id);
    const torrentFile = await fetchTorrentFile(tokenUrl);

    // Extract the real infohash from the .torrent bytes (SHA-1 of the info
    // dict). Using this for both collision detection and post-add verify is
    // orders-of-magnitude more reliable than the old name+size heuristic —
    // qBt often renames the visible title to the .torrent's internal name,
    // which caused false "grab_verify_failed" reports whenever the two
    // disagreed.
    const expectedInfohash = extractInfohash(torrentFile)?.toLowerCase() ?? null;

    // Collision check on ALL torrents (not just harvester-tagged) — if the
    // user added this manually, we don't want to grab it twice.
    const existingAll = await qbt.listTorrents();
    const collision =
      (expectedInfohash &&
        existingAll.find((t) => t.hash.toLowerCase() === expectedInfohash)) ||
      existingAll.find(
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

    // Verify post-add: poll qBt up to ~10 s (2 s intervals) looking for a
    // torrent whose hash matches the expected infohash. Name-match fallback
    // kept for the rare case where we couldn't extract the infohash (not
    // a valid bencoded file, etc.).
    let added: Awaited<ReturnType<typeof qbt.listTorrents>>[number] | undefined;
    for (let i = 0; i < 5 && !added; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const after = await qbt.listTorrents({ tag: 'harvester' });
      if (expectedInfohash) {
        added = after.find((t) => t.hash.toLowerCase() === expectedInfohash);
      } else {
        added = after.find(
          (t) =>
            Math.abs(t.size - torrent.size_bytes) < 1024 &&
            (t.name === torrent.name || within10sOfNow(t.added_on)),
        );
      }
    }
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
    const res = await fetchWithTimeout(tokenUrl, {
      method: 'GET',
      headers: {
        'User-Agent': config.mteam.user_agent,
        Accept: 'application/x-bittorrent, */*',
      },
      redirect: 'follow',
      // Bigger total timeout — .torrent files can be a few MiB.
      totalTimeoutMs: 45_000,
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

/**
 * Fallback heuristic used only when we couldn't extract an infohash from
 * the .torrent bytes. True iff the qBt-reported `added_on` (unix seconds)
 * is within the last 10 seconds, which covers the usual case where the
 * add-then-verify round-trip completes in a couple seconds.
 */
function within10sOfNow(addedOnSec: number): boolean {
  if (!addedOnSec) return false;
  const delta = Math.floor(Date.now() / 1000) - addedOnSec;
  return delta >= 0 && delta < 10;
}
