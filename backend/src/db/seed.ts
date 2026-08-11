import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { dbExecute, dbQuery, dbQueryOne } from './connection';

const now = new Date().toISOString().slice(0, 10);

interface StoRow {
  sto_id: string;
  request_date: string;
  standard_estimated_ship_date?: string | null;
  expedited_estimated_ship_date?: string | null;
  repeat_shipment_calendar_year?: string | null;
  rush_request: number;
  priority: number;
  public_holiday: number;
  requesting_plant: string;
  shipping_site: string;
  receiving_site: string;
  toll_mfg: number;
  requestor_user_id: number;
  requestor_name: string;
  requestor_email: string;
  material_sap: string;
  material_description: string;
  mpn_number?: string | null;
  quantity: number;
  uom: string;
  batch_number?: string | null;
  expiration_date?: string | null;
  container_information?: string | null;
  shipping_conditions?: string | null;
  controlled_shipping_required: number;
  brand_at_receiving_site?: string | null;
  material_value?: number | null;
  freight_cost?: number | null;
  insurance_loss_required: number;
  rush_reason?: string | null;
  receiving_site_need_by_date: string;
  estimated_ship_by_date?: string | null;
  management_approval_required: number;
  planning_approved?: number | null;
  planning_approved_by_user_id?: number | null;
  planning_approved_at?: string | null;
  planning_notes?: string | null;
  management_approved?: number | null;
  management_approved_by_user_id?: number | null;
  management_approved_at?: string | null;
  management_notes?: string | null;
  finance_approved?: number | null;
  finance_approved_by_user_id?: number | null;
  finance_approved_at?: string | null;
  finance_notes?: string | null;
  sto_number?: string | null;
  shipment_id?: string | null;
  ready_to_ship?: number | null;
  pgi_date?: string | null;
  actual_ship_date?: string | null;
  tracking_id?: string | null;
  actual_receipt_date?: string | null;
  delivery_closed_out: number;
  corporate_sto_tracker_status?: string | null;
  status: string;
  rejection_reason?: string | null;
}

const DEFAULTS: Omit<
  StoRow,
  | 'sto_id'
  | 'request_date'
  | 'rush_request'
  | 'priority'
  | 'public_holiday'
  | 'requesting_plant'
  | 'shipping_site'
  | 'receiving_site'
  | 'toll_mfg'
  | 'requestor_user_id'
  | 'requestor_name'
  | 'requestor_email'
  | 'material_sap'
  | 'material_description'
  | 'quantity'
  | 'uom'
  | 'controlled_shipping_required'
  | 'insurance_loss_required'
  | 'receiving_site_need_by_date'
  | 'management_approval_required'
  | 'delivery_closed_out'
  | 'status'
> = {
  standard_estimated_ship_date: null,
  expedited_estimated_ship_date: null,
  repeat_shipment_calendar_year: null,
  mpn_number: null,
  batch_number: null,
  expiration_date: null,
  container_information: null,
  shipping_conditions: null,
  brand_at_receiving_site: null,
  material_value: null,
  freight_cost: null,
  rush_reason: null,
  estimated_ship_by_date: null,
  planning_approved: null,
  planning_approved_by_user_id: null,
  planning_approved_at: null,
  planning_notes: null,
  management_approved: null,
  management_approved_by_user_id: null,
  management_approved_at: null,
  management_notes: null,
  finance_approved: null,
  finance_approved_by_user_id: null,
  finance_approved_at: null,
  finance_notes: null,
  sto_number: null,
  shipment_id: null,
  ready_to_ship: null,
  pgi_date: null,
  actual_ship_date: null,
  tracking_id: null,
  actual_receipt_date: null,
  corporate_sto_tracker_status: null,
  rejection_reason: null,
};

function normalize(
  sto: Partial<StoRow> &
    Pick<
      StoRow,
      | 'sto_id'
      | 'request_date'
      | 'rush_request'
      | 'priority'
      | 'public_holiday'
      | 'requesting_plant'
      | 'shipping_site'
      | 'receiving_site'
      | 'toll_mfg'
      | 'requestor_user_id'
      | 'requestor_name'
      | 'requestor_email'
      | 'material_sap'
      | 'material_description'
      | 'quantity'
      | 'uom'
      | 'controlled_shipping_required'
      | 'insurance_loss_required'
      | 'receiving_site_need_by_date'
      | 'management_approval_required'
      | 'delivery_closed_out'
      | 'status'
    >,
): StoRow {
  return { ...DEFAULTS, ...sto } as StoRow;
}

const STOS = [
  // ── 1. DRAFT ──────────────────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00001',
    request_date: now,
    standard_estimated_ship_date: '2026-06-10',
    rush_request: 0,
    priority: 2,
    public_holiday: 0,
    requesting_plant: 'Plant B',
    shipping_site: 'Plant A',
    receiving_site: 'Plant B',
    toll_mfg: 0,
    requestor_user_id: 1,
    requestor_name: 'Jane Wilson',
    requestor_email: 'jane.wilson@company.com',
    material_sap: 'MAT-10042',
    material_description: 'API Active Ingredient — Batch R22',
    mpn_number: 'PN-8821',
    quantity: 500,
    uom: 'KG',
    batch_number: 'B-2026-041',
    expiration_date: '2027-12-31',
    shipping_conditions: '2–8°C refrigerated',
    controlled_shipping_required: 1,
    brand_at_receiving_site: 'PharmaCorp',
    material_value: 8500,
    insurance_loss_required: 1,
    receiving_site_need_by_date: '2026-06-20',
    estimated_ship_by_date: '2026-06-12',
    management_approval_required: 0,
    delivery_closed_out: 0,
    status: 'DRAFT',
  },

  // ── 2. PLANNING_REVIEW ────────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00002',
    request_date: now,
    standard_estimated_ship_date: '2026-05-28',
    expedited_estimated_ship_date: '2026-05-24',
    rush_request: 1,
    priority: 1,
    public_holiday: 0,
    requesting_plant: 'Plant B',
    shipping_site: 'Plant A',
    receiving_site: 'Plant B',
    toll_mfg: 0,
    requestor_user_id: 1,
    requestor_name: 'Mark Thompson',
    requestor_email: 'mark.thompson@company.com',
    material_sap: 'MAT-20187',
    material_description: 'Packaging Components — Blister Foil 250mm',
    mpn_number: 'BF-250',
    quantity: 10000,
    uom: 'EA',
    expiration_date: '2028-01-01',
    shipping_conditions: 'Ambient — keep dry',
    controlled_shipping_required: 0,
    material_value: 3200,
    insurance_loss_required: 0,
    rush_reason:
      'Production line at Plant B running out of foil — risk of line stoppage by end of week.',
    receiving_site_need_by_date: '2026-05-26',
    management_approval_required: 0,
    delivery_closed_out: 0,
    status: 'PLANNING_REVIEW',
  },

  // ── 3. SHIPPING_LOGISTICS ─────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00003',
    request_date: now,
    standard_estimated_ship_date: '2026-06-15',
    rush_request: 0,
    priority: 3,
    public_holiday: 0,
    requesting_plant: 'Plant B',
    shipping_site: 'Plant A',
    receiving_site: 'Plant B',
    toll_mfg: 1,
    requestor_user_id: 1,
    requestor_name: 'Sarah Chen',
    requestor_email: 'sarah.chen@company.com',
    material_sap: 'MAT-30055',
    material_description: 'Excipient — Microcrystalline Cellulose PH-102',
    quantity: 2000,
    uom: 'KG',
    batch_number: 'EX-2026-009',
    shipping_conditions: 'Ambient',
    controlled_shipping_required: 0,
    material_value: 4200,
    insurance_loss_required: 0,
    receiving_site_need_by_date: '2026-06-30',
    management_approval_required: 0,
    planning_approved: 1,
    planning_approved_by_user_id: 2,
    planning_approved_at: now,
    planning_notes: 'Stock confirmed available at Plant A warehouse. Approved.',
    delivery_closed_out: 0,
    status: 'SHIPPING_LOGISTICS',
  },

  // ── 4. MANAGEMENT_REVIEW ─────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00004',
    request_date: now,
    standard_estimated_ship_date: '2026-06-05',
    rush_request: 0,
    priority: 2,
    public_holiday: 0,
    requesting_plant: 'Plant B',
    shipping_site: 'Plant A',
    receiving_site: 'Plant B',
    toll_mfg: 0,
    requestor_user_id: 1,
    requestor_name: 'David Park',
    requestor_email: 'david.park@company.com',
    material_sap: 'MAT-40001',
    material_description: 'Bulk Drug Substance — Compound XR-77',
    quantity: 50,
    uom: 'KG',
    batch_number: 'DS-2026-002',
    expiration_date: '2027-06-30',
    shipping_conditions: '-20°C frozen — dry ice required',
    controlled_shipping_required: 1,
    brand_at_receiving_site: 'BioPharm Inc.',
    material_value: 45000,
    freight_cost: 6800,
    insurance_loss_required: 1,
    receiving_site_need_by_date: '2026-06-10',
    management_approval_required: 1,
    planning_approved: 1,
    planning_approved_by_user_id: 2,
    planning_approved_at: now,
    planning_notes: 'Cold chain capacity confirmed.',
    container_information: 'Dry ice shipper — 50L capacity, 2 units',
    sto_number: 'STO-PA-2026-0044',
    shipment_id: 'SHP-20440',
    ready_to_ship: 1,
    pgi_date: now,
    tracking_id: 'TRK-DHL-889234',
    delivery_closed_out: 0,
    status: 'MANAGEMENT_REVIEW',
  },

  // ── 5. RECEIVING_MGMT_REVIEW ──────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00005',
    request_date: now,
    standard_estimated_ship_date: '2026-05-30',
    rush_request: 0,
    priority: 3,
    public_holiday: 0,
    requesting_plant: 'Plant B',
    shipping_site: 'Plant A',
    receiving_site: 'Plant B',
    toll_mfg: 0,
    requestor_user_id: 1,
    requestor_name: 'Lisa Nguyen',
    requestor_email: 'lisa.nguyen@company.com',
    material_sap: 'MAT-50299',
    material_description: 'Finished Goods — Tablet 10mg (Sample Units)',
    quantity: 5000,
    uom: 'EA',
    batch_number: 'FG-2026-015',
    expiration_date: '2028-03-31',
    shipping_conditions: 'Ambient — avoid direct sunlight',
    controlled_shipping_required: 0,
    material_value: 12500,
    freight_cost: 2100,
    insurance_loss_required: 0,
    receiving_site_need_by_date: '2026-06-05',
    management_approval_required: 1,
    planning_approved: 1,
    planning_approved_by_user_id: 2,
    planning_approved_at: now,
    planning_notes: 'Confirmed availability.',
    container_information: '5 cartons × 1000 units, bubble-wrapped',
    sto_number: 'STO-PA-2026-0038',
    shipment_id: 'SHP-20385',
    ready_to_ship: 1,
    pgi_date: now,
    tracking_id: 'TRK-UPS-447712',
    management_approved: 1,
    management_approved_by_user_id: 4,
    management_approved_at: now,
    management_notes: 'Value within budget. Approved.',
    delivery_closed_out: 0,
    status: 'RECEIVING_MGMT_REVIEW',
  },

  // ── 6. RECEIVING_LOGISTICS ────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00006',
    request_date: now,
    standard_estimated_ship_date: '2026-05-20',
    rush_request: 0,
    priority: 2,
    public_holiday: 0,
    requesting_plant: 'Plant B',
    shipping_site: 'Plant A',
    receiving_site: 'Plant B',
    toll_mfg: 0,
    requestor_user_id: 1,
    requestor_name: 'Rachel Adams',
    requestor_email: 'rachel.adams@company.com',
    material_sap: 'MAT-60114',
    material_description: 'Primary Packaging — Amber Vials 10mL',
    quantity: 20000,
    uom: 'EA',
    batch_number: 'PK-2026-033',
    shipping_conditions: 'Ambient — fragile, handle with care',
    controlled_shipping_required: 0,
    material_value: 9800,
    freight_cost: 1400,
    insurance_loss_required: 0,
    receiving_site_need_by_date: '2026-05-25',
    management_approval_required: 0,
    planning_approved: 1,
    planning_approved_by_user_id: 2,
    planning_approved_at: now,
    planning_notes: 'All good.',
    container_information: '40 boxes, fragile stickers applied',
    sto_number: 'STO-PA-2026-0029',
    shipment_id: 'SHP-20291',
    ready_to_ship: 1,
    pgi_date: '2026-05-19',
    actual_ship_date: '2026-05-20',
    tracking_id: 'TRK-FEDEX-223891',
    finance_approved: 1,
    finance_approved_by_user_id: 5,
    finance_approved_at: now,
    finance_notes: 'PO confirmed. Approved.',
    delivery_closed_out: 0,
    status: 'RECEIVING_LOGISTICS',
  },

  // ── 7. CLOSED ─────────────────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00007',
    request_date: '2026-04-10',
    standard_estimated_ship_date: '2026-04-20',
    rush_request: 0,
    priority: 3,
    public_holiday: 0,
    requesting_plant: 'Plant B',
    shipping_site: 'Plant A',
    receiving_site: 'Plant B',
    toll_mfg: 0,
    requestor_user_id: 1,
    requestor_name: 'Tom Burke',
    requestor_email: 'tom.burke@company.com',
    material_sap: 'MAT-70022',
    material_description: 'Stability Samples — Reference Standard Q1 2026',
    quantity: 200,
    uom: 'EA',
    batch_number: 'SS-2026-Q1',
    shipping_conditions: '2–8°C',
    controlled_shipping_required: 1,
    material_value: 5500,
    freight_cost: 900,
    insurance_loss_required: 1,
    receiving_site_need_by_date: '2026-04-25',
    management_approval_required: 0,
    planning_approved: 1,
    planning_approved_by_user_id: 2,
    planning_approved_at: '2026-04-11',
    planning_notes: 'Stock confirmed.',
    container_information: 'Refrigerated box, temp logger included',
    sto_number: 'STO-PA-2026-0011',
    shipment_id: 'SHP-20110',
    ready_to_ship: 1,
    pgi_date: '2026-04-18',
    actual_ship_date: '2026-04-20',
    tracking_id: 'TRK-DHL-110022',
    actual_receipt_date: '2026-04-22',
    delivery_closed_out: 1,
    corporate_sto_tracker_status: 'COMPLETE',
    finance_approved: 1,
    finance_approved_by_user_id: 5,
    finance_approved_at: '2026-04-13',
    finance_notes: 'All clear.',
    status: 'CLOSED',
  },

  // ── 8. REJECTED ───────────────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00008',
    request_date: '2026-05-01',
    rush_request: 0,
    priority: 3,
    public_holiday: 0,
    requesting_plant: 'Plant B',
    shipping_site: 'Plant A',
    receiving_site: 'Plant B',
    toll_mfg: 0,
    requestor_user_id: 1,
    requestor_name: 'Chris Moore',
    requestor_email: 'chris.moore@company.com',
    material_sap: 'MAT-99001',
    material_description: 'Obsolete Intermediary — Phase-out Component Z',
    quantity: 100,
    uom: 'KG',
    shipping_conditions: 'Ambient',
    controlled_shipping_required: 0,
    material_value: 2200,
    insurance_loss_required: 0,
    receiving_site_need_by_date: '2026-05-20',
    management_approval_required: 0,
    planning_approved: 0,
    planning_approved_by_user_id: 2,
    planning_approved_at: '2026-05-02',
    planning_notes: 'Material discontinued — no longer in inventory. Transfer cannot proceed.',
    rejection_reason: 'Material discontinued — no longer in inventory. Transfer cannot proceed.',
    delivery_closed_out: 0,
    status: 'REJECTED',
  },
] as const;

async function insertSto(sto: StoRow): Promise<number> {
  const rows = await dbQuery<{ id: number }>(
    `
    INSERT INTO sto_requests (
      sto_id, request_date, standard_estimated_ship_date, expedited_estimated_ship_date,
      repeat_shipment_calendar_year, rush_request, priority, public_holiday,
      requesting_plant, shipping_site, receiving_site, toll_mfg,
      requestor_user_id, requestor_name, requestor_email,
      material_sap, material_description, mpn_number, quantity, uom,
      batch_number, expiration_date, container_information, shipping_conditions,
      controlled_shipping_required, brand_at_receiving_site,
      material_value, freight_cost, insurance_loss_required,
      rush_reason, receiving_site_need_by_date, estimated_ship_by_date,
      management_approval_required,
      planning_approved, planning_approved_by_user_id, planning_approved_at, planning_notes,
      management_approved, management_approved_by_user_id, management_approved_at, management_notes,
      finance_approved, finance_approved_by_user_id, finance_approved_at, finance_notes,
      sto_number, shipment_id, ready_to_ship, pgi_date,
      actual_ship_date, tracking_id, actual_receipt_date, delivery_closed_out,
      corporate_sto_tracker_status, status, rejection_reason
    ) OUTPUT INSERTED.id VALUES (
      @sto_id, @request_date, @standard_estimated_ship_date, @expedited_estimated_ship_date,
      @repeat_shipment_calendar_year, @rush_request, @priority, @public_holiday,
      @requesting_plant, @shipping_site, @receiving_site, @toll_mfg,
      @requestor_user_id, @requestor_name, @requestor_email,
      @material_sap, @material_description, @mpn_number, @quantity, @uom,
      @batch_number, @expiration_date, @container_information, @shipping_conditions,
      @controlled_shipping_required, @brand_at_receiving_site,
      @material_value, @freight_cost, @insurance_loss_required,
      @rush_reason, @receiving_site_need_by_date, @estimated_ship_by_date,
      @management_approval_required,
      @planning_approved, @planning_approved_by_user_id, @planning_approved_at, @planning_notes,
      @management_approved, @management_approved_by_user_id, @management_approved_at, @management_notes,
      @finance_approved, @finance_approved_by_user_id, @finance_approved_at, @finance_notes,
      @sto_number, @shipment_id, @ready_to_ship, @pgi_date,
      @actual_ship_date, @tracking_id, @actual_receipt_date, @delivery_closed_out,
      @corporate_sto_tracker_status, @status, @rejection_reason
    )
  `,
    sto as unknown as Record<string, unknown>,
  );
  return rows[0]?.id ?? 0;
}

async function insertAudit(
  stoId: number,
  action: string,
  oldStatus: string | null,
  newStatus: string,
  performedBy: number,
  performedByName: string,
  notes: string | null = null,
): Promise<void> {
  await dbExecute(
    `
    INSERT INTO sto_audit_log (sto_request_id, action, old_status, new_status, performed_by, performed_by_name, notes)
    VALUES (@stoId, @action, @oldStatus, @newStatus, @performedBy, @performedByName, @notes)
  `,
    { stoId, action, oldStatus, newStatus, performedBy, performedByName, notes },
  );
}

// ── Demo users ────────────────────────────────────────────────────────────────
// 3 sites × 6 groups = 18 users. All share the password Demo123!
// In production, users come from Active Directory via LDAP — this table is ignored.

const DEMO_PASSWORD = 'Demo123!';

interface DemoUser {
  username: string;
  display_name: string;
  site: string;
  group_key: string;
  // Optional multi-role grants: semicolon-separated `role@site` pairs. When set,
  // this takes precedence over group_key/site at login.
  grants?: string;
}

const DEMO_USERS: DemoUser[] = [
  // ── Site ABC ──────────────────────────────────────────────────────────────
  { username: 'abc.recv', display_name: 'Alice Carter', site: 'ABC', group_key: 'receiving_site' },
  {
    username: 'abc.plan',
    display_name: 'Brian Scott',
    site: 'ABC',
    group_key: 'shipping_planning',
  },
  {
    username: 'abc.slog',
    display_name: 'Carol White',
    site: 'ABC',
    group_key: 'shipping_logistics',
  },
  { username: 'abc.mgmt', display_name: 'Daniel Ross', site: 'ABC', group_key: 'management' },
  {
    username: 'abc.rmgmt',
    display_name: 'Emma Hayes',
    site: 'ABC',
    group_key: 'receiving_management',
  },
  {
    username: 'abc.rlog',
    display_name: 'Frank Lopez',
    site: 'ABC',
    group_key: 'receiving_logistics',
  },
  // Multi-role user at a single site: holds BOTH shipping- and receiving-side
  // management at ABC, so they can act on either management step for ABC STOs.
  // `grants` takes precedence over group_key/site at login (see parseDemoGrants).
  {
    username: 'abc.mgmt.both',
    display_name: 'Gina Park',
    site: 'ABC',
    group_key: 'management',
    grants: 'management@ABC;receiving_management@ABC',
  },

  // ── Site ABL ──────────────────────────────────────────────────────────────
  { username: 'abl.recv', display_name: 'Grace Kim', site: 'ABL', group_key: 'receiving_site' },
  { username: 'abl.plan', display_name: 'Henry Wu', site: 'ABL', group_key: 'shipping_planning' },
  {
    username: 'abl.slog',
    display_name: 'Isabel Cruz',
    site: 'ABL',
    group_key: 'shipping_logistics',
  },
  { username: 'abl.mgmt', display_name: 'James Ford', site: 'ABL', group_key: 'management' },
  {
    username: 'abl.rmgmt',
    display_name: 'Karen Vance',
    site: 'ABL',
    group_key: 'receiving_management',
  },
  {
    username: 'abl.rlog',
    display_name: 'Leo Singh',
    site: 'ABL',
    group_key: 'receiving_logistics',
  },

  // ── Site MBM ──────────────────────────────────────────────────────────────
  {
    username: 'mbm.recv',
    display_name: 'Olivia Bennett',
    site: 'MBM',
    group_key: 'receiving_site',
  },
  {
    username: 'mbm.plan',
    display_name: 'Marcus Ellery',
    site: 'MBM',
    group_key: 'shipping_planning',
  },
  {
    username: 'mbm.slog',
    display_name: 'Priya Deshmukh',
    site: 'MBM',
    group_key: 'shipping_logistics',
  },
  { username: 'mbm.mgmt', display_name: 'Derek Holloway', site: 'MBM', group_key: 'management' },
  {
    username: 'mbm.rmgmt',
    display_name: 'Naomi Castillo',
    site: 'MBM',
    group_key: 'receiving_management',
  },
  {
    username: 'mbm.rlog',
    display_name: 'Felix Andersson',
    site: 'MBM',
    group_key: 'receiving_logistics',
  },

  // ── Site XYZ ──────────────────────────────────────────────────────────────
  { username: 'xyz.recv', display_name: 'Maria Evans', site: 'XYZ', group_key: 'receiving_site' },
  {
    username: 'xyz.plan',
    display_name: 'Nathan Cole',
    site: 'XYZ',
    group_key: 'shipping_planning',
  },
  {
    username: 'xyz.slog',
    display_name: 'Olivia Reed',
    site: 'XYZ',
    group_key: 'shipping_logistics',
  },
  { username: 'xyz.mgmt', display_name: 'Patrick James', site: 'XYZ', group_key: 'management' },
  {
    username: 'xyz.rmgmt',
    display_name: 'Sophia Bell',
    site: 'XYZ',
    group_key: 'receiving_management',
  },
  {
    username: 'xyz.rlog',
    display_name: 'Rachel Tran',
    site: 'XYZ',
    group_key: 'receiving_logistics',
  },

  // ── Admin (cross-site; can act on any step and send STOs back) ──────────────
  { username: 'admin', display_name: 'Demo Admin', site: 'ABC', group_key: 'admin' },

  // ── Multi-site demo user: logistics for BOTH ABC and ABL (comma-separated
  //    site list — the login path splits this into sites[] for multi-site access) ──
  {
    username: 'multi.slog',
    display_name: 'Sam Rivera',
    site: 'ABC,ABL',
    group_key: 'shipping_logistics',
  },

  // ── Multi-role demo users (use the `grants` field: `role@site;role@site`) ────
  // Shipping + receiving logistics at the SAME site (ABC): can both ship and
  // close out deliveries at ABC.
  {
    username: 'multi.log',
    display_name: 'Priya Nair',
    site: 'ABC',
    group_key: 'shipping_logistics',
    grants: 'shipping_logistics@ABC;receiving_logistics@ABC',
  },
  // Planning at TWO sites (ABC and ABL) — one person plans for both.
  {
    username: 'multi.plan',
    display_name: 'Tom Becker',
    site: 'ABC',
    group_key: 'shipping_planning',
    grants: 'shipping_planning@ABC;shipping_planning@ABL',
  },
  // Mixed roles across sites: logistics at ABC + management at ABL.
  {
    username: 'multi.mix',
    display_name: 'Dana Fox',
    site: 'ABC',
    group_key: 'shipping_logistics',
    grants: 'shipping_logistics@ABC;management@ABL',
  },
];

async function seedDemoUsers(): Promise<void> {
  await dbExecute('DELETE FROM demo_users');
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of DEMO_USERS) {
    await dbExecute(
      `INSERT INTO demo_users (username, password_hash, display_name, site, group_key, grants)
       VALUES (@username, @hash, @display_name, @site, @group_key, @grants)`,
      {
        username: u.username,
        hash,
        display_name: u.display_name,
        site: u.site,
        group_key: u.group_key,
        grants: u.grants ?? null,
      },
    );
  }
  console.log(`✓ Seeded ${DEMO_USERS.length} demo users (password: ${DEMO_PASSWORD})`);
}

async function seedSites(): Promise<void> {
  const existing = await dbQueryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM sites');
  if (existing && existing.cnt > 0) {
    console.log('✓ sites table already has rows — skipped.');
    return;
  }
  await dbExecute(`INSERT INTO sites (code, name) VALUES ('ABC', 'Site ABC')`);
  await dbExecute(`INSERT INTO sites (code, name) VALUES ('ABL', 'Site ABL')`);
  await dbExecute(`INSERT INTO sites (code, name) VALUES ('XYZ', 'Site XYZ')`);
  await dbExecute(`INSERT INTO sites (code, name) VALUES ('MBM', 'Site MBM')`);
  console.log('✓ Seeded 4 sites (ABC, ABL, XYZ, MBM).');
}

async function seedAppUsers(): Promise<void> {
  await dbExecute('DELETE FROM app_users');
  // Reset IDENTITY so app_users.id always starts at 1 after re-seeding.
  // This keeps the values consistent with requestor_user_id in the seeded STOs.
  await dbExecute("DBCC CHECKIDENT ('app_users', RESEED, 0)");
  for (const u of DEMO_USERS) {
    await dbExecute(
      `INSERT INTO app_users (ad_username, display_name, site, app_group)
       VALUES (@username, @display_name, @site, @group_key)`,
      { username: u.username, display_name: u.display_name, site: u.site, group_key: u.group_key },
    );
  }
  console.log(`✓ Seeded ${DEMO_USERS.length} app_users from demo user list.`);
  console.log(
    "  To add an admin in dev: UPDATE app_users SET app_group = 'admin' WHERE ad_username = 'your.username';",
  );
}

async function seed() {
  await dbExecute('DELETE FROM sto_audit_log');
  await dbExecute('DELETE FROM sto_requests');

  for (const raw of STOS) {
    const sto = normalize(raw as Parameters<typeof normalize>[0]);
    const id = await insertSto(sto);

    await insertAudit(id, 'CREATED', null, 'DRAFT', 1, sto.requestor_name, null);

    if (sto.status !== 'DRAFT') {
      await insertAudit(id, 'SUBMITTED', 'DRAFT', 'PLANNING_REVIEW', 1, sto.requestor_name, null);
    }
    // Workflow: PLANNING_REVIEW → SHIPPING_LOGISTICS → (MANAGEMENT_REVIEW →
    // RECEIVING_MGMT_REVIEW when management approval is required) → RECEIVING_LOGISTICS → CLOSED.
    const pastPlanning = [
      'SHIPPING_LOGISTICS',
      'MANAGEMENT_REVIEW',
      'RECEIVING_MGMT_REVIEW',
      'RECEIVING_LOGISTICS',
      'CLOSED',
      'REJECTED',
    ];
    const pastLogistics = [
      'MANAGEMENT_REVIEW',
      'RECEIVING_MGMT_REVIEW',
      'RECEIVING_LOGISTICS',
      'CLOSED',
    ];
    const pastShipMgmt = ['RECEIVING_MGMT_REVIEW', 'RECEIVING_LOGISTICS', 'CLOSED'];
    const pastRecvMgmt = ['RECEIVING_LOGISTICS', 'CLOSED'];

    if (pastPlanning.includes(sto.status)) {
      const approved = sto.planning_approved === 1;
      await insertAudit(
        id,
        approved ? 'PLANNING_APPROVED' : 'PLANNING_REJECTED',
        'PLANNING_REVIEW',
        approved ? 'SHIPPING_LOGISTICS' : 'REJECTED',
        2,
        'Shipping Site Planning',
        sto.planning_notes || null,
      );
    }
    if (pastLogistics.includes(sto.status)) {
      await insertAudit(
        id,
        'LOGISTICS_SUBMITTED',
        'SHIPPING_LOGISTICS',
        sto.management_approval_required ? 'MANAGEMENT_REVIEW' : 'RECEIVING_LOGISTICS',
        3,
        'Shipping Site Logistics',
        `Freight: $${sto.freight_cost || 0}`,
      );
    }
    if (pastShipMgmt.includes(sto.status) && sto.management_approval_required) {
      await insertAudit(
        id,
        'MANAGEMENT_APPROVED',
        'MANAGEMENT_REVIEW',
        'RECEIVING_MGMT_REVIEW',
        4,
        'Shipping Site Management',
        sto.management_notes || null,
      );
    }
    if (pastRecvMgmt.includes(sto.status) && sto.management_approval_required) {
      await insertAudit(
        id,
        'RECEIVING_MGMT_APPROVED',
        'RECEIVING_MGMT_REVIEW',
        'RECEIVING_LOGISTICS',
        5,
        'Receiving Site Management',
        null,
      );
    }
    if (sto.status === 'CLOSED') {
      await insertAudit(
        id,
        'DELIVERY_CLOSED',
        'RECEIVING_LOGISTICS',
        'CLOSED',
        6,
        'Receiving Site Logistics',
        `Received: ${sto.actual_receipt_date}`,
      );
    }
  }

  const row = await dbQueryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM sto_requests');
  console.log(`✓ Seeded ${row?.cnt ?? 0} demo STOs across all pipeline stages.`);

  await seedDemoUsers();
  await seedSites();
  await seedAppUsers();
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
