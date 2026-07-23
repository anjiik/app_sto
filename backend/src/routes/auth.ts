import dotenv from 'dotenv';
dotenv.config();

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { JwtPayload, Group, Grant } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';
import { dbQuery, dbQueryOne } from '../db/connection';
import { authenticateWithAD } from '../lib/ldap';

const router = Router();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// true  → dev/test mode: login validates against the demo_users table (run npm run seed first)
// false → production mode: login validates against Active Directory via LDAP
const DEV_BYPASS = process.env.DEV_BYPASS === 'true';

const GROUP_LABELS: Record<Group, string> = {
  receiving_site: 'Receiving Site',
  shipping_planning: 'Shipping Planning',
  shipping_logistics: 'Shipping Logistics',
  management: 'Shipping Management',
  receiving_management: 'Receiving Management',
  receiving_logistics: 'Receiving Logistics',
  admin: 'Admin',
};

function issueToken(
  adUsername: string,
  displayName: string,
  grants: Grant[],
): { token: string; user: JwtPayload } {
  // Derived fields for display/back-compat. Primary role: admin if the user holds
  // any admin grant, else the first grant. Sites: union across all grants.
  const primary = grants.find(g => g.group === 'admin') ?? grants[0];
  const sites = Array.from(new Set(grants.map(g => g.site).filter(Boolean)));
  const payload: JwtPayload = {
    adUsername,
    name: displayName,
    grants,
    group: primary.group,
    site: primary.site,
    sites,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '8h' });
  return { token, user: payload };
}

// Build a demo user's grants. Preferred form: the `grants` column is a
// semicolon-separated list of `role@site` pairs (e.g.
// "shipping_logistics@ABC;receiving_logistics@ABC;shipping_planning@ABL").
// Legacy fallback: no `grants` value → expand the single `group_key` across the
// comma-separated `site` column (one grant per site), preserving old behaviour.
function parseDemoGrants(grants: string | null, groupKey: string, site: string): Grant[] {
  const parsed: Grant[] = [];
  if (grants && grants.trim()) {
    for (const pair of grants
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)) {
      const [g, s] = pair.split('@').map(x => x.trim());
      if (g && s) parsed.push({ group: g as Group, site: s });
    }
  }
  if (parsed.length) return parsed;
  const sites = site
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return (sites.length ? sites : [site]).map(s => ({ group: groupKey as Group, site: s }));
}

// POST /api/auth/login — { username, password } → JWT
router.post('/login', loginRateLimit, async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ message: 'username and password are required' });
    return;
  }

  if (DEV_BYPASS) {
    // ── Dev mode: validate against demo_users; role + site are stored directly ──
    try {
      interface DemoRow {
        password_hash: string;
        display_name: string;
        site: string;
        group_key: string;
        grants: string | null;
      }
      const demoUser = await dbQueryOne<DemoRow>(
        'SELECT password_hash, display_name, site, group_key, grants FROM demo_users WHERE username = @username',
        { username },
      );
      if (!demoUser || !(await bcrypt.compare(password, demoUser.password_hash))) {
        res.status(401).json({ message: 'Invalid username or password' });
        return;
      }
      const grants = parseDemoGrants(demoUser.grants, demoUser.group_key, demoUser.site);
      const { token, user } = issueToken(username, demoUser.display_name, grants);
      res.json({ token, user });
    } catch (err) {
      console.error('[dev auth] Error:', err);
      res.status(500).json({ message: 'Authentication error' });
    }
    return;
  }

  // ── Production mode: validate against AD, derive role + site from AD groups ──
  console.log(`[AD auth] Login attempt for: ${username}`);
  try {
    const { displayName, adUsername, grants } = await authenticateWithAD(username, password);
    console.log(
      `[AD auth] Login succeeded: ${adUsername} → grants=${grants.map(g => `${g.group}@${g.site}`).join(', ')}`,
    );
    const { token, user } = issueToken(adUsername, displayName, grants);
    res.json({ token, user });
  } catch (err: any) {
    console.error(`[AD auth] Failed for ${username}:`, err.message);
    const isAuthError =
      err.message?.includes('Invalid username') ||
      err.message?.includes('not in any STO') ||
      err.message?.includes('not found');
    res.status(isAuthError ? 401 : 500).json({
      message: isAuthError ? err.message : 'Authentication failed',
    });
  }
});

// GET /api/auth/demo-users — returns demo credentials for the hints panel (DEV_BYPASS only)
router.get('/demo-users', async (_req: Request, res: Response): Promise<void> => {
  if (!DEV_BYPASS) {
    res.json([]);
    return;
  }

  try {
    interface DemoUserListRow {
      username: string;
      display_name: string;
      site: string;
      group_key: string;
      grants: string | null;
    }
    const users = await dbQuery<DemoUserListRow>(
      'SELECT username, display_name, site, group_key, grants FROM demo_users ORDER BY site, group_key',
    );
    res.json(
      users.map(u => ({
        username: u.username,
        password: 'Demo123!',
        displayName: u.display_name,
        site: u.site,
        group: u.group_key,
        groupLabel: GROUP_LABELS[u.group_key as Group] || u.group_key,
        grants: u.grants || null,
      })),
    );
  } catch {
    res.json([]);
  }
});

// GET /api/auth/ping-login-url — tells the frontend which auth mode is active
router.get('/ping-login-url', (_req: Request, res: Response): void => {
  res.json(DEV_BYPASS ? { devBypass: true } : { ldapMode: true });
});

// GET /api/auth/me
router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  res.json(req.user);
});

export default router;
