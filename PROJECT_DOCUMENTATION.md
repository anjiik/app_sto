# STO Management System — Full Project Documentation

## Table of Contents
1. [What the App Does](#1-what-the-app-does)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Workflow & Roles](#4-workflow--roles)
5. [Authentication Modes](#5-authentication-modes)
6. [Environment Configuration](#6-environment-configuration)
7. [Database](#7-database)
8. [How to Run](#8-how-to-run)
9. [File-by-File Reference](#9-file-by-file-reference)

---

## 1. What the App Does

The STO Management System manages **Stock Transfer Orders (STOs)** — requests to move inventory from one facility (shipping site) to another (receiving site).

A request moves through a fixed pipeline of stages, with different teams at each stage responsible for reviewing and advancing it. Every action is logged in an audit trail.

---

## 2. High-Level Architecture

### System Overview

The app is a two-tier web application. The frontend is a single-page React app served by Vite. The backend is a REST API built with Express. Both run locally on the same machine as the SQL Server database.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User's Browser                             │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │              React SPA  (port 5173)                          │  │
│   │                                                              │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│   │  │ Login /  │  │Dashboard │  │ STOList  │  │ Analytics  │  │  │
│   │  │ Auth     │  │          │  │ STOForm  │  │            │  │  │
│   │  │          │  │          │  │ STODetail│  │            │  │  │
│   │  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │  │
│   │                                                              │  │
│   │  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │  │
│   │  │  AuthContext   │  │  api/client  │  │  React Router   │ │  │
│   │  │  (JWT + state) │  │  (Axios)     │  │  (routing)      │ │  │
│   │  └────────────────┘  └──────────────┘  └─────────────────┘ │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                              │  HTTP + JWT                          │
└──────────────────────────────│──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Express API Server  (port 4000)                  │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ /api/auth    │  │  /api/sto    │  │/api/analytics│             │
│  │              │  │              │  │              │             │
│  │ login        │  │ GET list     │  │ summary      │             │
│  │ demo-users   │  │ GET by id    │  │ by-status    │             │
│  │ ping-login   │  │ POST create  │  │ by-month     │             │
│  │ ping-exchange│  │ PUT update   │  │ by-site      │             │
│  │ me           │  │ submit       │  │ rush-split   │             │
│  └──────────────┘  │ planning     │  │ raw-data     │             │
│                    │ logistics    │  └──────────────┘             │
│  ┌──────────────┐  │ management   │                               │
│  │ JWT Auth     │  │ finance      │  ┌──────────────┐             │
│  │ Middleware   │  │ recv-logist. │  │ lib/ldap.ts  │             │
│  │              │  └──────────────┘  │ (AD bind)    │             │
│  └──────────────┘                    └──────────────┘             │
│                              │                                      │
└──────────────────────────────│──────────────────────────────────────┘
                               │  Windows Auth (no password)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Microsoft SQL Server                              │
│                                                                     │
│   ┌──────────────────┐   ┌────────────────┐   ┌───────────────┐   │
│   │   sto_requests   │   │ sto_audit_log  │   │  demo_users   │   │
│   │  (main data)     │   │ (audit trail)  │   │  (dev only)   │   │
│   └──────────────────┘   └────────────────┘   └───────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

           (LDAP mode only)
                 │
                 ▼
┌─────────────────────────────┐
│   Active Directory / LDAP   │
│   (validates credentials,   │
│    returns AD group names)  │
└─────────────────────────────┘
```

---

### Authentication Flow

#### Demo mode (`PING_DEV_BYPASS=true`)

```
Browser                    Express                    SQL Server
   │                          │                            │
   │── POST /auth/login ──────►│                            │
   │   { username, password } │                            │
   │                          │── SELECT demo_users ──────►│
   │                          │◄── row with password_hash ─│
   │                          │                            │
   │                          │  bcrypt.compare(password)  │
   │                          │                            │
   │◄── { token, user } ──────│  jwt.sign(payload, secret) │
   │                          │                            │
   │  localStorage.setItem    │                            │
   │  ('sto_token', token)    │                            │
```

#### LDAP / Active Directory mode (`PING_DEV_BYPASS=false`)

```
Browser                    Express                  Active Directory
   │                          │                            │
   │── POST /auth/login ──────►│                            │
   │   { username, password } │                            │
   │                          │── bind(serviceAccount) ───►│
   │                          │── search(userPrincipal) ───►│
   │                          │◄── { dn, memberOf[] } ─────│
   │                          │                            │
   │                          │── bind(userDN, password) ──►│
   │                          │◄── success / error 49 ─────│
   │                          │                            │
   │                          │  map memberOf → appGroup   │
   │                          │  (ldapGroups.ts lookup)    │
   │                          │                            │
   │◄── { token, user } ──────│  jwt.sign(payload, secret) │
```

#### Every subsequent API request

```
Browser                         Express
   │                               │
   │── GET /api/sto ───────────────►│
   │   Authorization: Bearer <JWT> │
   │                               │  jwt.verify(token, secret)
   │                               │  → attaches req.user
   │                               │
   │                               │── SELECT sto_requests ──► SQL Server
   │                               │◄── rows ────────────────────────────
   │◄── JSON array ────────────────│
```

---

### STO State Machine

Each STO moves through a fixed set of states. Only specific roles can trigger each transition.

```
                    ┌─────────┐
                    │  DRAFT  │  ← created by receiving_site
                    └────┬────┘
                         │ submit (receiving_site)
                         ▼
               ┌──────────────────┐
               │ PLANNING_REVIEW  │  ← action by shipping_planning (XYZ)
               └────────┬─────────┘
              approve   │   reject
             ┌──────────┘     └──────────────┐
             ▼                               ▼
  ┌───────────────────────┐           ┌──────────┐
  │  SHIPPING_LOGISTICS   │           │ REJECTED │
  └───────────┬───────────┘           └──────────┘
              │ submit (shipping_logistics)
              │
     ┌────────┴────────┐
     │                 │
     │ material >$10k  │ under threshold
     │ OR freight >$5k │
     ▼                 ▼
┌──────────────┐  ┌───────────────┐
│  MANAGEMENT  │  │ FINANCE_REVIEW│
│   _REVIEW    │  └───────┬───────┘
└──────┬───────┘          │
       │ approve          │ approve (finance)
       ▼                  │
┌───────────────┐         │
│ FINANCE_REVIEW│─────────┘
└───────┬───────┘
        │ approve (finance)
        ▼
┌────────────────────┐
│ RECEIVING_LOGISTICS│  ← action by receiving_logistics (ABC)
└─────────┬──────────┘
          │ close out
          ▼
       ┌────────┐
       │ CLOSED │
       └────────┘

  Any stage except CLOSED can also → REJECTED (by the acting role)
```

---

### Frontend Component Architecture

```
App.tsx  (Router + AuthProvider)
│
├── AuthProvider  (context/AuthContext.tsx)
│   └── provides: user, token, login(), logout(), devBypassMode, ldapMode
│
├── /login          → Login.tsx
│   └── uses: useAuth(), api/client
│
├── /auth/callback  → PingCallback.tsx
│   └── uses: useAuth().exchangePingCode()
│
└── ProtectedRoute (requires user in context)
    │
    └── Layout.tsx  (nav bar wrapper)
        │
        ├── /dashboard   → Dashboard.tsx
        │   └── fetches: GET /api/sto, GET /api/sto/audit-log
        │
        ├── /sto         → STOList.tsx
        │   └── fetches: GET /api/sto?status=&search=
        │
        ├── /sto/new     → STOForm.tsx
        │   └── posts:   POST /api/sto
        │
        ├── /sto/:id     → STODetail.tsx
        │   └── fetches: GET /api/sto/:id
        │   └── posts:   POST /api/sto/:id/submit|planning|logistics|...
        │
        └── /analytics   → Analytics.tsx
            └── fetches: GET /api/analytics/summary|by-status|by-month|...
```

---

### Backend Request Handling Flow

Every incoming request goes through this chain:

```
Incoming HTTP Request
        │
        ▼
   CORS check
   (only http://localhost:5173 allowed)
        │
        ▼
   express.json()
   (parse request body)
        │
        ▼
   Route match
   (auth / sto / analytics)
        │
        ▼
   authenticate middleware
   (verify JWT, attach req.user)
        │
        ├── 401 if no/invalid token
        │
        ▼
   requireGroup() middleware  ← only on role-restricted routes
        │
        ├── 403 if wrong role
        │
        ▼
   Route handler
   (business logic + DB query)
        │
        ▼
   dbQuery / dbQueryOne / dbInsert / dbExecute
   (parameterised SQL — no injection possible)
        │
        ▼
   SQL Server (Windows Auth pool)
        │
        ▼
   JSON response
```

---

### Data Flow: Submitting a New STO

```
User (receiving_site @ ABC)          Frontend                Backend               DB
         │                              │                       │                    │
         │── fills form ───────────────►│                       │                    │
         │── clicks Submit ────────────►│                       │                    │
         │                             │── POST /api/sto ──────►│                    │
         │                             │   { shipping_site: XYZ,│                    │
         │                             │     receiving_site: ABC│                    │
         │                             │     material, qty... } │                    │
         │                             │                        │── INSERT ─────────►│
         │                             │                        │   sto_requests     │
         │                             │                        │   status='DRAFT'   │
         │                             │                        │◄── id: 42 ─────────│
         │                             │                        │                    │
         │                             │                        │── INSERT ─────────►│
         │                             │                        │   sto_audit_log    │
         │                             │                        │   action='CREATED' │
         │                             │◄── { id:42, sto_id }──│                    │
         │◄── redirect /sto/42 ────────│                       │                    │
```

---

### Data Flow: Queue Filtering on Dashboard

```
User logs in
    │
    ▼
JWT issued: { group: 'shipping_planning', site: 'XYZ' }
    │
    ▼
Dashboard loads: GET /api/sto  (returns ALL STOs)
    │
    ▼
Frontend filters in-memory:
    myQueue = stos.filter(s =>
        s.status === 'PLANNING_REVIEW'        // role's required status
        && s.shipping_site === user.site      // only XYZ's STOs
    )
    │
    ▼
Dashboard shows only STOs where XYZ is the shipper, waiting for planning
```

---

### Deployment Architecture (Current — Local)

```
┌─────────────────── Windows PC ──────────────────────────────┐
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │   Terminal 1                                         │  │
│   │   cd backend && npm run dev                          │  │
│   │   → Express on :4000                                 │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │   Terminal 2                                         │  │
│   │   cd frontend && npm run dev                         │  │
│   │   → Vite dev server on :5173                         │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │   SQL Server (SQLEXPRESS instance)                   │  │
│   │   Windows Authentication — no credentials needed     │  │
│   │   Database: sto_management                           │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │   Active Directory  (LDAP mode only)                 │  │
│   │   Reached over network via LDAP_URL                  │  │
│   │   e.g. ldap://ad.yourcompany.com                     │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
         ↑
  Users access via http://[PC-IP]:5173 on the local network
```

---

## 3. Tech Stack


| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| HTTP client | Axios |
| Backend | Node.js + Express + TypeScript |
| Database | Microsoft SQL Server (Windows Authentication) |
| DB driver | `mssql/msnodesqlv8` (native Windows auth — no SQL password needed) |
| Auth tokens | JWT (8-hour expiry), signed with `JWT_SECRET` |
| Demo passwords | bcryptjs |
| AD/LDAP auth | `ldapts` (pure TypeScript LDAP client) |

---

## 4. Workflow & Roles

### The 6 roles

| Role key | AD group pattern | What they do |
|---|---|---|
| `receiving_site` | `{SITE}_STO_Receiving_Site` | Creates and submits STO requests |
| `shipping_planning` | `{SITE}_STO_Shipping_Planning` | Reviews request, approves/rejects, fills MPN/batch/expiry |
| `shipping_logistics` | `{SITE}_STO_Shipping_Logistics` | Fills freight/container details, triggers management review if thresholds exceeded |
| `management` | `{SITE}_STO_Management` | Approves if material value > $10,000 or freight > $5,000 |
| `finance` | `{SITE}_STO_Finance` | Final financial approval before shipment |
| `receiving_logistics` | `{SITE}_STO_Receiving_Logistics` | Confirms receipt and closes out delivery |

### Pipeline stages

```
DRAFT → PLANNING_REVIEW → SHIPPING_LOGISTICS → MANAGEMENT_REVIEW (*) → FINANCE_REVIEW → RECEIVING_LOGISTICS → CLOSED
                                                        ↘ (if thresholds not met, skips to FINANCE_REVIEW)
Any stage can → REJECTED
```

(*) Management Review is only triggered when `material_value > $10,000` OR `freight_cost > $5,000`. Otherwise it skips straight to Finance Review.

### Concrete example

> Site ABC needs parts from Site XYZ.

1. **Alice (ABC, `receiving_site`)** submits the STO — sets `shipping_site = XYZ`, `receiving_site = ABC`
2. **Bob (XYZ, `shipping_planning`)** sees it in his queue (queue filters by `shipping_site = XYZ`) — approves, fills MPN/batch/expiry
3. **Charlie (XYZ, `shipping_logistics`)** fills freight cost and tracking — if cost triggers threshold, goes to Management; otherwise skips to Finance
4. **Dave (management)** approves — sees all sites
5. **Eve (finance)** approves — sees all sites
6. **Frank (ABC, `receiving_logistics`)** confirms delivery (queue filters by `receiving_site = ABC`) — closes out

### Queue filtering rule

| Role | Queue shows STOs where... |
|---|---|
| `receiving_site` | `receiving_site_need_by_date` = user's site (their DRAFT requests) |
| `shipping_planning` | `shipping_site` = user's site |
| `shipping_logistics` | `shipping_site` = user's site |
| `receiving_logistics` | `receiving_site` = user's site |
| `management` | All sites |
| `finance` | All sites |

The All STOs page (`/sto`) shows every STO regardless of site.

---

## 5. Authentication Modes

The app supports three auth modes controlled by `.env`:

### Mode A — Dev/Demo (`PING_DEV_BYPASS=true`)
- Login validates against `demo_users` table in SQL Server
- Password for all demo accounts is `Demo123!`
- Demo accounts panel appears on the login page with one-click autofill
- Run `npm run seed` in the backend to populate demo users

### Mode B — Active Directory / LDAP (`PING_DEV_BYPASS=false`, no Ping configured)
- Login validates against your company's Active Directory via LDAP
- Users type their AD username (e.g. `john.doe` or `john.doe@company.com`) and password
- The backend binds to AD, finds the user, checks their `memberOf` groups, maps to an app role
- No demo panel shown
- Configure LDAP vars in `.env` (see Section 5)
- Map AD group names in `backend/src/config/ldapGroups.ts`

### Mode C — PingFederate OIDC (`PING_ISSUER_URL` and `PING_CLIENT_ID` configured)
- Redirects to PingFederate for SSO login
- Returns with an auth code, backend exchanges it for a token
- Group claims from the token are mapped via `PING_GROUP_MAP` in `auth.ts`
- Not in use at the moment — infrastructure is in place for future use

---

## 6. Environment Configuration

File: `backend/.env` (copy from `backend/.env.example`)

```env
# Application secret for signing JWTs
JWT_SECRET=change-this-to-a-long-random-secret-in-production

# Backend port
PORT=4000

# SQL Server — Windows Authentication (no username/password needed)
DB_SERVER=LAPTOP-ABC123\SQLEXPRESS      # Your server\instance from SSMS
DB_DATABASE=sto_management

# Management approval thresholds (USD)
MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD=10000
MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD=5000

# Auth mode
# true  = demo mode (uses demo_users table)
# false = AD/LDAP mode
PING_DEV_BYPASS=true

# --- LDAP settings (only needed when PING_DEV_BYPASS=false) ---

# AD server — ldap:// (port 389) or ldaps:// (port 636 with SSL)
LDAP_URL=ldap://ad.yourcompany.com

# Domain used to build UPN: username@LDAP_DOMAIN
LDAP_DOMAIN=yourcompany.com

# Root of your AD tree
LDAP_BASE_DN=DC=yourcompany,DC=com

# Service account for searching AD (recommended)
# Leave blank to fall back to direct user bind
LDAP_BIND_DN=svc_sto_app@yourcompany.com
LDAP_BIND_PASSWORD=service-account-password
```

---

## 7. Database

**Engine:** Microsoft SQL Server  
**Authentication:** Windows Authentication (no SQL username/password)  
**Driver:** `mssql/msnodesqlv8` — requires the native Node.js SQL Server driver

### Tables

#### `sto_requests`
Main table. One row per STO. Key columns:

| Column | Type | Purpose |
|---|---|---|
| `id` | INT | Primary key |
| `sto_id` | VARCHAR | Human-readable ID, e.g. `STO-2025-00001` |
| `status` | VARCHAR | Current pipeline stage |
| `shipping_site` | VARCHAR | Site sending the goods (e.g. XYZ) |
| `receiving_site` | VARCHAR | Site receiving the goods (e.g. ABC) |
| `material_value` | DECIMAL | Used to trigger management approval |
| `freight_cost` | DECIMAL | Used to trigger management approval |
| `management_approval_required` | BIT | Set by logistics step |
| `rush_request` | BIT | Rush flag |
| `priority` | TINYINT | 1=Urgent, 2=Expedited, 3=Standard |
| `planning_approved`, `management_approved`, `finance_approved` | BIT | Approval flags per stage |

#### `sto_audit_log`
Append-only. Every status change and action is recorded here with who did it and when.

#### `sto_config`
Key-value table storing configurable thresholds (currently not read at runtime — thresholds come from `.env`).

#### `demo_users`
Only used in dev mode. Stores hashed passwords and role/site for test accounts. Populated by `npm run seed`.

---

## 8. How to Run

### First time setup

```bash
# 1. Clone the repo
git clone https://github.com/ak2254/app_sto.git
cd sto-management

# 2. Install backend dependencies
cd backend && npm install

# 3. Install frontend dependencies
cd ../frontend && npm install

# 4. Configure environment
cd ../backend
cp .env.example .env
# Edit .env — fill in DB_SERVER and choose auth mode

# 5. Create the database in SSMS:
#    CREATE DATABASE sto_management;
# Then run the schema:
#    sqlcmd -S YOUR_SERVER -d sto_management -i src/db/schema.sql

# 6. (Dev mode only) Seed demo users:
npm run seed
```

### Running the app

```bash
# Terminal 1 — backend (port 4000)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

Open `http://localhost:5173` in your browser.

### Deploying to another PC

```bash
git pull          # get latest code
cd backend && npm install
cd ../frontend && npm install
# Make sure backend/.env exists with correct DB_SERVER
```

---

## 9. File-by-File Reference

---

### Root level

#### `.gitignore`
Excludes `node_modules`, `dist`, `.env` (live secrets), and SQL Server lock files (`*.db-shm`, `*.db-wal`) from version control.

#### `setup.sh`
Shell script for initial project setup (install dependencies, copy `.env.example`). Run once on a fresh clone.

#### `HANDOFF.md` / `README.md`
High-level project notes. `README.md` has quick-start instructions.

#### `STO_Implementation_Design.html` / `.pdf`
Original design document describing the STO workflow and data model.

---

### Backend

#### `backend/.env.example`
Template for the `.env` file. Contains all required variables with placeholder values and explanatory comments. Copy to `.env` and fill in real values — never commit `.env` itself.

#### `backend/tsconfig.json`
TypeScript compiler config for the backend. Targets Node.js, outputs to `dist/`, uses strict mode.

#### `backend/package.json`
NPM config. Key scripts:
- `npm run dev` — runs backend with `ts-node` in watch mode
- `npm run build` — compiles TypeScript to `dist/`
- `npm run seed` — runs `src/db/seed.ts` to populate demo users

Key dependencies: `express`, `mssql`, `msnodesqlv8`, `jsonwebtoken`, `bcryptjs`, `ldapts`, `dotenv`

---

#### `backend/src/index.ts`
**Entry point for the backend server.**
- Loads `.env` first (must be before any route imports that read `process.env`)
- Creates Express app, enables CORS for `http://localhost:5173`
- Mounts routes: `/api/auth`, `/api/sto`, `/api/analytics`
- Starts listening on `PORT` (default 4000)
- Logs DB server name on startup

---

#### `backend/src/types/index.ts`
**Shared TypeScript types for the backend.**
- `Group` — union type of the 6 role keys
- `STOStatus` — union type of the 8 pipeline stages
- `JwtPayload` — shape of the data stored inside a JWT (`userId`, `group`, `name`, `site`)
- `AuthRequest` — Express `Request` extended with an optional `user` field (set by auth middleware)

---

#### `backend/src/db/connection.ts`
**SQL Server connection and query helpers.**
- Uses `mssql/msnodesqlv8` for Windows Authentication (no SQL username/password)
- Lazily creates a single connection pool on first use (`getPool`)
- Parses `DB_SERVER` — splits `SERVERNAME\INSTANCE` into separate fields for the driver
- Exports four helper functions used by all routes:
  - `dbQuery<T>` — runs a SELECT, returns array of rows
  - `dbQueryOne<T>` — runs a SELECT, returns first row or undefined
  - `dbExecute` — runs INSERT/UPDATE with no return value needed
  - `dbInsert` — runs INSERT with `OUTPUT INSERTED.id`, returns the new row ID
- Parameters are bound via `req.input()` — never string-concatenated, so SQL injection is not possible

---

#### `backend/src/db/schema.sql`
**Database schema DDL.**
Creates three tables: `sto_requests`, `sto_audit_log`, `sto_config`, and `demo_users`.
Run this once against a blank `sto_management` database.

#### `backend/src/db/seed.ts`
**Demo data seeder.**
Inserts test users into the `demo_users` table with bcrypt-hashed passwords.
Run with `npm run seed`. Only used in dev mode (`PING_DEV_BYPASS=true`).

#### `backend/src/db/sample_data.sql`
Optional SQL script with sample STO records for testing.

---

#### `backend/src/middleware/auth.ts`
**JWT authentication middleware.**
- `authenticate` — reads the `Authorization: Bearer <token>` header, verifies it with `JWT_SECRET`, attaches the decoded payload to `req.user`. Returns 401 if missing or invalid.
- `requireGroup(...groups)` — middleware factory that returns 403 if `req.user.group` is not in the allowed list. Used on individual routes that are role-restricted.

---

#### `backend/src/config/ldapGroups.ts`
**AD group → app role mapping for LDAP mode.**
- `LDAP_GROUP_MAPPINGS` array — each entry maps one AD group CN (the exact name from Active Directory) to a `site` code and an `appGroup` role key.
- One entry per group per site. Add a new block of 6 entries when a new site joins.
- `findMappingByAdGroup(cnName)` — case-insensitive lookup used by the LDAP auth library.

**To add a new site:** copy one of the site blocks, change the site code and the AD group names to match what IT has set up in AD.

**To find your actual AD group names:** set `PING_DEV_BYPASS=false` and try logging in — the error message will list your exact AD group names.

---

#### `backend/src/lib/ldap.ts`
**Active Directory authentication using LDAP.**
Called by the `/api/auth/login` route in production mode.

Two flows depending on whether a service account is configured:

**Service account flow** (recommended, requires `LDAP_BIND_DN` + `LDAP_BIND_PASSWORD`):
1. Opens a client and binds with the service account
2. Searches the directory for the user by UPN (`john.doe@company.com`) or falls back to `sAMAccountName`
3. Opens a second client and binds with the user's own DN and their typed password — this validates the password
4. Closes both connections

**Direct user bind flow** (fallback, no service account):
1. Builds a UPN from the username
2. Binds directly with the user's credentials
3. Searches the directory for their `memberOf` groups

Both flows call `buildResult()` which:
- Extracts each `memberOf` DN down to just the CN (group short name)
- Calls `findMappingByAdGroup()` for each group until one matches
- Throws a descriptive error listing all found groups if none match (useful for debugging misconfigured group names in `ldapGroups.ts`)

Helper functions:
- `extractCN(dn)` — strips `CN=GroupName,OU=...` down to just `GroupName`
- `toUPN(username)` — normalises `john.doe`, `DOMAIN\john.doe`, or `john.doe@company.com` all to UPN format

---

#### `backend/src/routes/auth.ts`
**Authentication routes — `/api/auth/...`**

`POST /api/auth/login`
- **Dev mode:** validates username/password against `demo_users` table using bcrypt
- **Production mode:** calls `authenticateWithAD()` from `lib/ldap.ts`
- On success: issues a signed JWT with `{ userId, group, name, site }`, valid for 8 hours

`GET /api/auth/demo-users`
- Only active when `PING_DEV_BYPASS=true`
- Returns list of demo accounts (username, plaintext password, site, role) for the login page hints panel
- Returns empty array in production mode

`GET /api/auth/ping-login-url`
- Returns `{ devBypass: true }` in demo mode
- Returns `{ ldapMode: true }` in LDAP mode (tells the frontend to show the login form, not a Ping redirect)
- Returns `{ url, state }` if PingFederate is configured (for OIDC redirect flow)

`POST /api/auth/ping-exchange`
- Exchanges a PingFederate auth code for an app JWT
- Not in use currently — infrastructure for future PingFederate SSO

`GET /api/auth/me`
- Returns the current user's JWT payload
- Used by the frontend on page load to check if a stored token is still valid

---

#### `backend/src/routes/sto.ts`
**STO CRUD routes — `/api/sto/...`**
All routes require authentication (JWT).

`GET /api/sto`
- Returns all STOs, ordered by newest first
- Supports query filters: `?status=`, `?priority=`, `?search=` (searches STO ID, material, requestor)
- All users can call this — no role restriction

`GET /api/sto/audit-log`
- Returns the 20 most recent audit log entries across all STOs
- Used by the Dashboard Recent Activity panel

`GET /api/sto/:id`
- Returns full detail of one STO including its complete audit log
- 404 if not found

`POST /api/sto`
- Creates a new STO in `DRAFT` status
- Restricted to `receiving_site` role only
- Auto-generates a `sto_id` in format `STO-YYYY-NNNNN`
- Logs a `CREATED` audit entry

`PUT /api/sto/:id`
- Updates an existing STO
- Restricted to `receiving_site` role, only while status is `DRAFT`

---

#### `backend/src/routes/approvals.ts`
**Approval action routes — also mounted at `/api/sto/...`**
All routes require authentication (JWT).

`POST /api/sto/:id/submit`
- `receiving_site` only
- Moves STO from `DRAFT` → `PLANNING_REVIEW`

`POST /api/sto/:id/planning`
- `shipping_planning` only
- Requires MPN number, batch number, and expiration date to approve
- Approve → `SHIPPING_LOGISTICS`, Reject → `REJECTED`

`POST /api/sto/:id/logistics`
- `shipping_logistics` only
- Fills freight cost, container info, tracking
- Checks thresholds: if `material_value > $10,000` OR `freight_cost > $5,000` → `MANAGEMENT_REVIEW`, otherwise → `FINANCE_REVIEW`

`POST /api/sto/:id/management`
- `management` only
- Approve → `FINANCE_REVIEW`, Reject → `REJECTED`

`POST /api/sto/:id/finance`
- `finance` only
- Approve → `RECEIVING_LOGISTICS`, Reject → `REJECTED`

`POST /api/sto/:id/receiving-logistics`
- `receiving_logistics` only
- Fills actual receipt date
- If `delivery_closed_out = true` → `CLOSED`, otherwise stays in `RECEIVING_LOGISTICS`

All approval routes use `logAudit()` to write to `sto_audit_log`.

---

#### `backend/src/routes/analytics.ts`
**Analytics data routes — `/api/analytics/...`**
All routes require authentication. All routes accept the same filter query params:
- `?site=ABC` — filter by shipping or receiving site
- `?status=CLOSED` — filter by pipeline status
- `?rush=1` or `?rush=0` — filter by rush flag
- `?dateFrom=2025-01` and `?dateTo=2025-12` — filter by month range

`GET /api/analytics/summary`
— Totals: count by status, total/monthly material value, rush count, average days to close

`GET /api/analytics/by-status`
— Count and total value grouped by status (used for the donut chart)

`GET /api/analytics/by-month`
— Count and value per month, defaults to last 12 months (used for the trend line chart)

`GET /api/analytics/by-site`
— Top 10 shipping sites and top 10 receiving sites by volume (used for the site bar charts)

`GET /api/analytics/site-flow`
— Top 15 shipping→receiving site pairs by volume (used for the flow table)

`GET /api/analytics/rush-split`
— Rush vs. normal count per month; always shows both bars regardless of rush filter

`GET /api/analytics/raw-data`
— Paginated list of STOs (50 per page) matching current filters; used for the Analytics data table at the bottom

---

### Frontend

#### `frontend/vite.config.ts`
Vite build config. Sets React plugin. Frontend runs on port 5173.

#### `frontend/tailwind.config.js` / `postcss.config.js`
Tailwind CSS setup. No custom theme overrides — uses Tailwind defaults.

#### `frontend/tsconfig.json`
TypeScript config for the frontend. Targets modern browsers, strict mode on.

#### `frontend/index.html`
HTML shell. Single `<div id="root">` that React mounts into.

---

#### `frontend/src/main.tsx`
**React app entry point.**
Mounts `<App />` into `#root` wrapped in `React.StrictMode`.

---

#### `frontend/src/types/index.ts`
**Shared TypeScript types for the frontend.**
- `Group` — same 6 role keys as the backend
- `STOStatus` — same 8 pipeline stages as the backend
- `User` — shape of the decoded JWT (`userId`, `group`, `name`, `site`)
- `STORequest` — full shape of an STO object returned from the API (all ~50 columns typed)
- `AuditEntry` — shape of one audit log row

---

#### `frontend/src/api/client.ts`
**Axios HTTP client configuration.**
- Base URL: `http://localhost:4000/api`
- Request interceptor: automatically attaches `Authorization: Bearer <token>` from `localStorage` on every request
- Response interceptor: on any 401, clears the stored token and redirects to the login page

---

#### `frontend/src/context/AuthContext.tsx`
**Global authentication state.**
Wraps the entire app. Provides:
- `user` — decoded JWT payload, or null if not logged in
- `token` — raw JWT string
- `loading` — true while checking an existing token on mount
- `devBypassMode` — true in demo mode OR LDAP mode (both use the username/password form)
- `ldapMode` — true specifically in LDAP/AD mode (hides the demo accounts panel)
- `login(username, password)` — posts to `/auth/login`, stores token
- `exchangePingCode(code)` — posts to `/auth/ping-exchange` (PingFederate flow)
- `logout()` — clears token and user from state and localStorage

On mount: calls `/auth/ping-login-url` to detect which auth mode the backend is in.
On mount with existing token: calls `/auth/me` to validate the token is still good.

---

#### `frontend/src/App.tsx`
**Router and route protection.**
- `PingRedirect` component: checks `/auth/ping-login-url` — if a Ping URL is returned, redirects to it; otherwise navigates to `/login` (covers both LDAP and demo modes)
- `ProtectedRoute` component: shows spinner while loading, redirects unauthenticated users to login
- Route table:
  - `/login` — Login page (demo mode / LDAP mode)
  - `/auth/callback` — PingFederate callback handler
  - `/dashboard` — Dashboard (protected)
  - `/sto` — All STOs list (protected)
  - `/sto/new` — New STO form (protected)
  - `/sto/:id` — STO detail (protected)
  - `/analytics` — Analytics (protected)
  - `/` and `*` — redirect to dashboard if logged in, or to login/PingRedirect if not

---

#### `frontend/src/components/Layout.tsx`
**App shell — navigation bar + page wrapper.**
- Top nav bar with site logo, nav links (Dashboard, All STOs, Analytics, New Request)
- New Request link only shown to `receiving_site` role
- User's name, role, and site shown in a colored badge (color varies by role)
- Sign Out / Switch Group button (label depends on mode)
- Wraps page content in a max-width centered container

---

#### `frontend/src/components/StatusBadge.tsx`
**Reusable colored status and priority badges.**
- `StatusBadge` — renders a pill with the human-readable status label and a color coded to the stage (yellow for planning, teal for logistics, purple for finance, etc.)
- `PriorityBadge` — renders a pill for priority 1/2/3 (Urgent/Expedited/Standard) in red/orange/green

---

#### `frontend/src/pages/Login.tsx`
**Login page.**
- Username + password form
- In demo mode: shows a panel of demo accounts grouped by site, click any row to autofill credentials
- In LDAP mode: hides demo panel, shows "Sign in with your Active Directory credentials"
- Site filter tabs on the demo panel (ALL / ABC / ABL / XYZ)
- On success: navigates to `/dashboard`

---

#### `frontend/src/pages/PingCallback.tsx`
**PingFederate OIDC callback handler.**
- Reads `code` and `state` from URL params
- Validates `state` matches what was stored in `sessionStorage` (CSRF protection)
- Calls `exchangePingCode(code)` → navigates to dashboard
- Shows error screen if anything goes wrong
- Guards against React StrictMode double-fire in development

---

#### `frontend/src/pages/Dashboard.tsx`
**Main dashboard page.**

Sections:
- **Header** — greeting with user's name, role badge, site label, New Request button (receiving_site only)
- **KPI Cards** — My Queue count, Rush/Urgent count, Due This Week count, Overdue count
- **My Action Queue** — table of STOs needing the current user's action
  - Filtered by the user's role-appropriate status AND their site
  - Shipping roles (planning/logistics): shows STOs where `shipping_site = user.site`
  - Receiving roles (site/logistics): shows STOs where `receiving_site = user.site`
  - Management/Finance: shows all sites
  - Columns: STO ID, material, priority, need-by date, days waiting, Take Action button
  - Warns with ⚠ if an STO has been waiting 3+ days
- **Alerts** — Rush STOs and overdue STOs panels (shown across all sites)
- **Pipeline Overview** — clickable stage pills showing count at each stage; 🔥 if a stage has >3 STOs
- **Recent Activity** — last 8 audit log entries across the whole system
- **Upcoming Need-By Dates** — next 8 STOs with pending need-by dates, sorted soonest first

---

#### `frontend/src/pages/STOList.tsx`
**All STOs list page.**
- Shows every STO regardless of the user's site
- Filter bar: status, priority, search text
- Sortable table with pagination
- Clicking a row navigates to the STO detail page

---

#### `frontend/src/pages/STOForm.tsx`
**New STO creation form.**
- Only accessible to `receiving_site` role
- Multi-section form covering: request info, material details, shipping info, logistics options
- On submit: POST to `/api/sto`, then redirects to the new STO's detail page

---

#### `frontend/src/pages/STODetail.tsx`
**STO detail and action page.**
- Shows all fields of one STO
- Action panel on the right — shows role-appropriate action buttons based on current status and the user's group
- Each role sees only their relevant action (approve/reject, submit logistics, confirm receipt, etc.)
- Full audit trail at the bottom (every status change, who did it, when, any notes)

---

#### `frontend/src/pages/Analytics.tsx`
**Analytics dashboard.**

Filter bar at top:
- Site filter (dropdown)
- Status filter (dropdown)
- Rush filter (All / Rush only / Normal only)
- Date range (month pickers — From / To)
- Active filters shown as dismissible chips

Summary KPI cards:
- Total STOs, Active, Closed, Rejected, Total Value, Monthly Value, Rush %, Avg Days to Close

Charts (all respond to filter bar, all clickable to set a filter):
- **Status donut** — click a slice to filter by that status
- **Monthly trend** — line chart of STO count per month
- **Site volume** — bar chart of shipping sites; click a bar to filter by that site
- **Rush vs Normal** — stacked bar per month; click a bar to filter by rush/normal

Raw data table at the bottom:
- All STOs matching current filters, 50 rows per page with pagination
- Columns: STO ID, date, requestor, shipping site, receiving site, status, rush flag, material, value
- Clicking a row navigates to that STO's detail page

---

## Key Design Decisions

**Why Windows Authentication for SQL Server?**
The app runs on the same Windows machine as the SQL Server instance. Windows auth means no SQL username/password to manage or rotate — the app connects as the logged-in Windows user automatically.

**Why JWT instead of sessions?**
The frontend and backend run on separate ports (5173 and 4000). JWTs are stateless and work cleanly across origins without cookie/session complexity.

**Why ldapts instead of other LDAP libraries?**
`ldapts` is pure TypeScript with no native binaries — it installs without compilation issues on any machine. Other libraries (like `ldapjs`) require native compilation or don't support TypeScript well.

**Why is `site` stored in the JWT from AD groups?**
The user's home site is needed at login time to filter their Dashboard queue. Rather than querying the DB on every request, it's baked into the token from the AD group mapping.

**Why is management/finance cross-site?**
These approval roles are corporate-level — they may approve STOs for any facility. Keeping them cross-site avoids needing separate management accounts per facility.
