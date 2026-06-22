-- Migration 003: sites table + app_users table
-- Safe to run against an existing database — every statement is idempotent.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'sites')
BEGIN
  CREATE TABLE sites (
      id    INT          PRIMARY KEY IDENTITY(1,1),
      code  VARCHAR(50)  UNIQUE NOT NULL,
      name  VARCHAR(200) NOT NULL
  );

  INSERT INTO sites (code, name) VALUES
      ('ABC', 'Site ABC'),
      ('ABL', 'Site ABL'),
      ('XYZ', 'Site XYZ');

  PRINT 'Created sites table and seeded 3 rows.';
END
ELSE
  PRINT 'sites table already exists — skipped.';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'app_users')
BEGIN
  CREATE TABLE app_users (
      id            INT          PRIMARY KEY IDENTITY(1,1),
      ad_username   VARCHAR(200) NOT NULL,
      display_name  VARCHAR(200) NOT NULL,
      email         VARCHAR(200) NULL,
      site          VARCHAR(50)  NULL,
      app_group     VARCHAR(50)  NOT NULL DEFAULT 'receiving_site',
      is_active     BIT          NOT NULL DEFAULT 1,
      created_at    DATETIME     DEFAULT GETDATE(),
      updated_at    DATETIME     DEFAULT GETDATE()
  );

  CREATE UNIQUE INDEX UQ_app_users_username ON app_users (ad_username);

  PRINT 'Created app_users table.';
END
ELSE
  PRINT 'app_users table already exists — skipped.';

-- After running this migration, promote your first admin account:
-- UPDATE app_users SET app_group = 'admin' WHERE ad_username = 'firstname.lastname@company.com';
