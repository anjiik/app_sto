-- Migration 017: Migration tracking table
-- Until now, migrations were applied by hand with no record of what had
-- already run — the only way to check was inspecting sys.columns directly.
-- schema_migrations records each migration's file name and when it was
-- applied, so it's possible to see at a glance what state a given server is
-- in. This migration creates the table only — run
-- 018_backfill_migration_history.sql immediately after (on both existing and
-- brand-new databases) to record 001-018 as applied.

IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'schema_migrations' AND xtype = 'U')
CREATE TABLE schema_migrations (
    filename    VARCHAR(200) PRIMARY KEY,
    applied_at  DATETIME NOT NULL DEFAULT GETDATE()
);
