import { Client } from 'ldapts';
import { Group, Grant } from '../types';

const LDAP_URL = process.env.LDAP_URL || '';
const LDAP_DOMAIN = process.env.LDAP_DOMAIN || '';
const LDAP_BASE_DN = process.env.LDAP_BASE_DN || '';
const LDAP_BIND_DN = process.env.LDAP_BIND_DN || '';
const LDAP_BIND_PASS = process.env.LDAP_BIND_PASSWORD || '';

// The company-wide admin group's CN. Exported so anything that needs to
// reference "the admin group" specifically (e.g. listing its members on the
// App Info page) uses this single constant rather than a second hardcoded
// copy of the string.
export const ADMIN_GROUP_CN = 'APP-STO_MANAGEMENT_ADMIN';

// Explicit map of AD group CN → { app role, site }.
// Add one entry per group that should have access.
// The key must match the CN of the group exactly (case-insensitive).
//
// There is no per-site admin group and no "create an STO" group — creating an
// STO requires no specific group at all, just a valid login (see
// backend/src/routes/sto.ts POST /). Admin access is company-wide only, via
// the single group below.
const GROUP_MAP: Record<string, { group: Group; site: string }> = {
  // ── Company-wide admin ────────────────────────────────────────────────────
  // A single admin group that oversees every site. Admins bypass all per-site
  // action checks (see can() / userHasSite in middleware/auth.ts) and the STO
  // list is not site-scoped, so the `site` here is only a harmless default
  // (e.g. for pre-filling requesting_plant if an admin creates an STO).
  // Key is the exact AD group CN (matched case-insensitively).
  [ADMIN_GROUP_CN]: { group: 'admin', site: 'ABC' },
  // ── Site: ABC ─────────────────────────────────────────────────────────────
  'APP-ABC-STO_Management_Planning': { group: 'shipping_planning', site: 'ABC' },
  'APP-ABC-STO_Management_Logistics': { group: 'shipping_logistics', site: 'ABC' },
  'APP-ABC-STO_Management_Logistics_Receiving': { group: 'receiving_logistics', site: 'ABC' },
  // Two distinct management groups per site: shipping-side vs receiving-side.
  // A user in only the receiving group cannot act on shipping-mgmt steps.
  'APP-ABC-STO_Management_Management': { group: 'management', site: 'ABC' },
  'APP-ABC-STO_Management_Management_Receiving': { group: 'receiving_management', site: 'ABC' },
  // ── Site: ABL ─────────────────────────────────────────────────────────────
  'APP-ABL-STO_Management_Planning': { group: 'shipping_planning', site: 'ABL' },
  'APP-ABL-STO_Management_Logistics': { group: 'shipping_logistics', site: 'ABL' },
  'APP-ABL-STO_Management_Logistics_Receiving': { group: 'receiving_logistics', site: 'ABL' },
  'APP-ABL-STO_Management_Management': { group: 'management', site: 'ABL' },
  'APP-ABL-STO_Management_Management_Receiving': { group: 'receiving_management', site: 'ABL' },
  // ── Site: ABS ─────────────────────────────────────────────────────────────
  'APP-ABS-STO_Management_Planning': { group: 'shipping_planning', site: 'ABS' },
  'APP-ABS-STO_Management_Logistics': { group: 'shipping_logistics', site: 'ABS' },
  'APP-ABS-STO_Management_Logistics_Receiving': { group: 'receiving_logistics', site: 'ABS' },
  'APP-ABS-STO_Management_Management': { group: 'management', site: 'ABS' },
  'APP-ABS-STO_Management_Management_Receiving': { group: 'receiving_management', site: 'ABS' },
  // ── Site: MBM ─────────────────────────────────────────────────────────────
  'APP-MBM-STO_Management_Planning': { group: 'shipping_planning', site: 'MBM' },
  'APP-MBM-STO_Management_Logistics': { group: 'shipping_logistics', site: 'MBM' },
  'APP-MBM-STO_Management_Logistics_Receiving': { group: 'receiving_logistics', site: 'MBM' },
  'APP-MBM-STO_Management_Management': { group: 'management', site: 'MBM' },
  'APP-MBM-STO_Management_Management_Receiving': { group: 'receiving_management', site: 'MBM' },
};

export interface LdapAuthResult {
  displayName: string;
  adUsername: string;
  email: string;
  grants: Grant[]; // every role+site the user holds
  group: Group; // derived primary role (admin if any, else first grant)
  site: string; // derived primary site
  sites: string[]; // derived union of all grant sites
}

// Sanitise values before embedding them in LDAP filter strings.
// Escapes: \ ( ) * and NUL per RFC 4515.
function escapeLdap(value: string): string {
  return value.replace(/[\\()*\x00]/g, ch => `\\${ch.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

function extractCN(dn: string): string {
  const match = dn.match(/^CN=([^,]+)/i);
  return match ? match[1] : dn;
}

function toUPN(username: string): string {
  if (username.includes('@')) return username;
  if (username.includes('\\')) return `${username.split('\\')[1]}@${LDAP_DOMAIN}`;
  return `${username}@${LDAP_DOMAIN}`;
}

function toSAM(username: string): string {
  if (username.includes('\\')) return username.split('\\')[1];
  if (username.includes('@')) return username.split('@')[0];
  return username;
}

const CLIENT_OPTS = () => ({
  url: LDAP_URL,
  timeout: 5000,
  connectTimeout: 5000,
  // Uncomment for LDAPS with a self-signed cert:
  // tlsOptions: { rejectUnauthorized: false },
});

// Scans the user's AD group memberships and derives the app role (from the first
// matching group) plus EVERY site the user has that same role at. This lets a
// user who belongs to e.g. APP-ABC-STO_Management_Logistics and
// APP-ABL-STO_Management_Logistics see both sites' data.
function resolveGrants(memberOf: string[]): {
  grants: Grant[];
  group: Group;
  site: string;
  sites: string[];
} {
  const cns = memberOf.map(extractCN);
  // Debug: log each raw memberOf DN and the CN extracted from it, quoted so any
  // stray whitespace / hidden characters are visible, plus whether each CN matched
  // a GROUP_MAP key. Remove once login is confirmed working.
  console.log('[AD auth] raw memberOf entries:', memberOf.length);
  // Clean, copy-friendly list of just the extracted CN names.
  console.log('[AD auth] CNs:', cns.join(' | ') || '(none)');
  cns.forEach((cn, i) => {
    const matched = !!GROUP_MAP[cn.toUpperCase()];
    console.log(
      `[AD auth]   [${i}] raw="${memberOf[i]}" cn="${cn}" upper="${cn.toUpperCase()}" match=${matched}`,
    );
  });
  console.log('[AD auth] GROUP_MAP keys:', Object.keys(GROUP_MAP).join(', '));
  const matches = cns
    .map(cn => GROUP_MAP[cn.toUpperCase()])
    .filter((m): m is { group: Group; site: string } => !!m);

  if (matches.length === 0) {
    console.error('[AD auth] No CN matched GROUP_MAP keys:', Object.keys(GROUP_MAP).join(', '));
    throw new Error(
      'Your account is not in any STO application group. ' +
        'Contact your administrator to be added to one of the configured AD groups.',
    );
  }

  // Keep EVERY matched group as a distinct role+site grant (deduplicated). This is
  // what lets one user hold several roles at once, e.g. logistics + receiving
  // logistics at the same site, or planning at two sites.
  const seen = new Set<string>();
  const grants: Grant[] = [];
  for (const m of matches) {
    const key = `${m.group}@${m.site}`;
    if (!seen.has(key)) {
      seen.add(key);
      grants.push({ group: m.group, site: m.site });
    }
  }

  // Derived fields for display/back-compat. Primary role: admin if the user has
  // any admin grant, otherwise the first grant. Sites: union across all grants.
  const primary = grants.find(g => g.group === 'admin') ?? grants[0];
  const sites = Array.from(new Set(grants.map(g => g.site)));
  return { grants, group: primary.group, site: primary.site, sites };
}

function buildResult(entry: Record<string, unknown>, sam: string): LdapAuthResult {
  const memberOf = entry.memberOf
    ? ((Array.isArray(entry.memberOf) ? entry.memberOf : [entry.memberOf]) as string[])
    : [];
  const { grants, group, site, sites } = resolveGrants(memberOf);
  return {
    displayName: (entry.displayName as string) || sam,
    adUsername: (entry.sAMAccountName as string) || sam,
    email: (entry.mail as string) || '',
    grants,
    group,
    site,
    sites,
  };
}

export async function authenticateWithAD(
  username: string,
  password: string,
): Promise<LdapAuthResult> {
  if (!LDAP_URL || !LDAP_DOMAIN || !LDAP_BASE_DN) {
    throw new Error('LDAP not configured — set LDAP_URL, LDAP_DOMAIN, and LDAP_BASE_DN in .env');
  }

  const upn = toUPN(username);
  const sam = toSAM(username);
  const attrs = ['dn', 'displayName', 'mail', 'memberOf', 'sAMAccountName'];

  // ── Service-account search + user bind (preferred for production) ─────────
  if (LDAP_BIND_DN && LDAP_BIND_PASS) {
    const searchClient = new Client(CLIENT_OPTS());
    let serviceAccountBindFailed = false;
    try {
      try {
        await searchClient.bind(LDAP_BIND_DN, LDAP_BIND_PASS);
      } catch (err: any) {
        // A bad/misconfigured service account must never take down login for
        // everyone — fall through to the direct user-bind path below instead
        // of failing the whole request. Only the admin-list lookup actually
        // requires a working service account; login doesn't.
        console.error(
          `[AD auth] Service account bind failed (${err?.message || err}) — falling back to direct user bind`,
        );
        serviceAccountBindFailed = true;
      }

      if (!serviceAccountBindFailed) {
        let entry: Record<string, unknown> | null = null;

        const { searchEntries } = await searchClient.search(LDAP_BASE_DN, {
          scope: 'sub',
          filter: `(userPrincipalName=${escapeLdap(upn)})`,
          attributes: attrs,
        });
        if (searchEntries.length > 0) {
          entry = searchEntries[0] as Record<string, unknown>;
        } else {
          const { searchEntries: bySam } = await searchClient.search(LDAP_BASE_DN, {
            scope: 'sub',
            filter: `(sAMAccountName=${escapeLdap(sam)})`,
            attributes: attrs,
          });
          if (!bySam.length) throw new Error('User account not found in Active Directory');
          entry = bySam[0] as Record<string, unknown>;
        }

        const authClient = new Client(CLIENT_OPTS());
        try {
          await authClient.bind(entry.dn as string, password);
        } catch (err: any) {
          if (err?.code === 49 || err?.message?.includes('Invalid Credentials')) {
            throw new Error('Invalid username or password');
          }
          throw err;
        } finally {
          await authClient.unbind().catch(() => {});
        }

        return buildResult(entry, sam);
      }
    } finally {
      await searchClient.unbind().catch(() => {});
    }
  }

  // ── Direct user bind (used when no service account is configured, or the
  // service account bind above failed) ──────────────────────────────────────
  const client = new Client(CLIENT_OPTS());
  try {
    await client.bind(upn, password);

    const { searchEntries } = await client.search(LDAP_BASE_DN, {
      scope: 'sub',
      filter: `(userPrincipalName=${escapeLdap(upn)})`,
      attributes: attrs,
    });

    let entries = searchEntries;
    if (!entries.length) {
      const { searchEntries: bySam } = await client.search(LDAP_BASE_DN, {
        scope: 'sub',
        filter: `(sAMAccountName=${escapeLdap(sam)})`,
        attributes: attrs,
      });
      if (!bySam.length) throw new Error('User account not found in Active Directory');
      entries = bySam;
    }

    return buildResult(entries[0] as Record<string, unknown>, sam);
  } catch (err: any) {
    if (err?.code === 49 || err?.message?.includes('Invalid Credentials')) {
      throw new Error('Invalid username or password');
    }
    throw err;
  } finally {
    await client.unbind().catch(() => {});
  }
}

export interface GroupMember {
  displayName: string;
  email: string;
  username: string;
}

// Looks up every user whose memberOf includes the given group CN. Used to
// populate the Administrators list on the App Info page from the real
// APP-STO_MANAGEMENT_ADMIN group, rather than hardcoding names.
//
// Requires a service account bind (LDAP_BIND_DN/LDAP_BIND_PASSWORD) — unlike
// login, there is no signed-in user's own credentials to search with here.
export async function listGroupMembers(groupCN: string): Promise<GroupMember[]> {
  if (!LDAP_URL || !LDAP_DOMAIN || !LDAP_BASE_DN) {
    throw new Error('LDAP not configured — set LDAP_URL, LDAP_DOMAIN, and LDAP_BASE_DN in .env');
  }
  if (!LDAP_BIND_DN || !LDAP_BIND_PASS) {
    throw new Error(
      'LDAP_BIND_DN/LDAP_BIND_PASSWORD are required to list group members (no per-user credentials available for this lookup)',
    );
  }

  const client = new Client(CLIENT_OPTS());
  try {
    await client.bind(LDAP_BIND_DN, LDAP_BIND_PASS);

    // Find the group's own DN first, then search users by memberOf=<that DN>
    // rather than reading the group's `member` attribute directly — this
    // reads the same info without needing to resolve each member DN by hand,
    // and naturally excludes stale/unresolvable member references.
    const { searchEntries: groupEntries } = await client.search(LDAP_BASE_DN, {
      scope: 'sub',
      filter: `(&(objectClass=group)(cn=${escapeLdap(groupCN)}))`,
      attributes: ['dn'],
    });
    console.log(`[admins] Group lookup for "${groupCN}": found ${groupEntries.length} match(es)`);
    if (!groupEntries.length) {
      throw new Error(`AD group "${groupCN}" not found`);
    }
    const groupDN = groupEntries[0].dn as string;
    console.log(`[admins] Group DN resolved to: ${groupDN}`);

    // LDAP_MATCHING_RULE_IN_CHAIN (1.2.840.113556.1.4.1941) makes AD walk
    // nested group membership transitively — a plain `memberOf=<groupDN>`
    // filter only matches users added DIRECTLY to this group, and silently
    // misses anyone added via a nested group (a common real-AD setup).
    // objectCategory=user (not objectClass=group/etc.) matches the filter
    // shape confirmed working against this AD by a separate, known-good script.
    const chainFilter = `(&(objectCategory=user)(memberOf:1.2.840.113556.1.4.1941:=${escapeLdap(groupDN)}))`;
    const { searchEntries: chainEntries } = await client.search(LDAP_BASE_DN, {
      scope: 'sub',
      filter: chainFilter,
      attributes: ['displayName', 'mail', 'sAMAccountName'],
    });
    console.log(`[admins] Transitive-match filter "${chainFilter}" → ${chainEntries.length} member(s)`);

    // Fall back to a plain direct-membership filter if the transitive match
    // returned nothing — some AD/LDAP configurations restrict or don't
    // support LDAP_MATCHING_RULE_IN_CHAIN for the bind account being used.
    let memberEntries = chainEntries;
    if (memberEntries.length === 0) {
      const directFilter = `(&(objectCategory=user)(memberOf=${escapeLdap(groupDN)}))`;
      const { searchEntries: directEntries } = await client.search(LDAP_BASE_DN, {
        scope: 'sub',
        filter: directFilter,
        attributes: ['displayName', 'mail', 'sAMAccountName'],
      });
      console.log(`[admins] Direct-match filter "${directFilter}" → ${directEntries.length} member(s)`);
      memberEntries = directEntries;
    }

    return memberEntries
      .map(e => ({
        displayName: (e.displayName as string) || (e.sAMAccountName as string) || '',
        email: (e.mail as string) || '',
        username: (e.sAMAccountName as string) || '',
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  } finally {
    await client.unbind().catch(() => {});
  }
}
