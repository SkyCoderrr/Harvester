-- Torrents we have permanently given up on. The poller consults this
-- table before evaluating or re-evaluating and skips any mteam_id that
-- appears here, so a blacklisted torrent is never grabbed again.
--
-- Populated by the stuckChecker worker when a qBt torrent sits in
-- `checkingDL` / `checkingUP` / `checkingResumeData` / `metaDL` for longer
-- than `config.stuck_checker.stuck_timeout_sec` — those torrents are
-- almost always corrupt / unresumable local data, and re-grabbing them
-- just puts us back in the same broken state.

CREATE TABLE IF NOT EXISTS torrent_blacklist (
  mteam_id  TEXT    PRIMARY KEY,
  infohash  TEXT,
  reason    TEXT    NOT NULL,
  added_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_torrent_blacklist_infohash
  ON torrent_blacklist(infohash);
