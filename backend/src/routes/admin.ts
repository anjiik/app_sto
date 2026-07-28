import { Router, Response } from 'express';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';
import { dbQueryOne, dbExecute } from '../db/connection';
import logger from '../lib/logger';

const router = Router();
router.use(authenticate);

const ARCHIVE_YEARS = 5;

// GET /api/admin/archive/preview — how many records would be archived
router.get('/archive/preview', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!isAdmin(req.user!)) {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  try {
    const row = await dbQueryOne<{ eligible: number }>(
      `SELECT COUNT(*) AS eligible FROM sto_requests
       WHERE archived = 0
         AND status IN ('CLOSED', 'REJECTED')
         AND updated_at < DATEADD(year, -@years, GETDATE())`,
      { years: ARCHIVE_YEARS },
    );
    res.json({ eligible: row?.eligible ?? 0, retention_years: ARCHIVE_YEARS });
  } catch (err) {
    logger.error({ err }, 'archive preview error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/admin/archive/run — mark eligible records as archived
router.post('/archive/run', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!isAdmin(req.user!)) {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  try {
    const before = await dbQueryOne<{ eligible: number }>(
      `SELECT COUNT(*) AS eligible FROM sto_requests
       WHERE archived = 0
         AND status IN ('CLOSED', 'REJECTED')
         AND updated_at < DATEADD(year, -@years, GETDATE())`,
      { years: ARCHIVE_YEARS },
    );
    const count = before?.eligible ?? 0;
    if (count === 0) {
      res.json({ archived: 0, message: 'No records eligible for archiving' });
      return;
    }
    await dbExecute(
      `UPDATE sto_requests
       SET archived = 1, archived_at = GETDATE()
       WHERE archived = 0
         AND status IN ('CLOSED', 'REJECTED')
         AND updated_at < DATEADD(year, -@years, GETDATE())`,
      { years: ARCHIVE_YEARS },
    );
    logger.info({ count, archivedBy: req.user!.adUsername }, 'archive run completed');
    res.json({ archived: count, message: `${count} record${count === 1 ? '' : 's'} archived` });
  } catch (err) {
    logger.error({ err }, 'archive run error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
