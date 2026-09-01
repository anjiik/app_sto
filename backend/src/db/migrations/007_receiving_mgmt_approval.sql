-- Migration 007: Replace finance approval with receiving-site management approval
-- New flow: SHIPPING_LOGISTICS → MANAGEMENT_REVIEW (shipping site)
--                              → RECEIVING_MGMT_REVIEW (receiving site)
--                              → RECEIVING_LOGISTICS
-- Triggered when material_value > $100,000 OR freight_cost > $20,000.
-- Run AFTER 006_remove_app_users.sql.
-- Safe to re-run: each column add is guarded by a sys.columns check.

-- 1. Add receiving-site management approval columns
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('sto_requests') AND name = 'receiving_mgmt_approved')
  ALTER TABLE sto_requests ADD receiving_mgmt_approved            BIT           NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('sto_requests') AND name = 'receiving_mgmt_approved_by_user_id')
  ALTER TABLE sto_requests ADD receiving_mgmt_approved_by_user_id INT           NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('sto_requests') AND name = 'receiving_mgmt_approved_at')
  ALTER TABLE sto_requests ADD receiving_mgmt_approved_at         DATETIME      NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('sto_requests') AND name = 'receiving_mgmt_notes')
  ALTER TABLE sto_requests ADD receiving_mgmt_notes               NVARCHAR(1000) NULL;
