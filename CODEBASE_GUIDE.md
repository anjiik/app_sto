# STO Management System — Complete Codebase Guide

---

## Table of Contents

1. [Full Architecture](#1-full-architecture)
2. [Code — Every File, Explained in Depth](#2-code--every-file-explained-in-depth)
3. [CS Fundamentals Touched](#3-cs-fundamentals-touched)
4. [UI — Every Screen Explained](#4-ui--every-screen-explained)

---

## 1. Full Architecture

### What the system does

This is a **Stock Transfer Order (STO) management system** — a web app for routing material transfer requests through a multi-step approval workflow across company sites. A receiving site raises a request, and it flows through: Shipping Planning → Shipping Logistics → (optional) Management → Finance → Receiving Logistics, then closes.

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 + TypeScript + Vite | SPA, fast HMR, type safety |
| Styling | Tailwind CSS | Utility-first, no CSS files to maintain |
| Charts | Recharts | Composable React chart library |
| Routing | React Router v6 | Client-side navigation |
| HTTP client | Axios | Interceptors, clean instance config |
| Backend | Express + TypeScript | Minimal, explicit, good TS support |
| Database | SQL Server (msnodesqlv8) | Existing company infrastructure, Windows Auth |
| Auth | JWT + LDAP (ldapts) | Stateless API tokens, AD identity |
| Logging | pino + pino-http | Structured JSON logs, low overhead |
| Security | Helmet, express-rate-limit | HTTP headers, request throttling |
| Validation | Zod | Schema-first, runtime-safe |
| Process mgr | PM2 (production) | Windows service, auto-restart |
| Reverse proxy | IIS ARR (production) | HTTPS termination, port 80/443 |

### Network Topology (Production)

```
Internet / Company LAN
        │
        ▼
  IIS ARR (port 443, HTTPS)
  ┌─────────────────────────────────┐
  │  /api/*  ──► Node.js :4000      │
  │  /*      ──► static dist/       │
  └─────────────────────────────────┘
        │
        ├──► SQL Server (Windows Auth, named pipe / TCP)
        │
        └──► Active Directory LDAP (port 389 / 636)
```

The browser never talks directly to port 4000 or to the database. IIS is the only publicly reachable port. The Node.js server and SQL Server live on the same domain-joined Windows box (or LAN), so Windows Authentication works without a password in the connection string.

### Repository Layout

```
sto-management/
├── backend/
│   └── src/
│       ├── index.ts              ← Express server entry point
│       ├── types/index.ts        ← Shared TypeScript types
│       ├── lib/
│       │   ├── ldap.ts           ← Active Directory auth
│       │   └── logger.ts         ← pino instance
│       ├── middleware/
│       │   ├── auth.ts           ← JWT verify + is_active check
│       │   └── rateLimits.ts     ← apiLimit + writeLimit
│       ├── db/
│       │   ├── connection.ts     ← Pool, queries, transactions
│       │   ├── audit.ts          ← logAudit() helper
│       │   ├── adminAudit.ts     ← logAdminAction() helper
│       │   ├── schema.sql        ← Full DB schema
│       │   ├── seed.ts           ← Demo data seeder
│       │   └── migrations/
│       │       ├── 001_performance.sql
│       │       ├── 003_app_users.sql
│       │       ├── 004_admin_audit.sql
│       │       └── 005_fk_constraints.sql
│       └── routes/
│           ├── auth.ts           ← /api/auth/*
│           ├── sto.ts            ← /api/sto/*
│           ├── approvals.ts      ← /api/sto/:id/submit|planning|...
│           ├── analytics.ts      ← /api/analytics/*
│           ├── users.ts          ← /api/users/*
│           └── sites.ts          ← /api/sites
└── frontend/
    └── src/
        ├── main.tsx              ← React entry, mounts App
        ├── App.tsx               ← Router + route guards
        ├── vite-env.d.ts         ← Vite env type declarations
        ├── api/client.ts         ← Axios instance
        ├── context/
        │   └── AuthContext.tsx   ← Global auth state
        ├── types/index.ts        ← Shared frontend types
        ├── components/
        │   ├── Layout.tsx        ← Nav + page wrapper
        │   └── StatusBadge.tsx   ← Status + priority chips
        └── pages/
            ├── Login.tsx
            ├── SitePicker.tsx
            ├── Dashboard.tsx
            ├── STOList.tsx
            ├── STOForm.tsx       ← Create + Edit
            ├── STODetail.tsx
            ├── Analytics.tsx
            └── UserManagement.tsx
```

### Data Flow — Login

```
User types credentials
    │
    ▼
POST /api/auth/login
    │
    ├─► DEV_BYPASS=true?
    │       └─► bcrypt.compare() against demo_users table
    │
    └─► Production?
            └─► ldapts binds to AD with service account
                searches for user by UPN / sAMAccountName
                asserts memberOf LDAP_APP_GROUP
                binds again as the user (password check)
                        │
                        ▼
                app_users table lookup
                (auto-create on first login, site=null)
                        │
                        ▼
                jwt.sign({ userId, group, name, site })
                        │
                        ▼
                { token, user } returned to browser
                token stored in localStorage
```

### Data Flow — Authenticated Request

```
Browser
  └─► axios: GET /api/sto?status=PLANNING_REVIEW
        Authorization: Bearer <JWT>
              │
              ▼
        authenticate() middleware
              │
          jwt.verify() checks signature + expiry
              │
          SELECT is_active FROM app_users WHERE id=?
              │
          passes req.user = { userId, group, name, site }
              │
              ▼
        route handler
              │
          applyRoleScope() — injects mandatory WHERE clause
              │
          SQL query with parameterised inputs
              │
          JSON response
```

### The Approval State Machine

```
DRAFT
  └─► [receiving_site submits]
        ▼
  PLANNING_REVIEW
    ├─► [rejected] ──► REJECTED (terminal)
    └─► [approved]
          ▼
    SHIPPING_LOGISTICS
          │
    freight_cost > $5k OR material_value > $10k?
    ├─ YES ──► MANAGEMENT_REVIEW
    │              ├─► [rejected] ──► REJECTED
    │              └─► [approved]
    └─ NO ──────────────────────┐
                                ▼
                          FINANCE_REVIEW
                            ├─► [rejected] ──► REJECTED
                            └─► [approved]
                                  ▼
                          RECEIVING_LOGISTICS
                                  │
                          delivery_closed_out = true?
                            └─► CLOSED (terminal)

Admin can revert any step using the audit log's old_status.
```

---

## 2. Code — Every File, Explained in Depth

### `backend/src/types/index.ts`

This file is the **contract** the entire backend agrees on. Everything typed here is imported across routes, middleware, and the DB layer.

```typescript
export type Group = 'receiving_site' | 'shipping_planning' | ...
```

A **union type** — TypeScript will refuse to compile if you pass any string not in this list. You can't accidentally introduce a typo like `'recieving_site'`. The seven values map exactly to the seven roles in the system.

```typescript
export type STOStatus = 'DRAFT' | 'PLANNING_REVIEW' | ...
```

Same idea for workflow status. The state machine only allows these eight states. When the database returns a string like `'PLANNING_REVIEW'`, we cast it to `STOStatus` at the boundary, and from that point TypeScript enforces correctness.

```typescript
export interface JwtPayload {
  userId: number;
  group: Group;
  name: string;
  site: string | null;
}
```

This is exactly what gets encoded into the JWT. `site` is `null` for a user who hasn't completed setup yet. Every route that reads `req.user` gets these four fields — no database lookup needed for basic auth decisions.

---

### `backend/src/lib/logger.ts`

```typescript
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } }
  }),
});
```

**pino** is a structured logger — it outputs JSON by default, which tools like Kibana, Splunk, or Datadog can ingest and query. In dev, `pino-pretty` takes that JSON and reformats it into readable coloured text. In production the JSON goes to stdout, where PM2 or your log aggregator picks it up.

The spread `...(condition && { key: value })` is a JavaScript trick — if the condition is false, `false && {...}` is `false`, and spreading `false` into an object produces nothing. So in production, no transport key is set at all.

---

### `backend/src/middleware/rateLimits.ts`

```typescript
export const apiLimit  = rateLimit({ windowMs: 15*60*1000, max: 500, ... });
export const writeLimit = rateLimit({ windowMs: 15*60*1000, max: 60,  ... });
```

Two separate limits because reads and writes have different acceptable rates. A legitimate user might load the analytics page many times. But 60 approval or user-management actions in 15 minutes is already implausibly high — any more is likely a bot or a broken client retrying in a loop. The `standardHeaders: true` flag sends `RateLimit-*` headers so the client knows how long to back off.

---

### `backend/src/db/connection.ts`

This is the heart of the backend's database layer. It does three things: manages a connection pool, provides typed query helpers, and implements transactions.

#### The Singleton Pool

```typescript
let poolPromise: Promise<sql.ConnectionPool> | null = null;

function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = pool.connect().catch(err => {
      poolPromise = null;  // reset so the next call retries
      throw err;
    });
  }
  return poolPromise;
}
```

`poolPromise` is a module-level variable — because Node.js modules are singletons (loaded once, cached), this variable persists for the lifetime of the process. The first call to `getPool()` creates the pool and stores the promise. Every subsequent call returns the same promise. This is the **Singleton pattern**: one pool shared across all requests.

The `.catch` block that sets `poolPromise = null` is critical: if the initial connection fails (SQL Server not running, wrong credentials), the promise rejects. Without resetting to null, every future call would return the same rejected promise and the server could never recover. Resetting allows the next request to try again.

#### The Query Helpers

```typescript
export async function dbQuery<T>(queryStr: string, params = {}): Promise<T[]>
export async function dbQueryOne<T>(queryStr: string, params = {}): Promise<T | undefined>
export async function dbExecute(queryStr: string, params = {}): Promise<void>
```

These three functions are the entire surface area for 95% of DB operations. They use **generic types** (`<T>`) so callers get type-safe results:

```typescript
const user = await dbQueryOne<{ is_active: number }>('SELECT is_active FROM ...');
// TypeScript knows user?.is_active is a number, not `unknown`
```

Internally, each helper calls `makeRequest()` which iterates the params object and calls `req.input(key, val)` for each one. This is **parameterised queries** — the mssql library sends the query and params separately to SQL Server, which processes them independently. The data can never escape into the SQL string and become executable code (SQL injection prevention).

#### Transactions

```typescript
export type TxExecutor = (query: string, params?: Record<string, unknown>) => Promise<void>;

export async function withTransaction(fn: (execute: TxExecutor) => Promise<void>): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const execute: TxExecutor = async (queryStr, params = {}) => { ... };
    await fn(execute);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
```

This is a **higher-order function** — `withTransaction` accepts a function `fn` and calls it with a special `execute` helper that runs queries inside the transaction. The caller never sees the transaction object:

```typescript
await withTransaction(async (execute) => {
  await execute('UPDATE sto_requests SET status = @s WHERE id = @id', { s, id });
  await logAudit(..., execute);  // runs in the same transaction
});
```

If the `UPDATE` succeeds but the audit log `INSERT` throws, `withTransaction`'s catch block calls `transaction.rollback()` — both operations are cancelled. The database is never left in a state where status changed but no audit record exists. This is the **atomicity** guarantee from ACID.

---

### `backend/src/db/audit.ts` and `adminAudit.ts`

These are thin helpers that exist so audit logic isn't duplicated across every route file.

`logAudit` accepts an optional `execute` parameter that defaults to `dbExecute`. When called from inside a `withTransaction` callback, you pass the transaction's executor so the audit write participates in the same transaction. When called standalone (e.g. after `POST /api/sto` creates a DRAFT), it uses the default `dbExecute` directly.

`logAdminAction` is simpler — admin changes (role/site/active) don't happen inside a transaction because the UPDATE to `app_users` uses `dbExecute` directly, and the audit write is a separate call after. If the audit write fails, the update already committed — this is an acceptable tradeoff for admin actions (the change succeeded; the audit log entry is best-effort).

---

### `backend/src/lib/ldap.ts`

This file handles everything related to Active Directory authentication.

#### Username normalisation

```typescript
function toUPN(username: string): string {
  if (username.includes('@')) return username;           // already john@company.com
  if (username.includes('\\')) return `...@${LDAP_DOMAIN}`; // DOMAIN\john → john@company.com
  return `${username}@${LDAP_DOMAIN}`;                  // john → john@company.com
}
```

AD accepts logins in multiple formats. Users might type `john`, `john@company.com`, or `COMPANY\john`. These normalisation functions ensure the LDAP queries always use the right format regardless of what the user typed.

#### LDAP injection prevention

```typescript
function escapeLdap(value: string): string {
  return value.replace(/[\\()*\x00]/g, ch =>
    `\\${ch.charCodeAt(0).toString(16).padStart(2, '0')}`
  );
}
```

LDAP filter strings have special characters just like SQL. `(` `)` `*` `\` and null bytes would break or manipulate the filter. This function encodes them as `\XX` hex escapes per RFC 4515 before embedding the username into the search filter.

#### Two-step auth flow (service account mode)

1. Bind to AD with a read-only service account
2. Search for the user by UPN or sAMAccountName
3. Assert the user is a member of `LDAP_APP_GROUP`
4. Bind again as the actual user using their DN and entered password
5. If that bind succeeds, the password is correct

The service account search is necessary because AD doesn't let you search as an anonymous user. The second bind as the actual user is the password check — LDAP doesn't have a "verify password" API; the only way to check a password is to attempt a bind.

#### Group membership check

```typescript
function assertGroupMembership(entry: Record<string, unknown>): void {
  const memberOf = entry.memberOf
    ? (Array.isArray(entry.memberOf) ? entry.memberOf : [entry.memberOf]) as string[]
    : [];
  const groupCNs = memberOf.map(extractCN);
  const isMember = groupCNs.some(cn => cn.toLowerCase() === LDAP_APP_GROUP.toLowerCase());
  if (!isMember) throw new Error('not authorised...');
}
```

`memberOf` is an LDAP multi-value attribute. When a user is in one group it comes back as a string; when they're in multiple groups it comes back as an array. The `Array.isArray` check normalises both cases. `extractCN` strips the Distinguished Name (`CN=STO_App_Users,OU=Groups,...`) down to just the Common Name (`STO_App_Users`) for comparison.

---

### `backend/src/middleware/auth.ts`

```typescript
export async function authenticate(req, res, next): Promise<void> {
  const token = header.slice(7);  // strip "Bearer "
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
  const appUser = await dbQueryOne<{ is_active: number }>(
    'SELECT is_active FROM app_users WHERE id = @id', { id: payload.userId }
  );
  if (!appUser || !appUser.is_active) {
    res.status(401).json({ message: 'Account disabled or not found' }); return;
  }
  req.user = payload;
  next();
}
```

Every protected route runs this function first. It does two things:

1. **JWT verification** — `jwt.verify` checks the signature (was this token signed by us?) and expiry (is it still valid?). If either fails, it throws and the catch block returns 401. This is stateless — no session lookup.

2. **Live `is_active` check** — even if the JWT is valid and unexpired (up to 8 hours old), we check the database. This is how account deactivation takes effect immediately: an admin flips `is_active = 0`, and the user's next API request fails, even if their token doesn't expire for 7 more hours.

```typescript
export function can(user: JwtPayload, ...groups: Group[]): boolean {
  return user.group === 'admin' || groups.includes(user.group);
}
```

This is the entire authorization model. `admin` has unconditional access to everything. Every other check is a group membership test. Called like `can(user, 'management', 'finance')` — returns true if the user is admin, management, or finance. Used throughout routes like a permission check that reads naturally in English.

---

### `backend/src/routes/auth.ts`

#### First-login auto-creation with race condition handling

```typescript
try {
  const [created] = await dbQuery<AppUserRow>(`INSERT INTO app_users ... OUTPUT INSERTED.*`, {...});
  appUser = created;
} catch (insertErr: any) {
  const isDuplicate = insertErr.number === 2627 || insertErr.number === 2601 || ...;
  if (!isDuplicate) throw insertErr;
  appUser = await dbQueryOne<AppUserRow>('SELECT ... WHERE ad_username = @adUsername', {...});
}
```

When a user logs in for the first time, we INSERT into `app_users`. But what if they open the login page in two tabs and click Sign In simultaneously? Both requests reach the INSERT at the same time. The first one succeeds; the second one violates the `UNIQUE INDEX UQ_app_users_username` and gets SQL error 2627. Without the catch, the second tab would return a 500 error. With it, we detect the duplicate key error and fall back to a SELECT — getting the row the first request already created. This is the **optimistic concurrency** pattern: try first, handle the conflict on failure.

#### `POST /api/auth/setup-site`

Called when a user has `site: null` in their token. The frontend shows SitePicker, which posts the chosen site. This endpoint:
1. Verifies the site code exists in the `sites` table
2. Updates `app_users`
3. Issues a **new JWT** with `site` now populated

After this, the user has a valid token with a site, and `SiteRequired` on the frontend lets them through.

---

### `backend/src/routes/sto.ts`

#### `normalizeSto()`

```typescript
const BOOL_COLS = new Set(['rush_request', 'planning_approved', ...]);

function normalizeSto(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const col of BOOL_COLS) {
    if (col in out && out[col] !== null) out[col] = Boolean(out[col]);
  }
  return out;
}
```

SQL Server BIT columns return as `1` or `0` in JavaScript. The frontend expects `true`/`false`. Rather than converting each column individually in 15 different places, this function runs once on every row returned and converts all known boolean columns. `Set` is used for O(1) lookup — checking whether a column name is in the set is instant regardless of how many columns are in the set.

#### Server-side site scoping

```typescript
if (can(user, 'management', 'finance')) {
  // let them filter by site if they want, but no forced condition
  if (site) { conditions.push('(shipping_site = @site OR receiving_site = @site)'); ... }
} else if (can(user, 'shipping_planning', 'shipping_logistics')) {
  conditions.push('shipping_site = @enforced_site');
  params.enforced_site = user.site;
} else {
  conditions.push('receiving_site = @enforced_site');
  params.enforced_site = user.site;
}
```

This block appears in GET `/api/sto`, GET `/api/sto/kpis`, and all analytics routes. The key insight: for restricted roles, we don't read the client's `site` query param at all — we read `user.site` from the JWT, which the client cannot modify. Even if a shipping planner manually crafts a request with `?shipping_site=OTHER_SITE`, the condition added to the SQL always uses their own site. The security is in the server, not the client.

#### `GET /api/sto/export`

This route sits **before** `GET /api/sto/:id` in the file. Express matches routes in registration order, so if `/export` were registered after `/:id`, Express would treat `export` as an id value and call the wrong handler. Route ordering in Express is significant.

#### Zod validation

```typescript
const createStoSchema = stoBaseObject.refine(
  data => !data.rush_request || !!data.rush_reason,
  { message: 'Rush reason is required when submitting a rush request', path: ['rush_reason'] }
);
```

Zod validates the request body **before** it reaches the database. `.refine()` adds a cross-field rule that base schema types can't express: if `rush_request` is true, `rush_reason` must be present. If validation fails, a structured error response is returned immediately, with field paths so the frontend can highlight the correct form fields.

---

### `backend/src/routes/approvals.ts`

Every route here follows the same pattern:

1. Role check via `can()`
2. Parse and validate the request ID
3. Fetch the current STO to confirm it's in the expected status
4. `withTransaction` wraps the UPDATE + audit log
5. Return the new status

The wrapping in `withTransaction` means the status change and its audit record are always written together or not at all. If you look at the audit log, every status transition is there, no gaps.

The `POST /api/sto/:id/revert` endpoint (admin only) reads the most recent audit log entry's `old_status` to know where to go back. It writes a new `REVERTED` audit entry rather than deleting existing ones — the full history is always preserved.

---

### `backend/src/routes/analytics.ts`

#### `buildFilters()` vs `applyRoleScope()`

These two functions have different jobs and must be called in the right order:

`buildFilters(q)` reads **client-supplied** query params and builds optional conditions. These are additive — if you pass no filters you get everything in scope.

`applyRoleScope(user, conds, params)` reads **server-authoritative** data (the JWT payload) and adds a mandatory condition. This runs after `buildFilters` so it can push onto the same `conds` array. For management/finance it returns early (no condition added). For all others it adds a non-negotiable condition.

The final WHERE clause ANDs all conditions together. So a shipping planner who also filters by status gets: `shipping_site = @enforced_site AND status = @status` — both apply simultaneously.

---

### `frontend/src/api/client.ts`

```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('sto_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

A single Axios **instance** is created and exported. All frontend code imports this one object — you never need to remember to attach the auth header, set the base URL, or handle the token. The request interceptor runs before every outgoing request and automatically attaches the token if one is stored.

`VITE_API_URL || '/api'` means: in production (served from same origin behind IIS), relative `/api` works perfectly. In development (frontend on :5173, backend on :4000), you set `VITE_API_URL=http://localhost:4000/api` in `.env.local` and it proxies correctly.

---

### `frontend/src/context/AuthContext.tsx`

```typescript
const [user, setUser]   = useState<User | null>(null);
const [token, setToken] = useState<string | null>(localStorage.getItem('sto_token'));
const [loading, setLoading] = useState(true);
```

On mount, it reads the token from localStorage. If a token exists, it calls `GET /api/auth/me` to validate it and get the user object. If the token is expired or invalid, the server returns 401, the catch block clears the token, and the user is treated as unauthenticated. This means page refreshes don't log you out as long as your token is valid.

The `updateSession` function exists for the SitePicker — when setup-site returns a new token with site populated, we need to update both the stored token and the in-memory user object simultaneously, without logging out and back in.

---

### `frontend/src/App.tsx`

```typescript
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function SiteRequired({ children }) {
  const { user } = useAuth();
  if (!user?.site) return <Navigate to="/setup-site" replace />;
  return <>{children}</>;
}
```

Two wrapper components that act as **route guards**. Every protected page is wrapped in both:

```typescript
<ProtectedRoute><SiteRequired><Dashboard /></SiteRequired></ProtectedRoute>
```

This creates a chain: `ProtectedRoute` checks authentication → `SiteRequired` checks site setup → page renders. Neither wrapper does a network call — they read from the in-memory context, so the check is instant.

The `loading` check in `ProtectedRoute` is essential: on first load, the auth context hasn't finished validating the token yet (`loading=true`). Without this check, every page refresh would flash the login page for a fraction of a second before redirecting to the dashboard.

---

### `frontend/src/pages/Login.tsx`

The login form is straightforward. The demo accounts panel is more interesting:

```typescript
useEffect(() => {
  api.get('/auth/demo-users').then(r => setDemoUsers(r.data)).catch(() => {});
}, []);
```

In production mode, `GET /api/auth/demo-users` returns `[]` — the panel renders nothing and doesn't appear. In dev mode it returns all demo credentials. Users can click any row to auto-fill the form. The `.catch(() => {})` means if this call fails for any reason, the login form still works normally — the demo panel just doesn't appear.

---

### `frontend/src/pages/Dashboard.tsx`

The dashboard fires **six parallel requests** on mount using `Promise.all`:

```typescript
Promise.all([
  api.get('/analytics/by-status'),   // pipeline stage counts
  api.get(`/sto?status=...`),        // my action queue
  api.get('/sto/kpis'),              // KPI numbers
  api.get(`/sto?rush_only=1...`),    // rush alerts
  api.get(`/sto?has_need_by=1...`),  // need-by dates
  api.get('/sto/audit-log'),         // recent activity
])
```

`Promise.all` fires all six simultaneously and waits for all to complete before setting any state. Total load time = slowest query, not sum of all queries. If any one fails, the entire `.catch` block runs. This is a deliberate trade-off: atomic success or failure rather than partially rendered data.

The `GROUP_QUEUE` map:
```typescript
const GROUP_QUEUE: Partial<Record<Group, { label: string; statuses: STOStatus[] }>> = {
  shipping_planning: { label: '...', statuses: ['PLANNING_REVIEW'] },
  ...
}
```

`Partial<Record<...>>` means not all Groups are keys — `admin` is deliberately absent because admins don't have a specific queue. When `GROUP_QUEUE[user.group]` is undefined for an admin, the queue section simply doesn't render.

---

### `frontend/src/pages/STOForm.tsx`

```typescript
const { id } = useParams<{ id?: string }>();
const isEdit = !!id;

useEffect(() => {
  if (!isEdit) return;
  api.get(`/sto/${id}`).then(r => {
    reset(formData);  // React Hook Form's reset populates all fields
  });
}, [id, isEdit, reset]);
```

One component handles both Create and Edit. The presence of an `id` URL param determines which mode. In edit mode, `useEffect` fetches the existing STO and calls `reset()` — React Hook Form's function for programmatically populating all fields at once. Without `reset()`, you'd have to call `setValue()` for each of the 30+ fields individually.

The `toDate(v)` helper `v ? v.slice(0, 10) : ''` trims datetime strings to `YYYY-MM-DD` format that HTML `<input type="date">` requires. SQL Server returns `2024-03-15T00:00:00.000Z`; the input needs `2024-03-15`.

---

### `frontend/src/pages/Analytics.tsx`

```typescript
const buildParams = useCallback((extra = {}): string => {
  const p = new URLSearchParams();
  if (filters.site) p.set('site', filters.site);
  ...
  return p.toString();
}, [filters]);
```

`useCallback` memoises this function — it only creates a new function reference when `filters` changes. This is important because `buildParams` is in the dependency arrays of two `useEffect` hooks. Without `useCallback`, `buildParams` would be a new function on every render, causing the effects to re-run infinitely.

The site filter is hidden for scoped users:
```typescript
const canFilterSite = user?.group === 'admin' || user?.group === 'management' || user?.group === 'finance';
{canFilterSite && <div>... site dropdown ...</div>}
```

This is purely a UX decision — the server would ignore a non-admin user's site filter anyway. But showing the control and having it do nothing is confusing. Hiding it matches what the user is actually allowed to do.

---

## 3. CS Fundamentals Touched

### Connection Pooling

Opening a TCP connection to SQL Server takes ~50-200ms. Creating a pool of pre-opened connections at startup means queries start immediately. `mssql` manages a pool of 2–20 connections. When a request comes in and all connections are busy, it waits up to `acquireTimeoutMillis` (15s) for one to become free, rather than opening a new connection every time. This is the difference between an app that handles 100 concurrent users and one that handles 3.

### ACID Transactions

**Atomicity**: `withTransaction` guarantees that a status UPDATE and its audit log INSERT both happen, or neither happens.
**Consistency**: FK constraints ensure `sto_requests.requestor_user_id` always references a valid `app_users.id`.
**Isolation**: SQL Server's default isolation level (READ COMMITTED) means in-progress transactions aren't visible to other reads.
**Durability**: Once `transaction.commit()` returns, the data is on disk even if the server crashes a millisecond later.

### Stateless Authentication (JWT)

Traditional sessions store state on the server — a session ID maps to user data in Redis or a database. JWTs are stateless: the user data is *inside* the token, cryptographically signed. The server doesn't store anything. The tradeoff: you can't revoke a JWT before it expires without a server-side blocklist. We solve this by doing the `is_active` database check on every request — adding just one fast indexed lookup per request to get near-immediate revocation.

### LDAP (Lightweight Directory Access Protocol)

LDAP is a protocol for querying directory services like Active Directory. The directory is a tree of objects (users, groups, OUs) identified by Distinguished Names (DNs). A "bind" operation is LDAP's login — you provide a DN and password. "Search" queries the tree with a filter. We use LDAP for two things: verify the user's AD password (by binding as them), and check group membership (by reading the `memberOf` attribute).

### SQL Indexes

Without indexes, every query does a **full table scan** — reads every row and discards non-matches. With 10,000 STOs, a scan on `status` reads 10,000 rows to find 20. An index on `(status)` reads ~20 rows directly.

Composite indexes like `(shipping_site, status)` are ordered by both columns. A query for `shipping_site = 'ABC' AND status = 'PLANNING_REVIEW'` can use this index to jump directly to matching rows. The column order matters: the index is sorted by `shipping_site` first, then `status` within each site. So `WHERE shipping_site = 'ABC'` can use the index, but `WHERE status = 'PLANNING_REVIEW'` alone cannot (it can't skip over all the `shipping_site` values).

The **filtered index** on `receiving_site_need_by_date`:
```sql
CREATE NONCLUSTERED INDEX IX_sto_need_by_status
  ON sto_requests (receiving_site_need_by_date, status)
  WHERE receiving_site_need_by_date IS NOT NULL;
```
If 80% of rows have no need-by date, this index only stores the 20% that do. It's smaller, faster, and the index itself takes less memory.

**INCLUDE columns** in an index let the engine satisfy a query entirely from the index without touching the main table (a "covering index"). For example:
```sql
CREATE INDEX IX_sto_shipping_site_status
  ON sto_requests (shipping_site, status)
  INCLUDE (sto_id, priority, rush_request, ...);
```
The list view query for a shipping planner selects all those INCLUDEd columns — the database never touches the main table heap.

### Sequences vs IDENTITY + COUNT

```sql
CREATE SEQUENCE sto_number_seq START WITH 1 INCREMENT BY 1;
'STO-' + YEAR + '-' + NEXT VALUE FOR sto_number_seq
```

A naive approach would be `SELECT COUNT(*) FROM sto_requests` and add 1. The race condition: two concurrent INSERTs both read `COUNT=99`, both compute `100`, both try to insert `STO-2024-00100` — one fails with a duplicate key error. A SEQUENCE is atomic at the database engine level — no two callers can get the same value. `NEXT VALUE FOR` returns a guaranteed-unique incrementing integer.

### Foreign Key Constraints

```sql
ALTER TABLE sto_requests ADD CONSTRAINT FK_requestor
  FOREIGN KEY (requestor_user_id) REFERENCES app_users(id);
```

The database enforces referential integrity — you cannot insert an STO with a `requestor_user_id` that doesn't exist in `app_users`. Without this, a bug could silently store invalid IDs and corrupt the data. `WITH NOCHECK` was used on existing data (migration 005) to add constraints without validating existing rows — only new writes are checked.

### Role-Based Access Control (RBAC)

The system has seven roles that map to seven stages of the workflow. The `can(user, ...groups)` function is the entire RBAC engine. Rather than a complex permissions table, the roles are a closed set (union type in TypeScript, enum-like). The admin bypass `user.group === 'admin'` is a single check at the top of `can()` — admins implicitly pass every permission check.

### React Hooks and the Dependency Array

`useEffect(() => { ... }, [dep1, dep2])` runs the effect when dependencies change. The rules:
- Empty array `[]` → runs once on mount
- Array with values → runs when any value changes
- No array → runs on every render (rarely correct)

`useCallback` memoises a function so its reference only changes when dependencies change. Without it, functions defined in component bodies get new references on every render, which would cause effects depending on them to re-run infinitely.

### The Singleton Pattern

`poolPromise` in `connection.ts` is a singleton — one pool for the entire process. In Node.js, module-level variables persist for the lifetime of the process. The Axios instance in `client.ts` is another singleton — one configured instance, imported everywhere. The pino logger in `logger.ts` is the same. Singletons are fine when you genuinely need one shared instance; they become a problem when state leaks between tests (hence why test environments often reset them).

### Optimistic Concurrency

In the auth route, we INSERT first and only SELECT on duplicate key failure. The alternative (SELECT first, INSERT if not found) has a TOCTOU (time-of-check-time-of-use) race: another request could INSERT between your SELECT and your INSERT. By attempting the INSERT optimistically and catching the constraint violation, we avoid the race entirely.

### Parameterised Queries / SQL Injection Prevention

Every query in the codebase uses named parameters (`@paramName`) passed separately from the query string. The mssql library sends them as separate protocol-level arguments. The database compiles the query plan for the parameterised template and then binds the values. The values are never concatenated into the SQL string — there is no path by which user input can become part of the executable SQL.

### Structured Logging

`console.log('Error:', err)` produces a line of text. To find all errors from a specific user across 1000 log lines, you grep for their name and hope it appears in the right log lines. Structured logging (`logger.error({ err, userId, stoId }, 'planning error')`) produces a JSON object per line. A log aggregator can filter: `level=error AND stoId=42 AND userId=7` — instant. In production, every HTTP request logged by `pino-http` includes a request ID, method, path, status code, and response time in a single JSON line.

### React Context API

`AuthContext` solves the **prop drilling** problem: if the user object were passed as a prop, every component that needs it (`Layout`, `Dashboard`, `STOList`, etc.) would need it passed from its parent, all the way up the tree. With Context, you wrap the tree once with `AuthProvider` and any descendant can call `useAuth()` to read the user without anything in between needing to know about it.

### CSV Generation Without a Library

```typescript
function escape(v: unknown): string {
  const s = String(v ?? '').replace(/"/g, '""');
  return `"${s}"`;
}
```

CSV has two rules for values that contain commas or quotes: wrap in double-quotes, and escape internal double-quotes by doubling them (`"` becomes `""`). The export never uses a library — it's 15 lines of string construction. Libraries are the right call when the format is complex (Excel formulas, merged cells, styling). For plain CSV, the standard is simple enough to implement directly.

---

## 4. UI — Every Screen Explained

### Login Page

**Two-panel layout**: a narrow login card on the left, a demo accounts panel on the right (dev mode only). The panel is hidden in production — the `GET /api/auth/demo-users` returns empty and the component renders nothing.

The site filter tabs (ALL / ABC / ABL / XYZ) above the demo accounts let you narrow the list by site. Clicking any account row auto-fills the form. This was built for developers to switch between roles quickly — a shipping planner at ABC vs a receiving site user at XYZ — without memorising usernames.

In production mode (`ldapMode=true`), the form placeholder changes to `e.g. john.doe@company.com` and the hint text at the bottom reads "Sign in with your Active Directory credentials".

Error handling: any login failure shows a single generic message "Invalid username or password" regardless of whether the failure was a wrong password, a locked account, or an AD search miss. This is intentional — specific error messages help attackers enumerate valid usernames.

---

### Site Picker (`/setup-site`)

Shown only to users whose `site` is `null` in their JWT. The `SiteRequired` wrapper in `App.tsx` redirects here automatically — you can't bypass it.

After selecting a site and clicking Continue, the page calls `POST /api/auth/setup-site`, which returns a new JWT with `site` populated. The `updateSession()` call in the context replaces both the stored token and the in-memory user object simultaneously, then navigates to `/dashboard`. The user never sees a second login prompt.

---

### Layout (Navigation Bar)

The dark blue top bar is always visible on every authenticated page. It shows:
- **App name** on the left
- **Navigation links**: Dashboard, All STOs, Analytics, New Request (receiving_site and admin only), Users (admin only)
- **User chip** on the right showing name + role with a role-specific colour (blue for receiving, amber for planning, teal for logistics, purple for management, green for finance, red for admin)
- **Sign Out / Switch Group** button

In dev mode the button says "Switch Group" because you switch roles by logging in as a different demo user. In production it says "Sign Out". The active nav link gets a darker blue highlight using `location.pathname === link.to`.

The `max-w-7xl mx-auto` container constrains content width on wide screens — the page never stretches uncomfortably wide on a 4K monitor.

---

### Dashboard (`/dashboard`)

The dashboard is role-aware throughout — what you see depends entirely on who you are.

**KPI row (4 cards)**: My Queue count, Active Rush STOs, Due This Week, Overdue. These come from two separate API calls — the queue count from `GET /api/sto?status=X&limit=20` pagination total, the rush/due/overdue from `GET /api/sto/kpis` which uses three `SUM(CASE WHEN ...)` aggregates in a single query.

**My Action Queue**: The table shows the top 20 STOs that need the current user's action. The search box in the header filters these 20 items client-side — instant, no API call. The "View all →" link goes to the STO list pre-filtered by status.

The `isStalled` flag highlights rows that have been waiting 3+ days with a red "⚠" badge. Admins see no queue (they have no assigned workflow step).

**Rush + Overdue alerts**: Two coloured boxes that only appear when there are items. Each shows a maximum of 4 items with a "+N more" link. They collapse entirely when the counts are zero — no empty boxes cluttering the page.

**Pipeline Overview**: Seven clickable pills, one per workflow status. Each shows the count of STOs at that stage. Pills are greyed out when count is 0 and non-clickable. A fire emoji (🔥) appears on stages with more than 3 STOs — a visual bottleneck alert. Clicking a pill goes to the STO list filtered by that status.

**Recent Activity**: Last 8 audit log entries. Management-only endpoint — for other roles this section shows "No activity yet" because the audit log route returns 403 and the dashboard doesn't crash (the catch block sets an empty array).

**Upcoming Need-By Dates**: The same `needByItems` fetch is split into two buckets: overdue (days < 0, shown in the alert box) and upcoming (days ≥ 0, shown here sorted nearest-first). A due-today item shows "Today" instead of "0d left".

---

### STO List (`/sto`)

A filterable, searchable, paginated list of all STOs visible to the current user (server-scoped).

**Filters**: Status dropdown (all 8 statuses), Priority dropdown (Urgent/Expedited/Standard), free-text search (matches STO ID, material description, SAP number, or requestor name). Filters are reflected in the URL via `useSearchParams` — refreshing the page or sharing the URL preserves the filters.

**Export CSV**: Always visible button. Triggers `GET /api/sto/export` with current filters (no pagination). Generates and downloads a timestamped CSV file with 20 columns. Shows a spinner while the request is in flight.

The table columns are: STO ID (monospace, blue), Material (with SAP below), Requestor (with plant below), Route (Shipping → Receiving), Priority badge, Status badge, Need-By date, Updated date, View link.

Pagination shows "Showing 1–50 of 247" with Prev/Next buttons. Page number is in the URL, so browser back/forward works correctly.

---

### STO Form (`/sto/new` and `/sto/:id/edit`)

One component, two modes determined by the presence of an `id` URL param.

**Create mode**: All fields start empty. The submit button says "Save as Draft". Successful submit goes to `/sto/{newId}`.

**Edit mode**: `useEffect` fetches the existing STO on mount and calls `reset()` to populate all fields. The title changes to "Edit STO". Submit calls `PUT /api/sto/:id` instead of `POST /api/sto`. Only admins and the original requestor can reach edit mode (the backend enforces this; the frontend shows the Edit button only to admins in `STODetail`).

The form uses **React Hook Form** with Zod validation. Required fields show error messages inline. The rush reason field is conditionally required — if you check Rush Request, the Rush Reason textarea becomes mandatory (enforced by both the Zod schema and field validation).

---

### STO Detail (`/sto/:id`)

The full record view with two tabs: Overview (all STO fields) and Audit Log (full history).

**Status banner at the top**: Shows current status with colour coding, and the appropriate action panel below it. What appears in the action panel depends on the user's role and the STO's current status:

- `receiving_site`: Submit button (DRAFT only)
- `shipping_planning`: Approve/Reject form with MPN/Batch/Expiry fields (PLANNING_REVIEW only)
- `shipping_logistics`: Logistics form with freight cost, tracking, dates (SHIPPING_LOGISTICS only)
- `management`: Approve/Reject with notes (MANAGEMENT_REVIEW only)
- `finance`: Approve/Reject with notes (FINANCE_REVIEW only)
- `receiving_logistics`: Receipt form with receipt date and close-out checkbox (RECEIVING_LOGISTICS only)
- `admin`: Edit button (always), Revert One Step button (non-DRAFT), plus all of the above

**Admin controls**: The "Edit" button navigates to `/sto/:id/edit`. "Revert One Step" shows a browser `confirm()` dialog and then calls `POST /api/sto/:id/revert`.

**Audit Log tab**: A timeline of every action ever taken on this STO, with actor, timestamp, old status, new status, and notes. This is the source of truth for the revert feature.

---

### Analytics (`/analytics`)

A data exploration page with interactive charts.

**Filter bar**: Status, Priority (rush/normal), date range (month pickers), and Site (management/finance/admin only — hidden for others). Active filters show as removable chips below the bar.

**KPI row**: Total STOs, Closed, Total Value (this month vs all time), Rush %. Numbers update instantly when filters change.

**Charts (6 total)**:
1. **Status donut**: Pie chart with a legend. Clicking a status slice or legend row filters the whole page to that status.
2. **Monthly volume**: Dual-axis line chart — left axis is STO count, right axis is total material value. Default shows last 12 months; date range filter overrides this.
3. **Top shipping sites**: Horizontal bar chart, top 10 by volume. Clicking a bar filters by that site.
4. **Top receiving sites**: Same for receiving side.
5. **Rush vs Normal**: Stacked bar chart per month. Clicking the normal or rush bar segment filters to that type.
6. **Material Value by Status**: Bar chart showing where money is sitting in the pipeline.

**Site-to-Site Flow table**: Top 15 shipping→receiving routes by volume. Clicking a row filters by the sending site.

**Raw Data table**: Paginated 50-rows-at-a-time list of all STOs matching current filters. STO ID links to the detail page. Pagination controls at the bottom.

All charts use Recharts `onClick` to call `toggleFilter()` — if the filter is already active for that value, clicking it clears it; otherwise it sets it. This creates an interactive drill-down experience.

---

### User Management (`/users`, admin only)

A table of all `app_users` with inline editing. No save button — changes are sent immediately when you interact with a control:

- **Site dropdown**: Changing the selected value fires `PUT /api/users/:id` with `{ site: newValue }` immediately
- **Role dropdown**: Same, fires with `{ app_group: newValue }`
- **Active toggle**: A custom toggle switch. Clicking it fires with `{ is_active: !current }`

The `isSelf` flag prevents the current admin from changing their own role or deactivating themselves (the controls are disabled and the backend double-checks). A "saving" spinner appears on the row being updated.

Inactive users are shown greyed out with reduced opacity. The change takes effect on the user's next request (the `is_active` check in `authenticate()` will reject them immediately if they're mid-session).

---

### Components

**`StatusBadge`**: A coloured pill showing a workflow status. Takes a `STOStatus` string, looks up the label and Tailwind colour class in lookup objects, renders a `<span>`. Used on the STO list, detail, dashboard queue, and analytics raw data table. One source of truth for the label names and colours.

**`PriorityBadge`**: Same pattern for priority (1=Urgent/red, 2=Expedited/orange, 3=Standard/green).

**`Layout`**: Wraps every page. Renders the nav bar and a `<main>` content area with max-width and padding. Every page's content is passed as `children`. This ensures nav is consistent across all pages and changes to the nav bar only need to happen in one file.

---

*End of document*
