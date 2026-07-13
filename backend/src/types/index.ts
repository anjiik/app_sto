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

export interface JwtPayload {
  adUsername: string;
  group: Group;
  name: string;
  site: string;      // primary site (used for defaults/display, and backward compat)
  sites?: string[];  // all sites this user can act on / see (multi-site access)
}

export interface AuthRequest extends Express.Request {
  user?: JwtPayload;
}
