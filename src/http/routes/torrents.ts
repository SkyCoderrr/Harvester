import type { FastifyInstance } from 'fastify';
import type { HttpDeps } from '../server.js';
import type { TorrentRow } from '@shared/types.js';
import { listTorrentEventsForMteamId, getTorrentEventByMteamId } from '../../db/queries.js';
import type { QbtTorrentInfo } from '../../qbt/client.js';
import { HarvesterError } from '../../errors/index.js';
import { torrentsBulkActionBody, torrentsActionBody } from '../schemas/torrents.js';

export function registerTorrentsRoutes(app: FastifyInstance, deps: HttpDeps): void {
  app.get('/torrents', async (req) => {
    const q = req.query as { state?: string; q?: string; limit?: string };
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
    let torrents: QbtTorrentInfo[];
    try {
      torrents = await deps.qbt.listTorrents({ tag: 'harvester' });
    } catch {
      torrents = [];
    }
    const items: TorrentRow[] = torrents.slice(0, limit).map((t: QbtTorrentInfo) => {
      const event = findEventByInfohash(deps, t.hash);
      const tagList = t.tags ? t.tags.split(',').map((x: string) => x.trim()).filter(Boolean) : [];
      // Prefer discount extracted from qBt tag (source of truth at grab time, survives
      // deleted torrent_events rows). Fall back to the stored event, else NORMAL.
      const tagDiscount = tagList
        .find((tag) => tag.startsWith('discount:'))
        ?.slice('discount:'.length) as TorrentRow['discount'] | undefined;
      const matchedFromTags = tagList
        .filter((tag) => tag.startsWith('rule:'))
        .map((tag) => tag.slice('rule:'.length))
        .join(',') || null;
      return {
        mteam_id: event?.mteam_id ?? '',
        infohash: t.hash,
        name: t.name,
        size_bytes: t.size,
        discount: tagDiscount ?? (event?.discount as TorrentRow['discount']) ?? 'NORMAL',
        added_at: t.added_on,
        state: t.state,
        progress: t.progress,
        dlspeed: t.dlspeed ?? 0,
        upspeed: t.upspeed ?? 0,
        eta: t.eta ?? 0,
        ratio: t.ratio,
        uploaded_bytes: t.uploaded,
        downloaded_bytes: t.downloaded,
        seeders: t.num_seeds,
        leechers: t.num_leechs,
        discount_end_ts: event?.discount_end_ts ?? null,
        matched_rule: event?.matched_rule ?? matchedFromTags,
        tags: tagList,
        save_path: t.save_path ?? null,
      };
    });
    return { ok: true, data: { items, next_cursor: null } };
  });

  app.get('/torrents/:id', async (req) => {
    const { id } = req.params as { id: string };
    const event = getTorrentEventByMteamId(deps.db, id);
    if (!event) {
      throw new HarvesterError({ code: 'NOT_FOUND', user_message: 'Torrent not found' });
    }
    const transitions = listTorrentEventsForMteamId(deps.db, id, 50);
    let mteamPayload: unknown = null;
    try {
      mteamPayload = JSON.parse(event.raw_payload);
    } catch {
      mteamPayload = null;
    }
    return {
      ok: true,
      data: {
        torrent: event,
        transitions,
        mteam_payload: mteamPayload,
      },
    };
  });

  app.post('/torrents/bulk-action', async (req) => {
    const body = torrentsBulkActionBody.parse(req.body);
    // Accept either infohashes directly (from the qBt listing) or mteam_ids which we
    // resolve via torrent_events. infohashes takes precedence.
    let hashes: string[] = [];
    if (body.infohashes?.length) {
      hashes = body.infohashes;
    } else if (body.ids?.length) {
      const rows = body.ids
        .map((id) => getTorrentEventByMteamId(deps.db, id))
        .filter((r): r is NonNullable<ReturnType<typeof getTorrentEventByMteamId>> => r != null && r.infohash != null)
        .map((r) => r.infohash!) as string[];
      hashes = rows;
    }
    if (hashes.length === 0) {
      return { ok: true, data: { results: [] } };
    }
    const results: Array<{ infohash: string; ok: boolean; error?: string }> = [];
    try {
      switch (body.action) {
        case 'pause':
          await deps.qbt.pauseTorrents(hashes);
          break;
        case 'resume':
          await deps.qbt.resumeTorrents(hashes);
          break;
        case 'recheck':
          await deps.qbt.recheckTorrents(hashes);
          break;
        case 'remove':
          await deps.qbt.deleteTorrents(hashes, false);
          break;
        case 'remove_with_data':
          await deps.qbt.deleteTorrents(hashes, true);
          break;
      }
      for (const h of hashes) results.push({ infohash: h, ok: true });
    } catch (err) {
      for (const h of hashes) results.push({ infohash: h, ok: false, error: (err as Error).message });
    }
    return { ok: true, data: { results } };
  });

  app.post('/torrents/:id/action', async (req) => {
    const { id } = req.params as { id: string };
    const { action } = torrentsActionBody.parse(req.body);
    const event = getTorrentEventByMteamId(deps.db, id);
    if (!event?.infohash) {
      throw new HarvesterError({
        code: 'NOT_FOUND',
        user_message: 'Torrent not found or not yet added.',
      });
    }
    const hashes = [event.infohash];
    switch (action) {
      case 'pause':
        await deps.qbt.pauseTorrents(hashes);
        break;
      case 'resume':
        await deps.qbt.resumeTorrents(hashes);
        break;
      case 'recheck':
        await deps.qbt.recheckTorrents(hashes);
        break;
      case 'remove':
        await deps.qbt.deleteTorrents(hashes, false);
        break;
      case 'remove_with_data':
        await deps.qbt.deleteTorrents(hashes, true);
        break;
      default:
        throw new HarvesterError({
          code: 'RULE_VALIDATION',
          user_message: 'Unknown action',
        });
    }
    return { ok: true, data: { ok: true } };
  });
}

function findEventByInfohash(
  deps: HttpDeps,
  hash: string,
): ReturnType<typeof getTorrentEventByMteamId> | undefined {
  const row = deps.db
    .prepare('SELECT * FROM torrent_events WHERE infohash = ? ORDER BY id DESC LIMIT 1')
    .get(hash);
  return (row as ReturnType<typeof getTorrentEventByMteamId>) ?? undefined;
}
