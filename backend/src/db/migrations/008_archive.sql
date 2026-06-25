-- Migration 008: Soft-archive mechanism for old STO records
-- Records with status CLOSED or REJECTED and updated_at older than 5 years
-- are marked archived = 1. They stay in the table but are excluded from all
-- normal queries. Run AFTER 007_receiving_mgmt_approval.sql.

ALTER TABLE sto_requests ADD archived    BIT      NOT NULL DEFAULT 0;
ALTER TABLE sto_requests ADD archived_at DATETIME NULL;

-- Index so the archived = 0 filter in every query is a fast seek.
CREATE INDEX IX_sto_requests_archived ON sto_requests (archived);
