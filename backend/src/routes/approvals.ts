import { Router, Response } from 'express';
import { authenticate, AuthRequest, can, isAdmin, hasRoleAtSite } from '../middleware/auth';
import { dbQueryOne, withTransaction } from '../db/connection';
import { logAudit } from '../db/audit';
import { STOStatus } from '../types';
import logger from '../lib/logger';
import { writeLimit } from '../middleware/rateLimits';
import { sendStoCompletedEmail, sendStoSubmittedEmail } from '../lib/notify';

const router = Router();
router.use(authenticate);
router.use(writeLimit);

async function getSto(id: number): Promise<Record<string, unknown> | undefined> {
  return dbQueryOne<Record<string, unknown>>('SELECT * FROM sto_requests WHERE id = @id', { id });
}

// Canonical forward order of workflow steps. "Back one step" for the admin
// revert / send-back actions walks this list one position earlier, based on the
// STO's CURRENT status — NOT the audit log, so it works repeatedly (each click
// steps back one more) regardless of loop-backs recorded in the history.
const WORKFLOW_ORDER: STOStatus[] = [
  'DRAFT',
  'PLANNING_REVIEW',
  'SHIPPING_LOGISTICS',
  'MANAGEMENT_REVIEW',
  'RECEIVING_MGMT_REVIEW',
  'RECEIVING_LOGISTICS',
  'CLOSED',
];

// Returns the status one step earlier than `current`, or null if there is none
// (current is DRAFT, REJECTED, or unknown).
function previousStep(current: STOStatus): STOStatus | null {
  const idx = WORKFLOW_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return WORKFLOW_ORDER[idx - 1];
}

// POST /api/sto/:id/submit
router.post('/:id/submit', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }
  try {
    const sto = await getSto(id);
    if (!sto) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    if (sto.status !== 'DRAFT') {
      res.status(400).json({ message: 'Only DRAFT STOs can be submitted' });
      return;
    }
    await withTransaction(async execute => {
      await execute(
        'UPDATE sto_requests SET status = @status, updated_at = GETDATE() WHERE id = @id',
        { id: sto.id, status: 'PLANNING_REVIEW' },
      );
      await logAudit(
        sto.id as number,
        'SUBMITTED',
        'DRAFT',
        'PLANNING_REVIEW',
        user.name,
        undefined,
        execute,
      );
    });
    sendStoSubmittedEmail({
      sto_id: sto.sto_id as string,
      requestor_name: sto.requestor_name as string,
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
    res.status(403).json({ message: 'Shipping Planning group required' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }
  const { approved, decision, notes, mpn_number, batch_number, expiration_date } = req.body as {
    approved?: boolean;
    decision?: 'approve' | 'reject' | 'revise';
    notes?: string;
    mpn_number?: string;
    batch_number?: string;
    expiration_date?: string;
  };

  // Resolve the outcome. `decision` is the new tri-state API; `approved` is kept
  // for backward compatibility (true → approve, false → reject).
  const outcome: 'approve' | 'reject' | 'revise' =
    decision ?? (approved === true ? 'approve' : approved === false ? 'reject' : 'reject');
  if (!['approve', 'reject', 'revise'].includes(outcome)) {
    res.status(400).json({ message: 'decision must be approve, reject, or revise' });
    return;
  }
  // Revise and reject both need a note explaining what to fix / why.
  if ((outcome === 'revise' || outcome === 'reject') && (!notes || !notes.trim())) {
    res.status(400).json({ message: `A note is required to ${outcome} the request` });
    return;
  }

  try {
    const sto = await getSto(id);
    if (!sto) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    if (sto.status !== 'PLANNING_REVIEW') {
      res.status(400).json({ message: 'STO is not in Planning Review' });
      return;
    }
    // Planning is a shipping-site action: must hold shipping_planning at this STO's
    // shipping site (admins bypass).
    if (!hasRoleAtSite(user, 'shipping_planning', sto.shipping_site as string)) {
      res
        .status(403)
        .json({ message: "Only Shipping Planning at this STO's shipping site can act here" });
      return;
    }
    if (outcome === 'approve' && (!mpn_number || !batch_number || !expiration_date)) {
      res
        .status(400)
        .json({ message: 'MPN Number, Batch Number and Expiration Date are required to approve' });
      return;
    }

    // approve → Shipping Logistics; revise → back to the requestor as DRAFT;
    // reject → REJECTED (terminal).
    const newStatus: STOStatus =
      outcome === 'approve' ? 'SHIPPING_LOGISTICS' : outcome === 'revise' ? 'DRAFT' : 'REJECTED';
    const action =
      outcome === 'approve'
        ? 'PLANNING_APPROVED'
        : outcome === 'revise'
          ? 'PLANNING_REVISION_REQUESTED'
          : 'PLANNING_REJECTED';

    await withTransaction(async execute => {
      await execute(
        `
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
      `,
        {
          id: sto.id,
          planningApproved: outcome === 'approve' ? 1 : 0,
          approvedBy: null,
          notes: notes || null,
          mpn_number: mpn_number || null,
          batch_number: batch_number || null,
          expiration_date: expiration_date || null,
          status: newStatus,
          // For revise, surface the note to the requestor as the reason shown on
          // the draft; for reject, the rejection reason; for approve, clear it.
          rejectionReason:
            outcome === 'approve'
              ? null
              : outcome === 'revise'
                ? `Revision requested by Shipping Planning: ${notes}`
                : notes || 'Rejected by Shipping Planning',
        },
      );
      await logAudit(
        sto.id as number,
        action,
        'PLANNING_REVIEW',
        newStatus,
        user.name,
        notes,
        execute,
      );
    });
    const msg =
      outcome === 'approve'
        ? 'Approved — sent to Shipping Logistics'
        : outcome === 'revise'
          ? 'Revision requested — sent back to the requestor'
          : 'Rejected';
    res.json({ message: msg, new_status: newStatus });
  } catch (err) {
    logger.error({ err }, 'planning error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/logistics
router.post('/:id/logistics', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!can(user, 'shipping_logistics')) {
    res.status(403).json({ message: 'Shipping Logistics group required' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }
  try {
    const sto = await getSto(id);
    if (!sto) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    if (sto.status !== 'SHIPPING_LOGISTICS') {
      res.status(400).json({ message: 'STO is not in Shipping Logistics step' });
      return;
    }
    // Logistics is a shipping-site action.
    if (!hasRoleAtSite(user, 'shipping_logistics', sto.shipping_site as string)) {
      res
        .status(403)
        .json({ message: "Only Shipping Logistics at this STO's shipping site can act here" });
      return;
    }

    const body = req.body;
    const rawFreightCost = body.freight_cost;
    const freightCost = parseFloat(rawFreightCost || '0');
    const materialValue = parseFloat(String(sto.material_value || '0'));
    const matThreshold = parseFloat(process.env.MANAGEMENT_APPROVAL_MATERIAL_THRESHOLD || '100000');
    const freightThreshold = parseFloat(
      process.env.MANAGEMENT_APPROVAL_FREIGHT_THRESHOLD || '20000',
    );
    const COLD_CONDITIONS = ['Cold 2-8C', 'Cold below 0', 'Frozen'];
    const isColdShipping = COLD_CONDITIONS.includes(String(sto.shipping_conditions || ''));
    const freightToValueRatio = materialValue > 0 ? freightCost / materialValue : 0;
    // FCA and DAP are the standard INCO terms; any other specified term requires
    // management approval. A blank term (the field is optional) does not trigger it.
    // Compared case-insensitively so free-text values stored from the "Other" option
    // still match if they happen to be FCA/DAP.
    const STANDARD_INCO_TERMS = ['FCA', 'DAP'];
    const incoTerms = String(sto.inco_terms || '')
      .trim()
      .toUpperCase();
    const isNonStandardInco = incoTerms !== '' && !STANDARD_INCO_TERMS.includes(incoTerms);
    // Controlled shipping always requires management sign-off from both sites.
    const isControlledShipping = Boolean(sto.controlled_shipping_required);
    const mgmtRequired =
      materialValue > matThreshold ||
      freightCost > freightThreshold ||
      isColdShipping ||
      freightToValueRatio > 0.3 ||
      isNonStandardInco ||
      isControlledShipping;

    // Flow when management approval is required:
    //   SHIPPING_LOGISTICS → MANAGEMENT_REVIEW → RECEIVING_MGMT_REVIEW
    //     → back to SHIPPING_LOGISTICS (confirm pass) → RECEIVING_LOGISTICS
    // The confirm pass is marked by mgmt_confirmed = 1 (set once both managements
    // have approved), so this step advances straight to receiving logistics.
    // If no management approval is required, skip everything and go straight to
    // RECEIVING_LOGISTICS.
    const alreadyConfirmed = Boolean(sto.mgmt_confirmed);
    const goToMgmt = mgmtRequired && !alreadyConfirmed;
    const newStatus: STOStatus = goToMgmt ? 'MANAGEMENT_REVIEW' : 'RECEIVING_LOGISTICS';

    // Material is only actually ready to ship once any required management
    // approval is in hand. Reject a Ready-to-Ship=true submission that is about
    // to be routed to management (defence in depth — the UI also gates this).
    if (goToMgmt && body.ready_to_ship) {
      res.status(400).json({
        message:
          'This shipment requires management approval — Ready to Ship cannot be checked off yet.',
      });
      return;
    }

    // On the post-management confirm pass, actual ship date, estimated delivery
    // date, PGI date, ready-to-ship, and the SAP STO# become mandatory before
    // the STO can move on to receiving logistics (i.e. before it ships).
    if (alreadyConfirmed) {
      const missing: string[] = [];
      if (!body.actual_ship_date) missing.push('Actual Ship Date');
      if (!body.estimated_delivery_date) missing.push('Estimated Delivery Date');
      if (!body.pgi_date) missing.push('PGI Date');
      if (!body.ready_to_ship) missing.push('Ready to Ship');
      if (!body.sto_number && !sto.sto_number) missing.push('STO Number');
      if (missing.length) {
        res.status(400).json({ message: `Required before continuing: ${missing.join(', ')}` });
        return;
      }
    }

    await withTransaction(async execute => {
      await execute(
        `
        UPDATE sto_requests SET
          container_information = @container_information,
          freight_cost = @freight_cost,
          ready_to_ship = @ready_to_ship,
          pgi_date = @pgi_date,
          sto_number = COALESCE(@sto_number, sto_number),
          shipment_id = COALESCE(@shipment_id, shipment_id),
          actual_ship_date = @actual_ship_date,
          estimated_delivery_date = @estimated_delivery_date,
          management_approval_required = @management_approval_required,
          status = @status,
          updated_at = GETDATE()
        WHERE id = @id
      `,
        {
          id: sto.id,
          container_information: body.container_information || null,
          freight_cost: rawFreightCost != null && rawFreightCost !== '' ? freightCost : null,
          ready_to_ship: body.ready_to_ship ? 1 : 0,
          pgi_date: body.pgi_date || null,
          sto_number: body.sto_number || null,
          shipment_id: body.shipment_id || null,
          actual_ship_date: body.actual_ship_date || null,
          estimated_delivery_date: body.estimated_delivery_date || null,
          management_approval_required: mgmtRequired ? 1 : 0,
          status: newStatus,
        },
      );
      const reasons = [
        materialValue > matThreshold && `material $${materialValue.toLocaleString()} > threshold`,
        freightCost > freightThreshold && `freight $${freightCost.toLocaleString()} > threshold`,
        isColdShipping && `cold shipping (${sto.shipping_conditions})`,
        freightToValueRatio > 0.3 &&
          `freight:value ratio ${(freightToValueRatio * 100).toFixed(0)}%`,
        isControlledShipping && 'controlled shipping',
        isNonStandardInco && `non-standard INCO term (${sto.inco_terms})`,
      ]
        .filter(Boolean)
        .join('; ');
      const auditNote = alreadyConfirmed
        ? 'Logistics confirmed after management approval.'
        : `Freight: $${freightCost}. Mgmt approval ${mgmtRequired ? `required — ${reasons}` : 'not required'}.`;
      await logAudit(
        sto.id as number,
        alreadyConfirmed ? 'LOGISTICS_CONFIRMED' : 'LOGISTICS_SUBMITTED',
        'SHIPPING_LOGISTICS',
        newStatus,
        user.name,
        auditNote,
        execute,
      );
    });
    res.json({
      message: goToMgmt ? 'Sent to Management review' : 'Sent to Receiving Logistics',
      new_status: newStatus,
    });
  } catch (err) {
    logger.error({ err }, 'logistics error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/request-sto-number — Shipping Site Logistics flags that the
// SAP STO# still needs to be populated on the tracker. STO# is generated by
// Receiving Site Planning but recorded by the requestor, so this sets a visible
// reminder on the record (and audit trail) rather than sending a notification.
router.post(
  '/:id/request-sto-number',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user!;
    if (!can(user, 'shipping_logistics')) {
      res.status(403).json({ message: 'Shipping Logistics group required' });
      return;
    }
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      res.status(400).json({ message: 'Invalid STO id' });
      return;
    }
    try {
      const sto = await getSto(id);
      if (!sto) {
        res.status(404).json({ message: 'Not found' });
        return;
      }
      if (!hasRoleAtSite(user, 'shipping_logistics', sto.shipping_site as string)) {
        res
          .status(403)
          .json({ message: "Only Shipping Logistics at this STO's shipping site can act here" });
        return;
      }
      await withTransaction(async execute => {
        await execute(
          'UPDATE sto_requests SET sto_number_requested_at = GETDATE() WHERE id = @id',
          { id },
        );
        await logAudit(
          id,
          'STO_NUMBER_REQUESTED',
          sto.status as STOStatus,
          sto.status as STOStatus,
          user.name,
          'Requested the SAP STO# be populated on the tracker',
          execute,
        );
      });
      res.json({ message: 'Reminder sent to the requestor to populate the STO#' });
    } catch (err) {
      logger.error({ err }, 'request-sto-number error');
      res.status(500).json({ message: 'Internal server error' });
    }
  },
);

// POST /api/sto/:id/management  — shipping-site management approval
router.post('/:id/management', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!can(user, 'management')) {
    res.status(403).json({ message: 'Management group required' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }
  const { approved, notes } = req.body as { approved: boolean; notes?: string };
  if (typeof approved !== 'boolean') {
    res.status(400).json({ message: '`approved` must be a boolean' });
    return;
  }
  try {
    const sto = await getSto(id);
    if (!sto) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    if (sto.status !== 'MANAGEMENT_REVIEW') {
      res.status(400).json({ message: 'STO is not in Management Review' });
      return;
    }
    // Must hold the management role AT the shipping site (same grant), not merely
    // management somewhere + membership of this site via an unrelated role.
    if (!hasRoleAtSite(user, 'management', sto.shipping_site as string)) {
      res.status(403).json({ message: 'Only the shipping site management can approve this step' });
      return;
    }
    // Shipping management approval hands off to the receiving-site management
    // review. The confirm pass at logistics only happens after BOTH managements
    // have approved (see the receiving-management route).
    const newStatus: STOStatus = approved ? 'RECEIVING_MGMT_REVIEW' : 'REJECTED';
    await withTransaction(async execute => {
      await execute(
        `
        UPDATE sto_requests SET
          management_approved = @managementApproved,
          management_approved_by_user_id = @approvedBy,
          management_approved_at = GETDATE(),
          management_notes = @notes,
          status = @status,
          rejection_reason = @rejectionReason,
          updated_at = GETDATE()
        WHERE id = @id
      `,
        {
          id: sto.id,
          managementApproved: approved ? 1 : 0,
          approvedBy: null,
          notes: notes || null,
          status: newStatus,
          rejectionReason: approved ? null : notes || 'Rejected by Shipping Site Management',
        },
      );
      await logAudit(
        sto.id as number,
        approved ? 'MANAGEMENT_APPROVED' : 'MANAGEMENT_REJECTED',
        'MANAGEMENT_REVIEW',
        newStatus,
        user.name,
        notes,
        execute,
      );
    });
    res.json({
      message: approved
        ? 'Shipping management approved — sent to Receiving Management'
        : 'Rejected',
      new_status: newStatus,
    });
  } catch (err) {
    logger.error({ err }, 'management error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/receiving-management  — receiving-site management approval
router.post('/:id/receiving-management', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  // Distinct from shipping management: this step requires the receiving_management
  // role (its own AD group), so a shipping-mgmt user cannot act here.
  if (!can(user, 'receiving_management')) {
    res.status(403).json({ message: 'Receiving Management group required' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }
  const { approved, notes } = req.body as { approved: boolean; notes?: string };
  if (typeof approved !== 'boolean') {
    res.status(400).json({ message: '`approved` must be a boolean' });
    return;
  }
  try {
    const sto = await getSto(id);
    if (!sto) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    if (sto.status !== 'RECEIVING_MGMT_REVIEW') {
      res.status(400).json({ message: 'STO is not in Receiving Management Review' });
      return;
    }
    if (!hasRoleAtSite(user, 'receiving_management', sto.receiving_site as string)) {
      res.status(403).json({ message: 'Only the receiving site management can approve this step' });
      return;
    }
    // Both managements have now approved. Return the STO to Shipping Logistics
    // for the confirm/edit pass (mgmt_confirmed = 1 tells logistics to advance
    // straight to Receiving Logistics rather than looping back to management).
    const newStatus: STOStatus = approved ? 'SHIPPING_LOGISTICS' : 'REJECTED';
    await withTransaction(async execute => {
      await execute(
        `
        UPDATE sto_requests SET
          receiving_mgmt_approved = @receivingMgmtApproved,
          receiving_mgmt_approved_by_user_id = @approvedBy,
          receiving_mgmt_approved_at = GETDATE(),
          receiving_mgmt_notes = @notes,
          mgmt_confirmed = @mgmtConfirmed,
          status = @status,
          rejection_reason = @rejectionReason,
          updated_at = GETDATE()
        WHERE id = @id
      `,
        {
          id: sto.id,
          receivingMgmtApproved: approved ? 1 : 0,
          approvedBy: null,
          notes: notes || null,
          mgmtConfirmed: approved ? 1 : 0,
          status: newStatus,
          rejectionReason: approved ? null : notes || 'Rejected by Receiving Site Management',
        },
      );
      await logAudit(
        sto.id as number,
        approved ? 'RECEIVING_MGMT_APPROVED' : 'RECEIVING_MGMT_REJECTED',
        'RECEIVING_MGMT_REVIEW',
        newStatus,
        user.name,
        notes,
        execute,
      );
    });
    res.json({
      message: approved
        ? 'Receiving management approved — returned to Shipping Logistics to confirm'
        : 'Rejected',
      new_status: newStatus,
    });
  } catch (err) {
    logger.error({ err }, 'receiving-management error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/receiving-logistics
router.post('/:id/receiving-logistics', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!can(user, 'receiving_logistics')) {
    res.status(403).json({ message: 'Receiving Logistics group required' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }
  try {
    const sto = await getSto(id);
    if (!sto) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    if (sto.status !== 'RECEIVING_LOGISTICS') {
      res.status(400).json({ message: 'STO is not in Receiving Logistics step' });
      return;
    }
    // Receiving is a receiving-site action.
    if (!hasRoleAtSite(user, 'receiving_logistics', sto.receiving_site as string)) {
      res
        .status(403)
        .json({ message: "Only Receiving Logistics at this STO's receiving site can act here" });
      return;
    }

    const body = req.body;
    const newStatus: STOStatus = body.delivery_closed_out ? 'CLOSED' : 'RECEIVING_LOGISTICS';

    await withTransaction(async execute => {
      await execute(
        `
        UPDATE sto_requests SET
          actual_receipt_date = @actual_receipt_date,
          delivery_closed_out = @delivery_closed_out,
          status = @status,
          updated_at = GETDATE()
        WHERE id = @id
      `,
        {
          id: sto.id,
          actual_receipt_date: body.actual_receipt_date || null,
          delivery_closed_out: body.delivery_closed_out ? 1 : 0,
          status: newStatus,
        },
      );
      await logAudit(
        sto.id as number,
        newStatus === 'CLOSED' ? 'DELIVERY_CLOSED' : 'RECEIPT_UPDATED',
        'RECEIVING_LOGISTICS',
        newStatus,
        user.name,
        body.actual_receipt_date ? `Received: ${body.actual_receipt_date}` : undefined,
        execute,
      );
    });
    if (newStatus === 'CLOSED') {
      sendStoCompletedEmail({
        sto_id: sto.sto_id as string,
        requestor_name: sto.requestor_name as string,
        requestor_email: sto.requestor_email as string,
        shipping_site: sto.shipping_site as string | undefined,
        receiving_site: sto.receiving_site as string | undefined,
        material_description: sto.material_description as string | undefined,
        material_sap: sto.material_sap as string | undefined,
      });
    }
    res.json({
      message: newStatus === 'CLOSED' ? 'Delivery closed out' : 'Receipt updated',
      new_status: newStatus,
    });
  } catch (err) {
    logger.error({ err }, 'receiving-logistics error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/revert — admin only, steps the STO back one workflow step.
// Uses the canonical WORKFLOW_ORDER off the CURRENT status, so clicking it
// repeatedly keeps walking backwards one step at a time.
router.post('/:id/revert', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!isAdmin(user)) {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }
  try {
    const sto = await getSto(id);
    if (!sto) {
      res.status(404).json({ message: 'Not found' });
      return;
    }

    const fromStatus = sto.status as STOStatus;
    const toStatus = previousStep(fromStatus);
    if (!toStatus) {
      res.status(400).json({ message: 'Cannot revert — already at the first step' });
      return;
    }

    await withTransaction(async execute => {
      await execute(
        'UPDATE sto_requests SET status = @status, mgmt_confirmed = 0, rejection_reason = NULL, updated_at = GETDATE() WHERE id = @id',
        { id, status: toStatus },
      );
      await logAudit(
        id,
        'REVERTED',
        fromStatus,
        toStatus,
        user.name,
        `Admin reverted from ${fromStatus} to ${toStatus}`,
        execute,
      );
    });
    res.json({ message: `Reverted to ${toStatus}`, new_status: toStatus });
  } catch (err) {
    logger.error({ err }, 'revert error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sto/:id/send-back — admin only, sends the STO back one step with a
// required reason. Distinct from /revert: the reason is mandatory and surfaced
// to the receiving step as the rejection_reason so they know what to change.
router.post('/:id/send-back', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!isAdmin(user)) {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }

  const { reason } = req.body as { reason?: string };
  if (!reason || !reason.trim()) {
    res.status(400).json({ message: 'A reason is required to send an STO back' });
    return;
  }

  try {
    const sto = await getSto(id);
    if (!sto) {
      res.status(404).json({ message: 'Not found' });
      return;
    }

    const fromStatus = sto.status as STOStatus;
    const toStatus = previousStep(fromStatus);
    if (!toStatus) {
      res.status(400).json({ message: 'Cannot send back — already at the first step' });
      return;
    }

    await withTransaction(async execute => {
      await execute(
        'UPDATE sto_requests SET status = @status, mgmt_confirmed = 0, rejection_reason = @reason, updated_at = GETDATE() WHERE id = @id',
        { id, status: toStatus, reason: reason.trim() },
      );
      await logAudit(
        id,
        'SENT_BACK',
        fromStatus,
        toStatus,
        user.name,
        `Admin sent back from ${fromStatus} to ${toStatus}: ${reason.trim()}`,
        execute,
      );
    });
    res.json({ message: `Sent back to ${toStatus}`, new_status: toStatus });
  } catch (err) {
    logger.error({ err }, 'send-back error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
