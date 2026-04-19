import type Database from 'better-sqlite3';
import type { Discount, ServiceStatus } from '@shared/types.js';

type Db = Database.Database;

// -- Row types (match 0001_init.sql exactly) --------------------------------

export interface TorrentEventRow {
  id: number;
  mteam_id: string;
  infohash: string | null;
  name: string;
  size_bytes: number;
  discount: Discount;
  discount_end_ts: number | null;
  seeders: number | null;
  leechers: number | null;
  category: string | null;
  created_date_ts: number | null;
  raw_payload: string;
  seen_at: number;
  decision: string;
  matched_rule: string | null;
  rejection_reason: string | null;
  re_eval_count: number;
}

export type NewTorrentEventRow = Omit<TorrentEventRow, 'id' | 're_eval_count'> & {
  re_eval_count?: number;
};

export interface RuleSetRowDb {
  id: number;
  name: string;
  enabled: number;
  schema_version: number;
  rules_json: string;
  created_at: number;
  updated_at: number;
}

export interface PollRunRow {
  id?: number;
  started_at: number;
  finished_at: number | null;
  torrents_seen: number | null;
  torrents_grabbed: number | null;
  error: string | null;
}

export interface GrabQueueRow {
  id: number;
  mteam_id: string;
  rule_set_name: string;
  enqueued_at: number;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
}

export type NewGrabQueueRow = Omit<GrabQueueRow, 'id' | 'attempts' | 'last_error'> & {
  last_error?: string | null;
};

export interface LogRowDb {
  id: number;
  ts: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  component: string;
  message: string;
  meta_json: string | null;
}

export type NewLogRow = Omit<LogRowDb, 'id'>;

export interface StatsDailyRow {
  date: string;
  grabbed_count: number;
  uploaded_bytes: number;
  downloaded_bytes: number;
  active_torrents_peak: number;
  ratio_end_of_day: number | null;
  bonus_points_end_of_day: number | null;
}

export interface LifecyclePeerRow {
  infohash: string;
  first_seen_at: number;
  zero_peers_since: number | null;
  last_checked_at: number;
}

export interface ProfileSnapshotRow {
  id?: number;
  ts: number;
  uploaded_bytes: number;
  downloaded_bytes: number;
  ratio: number;
  bonus_points: number | null;
  account_tier: string | null;
  raw_payload: string | null;
}

export interface ServiceStateRow {
  id: 1;
  status: ServiceStatus;
  last_poll_at: number | null;
  consecutive_errors: number;
  allowed_client_ok: number;
  updated_at: number;
  /** FR-V2-03: persisted user intent. Survives restart. */
  desired_user_intent: 'running' | 'paused';
}

export interface LogFilter {
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  component?: string;
  from?: number;
  to?: number;
  q?: string;
  limit?: number;
  cursor?: number;
}

// -- Helpers ----------------------------------------------------------------

function boolToInt(b: boolean): 1 | 0 {
  return b ? 1 : 0;
}

// -- Torrent events ---------------------------------------------------------

export function getTorrentEventByMteamId(db: Db, mteamId: string): TorrentEventRow | undefined {
  return db
    .prepare(
      'SELECT * FROM torrent_events WHERE mteam_id = ? ORDER BY id DESC LIMIT 1',
    )
    .get(mteamId) as TorrentEventRow | undefined;
}

export function insertTorrentEvent(db: Db, row: NewTorrentEventRow): number {
  const r = db
    .prepare(
      `INSERT INTO torrent_events
       (mteam_id, infohash, name, size_bytes, discount, discount_end_ts,
        seeders, leechers, category, created_date_ts, raw_payload, seen_at,
        decision, matched_rule, rejection_reason, re_eval_count)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      row.mteam_id,
      row.infohash,
      row.name,
      row.size_bytes,
      row.discount,
      row.discount_end_ts,
      row.seeders,
      row.leechers,
      row.category,
      row.created_date_ts,
      row.raw_payload,
      row.seen_at,
      row.decision,
      row.matched_rule,
      row.rejection_reason,
      row.re_eval_count ?? 0,
    );
  return Number(r.lastInsertRowid);
}

export function updateTorrentEventInfohash(db: Db, id: number, infohash: string): void {
  db.prepare('UPDATE torrent_events SET infohash = ? WHERE id = ?').run(infohash, id);
}

export function countReEvals(db: Db, mteamId: string): number {
  const r = db
    .prepare(
      "SELECT COUNT(*) AS c FROM torrent_events WHERE mteam_id = ? AND decision IN ('RE_EVALUATED_GRABBED','RE_EVALUATED_SKIPPED')",
    )
    .get(mteamId) as { c: number };
  return r.c;
}

export function listTorrentEventsForMteamId(
  db: Db,
  mteamId: string,
  limit = 50,
): TorrentEventRow[] {
  return db
    .prepare('SELECT * FROM torrent_events WHERE mteam_id = ? ORDER BY id DESC LIMIT ?')
    .all(mteamId, limit) as TorrentEventRow[];
}

export function listRecentTorrentEvents(db: Db, limit: number, cursor?: number): TorrentEventRow[] {
  if (cursor) {
    return db
      .prepare('SELECT * FROM torrent_events WHERE id < ? ORDER BY id DESC LIMIT ?')
      .all(cursor, limit) as TorrentEventRow[];
  }
  return db
    .prepare('SELECT * FROM torrent_events ORDER BY id DESC LIMIT ?')
    .all(limit) as TorrentEventRow[];
}

export function countGrabsSince(db: Db, sinceTs: number): number {
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM torrent_events WHERE decision IN ('GRABBED','RE_EVALUATED_GRABBED') AND seen_at >= ?",
      )
      .get(sinceTs) as { c: number }
  ).c;
}

// -- Rule sets --------------------------------------------------------------

export function listRuleSetRows(db: Db, onlyEnabled?: boolean): RuleSetRowDb[] {
  const q = onlyEnabled
    ? 'SELECT * FROM rule_sets WHERE enabled = 1 ORDER BY id ASC'
    : 'SELECT * FROM rule_sets ORDER BY id ASC';
  return db.prepare(q).all() as RuleSetRowDb[];
}

export function getRuleSetRow(db: Db, id: number): RuleSetRowDb | undefined {
  return db.prepare('SELECT * FROM rule_sets WHERE id = ?').get(id) as RuleSetRowDb | undefined;
}

export function insertRuleSetRow(
  db: Db,
  name: string,
  enabled: boolean,
  schemaVersion: number,
  rulesJson: string,
): number {
  const now = Math.floor(Date.now() / 1000);
  const r = db
    .prepare(
      'INSERT INTO rule_sets (name, enabled, schema_version, rules_json, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    )
    .run(name, boolToInt(enabled), schemaVersion, rulesJson, now, now);
  return Number(r.lastInsertRowid);
}

export function updateRuleSetRow(
  db: Db,
  id: number,
  name: string,
  enabled: boolean,
  schemaVersion: number,
  rulesJson: string,
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'UPDATE rule_sets SET name=?, enabled=?, schema_version=?, rules_json=?, updated_at=? WHERE id=?',
  ).run(name, boolToInt(enabled), schemaVersion, rulesJson, now, id);
}

export function deleteRuleSetRow(db: Db, id: number): void {
  db.prepare('DELETE FROM rule_sets WHERE id = ?').run(id);
}

export function archiveRuleSetRow(
  db: Db,
  originalId: number,
  schemaVersion: number,
  rulesJson: string,
): void {
  db.prepare(
    'INSERT INTO rule_sets_archive (original_rule_set_id, schema_version, rules_json, archived_at) VALUES (?,?,?,?)',
  ).run(originalId, schemaVersion, rulesJson, Math.floor(Date.now() / 1000));
}

// -- Poll runs --------------------------------------------------------------

export function insertPollRun(db: Db, startedAt: number): number {
  const r = db
    .prepare('INSERT INTO poll_runs (started_at, finished_at) VALUES (?, NULL)')
    .run(startedAt);
  return Number(r.lastInsertRowid);
}

export function finishPollRun(
  db: Db,
  id: number,
  patch: { finished_at: number; torrents_seen?: number; torrents_grabbed?: number; error?: string | null },
): void {
  db.prepare(
    'UPDATE poll_runs SET finished_at=?, torrents_seen=?, torrents_grabbed=?, error=? WHERE id=?',
  ).run(
    patch.finished_at,
    patch.torrents_seen ?? null,
    patch.torrents_grabbed ?? null,
    patch.error ?? null,
    id,
  );
}

// -- Grab queue -------------------------------------------------------------

export function enqueueGrab(db: Db, row: NewGrabQueueRow): number {
  const r = db
    .prepare(
      'INSERT INTO grab_queue (mteam_id, rule_set_name, enqueued_at, attempts, next_attempt_at, last_error) VALUES (?,?,?,0,?,?)',
    )
    .run(row.mteam_id, row.rule_set_name, row.enqueued_at, row.next_attempt_at, row.last_error ?? null);
  return Number(r.lastInsertRowid);
}

export function nextDueGrab(db: Db, now: number): GrabQueueRow | undefined {
  return db
    .prepare('SELECT * FROM grab_queue WHERE next_attempt_at <= ? ORDER BY next_attempt_at ASC LIMIT 1')
    .get(now) as GrabQueueRow | undefined;
}

export function updateGrabAttempt(
  db: Db,
  id: number,
  nextAttemptAt: number,
  lastError: string | null,
): void {
  db.prepare(
    'UPDATE grab_queue SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?',
  ).run(nextAttemptAt, lastError, id);
}

export function removeGrabQueue(db: Db, id: number): void {
  db.prepare('DELETE FROM grab_queue WHERE id = ?').run(id);
}

export function pruneExpiredGrabs(db: Db, olderThanTs: number): number {
  const r = db.prepare('DELETE FROM grab_queue WHERE enqueued_at < ?').run(olderThanTs);
  return r.changes;
}

// -- Logs -------------------------------------------------------------------

export function insertLog(db: Db, row: NewLogRow): number {
  const r = db
    .prepare(
      'INSERT INTO logs (ts, level, component, message, meta_json) VALUES (?,?,?,?,?)',
    )
    .run(row.ts, row.level, row.component, row.message, row.meta_json);
  return Number(r.lastInsertRowid);
}

export function pruneLogsBefore(db: Db, ts: number): number {
  const r = db.prepare('DELETE FROM logs WHERE ts < ?').run(ts);
  return r.changes;
}

export function listLogs(db: Db, f: LogFilter): LogRowDb[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.level) {
    where.push('level = ?');
    args.push(f.level);
  }
  if (f.component) {
    where.push('component = ?');
    args.push(f.component);
  }
  if (f.from) {
    where.push('ts >= ?');
    args.push(f.from);
  }
  if (f.to) {
    where.push('ts <= ?');
    args.push(f.to);
  }
  if (f.q) {
    where.push('(message LIKE ? OR meta_json LIKE ?)');
    args.push('%' + f.q + '%', '%' + f.q + '%');
  }
  if (f.cursor) {
    where.push('id < ?');
    args.push(f.cursor);
  }
  const sql =
    'SELECT * FROM logs' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY id DESC LIMIT ?';
  args.push(f.limit ?? 200);
  return db.prepare(sql).all(...args) as LogRowDb[];
}

// -- Stats daily ------------------------------------------------------------

export function upsertStatsDaily(db: Db, row: StatsDailyRow): void {
  db.prepare(
    `INSERT INTO stats_daily (date, grabbed_count, uploaded_bytes, downloaded_bytes, active_torrents_peak, ratio_end_of_day, bonus_points_end_of_day)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(date) DO UPDATE SET
       grabbed_count=excluded.grabbed_count,
       uploaded_bytes=excluded.uploaded_bytes,
       downloaded_bytes=excluded.downloaded_bytes,
       active_torrents_peak=excluded.active_torrents_peak,
       ratio_end_of_day=excluded.ratio_end_of_day,
       bonus_points_end_of_day=excluded.bonus_points_end_of_day`,
  ).run(
    row.date,
    row.grabbed_count,
    row.uploaded_bytes,
    row.downloaded_bytes,
    row.active_torrents_peak,
    row.ratio_end_of_day,
    row.bonus_points_end_of_day,
  );
}

export function listStatsDaily(db: Db, from: string, to: string): StatsDailyRow[] {
  return db
    .prepare('SELECT * FROM stats_daily WHERE date >= ? AND date <= ? ORDER BY date ASC')
    .all(from, to) as StatsDailyRow[];
}

// -- Lifecycle peer state --------------------------------------------------

export function getLifecyclePeerState(db: Db, infohash: string): LifecyclePeerRow | undefined {
  return db
    .prepare('SELECT * FROM lifecycle_peer_state WHERE infohash = ?')
    .get(infohash) as LifecyclePeerRow | undefined;
}

export function upsertLifecyclePeerState(db: Db, row: LifecyclePeerRow): void {
  db.prepare(
    `INSERT INTO lifecycle_peer_state (infohash, first_seen_at, zero_peers_since, last_checked_at)
     VALUES (?,?,?,?)
     ON CONFLICT(infohash) DO UPDATE SET
       zero_peers_since=excluded.zero_peers_since,
       last_checked_at=excluded.last_checked_at`,
  ).run(row.infohash, row.first_seen_at, row.zero_peers_since, row.last_checked_at);
}

export function deleteLifecyclePeerState(db: Db, infohash: string): void {
  db.prepare('DELETE FROM lifecycle_peer_state WHERE infohash = ?').run(infohash);
}

// -- Profile snapshots -----------------------------------------------------

export function insertProfileSnapshot(db: Db, row: ProfileSnapshotRow): number {
  const r = db
    .prepare(
      `INSERT INTO profile_snapshots
       (ts, uploaded_bytes, downloaded_bytes, ratio, bonus_points, account_tier, raw_payload)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      row.ts,
      row.uploaded_bytes,
      row.downloaded_bytes,
      row.ratio,
      row.bonus_points,
      row.account_tier,
      row.raw_payload,
    );
  return Number(r.lastInsertRowid);
}

export function getLatestProfileSnapshot(db: Db): ProfileSnapshotRow | undefined {
  return db
    .prepare('SELECT * FROM profile_snapshots ORDER BY ts DESC LIMIT 1')
    .get() as ProfileSnapshotRow | undefined;
}

// -- Service state ---------------------------------------------------------

export function getServiceStateRow(db: Db): ServiceStateRow {
  const r = db.prepare('SELECT * FROM service_state WHERE id = 1').get() as ServiceStateRow;
  return r;
}

export function upsertServiceStateRow(db: Db, row: Omit<ServiceStateRow, 'id'>): void {
  db.prepare(
    `INSERT INTO service_state (id, status, last_poll_at, consecutive_errors, allowed_client_ok, updated_at, desired_user_intent)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status=excluded.status,
       last_poll_at=excluded.last_poll_at,
       consecutive_errors=excluded.consecutive_errors,
       allowed_client_ok=excluded.allowed_client_ok,
       updated_at=excluded.updated_at,
       desired_user_intent=excluded.desired_user_intent`,
  ).run(
    row.status,
    row.last_poll_at,
    row.consecutive_errors,
    row.allowed_client_ok,
    row.updated_at,
    row.desired_user_intent,
  );
}

/**
 * FR-V2-37 helper: write only the user intent without disturbing the rest of
 * the row. Used by /service/pause and /service/resume.
 */
export function setDesiredUserIntent(db: Db, intent: 'running' | 'paused'): void {
  db.prepare(
    `UPDATE service_state SET desired_user_intent = ?, updated_at = ? WHERE id = 1`,
  ).run(intent, Math.floor(Date.now() / 1000));
}
