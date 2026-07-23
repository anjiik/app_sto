import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest, can, isAdmin, userHasSite } from '../middleware/auth';
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
  'rush_request',
  'public_holiday',
  'toll_mfg',
  'controlled_shipping_required',
  'insurance_loss_required',
  'management_approval_required',
  'ready_to_ship',
  'delivery_closed_out',
  'inventory_approved',
  'management_approved',
  'receiving_mgmt_approved',
  'planning_approved',
  'igb_complete',
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
  shipping_site: z.string().min(1, 'Shipping site is required'),
  receiving_site: z.string().min(1, 'Receiving site is required'),
  material_sap: z.string().regex(/^\d{8}$/, 'SAP material number must be exactly 8 digits'),
  material_description: z.string().min(1, 'Material description is required'),
  quantity: z.coerce
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be a positive number'),
  uom: z.string().min(1, 'Unit of measure is required'),

  // Optional fields
  request_date: z.string().optional(),
  standard_estimated_ship_date: z.string().nullish(),
  expedited_estimated_ship_date: z.string().nullish(),
  repeat_shipment_calendar_year: z.string().nullish(),
  rush_request: z.boolean().optional().default(false),
  priority: z.coerce.number().int().min(1).max(3).optional().default(3),
  public_holiday: z.boolean().optional().default(false),
  requesting_plant: z.string().optional(),
  toll_mfg: z.boolean().optional().default(false),
  requestor_name: z.string().optional(),
  requestor_email: z.string().optional(),
  // Standard conditions come from a dropdown; "Other" lets the requestor type a
  // custom value, so this is stored as free text rather than a fixed enum.
  shipping_conditions: z.string().min(1, 'Shipping condition is required'),
  controlled_shipping_required: z.boolean().optional().default(false),
  controlled_shipping_notes: z.string().nullish(),
  brand_at_receiving_site: z.string().min(1, 'Brand at receiving site is required'),
  material_value: z.coerce.number().min(0, 'Material value is required'),
  insurance_loss_required: z.boolean().optional().default(false),
  rush_reason: z.string().nullish(),
  receiving_site_need_by_date: z.string().nullish(),
  estimated_ship_by_date: z.string().nullish(),
  sto_number: z.string().nullish(),
  shipment_id: z.string().nullish(),
  corporate_sto_tracker_status: z.string().nullish(),
  inco_terms: z.string().nullish(),
});

const createStoSchema = stoBaseObject.refine(data => !data.rush_request || !!data.rush_reason, {
  message: 'Rush reason is required when submitting a rush request',
  path: ['rush_reason'],
});

// For updates all fields are optional, but rush_reason is still required if
// rush_request is explicitly set to true in the same payload.
const updateStoSchema = stoBaseObject
  .partial()
  .refine(data => data.rush_request !== true || !!data.rush_reason, {
    message: 'Rush reason is required when submitting a rush request',
    path: ['rush_reason'],
  });

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
      status,
      priority,
      search,
      shipping_site,
      receiving_site,
      requestor,
      need_by_from,
      need_by_to,
      rush_only,
      active_only,
      has_need_by,
      sort,
      page: pageStr,
      limit: limitStr,
    } = req.query as Record<string, string>;

    // parseInt returns NaN for non-numeric strings; the `|| N` fallback handles that
    // because NaN is falsy.  Math.max/min then clamp to safe bounds.
    const page = Math.max(1, parseInt(pageStr || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitStr || '50', 10) || 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['archived = 0'];
    const params: Record<string, unknown> = {};

    // Site filters accept a single value ("ABC") or a comma-separated list
    // ("ABC,ABL") for multi-site users. Builds column = @p or column IN (@p0,…).
    const addSiteFilter = (column: string, raw: string, prefix: string) => {
      const vals = raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (vals.length === 0) return;
      if (vals.length === 1) {
        conditions.push(`${column} = @${prefix}`);
        params[prefix] = vals[0];
      } else {
        const keys = vals.map((v, i) => {
          params[`${prefix}${i}`] = v;
          return `@${prefix}${i}`;
        });
        conditions.push(`${column} IN (${keys.join(', ')})`);
      }
    };

    if (status) {
      conditions.push('status = @status');
      params.status = status;
    }
    if (priority) {
      conditions.push('priority = @priority');
      params.priority = parseInt(priority, 10);
    }
    if (shipping_site) addSiteFilter('shipping_site', shipping_site, 'shipping_site');
    if (receiving_site) addSiteFilter('receiving_site', receiving_site, 'receiving_site');
    if (requestor) {
      conditions.push('requestor_name = @requestor');
      params.requestor = requestor;
    }
    if (need_by_from) {
      conditions.push('receiving_site_need_by_date >= @need_by_from');
      params.need_by_from = need_by_from;
    }
    if (need_by_to) {
      conditions.push('receiving_site_need_by_date <= @need_by_to');
      params.need_by_to = need_by_to;
    }

    if (rush_only === '1') conditions.push('rush_request = 1');
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
    const orderBy =
      sort === 'need_by_asc'
        ? `ORDER BY CASE WHEN receiving_site_need_by_date IS NULL THEN 1 ELSE 0 END,
                  receiving_site_need_by_date ASC`
        : 'ORDER BY created_at DESC';

    const countRow = await dbQueryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM sto_requests${where}`,
      params,
    );

    const rows = await dbQuery<Record<string, unknown>>(
      `
      SELECT id, sto_id, status, request_date, requestor_name, requestor_email,
             material_sap, material_description, quantity, uom, priority,
             rush_request, shipping_site, receiving_site, requesting_plant,
             receiving_site_need_by_date, estimated_ship_by_date,
             management_approval_required, planning_approved, management_approved,
             receiving_mgmt_approved, ready_to_ship, tracking_id, corporate_sto_tracker_status,
             rejection_reason, created_at, updated_at
      FROM sto_requests${where}
      ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `,
      { ...params, offset, limit },
    );

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

// ── GET /api/sto/audit-log/export ─────────────────────────────────────────────
// Admin-only. Returns the FULL audit trail (no 20-row cap) for Excel/CSV export.
router.get('/audit-log/export', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user || !isAdmin(req.user)) {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  try {
    const rows = await dbQuery<Record<string, unknown>>(`
      SELECT l.id, r.sto_id, l.action, l.old_status, l.new_status,
             l.performed_by_name, l.notes, l.performed_at
      FROM sto_audit_log l
      JOIN sto_requests r ON r.id = l.sto_request_id
      ORDER BY l.performed_at DESC
    `);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'audit-log export error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /api/sto/kpis ─────────────────────────────────────────────────────────
// Returns DB-computed dashboard KPI counts — no rows transferred, just numbers.
// Scope with: site (shipping OR receiving), shipping_site, or receiving_site.

router.get('/kpis', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // site scoping is handled below via enforced_site

    const baseConds: string[] = ['archived = 0', "status NOT IN ('CLOSED', 'REJECTED')"];
    const params: Record<string, unknown> = {};
    const baseWhere = 'WHERE ' + baseConds.join(' AND ');

    // Single scan — three SUM(CASE WHEN …) columns instead of three separate COUNT(*) queries.
    const kpis = await dbQueryOne<{ rushActive: number; dueSoon: number; overdue: number }>(
      `
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
    `,
      params,
    );

    res.json({
      rushActive: Number(kpis?.rushActive ?? 0),
      dueSoon: Number(kpis?.dueSoon ?? 0),
      overdue: Number(kpis?.overdue ?? 0),
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
      status,
      priority,
      search,
      shipping_site,
      receiving_site,
      requestor,
      need_by_from,
      need_by_to,
      rush_only,
      active_only,
    } = req.query as Record<string, string>;

    const conditions: string[] = ['archived = 0'];
    const params: Record<string, unknown> = {};

    if (status) {
      conditions.push('status = @status');
      params.status = status;
    }
    if (priority) {
      conditions.push('priority = @priority');
      params.priority = parseInt(priority, 10);
    }
    if (shipping_site) {
      conditions.push('shipping_site = @shipping_site');
      params.shipping_site = shipping_site;
    }
    if (receiving_site) {
      conditions.push('receiving_site = @receiving_site');
      params.receiving_site = receiving_site;
    }
    if (requestor) {
      conditions.push('requestor_name = @requestor');
      params.requestor = requestor;
    }
    if (need_by_from) {
      conditions.push('receiving_site_need_by_date >= @need_by_from');
      params.need_by_from = need_by_from;
    }
    if (need_by_to) {
      conditions.push('receiving_site_need_by_date <= @need_by_to');
      params.need_by_to = need_by_to;
    }

    if (rush_only === '1') conditions.push('rush_request = 1');
    if (active_only === '1') conditions.push("status NOT IN ('CLOSED', 'REJECTED')");
    if (search) {
      conditions.push(
        '(material_sap LIKE @search OR material_description LIKE @search OR sto_id LIKE @search OR requestor_name LIKE @search)',
      );
      params.search = `%${search}%`;
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const rows = await dbQuery<Record<string, unknown>>(
      `
      SELECT TOP 5000
        sto_id, status, request_date, requestor_name, requestor_email,
        shipping_site, receiving_site, requesting_plant,
        material_sap, material_description, quantity, uom,
        priority, rush_request, material_value,
        receiving_site_need_by_date, estimated_ship_by_date,
        sto_number, tracking_id, created_at, updated_at
      FROM sto_requests${where}
      ORDER BY created_at DESC
    `,
      params,
    );

    res.json(rows.map(normalizeSto));
  } catch (err) {
    logger.error({ err }, 'sto export error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /api/sto/filter-options ───────────────────────────────────────────────
// Distinct values used to populate the list-page filter dropdowns:
//   requestors — every distinct requestor_name currently on an STO
//   routes     — every distinct shipping_site → receiving_site pair
router.get('/filter-options', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requestorRows = await dbQuery<{ requestor_name: string }>(`
      SELECT DISTINCT requestor_name
      FROM sto_requests
      WHERE archived = 0 AND requestor_name IS NOT NULL AND requestor_name <> ''
      ORDER BY requestor_name
    `);
    const routeRows = await dbQuery<{ shipping_site: string; receiving_site: string }>(`
      SELECT DISTINCT shipping_site, receiving_site
      FROM sto_requests
      WHERE archived = 0 AND shipping_site IS NOT NULL AND receiving_site IS NOT NULL
      ORDER BY shipping_site, receiving_site
    `);
    res.json({
      requestors: requestorRows.map(r => r.requestor_name),
      routes: routeRows.map(r => ({
        shipping_site: r.shipping_site,
        receiving_site: r.receiving_site,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'filter-options GET error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /api/sto/:id ──────────────────────────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }
  try {
    const sto = await dbQueryOne<Record<string, unknown>>(
      'SELECT * FROM sto_requests WHERE id = @id',
      { id },
    );
    if (!sto) {
      res.status(404).json({ message: 'STO not found' });
      return;
    }

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

  const parsed = createStoSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const body = parsed.data;

    // NEXT VALUE FOR sto_number_seq is atomic — no two concurrent INSERTs can
    // get the same sequence value, eliminating the COUNT(*)+1 race condition.
    const [result] = await dbQuery<{ id: number; sto_id: string }>(
      `
      INSERT INTO sto_requests (
        sto_id, request_date, standard_estimated_ship_date, expedited_estimated_ship_date,
        repeat_shipment_calendar_year, rush_request, priority, public_holiday,
        requesting_plant, shipping_site, receiving_site, toll_mfg,
        requestor_user_id, requestor_name, requestor_email,
        material_sap, material_description, quantity, uom,
        shipping_conditions, controlled_shipping_required, controlled_shipping_notes, brand_at_receiving_site,
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
        @shipping_conditions, @controlled_shipping_required, @controlled_shipping_notes, @brand_at_receiving_site,
        @material_value, @insurance_loss_required,
        @rush_reason, @receiving_site_need_by_date, @estimated_ship_by_date,
        @sto_number, @shipment_id, @corporate_sto_tracker_status, @inco_terms,
        'DRAFT'
      )
    `,
      {
        request_date: body.request_date || new Date().toISOString().slice(0, 10),
        standard_estimated_ship_date: body.standard_estimated_ship_date ?? null,
        expedited_estimated_ship_date: body.expedited_estimated_ship_date ?? null,
        repeat_shipment_calendar_year: body.repeat_shipment_calendar_year ?? null,
        rush_request: body.rush_request ? 1 : 0,
        priority: body.priority,
        public_holiday: body.public_holiday ? 1 : 0,
        requesting_plant: body.requesting_plant ?? user.site,
        shipping_site: body.shipping_site,
        receiving_site: body.receiving_site,
        toll_mfg: body.toll_mfg ? 1 : 0,
        requestor_user_id: null,
        requestor_name: body.requestor_name || user.name,
        requestor_email: body.requestor_email ?? '',
        material_sap: body.material_sap,
        material_description: body.material_description,
        quantity: body.quantity,
        uom: body.uom,
        shipping_conditions: body.shipping_conditions ?? null,
        controlled_shipping_required: body.controlled_shipping_required ? 1 : 0,
        controlled_shipping_notes: body.controlled_shipping_required
          ? (body.controlled_shipping_notes ?? null)
          : null,
        brand_at_receiving_site: body.brand_at_receiving_site ?? null,
        material_value: body.material_value ?? null,
        insurance_loss_required: body.insurance_loss_required ? 1 : 0,
        rush_reason: body.rush_reason ?? null,
        receiving_site_need_by_date: body.receiving_site_need_by_date ?? null,
        estimated_ship_by_date: body.estimated_ship_by_date ?? null,
        sto_number: body.sto_number ?? null,
        shipment_id: body.shipment_id ?? null,
        corporate_sto_tracker_status: body.corporate_sto_tracker_status ?? null,
        inco_terms: body.inco_terms ?? null,
      },
    );

    await logAudit(result.id, 'CREATED', null, 'DRAFT', user.name);

    res.status(201).json({ id: result.id, sto_id: result.sto_id });
  } catch (err) {
    logger.error({ err }, 'sto POST error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── PUT /api/sto/:id ──────────────────────────────────────────────────────────

router.put('/:id', writeLimit, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) {
    res.status(400).json({ message: 'Invalid STO id' });
    return;
  }

  const user = req.user!;

  const parsed = updateStoSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const existing = await dbQueryOne<{ receiving_site: string; status: string }>(
      'SELECT receiving_site, status FROM sto_requests WHERE id = @id',
      { id },
    );
    if (!existing) {
      res.status(404).json({ message: 'STO not found' });
      return;
    }
    if (!can(user, 'admin') && existing.status !== 'DRAFT') {
      res.status(400).json({ message: 'Only DRAFT STOs can be edited' });
      return;
    }
    if (!can(user, 'admin') && !userHasSite(user, existing.receiving_site)) {
      res.status(403).json({ message: 'You can only edit STOs at your site' });
      return;
    }

    const body = parsed.data;
    await dbExecute(
      `
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
        controlled_shipping_notes         = @controlled_shipping_notes,
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
    `,
      {
        id,
        standard_estimated_ship_date: body.standard_estimated_ship_date ?? null,
        expedited_estimated_ship_date: body.expedited_estimated_ship_date ?? null,
        rush_request: body.rush_request ? 1 : 0,
        priority: body.priority ?? 3,
        public_holiday: body.public_holiday ? 1 : 0,
        requesting_plant: body.requesting_plant ?? null,
        shipping_site: body.shipping_site ?? null,
        receiving_site: body.receiving_site ?? null,
        toll_mfg: body.toll_mfg ? 1 : 0,
        material_sap: body.material_sap ?? null,
        material_description: body.material_description ?? null,
        quantity: body.quantity ?? null,
        uom: body.uom ?? null,
        shipping_conditions: body.shipping_conditions ?? null,
        controlled_shipping_required: body.controlled_shipping_required ? 1 : 0,
        controlled_shipping_notes: body.controlled_shipping_required
          ? (body.controlled_shipping_notes ?? null)
          : null,
        brand_at_receiving_site: body.brand_at_receiving_site ?? null,
        material_value: body.material_value ?? null,
        insurance_loss_required: body.insurance_loss_required ? 1 : 0,
        rush_reason: body.rush_reason ?? null,
        receiving_site_need_by_date: body.receiving_site_need_by_date ?? null,
        estimated_ship_by_date: body.estimated_ship_by_date ?? null,
        repeat_shipment_calendar_year: body.repeat_shipment_calendar_year ?? null,
        requestor_name: body.requestor_name ?? user.name,
        requestor_email: body.requestor_email ?? '',
        sto_number: body.sto_number ?? null,
        shipment_id: body.shipment_id ?? null,
        corporate_sto_tracker_status: body.corporate_sto_tracker_status ?? null,
        inco_terms: body.inco_terms ?? null,
      },
    );

    await logAudit(id, 'EDITED', 'DRAFT', 'DRAFT', user.name);

    res.json({ message: 'Updated' });
  } catch (err) {
    logger.error({ err }, 'sto PUT error');
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── PATCH /api/sto/:id/tracking ───────────────────────────────────────────────
// Allows the original requestor or admin to update tracking reference fields
// at any point in the workflow (not restricted to DRAFT status).

router.patch(
  '/:id/tracking',
  writeLimit,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      res.status(400).json({ message: 'Invalid STO id' });
      return;
    }
    const user = req.user!;

    try {
      const existing = await dbQueryOne<{ requestor_name: string }>(
        'SELECT requestor_name FROM sto_requests WHERE id = @id AND archived = 0',
        { id },
      );
      if (!existing) {
        res.status(404).json({ message: 'STO not found' });
        return;
      }

      if (!can(user, 'admin') && user.name !== existing.requestor_name) {
        res
          .status(403)
          .json({ message: 'Only the requestor or an admin can update tracking references' });
        return;
      }

      const { sto_number, shipment_id, corporate_sto_tracker_status } = req.body as {
        sto_number?: string;
        shipment_id?: string;
        corporate_sto_tracker_status?: string;
      };

      await dbExecute(
        `UPDATE sto_requests SET
        sto_number = @sto_number,
        shipment_id = @shipment_id,
        corporate_sto_tracker_status = @corporate_sto_tracker_status,
        updated_at = GETDATE()
      WHERE id = @id`,
        {
          id,
          sto_number: sto_number || null,
          shipment_id: shipment_id || null,
          corporate_sto_tracker_status: corporate_sto_tracker_status || null,
        },
      );

      res.json({ message: 'Tracking reference updated' });
    } catch (err) {
      logger.error({ err }, 'tracking patch error');
      res.status(500).json({ message: 'Internal server error' });
    }
  },
);

export default router;
