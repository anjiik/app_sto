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
4. [Configure the environment file](#4-configure-env)
5. [Install dependencies and build](#5-install-and-build)
6. [Run the app and verify it works](#6-first-run-and-verify)
7. [Set up PM2 as a Windows service](#7-pm2-windows-service)
8. [Set up IIS as a reverse proxy with HTTPS](#8-iis-reverse-proxy)
9. [Windows Firewall](#9-windows-firewall)
10. [Go live — final checklist](#10-go-live-checklist)
11. [Troubleshooting](#11-troubleshooting)

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

Open **Command Prompt** (or PowerShell) and run:

```cmd
cd C:\
git clone https://github.com/ak2254/app_sto.git sto-management
cd sto-management
```

This creates the folder `C:\sto-management` with all the source code.

> If you don't have internet access on the target machine, copy the entire project folder via USB or network share instead. Make sure you copy the `.git` folder too if you want to pull updates later. After copying, `cd` into the folder.

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

> **Check it worked**: In the Object Explorer on the left, expand `sto_management → Tables`. You should see `sto_requests`, `sto_audit_log`, `app_users`, `sites`, `demo_users`, `sto_config`.

### 3c. Run the migrations

Run each of these files in order (same way — open in SSMS, execute against `sto_management`):

1. `C:\sto-management\backend\src\db\migrations\003_app_users.sql`
2. `C:\sto-management\backend\src\db\migrations\004_admin_audit.sql`
3. `C:\sto-management\backend\src\db\migrations\005_fk_constraints.sql`

> **Note**: If you already ran `schema.sql` from the latest version of the repo, some of these migrations may say "object already exists" — that is fine, just ignore those messages and continue.

### 3d. Find your SQL Server name

You need to know the exact server name for the `.env` file in the next step.

In SSMS, look at the top of the Object Explorer panel. You'll see something like:

```
SERVERNAME\SQLEXPRESS (SQL Server 15.0...)
```

Copy exactly what's before the parentheses, e.g. `LAPTOP-ABC123\SQLEXPRESS` or just `MYSERVER` if it's the default instance.

### 3e. Add your sites

The schema pre-loads three placeholder sites (ABC, ABL, XYZ). Replace these with your real sites:

```sql
USE sto_management;

-- Remove placeholder sites
DELETE FROM sites;

-- Add your real sites (one row per site)
INSERT INTO sites (code, name) VALUES
  ('SITE1', 'Your First Site Name'),
  ('SITE2', 'Your Second Site Name'),
  ('SITE3', 'Your Third Site Name');
```

---

## 4. Configure `.env`

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

# The AD group that controls who can log in
LDAP_APP_GROUP=STO_App_Users
```

Save and close Notepad.

> **What to ask IT for**:
> - The LDAP URL (usually `ldap://domain-controller-hostname`)
> - The base DN (usually `DC=yourcompany,DC=com`)
> - A service account (read-only is fine) for LDAP searches
> - The name of the AD group to use as the app gate (`LDAP_APP_GROUP`)

---

## 5. Install and Build

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

## 6. First Run and Verify

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

If you see an error instead, jump to the [Troubleshooting](#11-troubleshooting) section.

**Test the health endpoint** — open a browser or PowerShell and visit:

```
http://localhost:4000/api/health
```

You should get: `{"status":"ok","timestamp":"..."}`

If you get `{"status":"error"}` the backend is running but can't reach SQL Server — check your `DB_SERVER` value in `.env`.

Press `Ctrl+C` to stop the server.

---

## 7. PM2 Windows Service

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

## 8. IIS Reverse Proxy

IIS sits in front of the Node.js backend, handles HTTPS, and serves the frontend static files.

### 8a. Install IIS

Open **Server Manager → Add Roles and Features** and add:

- **Web Server (IIS)**
- Under **Application Development**: nothing extra needed

Or in PowerShell as Administrator:

```powershell
Install-WindowsFeature -Name Web-Server -IncludeManagementTools
```

### 8b. Install IIS modules

Download and install these two:

1. **URL Rewrite Module 2.1**  
   Search: `IIS URL Rewrite Module download Microsoft`

2. **Application Request Routing (ARR) 3.0**  
   Search: `IIS Application Request Routing download Microsoft`

After installing ARR, open **IIS Manager**, click the server name at the top level, open **Application Request Routing Cache**, then click **Server Proxy Settings** on the right, tick **Enable proxy**, click Apply.

### 8c. Get an HTTPS certificate

**Option A — Domain certificate from IT**: Ask IT to issue a certificate for your server's hostname and install it in IIS.

**Option B — Self-signed (internal only)**:

In PowerShell as Administrator:

```powershell
New-SelfSignedCertificate -DnsName "your-server-name.company.com" -CertStoreLocation "cert:\LocalMachine\My"
```

In IIS Manager: expand the server → **Sites → Default Web Site → Bindings → Add → HTTPS → select your certificate**.

### 8d. Configure the website

Open **IIS Manager**. In the left panel, expand the server → **Sites → Default Web Site**.

**Set physical path**: Click "Basic Settings" on the right → set Physical Path to:  
`C:\sto-management\frontend\dist`

**Add the URL Rewrite rules** — click **URL Rewrite** in the middle panel, then **Add Rule(s) → Blank rule**, and add these two rules:

**Rule 1 — Proxy API calls to Node.js**
- Name: `API Proxy`
- Match URL — Pattern: `^api/(.*)`
- Conditions: none
- Action type: Rewrite
- Rewrite URL: `http://localhost:4000/api/{R:1}`
- Tick: Stop processing

**Rule 2 — SPA fallback (serve index.html for all non-file routes)**
- Name: `SPA Fallback`
- Match URL — Pattern: `^(?!api/).*`
- Conditions: Add condition — `{REQUEST_FILENAME}` — Does Not Match Pattern — `.*\.[a-zA-Z0-9]+$`
- Action type: Rewrite
- Rewrite URL: `/index.html`

**Alternatively**, create the file `C:\sto-management\frontend\dist\web.config` with this content (IIS reads it automatically):

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

## 9. Windows Firewall

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

## 10. Go Live Checklist

Work through each item before telling users the system is live.

### Environment
- [ ] `DEV_BYPASS=false` in `.env`
- [ ] `JWT_SECRET` is a long random string — not the example value
- [ ] `LDAP_APP_GROUP` matches the exact AD group name (case-insensitive but must be correct)
- [ ] `FRONTEND_ORIGIN` matches the URL users will open in their browser
- [ ] `VITE_API_URL` was set correctly before the frontend `npm run build`

### Database
- [ ] All three migration files ran without errors
- [ ] Your real site codes are in the `sites` table
- [ ] `GET http://localhost:4000/api/health` returns `{"status":"ok"}`

### First admin user
After your first login through the app, run this in SSMS to promote yourself:
```sql
USE sto_management;
UPDATE app_users
SET app_group = 'admin'
WHERE ad_username = 'firstname.lastname@yourcompany.com';
```
Then log out and log back in — your next JWT will have `group: admin`.

### Smoke test
- [ ] Open `https://your-server-name.company.com` in a browser
- [ ] Login page loads
- [ ] Can log in with AD credentials
- [ ] SitePicker appears on first login, completes successfully
- [ ] Dashboard loads with no errors
- [ ] Create a test STO, submit it, approve through one step
- [ ] Analytics page loads

### PM2
- [ ] `pm2 list` shows `sto-backend` as `online`
- [ ] Reboot the server and confirm PM2 and Node restart automatically
- [ ] After reboot, `http://localhost:4000/api/health` still returns ok

---

## 11. Troubleshooting

### "Cannot find module" or compile errors on `npm install`

The native module `msnodesqlv8` must be compiled on the target machine. Make sure:
- Node.js was installed with the "native build tools" option ticked, OR
- Run in an Administrator PowerShell: `npm install --global windows-build-tools`
- Then re-run `npm install` inside `backend/`

### "Login failed" or "Could not connect to database"

1. Check `DB_SERVER` in `.env` exactly matches what SSMS shows (including `\SQLEXPRESS` if applicable)
2. The Node.js process runs as the logged-in Windows user. That user must have access to SQL Server.  
   In SSMS: Security → Logins → check your user or `NT AUTHORITY\SYSTEM` has the `sto_management` database permissions.
3. Try connecting in SSMS with the same server name to confirm it works

### "Account is not authorised" on login

The user is not a member of `LDAP_APP_GROUP` in AD. Ask IT to add them to the group, or temporarily change `LDAP_APP_GROUP` in `.env` to a group you are already in, restart the backend (`pm2 restart sto-backend`), log in, then promote yourself to admin and change it back.

### 502 Bad Gateway from IIS

IIS can't reach the backend on port 4000.
1. Check `pm2 list` — backend should be `online`
2. Check `http://localhost:4000/api/health` works from the server itself
3. Check the ARR proxy is enabled (IIS Manager → server → ARR Cache → Server Proxy Settings → Enable proxy)
4. Check the URL Rewrite rules are saved

### Backend starts but LDAP login fails

1. Confirm the LDAP server is reachable: `ping ad.yourcompany.com` from the server
2. Check `LDAP_URL` — use `ldap://` (not `ldaps://`) unless IT has confirmed LDAPS is configured
3. Check the service account credentials are correct by trying to log in to a computer with them
4. Check the firewall isn't blocking port 389 between this server and the DC

### Frontend shows "Failed to load" or blank page

1. Check the browser console (F12 → Console) for errors
2. Check the Network tab — is `/api/health` returning 200 or 404/502?
3. If 404, the URL Rewrite rules aren't working — double check the `web.config` is in `frontend\dist\`
4. If the page is blank, check if `index.html` is being served — visit `https://your-server/index.html` directly

### How to update the app after a code change

```cmd
cd C:\sto-management
git pull

cd backend
npm install
npm run build
pm2 restart sto-backend

cd ..\frontend
set VITE_API_URL=https://your-server-name.company.com/api
npm run build
```

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
