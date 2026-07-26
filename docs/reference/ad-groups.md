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

Each entry is `AD group CN → { role, site }`. Naming convention: `{SITE}_{ROLE}`,
plus a single company-wide admin group.

| AD group (CN) | Role | Site |
|---------------|------|------|
| `APP-STO_MANAGEMENT_ADMIN` | admin | (company-wide) |
| `ABC_RECEIVING` | receiving_site | ABC |
| `ABC_PLANNING` | shipping_planning | ABC |
| `ABC_LOGISTICS` | shipping_logistics | ABC |
| `ABC_MANAGEMENT` | management | ABC |
| `ABC_RECV_LOGISTICS` | receiving_logistics | ABC |

The same six-per-site pattern repeats for each additional site (e.g. `XYZ_*`).

!!! note "Real vs placeholder names"
    `APP-STO_MANAGEMENT_ADMIN` is the real admin group CN. The `{SITE}_*` entries
    are **placeholder examples** — replace each key with the exact CN of the real AD
    group your directory team creates.

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
them to the relevant group at **each** site (e.g. `ABC_LOGISTICS` and
`ABL_LOGISTICS`) — the app merges these into two grants automatically. The same
applies to holding different roles.

## Troubleshooting login

The login code emits `[AD auth]` diagnostics that make "not in any STO group" easy
to diagnose. See [Administration → Troubleshooting](../admin/index.md) for reading
those logs. The usual causes are:

- The user is not actually a member of a mapped group (check their AD membership).
- The group was renamed in AD but not in `GROUP_MAP` (or vice-versa).
- The service was not rebuilt/restarted after editing `GROUP_MAP`.
- A spelling difference between the AD CN and the map key.
