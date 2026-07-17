export type Group =
  | 'receiving_site'
  | 'shipping_planning'
  | 'shipping_logistics'
  | 'management'
  | 'receiving_logistics'
  | 'admin';

export type STOStatus =
  | 'DRAFT'
  | 'PLANNING_REVIEW'
  | 'SHIPPING_LOGISTICS'
  | 'MANAGEMENT_REVIEW'
  | 'RECEIVING_MGMT_REVIEW'
  | 'RECEIVING_LOGISTICS'
  | 'CLOSED'
  | 'REJECTED';

// A single role held at a single site. A user can hold several at once.
export interface Grant {
  group: Group;
  site: string;
}

export interface User {
  adUsername: string;
  name: string;
  grants: Grant[];   // every role+site the user holds
  // Derived, for display/back-compat only — not for gating actions.
  group: Group;      // "primary" role (admin if any, else first grant's role)
  site: string;      // primary site
  sites?: string[];  // union of all grant sites
}

export interface STORequest {
  id: number;
  sto_id: string;
  status: STOStatus;
  request_date: string;
  standard_estimated_ship_date?: string;
  expedited_estimated_ship_date?: string;
  repeat_shipment_calendar_year?: string;
  rush_request: boolean;
  priority: 1 | 2 | 3;
  public_holiday: boolean;
  requesting_plant?: string;
  shipping_site?: string;
  receiving_site?: string;
  toll_mfg: boolean;
  requestor_name: string;
  requestor_email: string;
  material_sap?: string;
  material_description?: string;
  mpn_number?: string;
  quantity?: number;
  uom?: string;
  batch_number?: string;
  expiration_date?: string;
  container_information?: string;
  shipping_conditions?: string;
  controlled_shipping_required: boolean;
  controlled_shipping_notes?: string;
  brand_at_receiving_site?: string;
  material_value?: number;
  freight_cost?: number;
  insurance_loss_required: boolean;
  rush_reason?: string;
  receiving_site_need_by_date?: string;
  estimated_ship_by_date?: string;
  management_approval_required: boolean;
  mgmt_confirmed?: boolean;
  planning_approved?: boolean;
  planning_notes?: string;
  management_approved?: boolean;
  management_notes?: string;
  receiving_mgmt_approved?: boolean;
  receiving_mgmt_notes?: string;
  sto_number?: string;
  shipment_id?: string;
  ready_to_ship?: boolean;
  pgi_date?: string;
  actual_ship_date?: string;
  tracking_id?: string;
  actual_receipt_date?: string;
  delivery_closed_out: boolean;
  corporate_sto_tracker_status?: string;
  inco_terms?: string;
  estimated_delivery_date?: string;
  igb_complete?: boolean;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
  audit_log?: AuditEntry[];
}

export interface AuditEntry {
  id: number;
  action: string;
  old_status?: string;
  new_status?: string;
  performed_by_name: string;
  notes?: string;
  performed_at: string;
}
