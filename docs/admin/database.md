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
| 013 | `013_distressed_inventory.sql` | Distressed Inventory flag + value (`distressed_inventory`, `di_value`) |
| 014 | `014_sto_number_request.sql` | STO# request reminder (`sto_number_requested_at`) |
| 015 | `015_sto_attachments.sql` | STO attachments table (Certificate of Analysis, etc.) |
| 016 | `016_mbm_demo_users.sql` | MBM site demo users |
| 017 | `017_migration_tracking.sql` | Creates `schema_migrations`, a checklist table recording which migrations have run |
| 018 | `018_backfill_migration_history.sql` | One-time backfill: records 001-018 as applied in `schema_migrations` |
| 019 | `019_site_xyz_to_abs_rename.sql` | Renames site XYZ to ABS everywhere (sites, sto_requests, demo_users) and drops the retired `receiving_site` demo role |

!!! tip "Fresh vs existing database"
    All migrations 001-018 are safe to re-run — every `ALTER TABLE`,
    `CREATE TABLE`, and `CREATE INDEX` is guarded to no-op if already applied.
    On a **brand-new** database created from `schema.sql`, the schema already
    includes everything through 018 (using site code ABS, not XYZ) plus the
    `schema_migrations` table itself — just run
    `018_backfill_migration_history.sql` once to record history. **Skip 019** —
    a fresh install never had XYZ to rename.
    On an **existing** database, run any migrations you haven't yet, in order,
    including 019 if it still has site XYZ; re-running an already-applied one
    is harmless.

    To check what's already applied, once `schema_migrations` exists (017+):

    ```sql
    SELECT * FROM schema_migrations ORDER BY filename;
    ```

## Find your SQL Server name

You need the exact server name for the [`.env`](configuration.md). In SSMS, the top of
Object Explorer shows it, e.g. `SERVERNAME\SQLEXPRESS` or just `MYSERVER` for a default
instance.

## Set your real sites

The schema pre-loads placeholder sites (ABC, ABL, ABS, MBM). Replace them with yours:

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
