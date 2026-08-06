import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';
import { dbQuery, dbQueryOne, dbExecute } from '../db/connection';
import { logAudit } from '../db/audit';
import logger from '../lib/logger';
import { writeLimit } from '../middleware/rateLimits';

const router = Router();
router.use(authenticate);

// Any signed-in user may attach a file (e.g. Certificate of Analysis) to any
// STO at any point in the workflow — there is no role/status gate here.
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      cb(new Error('Only PDF, JPG, and PNG files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// Wraps multer's single-file middleware so file-too-large / wrong-type errors
// come back as the same JSON error shape as the rest of the API, instead of
// falling through to Express's default (unstyled HTML) error handler.
function uploadSingle(req: AuthRequest, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'File is too large — max 10MB' });
      return;
    }
    res.status(400).json({ message: err instanceof Error ? err.message : 'Upload failed' });
  });
}

// GET /api/sto/:id/attachments — list (metadata only, no file bytes)
router.get('/:id/attachments', async (req: AuthRequest, res: Response): Promise<void> => {
  const stoId = parseInt(req.params.id, 10);
  if (!stoId || stoId <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }
  try {
    const rows = await dbQuery<Record<string, unknown>>(
      `SELECT id, sto_request_id, file_name, content_type, file_size, category,
              uploaded_by, uploaded_at
       FROM sto_attachments
       WHERE sto_request_id = @stoId
       ORDER BY uploaded_at DESC`,
      { stoId },
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'attachments list error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/attachments — upload (multipart/form-data, field name "file")
router.post(
  '/:id/attachments',
  writeLimit,
  uploadSingle,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const stoId = parseInt(req.params.id, 10);
    if (!stoId || stoId <= 0) {
      res.status(400).json({ message: 'Invalid STO id' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    try {
      const sto = await dbQueryOne<{ id: number; status: string }>(
        'SELECT id, status FROM sto_requests WHERE id = @id AND archived = 0',
        { id: stoId },
      );
      if (!sto) {
        res.status(404).json({ message: 'STO not found' });
        return;
      }

      const category = (req.body.category as string) || 'Other';
      const [result] = await dbQuery<{ id: number }>(
        `INSERT INTO sto_attachments
           (sto_request_id, file_name, content_type, file_size, category, file_data, uploaded_by)
         OUTPUT INSERTED.id
         VALUES (@stoId, @fileName, @contentType, @fileSize, @category, @fileData, @uploadedBy)`,
        {
          stoId,
          fileName: req.file.originalname,
          contentType: req.file.mimetype,
          fileSize: req.file.size,
          category,
          fileData: req.file.buffer,
          uploadedBy: user.name,
        },
      );

      await logAudit(
        stoId,
        'ATTACHMENT_ADDED',
        sto.status,
        sto.status,
        user.name,
        `${category}: ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB)`,
      );

      res.status(201).json({ id: result.id, message: 'File attached' });
    } catch (err) {
      logger.error({ err }, 'attachment upload error');
      res.status(500).json({ message: 'Internal server error' });
    }
  },
);

// GET /api/sto/:id/attachments/:attachmentId — download the file bytes
router.get(
  '/:id/attachments/:attachmentId',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const stoId = parseInt(req.params.id, 10);
    const attachmentId = parseInt(req.params.attachmentId, 10);
    if (!stoId || !attachmentId) {
      res.status(400).json({ message: 'Invalid id' });
      return;
    }
    try {
      const row = await dbQueryOne<{
        file_name: string;
        content_type: string;
        file_data: Buffer;
      }>(
        `SELECT file_name, content_type, file_data
         FROM sto_attachments
         WHERE id = @attachmentId AND sto_request_id = @stoId`,
        { attachmentId, stoId },
      );
      if (!row) {
        res.status(404).json({ message: 'Attachment not found' });
        return;
      }
      res.setHeader('Content-Type', row.content_type);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${row.file_name.replace(/"/g, '')}"`,
      );
      res.send(row.file_data);
    } catch (err) {
      logger.error({ err }, 'attachment download error');
      res.status(500).json({ message: 'Internal server error' });
    }
  },
);

// DELETE /api/sto/:id/attachments/:attachmentId — uploader or admin only
router.delete(
  '/:id/attachments/:attachmentId',
  writeLimit,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const stoId = parseInt(req.params.id, 10);
    const attachmentId = parseInt(req.params.attachmentId, 10);
    if (!stoId || !attachmentId) {
      res.status(400).json({ message: 'Invalid id' });
      return;
    }
    try {
      const [row, sto] = await Promise.all([
        dbQueryOne<{ uploaded_by: string; file_name: string }>(
          `SELECT uploaded_by, file_name FROM sto_attachments
           WHERE id = @attachmentId AND sto_request_id = @stoId`,
          { attachmentId, stoId },
        ),
        dbQueryOne<{ status: string }>('SELECT status FROM sto_requests WHERE id = @stoId', {
          stoId,
        }),
      ]);
      if (!row) {
        res.status(404).json({ message: 'Attachment not found' });
        return;
      }
      if (row.uploaded_by !== user.name && !isAdmin(user)) {
        res.status(403).json({ message: 'Only the uploader or an admin can remove this file' });
        return;
      }
      await dbExecute('DELETE FROM sto_attachments WHERE id = @attachmentId', { attachmentId });
      const status = sto?.status ?? 'DRAFT';
      await logAudit(stoId, 'ATTACHMENT_REMOVED', status, status, user.name, row.file_name);
      res.json({ message: 'Attachment removed' });
    } catch (err) {
      logger.error({ err }, 'attachment delete error');
      res.status(500).json({ message: 'Internal server error' });
    }
  },
);

export default router;
