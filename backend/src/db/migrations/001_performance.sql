-- Migration 001: indexes, foreign key, and STO ID sequence
-- Safe to run against an existing database — every statement checks before acting.

-- ── Foreign key ───────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_audit_sto_request'
)
  ALTER TABLE sto_audit_log
    ADD CONSTRAINT FK_audit_sto_request
    FOREIGN KEY (sto_request_id) REFERENCES sto_requests(id);

-- ── STO number sequence ───────────────────────────────────────────────────────
-- Replaces the racy COUNT(*)+1 pattern with an atomic NEXT VALUE FOR call.
-- START WITH the current max id so existing records are not overwritten.
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'sto_number_seq')
BEGIN
  DECLARE @start BIGINT;
  SELECT @start = ISNULL(MAX(id), 0) + 1 FROM sto_requests;
  EXEC('CREATE SEQUENCE sto_number_seq START WITH ' + @start + ' INCREMENT BY 1 NO CYCLE');
END;

-- ── Indexes ───────────────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sto_status' AND object_id = OBJECT_ID('sto_requests'))
  CREATE NONCLUSTERED INDEX IX_sto_status
    ON sto_requests (status)
    INCLUDE (created_at, updated_at, rush_request, receiving_site_need_by_date);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sto_shipping_site_status' AND object_id = OBJECT_ID('sto_requests'))
  CREATE NONCLUSTERED INDEX IX_sto_shipping_site_status
    ON sto_requests (shipping_site, status)
    INCLUDE (sto_id, priority, rush_request, material_description, material_sap,
             quantity, uom, receiving_site_need_by_date, updated_at);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sto_receiving_site_status' AND object_id = OBJECT_ID('sto_requests'))
  CREATE NONCLUSTERED INDEX IX_sto_receiving_site_status
    ON sto_requests (receiving_site, status)
    INCLUDE (sto_id, priority, rush_request, material_description, material_sap,
             quantity, uom, receiving_site_need_by_date, updated_at);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sto_need_by_status' AND object_id = OBJECT_ID('sto_requests'))
  CREATE NONCLUSTERED INDEX IX_sto_need_by_status
    ON sto_requests (receiving_site_need_by_date, status)
    WHERE receiving_site_need_by_date IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sto_created_at' AND object_id = OBJECT_ID('sto_requests'))
  CREATE NONCLUSTERED INDEX IX_sto_created_at
    ON sto_requests (created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sto_request_date' AND object_id = OBJECT_ID('sto_requests'))
  CREATE NONCLUSTERED INDEX IX_sto_request_date
    ON sto_requests (request_date)
    INCLUDE (status, material_value, rush_request, shipping_site, receiving_site);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_sto_request_id' AND object_id = OBJECT_ID('sto_audit_log'))
  CREATE NONCLUSTERED INDEX IX_audit_sto_request_id
    ON sto_audit_log (sto_request_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_performed_at' AND object_id = OBJECT_ID('sto_audit_log'))
  CREATE NONCLUSTERED INDEX IX_audit_performed_at
    ON sto_audit_log (performed_at DESC)
    INCLUDE (action, old_status, new_status, performed_by_name, notes);
