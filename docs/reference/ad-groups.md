# AD group mapping

In production (`DEV_BYPASS=false`), a user's roles and sites come entirely from
their **Active Directory group memberships**. The mapping from AD group to
`{role, site}` lives in one place: the `GROUP_MAP` constant in
`backend/src/lib/ldap.ts`.

## How matching works

1. On login, the app reads the user's `memberOf` groups from AD.
2. For each group it extracts the **CN** (the plain group name) and looks it up in
   `GROUP_MAP` (matched **case-insensitively**).
3. Every match becomes a grant. A user in several STO groups holds several grants
   (see [Roles & access](roles.md)).
4. If **no** group matches, login is refused with:
   *"Your account is not in any STO application group."*

## The map

Each entry is `AD group CN → { role, site }`. Naming convention:
`APP-{SITE}-STO_Management_{Role}`, plus a single company-wide admin group.

| AD group (CN) | Role | Site |
|---------------|------|------|
| `APP-STO_MANAGEMENT_ADMIN` | admin | (company-wide) |
| `APP-ABC-STO_Management_Planning` | shipping_planning | ABC |
| `APP-ABC-STO_Management_Logistics` | shipping_logistics | ABC |
| `APP-ABC-STO_Management_Logistics_Receiving` | receiving_logistics | ABC |
| `APP-ABC-STO_Management_Management` | management | ABC |
| `APP-ABC-STO_Management_Management_Receiving` | receiving_management | ABC |

The same five-per-site pattern repeats for each additional site: `APP-ABL-...`,
`APP-ABS-...`, `APP-MBM-...`.

!!! important "Two management groups per site"
    Shipping-side and receiving-side management are **separate** roles backed by
    separate groups (`APP-{SITE}-STO_Management_Management` and
    `APP-{SITE}-STO_Management_Management_Receiving`). Add a user to whichever side
    they approve for; a user in only one cannot act on the other side's step.

!!! note "No per-site admin group, no 'create an STO' group"
    Admin access is company-wide only (`APP-STO_MANAGEMENT_ADMIN`) — there is no
    per-site admin group. There is also no group for creating an STO: any
    authenticated user, in any of the groups above (or none), can create one.

!!! note "These are the real group names"
    Unlike some earlier drafts of this table, the `APP-{SITE}-STO_Management_*`
    names above are the actual AD group names — not placeholders. If your
    directory team creates them under different names, update the keys in
    `GROUP_MAP` to match exactly.

## Adding or renaming a group

1. Edit the **key** (the AD group CN) in `GROUP_MAP` to match the real group name
   exactly. The `{ role, site }` value stays the same.
2. Rebuild the backend: `npm run build`.
3. Restart the service. The running service uses the compiled `dist/` output, so a
   source edit does **not** take effect until you rebuild and restart.

!!! important "The key must match the real AD CN"
    The map key must be the group's actual CN (the plain name, not the full
    distinguished name and not `DOMAIN\Group`). Matching is case-insensitive, but
    otherwise exact — a different spelling, hyphen, or trailing space will not match.

## Multi-site and multi-role users

There is no special "multi-site" group. To give someone access at two sites, add
them to the relevant group at **each** site (e.g.
`APP-ABC-STO_Management_Logistics` and `APP-ABL-STO_Management_Logistics`) — the
app merges these into two grants automatically. The same applies to holding
different roles.

## Troubleshooting login

The login code emits `[AD auth]` diagnostics that make "not in any STO group" easy
to diagnose. See [Administration → Troubleshooting](../admin/index.md) for reading
those logs. The usual causes are:

- The user is not actually a member of a mapped group (check their AD membership).
- The group was renamed in AD but not in `GROUP_MAP` (or vice-versa).
- The service was not rebuilt/restarted after editing `GROUP_MAP`.
- A spelling difference between the AD CN and the map key.
