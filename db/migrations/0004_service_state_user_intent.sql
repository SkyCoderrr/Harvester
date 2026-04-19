-- 0003b_service_state_user_intent.sql
-- FR-V2-03 / FR-V2-36: persist user intent ('running' | 'paused') as a
-- distinct field that boot logic honors. The existing `status` column stays
-- as the system-observed status (RUNNING / PAUSED_USER / PAUSED_EMERGENCY /
-- PAUSED_BACKOFF / STOPPED). Backfill: any row that boot-time observed as
-- PAUSED_USER is treated as user-intended-paused.

ALTER TABLE service_state
  ADD COLUMN desired_user_intent TEXT NOT NULL DEFAULT 'running'
  CHECK (desired_user_intent IN ('running','paused'));

UPDATE service_state
   SET desired_user_intent = CASE WHEN status = 'PAUSED_USER' THEN 'paused' ELSE 'running' END;
