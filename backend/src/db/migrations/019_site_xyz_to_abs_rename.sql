-- Migration 019: Rename site XYZ to ABS; retire the receiving_site demo role
--
-- XYZ was a placeholder site code; the real site uses code ABS. This renames
-- it in place everywhere a site code is stored, rather than adding ABS as a
-- new/separate site alongside XYZ.
--
-- It also removes demo_users rows seeded with group_key = 'receiving_site' —
-- that role no longer exists (creating an STO now requires no specific role,
-- see backend/src/lib/ldap.ts GROUP_MAP and backend/src/routes/sto.ts POST /).
-- migration 016 seeded one such row (mbm.recv); this cleans it up along with
-- any other receiving_site row from earlier seed runs.
--
-- Safe to re-run: every statement only touches rows that still need it.

UPDATE sites SET code = 'ABS', name = 'Site ABS' WHERE code = 'XYZ';

UPDATE sto_requests SET requesting_plant = 'ABS' WHERE requesting_plant = 'XYZ';
UPDATE sto_requests SET shipping_site = 'ABS' WHERE shipping_site = 'XYZ';
UPDATE sto_requests SET receiving_site = 'ABS' WHERE receiving_site = 'XYZ';

UPDATE demo_users SET site = 'ABS' WHERE site = 'XYZ';
UPDATE demo_users SET username = REPLACE(username, 'xyz.', 'abs.') WHERE username LIKE 'xyz.%';
UPDATE demo_users SET grants = REPLACE(grants, '@XYZ', '@ABS') WHERE grants LIKE '%@XYZ%';

DELETE FROM demo_users WHERE group_key = 'receiving_site';

-- Self-registers in schema_migrations (which exists as of 017) — this is the
-- first migration written after that table, so new migrations record
-- themselves going forward instead of relying on a backfill script.
IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '019_site_xyz_to_abs_rename.sql')
  INSERT INTO schema_migrations (filename) VALUES ('019_site_xyz_to_abs_rename.sql');
