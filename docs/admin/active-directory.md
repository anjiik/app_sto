# Active Directory groups

Roles and site assignments come entirely from AD group membership — there is no
in-app user management. This page covers setting up the groups; the mapping mechanics
are in [Reference → AD group mapping](../reference/ad-groups.md).

## Naming convention

Groups follow **`APP-{SITE}-STO_Management_{Role}`**, plus a single company-wide
admin group. These are the real group names, not placeholders.

| AD group | Site | Role |
|----------|------|------|
| `APP-STO_MANAGEMENT_ADMIN` | (all) | Admin — full access, company-wide |
| `APP-ABC-STO_Management_Planning` | ABC | Shipping Planning — reviews and approves |
| `APP-ABC-STO_Management_Logistics` | ABC | Shipping Logistics — shipping details |
| `APP-ABC-STO_Management_Logistics_Receiving` | ABC | Receiving Logistics — closes out deliveries |
| `APP-ABC-STO_Management_Management` | ABC | Management — shipping-site approval |
| `APP-ABC-STO_Management_Management_Receiving` | ABC | Receiving Management — receiving-site approval |

Repeat the five per-site groups for each site: ABC, ABL, ABS, MBM. The **site
prefix must match a code in your `sites` table**. There is no per-site admin
group and no group for creating an STO — any authenticated user can create one.

!!! important "Confirm these match your directory"
    If your directory team creates these groups under different names, enter
    the real names as keys in `GROUP_MAP` (`backend/src/lib/ldap.ts`) exactly —
    see [AD group mapping](../reference/ad-groups.md).

## Site scoping rules

- `Planning`, `Logistics`, and `Management` (shipping-side) act on STOs where
  **shipping_site = their site**.
- `Logistics_Receiving` and `Management_Receiving` act on STOs where
  **receiving_site = their site**.
- `admin` is company-wide and bypasses site scoping.

## Multi-site & multi-role

There is no special multi-site group. To give a user access at two sites, add them to
the relevant group at **each** site (e.g. `APP-ABC-STO_Management_Logistics` +
`APP-ABL-STO_Management_Logistics`); the app merges these. The same applies to
holding different roles — a user in several STO groups holds several grants. See
[Roles & access](../reference/roles.md).

## What happens at login

1. The user authenticates against AD.
2. The app reads their group memberships and maps each to a `{role, site}` grant via
   `GROUP_MAP`.
3. If the user is in **no** mapped group, login is refused with
   *"Your account is not in any STO application group."*

See [Troubleshooting](troubleshooting.md) for diagnosing that message.

## Ask IT to create the groups

Provide your directory team with the full list of group names (the admin group plus
five per site) and ask them to create the groups and add the appropriate users. Then
confirm each real group name matches `GROUP_MAP` and
[rebuild/restart](build-run.md) if you had to change any.
