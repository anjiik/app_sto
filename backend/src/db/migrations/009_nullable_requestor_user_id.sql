-- Migration 009: Make requestor_user_id nullable
-- app_users table was removed in migration 006. There is no longer an integer
-- user ID to store here — the requestor is identified by requestor_name and
-- requestor_email instead. Run against sto_management in SSMS.

ALTER TABLE sto_requests ALTER COLUMN requestor_user_id INT NULL;
