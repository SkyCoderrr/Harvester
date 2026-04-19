-- 0003c_profile_snapshot_extras.sql
-- FR-V2-30: extend profile_snapshots with the M-Team account-health columns
-- needed by the Phase-2 dashboard (warned banner, leech-warn, VIP, seed/leech
-- time KPIs). Additive + nullable so existing rows are backwards-compatible.

ALTER TABLE profile_snapshots ADD COLUMN warned        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_snapshots ADD COLUMN leech_warn    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_snapshots ADD COLUMN vip           INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_snapshots ADD COLUMN seedtime_sec  INTEGER;
ALTER TABLE profile_snapshots ADD COLUMN leechtime_sec INTEGER;
