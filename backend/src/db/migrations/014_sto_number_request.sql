-- Migration 014: STO# request reminder
-- Lets Shipping Site Logistics flag that the SAP STO# still needs to be
-- populated by the requestor on the tracker, surfaced as a reminder to the
-- requestor rather than a separate notification channel.
-- Run AFTER 013_distressed_inventory.sql.
-- Safe to re-run: the column add is guarded by a sys.columns check.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('sto_requests') AND name = 'sto_number_requested_at')
  ALTER TABLE sto_requests ADD sto_number_requested_at DATETIME NULL;
