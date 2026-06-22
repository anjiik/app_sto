import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { dbQuery } from '../db/connection';

const router = Router();
router.use(authenticate);

// GET /api/sites — returns all valid site codes (any authenticated user)
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sites = await dbQuery<{ code: string; name: string }>(
      'SELECT code, name FROM sites ORDER BY code',
    );
    res.json(sites);
  } catch (err) {
    console.error('[sites GET] Error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
