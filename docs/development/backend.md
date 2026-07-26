# Backend

Express + TypeScript API under `backend/src`. Compiled to `backend/dist` for
production.

## Layout

```text
backend/src/
  index.ts          app setup, middleware, route mounting, server start
  routes/           HTTP endpoints
  middleware/       auth (JWT + grants), rate limits
  lib/              ldap (AD login + GROUP_MAP), logger
  types/            shared types (Group, Grant, JwtPayload, STOStatus)
  db/               connection, schema.sql, migrations/, seed.ts, audit
```

## Routes

Mounted in `index.ts`:

| Mount | File | Purpose |
|-------|------|---------|
| `/api/auth` | `routes/auth.ts` | Login (AD or demo), `/me`, demo-user list |
| `/api/sto` | `routes/sto.ts` | STO CRUD, list/filter, KPIs, export, audit log |
| `/api/sto` | `routes/approvals.ts` | Workflow actions (submit, planning, logistics, management, receiving, revert, send-back) |
| `/api/analytics` | `routes/analytics.ts` | Aggregate charts data |
| `/api/sites` | `routes/sites.ts` | Site list |
| `/api/admin` | `routes/admin.ts` | Archive preview/run (admin only) |

## Authentication & authorization

- **`lib/ldap.ts`** — `authenticateWithAD` binds to AD and `resolveGrants` turns the
  user's group memberships into a `Grant[]` using `GROUP_MAP`. See
  [AD group mapping](../reference/ad-groups.md).
- **`routes/auth.ts`** — `issueToken` builds the JWT (grants + derived fields).
  `parseDemoGrants` handles demo-mode multi-role.
- **`middleware/auth.ts`** — the access helpers:
  - `authenticate` — verifies the JWT, sets `req.user`.
  - `can(user, ...roles)` — admin, or holds any of the roles anywhere.
  - `hasRole(user, role)` — holds the role (any site).
  - `hasRoleAtSite(user, role, site)` — holds the role **at that site** (the correct
    check for site-scoped actions).
  - `isAdmin`, `userSites`, `userHasSite`.

## Workflow guards

Each approval endpoint in `routes/approvals.ts` checks the current status and calls
`hasRoleAtSite` against the STO's relevant site (`shipping_site` for
planning/logistics/shipping-management; `receiving_site` for
receiving-management/receiving-logistics). Revert and send-back are admin-only.

## Conventions

- **Validation** with Zod on write endpoints.
- **Structured logging** via Pino (`lib/logger.ts`); the `[AD auth]` login
  diagnostics use `console.log`.
- **Rate limiting** and **Helmet** applied globally in `index.ts`.
- Every workflow action writes to the audit log (`db/audit.ts`).
