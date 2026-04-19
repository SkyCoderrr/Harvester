-- 0002_transfer_snapshots.sql
-- Time-series of global qBt transfer speeds, sampled by the transferProbe worker.

CREATE TABLE IF NOT EXISTS transfer_snapshots (
  ts       INTEGER PRIMARY KEY,
  dlspeed  INTEGER NOT NULL,
  upspeed  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfer_snapshots_ts ON transfer_snapshots(ts DESC);
