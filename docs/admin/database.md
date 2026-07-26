# Database & migrations

## Create the database

In SQL Server Management Studio (SSMS), connected to your instance:

```sql
CREATE DATABASE sto_management;
```

## Run the schema

1. Switch the query context to `sto_management` (`USE sto_management;`).
2. Open `backend\src\db\schema.sql`, paste its contents, and **Execute**.

This creates the tables, indexes, the STO-number sequence, and the `sites` table with
initial site codes.

!!! note "Check it worked"
    In Object Explorer, expand `sto_management → Tables`. You should see
    `sto_requests`, `sto_audit_log`, `sites`, `demo_users`, and `sto_config`.

## Run the migrations

Run each file in `backend\src\db\migrations\` **in order**, against `sto_management`:

| # | File | Purpose |
|---|------|---------|
| 001 | `001_performance.sql` | Performance indexes |
| 003 | `003_app_users.sql` | (legacy) app_users table |
| 004 | `004_admin_audit.sql` | Admin action auditing |
| 005 | `005_fk_constraints.sql` | Foreign-key constraints |
| 006 | `006_remove_app_users.sql` | Removes app_users (roles come from AD now) |
| 007 | `007_receiving_mgmt_approval.sql` | Dual (shipping + receiving) management approval |
| 008 | `008_archive.sql` | Soft-archive support |
| 009 | `009_nullable_requestor_user_id.sql` | Allow null requestor user id |
| 010 | `010_reset_sto_sequence.sql` | Reset the STO-number sequence |
| 011 | `011_form_overhaul.sql` | Form/workflow overhaul columns |
| 012 | `012_demo_user_grants.sql` | Multi-role demo users (`grants` column) |

!!! tip "Fresh vs existing database"
    On a **brand-new** database, run all of them in order — each is safe. On an
    **existing** database, check whether a column already exists before re-running a
    migration, e.g.:

    ```sql
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'demo_users' AND COLUMN_NAME = 'grants';
    ```
    If a row is returned, that migration is already applied — skip it.

## Find your SQL Server name

You need the exact server name for the [`.env`](configuration.md). In SSMS, the top of
Object Explorer shows it, e.g. `SERVERNAME\SQLEXPRESS` or just `MYSERVER` for a default
instance.

## Set your real sites

The schema pre-loads placeholder sites (ABC, ABL, XYZ). Replace them with yours:

```sql
USE sto_management;
DELETE FROM sites;
INSERT INTO sites (code, name) VALUES
  ('SITE1', 'Your First Site Name'),
  ('SITE2', 'Your Second Site Name');
```

Use the same short codes here as the site prefix in your
[AD groups](active-directory.md).

!!! note "Seeding demo data (dev only)"
    `npm run seed` populates `demo_users` and sample STOs for local/demo testing. It
    is **not** used in production, where login is via Active Directory.

!!! warning "`sto_config` is unused"
    The schema creates an `sto_config` table with threshold values, but the
    application does not read it — the [approval thresholds](../reference/approval-rules.md)
    come from environment variables (or the built-in defaults). Setting `sto_config`
    has no effect.
