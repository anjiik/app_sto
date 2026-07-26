# Architecture

## High-level shape

```text
Browser ──HTTPS──▶ IIS (reverse proxy, /sto/)
                     │
                     ├─ static SPA (frontend/dist)
                     └─ /api/* ──▶ Node/Express backend (:4000)
                                      │
                                      ├─ SQL Server (data)
                                      └─ Active Directory / LDAP (auth)
```

- **IIS** terminates HTTPS, serves the built SPA under `/sto/`, and proxies `/api/*`
  to the backend. In dev, Vite serves the SPA and proxies `/api` to the backend
  directly.
- **Backend** is a stateless Express API; it issues JWTs and reads/writes SQL Server.
- **Auth** is JWT-based. Tokens are minted at login (from AD in production, from the
  `demo_users` table in dev) and verified on every request.

## Request lifecycle

1. The SPA sends `POST /api/auth/login`. The backend authenticates and returns a JWT
   whose payload carries the user's **grants** (`{role, site}` pairs) plus derived
   `group`/`site`/`sites`.
2. The SPA stores the token and sends it as a `Bearer` header on subsequent calls.
3. `authenticate` middleware verifies the token and attaches `req.user`.
4. Route handlers authorise using the grant-aware helpers (`can`, `hasRole`,
   `hasRoleAtSite`, `isAdmin`) before reading/writing data.

## Authorization model

Access is a list of **grants**. A site-scoped action requires the matching role
**and** site on the same grant; `admin` is company-wide and bypasses site checks. See
[Reference → Roles & access](../reference/roles.md) for the model and
[Backend](backend.md) for the helpers.

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router, Recharts.
- **Backend:** Node.js ≥ 20, Express, TypeScript, Pino, Helmet, express-rate-limit,
  Zod.
- **Database:** SQL Server (`msnodesqlv8`, Windows Authentication).
