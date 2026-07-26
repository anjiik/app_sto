# Configuration (`.env`)

The backend reads all its configuration from `backend\.env`. This file is **never
committed to Git** — create it on each machine from the example:

```cmd
cd C:\sto-management\backend
copy .env.example .env
notepad .env
```

## Settings

```env
# Signs auth tokens. Generate a strong secret in PowerShell:
#   [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
JWT_SECRET=PASTE_A_GENERATED_SECRET_HERE

PORT=4000

# The URL users open in their browser (after IIS is set up).
FRONTEND_ORIGIN=https://your-server-name.company.com

# SQL Server (from your SSMS Object Explorer)
DB_SERVER=MYSERVER\SQLEXPRESS
DB_DATABASE=sto_management

# Management approval thresholds (USD)
MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD=100000
MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD=20000

# Auth mode — MUST be false in production (uses Active Directory)
DEV_BYPASS=false

# Active Directory (ask IT for these)
LDAP_URL=ldap://your-dc.company.com
LDAP_DOMAIN=company.com
LDAP_BASE_DN=DC=company,DC=com
# Read-only service account used to search AD
LDAP_BIND_DN=svc_sto_app@company.com
LDAP_BIND_PASSWORD=the_service_account_password
```

!!! warning "Production settings"
    - `DEV_BYPASS` **must be `false`** in production so login uses Active Directory.
    - Never reuse the example `JWT_SECRET` — generate a fresh one.

## Threshold precedence

The two `MANAGEMENT_APPROVAL_*` values override the built-in defaults ($100,000 /
$20,000). The `sto_config` table is **not** consulted — see
[Approval rules](../reference/approval-rules.md).

Next: [Build & first run](build-run.md).
