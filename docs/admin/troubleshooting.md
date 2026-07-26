# Troubleshooting

## Backend won't start

Run it in the foreground to see the error:

```cmd
cd C:\sto-management\backend
node dist/index.js
```

- **Missing `.env` / bad value** — the log names the missing setting. See
  [Configuration](configuration.md).
- **Can't reach SQL Server** — `/api/health` returns `{"status":"error"}`. Check
  `DB_SERVER` and that the ODBC Driver 17 is installed.

## Health check

```
http://localhost:4000/api/health
```

- `{"status":"ok"}` — backend up and database reachable.
- `{"status":"error"}` — up but database unreachable.

## "Your account is not in any STO application group"

This means the login succeeded against AD but **none of the user's groups matched
`GROUP_MAP`**. The login code prints diagnostics to the backend log — view them with:

```cmd
pm2 logs sto-backend
```

On each attempt it logs:

```text
[AD auth] raw memberOf entries: <n>
[AD auth] CNs: <group1> | <group2> | ...
[AD auth]   [i] raw="..." cn="..." upper="..." match=<true|false>
[AD auth] GROUP_MAP keys: <all configured keys>
```

Diagnose from the `CNs` line:

| What you see | Cause | Fix |
|--------------|-------|-----|
| `CNs: (none)` | AD returned no groups | Check the user's AD membership; verify the LDAP search can read `memberOf` (bind account permissions, base DN). |
| Expected group missing from the list | User isn't in it, or it was renamed in AD | Correct the AD membership, or align the name. |
| Group listed but `match=false` | The CN doesn't equal any `GROUP_MAP` key | Fix the spelling/hyphen/whitespace so the `GROUP_MAP` key matches the real CN exactly. |
| No `[AD auth]` lines at all | Running service is stale | Rebuild (`npm run build`) and `pm2 restart sto-backend`. |

!!! warning "Rebuild after editing GROUP_MAP"
    Editing `GROUP_MAP` in the source has no effect until you `npm run build` and
    restart the service — the running process uses the compiled `dist/lib/ldap.js`.

See also [Reference → AD group mapping](../reference/ad-groups.md).

## A user has the wrong role or can't act at a site

- Confirm which groups they're actually in (the `[AD auth] CNs` line, or
  `whoami /groups` on their machine).
- Remember roles are **per-site**: acting at a site requires the matching role group
  for that site. See [Roles & access](../reference/roles.md).
- `admin` is company-wide; every other role is site-scoped.

## A closed STO needs reopening

Closing is terminal for normal users. An admin can use **revert** / **send back** to
move it back a step — see [Admin tasks](../user-guide/admin-tasks.md).

## Login works but the browser shows a generic error

The API returns a deliberately generic message on auth failure. The **real** reason is
always in the backend log (`pm2 logs sto-backend`, lines starting `[AD auth]`).
