import dotenv from 'dotenv';
dotenv.config();

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { JwtPayload, Group } from '../types';
import { authenticate, AuthRequest } from '../middleware/auth';
import { dbQueryOne } from '../db/connection';

const router = Router();

const DEV_BYPASS = process.env.PING_DEV_BYPASS === 'true';
const PING_ISSUER = process.env.PING_ISSUER_URL || '';
const PING_CLIENT_ID = process.env.PING_CLIENT_ID || '';
const PING_CLIENT_SECRET = process.env.PING_CLIENT_SECRET || '';
const PING_REDIRECT_URI = process.env.PING_REDIRECT_URI || 'http://localhost:5173/auth/callback';
const PING_GROUP_CLAIM = process.env.PING_GROUP_CLAIM || 'memberOf';

// Map AD group names from PingFederate → app group keys.
// Update these keys once you know the exact AD group names in your PingFederate claims.
const PING_GROUP_MAP: Record<string, Group> = {
  STO_Receiving_Site:     'receiving_site',
  STO_Shipping_Planning:  'shipping_planning',
  STO_Shipping_Logistics: 'shipping_logistics',
  STO_Management:         'management',
  STO_Finance:            'finance',
  STO_Receiving_Logistics:'receiving_logistics',
};

const GROUP_LABELS: Record<Group, string> = {
  receiving_site:     'Receiving Site',
  shipping_planning:  'Shipping Site Planning',
  shipping_logistics: 'Shipping Site Logistics',
  management:         'Management',
  finance:            'Finance',
  receiving_logistics:'Receiving Site Logistics',
};

function issueToken(userId: number, group: Group, displayName: string, site: string): { token: string; user: JwtPayload } {
  const payload: JwtPayload = { userId, group, name: displayName, site };
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '8h' });
  return { token, user: payload };
}

// ── Demo login (DEV_BYPASS only) ───────────────────────────────────────────────

// POST /api/auth/login — { username, password } → JWT
// Only active when PING_DEV_BYPASS=true. In production, auth goes through PingFederate.
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  if (!DEV_BYPASS) {
    res.status(403).json({ message: 'Direct login is disabled — authenticate via PingFederate' });
    return;
  }
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ message: 'username and password are required' });
    return;
  }

  interface DemoUserRow {
    id: number;
    password_hash: string;
    display_name: string;
    site: string;
    group_key: string;
  }

  const user = await dbQueryOne<DemoUserRow>(
    'SELECT id, password_hash, display_name, site, group_key FROM demo_users WHERE username = @username',
    { username }
  );

  if (!user) {
    res.status(401).json({ message: 'Invalid username or password' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ message: 'Invalid username or password' });
    return;
  }

  const { token, user: payload } = issueToken(user.id, user.group_key as Group, user.display_name, user.site);
  res.json({ token, user: payload });
});

// GET /api/auth/demo-users — returns demo user list with plaintext credentials for the hints panel
// Only active when PING_DEV_BYPASS=true.
router.get('/demo-users', async (_req: Request, res: Response): Promise<void> => {
  if (!DEV_BYPASS) {
    res.json([]);
    return;
  }

  interface DemoUserListRow { username: string; display_name: string; site: string; group_key: string; }
  const rows = await dbQueryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM demo_users');

  if (!rows || rows.cnt === 0) {
    res.json([]);
    return;
  }

  const { dbQuery } = await import('../db/connection');
  const users = await dbQuery<DemoUserListRow>(
    'SELECT username, display_name, site, group_key FROM demo_users ORDER BY site, group_key'
  );

  res.json(users.map(u => ({
    username: u.username,
    password: 'Demo123!',
    displayName: u.display_name,
    site: u.site,
    group: u.group_key,
    groupLabel: GROUP_LABELS[u.group_key as Group] || u.group_key,
  })));
});

// ── PingFederate OIDC (production) ─────────────────────────────────────────────

// GET /api/auth/ping-login-url
// Returns { devBypass: true } in dev mode, or { url, state } for Ping redirect.
router.get('/ping-login-url', (_req: Request, res: Response): void => {
  if (DEV_BYPASS) {
    res.json({ devBypass: true });
    return;
  }
  if (!PING_ISSUER || !PING_CLIENT_ID) {
    res.status(503).json({ message: 'PingFederate not configured — set PING_ISSUER_URL and PING_CLIENT_ID' });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: PING_CLIENT_ID,
    redirect_uri: PING_REDIRECT_URI,
    scope: 'openid profile email',
    state,
  });
  res.json({ url: `${PING_ISSUER}/as/authorization.oauth2?${params}`, state });
});

// POST /api/auth/ping-exchange — exchanges a PingFederate auth code for an app JWT
router.post('/ping-exchange', async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ message: 'Missing authorization code' }); return; }

  try {
    const tokenRes = await fetch(`${PING_ISSUER}/as/token.oauth2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: PING_REDIRECT_URI,
        client_id: PING_CLIENT_ID,
        client_secret: PING_CLIENT_SECRET,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      res.status(401).json({ message: 'PingFederate token exchange failed', detail });
      return;
    }

    const tokens = await tokenRes.json() as { id_token?: string; access_token?: string };
    const rawToken = tokens.id_token || tokens.access_token;
    if (!rawToken) { res.status(401).json({ message: 'No token returned by PingFederate' }); return; }

    // TODO: Replace jwt.decode with JWKS signature verification in production.
    // Fetch JWKS from ${PING_ISSUER}/pf/JWKS, find key by kid, then jwt.verify(rawToken, publicKey)
    const claims = jwt.decode(rawToken) as Record<string, unknown> | null;
    if (!claims) { res.status(401).json({ message: 'Could not decode PingFederate token' }); return; }

    const rawGroup = claims[PING_GROUP_CLAIM];
    const pingGroupName = (Array.isArray(rawGroup) ? rawGroup[0] : rawGroup) as string;
    const appGroup = PING_GROUP_MAP[pingGroupName];

    if (!appGroup) {
      res.status(403).json({
        message: `Your AD group "${pingGroupName}" is not mapped to an app role. Contact your administrator.`,
      });
      return;
    }

    // AD will also provide the user's site — adjust claim name as needed
    const site = (claims['site'] || claims['physicalDeliveryOfficeName'] || 'UNKNOWN') as string;
    const displayName = (claims.name || claims.preferred_username || claims.sub) as string;
    const { token, user } = issueToken(0, appGroup, displayName, site);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ message: 'Auth exchange error', detail: String(err) });
  }
});

// ── Shared ─────────────────────────────────────────────────────────────────────

// GET /api/auth/me
router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  res.json(req.user);
});

export default router;
