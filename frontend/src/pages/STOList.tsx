import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { STORequest, STOStatus } from '../types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const ALL_STATUSES: STOStatus[] = [
  'DRAFT', 'PLANNING_REVIEW', 'SHIPPING_LOGISTICS',
  'MANAGEMENT_REVIEW', 'FINANCE_REVIEW', 'RECEIVING_LOGISTICS', 'CLOSED', 'REJECTED',
];

const STATUS_LABELS: Record<STOStatus, string> = {
  DRAFT: 'Draft',
  PLANNING_REVIEW: 'Planning Review',
  SHIPPING_LOGISTICS: 'Shipping Logistics',
  MANAGEMENT_REVIEW: 'Mgmt Review',
  FINANCE_REVIEW: 'Finance Review',
  RECEIVING_LOGISTICS: 'Receiving Logistics',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

export function STOList() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stos, setStos] = useState<STORequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const statusFilter = searchParams.get('status') || '';
  const priorityFilter = searchParams.get('priority') || '';

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    if (search) params.set('search', search);
    api.get(`/sto?${params}`).then(r => setStos(r.data)).finally(() => setLoading(false));
  }, [statusFilter, priorityFilter, search]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next);
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">STO Requests</h1>
          {user?.group === 'receiving_site' && (
            <Link to="/sto/new" className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 font-medium text-sm">
              + New Request
            </Link>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search STO ID, material, requestor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={e => setFilter('status', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select
            value={priorityFilter}
            onChange={e => setFilter('priority', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Priorities</option>
            <option value="1">1 – Urgent</option>
            <option value="2">2 – Expedited</option>
            <option value="3">3 – Standard</option>
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading...</div>
          ) : stos.length === 0 ? (
            <div className="p-12 text-center text-gray-400">No STOs match your filters</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['STO ID', 'Material', 'Requestor', 'Route', 'Priority', 'Status', 'Need By', 'Updated'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stos.map(sto => (
                    <tr key={sto.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-700">{sto.sto_id}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 truncate max-w-48">{sto.material_description || '–'}</div>
                        <div className="text-xs text-gray-400">{sto.material_sap || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{sto.requestor_name}</div>
                        <div className="text-xs text-gray-400">{sto.requesting_plant}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {sto.shipping_site || '–'} → {sto.receiving_site || '–'}
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={sto.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={sto.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {sto.receiving_site_need_by_date ? new Date(sto.receiving_site_need_by_date).toLocaleDateString() : '–'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(sto.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/sto/${sto.id}`} className="text-blue-600 hover:text-blue-800 font-medium text-xs">View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
