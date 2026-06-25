-- Migration 007: Replace finance approval with receiving-site management approval
-- New flow: SHIPPING_LOGISTICS → MANAGEMENT_REVIEW (shipping site)
--                              → RECEIVING_MGMT_REVIEW (receiving site)
--                              → RECEIVING_LOGISTICS
-- Triggered when material_value > $100,000 OR freight_cost > $20,000.
-- Run AFTER 006_remove_app_users.sql.

-- 1. Add receiving-site management approval columns
ALTER TABLE sto_requests ADD receiving_mgmt_approved            BIT           NULL;
ALTER TABLE sto_requests ADD receiving_mgmt_approved_by_user_id INT           NULL;
ALTER TABLE sto_requests ADD receiving_mgmt_approved_at         DATETIME      NULL;
ALTER TABLE sto_requests ADD receiving_mgmt_notes               NVARCHAR(1000) NULL;
