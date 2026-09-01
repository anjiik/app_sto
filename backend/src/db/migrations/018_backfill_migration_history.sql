-- Migration 018: Backfill schema_migrations for an EXISTING, already-migrated server
-- Run this ONCE on any server that was already running the app before
-- 017_migration_tracking.sql existed — it records 001-016 as applied without
-- re-running them (they're already reflected in the live schema).
--
-- On a brand-new database seeded from schema.sql (already fully migrated),
-- run this too — it records the same history so the table stays meaningful.
--
-- Safe to re-run: every insert is guarded by NOT EXISTS.

INSERT INTO schema_migrations (filename)
SELECT v.filename
FROM (VALUES
  ('001_performance.sql'),
  ('003_app_users.sql'),
  ('004_admin_audit.sql'),
  ('005_fk_constraints.sql'),
  ('006_remove_app_users.sql'),
  ('007_receiving_mgmt_approval.sql'),
  ('008_archive.sql'),
  ('009_nullable_requestor_user_id.sql'),
  ('010_reset_sto_sequence.sql'),
  ('011_form_overhaul.sql'),
  ('012_demo_user_grants.sql'),
  ('013_distressed_inventory.sql'),
  ('014_sto_number_request.sql'),
  ('015_sto_attachments.sql'),
  ('016_mbm_demo_users.sql'),
  ('017_migration_tracking.sql'),
  ('018_backfill_migration_history.sql')
) AS v(filename)
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations m WHERE m.filename = v.filename);
