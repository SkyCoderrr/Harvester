-- 0003a_indexes.sql
-- FR-V2-04: covering indexes for torrent_events lookups by infohash and by (mteam_id, seen_at).
-- The Phase-1 0003_profile_snapshot_extras adds columns; this file adds only indexes
-- so Phase 0 can ship before Phase 1.

CREATE INDEX IF NOT EXISTS idx_torrent_events_infohash
  ON torrent_events(infohash) WHERE infohash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_torrent_events_mteam_seen
  ON torrent_events(mteam_id, seen_at DESC);
