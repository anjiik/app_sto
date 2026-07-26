# Build & first run

## Build the backend

Open **Command Prompt as Administrator**:

```cmd
cd C:\sto-management\backend
npm install
npm run build
```

`npm install` compiles the native `msnodesqlv8` driver (2–5 minutes the first time;
lots of output is normal — watch only for **error** lines at the end). `npm run build`
compiles TypeScript into `backend\dist\`.

## Build the frontend

```cmd
cd C:\sto-management\frontend
npm install
set VITE_API_URL=https://your-server-name.company.com/api
npm run build
```

Replace the hostname with your server's real address. This produces `frontend\dist\`
— static files that IIS serves under `/sto/`.

## First run & verify

Before setting up PM2 and IIS, confirm the backend starts:

```cmd
cd C:\sto-management\backend
node dist/index.js
```

You should see a startup log line with `port: 4000`. Then check the health endpoint:

```
http://localhost:4000/api/health
```

- `{"status":"ok",...}` — backend is up and can reach SQL Server.
- `{"status":"error"}` — running but **cannot reach SQL Server**; check `DB_SERVER`
  in [`.env`](configuration.md).

Press `Ctrl+C` to stop, then set it up as a [service](pm2.md).

## Updating after a code change

Whenever source changes (including editing `GROUP_MAP`):

```cmd
cd C:\sto-management
git pull                        # or copy the new files in
cd backend && npm install && npm run build
cd ..\frontend && npm install && npm run build
pm2 restart sto-backend
```

!!! important
    The running service uses the compiled `dist\`. A source edit does **not** take
    effect until you `npm run build` and `pm2 restart`.
