# Go-live checklist

Work through this before opening the app to users.

## Environment

- [ ] SQL Server database `sto_management` created; schema + all migrations applied.
- [ ] Real sites loaded into the `sites` table.
- [ ] `backend\.env` complete: fresh `JWT_SECRET`, correct `DB_SERVER`,
      `FRONTEND_ORIGIN`, and `DEV_BYPASS` set deliberately for this environment
      (`false` for AD login; `true` is also valid in production if demo/test
      access is intentionally being kept available — see
      [Configuration](configuration.md#auth-mode)).
- [ ] LDAP settings filled in and reachable (`LDAP_URL`, `LDAP_DOMAIN`,
      `LDAP_BASE_DN`, bind account).
- [ ] Approval thresholds set (or defaults accepted).

## Active Directory

- [ ] IT has created the `APP-{SITE}-STO_Management_{Role}` groups for every site,
      plus the company-wide admin group.
- [ ] Real group names entered into `GROUP_MAP` (`backend/src/lib/ldap.ts`) and the
      backend rebuilt.
- [ ] At least one admin account is a member of the admin group.
- [ ] A test user from each role can log in and sees the right queues.

## Build & services

- [ ] Backend built (`npm run build`) and running under PM2 as `sto-backend`
      (`pm2 list` shows `online`).
- [ ] Frontend built with the correct `VITE_API_URL`.
- [ ] PM2 startup installed so the service survives a reboot (`pm2-windows-startup install`, `pm2 save`).

## IIS & network

- [ ] IIS serving the frontend under `/sto/` with the `web.config` rewrite rules.
- [ ] HTTPS certificate installed and bound.
- [ ] `/api/health` returns `{"status":"ok"}` through the public URL.
- [ ] Port 4000 blocked from outside; 80/443 allowed.
- [ ] (Optional) Docs built and served at `/sto/docs/`.

## Smoke test

- [ ] Create an STO as a requestor, run it through planning → logistics → (management)
      → receiving → closed.
- [ ] Confirm a high-value or cold-chain STO routes through management review.
- [ ] Confirm the audit trail records each step.
