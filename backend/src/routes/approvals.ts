import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { dbQueryOne, dbExecute } from '../db/connection';
import { STOStatus } from '../types';

const router = Router();
router.use(authenticate);

async function logAudit(stoId: number, action: string, oldStatus: string | null, newStatus: string, userId: number, userName: string, notes?: string): Promise<void> {
  await dbExecute(`
    INSERT INTO sto_audit_log (sto_request_id, action, old_status, new_status, performed_by, performed_by_name, notes)
    VALUES (@stoId, @action, @oldStatus, @newStatus, @performedBy, @performedByName, @notes)
  `, { stoId, action, oldStatus: oldStatus || null, newStatus, performedBy: userId, performedByName: userName, notes: notes || null });
}

async function updateStatus(id: number, status: STOStatus): Promise<void> {
  await dbExecute(
    'UPDATE sto_requests SET status = @status, updated_at = GETDATE() WHERE id = @id',
    { id, status }
  );
}

async function getSto(id: number): Promise<Record<string, unknown> | undefined> {
  return dbQueryOne<Record<string, unknown>>('SELECT * FROM sto_requests WHERE id = @id', { id });
}

// POST /api/sto/:id/submit
router.post('/:id/submit', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.group !== 'receiving_site') {
    res.status(403).json({ message: 'Only the Receiving Site can submit STOs' }); return;
  }
  try {
    const sto = await getSto(parseInt(req.params.id));
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'DRAFT') {
      res.status(400).json({ message: 'Only DRAFT STOs can be submitted' }); return;
    }
    await updateStatus(sto.id as number, 'PLANNING_REVIEW');
    await logAudit(sto.id as number, 'SUBMITTED', 'DRAFT', 'PLANNING_REVIEW', user.userId, user.name);
    res.json({ message: 'Submitted to Shipping Planning queue' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: String(err) });
  }
});

// POST /api/sto/:id/planning
router.post('/:id/planning', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.group !== 'shipping_planning') {
    res.status(403).json({ message: 'Shipping Planning group required' }); return;
  }
  const { approved, notes, mpn_number, batch_number, expiration_date } = req.body as {
    approved: boolean; notes?: string; mpn_number?: string; batch_number?: string; expiration_date?: string;
  };
  try {
    const sto = await getSto(parseInt(req.params.id));
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'PLANNING_REVIEW') {
      res.status(400).json({ message: 'STO is not in Planning Review' }); return;
    }
    if (approved && (!mpn_number || !batch_number || !expiration_date)) {
      res.status(400).json({ message: 'MPN Number, Batch Number and Expiration Date are required to approve' }); return;
    }
    const newStatus: STOStatus = approved ? 'SHIPPING_LOGISTICS' : 'REJECTED';
    await dbExecute(`
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
      approvedBy: user.userId,
      notes: notes || null,
      mpn_number: mpn_number || null,
      batch_number: batch_number || null,
      expiration_date: expiration_date || null,
      status: newStatus,
      rejectionReason: approved ? null : (notes || 'Rejected by Shipping Planning'),
    });
    await logAudit(sto.id as number, approved ? 'PLANNING_APPROVED' : 'PLANNING_REJECTED',
      'PLANNING_REVIEW', newStatus, user.userId, user.name, notes);
    res.json({ message: approved ? 'Approved — sent to Shipping Logistics' : 'Rejected', new_status: newStatus });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: String(err) });
  }
});

// POST /api/sto/:id/logistics
router.post('/:id/logistics', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.group !== 'shipping_logistics') {
    res.status(403).json({ message: 'Shipping Logistics group required' }); return;
  }
  try {
    const sto = await getSto(parseInt(req.params.id));
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'SHIPPING_LOGISTICS') {
      res.status(400).json({ message: 'STO is not in Shipping Logistics step' }); return;
    }

    const body = req.body;
    const freightCost = parseFloat(body.freight_cost || '0');
    const materialValue = parseFloat(String(sto.material_value || '0'));
    const matThreshold = parseFloat(process.env.MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD || '10000');
    const freightThreshold = parseFloat(process.env.MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD || '5000');
    const mgmtRequired = materialValue > matThreshold || freightCost > freightThreshold;

    const newStatus: STOStatus = mgmtRequired ? 'MANAGEMENT_REVIEW' : 'FINANCE_REVIEW';

    await dbExecute(`
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
      freight_cost: freightCost || null,
      ready_to_ship: body.ready_to_ship ? 1 : 0,
      pgi_date: body.pgi_date || null,
      tracking_id: body.tracking_id || null,
      actual_ship_date: body.actual_ship_date || null,
      estimated_delivery_date: body.estimated_delivery_date || null,
      management_approval_required: mgmtRequired ? 1 : 0,
      status: newStatus,
    });

    await logAudit(sto.id as number, 'LOGISTICS_SUBMITTED', 'SHIPPING_LOGISTICS', newStatus, user.userId, user.name,
      `Freight: $${freightCost}. Mgmt approval ${mgmtRequired ? 'required' : 'not required'}.`);
    res.json({ message: mgmtRequired ? 'Sent to Management review' : 'Sent to Finance review', new_status: newStatus });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: String(err) });
  }
});

// POST /api/sto/:id/management
router.post('/:id/management', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.group !== 'management') {
    res.status(403).json({ message: 'Management group required' }); return;
  }
  const { approved, notes, igb_complete } = req.body as { approved: boolean; notes?: string; igb_complete?: boolean };
  try {
    const sto = await getSto(parseInt(req.params.id));
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'MANAGEMENT_REVIEW') {
      res.status(400).json({ message: 'STO is not in Management Review' }); return;
    }
    const newStatus: STOStatus = approved ? 'FINANCE_REVIEW' : 'REJECTED';
    await dbExecute(`
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
      approvedBy: user.userId,
      notes: notes || null,
      igb_complete: igb_complete ? 1 : 0,
      status: newStatus,
      rejectionReason: approved ? null : (notes || 'Rejected by Management'),
    });
    await logAudit(sto.id as number, approved ? 'MANAGEMENT_APPROVED' : 'MANAGEMENT_REJECTED',
      'MANAGEMENT_REVIEW', newStatus, user.userId, user.name, notes);
    res.json({ message: approved ? 'Management approved — sent to Finance' : 'Rejected', new_status: newStatus });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: String(err) });
  }
});

// POST /api/sto/:id/finance
router.post('/:id/finance', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.group !== 'finance') {
    res.status(403).json({ message: 'Finance group required' }); return;
  }
  const { approved, notes, igb_complete } = req.body as { approved: boolean; notes?: string; igb_complete?: boolean };
  try {
    const sto = await getSto(parseInt(req.params.id));
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'FINANCE_REVIEW') {
      res.status(400).json({ message: 'STO is not in Finance Review' }); return;
    }
    const newStatus: STOStatus = approved ? 'RECEIVING_LOGISTICS' : 'REJECTED';
    await dbExecute(`
      UPDATE sto_requests SET
        finance_approved = @financeApproved,
        finance_approved_by_user_id = @approvedBy,
        finance_approved_at = GETDATE(),
        finance_notes = @notes,
        igb_complete = @igb_complete,
        status = @status,
        rejection_reason = @rejectionReason,
        updated_at = GETDATE()
      WHERE id = @id
    `, {
      id: sto.id,
      financeApproved: approved ? 1 : 0,
      approvedBy: user.userId,
      notes: notes || null,
      igb_complete: igb_complete ? 1 : 0,
      status: newStatus,
      rejectionReason: approved ? null : (notes || 'Rejected by Finance'),
    });
    await logAudit(sto.id as number, approved ? 'FINANCE_APPROVED' : 'FINANCE_REJECTED',
      'FINANCE_REVIEW', newStatus, user.userId, user.name, notes);
    res.json({ message: approved ? 'Finance approved — sent to Receiving Logistics' : 'Rejected', new_status: newStatus });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: String(err) });
  }
});

// POST /api/sto/:id/receiving-logistics
router.post('/:id/receiving-logistics', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.group !== 'receiving_logistics') {
    res.status(403).json({ message: 'Receiving Logistics group required' }); return;
  }
  try {
    const sto = await getSto(parseInt(req.params.id));
    if (!sto) { res.status(404).json({ message: 'Not found' }); return; }
    if (sto.status !== 'RECEIVING_LOGISTICS') {
      res.status(400).json({ message: 'STO is not in Receiving Logistics step' }); return;
    }

    const body = req.body;
    const newStatus: STOStatus = body.delivery_closed_out ? 'CLOSED' : 'RECEIVING_LOGISTICS';

    await dbExecute(`
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
      'RECEIVING_LOGISTICS', newStatus, user.userId, user.name,
      body.actual_receipt_date ? `Received: ${body.actual_receipt_date}` : undefined);
    res.json({ message: newStatus === 'CLOSED' ? 'Delivery closed out' : 'Receipt updated', new_status: newStatus });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: String(err) });
  }
});

export default router;
