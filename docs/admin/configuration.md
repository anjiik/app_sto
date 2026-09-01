# Configuration (`.env`)

The backend reads all its configuration from `backend\.env`. This file is **never
committed to Git** — create it on each machine from the example:

```cmd
cd C:\sto-management\backend
copy .env.example .env
notepad .env
```

## Settings

```env
# Signs auth tokens. Generate a strong secret in PowerShell:
#   [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
JWT_SECRET=PASTE_A_GENERATED_SECRET_HERE

PORT=4000

# Logging — see "Logging" below.
NODE_ENV=production
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
# LOG_DIR=C:\sto-management\logs   # defaults to backend\logs

# The URL users open in their browser (after IIS is set up).
FRONTEND_ORIGIN=https://your-server-name.company.com

# SQL Server (from your SSMS Object Explorer)
DB_SERVER=MYSERVER\SQLEXPRESS
DB_DATABASE=sto_management
# ODBC driver installed on this machine — see "Find your SQL Server name" in
# database.md for how to list installed drivers.
DB_DRIVER=ODBC Driver 17 for SQL Server

# Management approval thresholds (USD)
MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD=100000
MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD=20000

# Auth mode — false uses Active Directory. true uses the demo_users table
# instead, and can be left true in production if AD login isn't set up yet or
# demo/test access is still needed there — see "Auth mode" below.
DEV_BYPASS=false

# Active Directory (ask IT for these; not read when DEV_BYPASS=true)
LDAP_URL=ldap://your-dc.company.com
LDAP_DOMAIN=company.com
LDAP_BASE_DN=DC=company,DC=com
# Read-only service account used to search AD
LDAP_BIND_DN=svc_sto_app@company.com
LDAP_BIND_PASSWORD=the_service_account_password

# Notification Relay — see "Notifications" below.
NOTIFICATION_TEST_MODE=true
NOTIFICATION_TEST_EMAIL=ABC123@gmail.com
NOTIFICATION_RELAY_URL=http://localhost:8080
NOTIFICATION_RELAY_USER=svc-sto-app
NOTIFICATION_RELAY_PASSWORD=change-this
```

!!! warning "Production settings"
    - Never reuse the example `JWT_SECRET` — generate a fresh one.
    - `DEV_BYPASS` does **not** need to be `false` in production — see "Auth mode" below.

## Auth mode

`DEV_BYPASS=false` makes login validate against Active Directory via LDAP — the
normal production setting once AD groups are configured (see
[Active Directory](active-directory.md)).

`DEV_BYPASS=true` makes login validate against the `demo_users` table instead
(populated by `npm run seed`). This is normally a dev/test setting, but it is
intentionally kept available in production too — it lets someone test the app
on the production server (e.g. before AD is fully wired up, or to reproduce an
issue) without needing an AD account. The app does not warn or block on any
combination of `NODE_ENV` and `DEV_BYPASS` — it is an explicit, permanent
toggle, not something to "remember to turn off."

## Logging

Logs are always written to a plain-text file, one per calendar day
(`app-YYYY-MM-DD.log`), so they survive when the app runs as a Windows service
and stdout is discarded. Only failed HTTP requests (4xx/5xx) and real errors
are logged — successful requests produce no output.

- `LOG_LEVEL` — pino level (`info`, `warn`, `error`, ...).
- `LOG_DIR` — absolute, writable path for the service. Defaults to
  `backend\logs` if unset.
- `LOG_RETENTION_DAYS` — how many days of log files to keep; older files are
  deleted at startup.

## Notifications

If `NOTIFICATION_RELAY_URL`/`USER`/`PASSWORD` are set, the app calls the
notification_relay service to email STO event notifications. Leave them blank
to disable email notifications entirely.

`NOTIFICATION_TEST_MODE` defaults **on** (missing/unset = test mode) — every
notification, including requestor-facing ones, is redirected to
`NOTIFICATION_TEST_EMAIL` instead of the real recipient. This is the
deliberate current production setting: no real distribution list exists yet
for the group-facing emails, so everything stays on the test address as one
toggle rather than mixing real and test recipients. Set
`NOTIFICATION_TEST_MODE=false` once ready to send for real.

## Threshold precedence

The two `MANAGEMENT_APPROVAL_*` values override the built-in defaults ($100,000 /
$20,000). The `sto_config` table is **not** consulted — see
[Approval rules](../reference/approval-rules.md).

Next: [Build & first run](build-run.md).
