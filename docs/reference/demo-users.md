# Demo users

In demo mode (`DEV_BYPASS=true`), login validates against the `demo_users` table
instead of Active Directory. Load these accounts with `npm run seed` from the
`backend` directory.

All demo accounts use the password **`Demo123!`** and appear clickably on the login
screen.

## Per-site users

Each site (**ABC**, **ABL**, **ABS**, **MBM**) has one user per role. There is no
dedicated "requestor" account — any demo user can create an STO. Shown here for
ABC; ABL uses the `abl.*` prefix, ABS uses `abs.*`, and MBM uses `mbm.*`.

| Username | Name | Site | Role |
|----------|------|------|------|
| `abc.plan` | Brian Scott | ABC | shipping_planning |
| `abc.slog` | Carol White | ABC | shipping_logistics |
| `abc.mgmt` | Daniel Ross | ABC | management (shipping side) |
| `abc.rmgmt` | Emma Hayes | ABC | receiving_management |
| `abc.rlog` | Frank Lopez | ABC | receiving_logistics |

MBM's accounts (added alongside the MBM site itself):

| Username | Name | Site | Role |
|----------|------|------|------|
| `mbm.plan` | Marcus Ellery | MBM | shipping_planning |
| `mbm.slog` | Priya Deshmukh | MBM | shipping_logistics |
| `mbm.mgmt` | Derek Holloway | MBM | management (shipping side) |
| `mbm.rmgmt` | Naomi Castillo | MBM | receiving_management |
| `mbm.rlog` | Felix Andersson | MBM | receiving_logistics |

ABS's accounts:

| Username | Name | Site | Role |
|----------|------|------|------|
| `abs.plan` | Nathan Cole | ABS | shipping_planning |
| `abs.slog` | Olivia Reed | ABS | shipping_logistics |
| `abs.mgmt` | Patrick James | ABS | management (shipping side) |
| `abs.rmgmt` | Sophia Bell | ABS | receiving_management |
| `abs.rlog` | Rachel Tran | ABS | receiving_logistics |

## Admin

| Username | Name | Role |
|----------|------|------|
| `admin` | Demo Admin | admin (company-wide) |

## Multi-role / multi-site users

These accounts exercise the [grants model](roles.md):

| Username | Name | Grants | Demonstrates |
|----------|------|--------|--------------|
| `multi.slog` | Sam Rivera | shipping_logistics @ ABC + ABL | same role, two sites |
| `multi.log` | Priya Nair | shipping_logistics + receiving_logistics @ ABC | two roles, same site |
| `multi.plan` | Tom Becker | shipping_planning @ ABC + ABL | same role, two sites |
| `multi.mix` | Dana Fox | shipping_logistics @ ABC + management @ ABL | mixed roles across sites |
| `abc.mgmt.both` | Gina Park | management + receiving_management @ ABC | both management sides, one site |

## The `grants` column

A demo user's roles come from the `demo_users.grants` column when set — a
semicolon-separated list of `role@site` pairs, e.g.:

```text
shipping_logistics@ABC;receiving_logistics@ABC;shipping_planning@ABL
```

When `grants` is empty, the user's single `group_key` is applied across the
comma-separated `site` value instead (the legacy form, e.g. `site = "ABC,ABL"`).
