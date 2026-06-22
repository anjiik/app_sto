import dotenv from 'dotenv';
dotenv.config();

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { JwtPayload, Group } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';
import { dbQuery, dbQueryOne, dbExecute } from '../db/connection';
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
  finance:             'Finance',
  receiving_logistics: 'Receiving Logistics',
  admin:               'Admin',
};

interface AppUserRow {
  id:           number;
  ad_username:  string;
  display_name: string;
  site:         string | null;
  app_group:    string;
  is_active:    number | boolean; // BIT — truthy=active, falsy=disabled
}

function issueToken(
  userId: number, group: Group, displayName: string, site: string | null,
): { token: string; user: JwtPayload } {
  const payload: JwtPayload = { userId, group, name: displayName, site };
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
    // ── Dev mode: validate password against demo_users, look up role in app_users ──
    try {
      interface DemoRow { id: number; password_hash: string; display_name: string; site: string; group_key: string; }
      const demoUser = await dbQueryOne<DemoRow>(
        'SELECT id, password_hash, display_name, site, group_key FROM demo_users WHERE username = @username',
        { username },
      );
      if (!demoUser || !(await bcrypt.compare(password, demoUser.password_hash))) {
        res.status(401).json({ message: 'Invalid username or password' });
        return;
      }

      let appUser = await dbQueryOne<AppUserRow>(
        'SELECT id, ad_username, display_name, site, app_group, is_active FROM app_users WHERE ad_username = @username',
        { username },
      );
      if (!appUser) {
        try {
          const [created] = await dbQuery<AppUserRow>(`
            INSERT INTO app_users (ad_username, display_name, site, app_group)
            OUTPUT INSERTED.id, INSERTED.ad_username, INSERTED.display_name,
                   INSERTED.site, INSERTED.app_group, INSERTED.is_active
            VALUES (@username, @displayName, @site, @group)
          `, { username, displayName: demoUser.display_name, site: demoUser.site, group: demoUser.group_key });
          if (!created) throw new Error('INSERT INTO app_users returned no rows');
          appUser = created;
        } catch (insertErr: any) {
          // Concurrent login — another request inserted the row first
          const isDuplicate = insertErr.number === 2627 || insertErr.number === 2601
            || insertErr.message?.includes('duplicate key') || insertErr.message?.includes('Violation of UNIQUE KEY');
          if (!isDuplicate) throw insertErr;
          appUser = await dbQueryOne<AppUserRow>(
            'SELECT id, ad_username, display_name, site, app_group, is_active FROM app_users WHERE ad_username = @username',
            { username },
          );
          if (!appUser) throw insertErr;
        }
      }
      if (!appUser.is_active) {
        res.status(403).json({ message: 'Your account has been disabled. Contact your administrator.' });
        return;
      }
      const { token, user } = issueToken(appUser.id, appUser.app_group as Group, appUser.display_name, appUser.site);
      res.json({ token, user });
    } catch (err) {
      console.error('[dev auth] Error:', err);
      res.status(500).json({ message: 'Authentication error' });
    }
    return;
  }

  // ── Production mode: validate against AD, look up / auto-create in app_users ──
  console.log(`[AD auth] Login attempt for: ${username}`);
  try {
    const { displayName, adUsername, email } = await authenticateWithAD(username, password);
    console.log(`[AD auth] AD authentication succeeded for ${adUsername}`);

    let appUser = await dbQueryOne<AppUserRow>(
      'SELECT id, ad_username, display_name, site, app_group, is_active FROM app_users WHERE ad_username = @adUsername',
      { adUsername },
    );

    if (!appUser) {
      // First login: auto-create with no site (user must complete setup)
      try {
        const [created] = await dbQuery<AppUserRow>(`
          INSERT INTO app_users (ad_username, display_name, email, app_group)
          OUTPUT INSERTED.id, INSERTED.ad_username, INSERTED.display_name,
                 INSERTED.site, INSERTED.app_group, INSERTED.is_active
          VALUES (@adUsername, @displayName, @email, 'receiving_site')
        `, { adUsername, displayName, email: email || null });
        if (!created) throw new Error('INSERT INTO app_users returned no rows');
        appUser = created;
        console.log(`[AD auth] New user auto-created: ${adUsername}`);
      } catch (insertErr: any) {
        // Concurrent first login — another request inserted the row first
        const isDuplicate = insertErr.number === 2627 || insertErr.number === 2601
          || insertErr.message?.includes('duplicate key') || insertErr.message?.includes('Violation of UNIQUE KEY');
        if (!isDuplicate) throw insertErr;
        appUser = await dbQueryOne<AppUserRow>(
          'SELECT id, ad_username, display_name, site, app_group, is_active FROM app_users WHERE ad_username = @adUsername',
          { adUsername },
        );
        if (!appUser) throw insertErr;
        console.log(`[AD auth] Concurrent first-login resolved for ${adUsername}`);
      }
    }

    if (!appUser.is_active) {
      res.status(403).json({ message: 'Your account has been disabled. Contact your administrator.' });
      return;
    }

    const { token, user } = issueToken(appUser.id, appUser.app_group as Group, appUser.display_name, appUser.site);
    res.json({ token, user });
  } catch (err: any) {
    console.error(`[AD auth] Failed for ${username}:`, err.message);
    const isAuthError = err.message?.includes('Invalid username')
      || err.message?.includes('not authorised')
      || err.message?.includes('not found');
    res.status(isAuthError ? 401 : 500).json({
      message: isAuthError ? 'Invalid username or password' : 'Authentication failed',
    });
  }
});

// POST /api/auth/setup-site — called on first login when site is null
// Sets the user's site and issues a new JWT with site populated.
router.post('/setup-site', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.site) {
    res.status(400).json({ message: 'Site is already set. Contact an admin to change it.' });
    return;
  }
  const { site } = req.body as { site?: string };
  if (!site) {
    res.status(400).json({ message: 'site is required' });
    return;
  }
  try {
    const siteRow = await dbQueryOne<{ code: string }>(
      'SELECT code FROM sites WHERE code = @site',
      { site },
    );
    if (!siteRow) {
      res.status(400).json({ message: 'Invalid site code' });
      return;
    }
    await dbExecute(
      'UPDATE app_users SET site = @site, updated_at = GETDATE() WHERE id = @id',
      { site, id: user.userId },
    );
    const { token, user: newPayload } = issueToken(user.userId, user.group, user.name, site);
    res.json({ token, user: newPayload });
  } catch (err) {
    console.error('[setup-site] Error:', err);
    res.status(500).json({ message: 'Error updating site' });
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
