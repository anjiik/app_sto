# Active Directory groups

Roles and site assignments come entirely from AD group membership — there is no
in-app user management. This page covers setting up the groups; the mapping mechanics
are in [Reference → AD group mapping](../reference/ad-groups.md).

## Naming convention

Groups follow **`{SITE}_{ROLE}`**, plus a single company-wide admin group.

| AD group | Site | Role |
|----------|------|------|
| `APP-STO_MANAGEMENT_ADMIN` | (all) | Admin — full access, company-wide |
| `ABC_RECEIVING` | ABC | Receiving Site — creates STOs |
| `ABC_PLANNING` | ABC | Shipping Planning — reviews and approves |
| `ABC_LOGISTICS` | ABC | Shipping Logistics — shipping details |
| `ABC_SHIPPING_MANAGEMENT` | ABC | Management — shipping-site approval |
| `ABC_RECEIVING_MANAGEMENT` | ABC | Receiving Management — receiving-site approval |
| `ABC_RECV_LOGISTICS` | ABC | Receiving Logistics — closes out deliveries |

Repeat the seven per-site groups for each site (e.g. `ABL_*`). The **site prefix must
match a code in your `sites` table**.

!!! important "These are examples"
    The `{SITE}_*` names above are placeholders. Whatever names your directory team
    actually creates must be entered as keys in `GROUP_MAP` (`backend/src/lib/ldap.ts`)
    exactly — see [AD group mapping](../reference/ad-groups.md).

## Site scoping rules

- `PLANNING`, `LOGISTICS`, and `SHIPPING_MANAGEMENT` act on STOs where
  **shipping_site = their site**.
- `RECEIVING`, `RECEIVING_MANAGEMENT`, and `RECV_LOGISTICS` act on STOs where
  **receiving_site = their site**.
- `admin` is company-wide and bypasses site scoping.

## Multi-site & multi-role

There is no special multi-site group. To give a user access at two sites, add them to
the relevant group at **each** site (e.g. `ABC_LOGISTICS` + `ABL_LOGISTICS`); the app
merges these. The same applies to holding different roles — a user in several STO
groups holds several grants. See [Roles & access](../reference/roles.md).

## What happens at login

1. The user authenticates against AD.
2. The app reads their group memberships and maps each to a `{role, site}` grant via
   `GROUP_MAP`.
3. If the user is in **no** mapped group, login is refused with
   *"Your account is not in any STO application group."*

See [Troubleshooting](troubleshooting.md) for diagnosing that message.

## Ask IT to create the groups

Provide your directory team with the full list of group names (the admin group plus
seven per site) and ask them to create the groups and add the appropriate users. Then
enter each real group name into `GROUP_MAP` and
[rebuild/restart](build-run.md).
