-- 0001_init.sql
-- Initial schema. Applied once, tracked in schema_migrations.
-- NOTE: The migration runner wraps this in a transaction; don't add BEGIN/COMMIT here.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS torrent_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  mteam_id         TEXT    NOT NULL,
  infohash         TEXT,
  name             TEXT    NOT NULL,
  size_bytes       INTEGER NOT NULL,
  discount         TEXT    NOT NULL,
  discount_end_ts  INTEGER,
  seeders          INTEGER,
  leechers         INTEGER,
  category         TEXT,
  created_date_ts  INTEGER,
  raw_payload      TEXT    NOT NULL,
  seen_at          INTEGER NOT NULL,
  decision         TEXT    NOT NULL
                   CHECK (decision IN (
                     'GRABBED','SKIPPED_RULE','SKIPPED_DUP','SKIPPED_FLIPPED',
                     'RE_EVALUATED_GRABBED','RE_EVALUATED_SKIPPED','ERROR'
                   )),
  matched_rule     TEXT,
  rejection_reason TEXT,
  re_eval_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_torrent_events_mteam_id ON torrent_events(mteam_id);
CREATE INDEX IF NOT EXISTS idx_torrent_events_seen_at  ON torrent_events(seen_at);
CREATE INDEX IF NOT EXISTS idx_torrent_events_decision ON torrent_events(decision);

CREATE TABLE IF NOT EXISTS rule_sets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT UNIQUE NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  schema_version INTEGER NOT NULL DEFAULT 1,
  rules_json     TEXT    NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_sets_archive (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  original_rule_set_id  INTEGER NOT NULL,
  schema_version        INTEGER NOT NULL,
  rules_json            TEXT    NOT NULL,
  archived_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at       INTEGER NOT NULL,
  finished_at      INTEGER,
  torrents_seen    INTEGER,
  torrents_grabbed INTEGER,
  error            TEXT
);

CREATE TABLE IF NOT EXISTS grab_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mteam_id        TEXT NOT NULL,
  rule_set_name   TEXT NOT NULL,
  enqueued_at     INTEGER NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error      TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  level     TEXT NOT NULL CHECK (level IN ('DEBUG','INFO','WARN','ERROR')),
  component TEXT NOT NULL,
  message   TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);

CREATE TABLE IF NOT EXISTS stats_daily (
  date                    TEXT PRIMARY KEY,
  grabbed_count           INTEGER NOT NULL DEFAULT 0,
  uploaded_bytes          INTEGER NOT NULL DEFAULT 0,
  downloaded_bytes        INTEGER NOT NULL DEFAULT 0,
  active_torrents_peak    INTEGER NOT NULL DEFAULT 0,
  ratio_end_of_day        REAL,
  bonus_points_end_of_day INTEGER
);

CREATE TABLE IF NOT EXISTS lifecycle_peer_state (
  infohash         TEXT PRIMARY KEY,
  first_seen_at    INTEGER NOT NULL,
  zero_peers_since INTEGER,
  last_checked_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_snapshots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               INTEGER NOT NULL,
  uploaded_bytes   INTEGER NOT NULL,
  downloaded_bytes INTEGER NOT NULL,
  ratio            REAL NOT NULL,
  bonus_points     INTEGER,
  account_tier     TEXT,
  raw_payload      TEXT
);
CREATE INDEX IF NOT EXISTS idx_profile_snapshots_ts ON profile_snapshots(ts DESC);

CREATE TABLE IF NOT EXISTS service_state (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  status             TEXT NOT NULL CHECK (status IN
                     ('RUNNING','PAUSED_USER','PAUSED_EMERGENCY','PAUSED_BACKOFF','STOPPED')),
  last_poll_at       INTEGER,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  allowed_client_ok  INTEGER NOT NULL DEFAULT 0 CHECK (allowed_client_ok IN (0,1)),
  updated_at         INTEGER NOT NULL
);
INSERT OR IGNORE INTO service_state (id, status, consecutive_errors, allowed_client_ok, updated_at)
  VALUES (1, 'STOPPED', 0, 0, strftime('%s','now'));
