# STO Management — Deployment Guide

Step-by-step instructions for transferring and running the app on a new Windows machine.

> **Target**: A domain-joined Windows Server (2016 / 2019 / 2022) or Windows 10/11 Pro  
> **Time**: ~45–60 minutes first time  
> **You will need**: Admin rights on the machine, access to SQL Server, AD credentials from IT

---

## Table of Contents

1. [Prerequisites — install these first](#1-prerequisites)
2. [Get the code onto the machine](#2-get-the-code)
3. [Create the database and run the schema](#3-database-setup)
4. [Set up Active Directory groups](#4-active-directory-groups)
5. [Configure the environment file](#5-configure-env)
6. [Install dependencies and build](#6-install-and-build)
7. [Run the app and verify it works](#7-first-run-and-verify)
8. [Set up PM2 as a Windows service](#8-pm2-windows-service)
9. [Set up IIS as a reverse proxy with HTTPS](#9-iis-reverse-proxy)
10. [Windows Firewall](#10-windows-firewall)
11. [Go live — final checklist](#11-go-live-checklist)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Install these in order. Each has a simple Windows installer — download, run, click Next.

### Node.js (v20 LTS)

1. Go to [https://nodejs.org](https://nodejs.org) and download the **LTS** version (20.x)
2. Run the installer — accept all defaults
3. **Important**: on the "Tools for Native Modules" screen, tick **"Automatically install necessary tools"** — this installs Python and Visual Studio Build Tools which `msnodesqlv8` needs to compile
4. Let it finish (it opens a PowerShell window — wait for it to close on its own)
5. Verify in a new Command Prompt:
   ```
   node --version
   npm --version
   ```
   Both should print a version number.

### SQL Server ODBC Driver 17

`msnodesqlv8` (our SQL Server driver) requires this.

1. Download **"Microsoft ODBC Driver 17 for SQL Server"** from Microsoft's website  
   Search: `Microsoft ODBC Driver 17 SQL Server download`
2. Run the installer — accept defaults
3. No reboot needed

### Git

1. Download from [https://git-scm.com](https://git-scm.com)
2. Install with defaults — leave all options as-is
3. Verify: open Command Prompt, type `git --version`

### PM2 (process manager)

After Node is installed, open **Command Prompt as Administrator** and run:

```cmd
npm install -g pm2
npm install -g pm2-windows-startup
```

---

## 2. Get the Code

### Option A — From GitHub (machine has internet access)

Open **Command Prompt** (or PowerShell) and run:

```cmd
cd C:\
git clone https://github.com/ak2254/app_sto.git sto-management
cd sto-management
```

This creates the folder `C:\sto-management` with all the source code.

### Option B — Copy from another PC (no internet, USB / network share)

1. On the source PC, open File Explorer and find the project folder (wherever you developed it, e.g. `C:\Users\YourName\Documents\sto-management`)
2. Copy the **entire folder** to a USB drive or a shared network path
   - Make sure to include the hidden `.git` folder (enable "Show hidden files" in Explorer options)
3. On the target PC, paste the folder to `C:\sto-management`
4. Open Command Prompt and confirm the code is there:
   ```cmd
   cd C:\sto-management
   dir
   ```
   You should see `backend`, `frontend`, `package.json`, etc.

> **After any code update on a running server**, see the [How to update the app](#how-to-update-the-app-after-a-code-change) section at the bottom.

---

## 3. Database Setup

### 3a. Create the database

Open **SQL Server Management Studio (SSMS)** and connect to your instance.

In a new query window, run:

```sql
CREATE DATABASE sto_management;
```

### 3b. Run the schema

1. In SSMS, change the database context to `sto_management` (use the dropdown at the top, or run `USE sto_management;`)
2. Open the file `C:\sto-management\backend\src\db\schema.sql`
3. Paste the entire contents into the query window and click **Execute**

This creates all tables, indexes, the sequence, and the `sites` table with the initial site codes.

> **Check it worked**: In the Object Explorer on the left, expand `sto_management → Tables`. You should see `sto_requests`, `sto_audit_log`, `sites`, `demo_users`, `sto_config`.  
> **Note**: `app_users` is no longer part of the schema — roles and sites come from AD groups now.

### 3c. Run all migrations

Run each of these files **in order** (open in SSMS, execute against `sto_management`):

1. `C:\sto-management\backend\src\db\migrations\003_app_users.sql`
2. `C:\sto-management\backend\src\db\migrations\004_admin_audit.sql`
3. `C:\sto-management\backend\src\db\migrations\005_fk_constraints.sql`
4. `C:\sto-management\backend\src\db\migrations\006_remove_app_users.sql`

> Migration 003–005 create tables that 006 then immediately cleans up. On a brand-new install it's fine to run all four — each is idempotent. On an existing database that was running the older app_users version, running 006 will drop the `app_users` table and update the FK columns. Make sure no one is logged in when you run 006 on a live database.

### 3d. Find your SQL Server name

You need the exact server name for the `.env` file in step 5.

In SSMS, look at the top of the Object Explorer panel. You'll see something like:

```
SERVERNAME\SQLEXPRESS (SQL Server 15.0...)
```

Copy exactly what's before the parentheses, e.g. `LAPTOP-ABC123\SQLEXPRESS` or just `MYSERVER` if it's the default instance.

### 3e. Add your real sites

The schema pre-loads three placeholder sites (ABC, ABL, XYZ). Replace these with your actual sites:

```sql
USE sto_management;

DELETE FROM sites;

INSERT INTO sites (code, name) VALUES
  ('SITE1', 'Your First Site Name'),
  ('SITE2', 'Your Second Site Name'),
  ('SITE3', 'Your Third Site Name');
```

Use the same short codes here as the site prefix in your AD groups (see next section).

---

## 4. Active Directory Groups

> **This is the key step that replaces the old user management page.**  
> Roles and site assignments now come entirely from AD group membership — there is no in-app user management.

### 4a. Group naming convention

Every group follows the pattern: **`{SITE}_{ROLE}`**

- Everything before the first underscore is the **site code** (must match a code in your `sites` table)
- Everything after the first underscore is the **role suffix**

| AD Group Name | Site | Role |
|---|---|---|
| `ABC_ADMIN` | ABC | Admin — full access at site ABC |
| `ABC_RECEIVING` | ABC | Receiving Site — creates STOs |
| `ABC_PLANNING` | ABC | Shipping Planning — reviews and approves |
| `ABC_LOGISTICS` | ABC | Shipping Logistics — handles shipping details |
| `ABC_MANAGEMENT` | ABC | Management — oversight and approval |
| `ABC_FINANCE` | ABC | Finance — final approval |
| `ABC_RECV_LOGISTICS` | ABC | Receiving Logistics — closes out deliveries |

Repeat for each site. For example, if you have sites `ABC` and `XYZ`, you'd create:
`ABC_ADMIN`, `ABC_RECEIVING`, ..., `XYZ_ADMIN`, `XYZ_RECEIVING`, etc.

### 4b. What each role can do

| Role | Can do |
|---|---|
| `ADMIN` | Everything at their site (edit any STO, revert steps). Only sees STOs involving their site. |
| `RECEIVING` | Creates new STOs, edits drafts, sees STOs at their receiving site |
| `PLANNING` | Reviews STOs in Planning Review, approves/rejects, enters MPN/batch/expiry details |
| `LOGISTICS` | Enters shipping details (freight cost, tracking, ship date) |
| `MANAGEMENT` | Oversight approval for high-value STOs |
| `FINANCE` | Final financial approval before receiving logistics closes |
| `RECV_LOGISTICS` | Records receipt and closes out deliveries |

### 4c. Site scoping rules

Every user is **always scoped to their site** — there is no cross-site visibility:

- `PLANNING` and `LOGISTICS` see STOs where **shipping_site = their site**
- `RECEIVING` and `RECV_LOGISTICS` see STOs where **receiving_site = their site**
- `ADMIN`, `MANAGEMENT`, `FINANCE` see STOs where **either site = their site**

### 4d. Ask IT to create the groups

Give IT this list of groups to create in Active Directory. For each site code in your `sites` table, IT needs to create the corresponding `_{ROLE}` groups and add the appropriate staff to each.

**Important**: The group `CN` (common name) must follow the exact `{SITE}_{SUFFIX}` pattern. The `memberOf` attribute returned by LDAP is how the app determines the user's role and site.

### 4e. What happens at login

1. User enters their AD username and password
2. App authenticates against AD (LDAP)
3. App scans the user's `memberOf` groups for the first `{SITE}_{SUFFIX}` match
4. Site and role are extracted from the group name
5. A JWT is issued with `{ adUsername, group, name, site }` — no database lookup
6. If the user is not in any `{SITE}_{SUFFIX}` group, login is denied with a clear error message

---

## 5. Configure `.env`

The backend reads all its configuration from a `.env` file. This file is **never committed to Git** — you create it manually on each machine.

```cmd
cd C:\sto-management\backend
copy .env.example .env
notepad .env
```

Fill in each value:

```env
# Generate a strong secret — open PowerShell and run:
#   [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
# Paste the output here. NEVER use the example value in production.
JWT_SECRET=PASTE_YOUR_GENERATED_SECRET_HERE

PORT=4000

# The URL users open in their browser (after IIS is set up)
# During initial testing before IIS, use: http://localhost:5173
FRONTEND_ORIGIN=https://your-server-name.company.com

# Your SQL Server name from step 3d
DB_SERVER=MYSERVER\SQLEXPRESS
DB_DATABASE=sto_management

# Approval thresholds (USD) — change to match your business rules
MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD=10000
MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD=5000

# SET THIS TO false FOR PRODUCTION
DEV_BYPASS=false

# Ask IT for these values
LDAP_URL=ldap://ad.yourcompany.com
LDAP_DOMAIN=yourcompany.com
LDAP_BASE_DN=DC=yourcompany,DC=com

# A read-only service account that can search AD (IT will create this)
LDAP_BIND_DN=svc_sto_app@yourcompany.com
LDAP_BIND_PASSWORD=the_service_account_password
```

Save and close Notepad.

> **What to ask IT for**:
> - The LDAP URL (usually `ldap://domain-controller-hostname`)
> - The domain name (e.g. `yourcompany.com`)
> - The base DN (usually `DC=yourcompany,DC=com`)
> - A service account (read-only is fine) for LDAP searches — needed so the app can look up users by username before binding with their password
> - Confirmation that the `{SITE}_{ROLE}` groups have been created (step 4)

> **No `LDAP_APP_GROUP` needed anymore** — the old single-group gate is gone. Access is controlled entirely by which `{SITE}_{ROLE}` group the user is in.

---

## 6. Install and Build

Open **Command Prompt as Administrator** and run these commands one section at a time.

### Backend

```cmd
cd C:\sto-management\backend
npm install
npm run build
```

`npm install` will compile the native `msnodesqlv8` module. This takes 2–5 minutes the first time and may print a lot of output — that is normal. Watch for any **error** lines at the end.

`npm run build` compiles TypeScript to JavaScript into `C:\sto-management\backend\dist\`.

### Frontend

```cmd
cd C:\sto-management\frontend
npm install
```

Now build with the production API URL set:

```cmd
set VITE_API_URL=https://your-server-name.company.com/api
npm run build
```

> Replace `https://your-server-name.company.com` with whatever domain/hostname your server will be reached at.  
> If you haven't set up DNS yet and will access by IP: `set VITE_API_URL=http://192.168.1.100/api`

This creates `C:\sto-management\frontend\dist\` — a folder of static HTML/CSS/JS files.

---

## 7. First Run and Verify

Before setting up IIS and PM2, confirm the backend works.

Open **Command Prompt as Administrator** and run:

```cmd
cd C:\sto-management\backend
node dist/index.js
```

You should see a single log line like:
```
{"level":30,"msg":"STO backend started","port":4000,...}
```

If you see an error instead, jump to the [Troubleshooting](#12-troubleshooting) section.

**Test the health endpoint** — open a browser or PowerShell and visit:

```
http://localhost:4000/api/health
```

You should get: `{"status":"ok","timestamp":"..."}`

If you get `{"status":"error"}` the backend is running but can't reach SQL Server — check your `DB_SERVER` value in `.env`.

Press `Ctrl+C` to stop the server.

---

## 8. PM2 Windows Service

PM2 keeps the backend running and restarts it automatically if it crashes or the server reboots.

Open **Command Prompt as Administrator**:

```cmd
cd C:\sto-management\backend

pm2 start dist/index.js --name sto-backend

pm2 save

pm2-windows-startup install
```

**Verify it's running:**

```cmd
pm2 list
```

You should see `sto-backend` with status `online`.

**Useful PM2 commands for later:**

```cmd
pm2 logs sto-backend          # view live logs
pm2 restart sto-backend       # restart after config changes
pm2 stop sto-backend          # stop
pm2 start sto-backend         # start
pm2 monit                     # live dashboard
```

---

## 9. IIS Reverse Proxy

IIS sits in front of the Node.js backend, handles HTTPS, and serves the frontend static files.

### 9a. Install IIS

Open **Server Manager → Add Roles and Features** and add:

- **Web Server (IIS)**
- Under **Application Development**: nothing extra needed

Or in PowerShell as Administrator:

```powershell
Install-WindowsFeature -Name Web-Server -IncludeManagementTools
```

### 9b. Install IIS modules

Download and install these two:

1. **URL Rewrite Module 2.1**  
   Search: `IIS URL Rewrite Module download Microsoft`

2. **Application Request Routing (ARR) 3.0**  
   Search: `IIS Application Request Routing download Microsoft`

After installing ARR, open **IIS Manager**, click the server name at the top level, open **Application Request Routing Cache**, then click **Server Proxy Settings** on the right, tick **Enable proxy**, click Apply.

### 9c. Get an HTTPS certificate

**Option A — Domain certificate from IT**: Ask IT to issue a certificate for your server's hostname and install it in IIS.

**Option B — Self-signed (internal only)**:

In PowerShell as Administrator:

```powershell
New-SelfSignedCertificate -DnsName "your-server-name.company.com" -CertStoreLocation "cert:\LocalMachine\My"
```

In IIS Manager: expand the server → **Sites → Default Web Site → Bindings → Add → HTTPS → select your certificate**.

### 9d. Configure the website

Open **IIS Manager**. In the left panel, expand the server → **Sites → Default Web Site**.

**Set physical path**: Click "Basic Settings" on the right → set Physical Path to:  
`C:\sto-management\frontend\dist`

**Create the file** `C:\sto-management\frontend\dist\web.config` with this content (IIS reads it automatically):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>

    <rewrite>
      <rules>
        <!-- Proxy /api/* to Node.js backend on port 4000 -->
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:4000/api/{R:1}" />
        </rule>

        <!-- SPA fallback: non-file requests serve index.html -->
        <rule name="SPA Fallback" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>

    <!-- Serve static assets with correct MIME types -->
    <staticContent>
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
    </staticContent>

  </system.webServer>
</configuration>
```

**Restart IIS:**

```cmd
iisreset
```

---

## 10. Windows Firewall

Block direct access to the Node.js port (4000) from outside — all traffic should go through IIS on 80/443.

Open **Windows Defender Firewall with Advanced Security** (search for it in Start).

Add an **Inbound Rule**:
- Rule type: Port
- Protocol: TCP, Specific port: `4000`
- Action: **Block the connection**
- Profile: Domain, Private, Public
- Name: `Block direct STO backend access`

IIS on ports 80 and 443 should already have allow rules. If not, add them the same way but choose **Allow**.

---

## 11. Go Live Checklist

Work through each item before telling users the system is live.

### Environment
- [ ] `DEV_BYPASS=false` in `.env`
- [ ] `JWT_SECRET` is a long random string — not the example value
- [ ] `LDAP_URL`, `LDAP_DOMAIN`, `LDAP_BASE_DN` all filled in correctly
- [ ] `LDAP_BIND_DN` and `LDAP_BIND_PASSWORD` are set (service account)
- [ ] `FRONTEND_ORIGIN` matches the URL users will open in their browser
- [ ] `VITE_API_URL` was set correctly before the frontend `npm run build`

### Active Directory
- [ ] IT has created the `{SITE}_{ROLE}` AD groups for every site (e.g. `ABC_ADMIN`, `ABC_RECEIVING`, etc.)
- [ ] At least one user is in a `{SITE}_ADMIN` group so there is an admin from day one
- [ ] You have tested login with at least one real AD account that is in one of the app groups
- [ ] Login attempt with an account NOT in any app group is denied with the expected error message

### Database
- [ ] All four migration files ran without errors (003, 004, 005, 006)
- [ ] Your real site codes are in the `sites` table and match the prefixes in your AD group names
- [ ] `GET http://localhost:4000/api/health` returns `{"status":"ok"}`

### Smoke test
- [ ] Open `https://your-server-name.company.com` in a browser
- [ ] Login page loads
- [ ] Can log in with an AD account that is in one of the `{SITE}_{ROLE}` groups
- [ ] App goes straight to Dashboard (no site-picker step — site comes from AD group)
- [ ] Nav bar shows the correct name, role label, and site
- [ ] Create a test STO, submit it, approve through one step
- [ ] Analytics page loads

### PM2
- [ ] `pm2 list` shows `sto-backend` as `online`
- [ ] Reboot the server and confirm PM2 and Node restart automatically
- [ ] After reboot, `http://localhost:4000/api/health` still returns ok

---

## 12. Troubleshooting

### "Cannot find module" or compile errors on `npm install`

The native module `msnodesqlv8` must be compiled on the target machine. Make sure:
- Node.js was installed with the "native build tools" option ticked, OR
- Run in an Administrator PowerShell: `npm install --global windows-build-tools`
- Then re-run `npm install` inside `backend/`

### "Login failed" or "Could not connect to database"

1. Check `DB_SERVER` in `.env` exactly matches what SSMS shows (including `\SQLEXPRESS` if applicable)
2. The Node.js process runs as the logged-in Windows user. That user must have access to SQL Server.  
   In SSMS: Security → Logins → check your user or `NT AUTHORITY\SYSTEM` has `sto_management` database permissions.
3. Try connecting in SSMS with the same server name to confirm it works

### "not in any STO application group" on login

The user has successfully authenticated against AD but is not a member of any `{SITE}_{ROLE}` group.

1. In Active Directory, add the user to the appropriate group (e.g. `ABC_RECEIVING`)
2. The user needs to log out and back in — their group membership is read at login time
3. Verify the group name exactly follows `{SITE}_{ROLE}` with no spaces and a single underscore separator

### User is in the group but gets the wrong site or role

The app reads the **first** matching group it finds in the user's `memberOf` list. If a user is in multiple `{SITE}_{ROLE}` groups, one will win based on LDAP return order. Best practice: put each user in **one** group only.

### JWT tokens from the old app_users version stop working after migration

This is expected. Old tokens contained `userId` (an integer), new tokens contain `adUsername`. After running migration 006 and restarting the backend, all existing tokens are rejected. Users just need to log in again.

To force everyone to re-login immediately: change `JWT_SECRET` in `.env` to a new random value and restart the backend. All existing tokens become invalid instantly.

### 502 Bad Gateway from IIS

IIS can't reach the backend on port 4000.
1. Check `pm2 list` — backend should be `online`
2. Check `http://localhost:4000/api/health` works from the server itself
3. Check the ARR proxy is enabled (IIS Manager → server → ARR Cache → Server Proxy Settings → Enable proxy)
4. Check the URL Rewrite rules are saved and the `web.config` file is in `frontend\dist\`

### Backend starts but LDAP login fails

1. Confirm the LDAP server is reachable: `ping ad.yourcompany.com` from the server
2. Check `LDAP_URL` — use `ldap://` (not `ldaps://`) unless IT has confirmed LDAPS is configured
3. Check the service account credentials are correct
4. Check the firewall isn't blocking port 389 between this server and the domain controller

### Frontend shows "Failed to load" or blank page

1. Check the browser console (F12 → Console) for errors
2. Check the Network tab — is `/api/health` returning 200 or 404/502?
3. If 404, the URL Rewrite rules aren't working — double check the `web.config` is in `frontend\dist\`
4. If the page is blank, check if `index.html` is being served — visit `https://your-server/index.html` directly

### How to update the app after a code change

**Option A — pull from GitHub** (if the server has internet):

```cmd
cd C:\sto-management
git pull
```

**Option B — copy from your dev PC** (no internet on server):

1. On your dev PC, copy the updated `backend\` and `frontend\` folders to USB or a network share
2. On the server, replace `C:\sto-management\backend\` and `C:\sto-management\frontend\` with the new copies
   - **Do not overwrite** `backend\.env` — this is your local config and is not in Git

**Then on the server, rebuild and restart:**

```cmd
cd C:\sto-management\backend
npm install
npm run build
pm2 restart sto-backend

cd C:\sto-management\frontend
set VITE_API_URL=https://your-server-name.company.com/api
npm run build
```

If there are new migration files (check `backend\src\db\migrations\` for any SQL files you haven't run yet), run them in SSMS before restarting the backend.

No IIS restart needed for frontend updates — IIS serves the new files immediately.  
Only restart IIS (`iisreset`) if you changed the `web.config`.

---

## Quick Reference

| Thing | Where |
|-------|-------|
| App URL | `https://your-server-name.company.com` |
| Backend health | `http://localhost:4000/api/health` |
| Backend logs | `pm2 logs sto-backend` |
| Backend config | `C:\sto-management\backend\.env` |
| Frontend files | `C:\sto-management\frontend\dist\` |
| Database | SQL Server → `sto_management` |
| Restart backend | `pm2 restart sto-backend` |
| Restart IIS | `iisreset` |
| Rebuild frontend | `cd frontend && set VITE_API_URL=... && npm run build` |
| Rebuild backend | `cd backend && npm run build && pm2 restart sto-backend` |
| AD group format | `{SITE}_{ROLE}` e.g. `ABC_ADMIN`, `ABC_RECEIVING` |
| Force all re-login | Change `JWT_SECRET` in `.env`, run `pm2 restart sto-backend` |
