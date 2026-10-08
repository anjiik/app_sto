-- Migration 020: Add last_stale_reminder_at for the 48h stale-queue reminder job
--
-- Tracks when the last "this STO has been sitting untouched" reminder email
-- went out, so the daily check (see backend/src/jobs/staleReminders.ts) can
-- re-trigger every 48h from the LAST reminder rather than every single day
-- once an entry crosses the threshold. NULL means no reminder has been sent
-- yet for the current status.
--
-- Safe to re-run: guarded by IF NOT EXISTS.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'sto_requests' AND COLUMN_NAME = 'last_stale_reminder_at'
)
  ALTER TABLE sto_requests ADD last_stale_reminder_at DATETIME NULL;

IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '020_stale_reminder_tracking.sql')
  INSERT INTO schema_migrations (filename) VALUES ('020_stale_reminder_tracking.sql');
