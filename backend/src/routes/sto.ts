import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { dbQuery, dbQueryOne, dbExecute, dbInsert } from '../db/connection';

const router = Router();
router.use(authenticate);

const BOOL_COLS = new Set([
  'rush_request', 'public_holiday', 'toll_mfg',
  'controlled_shipping_required', 'insurance_loss_required',
  'management_approval_required', 'ready_to_ship', 'delivery_closed_out',
  'inventory_approved', 'management_approved', 'finance_approved',
  'planning_approved', 'igb_complete',
]);

function normalizeSto(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const col of BOOL_COLS) {
    if (col in out && out[col] !== null && out[col] !== undefined) {
      out[col] = Boolean(out[col]);
    }
  }
  return out;
}

function generateStoId(seqNum: number): string {
  return `STO-${new Date().getFullYear()}-${String(seqNum).padStart(5, '0')}`;
}

// GET /api/sto
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    const { status, priority, search } = req.query as Record<string, string>;
    if (status) { conditions.push('status = @status'); params.status = status; }
    if (priority) { conditions.push('priority = @priority'); params.priority = parseInt(priority); }
    if (search) {
      conditions.push('(material_sap LIKE @search OR material_description LIKE @search OR sto_id LIKE @search OR requestor_name LIKE @search)');
      params.search = `%${search}%`;
    }

    let query = `
      SELECT id, sto_id, status, request_date, requestor_name, requestor_email,
             material_sap, material_description, quantity, uom, priority,
             rush_request, shipping_site, receiving_site, requesting_plant,
             receiving_site_need_by_date, estimated_ship_by_date,
             management_approval_required, planning_approved, management_approved,
             finance_approved, ready_to_ship, tracking_id, corporate_sto_tracker_status,
             created_at, updated_at
      FROM sto_requests
    `;
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';

    const rows = await dbQuery<Record<string, unknown>>(query, params);
    res.json(rows.map(normalizeSto));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Database error', error: String(err) });
  }
});

// GET /api/sto/audit-log
router.get('/audit-log', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await dbQuery<Record<string, unknown>>(`
      SELECT TOP 20 l.id, l.sto_request_id, r.sto_id, l.action, l.old_status, l.new_status,
             l.performed_by_name, l.notes, l.performed_at
      FROM sto_audit_log l
      JOIN sto_requests r ON r.id = l.sto_request_id
      ORDER BY l.performed_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Database error', error: String(err) });
  }
});

// GET /api/sto/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sto = await dbQueryOne<Record<string, unknown>>(
      'SELECT * FROM sto_requests WHERE id = @id',
      { id: parseInt(req.params.id) }
    );
    if (!sto) { res.status(404).json({ message: 'STO not found' }); return; }

    const auditLog = await dbQuery<Record<string, unknown>>(
      'SELECT * FROM sto_audit_log WHERE sto_request_id = @stoId ORDER BY performed_at ASC',
      { stoId: sto.id }
    );

    res.json({ ...normalizeSto(sto), audit_log: auditLog });
  } catch (err) {
    res.status(500).json({ message: 'Database error', error: String(err) });
  }
});

// POST /api/sto
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.group !== 'receiving_site') {
    res.status(403).json({ message: 'Only the Receiving Site can create STOs' }); return;
  }
  try {
    const body = req.body;
    const matVal = parseFloat(body.material_value || '0');

    const countRow = await dbQueryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM sto_requests');
    const stoId = generateStoId((countRow?.cnt ?? 0) + 1);

    const newId = await dbInsert(`
      INSERT INTO sto_requests (
        sto_id, request_date, standard_estimated_ship_date, expedited_estimated_ship_date,
        repeat_shipment_calendar_year, rush_request, priority, public_holiday,
        requesting_plant, shipping_site, receiving_site, toll_mfg,
        requestor_user_id, requestor_name, requestor_email,
        material_sap, material_description, quantity, uom,
        shipping_conditions, controlled_shipping_required, brand_at_receiving_site,
        material_value, insurance_loss_required,
        rush_reason, receiving_site_need_by_date, estimated_ship_by_date,
        sto_number, shipment_id, corporate_sto_tracker_status, inco_terms,
        status
      ) OUTPUT INSERTED.id VALUES (
        @sto_id, @request_date, @standard_estimated_ship_date, @expedited_estimated_ship_date,
        @repeat_shipment_calendar_year, @rush_request, @priority, @public_holiday,
        @requesting_plant, @shipping_site, @receiving_site, @toll_mfg,
        @requestor_user_id, @requestor_name, @requestor_email,
        @material_sap, @material_description, @quantity, @uom,
        @shipping_conditions, @controlled_shipping_required, @brand_at_receiving_site,
        @material_value, @insurance_loss_required,
        @rush_reason, @receiving_site_need_by_date, @estimated_ship_by_date,
        @sto_number, @shipment_id, @corporate_sto_tracker_status, @inco_terms,
        'DRAFT'
      )
    `, {
      sto_id: stoId,
      request_date: body.request_date || new Date().toISOString().slice(0, 10),
      standard_estimated_ship_date: body.standard_estimated_ship_date || null,
      expedited_estimated_ship_date: body.expedited_estimated_ship_date || null,
      repeat_shipment_calendar_year: body.repeat_shipment_calendar_year || null,
      rush_request: body.rush_request ? 1 : 0,
      priority: body.priority || 3,
      public_holiday: body.public_holiday ? 1 : 0,
      requesting_plant: body.requesting_plant || user.plant,
      shipping_site: body.shipping_site || null,
      receiving_site: body.receiving_site || null,
      toll_mfg: body.toll_mfg ? 1 : 0,
      requestor_user_id: user.userId,
      requestor_name: body.requestor_name || user.name,
      requestor_email: body.requestor_email || '',
      material_sap: body.material_sap || null,
      material_description: body.material_description || null,
      quantity: parseFloat(body.quantity) || null,
      uom: body.uom || null,
      shipping_conditions: body.shipping_conditions || null,
      controlled_shipping_required: body.controlled_shipping_required ? 1 : 0,
      brand_at_receiving_site: body.brand_at_receiving_site || null,
      material_value: matVal || null,
      insurance_loss_required: body.insurance_loss_required ? 1 : 0,
      rush_reason: body.rush_reason || null,
      receiving_site_need_by_date: body.receiving_site_need_by_date || null,
      estimated_ship_by_date: body.estimated_ship_by_date || null,
      sto_number: body.sto_number || null,
      shipment_id: body.shipment_id || null,
      corporate_sto_tracker_status: body.corporate_sto_tracker_status || null,
      inco_terms: body.inco_terms || null,
    });

    await dbExecute(`
      INSERT INTO sto_audit_log (sto_request_id, action, new_status, performed_by, performed_by_name)
      VALUES (@stoId, 'CREATED', 'DRAFT', @performedBy, @performedByName)
    `, { stoId: newId, performedBy: user.userId, performedByName: user.name });

    res.status(201).json({ id: newId, sto_id: stoId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Database error', error: String(err) });
  }
});

// PUT /api/sto/:id
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.group !== 'receiving_site') {
    res.status(403).json({ message: 'Only the Receiving Site can edit STOs' }); return;
  }
  try {
    const existing = await dbQueryOne<{ requestor_user_id: number; status: string }>(
      'SELECT requestor_user_id, status FROM sto_requests WHERE id = @id',
      { id: parseInt(req.params.id) }
    );
    if (!existing) { res.status(404).json({ message: 'STO not found' }); return; }
    if (existing.status !== 'DRAFT') {
      res.status(400).json({ message: 'Only DRAFT STOs can be edited' }); return;
    }

    const body = req.body;
    await dbExecute(`
      UPDATE sto_requests SET
        standard_estimated_ship_date = @standard_estimated_ship_date,
        expedited_estimated_ship_date = @expedited_estimated_ship_date,
        rush_request = @rush_request, priority = @priority, public_holiday = @public_holiday,
        requesting_plant = @requesting_plant, shipping_site = @shipping_site, receiving_site = @receiving_site,
        toll_mfg = @toll_mfg, material_sap = @material_sap, material_description = @material_description,
        quantity = @quantity, uom = @uom,
        shipping_conditions = @shipping_conditions,
        controlled_shipping_required = @controlled_shipping_required,
        brand_at_receiving_site = @brand_at_receiving_site,
        material_value = @material_value,
        insurance_loss_required = @insurance_loss_required,
        rush_reason = @rush_reason, receiving_site_need_by_date = @receiving_site_need_by_date,
        estimated_ship_by_date = @estimated_ship_by_date,
        repeat_shipment_calendar_year = @repeat_shipment_calendar_year,
        requestor_name = @requestor_name, requestor_email = @requestor_email,
        sto_number = @sto_number, shipment_id = @shipment_id,
        corporate_sto_tracker_status = @corporate_sto_tracker_status,
        inco_terms = @inco_terms,
        updated_at = GETDATE()
      WHERE id = @id
    `, {
      id: parseInt(req.params.id),
      standard_estimated_ship_date: body.standard_estimated_ship_date || null,
      expedited_estimated_ship_date: body.expedited_estimated_ship_date || null,
      rush_request: body.rush_request ? 1 : 0,
      priority: body.priority || 3,
      public_holiday: body.public_holiday ? 1 : 0,
      requesting_plant: body.requesting_plant || null,
      shipping_site: body.shipping_site || null,
      receiving_site: body.receiving_site || null,
      toll_mfg: body.toll_mfg ? 1 : 0,
      material_sap: body.material_sap || null,
      material_description: body.material_description || null,
      quantity: parseFloat(body.quantity) || null,
      uom: body.uom || null,
      shipping_conditions: body.shipping_conditions || null,
      controlled_shipping_required: body.controlled_shipping_required ? 1 : 0,
      brand_at_receiving_site: body.brand_at_receiving_site || null,
      material_value: parseFloat(body.material_value) || null,
      insurance_loss_required: body.insurance_loss_required ? 1 : 0,
      rush_reason: body.rush_reason || null,
      receiving_site_need_by_date: body.receiving_site_need_by_date || null,
      estimated_ship_by_date: body.estimated_ship_by_date || null,
      repeat_shipment_calendar_year: body.repeat_shipment_calendar_year || null,
      requestor_name: body.requestor_name || user.name,
      requestor_email: body.requestor_email || '',
      sto_number: body.sto_number || null,
      shipment_id: body.shipment_id || null,
      corporate_sto_tracker_status: body.corporate_sto_tracker_status || null,
      inco_terms: body.inco_terms || null,
    });

    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ message: 'Database error', error: String(err) });
  }
});

export default router;
