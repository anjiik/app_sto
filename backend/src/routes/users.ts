import { Router, Response } from 'express';
import { authenticate, AuthRequest, can } from '../middleware/auth';
import { dbQuery, dbQueryOne, dbExecute } from '../db/connection';
import { logAdminAction } from '../db/adminAudit';
import { Group } from '../types';
import logger from '../lib/logger';
import { writeLimit } from '../middleware/rateLimits';

const router = Router();
router.use(authenticate);
router.use(writeLimit);

interface AppUserRow {
  id:           number;
  ad_username:  string;
  display_name: string;
  email:        string | null;
  site:         string | null;
  app_group:    string;
  is_active:    number | boolean;
  created_at:   string;
}

// GET /api/users — list all app users (admin only)
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!can(req.user!, 'admin')) {
    res.status(403).json({ message: 'Admin access required' }); return;
  }
  try {
    const users = await dbQuery<AppUserRow>(
      `SELECT id, ad_username, display_name, email, site, app_group, is_active, created_at
       FROM app_users ORDER BY display_name`,
    );
    res.json(users.map(u => ({ ...u, is_active: Boolean(u.is_active) })));
  } catch (err) {
    logger.error({ err }, 'users GET error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/users/:id — update site, app_group, or is_active (admin only)
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!can(req.user!, 'admin')) {
    res.status(403).json({ message: 'Admin access required' }); return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid user id' }); return; }

  const { site, app_group, is_active } = req.body as {
    site?: string | null;
    app_group?: string;
    is_active?: boolean;
  };

  if (site === undefined && app_group === undefined && is_active === undefined) {
    res.status(400).json({ message: 'Provide at least one field to update: site, app_group, or is_active' });
    return;
  }

  // Prevent admins from removing their own admin role or deactivating themselves
  if (req.user!.userId === id) {
    if (app_group !== undefined && app_group !== 'admin') {
      res.status(400).json({ message: 'You cannot remove your own admin role' }); return;
    }
    if (is_active === false) {
      res.status(400).json({ message: 'You cannot deactivate your own account' }); return;
    }
  }

  try {
    const target = await dbQueryOne<{ id: number; ad_username: string; app_group: string; site: string | null; is_active: number }>(
      'SELECT id, ad_username, app_group, site, is_active FROM app_users WHERE id = @id', { id },
    );
    if (!target) { res.status(404).json({ message: 'User not found' }); return; }

    const validGroups: Group[] = [
      'receiving_site', 'shipping_planning', 'shipping_logistics',
      'management', 'finance', 'receiving_logistics', 'admin',
    ];
    if (app_group !== undefined && !validGroups.includes(app_group as Group)) {
      res.status(400).json({ message: 'Invalid app_group value' }); return;
    }

    const updates: string[] = ['updated_at = GETDATE()'];
    const params: Record<string, unknown> = { id };

    if (site !== undefined)      { updates.push('site = @site');           params.site       = site || null; }
    if (app_group !== undefined) { updates.push('app_group = @app_group'); params.app_group  = app_group; }
    if (is_active !== undefined) { updates.push('is_active = @is_active'); params.is_active  = is_active ? 1 : 0; }

    await dbExecute(
      `UPDATE app_users SET ${updates.join(', ')} WHERE id = @id`,
      params,
    );

    const updated = await dbQueryOne<AppUserRow>(
      'SELECT id, ad_username, display_name, email, site, app_group, is_active, created_at FROM app_users WHERE id = @id',
      { id },
    );
    if (!updated) { res.status(404).json({ message: 'User not found after update' }); return; }

    const actor = req.user!;
    if (app_group !== undefined && app_group !== target.app_group) {
      await logAdminAction('USER_ROLE_CHANGED', id, target.ad_username, actor.userId, actor.name, target.app_group, app_group);
    }
    if (site !== undefined && (site ?? null) !== target.site) {
      await logAdminAction('USER_SITE_CHANGED', id, target.ad_username, actor.userId, actor.name, target.site ?? 'none', site ?? 'none');
    }
    if (is_active !== undefined && Boolean(is_active) !== Boolean(target.is_active)) {
      await logAdminAction(is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', id, target.ad_username, actor.userId, actor.name);
    }

    res.json({ ...updated, is_active: Boolean(updated.is_active) });
  } catch (err) {
    logger.error({ err }, 'users PUT error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
