export type Group =
  | 'shipping_planning'
  | 'shipping_logistics'
  | 'management' // shipping-site management review
  | 'receiving_management' // receiving-site management review (distinct AD group)
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

// A single role held at a single site. A user can hold several of these at once
// (e.g. shipping_logistics@ABC + receiving_logistics@ABC + shipping_planning@ABL).
export interface Grant {
  group: Group;
  site: string;
}

export interface JwtPayload {
  adUsername: string;
  name: string;
  grants: Grant[]; // every role+site the user holds (source of truth for authz)
  // Derived, kept for display/back-compat. `group` is the "primary" role (admin
  // if the user has any admin grant, otherwise the first grant's role); `sites`
  // is the union of all grant sites. Do NOT use these for authorization — use the
  // grant-aware helpers in middleware/auth.ts (can / hasRole / hasRoleAtSite).
  group: Group;
  site: string;
  sites?: string[];
}

export interface AuthRequest extends Express.Request {
  user?: JwtPayload;
}
