# Administration

For administrators and IT: deploying, running, and troubleshooting the app.

**Doing a fresh install?** Follow the [Deployment checklist](deploy-checklist.md) — one
linear page covering every step below in order, with commands to copy/paste. The pages
listed here have the full detail behind each step; use them when the checklist isn't
enough or something goes wrong:

1. [Prerequisites](prerequisites.md)
2. [Database & migrations](database.md)
3. [Active Directory groups](active-directory.md)
4. [Configuration (.env)](configuration.md)
5. [Build & first run](build-run.md)
6. [PM2 Windows service](pm2.md)
7. [IIS reverse proxy](iis.md) — also covers serving these docs at `/sto/docs`
8. [Firewall](firewall.md)
9. [Go-live checklist](go-live.md)

For diagnosing problems (including AD login), see [Troubleshooting](troubleshooting.md).

## Production topology

- **IIS** terminates HTTPS and acts as a reverse proxy, serving the app under
  `/sto/`. `/api/*` is proxied to the backend; everything else is served as the SPA.
- **Node.js backend** (≥ 20) runs under **PM2** as a Windows service, listening on
  port 4000 (not exposed externally).
- **SQL Server** is the database, using Windows Authentication.
- **Active Directory / LDAP** provides authentication and role/site assignment.

## Configuration

Backend configuration is in `backend/.env`. Key settings:

| Variable | Purpose |
|----------|---------|
| `DEV_BYPASS` | `false` for AD login (production); `true` for the demo-user table |
| `DB_*` | SQL Server connection |
| `LDAP_URL`, `LDAP_DOMAIN`, `LDAP_BASE_DN` | Active Directory connection |
| `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD` | Service account for AD search |
| `MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD` | Overrides the $100,000 default |
| `MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD` | Overrides the $20,000 default |
| `JWT_SECRET` | Signs auth tokens |

## Deploying a change

The service runs the compiled `dist/` output, so source changes require a rebuild:

```bash
cd backend
npm install          # if dependencies changed
npm run build        # compile TypeScript to dist/
pm2 restart sto-backend
```

For the frontend, `npm run build` in `frontend/` produces the static site that IIS
serves.

## Active Directory groups

Roles and sites are assigned by AD group membership. The mapping lives in
`GROUP_MAP` in `backend/src/lib/ldap.ts` — see
[Reference → AD group mapping](../reference/ad-groups.md) for the table and the rules
for adding or renaming a group.

## Troubleshooting AD login

If a user sees **"Your account is not in any STO application group,"** the login code
logs diagnostics to the backend console (visible via `pm2 logs sto-backend`). On each
attempt it prints:

```text
[AD auth] raw memberOf entries: <n>
[AD auth] CNs: <group1> | <group2> | ...
[AD auth]   [i] raw="..." cn="..." upper="..." match=<true|false>
[AD auth] GROUP_MAP keys: <all configured keys>
```

Read it as follows:

- **`CNs:` is `(none)`** — AD returned no groups for the user (membership issue, or
  the LDAP search cannot read `memberOf`).
- **The expected group is missing from the CN list** — the user is not in it, or the
  group was renamed in AD.
- **The group is listed but `match=false`** — the CN does not equal any `GROUP_MAP`
  key. Check for a spelling/hyphen/whitespace difference and align the key.
- **No `[AD auth]` lines appear at all** — the running service is stale; confirm it
  was rebuilt (`npm run build`) and restarted after the last change.

!!! warning "Rebuild after editing GROUP_MAP"
    Editing `GROUP_MAP` in the source has no effect until you `npm run build` and
    restart the service — the running process uses the compiled `dist/lib/ldap.js`.

## Data archiving

Admins can archive old, closed STOs to keep the working set fast. This is available
from the admin tools (preview the count, then run the archive). Archived records are
retained but excluded from normal lists.

## Administrator corrections

Admins can move an STO backward with **revert** (one step) or **send back** (one step
with a mandatory reason). Both are recorded in the audit trail. See
[Approval workflow](../reference/workflow.md#admin-corrections).
