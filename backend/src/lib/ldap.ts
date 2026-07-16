import { Client } from 'ldapts';
import { Group } from '../types';

const LDAP_URL       = process.env.LDAP_URL          || '';
const LDAP_DOMAIN    = process.env.LDAP_DOMAIN        || '';
const LDAP_BASE_DN   = process.env.LDAP_BASE_DN       || '';
const LDAP_BIND_DN   = process.env.LDAP_BIND_DN       || '';
const LDAP_BIND_PASS = process.env.LDAP_BIND_PASSWORD || '';

// Explicit map of AD group CN → { app role, site }.
// Add one entry per group that should have access.
// The key must match the CN of the group exactly (case-insensitive).
const GROUP_MAP: Record<string, { group: Group; site: string }> = {
  // ── Company-wide admin ────────────────────────────────────────────────────
  // A single admin group that oversees every site. Admins bypass all per-site
  // action checks (see can() / userHasSite in middleware/auth.ts) and the STO
  // list is not site-scoped, so the `site` here is only a harmless default
  // (e.g. for pre-filling requesting_plant if an admin creates an STO).
  // Key is the exact AD group CN (matched case-insensitively).
  'APP-STO_MANAGEMENT_ADMIN': { group: 'admin',         site: 'ABC' },
  // ── Site: ABC ─────────────────────────────────────────────────────────────
  'ABC_ADMIN':          { group: 'admin',               site: 'ABC' },
  'ABC_RECEIVING':      { group: 'receiving_site',      site: 'ABC' },
  'ABC_PLANNING':       { group: 'shipping_planning',   site: 'ABC' },
  'ABC_LOGISTICS':      { group: 'shipping_logistics',  site: 'ABC' },
  'ABC_MANAGEMENT':     { group: 'management',          site: 'ABC' },
  'ABC_RECV_LOGISTICS': { group: 'receiving_logistics', site: 'ABC' },
  // ── Site: XYZ ─────────────────────────────────────────────────────────────
  'XYZ_ADMIN':          { group: 'admin',               site: 'XYZ' },
  'XYZ_RECEIVING':      { group: 'receiving_site',      site: 'XYZ' },
  'XYZ_PLANNING':       { group: 'shipping_planning',   site: 'XYZ' },
  'XYZ_LOGISTICS':      { group: 'shipping_logistics',  site: 'XYZ' },
  'XYZ_MANAGEMENT':     { group: 'management',          site: 'XYZ' },
  'XYZ_RECV_LOGISTICS': { group: 'receiving_logistics', site: 'XYZ' },
};

export interface LdapAuthResult {
  displayName: string;
  adUsername:  string;
  email:       string;
  group:       Group;
  site:        string;    // primary site (first matching group)
  sites:       string[];  // all sites the user has this role at
}

// Sanitise values before embedding them in LDAP filter strings.
// Escapes: \ ( ) * and NUL per RFC 4515.
function escapeLdap(value: string): string {
  return value.replace(/[\\()*\x00]/g, ch =>
    `\\${ch.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
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
  if (username.includes('@'))  return username.split('@')[0];
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
// user who belongs to e.g. ABC_LOGISTICS and ABL_LOGISTICS see both sites' data.
function resolveGroupAndSite(memberOf: string[]): { group: Group; site: string; sites: string[] } {
  const cns = memberOf.map(extractCN);
  // Debug: log each raw memberOf DN and the CN extracted from it, quoted so any
  // stray whitespace / hidden characters are visible, plus whether each CN matched
  // a GROUP_MAP key. Remove once login is confirmed working.
  console.log('[AD auth] raw memberOf entries:', memberOf.length);
  // Clean, copy-friendly list of just the extracted CN names.
  console.log('[AD auth] CNs:', cns.join(' | ') || '(none)');
  cns.forEach((cn, i) => {
    const matched = !!GROUP_MAP[cn.toUpperCase()];
    console.log(`[AD auth]   [${i}] raw="${memberOf[i]}" cn="${cn}" upper="${cn.toUpperCase()}" match=${matched}`);
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

  // Pick the effective role. If the user is in an admin group, admin always wins
  // regardless of the order AD returned the groups — otherwise the role is simply
  // the first matching group. This avoids an admin being downgraded just because
  // e.g. ABC_LOGISTICS happened to appear before STO_ADMIN in memberOf.
  const primary = matches.find(m => m.group === 'admin') ?? matches[0];
  const group = primary.group;
  // Collect all sites the user has for that same role (multi-site support).
  const sites = Array.from(new Set(matches.filter(m => m.group === group).map(m => m.site)));
  return { group, site: primary.site, sites };
}

function buildResult(entry: Record<string, unknown>, sam: string): LdapAuthResult {
  const memberOf = entry.memberOf
    ? (Array.isArray(entry.memberOf) ? entry.memberOf : [entry.memberOf]) as string[]
    : [];
  const { group, site, sites } = resolveGroupAndSite(memberOf);
  return {
    displayName: (entry.displayName as string) || sam,
    adUsername:  (entry.sAMAccountName as string) || sam,
    email:       (entry.mail as string) || '',
    group,
    site,
    sites,
  };
}

export async function authenticateWithAD(username: string, password: string): Promise<LdapAuthResult> {
  if (!LDAP_URL || !LDAP_DOMAIN || !LDAP_BASE_DN) {
    throw new Error('LDAP not configured — set LDAP_URL, LDAP_DOMAIN, and LDAP_BASE_DN in .env');
  }

  const upn = toUPN(username);
  const sam = toSAM(username);
  const attrs = ['dn', 'displayName', 'mail', 'memberOf', 'sAMAccountName'];

  // ── Service-account search + user bind (preferred for production) ─────────
  if (LDAP_BIND_DN && LDAP_BIND_PASS) {
    const searchClient = new Client(CLIENT_OPTS());
    try {
      await searchClient.bind(LDAP_BIND_DN, LDAP_BIND_PASS);

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

    } finally {
      await searchClient.unbind().catch(() => {});
    }
  }

  // ── Direct user bind (fallback when no service account is configured) ─────
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
