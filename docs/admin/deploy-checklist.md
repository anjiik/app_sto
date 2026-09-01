# Deployment checklist (all steps, in order)

A single top-to-bottom script for a fresh production install. Each step links to the
full page with more detail, edge cases, and troubleshooting — use this page to execute,
use those pages when something doesn't go as expected.

Target: a Windows Server with IIS in front of a Node.js backend (via PM2) and SQL
Server, authenticating against Active Directory.

## 1. Install prerequisites

On the Windows server, in order:

- **Node.js 20 LTS** — on the "Tools for Native Modules" installer screen, tick
  **"Automatically install the necessary tools"** (needed to compile the SQL Server
  driver). Verify: `node --version`.
- **Microsoft ODBC Driver 17 for SQL Server** — default install, no reboot.
- **Git** — default install.
- **PM2**, as Administrator:
  ```cmd
  npm install -g pm2
  npm install -g pm2-windows-startup
  ```

Get the code onto the server:

```cmd
cd C:\
git clone https://github.com/anjiik/app_sto.git sto-management
cd sto-management
```

Full detail: [Prerequisites](prerequisites.md).

## 2. Create the database

In SSMS, connected to your SQL Server instance:

```sql
CREATE DATABASE sto_management;
```

Switch context to it (`USE sto_management;`), then open
`backend\src\db\schema.sql`, paste its contents, and **Execute**. This creates every
table, index, the STO-number sequence, and the placeholder `sites` rows — a fresh
install does **not** need any migration files run afterward, only
`018_backfill_migration_history.sql` once, to record migration history for the
tracking table:

```sql
-- After schema.sql, run this one file (it's a no-op history record, not a schema change):
-- backend\src\db\migrations\018_backfill_migration_history.sql
```

Replace the placeholder sites with your real ones:

```sql
DELETE FROM sites;
INSERT INTO sites (code, name) VALUES
  ('SITE1', 'Your First Site Name'),
  ('SITE2', 'Your Second Site Name');
```

Note the site codes — they must match the `{SITE}` prefix in your AD group names
(step 3).

Full detail: [Database & migrations](database.md).

## 3. Set up Active Directory groups

Ask your directory team to create, per site, plus one company-wide group:

```text
APP-{SITE}-STO_Management_Planning
APP-{SITE}-STO_Management_Logistics
APP-{SITE}-STO_Management_Logistics_Receiving
APP-{SITE}-STO_Management_Management
APP-{SITE}-STO_Management_Management_Receiving

APP-STO_MANAGEMENT_ADMIN   (company-wide, one group total)
```

There is no per-site admin group and no group for creating an STO — any signed-in
user can create one.

If the real names differ from this pattern, edit `GROUP_MAP` in
`backend/src/lib/ldap.ts` to match exactly (case-insensitive, otherwise exact), then
rebuild in step 5.

Full detail: [Active Directory groups](active-directory.md).

## 4. Configure the backend `.env`

```cmd
cd C:\sto-management\backend
copy .env.example .env
notepad .env
```

Minimum required for production:

```env
JWT_SECRET=<generate a fresh secret — see comment in .env.example, never reuse the placeholder>
PORT=4000
NODE_ENV=production

FRONTEND_ORIGIN=https://your-server-name.company.com

DB_SERVER=YOUR_SQL_SERVER\INSTANCE
DB_DATABASE=sto_management
DB_DRIVER=ODBC Driver 17 for SQL Server

DEV_BYPASS=false

LDAP_URL=ldap://your-dc.company.com
LDAP_DOMAIN=company.com
LDAP_BASE_DN=DC=company,DC=com
LDAP_BIND_DN=svc_sto_app@company.com
LDAP_BIND_PASSWORD=<the service account password>
```

`DEV_BYPASS=false` is the normal production setting (AD login). `DEV_BYPASS=true` is
also valid in production if you deliberately want demo/test access kept available —
it is not something the app warns about or blocks.

Leave `NOTIFICATION_RELAY_URL`/`USER`/`PASSWORD` blank to disable email notifications
entirely, or fill them in to enable them (they default to test-mode-on — see
[Configuration → Notifications](configuration.md#notifications) before turning that
off).

Full detail, every variable: [Configuration](configuration.md).

## 5. Build

```cmd
cd C:\sto-management\backend
npm install
npm run build
```

```cmd
cd C:\sto-management\frontend
npm install
set VITE_API_URL=https://your-server-name.company.com/api
npm run build
```

Sanity-check the backend before wiring up PM2/IIS:

```cmd
cd C:\sto-management\backend
node dist/index.js
```

Visit `http://localhost:4000/api/health` — `{"status":"ok"}` means it started and can
reach SQL Server. `Ctrl+C` to stop once confirmed.

Full detail: [Build & first run](build-run.md).

## 6. Register the PM2 service

```cmd
cd C:\sto-management\backend
pm2 start dist/index.js --name sto-backend
pm2 save
pm2-windows-startup install
```

Verify `pm2 list` shows `sto-backend` as `online`.

Full detail: [PM2 Windows service](pm2.md).

## 7. Configure IIS

Install IIS + the **URL Rewrite Module** + **Application Request Routing (ARR)**
(enable proxy in ARR's Server Proxy Settings after installing).

Point the site's physical path at `C:\sto-management\frontend\dist`, install an HTTPS
certificate and bind it, then create `frontend\dist\web.config` with the API-proxy and
SPA-fallback rewrite rules (see the full page for the exact XML), then:

```cmd
iisreset
```

Full detail, including the `web.config` contents: [IIS reverse proxy](iis.md).

## 8. Lock down the firewall

Block direct external access to port 4000 (the Node backend) — all traffic should go
through IIS on 80/443. Add a Windows Firewall inbound rule blocking TCP 4000; 80/443
normally already have allow rules from the IIS install.

Full detail: [Firewall](firewall.md).

## 9. Go-live checklist

Work through [Go-live checklist](go-live.md) before opening the app to users — it
covers final verification of `.env`, AD groups, the built services, IIS, and a smoke
test through the full STO workflow (create → planning → logistics → management if
triggered → receiving → closed).

## Updating after this, later

```cmd
cd C:\sto-management
git pull
cd backend && npm install && npm run build
cd ..\frontend && npm install && npm run build
pm2 restart sto-backend
```

The running service uses the compiled `dist\` output — a source change (including
editing `GROUP_MAP`) has no effect until rebuilt and restarted.
