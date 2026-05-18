import db from './connection';

// Clear existing data
db.exec(`DELETE FROM sto_audit_log; DELETE FROM sto_requests;`);

const now = new Date().toISOString().slice(0, 10);

interface StoRow {
  sto_id: string;
  request_date: string;
  standard_estimated_ship_date?: string;
  expedited_estimated_ship_date?: string;
  repeat_shipment_calendar_year?: string;
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
  mpn_number?: string;
  quantity: number;
  uom: string;
  batch_number?: string;
  expiration_date?: string;
  container_information?: string;
  shipping_conditions?: string;
  controlled_shipping_required: number;
  brand_at_receiving_site?: string;
  material_value?: number;
  freight_cost?: number;
  insurance_loss_required: number;
  rush_reason?: string;
  receiving_site_need_by_date: string;
  estimated_ship_by_date?: string;
  management_approval_required: number;
  planning_approved?: number;
  planning_approved_by_user_id?: number;
  planning_approved_at?: string;
  planning_notes?: string;
  management_approved?: number;
  management_approved_by_user_id?: number;
  management_approved_at?: string;
  management_notes?: string;
  finance_approved?: number;
  finance_approved_by_user_id?: number;
  finance_approved_at?: string;
  finance_notes?: string;
  sto_number?: string;
  shipment_id?: string;
  ready_to_ship?: number;
  pgi_date?: string;
  actual_ship_date?: string;
  tracking_id?: string;
  actual_receipt_date?: string;
  delivery_closed_out: number;
  corporate_sto_tracker_status?: string;
  status: string;
  rejection_reason?: string;
}

const insert = db.prepare(`
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
  ) VALUES (
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
`);

const insertAudit = db.prepare(`
  INSERT INTO sto_audit_log (sto_request_id, action, old_status, new_status, performed_by, performed_by_name, notes)
  VALUES (@stoId, @action, @oldStatus, @newStatus, @performedBy, @performedByName, @notes)
`);

const STOS: StoRow[] = [
  // ── 1. DRAFT ──────────────────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00001',
    request_date: now,
    standard_estimated_ship_date: '2026-06-10',
    rush_request: 0, priority: 2, public_holiday: 0,
    requesting_plant: 'Plant B', shipping_site: 'Plant A', receiving_site: 'Plant B',
    toll_mfg: 0, requestor_user_id: 1,
    requestor_name: 'Jane Wilson', requestor_email: 'jane.wilson@company.com',
    material_sap: 'MAT-10042', material_description: 'API Active Ingredient — Batch R22',
    mpn_number: 'PN-8821', quantity: 500, uom: 'KG',
    batch_number: 'B-2026-041', expiration_date: '2027-12-31',
    shipping_conditions: '2–8°C refrigerated',
    controlled_shipping_required: 1, brand_at_receiving_site: 'PharmaCorp',
    material_value: 8500, insurance_loss_required: 1,
    receiving_site_need_by_date: '2026-06-20',
    estimated_ship_by_date: '2026-06-12',
    management_approval_required: 0,
    delivery_closed_out: 0, status: 'DRAFT',
  },

  // ── 2. PLANNING_REVIEW ────────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00002',
    request_date: now,
    standard_estimated_ship_date: '2026-05-28',
    expedited_estimated_ship_date: '2026-05-24',
    rush_request: 1, priority: 1, public_holiday: 0,
    requesting_plant: 'Plant B', shipping_site: 'Plant A', receiving_site: 'Plant B',
    toll_mfg: 0, requestor_user_id: 1,
    requestor_name: 'Mark Thompson', requestor_email: 'mark.thompson@company.com',
    material_sap: 'MAT-20187', material_description: 'Packaging Components — Blister Foil 250mm',
    mpn_number: 'BF-250', quantity: 10000, uom: 'EA',
    expiration_date: '2028-01-01',
    shipping_conditions: 'Ambient — keep dry',
    controlled_shipping_required: 0,
    material_value: 3200, insurance_loss_required: 0,
    rush_reason: 'Production line at Plant B running out of foil — risk of line stoppage by end of week.',
    receiving_site_need_by_date: '2026-05-26',
    management_approval_required: 0,
    delivery_closed_out: 0, status: 'PLANNING_REVIEW',
  },

  // ── 3. SHIPPING_LOGISTICS ─────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00003',
    request_date: now,
    standard_estimated_ship_date: '2026-06-15',
    rush_request: 0, priority: 3, public_holiday: 0,
    requesting_plant: 'Plant B', shipping_site: 'Plant A', receiving_site: 'Plant B',
    toll_mfg: 1, requestor_user_id: 1,
    requestor_name: 'Sarah Chen', requestor_email: 'sarah.chen@company.com',
    material_sap: 'MAT-30055', material_description: 'Excipient — Microcrystalline Cellulose PH-102',
    quantity: 2000, uom: 'KG',
    batch_number: 'EX-2026-009',
    shipping_conditions: 'Ambient',
    controlled_shipping_required: 0,
    material_value: 4200, insurance_loss_required: 0,
    receiving_site_need_by_date: '2026-06-30',
    management_approval_required: 0,
    planning_approved: 1, planning_approved_by_user_id: 2,
    planning_approved_at: now,
    planning_notes: 'Stock confirmed available at Plant A warehouse. Approved.',
    delivery_closed_out: 0, status: 'SHIPPING_LOGISTICS',
  },

  // ── 4. MANAGEMENT_REVIEW (high value — auto triggered) ────────────────────
  {
    sto_id: 'STO-2026-00004',
    request_date: now,
    standard_estimated_ship_date: '2026-06-05',
    rush_request: 0, priority: 2, public_holiday: 0,
    requesting_plant: 'Plant B', shipping_site: 'Plant A', receiving_site: 'Plant B',
    toll_mfg: 0, requestor_user_id: 1,
    requestor_name: 'David Park', requestor_email: 'david.park@company.com',
    material_sap: 'MAT-40001', material_description: 'Bulk Drug Substance — Compound XR-77',
    quantity: 50, uom: 'KG',
    batch_number: 'DS-2026-002', expiration_date: '2027-06-30',
    shipping_conditions: '-20°C frozen — dry ice required',
    controlled_shipping_required: 1, brand_at_receiving_site: 'BioPharm Inc.',
    material_value: 45000, freight_cost: 6800,
    insurance_loss_required: 1,
    receiving_site_need_by_date: '2026-06-10',
    management_approval_required: 1,
    planning_approved: 1, planning_approved_by_user_id: 2,
    planning_approved_at: now, planning_notes: 'Cold chain capacity confirmed.',
    container_information: 'Dry ice shipper — 50L capacity, 2 units',
    sto_number: 'STO-PA-2026-0044', shipment_id: 'SHP-20440',
    ready_to_ship: 1, pgi_date: now,
    tracking_id: 'TRK-DHL-889234',
    delivery_closed_out: 0, status: 'MANAGEMENT_REVIEW',
  },

  // ── 5. FINANCE_REVIEW ─────────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00005',
    request_date: now,
    standard_estimated_ship_date: '2026-05-30',
    rush_request: 0, priority: 3, public_holiday: 0,
    requesting_plant: 'Plant B', shipping_site: 'Plant A', receiving_site: 'Plant B',
    toll_mfg: 0, requestor_user_id: 1,
    requestor_name: 'Lisa Nguyen', requestor_email: 'lisa.nguyen@company.com',
    material_sap: 'MAT-50299', material_description: 'Finished Goods — Tablet 10mg (Sample Units)',
    quantity: 5000, uom: 'EA',
    batch_number: 'FG-2026-015', expiration_date: '2028-03-31',
    shipping_conditions: 'Ambient — avoid direct sunlight',
    controlled_shipping_required: 0,
    material_value: 12500, freight_cost: 2100,
    insurance_loss_required: 0,
    receiving_site_need_by_date: '2026-06-05',
    management_approval_required: 1,
    planning_approved: 1, planning_approved_by_user_id: 2,
    planning_approved_at: now, planning_notes: 'Confirmed availability.',
    container_information: '5 cartons × 1000 units, bubble-wrapped',
    sto_number: 'STO-PA-2026-0038', shipment_id: 'SHP-20385',
    ready_to_ship: 1, pgi_date: now, tracking_id: 'TRK-UPS-447712',
    management_approved: 1, management_approved_by_user_id: 4,
    management_approved_at: now, management_notes: 'Value within budget. Approved.',
    delivery_closed_out: 0, status: 'FINANCE_REVIEW',
  },

  // ── 6. RECEIVING_LOGISTICS ────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00006',
    request_date: now,
    standard_estimated_ship_date: '2026-05-20',
    rush_request: 0, priority: 2, public_holiday: 0,
    requesting_plant: 'Plant B', shipping_site: 'Plant A', receiving_site: 'Plant B',
    toll_mfg: 0, requestor_user_id: 1,
    requestor_name: 'Rachel Adams', requestor_email: 'rachel.adams@company.com',
    material_sap: 'MAT-60114', material_description: 'Primary Packaging — Amber Vials 10mL',
    quantity: 20000, uom: 'EA',
    batch_number: 'PK-2026-033',
    shipping_conditions: 'Ambient — fragile, handle with care',
    controlled_shipping_required: 0,
    material_value: 9800, freight_cost: 1400,
    insurance_loss_required: 0,
    receiving_site_need_by_date: '2026-05-25',
    management_approval_required: 0,
    planning_approved: 1, planning_approved_by_user_id: 2,
    planning_approved_at: now, planning_notes: 'All good.',
    container_information: '40 boxes, fragile stickers applied',
    sto_number: 'STO-PA-2026-0029', shipment_id: 'SHP-20291',
    ready_to_ship: 1, pgi_date: '2026-05-19',
    actual_ship_date: '2026-05-20', tracking_id: 'TRK-FEDEX-223891',
    finance_approved: 1, finance_approved_by_user_id: 5,
    finance_approved_at: now, finance_notes: 'PO confirmed. Approved.',
    delivery_closed_out: 0, status: 'RECEIVING_LOGISTICS',
  },

  // ── 7. CLOSED ─────────────────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00007',
    request_date: '2026-04-10',
    standard_estimated_ship_date: '2026-04-20',
    rush_request: 0, priority: 3, public_holiday: 0,
    requesting_plant: 'Plant B', shipping_site: 'Plant A', receiving_site: 'Plant B',
    toll_mfg: 0, requestor_user_id: 1,
    requestor_name: 'Tom Burke', requestor_email: 'tom.burke@company.com',
    material_sap: 'MAT-70022', material_description: 'Stability Samples — Reference Standard Q1 2026',
    quantity: 200, uom: 'EA',
    batch_number: 'SS-2026-Q1',
    shipping_conditions: '2–8°C',
    controlled_shipping_required: 1,
    material_value: 5500, freight_cost: 900,
    insurance_loss_required: 1,
    receiving_site_need_by_date: '2026-04-25',
    management_approval_required: 0,
    planning_approved: 1, planning_approved_by_user_id: 2,
    planning_approved_at: '2026-04-11', planning_notes: 'Stock confirmed.',
    container_information: 'Refrigerated box, temp logger included',
    sto_number: 'STO-PA-2026-0011', shipment_id: 'SHP-20110',
    ready_to_ship: 1, pgi_date: '2026-04-18',
    actual_ship_date: '2026-04-20', tracking_id: 'TRK-DHL-110022',
    actual_receipt_date: '2026-04-22', delivery_closed_out: 1,
    corporate_sto_tracker_status: 'COMPLETE',
    finance_approved: 1, finance_approved_by_user_id: 5,
    finance_approved_at: '2026-04-13', finance_notes: 'All clear.',
    status: 'CLOSED',
  },

  // ── 8. REJECTED ───────────────────────────────────────────────────────────
  {
    sto_id: 'STO-2026-00008',
    request_date: '2026-05-01',
    rush_request: 0, priority: 3, public_holiday: 0,
    requesting_plant: 'Plant B', shipping_site: 'Plant A', receiving_site: 'Plant B',
    toll_mfg: 0, requestor_user_id: 1,
    requestor_name: 'Chris Moore', requestor_email: 'chris.moore@company.com',
    material_sap: 'MAT-99001', material_description: 'Obsolete Intermediary — Phase-out Component Z',
    quantity: 100, uom: 'KG',
    shipping_conditions: 'Ambient',
    controlled_shipping_required: 0,
    material_value: 2200, insurance_loss_required: 0,
    receiving_site_need_by_date: '2026-05-20',
    management_approval_required: 0,
    planning_approved: 0, planning_approved_by_user_id: 2,
    planning_approved_at: '2026-05-02',
    planning_notes: 'Material discontinued — no longer in inventory. Transfer cannot proceed.',
    rejection_reason: 'Material discontinued — no longer in inventory. Transfer cannot proceed.',
    delivery_closed_out: 0, status: 'REJECTED',
  },
];

// Ensure every optional field is present (better-sqlite3 requires all named params)
const DEFAULTS: Omit<StoRow, 'sto_id' | 'request_date' | 'rush_request' | 'priority' | 'public_holiday' | 'requesting_plant' | 'shipping_site' | 'receiving_site' | 'toll_mfg' | 'requestor_user_id' | 'requestor_name' | 'requestor_email' | 'material_sap' | 'material_description' | 'quantity' | 'uom' | 'controlled_shipping_required' | 'insurance_loss_required' | 'receiving_site_need_by_date' | 'management_approval_required' | 'delivery_closed_out' | 'status'> = {
  standard_estimated_ship_date: undefined, expedited_estimated_ship_date: undefined,
  repeat_shipment_calendar_year: undefined, mpn_number: undefined, batch_number: undefined,
  expiration_date: undefined, container_information: undefined, shipping_conditions: undefined,
  brand_at_receiving_site: undefined, material_value: undefined, freight_cost: undefined,
  rush_reason: undefined, estimated_ship_by_date: undefined,
  planning_approved: undefined, planning_approved_by_user_id: undefined,
  planning_approved_at: undefined, planning_notes: undefined,
  management_approved: undefined, management_approved_by_user_id: undefined,
  management_approved_at: undefined, management_notes: undefined,
  finance_approved: undefined, finance_approved_by_user_id: undefined,
  finance_approved_at: undefined, finance_notes: undefined,
  sto_number: undefined, shipment_id: undefined, ready_to_ship: undefined,
  pgi_date: undefined, actual_ship_date: undefined, tracking_id: undefined,
  actual_receipt_date: undefined, corporate_sto_tracker_status: undefined,
  rejection_reason: undefined,
};

function normalize(sto: StoRow): StoRow {
  return { ...DEFAULTS, ...sto } as StoRow;
}

const seedAll = db.transaction(() => {
  for (const raw of STOS) {
    const sto = normalize(raw);
    const result = insert.run(sto);
    const id = Number(result.lastInsertRowid);

    insertAudit.run({ stoId: id, action: 'CREATED', oldStatus: null, newStatus: 'DRAFT', performedBy: 1, performedByName: sto.requestor_name, notes: null });

    if (sto.status !== 'DRAFT') {
      insertAudit.run({ stoId: id, action: 'SUBMITTED', oldStatus: 'DRAFT', newStatus: 'PLANNING_REVIEW', performedBy: 1, performedByName: sto.requestor_name, notes: null });
    }
    if (['SHIPPING_LOGISTICS', 'MANAGEMENT_REVIEW', 'FINANCE_REVIEW', 'RECEIVING_LOGISTICS', 'CLOSED', 'REJECTED'].includes(sto.status)) {
      const approved = sto.planning_approved === 1;
      insertAudit.run({ stoId: id, action: approved ? 'PLANNING_APPROVED' : 'PLANNING_REJECTED', oldStatus: 'PLANNING_REVIEW', newStatus: approved ? 'SHIPPING_LOGISTICS' : 'REJECTED', performedBy: 2, performedByName: 'Shipping Site Planning', notes: sto.planning_notes || null });
    }
    if (['MANAGEMENT_REVIEW', 'FINANCE_REVIEW', 'RECEIVING_LOGISTICS', 'CLOSED'].includes(sto.status)) {
      insertAudit.run({ stoId: id, action: 'LOGISTICS_SUBMITTED', oldStatus: 'SHIPPING_LOGISTICS', newStatus: sto.management_approval_required ? 'MANAGEMENT_REVIEW' : 'FINANCE_REVIEW', performedBy: 3, performedByName: 'Shipping Site Logistics', notes: `Freight: $${sto.freight_cost || 0}` });
    }
    if (['FINANCE_REVIEW', 'RECEIVING_LOGISTICS', 'CLOSED'].includes(sto.status) && sto.management_approval_required) {
      insertAudit.run({ stoId: id, action: 'MANAGEMENT_APPROVED', oldStatus: 'MANAGEMENT_REVIEW', newStatus: 'FINANCE_REVIEW', performedBy: 4, performedByName: 'Management', notes: sto.management_notes || null });
    }
    if (['RECEIVING_LOGISTICS', 'CLOSED'].includes(sto.status)) {
      insertAudit.run({ stoId: id, action: 'FINANCE_APPROVED', oldStatus: 'FINANCE_REVIEW', newStatus: 'RECEIVING_LOGISTICS', performedBy: 5, performedByName: 'Finance', notes: sto.finance_notes || null });
    }
    if (sto.status === 'CLOSED') {
      insertAudit.run({ stoId: id, action: 'DELIVERY_CLOSED', oldStatus: 'RECEIVING_LOGISTICS', newStatus: 'CLOSED', performedBy: 6, performedByName: 'Receiving Site Logistics', notes: `Received: ${sto.actual_receipt_date}` });
    }
  }
});

seedAll();

const { cnt } = db.prepare('SELECT COUNT(*) as cnt FROM sto_requests').get({}) as { cnt: number };
console.log(`✓ Seeded ${cnt} demo STOs across all pipeline stages.`);
