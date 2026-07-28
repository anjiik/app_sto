# Development

For developers working on the codebase.

- [Architecture](architecture.md) — how the pieces fit and the request lifecycle
- [Backend](backend.md) — routes, auth, and the grant-aware access helpers
- [Frontend](frontend.md) — pages, routing, and UI access checks
- [Database](database.md) — schema, migrations, and tables
- [Conventions](conventions.md) — code style and consistency rules

## Stack

- **Frontend** — React 18, TypeScript, Vite, Tailwind CSS, React Router, Recharts.
  Served under the `/sto/` base path.
- **Backend** — Node.js (≥ 20), Express, TypeScript. Pino logging, Helmet,
  express-rate-limit, Zod validation.
- **Database** — SQL Server.

## Local setup

See the project README quick start, or in short:

```bash
# backend
cd backend && cp .env.example .env && npm install && npm run seed && npm run dev
# frontend
cd frontend && npm install && npm run dev
```

Set `DEV_BYPASS=true` in `backend/.env` to use the [demo users](../reference/demo-users.md).

## Layout

```text
backend/src/
  routes/        auth, sto, approvals, analytics, admin, sites
  lib/ldap.ts    AD group → role/site mapping (GROUP_MAP) + login
  middleware/    JWT auth + grant-aware access helpers
  types/         shared types (Group, Grant, JwtPayload, STOStatus)
  db/            schema.sql, migrations/, seed.ts
frontend/src/
  pages/         Dashboard, STOList, STOForm, STODetail, Analytics, AppInfo, Login
  lib/grants.ts  grant-aware role checks (mirrors the backend)
  context/       auth context
```

## The access model in code

Authorization is expressed as **grants** (`{role, site}` pairs). The key pieces:

- **`backend/src/middleware/auth.ts`** — `can`, `hasRole`, `hasRoleAtSite`,
  `isAdmin`, `userSites`. Site-scoped actions use `hasRoleAtSite` so role and site
  are checked on the same grant.
- **`backend/src/lib/ldap.ts`** — `resolveGrants` turns AD group memberships into a
  `Grant[]`.
- **`frontend/src/lib/grants.ts`** — mirrors the backend helpers for UI gating.

See [Reference → Roles & access](../reference/roles.md) for the model itself.

## Database changes

Schema lives in `backend/src/db/schema.sql`; incremental changes are numbered
migrations in `backend/src/db/migrations/`. `backend/src/db/seed.ts` populates demo
data (dev only).

## Build

```bash
cd backend && npm run build      # → backend/dist
cd frontend && npm run build     # → frontend/dist (static, served by IIS)
```
