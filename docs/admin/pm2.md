# PM2 Windows service

PM2 keeps the backend running and restarts it automatically if it crashes or the
server reboots.

## Register the service

Open **Command Prompt as Administrator**:

```cmd
cd C:\sto-management\backend
pm2 start dist/index.js --name sto-backend
pm2 save
pm2-windows-startup install
```

Verify:

```cmd
pm2 list
```

`sto-backend` should show status `online`.

## Everyday commands

```cmd
pm2 logs sto-backend      # view live logs (incl. [AD auth] debug lines)
pm2 restart sto-backend   # restart after a build or config change
pm2 stop sto-backend      # stop
pm2 start sto-backend     # start
pm2 monit                 # live dashboard
```

!!! tip "Reading login problems"
    `pm2 logs sto-backend` is where the `[AD auth]` diagnostics appear when a user
    can't sign in — see [Troubleshooting](troubleshooting.md).
