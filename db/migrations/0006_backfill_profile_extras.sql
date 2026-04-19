-- 0006_backfill_profile_extras.sql
-- Populate the Phase-1 additive columns on pre-existing profile_snapshots
-- rows from the preserved `raw_payload` JSON. v1 rows have those columns
-- defaulted to 0 / NULL because they were written before migration 0005
-- added the columns. This one-shot update extracts the real values so the
-- dashboard KPI tiles and the AccountHealthBanner work on historical data
-- without waiting 15 minutes for the next profile probe.
--
-- Uses SQLite's json_extract() on the preserved raw payload. Rows with a
-- malformed raw_payload stay at their current defaults.

UPDATE profile_snapshots
   SET seedtime_sec  = COALESCE(seedtime_sec,  CAST(json_extract(raw_payload, '$.seedtime')          AS INTEGER)),
       leechtime_sec = COALESCE(leechtime_sec, CAST(json_extract(raw_payload, '$.leechtime')         AS INTEGER)),
       warned        = CASE WHEN warned     = 0 AND json_extract(raw_payload, '$.memberStatus.warned')     IS NOT NULL
                            THEN CASE WHEN json_extract(raw_payload, '$.memberStatus.warned')     = 1 THEN 1 ELSE 0 END
                            ELSE warned END,
       leech_warn    = CASE WHEN leech_warn = 0 AND json_extract(raw_payload, '$.memberStatus.leechWarn')  IS NOT NULL
                            THEN CASE WHEN json_extract(raw_payload, '$.memberStatus.leechWarn')  = 1 THEN 1 ELSE 0 END
                            ELSE leech_warn END,
       vip           = CASE WHEN vip        = 0 AND json_extract(raw_payload, '$.memberStatus.vip')        IS NOT NULL
                            THEN CASE WHEN json_extract(raw_payload, '$.memberStatus.vip')        = 1 THEN 1 ELSE 0 END
                            ELSE vip END
 WHERE raw_payload IS NOT NULL
   AND json_valid(raw_payload);
