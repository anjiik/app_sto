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

export interface JwtPayload {
  userId: number;
  group: Group;
  name: string;
  site: string | null;
}

export interface AuthRequest extends Express.Request {
  user?: JwtPayload;
}
