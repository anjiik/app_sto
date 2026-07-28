import { STOStatus } from '../types';

const STATUS_STYLES: Record<STOStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PLANNING_REVIEW: 'bg-yellow-100 text-yellow-800',
  SHIPPING_LOGISTICS: 'bg-teal-100 text-teal-800',
  MANAGEMENT_REVIEW: 'bg-orange-100 text-orange-800',
  RECEIVING_MGMT_REVIEW: 'bg-purple-100 text-purple-800',
  RECEIVING_LOGISTICS: 'bg-cyan-100 text-cyan-800',
  CLOSED: 'bg-gray-200 text-gray-600',
  REJECTED: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<STOStatus, string> = {
  DRAFT: 'Draft',
  PLANNING_REVIEW: 'Planning Review',
  SHIPPING_LOGISTICS: 'Shipping Logistics',
  MANAGEMENT_REVIEW: 'Ship. Mgmt Review',
  RECEIVING_MGMT_REVIEW: 'Recv. Mgmt Review',
  RECEIVING_LOGISTICS: 'Receiving Logistics',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

export function StatusBadge({ status }: { status: STOStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-700'}`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Urgent',
  2: 'Expedited',
  3: 'Standard',
};
export const PRIORITY_STYLES: Record<number, string> = {
  1: 'bg-red-100 text-red-800',
  2: 'bg-orange-100 text-orange-800',
  3: 'bg-green-100 text-green-800',
};

export function PriorityBadge({ priority }: { priority: number }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority] || 'bg-gray-100'}`}
    >
      {PRIORITY_LABELS[priority] || 'Unknown'}
    </span>
  );
}
