# Conventions

How code is written and kept consistent in this repo. Mechanical formatting is
handled by tooling; the rest is convention.

## Formatting is automated

Formatting is **not** something to memorise — it's enforced by
[Prettier](https://prettier.io/) and [EditorConfig](https://editorconfig.org/).

- **`.editorconfig`** (repo root) — whitespace basics (2-space indent, LF line
  endings, trailing-newline, UTF-8). Most editors apply it automatically.
- **`.prettierrc.json`** (repo root) — single quotes, semicolons, 100-column width,
  trailing commas. Applies to both `backend` and `frontend`.

Run it before committing:

```bash
# in backend/ or frontend/
npm run format         # rewrite files to the standard
npm run format:check   # verify without changing (use in review/CI)
```

Prettier is the source of truth for formatting — don't hand-format or argue style in
review; run `npm run format`.

## TypeScript

- **Strict, typed.** Both projects compile with `tsc`; keep them error-free
  (`npm run build` / `tsc --noEmit`).
- **Shared types live in `types/`** (`Group`, `Grant`, `JwtPayload`, `STOStatus`).
  The frontend mirrors the backend types — keep them in sync when either changes.
- Prefer explicit return types on exported functions.

## Backend

- **Keep route handlers thin.** Validate input (Zod), authorise, do the work, respond.
  Push shared logic into `lib/` or `middleware/`.
- **Authorise with the grant helpers, never raw role fields.** Use `can`, `hasRole`,
  `hasRoleAtSite`, `isAdmin` from `middleware/auth.ts`. For any **site-scoped** action,
  use `hasRoleAtSite(user, role, site)` so role and site are checked on the same grant.
- **AD group mapping has one home:** `GROUP_MAP` in `lib/ldap.ts`. Don't add a second
  mapping elsewhere.
- **Every workflow action writes an audit entry** (`db/audit.ts`).
- Log with Pino (`lib/logger.ts`).

## Frontend

- **Gate UI with `lib/grants.ts`, not raw `user.group`.** Those helpers mirror the
  backend so multi-role users behave correctly. Reading the derived `user.group` for a
  display-only badge is fine; using it to gate an action is not.
- One page component per screen under `pages/`; shared pieces under `components/`.
- API calls go through the shared axios client (`api/client.ts`), which attaches the
  auth token.

## Database

- Schema changes are **numbered migrations** in `backend/src/db/migrations/`
  (next number in sequence), each safe to run once on an existing database.
- Also update `schema.sql` so fresh installs match, and `seed.ts` if seeding is
  affected. See [Database](database.md).

## Git

- **Branch** off `main` for changes; don't commit straight to `main`.
- **Commit messages:** a concise imperative subject line (e.g. "Add INCO terms
  dropdown"), with a body explaining the *why* when it isn't obvious.
- Run `npm run format:check` and `tsc` (both projects) before opening a PR.
