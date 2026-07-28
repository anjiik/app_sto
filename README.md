# STO Management System

Web application for creating, approving, and tracking **Stock Transfer Orders (STOs)**
between sites, with role-based access and a multi-step approval workflow.

| | |
|---|---|
| **Frontend** | React 18 · TypeScript · Vite (served under `/sto/`) |
| **Backend** | Node.js ≥ 20 · Express · TypeScript · JWT |
| **Database** | SQL Server |
| **Auth** | Active Directory / LDAP (production) · demo-user table (local dev) |

## Features

- Multi-step STO approval workflow (planning → logistics → management → receiving)
- Role-based access with **multi-role, multi-site** support (a user can hold several roles across sites)
- Automatic routing to dual management review (shipping + receiving side) for high-value, cold-chain, controlled, or non-standard shipments
- Dashboards, list filters, CSV export, and analytics
- Admin tools: revert / send-back and data archiving

## Quick start (local dev)

Requires **Node.js ≥ 20** and a reachable **SQL Server** instance.

**1. Database** — run the schema, e.g. via `sqlcmd` or SSMS:

```bash
sqlcmd -S localhost -i backend/src/db/schema.sql
```

**2. Backend**

```bash
cd backend
cp .env.example .env      # set DB connection; use DEV_BYPASS=true for demo login
npm install
npm run seed              # loads demo users + sample data (dev only)
npm run dev               # http://localhost:4000
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173 (proxies /api to the backend)
```

Open the app and sign in with a demo account — all demo users use the password
**`Demo123!`** and are listed clickably on the login screen (e.g. `abc.recv`, `admin`).

## Documentation

Full documentation lives in the **`docs/`** site (built with [MkDocs](https://www.mkdocs.org/)):

```bash
pip install mkdocs-material
mkdocs serve              # http://localhost:8000
```

It covers:

- **User Guide** — creating requests, approvals, dashboards, and closeout
- **Administration** — deployment (IIS + PM2), database & migrations, and Active Directory group setup
- **Reference** — roles & the multi-role grants model, the approval workflow & statuses, and approval rules
- **Development** — architecture, backend/frontend structure, and database conventions

The `docs/` site is the single source of truth for how the system works.

## Repository layout

```
backend/     Express + TypeScript API (routes, LDAP group map, migrations, seed)
frontend/    React + Vite SPA (served under /sto/)
docs/        MkDocs documentation site
```
