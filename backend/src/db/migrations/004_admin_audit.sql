-- Migration 004: admin action audit log
-- Tracks role changes, site changes, and account activations/deactivations

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'admin_audit_log')
BEGIN
  CREATE TABLE admin_audit_log (
    id                  INT PRIMARY KEY IDENTITY(1,1),
    action              VARCHAR(100)     NOT NULL,
    target_user_id      INT              NOT NULL,
    target_username     VARCHAR(200)     NOT NULL,
    performed_by        INT              NOT NULL,
    performed_by_name   VARCHAR(200)     NOT NULL,
    old_value           NVARCHAR(500)    NULL,
    new_value           NVARCHAR(500)    NULL,
    performed_at        DATETIME         NOT NULL DEFAULT GETDATE()
  );

  CREATE NONCLUSTERED INDEX IX_admin_audit_target ON admin_audit_log (target_user_id, performed_at DESC);
  CREATE NONCLUSTERED INDEX IX_admin_audit_performed ON admin_audit_log (performed_by, performed_at DESC);
END
