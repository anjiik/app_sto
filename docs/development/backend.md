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
| `/api/sto` | `routes/attachments.ts` | List/upload/download STO file attachments |
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

  !!! note "Use `hasRoleAtSite`, not `can`/`hasRole`, for workflow actions"
      `can`/`hasRole` check the role and the site as two *separate* questions — a
      user with `shipping_logistics@ABC` + `receiving_management@ABL` would pass
      `can(user, 'receiving_management')` even when acting on an ABC request.
      `hasRoleAtSite` requires role and site on the **same** grant, which is what
      every real approval endpoint in `routes/approvals.ts` uses. `can`/`hasRole`
      exist for the few checks that genuinely aren't site-scoped (e.g. `requireGroup`
      route guards).

  !!! note "`userGrants()`'s legacy-shape fallback is not dead code"
      It synthesizes a `Grant[]` from the older single `group`/`site` JWT fields when
      `grants` is absent. This isn't backward-compat cruft to remove — a token minted
      just before a deploy that adds/changes `grants` is still valid for up to 8 hours
      (the token TTL), and would fail authorization entirely without this fallback.

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

!!! note "`logAudit`'s optional `execute` param is what makes it atomic"
    `logAudit(..., execute?)` defaults to the plain `dbExecute` when called alone
    (e.g. on STO creation), but `routes/approvals.ts` passes the `execute` function
    `withTransaction` hands its callback — so the audit row commits in the **same
    transaction** as the status update. Don't split this into two functions; the
    single function with a swappable executor is what keeps a status change and its
    audit entry from ever landing independently of each other.

!!! note "`notify.ts` test mode defaults ON, not OFF"
    `TEST_MODE = process.env.NOTIFICATION_TEST_MODE !== 'false'` — unset, empty, or
    any value other than the literal string `'false'` keeps every notification
    (including requestor-facing ones) redirected to `NOTIFICATION_TEST_EMAIL`. This
    is deliberate, not a bug: no real per-role distribution list exists yet for the
    group-facing emails, so the safe default is "nothing real goes out" rather than
    "everything goes out except what someone forgot to configure." See
    [Configuration → Notifications](../admin/configuration.md#notifications).
