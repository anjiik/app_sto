-- 012_demo_user_grants.sql
-- Multi-role demo users: add a `grants` column to demo_users holding a
-- semicolon-separated list of `role@site` pairs, e.g.
--   "shipping_logistics@ABC;receiving_logistics@ABC;shipping_planning@ABL"
-- When NULL/blank, login falls back to the legacy single group_key expanded
-- across the (possibly comma-separated) `site` column, so existing rows keep
-- working unchanged. Production (AD) auth does not use this table.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('demo_users') AND name = 'grants'
)
BEGIN
    ALTER TABLE demo_users ADD grants VARCHAR(500) NULL;
END
GO
