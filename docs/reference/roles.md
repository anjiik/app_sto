# Roles & access

## The seven roles

| Role | Responsibility |
|------|----------------|
| `receiving_site` | Creates and submits STO requests (the requestor) |
| `shipping_planning` | Reviews requests; approves, revises, or rejects |
| `shipping_logistics` | Adds freight & shipping details; routes for approval |
| `management` | Shipping-site management sign-off (high-value / cold-chain / controlled / non-standard shipments) |
| `receiving_management` | Receiving-site management sign-off on the same shipments |
| `receiving_logistics` | Confirms receipt and closes out delivery |
| `admin` | Fixes mistakes (revert / send-back), archiving, oversight |

There is no `finance` role — management is the only approval tier beyond planning.

!!! note "Shipping vs receiving management are distinct roles"
    A management-flagged STO needs sign-off from **both** sides. The shipping-site
    step requires the `management` role; the receiving-site step requires the
    separate `receiving_management` role. They are backed by different AD groups, so
    a user in only one cannot act on the other's step.

## Per-site vs company-wide

- **The six non-admin roles are per-site.** A `shipping_planning` grant at ABC
  lets you plan for ABC only. To act at another site you need a grant for that site.
- **`admin` is company-wide.** A single admin grant confers access across every
  site — admins bypass all per-site checks.

## The multi-role, multi-site model

Access is expressed as a list of **grants**, where each grant is one `{role, site}`
pair. A user can hold several at once. This supports, for example:

- **Two roles at the same site** — e.g. `shipping_logistics@ABC` +
  `receiving_logistics@ABC`.
- **The same role at two sites** — e.g. `shipping_planning@ABC` +
  `shipping_planning@ABL`.
- **Mixed roles across sites** — e.g. `shipping_logistics@ABC` + `management@ABL`.

!!! important "Role and site are checked together"
    A site-scoped action requires the matching role **and** site on the *same*
    grant. Someone with `shipping_logistics@ABC` + `management@ABL` can do logistics
    at ABC and management at ABL — but **not** logistics at ABL or management at ABC.

### Where grants come from

| Mode | Source of grants |
|------|------------------|
| Production (`DEV_BYPASS=false`) | Active Directory group memberships — see [AD group mapping](ad-groups.md). A user in several STO groups holds several grants. |
| Demo (`DEV_BYPASS=true`) | The `demo_users` table. The `grants` column holds a semicolon-separated list of `role@site` pairs; if empty, the single `group_key` is used across the `site` value. |

## What each role can do in the UI

- **Dashboard** shows one action-queue section **per role** the user holds, each
  scoped to that role's site(s).
- On an STO's detail page, the action panel for a step appears only when the user
  holds the right role at that STO's relevant site (or is an admin).
- Creating a new request is available to the requestor role and admins; any signed-in
  user can view STOs (subject to site scoping on actions).
