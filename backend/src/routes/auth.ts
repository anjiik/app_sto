import dotenv from 'dotenv';
dotenv.config();

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { JwtPayload, Group } from '../types';
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
  receiving_site:      'Receiving Site',
  shipping_planning:   'Shipping Planning',
  shipping_logistics:  'Shipping Logistics',
  management:          'Management',
  receiving_logistics: 'Receiving Logistics',
  admin:               'Admin',
};

function issueToken(
  adUsername: string, group: Group, displayName: string, site: string,
): { token: string; user: JwtPayload } {
  const payload: JwtPayload = { adUsername, group, name: displayName, site };
  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '8h' });
  return { token, user: payload };
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
      interface DemoRow { password_hash: string; display_name: string; site: string; group_key: string; }
      const demoUser = await dbQueryOne<DemoRow>(
        'SELECT password_hash, display_name, site, group_key FROM demo_users WHERE username = @username',
        { username },
      );
      if (!demoUser || !(await bcrypt.compare(password, demoUser.password_hash))) {
        res.status(401).json({ message: 'Invalid username or password' });
        return;
      }
      const { token, user } = issueToken(username, demoUser.group_key as Group, demoUser.display_name, demoUser.site);
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
    const { displayName, adUsername, group, site } = await authenticateWithAD(username, password);
    console.log(`[AD auth] Login succeeded: ${adUsername} → group=${group} site=${site}`);
    const { token, user } = issueToken(adUsername, group, displayName, site);
    res.json({ token, user });
  } catch (err: any) {
    console.error(`[AD auth] Failed for ${username}:`, err.message);
    const isAuthError = err.message?.includes('Invalid username')
      || err.message?.includes('not in any STO')
      || err.message?.includes('not found');
    res.status(isAuthError ? 401 : 500).json({
      message: isAuthError ? err.message : 'Authentication failed',
    });
  }
});

// GET /api/auth/demo-users — returns demo credentials for the hints panel (DEV_BYPASS only)
router.get('/demo-users', async (_req: Request, res: Response): Promise<void> => {
  if (!DEV_BYPASS) { res.json([]); return; }

  try {
    interface DemoUserListRow { username: string; display_name: string; site: string; group_key: string; }
    const users = await dbQuery<DemoUserListRow>(
      'SELECT username, display_name, site, group_key FROM demo_users ORDER BY site, group_key',
    );
    res.json(users.map(u => ({
      username: u.username,
      password: 'Demo123!',
      displayName: u.display_name,
      site: u.site,
      group: u.group_key,
      groupLabel: GROUP_LABELS[u.group_key as Group] || u.group_key,
    })));
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
