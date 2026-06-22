import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest, can } from '../middleware/auth';
import { dbQuery, dbQueryOne, dbExecute } from '../db/connection';
import { logAudit } from '../db/audit';
import logger from '../lib/logger';
import { writeLimit } from '../middleware/rateLimits';

const router = Router();
router.use(authenticate);

// ── BIT → boolean normalisation ───────────────────────────────────────────────
// SQL Server returns BIT columns as 1 / 0.  Centralising the conversion here
// means every response is consistent without callers having to think about it.

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


// ── Zod schemas ───────────────────────────────────────────────────────────────

const stoBaseObject = z.object({
  // Required on create, optional on update (schema is .partial()-ed for PUT)
  shipping_site:        z.string().min(1, 'Shipping site is required'),
  receiving_site:       z.string().min(1, 'Receiving site is required'),
  material_sap:         z.string().min(1, 'SAP material number is required'),
  material_description: z.string().min(1, 'Material description is required'),
  quantity:             z.coerce.number().positive('Quantity must be a positive number'),
  uom:                  z.string().min(1, 'Unit of measure is required'),

  // Optional fields
  request_date:                      z.string().optional(),
  standard_estimated_ship_date:      z.string().nullish(),
  expedited_estimated_ship_date:     z.string().nullish(),
  repeat_shipment_calendar_year:     z.string().nullish(),
  rush_request:                      z.boolean().optional().default(false),
  priority:                          z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().default(3),
  public_holiday:                    z.boolean().optional().default(false),
  requesting_plant:                  z.string().optional(),
  toll_mfg:                          z.boolean().optional().default(false),
  requestor_name:                    z.string().optional(),
  requestor_email:                   z.string().optional(),
  shipping_conditions:               z.string().nullish(),
  controlled_shipping_required:      z.boolean().optional().default(false),
  brand_at_receiving_site:           z.string().nullish(),
  material_value:                    z.coerce.number().min(0).optional(),
  insurance_loss_required:           z.boolean().optional().default(false),
  rush_reason:                       z.string().nullish(),
  receiving_site_need_by_date:       z.string().nullish(),
  estimated_ship_by_date:            z.string().nullish(),
  sto_number:                        z.string().nullish(),
  shipment_id:                       z.string().nullish(),
  corporate_sto_tracker_status:      z.string().nullish(),
  inco_terms:                        z.string().nullish(),
});

const createStoSchema = stoBaseObject.refine(
  data => !data.rush_request || !!data.rush_reason,
  { message: 'Rush reason is required when submitting a rush request', path: ['rush_reason'] },
);

// For updates all fields are optional, but rush_reason is still required if
// rush_request is explicitly set to true in the same payload.
const updateStoSchema = stoBaseObject.partial().refine(
  data => data.rush_request !== true || !!data.rush_reason,
  { message: 'Rush reason is required when submitting a rush request', path: ['rush_reason'] },
);

// ── GET /api/sto ──────────────────────────────────────────────────────────────
// Supports the following query params:
//   status, priority, search         — field filters
//   site                             — matches shipping_site OR receiving_site
//   shipping_site, receiving_site    — exact column matches (use for role-scoped queries)
//   rush_only=1                      — active rush STOs
//   active_only=1                    — excludes CLOSED and REJECTED
//   has_need_by=1                    — only rows with a need-by date set
//   sort=need_by_asc                 — order by need-by date ascending (NULLs last)
//   page, limit                      — pagination (default page=1, limit=50, max 200)

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      status, priority, search,
      site, shipping_site: shippingSite, receiving_site: receivingSite,
      rush_only, active_only, has_need_by, sort,
      page: pageStr, limit: limitStr,
    } = req.query as Record<string, string>;

    // parseInt returns NaN for non-numeric strings; the `|| N` fallback handles that
    // because NaN is falsy.  Math.max/min then clamp to safe bounds.
    const page   = Math.max(1,   parseInt(pageStr  || '1',  10) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(limitStr || '50', 10) || 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (status)          { conditions.push('status = @status');   params.status   = status; }
    if (priority)        { conditions.push('priority = @priority'); params.priority = parseInt(priority, 10); }

    // Server-enforced site scoping — client-supplied site params are ignored for
    // restricted roles; oversight roles (management/finance/admin) get pass-through.
    const user = req.user!;
    if (can(user, 'management', 'finance')) {
      if (site)          { conditions.push('(shipping_site = @site OR receiving_site = @site)'); params.site          = site; }
      if (shippingSite)  { conditions.push('shipping_site = @shipping_site');                    params.shipping_site = shippingSite; }
      if (receivingSite) { conditions.push('receiving_site = @receiving_site');                  params.receiving_site = receivingSite; }
    } else if (can(user, 'shipping_planning', 'shipping_logistics')) {
      conditions.push('shipping_site = @enforced_site');
      params.enforced_site = user.site;
    } else {
      conditions.push('receiving_site = @enforced_site');
      params.enforced_site = user.site;
    }

    if (rush_only   === '1') conditions.push('rush_request = 1');
    if (active_only === '1') conditions.push("status NOT IN ('CLOSED', 'REJECTED')");
    if (has_need_by === '1') conditions.push('receiving_site_need_by_date IS NOT NULL');
    if (search) {
      conditions.push(
        '(material_sap LIKE @search OR material_description LIKE @search OR sto_id LIKE @search OR requestor_name LIKE @search)',
      );
      params.search = `%${search}%`;
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    // Sorting: need_by_asc puts the most-overdue rows first, upcoming next, NULLs last.
    const orderBy = sort === 'need_by_asc'
      ? `ORDER BY CASE WHEN receiving_site_need_by_date IS NULL THEN 1 ELSE 0 END,
                  receiving_site_need_by_date ASC`
      : 'ORDER BY created_at DESC';

    const countRow = await dbQueryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM sto_requests${where}`,
      params,
    );

    const rows = await dbQuery<Record<string, unknown>>(`
      SELECT id, sto_id, status, request_date, requestor_name, requestor_email,
             material_sap, material_description, quantity, uom, priority,
             rush_request, shipping_site, receiving_site, requesting_plant,
             receiving_site_need_by_date, estimated_ship_by_date,
             management_approval_required, planning_approved, management_approved,
             finance_approved, ready_to_ship, tracking_id, corporate_sto_tracker_status,
             created_at, updated_at
      FROM sto_requests${where}
      ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `, { ...params, offset, limit });

    const total = countRow?.total ?? 0;
    res.json({
      data: rows.map(normalizeSto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    logger.error({ err }, 'sto GET error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /api/sto/audit-log ────────────────────────────────────────────────────

router.get('/audit-log', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!can(req.user!, 'management')) {
    res.status(403).json({ message: 'Management access required' }); return;
  }
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
    logger.error({ err }, 'audit-log GET error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /api/sto/kpis ─────────────────────────────────────────────────────────
// Returns DB-computed dashboard KPI counts — no rows transferred, just numbers.
// Scope with: site (shipping OR receiving), shipping_site, or receiving_site.

router.get('/kpis', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { site, shipping_site: shippingSite, receiving_site: receivingSite } =
      req.query as Record<string, string>;

    const baseConds: string[] = ["status NOT IN ('CLOSED', 'REJECTED')"];
    const params: Record<string, unknown> = {};

    const user = req.user!;
    if (can(user, 'management', 'finance')) {
      if (site)          { baseConds.push('(shipping_site = @site OR receiving_site = @site)'); params.site          = site; }
      if (shippingSite)  { baseConds.push('shipping_site = @shipping_site');                    params.shipping_site = shippingSite; }
      if (receivingSite) { baseConds.push('receiving_site = @receiving_site');                  params.receiving_site = receivingSite; }
    } else if (can(user, 'shipping_planning', 'shipping_logistics')) {
      baseConds.push('shipping_site = @enforced_site');
      params.enforced_site = user.site;
    } else {
      baseConds.push('receiving_site = @enforced_site');
      params.enforced_site = user.site;
    }

    const baseWhere = 'WHERE ' + baseConds.join(' AND ');

    // Single scan — three SUM(CASE WHEN …) columns instead of three separate COUNT(*) queries.
    const kpis = await dbQueryOne<{ rushActive: number; dueSoon: number; overdue: number }>(`
      SELECT
        SUM(CASE WHEN rush_request = 1 THEN 1 ELSE 0 END) AS rushActive,
        SUM(CASE WHEN receiving_site_need_by_date IS NOT NULL
                  AND receiving_site_need_by_date >= CAST(GETDATE() AS DATE)
                  AND receiving_site_need_by_date <= DATEADD(day, 7, CAST(GETDATE() AS DATE))
                 THEN 1 ELSE 0 END) AS dueSoon,
        SUM(CASE WHEN receiving_site_need_by_date IS NOT NULL
                  AND receiving_site_need_by_date < CAST(GETDATE() AS DATE)
                 THEN 1 ELSE 0 END) AS overdue
      FROM sto_requests
      ${baseWhere}
    `, params);

    res.json({
      rushActive: Number(kpis?.rushActive ?? 0),
      dueSoon:   Number(kpis?.dueSoon    ?? 0),
      overdue:   Number(kpis?.overdue    ?? 0),
    });
  } catch (err) {
    logger.error({ err }, 'kpis GET error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /api/sto/export ───────────────────────────────────────────────────────
// Same filter + site-scoping as GET /api/sto, but returns up to 5000 rows with
// no pagination — caller generates CSV client-side.

router.get('/export', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      status, priority, search,
      site, shipping_site: shippingSite, receiving_site: receivingSite,
      rush_only, active_only,
    } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (status)   { conditions.push('status = @status');     params.status   = status; }
    if (priority) { conditions.push('priority = @priority'); params.priority = parseInt(priority, 10); }

    const user = req.user!;
    if (can(user, 'management', 'finance')) {
      if (site)          { conditions.push('(shipping_site = @site OR receiving_site = @site)'); params.site           = site; }
      if (shippingSite)  { conditions.push('shipping_site = @shipping_site');                    params.shipping_site  = shippingSite; }
      if (receivingSite) { conditions.push('receiving_site = @receiving_site');                  params.receiving_site = receivingSite; }
    } else if (can(user, 'shipping_planning', 'shipping_logistics')) {
      conditions.push('shipping_site = @enforced_site');
      params.enforced_site = user.site;
    } else {
      conditions.push('receiving_site = @enforced_site');
      params.enforced_site = user.site;
    }

    if (rush_only   === '1') conditions.push('rush_request = 1');
    if (active_only === '1') conditions.push("status NOT IN ('CLOSED', 'REJECTED')");
    if (search) {
      conditions.push(
        '(material_sap LIKE @search OR material_description LIKE @search OR sto_id LIKE @search OR requestor_name LIKE @search)',
      );
      params.search = `%${search}%`;
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const rows = await dbQuery<Record<string, unknown>>(`
      SELECT TOP 5000
        sto_id, status, request_date, requestor_name, requestor_email,
        shipping_site, receiving_site, requesting_plant,
        material_sap, material_description, quantity, uom,
        priority, rush_request, material_value,
        receiving_site_need_by_date, estimated_ship_by_date,
        sto_number, tracking_id, created_at, updated_at
      FROM sto_requests${where}
      ORDER BY created_at DESC
    `, params);

    res.json(rows.map(normalizeSto));
  } catch (err) {
    logger.error({ err }, 'sto export error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /api/sto/:id ──────────────────────────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid STO id' }); return; }
  try {
    const sto = await dbQueryOne<Record<string, unknown>>(
      'SELECT * FROM sto_requests WHERE id = @id',
      { id },
    );
    if (!sto) { res.status(404).json({ message: 'STO not found' }); return; }

    const auditLog = await dbQuery<Record<string, unknown>>(
      'SELECT * FROM sto_audit_log WHERE sto_request_id = @stoId ORDER BY performed_at ASC',
      { stoId: sto.id },
    );

    res.json({ ...normalizeSto(sto), audit_log: auditLog });
  } catch (err) {
    logger.error({ err }, 'sto/:id GET error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /api/sto ─────────────────────────────────────────────────────────────

router.post('/', writeLimit, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  if (!can(user, 'receiving_site')) {
    res.status(403).json({ message: 'Only the Receiving Site can create STOs' }); return;
  }

  const parsed = createStoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const body = parsed.data;

    // NEXT VALUE FOR sto_number_seq is atomic — no two concurrent INSERTs can
    // get the same sequence value, eliminating the COUNT(*)+1 race condition.
    const [result] = await dbQuery<{ id: number; sto_id: string }>(`
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
      ) OUTPUT INSERTED.id, INSERTED.sto_id VALUES (
        'STO-' + CAST(YEAR(GETDATE()) AS VARCHAR(4)) + '-' +
          RIGHT('00000' + CAST(NEXT VALUE FOR sto_number_seq AS VARCHAR(5)), 5),
        @request_date, @standard_estimated_ship_date, @expedited_estimated_ship_date,
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
      request_date:                      body.request_date || new Date().toISOString().slice(0, 10),
      standard_estimated_ship_date:      body.standard_estimated_ship_date ?? null,
      expedited_estimated_ship_date:     body.expedited_estimated_ship_date ?? null,
      repeat_shipment_calendar_year:     body.repeat_shipment_calendar_year ?? null,
      rush_request:                      body.rush_request ? 1 : 0,
      priority:                          body.priority,
      public_holiday:                    body.public_holiday ? 1 : 0,
      requesting_plant:                  body.requesting_plant ?? user.site,
      shipping_site:                     body.shipping_site,
      receiving_site:                    body.receiving_site,
      toll_mfg:                          body.toll_mfg ? 1 : 0,
      requestor_user_id:                 user.userId,
      requestor_name:                    body.requestor_name || user.name,
      requestor_email:                   body.requestor_email ?? '',
      material_sap:                      body.material_sap,
      material_description:              body.material_description,
      quantity:                          body.quantity,
      uom:                               body.uom,
      shipping_conditions:               body.shipping_conditions ?? null,
      controlled_shipping_required:      body.controlled_shipping_required ? 1 : 0,
      brand_at_receiving_site:           body.brand_at_receiving_site ?? null,
      material_value:                    body.material_value ?? null,
      insurance_loss_required:           body.insurance_loss_required ? 1 : 0,
      rush_reason:                       body.rush_reason ?? null,
      receiving_site_need_by_date:       body.receiving_site_need_by_date ?? null,
      estimated_ship_by_date:            body.estimated_ship_by_date ?? null,
      sto_number:                        body.sto_number ?? null,
      shipment_id:                       body.shipment_id ?? null,
      corporate_sto_tracker_status:      body.corporate_sto_tracker_status ?? null,
      inco_terms:                        body.inco_terms ?? null,
    });

    await logAudit(result.id, 'CREATED', null, 'DRAFT', user.userId, user.name);

    res.status(201).json({ id: result.id, sto_id: result.sto_id });
  } catch (err) {
    logger.error({ err }, 'sto POST error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── PUT /api/sto/:id ──────────────────────────────────────────────────────────

router.put('/:id', writeLimit, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) { res.status(400).json({ message: 'Invalid STO id' }); return; }

  const user = req.user!;
  if (!can(user, 'receiving_site')) {
    res.status(403).json({ message: 'Only the Receiving Site can edit STOs' }); return;
  }

  const parsed = updateStoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const existing = await dbQueryOne<{ requestor_user_id: number; status: string }>(
      'SELECT requestor_user_id, status FROM sto_requests WHERE id = @id',
      { id },
    );
    if (!existing) { res.status(404).json({ message: 'STO not found' }); return; }
    if (!can(user, 'admin') && existing.status !== 'DRAFT') {
      res.status(400).json({ message: 'Only DRAFT STOs can be edited' }); return;
    }
    if (!can(user, 'admin') && existing.requestor_user_id !== user.userId) {
      res.status(403).json({ message: 'You can only edit your own STOs' }); return;
    }

    const body = parsed.data;
    await dbExecute(`
      UPDATE sto_requests SET
        standard_estimated_ship_date      = @standard_estimated_ship_date,
        expedited_estimated_ship_date     = @expedited_estimated_ship_date,
        rush_request                      = @rush_request,
        priority                          = @priority,
        public_holiday                    = @public_holiday,
        requesting_plant                  = @requesting_plant,
        shipping_site                     = @shipping_site,
        receiving_site                    = @receiving_site,
        toll_mfg                          = @toll_mfg,
        material_sap                      = @material_sap,
        material_description              = @material_description,
        quantity                          = @quantity,
        uom                               = @uom,
        shipping_conditions               = @shipping_conditions,
        controlled_shipping_required      = @controlled_shipping_required,
        brand_at_receiving_site           = @brand_at_receiving_site,
        material_value                    = @material_value,
        insurance_loss_required           = @insurance_loss_required,
        rush_reason                       = @rush_reason,
        receiving_site_need_by_date       = @receiving_site_need_by_date,
        estimated_ship_by_date            = @estimated_ship_by_date,
        repeat_shipment_calendar_year     = @repeat_shipment_calendar_year,
        requestor_name                    = @requestor_name,
        requestor_email                   = @requestor_email,
        sto_number                        = @sto_number,
        shipment_id                       = @shipment_id,
        corporate_sto_tracker_status      = @corporate_sto_tracker_status,
        inco_terms                        = @inco_terms,
        updated_at                        = GETDATE()
      WHERE id = @id
    `, {
      id,
      standard_estimated_ship_date:      body.standard_estimated_ship_date ?? null,
      expedited_estimated_ship_date:     body.expedited_estimated_ship_date ?? null,
      rush_request:                      body.rush_request ? 1 : 0,
      priority:                          body.priority ?? 3,
      public_holiday:                    body.public_holiday ? 1 : 0,
      requesting_plant:                  body.requesting_plant ?? null,
      shipping_site:                     body.shipping_site ?? null,
      receiving_site:                    body.receiving_site ?? null,
      toll_mfg:                          body.toll_mfg ? 1 : 0,
      material_sap:                      body.material_sap ?? null,
      material_description:              body.material_description ?? null,
      quantity:                          body.quantity ?? null,
      uom:                               body.uom ?? null,
      shipping_conditions:               body.shipping_conditions ?? null,
      controlled_shipping_required:      body.controlled_shipping_required ? 1 : 0,
      brand_at_receiving_site:           body.brand_at_receiving_site ?? null,
      material_value:                    body.material_value ?? null,
      insurance_loss_required:           body.insurance_loss_required ? 1 : 0,
      rush_reason:                       body.rush_reason ?? null,
      receiving_site_need_by_date:       body.receiving_site_need_by_date ?? null,
      estimated_ship_by_date:            body.estimated_ship_by_date ?? null,
      repeat_shipment_calendar_year:     body.repeat_shipment_calendar_year ?? null,
      requestor_name:                    body.requestor_name ?? user.name,
      requestor_email:                   body.requestor_email ?? '',
      sto_number:                        body.sto_number ?? null,
      shipment_id:                       body.shipment_id ?? null,
      corporate_sto_tracker_status:      body.corporate_sto_tracker_status ?? null,
      inco_terms:                        body.inco_terms ?? null,
    });

    await logAudit(id, 'EDITED', 'DRAFT', 'DRAFT', user.userId, user.name);

    res.json({ message: 'Updated' });
  } catch (err) {
    logger.error({ err }, 'sto PUT error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
