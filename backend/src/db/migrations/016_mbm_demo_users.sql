-- Migration 016: MBM demo users (dev/demo mode only, DEV_BYPASS=true)
-- Adds the MBM site to the sites table (it was only present in the frontend's
-- SITES dropdown, not seeded anywhere in the backend) and adds one demo user
-- per role for MBM, matching the existing ABC/ABL/XYZ pattern.
--
-- All users share the password Demo123! (same as every other demo user).
-- The hash below was generated with this project's own bcryptjs (cost 10):
--   node -e "require('bcryptjs').hash('Demo123!', 10).then(console.log)"
--
-- Safe to re-run: guarded by NOT EXISTS checks.

IF NOT EXISTS (SELECT 1 FROM sites WHERE code = 'MBM')
  INSERT INTO sites (code, name) VALUES ('MBM', 'Site MBM');

IF NOT EXISTS (SELECT 1 FROM demo_users WHERE username = 'mbm.recv')
  INSERT INTO demo_users (username, password_hash, display_name, site, group_key)
  VALUES ('mbm.recv', '$2a$10$d6mcosI5cOploQD/HgX2dOYuCQEoNYLABrS0asvL9fjAcAZ.Kw0Qu', 'Olivia Bennett', 'MBM', 'receiving_site');

IF NOT EXISTS (SELECT 1 FROM demo_users WHERE username = 'mbm.plan')
  INSERT INTO demo_users (username, password_hash, display_name, site, group_key)
  VALUES ('mbm.plan', '$2a$10$d6mcosI5cOploQD/HgX2dOYuCQEoNYLABrS0asvL9fjAcAZ.Kw0Qu', 'Marcus Ellery', 'MBM', 'shipping_planning');

IF NOT EXISTS (SELECT 1 FROM demo_users WHERE username = 'mbm.slog')
  INSERT INTO demo_users (username, password_hash, display_name, site, group_key)
  VALUES ('mbm.slog', '$2a$10$d6mcosI5cOploQD/HgX2dOYuCQEoNYLABrS0asvL9fjAcAZ.Kw0Qu', 'Priya Deshmukh', 'MBM', 'shipping_logistics');

IF NOT EXISTS (SELECT 1 FROM demo_users WHERE username = 'mbm.mgmt')
  INSERT INTO demo_users (username, password_hash, display_name, site, group_key)
  VALUES ('mbm.mgmt', '$2a$10$d6mcosI5cOploQD/HgX2dOYuCQEoNYLABrS0asvL9fjAcAZ.Kw0Qu', 'Derek Holloway', 'MBM', 'management');

IF NOT EXISTS (SELECT 1 FROM demo_users WHERE username = 'mbm.rmgmt')
  INSERT INTO demo_users (username, password_hash, display_name, site, group_key)
  VALUES ('mbm.rmgmt', '$2a$10$d6mcosI5cOploQD/HgX2dOYuCQEoNYLABrS0asvL9fjAcAZ.Kw0Qu', 'Naomi Castillo', 'MBM', 'receiving_management');

IF NOT EXISTS (SELECT 1 FROM demo_users WHERE username = 'mbm.rlog')
  INSERT INTO demo_users (username, password_hash, display_name, site, group_key)
  VALUES ('mbm.rlog', '$2a$10$d6mcosI5cOploQD/HgX2dOYuCQEoNYLABrS0asvL9fjAcAZ.Kw0Qu', 'Felix Andersson', 'MBM', 'receiving_logistics');
