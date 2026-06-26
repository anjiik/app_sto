import { Router, Response } from 'express';
import { authenticate, AuthRequest, can } from '../middleware/auth';
import { dbQueryOne, withTransaction } from '../db/connection';
import { logAudit } from '../db/audit';
import { STOStatus } from '../types';
import logger from '../lib/logger';
import { writeLimit } from '../middleware/rateLimits';
import { sendStoCompletedEmail } from '../lib/notify';

const router = Router();
router.use(authenticate);
router.use(writeLimit);

async function getSto(id: number): Promise<Record<string, unknown> | undefined> {
  return dbQueryOne<Record<string, unknown>>('SELECT * FROM sto_requests WHERE id = @id', { id });
}

// POST /api/sto/:id/submit
router.post('/:id/submit', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid STO id' }); return; }
  try {
    const sto = await getSto(id);
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'DRAFT') {
      res.status(400).json({ message: 'Only DRAFT STOs can be submitted' }); return;
    }
    await withTransaction(async (execute) => {
      await execute(
        'UPDATE sto_requests SET status = @status, updated_at = GETDATE() WHERE id = @id',
        { id: sto.id, status: 'PLANNING_REVIEW' },
      );
      await logAudit(sto.id as number, 'SUBMITTED', 'DRAFT', 'PLANNING_REVIEW', user.name, undefined, execute);
    });
    res.json({ message: 'Submitted to Shipping Planning queue' });
  } catch (err) {
    logger.error({ err }, 'submit error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/planning
router.post('/:id/planning', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!can(user, 'shipping_planning')) {
    res.status(403).json({ message: 'Shipping Planning group required' }); return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid STO id' }); return; }
  const { approved, notes, mpn_number, batch_number, expiration_date } = req.body as {
    approved: boolean; notes?: string; mpn_number?: string; batch_number?: string; expiration_date?: string;
  };
  if (typeof approved !== 'boolean') {
    res.status(400).json({ message: '`approved` must be a boolean' }); return;
  }
  try {
    const sto = await getSto(id);
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'PLANNING_REVIEW') {
      res.status(400).json({ message: 'STO is not in Planning Review' }); return;
    }
    if (approved && (!mpn_number || !batch_number || !expiration_date)) {
      res.status(400).json({ message: 'MPN Number, Batch Number and Expiration Date are required to approve' }); return;
    }
    const newStatus: STOStatus = approved ? 'SHIPPING_LOGISTICS' : 'REJECTED';
    await withTransaction(async (execute) => {
      await execute(`
        UPDATE sto_requests SET
          planning_approved = @planningApproved,
          planning_approved_by_user_id = @approvedBy,
          planning_approved_at = GETDATE(),
          planning_notes = @notes,
          mpn_number = @mpn_number,
          batch_number = @batch_number,
          expiration_date = @expiration_date,
          status = @status,
          rejection_reason = @rejectionReason,
          updated_at = GETDATE()
        WHERE id = @id
      `, {
        id: sto.id,
        planningApproved: approved ? 1 : 0,
        approvedBy: null,
        notes: notes || null,
        mpn_number: mpn_number || null,
        batch_number: batch_number || null,
        expiration_date: expiration_date || null,
        status: newStatus,
        rejectionReason: approved ? null : (notes || 'Rejected by Shipping Planning'),
      });
      await logAudit(sto.id as number, approved ? 'PLANNING_APPROVED' : 'PLANNING_REJECTED',
        'PLANNING_REVIEW', newStatus, user.name, notes, execute);
    });
    res.json({ message: approved ? 'Approved — sent to Shipping Logistics' : 'Rejected', new_status: newStatus });
  } catch (err) {
    logger.error({ err }, 'planning error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/logistics
router.post('/:id/logistics', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!can(user, 'shipping_logistics')) {
    res.status(403).json({ message: 'Shipping Logistics group required' }); return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid STO id' }); return; }
  try {
    const sto = await getSto(id);
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'SHIPPING_LOGISTICS') {
      res.status(400).json({ message: 'STO is not in Shipping Logistics step' }); return;
    }

    const body = req.body;
    const rawFreightCost = body.freight_cost;
    const freightCost = parseFloat(rawFreightCost || '0');
    const materialValue = parseFloat(String(sto.material_value || '0'));
    const matThreshold = parseFloat(process.env.MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD || '100000');
    const freightThreshold = parseFloat(process.env.MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD || '20000');
    const COLD_CONDITIONS = ['Cold below 0', 'Frozen'];
    const isColdShipping = COLD_CONDITIONS.includes(String(sto.shipping_conditions || ''));
    const freightToValueRatio = materialValue > 0 ? freightCost / materialValue : 0;
    const mgmtRequired =
      materialValue > matThreshold ||
      freightCost > freightThreshold ||
      isColdShipping ||
      freightToValueRatio > 0.30;
    const newStatus: STOStatus = mgmtRequired ? 'MANAGEMENT_REVIEW' : 'RECEIVING_LOGISTICS';

    await withTransaction(async (execute) => {
      await execute(`
        UPDATE sto_requests SET
          container_information = @container_information,
          freight_cost = @freight_cost,
          ready_to_ship = @ready_to_ship,
          pgi_date = @pgi_date,
          tracking_id = @tracking_id,
          actual_ship_date = @actual_ship_date,
          estimated_delivery_date = @estimated_delivery_date,
          management_approval_required = @management_approval_required,
          status = @status,
          updated_at = GETDATE()
        WHERE id = @id
      `, {
        id: sto.id,
        container_information: body.container_information || null,
        freight_cost: rawFreightCost != null && rawFreightCost !== '' ? freightCost : null,
        ready_to_ship: body.ready_to_ship ? 1 : 0,
        pgi_date: body.pgi_date || null,
        tracking_id: body.tracking_id || null,
        actual_ship_date: body.actual_ship_date || null,
        estimated_delivery_date: body.estimated_delivery_date || null,
        management_approval_required: mgmtRequired ? 1 : 0,
        status: newStatus,
      });
      const reasons = [
        materialValue > matThreshold     && `material $${materialValue.toLocaleString()} > threshold`,
        freightCost > freightThreshold    && `freight $${freightCost.toLocaleString()} > threshold`,
        isColdShipping                    && `cold shipping (${sto.shipping_conditions})`,
        freightToValueRatio > 0.30        && `freight:value ratio ${(freightToValueRatio * 100).toFixed(0)}%`,
      ].filter(Boolean).join('; ');
      await logAudit(sto.id as number, 'LOGISTICS_SUBMITTED', 'SHIPPING_LOGISTICS', newStatus, user.name,
        `Freight: $${freightCost}. Mgmt approval ${mgmtRequired ? `required — ${reasons}` : 'not required'}.`, execute);
    });
    res.json({ message: mgmtRequired ? 'Sent to Management review' : 'Sent to Receiving Logistics', new_status: newStatus });
  } catch (err) {
    logger.error({ err }, 'logistics error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/management  — shipping-site management approval
router.post('/:id/management', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!can(user, 'management')) {
    res.status(403).json({ message: 'Management group required' }); return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid STO id' }); return; }
  const { approved, notes, igb_complete } = req.body as { approved: boolean; notes?: string; igb_complete?: boolean };
  if (typeof approved !== 'boolean') {
    res.status(400).json({ message: '`approved` must be a boolean' }); return;
  }
  try {
    const sto = await getSto(id);
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'MANAGEMENT_REVIEW') {
      res.status(400).json({ message: 'STO is not in Management Review' }); return;
    }
    if (user.site !== sto.shipping_site) {
      res.status(403).json({ message: 'Only the shipping site management can approve this step' }); return;
    }
    const newStatus: STOStatus = approved ? 'RECEIVING_MGMT_REVIEW' : 'REJECTED';
    await withTransaction(async (execute) => {
      await execute(`
        UPDATE sto_requests SET
          management_approved = @managementApproved,
          management_approved_by_user_id = @approvedBy,
          management_approved_at = GETDATE(),
          management_notes = @notes,
          igb_complete = @igb_complete,
          status = @status,
          rejection_reason = @rejectionReason,
          updated_at = GETDATE()
        WHERE id = @id
      `, {
        id: sto.id,
        managementApproved: approved ? 1 : 0,
        approvedBy: null,
        notes: notes || null,
        igb_complete: igb_complete ? 1 : 0,
        status: newStatus,
        rejectionReason: approved ? null : (notes || 'Rejected by Shipping Site Management'),
      });
      await logAudit(sto.id as number, approved ? 'MANAGEMENT_APPROVED' : 'MANAGEMENT_REJECTED',
        'MANAGEMENT_REVIEW', newStatus, user.name, notes, execute);
    });
    res.json({ message: approved ? 'Shipping management approved — sent to Receiving Management' : 'Rejected', new_status: newStatus });
  } catch (err) {
    logger.error({ err }, 'management error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/receiving-management  — receiving-site management approval
router.post('/:id/receiving-management', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!can(user, 'management')) {
    res.status(403).json({ message: 'Management group required' }); return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid STO id' }); return; }
  const { approved, notes } = req.body as { approved: boolean; notes?: string };
  if (typeof approved !== 'boolean') {
    res.status(400).json({ message: '`approved` must be a boolean' }); return;
  }
  try {
    const sto = await getSto(id);
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'RECEIVING_MGMT_REVIEW') {
      res.status(400).json({ message: 'STO is not in Receiving Management Review' }); return;
    }
    if (user.site !== sto.receiving_site) {
      res.status(403).json({ message: 'Only the receiving site management can approve this step' }); return;
    }
    const newStatus: STOStatus = approved ? 'RECEIVING_LOGISTICS' : 'REJECTED';
    await withTransaction(async (execute) => {
      await execute(`
        UPDATE sto_requests SET
          receiving_mgmt_approved = @receivingMgmtApproved,
          receiving_mgmt_approved_by_user_id = @approvedBy,
          receiving_mgmt_approved_at = GETDATE(),
          receiving_mgmt_notes = @notes,
          status = @status,
          rejection_reason = @rejectionReason,
          updated_at = GETDATE()
        WHERE id = @id
      `, {
        id: sto.id,
        receivingMgmtApproved: approved ? 1 : 0,
        approvedBy: null,
        notes: notes || null,
        status: newStatus,
        rejectionReason: approved ? null : (notes || 'Rejected by Receiving Site Management'),
      });
      await logAudit(sto.id as number, approved ? 'RECEIVING_MGMT_APPROVED' : 'RECEIVING_MGMT_REJECTED',
        'RECEIVING_MGMT_REVIEW', newStatus, user.name, notes, execute);
    });
    res.json({ message: approved ? 'Receiving management approved — sent to Receiving Logistics' : 'Rejected', new_status: newStatus });
  } catch (err) {
    logger.error({ err }, 'receiving-management error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/receiving-logistics
router.post('/:id/receiving-logistics', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!can(user, 'receiving_logistics')) {
    res.status(403).json({ message: 'Receiving Logistics group required' }); return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid STO id' }); return; }
  try {
    const sto = await getSto(id);
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'RECEIVING_LOGISTICS') {
      res.status(400).json({ message: 'STO is not in Receiving Logistics step' }); return;
    }

    const body = req.body;
    const newStatus: STOStatus = body.delivery_closed_out ? 'CLOSED' : 'RECEIVING_LOGISTICS';

    await withTransaction(async (execute) => {
      await execute(`
        UPDATE sto_requests SET
          actual_receipt_date = @actual_receipt_date,
          delivery_closed_out = @delivery_closed_out,
          status = @status,
          updated_at = GETDATE()
        WHERE id = @id
      `, {
        id: sto.id,
        actual_receipt_date: body.actual_receipt_date || null,
        delivery_closed_out: body.delivery_closed_out ? 1 : 0,
        status: newStatus,
      });
      await logAudit(sto.id as number,
        newStatus === 'CLOSED' ? 'DELIVERY_CLOSED' : 'RECEIPT_UPDATED',
        'RECEIVING_LOGISTICS', newStatus, user.name,
        body.actual_receipt_date ? `Received: ${body.actual_receipt_date}` : undefined,
        execute);
    });
    if (newStatus === 'CLOSED') {
      sendStoCompletedEmail({
        sto_id:               sto.sto_id as string,
        requestor_name:       sto.requestor_name as string,
        requestor_email:      sto.requestor_email as string,
        shipping_site:        sto.shipping_site as string | undefined,
        receiving_site:       sto.receiving_site as string | undefined,
        material_description: sto.material_description as string | undefined,
        material_sap:         sto.material_sap as string | undefined,
      });
    }
    res.json({ message: newStatus === 'CLOSED' ? 'Delivery closed out' : 'Receipt updated', new_status: newStatus });
  } catch (err) {
    logger.error({ err }, 'receiving-logistics error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/revert — admin only, reverts one step using audit log
router.post('/:id/revert', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.group !== 'admin') {
    res.status(403).json({ message: 'Admin access required' }); return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid STO id' }); return; }
  try {
    const sto = await getSto(id);
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }

    const prevEntry = await dbQueryOne<{ old_status: string | null }>(
      'SELECT TOP 1 old_status FROM sto_audit_log WHERE sto_request_id = @id ORDER BY performed_at DESC',
      { id },
    );
    if (!prevEntry || prevEntry.old_status === null) {
      res.status(400).json({ message: 'Cannot revert — no previous step exists' }); return;
    }

    const fromStatus = sto.status as STOStatus;
    const toStatus = prevEntry.old_status as STOStatus;

    await withTransaction(async (execute) => {
      await execute(
        'UPDATE sto_requests SET status = @status, rejection_reason = NULL, updated_at = GETDATE() WHERE id = @id',
        { id, status: toStatus },
      );
      await logAudit(id, 'REVERTED', fromStatus, toStatus, user.name,
        `Admin reverted from ${fromStatus} to ${toStatus}`, execute);
    });
    res.json({ message: `Reverted to ${toStatus}`, new_status: toStatus });
  } catch (err) {
    logger.error({ err }, 'revert error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
