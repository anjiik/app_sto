import { Client } from 'ldapts';
import { findMappingByAdGroup, LdapGroupMapping } from '../config/ldapGroups';

const LDAP_URL    = process.env.LDAP_URL    || '';   // e.g. ldap://ad.yourcompany.com
const LDAP_DOMAIN = process.env.LDAP_DOMAIN || '';   // e.g. YOURCOMPANY or yourcompany.com
const LDAP_BASE_DN= process.env.LDAP_BASE_DN|| '';   // e.g. DC=yourcompany,DC=com

export interface LdapAuthResult {
  displayName: string;
  email: string;
  mapping: LdapGroupMapping;
}

// Extracts the CN from a full AD distinguished name.
// e.g. "CN=ABC_STO_Receiving_Site,OU=Groups,DC=company,DC=com" → "ABC_STO_Receiving_Site"
function extractCN(dn: string): string {
  const match = dn.match(/^CN=([^,]+)/i);
  return match ? match[1] : dn;
}

// Normalises a username to UPN format for AD bind.
// Accepts: "john.doe", "DOMAIN\john.doe", or "john.doe@domain.com"
function toBindDN(username: string): string {
  if (username.includes('@')) return username;
  if (username.includes('\\')) {
    const parts = username.split('\\');
    return `${parts[1]}@${LDAP_DOMAIN}`;
  }
  return `${username}@${LDAP_DOMAIN}`;
}

export async function authenticateWithAD(username: string, password: string): Promise<LdapAuthResult> {
  if (!LDAP_URL || !LDAP_DOMAIN || !LDAP_BASE_DN) {
    throw new Error('LDAP not configured — set LDAP_URL, LDAP_DOMAIN, and LDAP_BASE_DN in .env');
  }

  const client = new Client({
    url: LDAP_URL,
    timeout: 5000,
    connectTimeout: 5000,
    // For LDAPS (port 636) set tlsOptions if using a self-signed cert:
    // tlsOptions: { rejectUnauthorized: false }
  });

  const bindDN = toBindDN(username);

  try {
    // Bind with user credentials — this is the authentication step.
    // If the password is wrong, ldapts throws an InvalidCredentialsError.
    await client.bind(bindDN, password);

    // Fetch the user's display name, email, and group memberships
    const { searchEntries } = await client.search(LDAP_BASE_DN, {
      scope: 'sub',
      filter: `(userPrincipalName=${bindDN})`,
      attributes: ['displayName', 'mail', 'memberOf'],
    });

    if (!searchEntries.length) {
      // Fallback: search by sAMAccountName (plain username without domain)
      const samAccount = username.includes('\\') ? username.split('\\')[1] : username.split('@')[0];
      const fallback = await client.search(LDAP_BASE_DN, {
        scope: 'sub',
        filter: `(sAMAccountName=${samAccount})`,
        attributes: ['displayName', 'mail', 'memberOf'],
      });
      if (!fallback.searchEntries.length) {
        throw new Error('User account not found in Active Directory');
      }
      searchEntries.push(...fallback.searchEntries);
    }

    const entry = searchEntries[0];

    const displayName = (entry.displayName as string) || username;
    const email       = (entry.mail as string)        || '';

    // memberOf returns an array of full DNs — extract just the CN of each
    const rawGroups = entry.memberOf
      ? (Array.isArray(entry.memberOf) ? entry.memberOf : [entry.memberOf]) as string[]
      : [];

    const groupCNs = rawGroups.map(extractCN);

    // Find the first AD group that maps to an app role
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

  } catch (err: any) {
    // ldapts throws an error with code 49 for invalid credentials
    if (err?.code === 49 || err?.message?.includes('Invalid Credentials')) {
      throw new Error('Invalid username or password');
    }
    throw err;
  } finally {
    // Always unbind to release the connection
    await client.unbind().catch(() => {});
  }
}
