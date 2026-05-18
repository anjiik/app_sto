# STO Management App — Handoff Document

## What this project is

A full-stack Stock Transfer Order (STO) management system for a pharmaceutical/supply chain company.
Built from photos of an existing Excel-based tracker and a swim-lane approval flowchart.
Demo mode — no Active Directory yet; AD integration is the planned next step.

---

## Tech stack

| Layer      | Choice                              | Port  |
|------------|-------------------------------------|-------|
| Frontend   | React + TypeScript + Vite + Tailwind | 5173  |
| Backend    | Node.js + Express + TypeScript       | 4000  |
| Database   | External Microsoft SQL Server (mssql)| 1433  |
| Auth       | JWT (8h expiry), hardcoded demo users| —     |

---

## Project location

```
/Users/anjalikumari/Documents/sto-management/
├── backend/
│   ├── src/
│   │   ├── index.ts                  — Express entry point
│   │   ├── types/index.ts            — Shared TypeScript types
│   │   ├── db/
│   │   │   ├── connection.ts         — SQL Server pool (mssql)
│   │   │   └── schema.sql            — Run this once against your DB
│   │   ├── middleware/
│   │   │   └── auth.ts               — JWT verify + requireRole()
│   │   └── routes/
│   │       ├── auth.ts               — POST /login, GET /me, GET /demo-users
│   │       ├── sto.ts                — GET/POST/PUT /sto and /sto/:id
│   │       └── approvals.ts          — POST /sto/:id/{submit,inventory,management,finance,shipment}
│   ├── .env.example                  — Copy to .env and fill in DB details
│   └── package.json
└── frontend/
    └── src/
        ├── App.tsx                   — Router + ProtectedRoute
        ├── context/AuthContext.tsx   — Login state, token storage
        ├── api/client.ts             — Axios instance with JWT header
        ├── types/index.ts            — STORequest, User, AuditEntry types
        ├── components/
        │   ├── Layout.tsx            — NavBar + page wrapper
        │   └── StatusBadge.tsx       — Status + Priority colored badges
        └── pages/
            ├── Login.tsx             — Login form + clickable demo user panel
            ├── Dashboard.tsx         — Role-specific pending action alerts + stats
            ├── STOList.tsx           — Filterable table (status, priority, search)
            ├── STOForm.tsx           — Full STO creation form (all fields from spec)
            └── STODetail.tsx         — View STO + inline approval actions + audit log
```

---

## Demo users (hardcoded in backend/src/routes/auth.ts)

| Username     | Password  | Role               | Plant   |
|--------------|-----------|--------------------|---------|
| admin        | admin123  | admin              | ALL     |
| requestor1   | pass123   | requestor          | Plant A |
| requestor2   | pass123   | requestor          | Plant B |
| inventory1   | pass123   | inventory_reviewer | ALL     |
| manager1     | pass123   | management         | ALL     |
| finance1     | pass123   | finance            | ALL     |
| logistics1   | pass123   | logistics          | ALL     |

These are shown on the login page — click a row to auto-fill credentials.

---

## Role permissions (what each role can do)

| Action                    | requestor | inventory_reviewer | management | finance | logistics | admin |
|---------------------------|:---------:|:-----------------:|:----------:|:-------:|:---------:|:-----:|
| Create STO                | ✓ own     |                   |            |         |           | ✓     |
| Edit STO (DRAFT only)     | ✓ own     |                   |            |         |           | ✓     |
| Submit for review         | ✓ own     |                   |            |         |           | ✓     |
| View all STOs             |           | ✓                 | ✓          | ✓       | ✓         | ✓     |
| View own STOs             | ✓         |                   |            |         |           |       |
| Inventory approve/reject  |           | ✓                 |            |         |           | ✓     |
| Management approve/reject |           |                   | ✓          |         |           | ✓     |
| Finance approve/reject    |           |                   |            | ✓       |           | ✓     |
| Update shipment details   |           |                   |            |         | ✓         | ✓     |

---

## STO status machine

```
DRAFT
  └─ submit ──→ SUBMITTED
                  └─ inventory approve ──→ MANAGEMENT_REVIEW (if mgmt required)
                                       └─ FINANCE_REVIEW (if no mgmt required)
                  └─ inventory reject  ──→ REJECTED

MANAGEMENT_REVIEW
  └─ management approve ──→ FINANCE_REVIEW
  └─ management reject  ──→ REJECTED

FINANCE_REVIEW
  └─ finance approve ──→ APPROVED
  └─ finance reject  ──→ REJECTED

APPROVED  ──→ SHIPPING ──→ IN_TRANSIT ──→ DELIVERED ──→ CLOSED
              (logistics updates shipment fields at each step)
```

**Management approval auto-triggers when:**
- Material Value > $10,000  (env: MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD)
- Freight Cost > $5,000     (env: MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD)

---

## API routes

```
POST   /api/auth/login            — { username, password } → { token, user }
GET    /api/auth/me               — returns current user from JWT
GET    /api/auth/demo-users       — returns demo account list (for login UI)

GET    /api/sto                   — list STOs (role-filtered; query: status, priority, search)
POST   /api/sto                   — create STO (requestor/admin only)
GET    /api/sto/:id               — full STO detail + audit_log[]
PUT    /api/sto/:id               — update (DRAFT only, own record or admin)

POST   /api/sto/:id/submit        — requestor submits DRAFT
POST   /api/sto/:id/inventory     — { approved: bool, notes: string }
POST   /api/sto/:id/management    — { approved: bool, notes: string }
POST   /api/sto/:id/finance       — { approved: bool, notes: string }
POST   /api/sto/:id/shipment      — { sto_number, shipment_id, tracking_id, pgi_date,
                                      actual_ship_date, actual_receipt_date,
                                      ready_to_ship, delivery_closed_out,
                                      corporate_sto_tracker_status }
GET    /api/health                — { status: "ok" }
```

---

## First-time setup (requires Node.js)

Node.js is NOT installed on this Mac yet. Install it first:

```bash
# Option A — Homebrew
brew install node

# Option B — download from nodejs.org
```

Then:

```bash
cd /Users/anjalikumari/Documents/sto-management

# 1. Configure SQL Server
cp backend/.env.example backend/.env
# Edit backend/.env — fill in DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD

# 2. Run schema against your SQL Server (SSMS or Azure Data Studio)
#    File: backend/src/db/schema.sql

# 3. Install and run
cd backend && npm install && npm run dev &
cd ../frontend && npm install && npm run dev
```

Open http://localhost:5173

---

## Known gaps / what to build next

1. **Edit STO page** — STOForm.tsx is create-only; a PUT form for DRAFT editing needs to be added.
   Route `/sto/:id/edit` is linked from STODetail but the page doesn't exist yet.

2. **Admin panel** — `/admin` route is in the nav for admin users but has no page.
   Needs: user list view, threshold config editor (reads/writes `sto_config` SQL table).

3. **Email notifications** — No emails sent on status changes yet.
   Suggested: nodemailer hook in `approvals.ts` after each `updateStatus()` call.

4. **Active Directory auth** — In `backend/src/routes/auth.ts`, replace the `DEMO_USERS` array
   and the direct password comparison with an LDAP/AD call (use `ldapjs` or `passport-azure-ad`).
   The JWT payload shape is already designed to match what AD groups will provide.
   Map AD group names → role strings: `requestor`, `inventory_reviewer`, `management`, `finance`, `logistics`, `admin`.

5. **Pagination** — STOList fetches all records; add `OFFSET/FETCH NEXT` SQL pagination for large datasets.

6. **PDF/export** — No export capability yet.

7. **Rush request 15-day SLA tracking** — Dates are captured but no SLA alert logic exists.

---

## Database schema summary (SQL Server)

Three tables:
- `sto_requests` — main record (all form fields + status + approval columns)
- `sto_audit_log` — append-only log of every status change and action
- `sto_config` — key/value config (approval thresholds); pre-seeded in schema.sql

No FK to a users table — user info is denormalized into `sto_requests` from the JWT at write time.
This is intentional so the table is self-contained even after AD migration.

---

## Environment variables (backend/.env)

```
JWT_SECRET=<long random string>
PORT=4000
DB_SERVER=<your sql server hostname or IP>
DB_DATABASE=sto_management
DB_USER=<sql user>
DB_PASSWORD=<sql password>
DB_PORT=1433
DB_TRUSTED_CONNECTION=false
DB_TRUST_SERVER_CERT=true
MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD=10000
MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD=5000
```

---

## Key design decisions made in this session

- **Demo users in-memory, not SQL** — avoids chicken-and-egg (can't log in without DB).
  Makes it easy to demo without configuring SQL first.
- **No bcrypt for demo** — plain password comparison to keep demo readable.
  Comment in auth.ts flags where to add bcrypt for production.
- **User info denormalized into STO records** — requestor name/email copied at create time
  so records remain readable after AD user changes.
- **Management approval auto-computed on create/edit** — not manually set by requestor.
  Thresholds are env-configurable.
- **Audit log on every status transition** — append-only, shown in STODetail.
