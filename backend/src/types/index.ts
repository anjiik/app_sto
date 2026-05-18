export type Group =
  | 'receiving_site'
  | 'shipping_planning'
  | 'shipping_logistics'
  | 'management'
  | 'finance'
  | 'receiving_logistics';

export type STOStatus =
  | 'DRAFT'
  | 'PLANNING_REVIEW'
  | 'SHIPPING_LOGISTICS'
  | 'MANAGEMENT_REVIEW'
  | 'FINANCE_REVIEW'
  | 'RECEIVING_LOGISTICS'
  | 'CLOSED'
  | 'REJECTED';

export interface GroupEntry {
  id: number;
  name: string;
  group: Group;
  plant: string;
  description: string;
}

export interface JwtPayload {
  userId: number;
  group: Group;
  name: string;
  plant: string;
}

export interface AuthRequest extends Express.Request {
  user?: JwtPayload;
}
