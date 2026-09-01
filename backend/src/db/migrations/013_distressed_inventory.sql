-- Migration 013: Distressed Inventory (DI)
-- Adds a flag + value so the app can track distressed-inventory transfers and
-- report DI savings in analytics.
--   distressed_inventory — set by the requestor on the STO form (next to Toll MFG).
--   di_value             — the estimated saving; editable by the requestor,
--                          shipping planning, and shipping logistics.
-- Run AFTER 012_demo_user_grants.sql.
-- Safe to re-run: each column add is guarded by a sys.columns check.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('sto_requests') AND name = 'distressed_inventory')
  ALTER TABLE sto_requests ADD distressed_inventory BIT NOT NULL DEFAULT 0;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('sto_requests') AND name = 'di_value')
  ALTER TABLE sto_requests ADD di_value             DECIMAL(18,2) NULL;
