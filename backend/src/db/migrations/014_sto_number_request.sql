-- Migration 014: STO# request reminder
-- Lets Shipping Site Logistics flag that the SAP STO# still needs to be
-- populated by the requestor on the tracker, surfaced as a reminder to the
-- requestor rather than a separate notification channel.
-- Run AFTER 013_distressed_inventory.sql.

ALTER TABLE sto_requests ADD sto_number_requested_at DATETIME NULL;
