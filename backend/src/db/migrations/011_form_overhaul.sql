-- Migration 011: Form overhaul
-- 1. controlled_shipping_notes — free-text comment shown when controlled shipping is required.
-- 2. mgmt_confirmed — marks that shipping logistics has completed the post-management
--    confirmation pass, so the workflow does not re-route back to management in a loop.
--    New flow when management approval is required:
--      SHIPPING_LOGISTICS → MANAGEMENT_REVIEW → SHIPPING_LOGISTICS (confirm pass)
--                         → RECEIVING_MGMT_REVIEW → RECEIVING_LOGISTICS
-- Run AFTER 010_reset_sto_sequence.sql.
-- Safe to re-run: each column add is guarded by a sys.columns check.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('sto_requests') AND name = 'controlled_shipping_notes')
  ALTER TABLE sto_requests ADD controlled_shipping_notes NVARCHAR(1000) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('sto_requests') AND name = 'mgmt_confirmed')
  ALTER TABLE sto_requests ADD mgmt_confirmed            BIT NOT NULL DEFAULT 0;
