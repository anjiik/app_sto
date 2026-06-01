import { execFile } from 'child_process';
import path from 'path';
import { findMappingByAdGroup, LdapGroupMapping } from '../config/ldapGroups';

const LDAP_DOMAIN = process.env.LDAP_DOMAIN || '';

export interface LdapAuthResult {
  displayName: string;
  email: string;
  mapping: LdapGroupMapping;
}

interface ADResult {
  displayName: string;
  email: string;
  groups: string[];
}

// Authenticates a user against Active Directory using Windows GSSAPI/Kerberos.
// PowerShell's PrincipalContext picks up the machine's domain credentials
// automatically — no service account password required.
export async function authenticateWithAD(username: string, password: string): Promise<LdapAuthResult> {
  if (!LDAP_DOMAIN) {
    throw new Error('LDAP_DOMAIN not set in .env (e.g. LDAP_DOMAIN=yourcompany.com)');
  }

  // Strip domain prefix/suffix so PowerShell gets a plain sAMAccountName.
  // Accepts: "john.doe", "DOMAIN\john.doe", "john.doe@company.com"
  const sam = username.includes('\\') ? username.split('\\')[1]
              : username.includes('@') ? username.split('@')[0]
              : username;

  const adResult = await runPowerShell(sam, LDAP_DOMAIN, password);

  let mapping: LdapGroupMapping | undefined;
  for (const group of adResult.groups) {
    mapping = findMappingByAdGroup(group);
    if (mapping) break;
  }

  if (!mapping) {
    throw new Error(
      `Your account is not in any STO group. ` +
      `Found AD groups: ${adResult.groups.join(', ') || '(none)'}. ` +
      `Contact your administrator to be added to the correct group.`
    );
  }

  return { displayName: adResult.displayName, email: adResult.email, mapping };
}

function runPowerShell(username: string, domain: string, password: string): Promise<ADResult> {
  // Script lives in backend/src/scripts/ — process.cwd() = backend/ when npm run dev is used
  const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'ad-auth.ps1');

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-Username', username,
        '-Domain', domain,
      ],
      {
        timeout: 15000,
        // Pass password via env var — keeps it out of the process argument list
        env: { ...process.env, STO_AD_PASSWORD: password },
      },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message || '').trim();
          if (msg.includes('INVALID_CREDENTIALS')) {
            return reject(new Error('Invalid username or password'));
          }
          if (msg.includes('USER_NOT_FOUND')) {
            return reject(new Error('User account not found in Active Directory'));
          }
          return reject(new Error(msg || 'Active Directory authentication failed'));
        }

        try {
          const data = JSON.parse(stdout.trim()) as ADResult;
          resolve(data);
        } catch {
          reject(new Error('Could not parse Active Directory response — check backend terminal for details'));
        }
      }
    );
  });
}
