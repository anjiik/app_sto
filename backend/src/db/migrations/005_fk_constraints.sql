-- Migration 005: referential integrity constraints
-- Run after 003_app_users.sql (requires app_users and sites tables to exist)

-- app_users.site → sites.code
-- WITH NOCHECK so existing rows with site=NULL are not validated (NULL satisfies any FK)
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_app_users_site'
)
BEGIN
  ALTER TABLE app_users WITH NOCHECK
    ADD CONSTRAINT FK_app_users_site
    FOREIGN KEY (site) REFERENCES sites(code)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
END

-- sto_requests.requestor_user_id → app_users.id
-- Prevent deletion of a user who has created STOs
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_sto_requestor'
)
BEGIN
  ALTER TABLE sto_requests WITH NOCHECK
    ADD CONSTRAINT FK_sto_requestor
    FOREIGN KEY (requestor_user_id) REFERENCES app_users(id)
    ON DELETE NO ACTION;
END

-- sto_requests.*_approved_by_user_id → app_users.id (nullable columns)
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_sto_planning_approver'
)
BEGIN
  ALTER TABLE sto_requests WITH NOCHECK
    ADD CONSTRAINT FK_sto_planning_approver
    FOREIGN KEY (planning_approved_by_user_id) REFERENCES app_users(id)
    ON DELETE NO ACTION;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_sto_management_approver'
)
BEGIN
  ALTER TABLE sto_requests WITH NOCHECK
    ADD CONSTRAINT FK_sto_management_approver
    FOREIGN KEY (management_approved_by_user_id) REFERENCES app_users(id)
    ON DELETE NO ACTION;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_sto_finance_approver'
)
BEGIN
  ALTER TABLE sto_requests WITH NOCHECK
    ADD CONSTRAINT FK_sto_finance_approver
    FOREIGN KEY (finance_approved_by_user_id) REFERENCES app_users(id)
    ON DELETE NO ACTION;
END
