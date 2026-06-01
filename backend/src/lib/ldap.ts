import { Client } from 'ldapts';
import { findMappingByAdGroup, LdapGroupMapping } from '../config/ldapGroups';

const LDAP_URL       = process.env.LDAP_URL          || '';
const LDAP_DOMAIN    = process.env.LDAP_DOMAIN        || '';
const LDAP_BASE_DN   = process.env.LDAP_BASE_DN       || '';
const LDAP_BIND_DN   = process.env.LDAP_BIND_DN       || ''; // service account UPN or DN
const LDAP_BIND_PASS = process.env.LDAP_BIND_PASSWORD || ''; // service account password

export interface LdapAuthResult {
  displayName: string;
  email: string;
  mapping: LdapGroupMapping;
}

// Extracts CN from a full AD distinguished name.
// "CN=ABC_STO_Receiving_Site,OU=Groups,DC=company,DC=com" → "ABC_STO_Receiving_Site"
function extractCN(dn: string): string {
  const match = dn.match(/^CN=([^,]+)/i);
  return match ? match[1] : dn;
}

// Normalises a username to UPN format: john.doe → john.doe@LDAP_DOMAIN
function toUPN(username: string): string {
  if (username.includes('@')) return username;
  if (username.includes('\\')) return `${username.split('\\')[1]}@${LDAP_DOMAIN}`;
  return `${username}@${LDAP_DOMAIN}`;
}

const CLIENT_OPTS = () => ({
  url: LDAP_URL,
  timeout: 5000,
  connectTimeout: 5000,
  // Uncomment for LDAPS with self-signed cert:
  // tlsOptions: { rejectUnauthorized: false },
});

export async function authenticateWithAD(username: string, password: string): Promise<LdapAuthResult> {
  if (!LDAP_URL || !LDAP_DOMAIN || !LDAP_BASE_DN) {
    throw new Error('LDAP not configured — set LDAP_URL, LDAP_DOMAIN, and LDAP_BASE_DN in .env');
  }

  const upn = toUPN(username);

  // ── Service account flow (production) ─────────────────────────────────────
  // Bind with a dedicated service account to search the directory, then
  // validate the user's password with a separate bind attempt.
  if (LDAP_BIND_DN && LDAP_BIND_PASS) {
    const searchClient = new Client(CLIENT_OPTS());
    try {
      await searchClient.bind(LDAP_BIND_DN, LDAP_BIND_PASS);

      // Find user by UPN, fall back to sAMAccountName
      let entry: Record<string, unknown> | null = null;
      const { searchEntries } = await searchClient.search(LDAP_BASE_DN, {
        scope: 'sub',
        filter: `(userPrincipalName=${upn})`,
        attributes: ['dn', 'displayName', 'mail', 'memberOf'],
      });

      if (searchEntries.length > 0) {
        entry = searchEntries[0] as Record<string, unknown>;
      } else {
        const sam = username.includes('\\') ? username.split('\\')[1] : username.split('@')[0];
        const { searchEntries: fallback } = await searchClient.search(LDAP_BASE_DN, {
          scope: 'sub',
          filter: `(sAMAccountName=${sam})`,
          attributes: ['dn', 'displayName', 'mail', 'memberOf'],
        });
        if (fallback.length === 0) throw new Error('User account not found in Active Directory');
        entry = fallback[0] as Record<string, unknown>;
      }

      // Validate the user's password via a separate bind using their full DN
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

      return buildResult(entry, username);

    } finally {
      await searchClient.unbind().catch(() => {});
    }
  }

  // ── Direct user bind flow (fallback when no service account is set) ────────
  const client = new Client(CLIENT_OPTS());
  try {
    await client.bind(upn, password);

    const { searchEntries } = await client.search(LDAP_BASE_DN, {
      scope: 'sub',
      filter: `(userPrincipalName=${upn})`,
      attributes: ['displayName', 'mail', 'memberOf'],
    });

    let entries = searchEntries;
    if (!entries.length) {
      const sam = username.includes('\\') ? username.split('\\')[1] : username.split('@')[0];
      const { searchEntries: fallback } = await client.search(LDAP_BASE_DN, {
        scope: 'sub',
        filter: `(sAMAccountName=${sam})`,
        attributes: ['displayName', 'mail', 'memberOf'],
      });
      if (!fallback.length) throw new Error('User account not found in Active Directory');
      entries = fallback;
    }

    return buildResult(entries[0] as Record<string, unknown>, username);

  } catch (err: any) {
    if (err?.code === 49 || err?.message?.includes('Invalid Credentials')) {
      throw new Error('Invalid username or password');
    }
    throw err;
  } finally {
    await client.unbind().catch(() => {});
  }
}

function buildResult(entry: Record<string, unknown>, fallbackUsername: string): LdapAuthResult {
  const displayName = (entry.displayName as string) || fallbackUsername;
  const email       = (entry.mail as string)        || '';

  const rawGroups = entry.memberOf
    ? (Array.isArray(entry.memberOf) ? entry.memberOf : [entry.memberOf]) as string[]
    : [];
  const groupCNs = rawGroups.map(extractCN);

  let mapping: LdapGroupMapping | undefined;
  for (const cn of groupCNs) {
    mapping = findMappingByAdGroup(cn);
    if (mapping) break;
  }

  if (!mapping) {
    throw new Error(
      `Your account is not in any STO group. ` +
      `Found AD groups: ${groupCNs.join(', ') || '(none)'}. ` +
      `Contact your administrator to be added to the correct group.`
    );
  }

  return { displayName, email, mapping };
}
