export type Group =
  | 'receiving_site'
  | 'shipping_planning'
  | 'shipping_logistics'
  | 'management'
  | 'finance'
  | 'receiving_logistics'
  | 'admin';

export type STOStatus =
  | 'DRAFT'
  | 'PLANNING_REVIEW'
  | 'SHIPPING_LOGISTICS'
  | 'MANAGEMENT_REVIEW'
  | 'FINANCE_REVIEW'
  | 'RECEIVING_LOGISTICS'
  | 'CLOSED'
  | 'REJECTED';

export interface User {
  userId: number;
  group: Group;
  name: string;
  site: string | null;
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
  requestor_user_id: number;
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
  brand_at_receiving_site?: string;
  material_value?: number;
  freight_cost?: number;
  insurance_loss_required: boolean;
  rush_reason?: string;
  receiving_site_need_by_date?: string;
  estimated_ship_by_date?: string;
  management_approval_required: boolean;
  planning_approved?: boolean;
  planning_notes?: string;
  management_approved?: boolean;
  management_notes?: string;
  finance_approved?: boolean;
  finance_notes?: string;
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
