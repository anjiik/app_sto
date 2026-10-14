-- Migration 022: Request type categorization
--
-- Lets requestors classify an STO by material category (Raw Material,
-- Commodity, Consumable, Cell Bank, mAb, Toxin) so Analytics can filter and
-- group by it. NULL on existing rows created before this field existed.
--
-- Safe to re-run: guarded by IF NOT EXISTS.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'sto_requests' AND COLUMN_NAME = 'request_type'
)
  ALTER TABLE sto_requests ADD request_type VARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '022_request_type.sql')
  INSERT INTO schema_migrations (filename) VALUES ('022_request_type.sql');
