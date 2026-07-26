# Database

SQL Server, accessed via `msnodesqlv8` with Windows Authentication. Schema and
changes live under `backend/src/db`.

## Files

- **`schema.sql`** — full schema for a fresh database (tables, indexes, the
  STO-number sequence, and initial `sites`).
- **`migrations/`** — numbered, incremental changes (001–012). Apply in order; see
  [Admin → Database & migrations](../admin/database.md).
- **`seed.ts`** — demo users + sample STOs for dev (`npm run seed`). Not used in
  production.
- **`connection.ts`**, **`audit.ts`** — pooled query helpers and the audit-log writer.

## Core tables

| Table | Purpose |
|-------|---------|
| `sto_requests` | The STOs and all their fields, including workflow status and approval flags |
| `sto_audit_log` | Timestamped record of every action on an STO |
| `sites` | Valid site codes |
| `demo_users` | Demo-mode accounts (dev only); `grants` column supports multi-role |
| `sto_config` | **Present but unused** — see note below |

!!! warning "`sto_config` is not read"
    The `sto_config` table exists in the schema with threshold values, but the
    application reads thresholds from environment variables (or defaults) instead. It
    is a candidate for removal; do not rely on it. See
    [Approval rules](../reference/approval-rules.md).

!!! note "`app_users` removed"
    An `app_users` table existed in early versions but was removed by migration 006 —
    roles and sites come from Active Directory (production) or `demo_users` (dev), not
    from a users table.

## Status values

`sto_requests.status` uses the `STOStatus` set: `DRAFT`, `PLANNING_REVIEW`,
`SHIPPING_LOGISTICS`, `MANAGEMENT_REVIEW`, `RECEIVING_MGMT_REVIEW`,
`RECEIVING_LOGISTICS`, `CLOSED`, `REJECTED`. There is no `FINANCE_REVIEW`. See
[Approval workflow](../reference/workflow.md).

## Making a schema change

1. Add a new numbered file in `migrations/` (e.g. `013_*.sql`), written to be safe to
   run once on an existing database.
2. Update `schema.sql` so fresh installs get the same result.
3. If it affects seeding, update `seed.ts`.
