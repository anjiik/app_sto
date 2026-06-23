-- Migration 006: Replace app_users with AD group-based authorization
-- Roles and site assignments now come entirely from AD group membership ({SITE}_{ROLE}).
-- Run AFTER 005_fk_constraints.sql.

-- 1. Drop FK constraints from sto_requests that referenced app_users
DECLARE @sql NVARCHAR(MAX) = '';
SELECT @sql = @sql + 'ALTER TABLE sto_requests DROP CONSTRAINT ' + fk.name + '; '
FROM sys.foreign_keys fk
INNER JOIN sys.objects ref ON fk.referenced_object_id = ref.object_id
WHERE fk.parent_object_id = OBJECT_ID('sto_requests')
  AND ref.name = 'app_users';
IF @sql <> '' EXEC(@sql);

-- 2. Allow user-ID columns to be NULL (no longer populated)
ALTER TABLE sto_requests ALTER COLUMN requestor_user_id           INT NULL;
ALTER TABLE sto_requests ALTER COLUMN planning_approved_by_user_id  INT NULL;
ALTER TABLE sto_requests ALTER COLUMN management_approved_by_user_id INT NULL;
ALTER TABLE sto_requests ALTER COLUMN finance_approved_by_user_id   INT NULL;

-- 3. Allow audit log's performed_by to be NULL (use performed_by_name instead)
ALTER TABLE sto_audit_log ALTER COLUMN performed_by INT NULL;

-- 4. Drop admin_audit_log (user management is now handled by AD)
IF OBJECT_ID('admin_audit_log', 'U') IS NOT NULL
    DROP TABLE admin_audit_log;

-- 5. Drop app_users (replaced by AD group membership)
IF OBJECT_ID('app_users', 'U') IS NOT NULL
    DROP TABLE app_users;
