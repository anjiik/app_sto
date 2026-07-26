# Frontend

React + Vite SPA under `frontend/src`, served under the `/sto/` base path
(`vite.config.ts`).

## Layout

```text
frontend/src/
  main.tsx        entry
  App.tsx         routes
  api/client.ts   axios instance (adds the Bearer token)
  context/        AuthContext (current user + login/logout)
  lib/grants.ts   grant-aware role checks (mirrors the backend)
  components/     Layout, StatusBadge, …
  pages/          one per screen
```

## Routes

Defined in `App.tsx`:

| Path | Page | Notes |
|------|------|-------|
| `/login` | Login | Public; lists demo accounts in dev |
| `/dashboard` | Dashboard | Per-role action queues |
| `/sto` | STOList | List, filters, export |
| `/sto/new` | STOForm | Create |
| `/sto/:id` | STODetail | View + workflow actions |
| `/sto/:id/edit` | STOForm | Edit draft |
| `/analytics` | Analytics | Charts |
| `/app-info` | AppInfo | Guide + access info |

## Access checks in the UI

`lib/grants.ts` mirrors the backend helpers — `isAdmin`, `hasRole`, `hasRoleAtSite`,
`userSites`, `sitesForRole`, `userRoles`. Pages use these (not raw `user.group`) so
multi-role users are handled correctly:

- **Dashboard** renders one queue section per role the user holds, each scoped to that
  role's sites (`sitesForRole`).
- **STODetail** shows the action panel for a step only when the user holds the right
  role at that STO's site (`hasRoleAtSite`), or is an admin.
- **Layout** gates the "New Request" link to requestors/admins.

Display-only badges may read the derived `user.group` (primary role); that's fine
because it's not used for gating.

## Auth flow

`AuthContext` stores the user returned from `/api/auth/login` and refreshes from
`/api/auth/me`. The axios client (`api/client.ts`) attaches the JWT to every request.

## Build

```bash
cd frontend
set VITE_API_URL=https://<host>/api   # production
npm run build                          # → frontend/dist (served by IIS)
```
