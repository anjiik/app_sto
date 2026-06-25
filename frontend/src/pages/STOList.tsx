import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { STORequest, STOStatus } from '../types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

function escape(v: unknown): string {
  const s = String(v ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

function downloadCSV(rows: Record<string, unknown>[]): void {
  const headers = [
    'STO ID', 'Status', 'Request Date', 'Requestor', 'Requestor Email',
    'Shipping Site', 'Receiving Site', 'Requesting Plant',
    'Material SAP', 'Material Description', 'Quantity', 'UOM',
    'Priority', 'Rush', 'Material Value',
    'Need-By Date', 'Est. Ship Date', 'STO Number', 'Tracking ID',
    'Created At', 'Updated At',
  ];
  const fields: (keyof typeof rows[0])[] = [
    'sto_id', 'status', 'request_date', 'requestor_name', 'requestor_email',
    'shipping_site', 'receiving_site', 'requesting_plant',
    'material_sap', 'material_description', 'quantity', 'uom',
    'priority', 'rush_request', 'material_value',
    'receiving_site_need_by_date', 'estimated_ship_by_date', 'sto_number', 'tracking_id',
    'created_at', 'updated_at',
  ];
  const lines = rows.map(r => fields.map(f => escape(r[f])).join(','));
  const csv = [headers.map(h => escape(h)).join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sto-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const ALL_STATUSES: STOStatus[] = [
  'DRAFT', 'PLANNING_REVIEW', 'SHIPPING_LOGISTICS',
  'MANAGEMENT_REVIEW', 'RECEIVING_MGMT_REVIEW', 'RECEIVING_LOGISTICS', 'CLOSED', 'REJECTED',
];

const STATUS_LABELS: Record<STOStatus, string> = {
  DRAFT:               'Draft',
  PLANNING_REVIEW:     'Planning Review',
  SHIPPING_LOGISTICS:  'Shipping Logistics',
  MANAGEMENT_REVIEW:    'Ship. Mgmt Review',
  RECEIVING_MGMT_REVIEW:'Recv. Mgmt Review',
  RECEIVING_LOGISTICS:  'Receiving Logistics',
  CLOSED:              'Closed',
  REJECTED:            'Rejected',
};

const PAGE_SIZE = 50;

export function STOList() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [stos,          setStos]          = useState<STORequest[]>([]);
  const [total,         setTotal]         = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [search,        setSearch]        = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const statusFilter   = searchParams.get('status')   || '';
  const priorityFilter = searchParams.get('priority') || '';
  const page           = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const totalPages     = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter)   params.set('status',   statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    if (search)         params.set('search',   search);
    params.set('page',  String(page));
    params.set('limit', String(PAGE_SIZE));

    api.get(`/sto?${params}`)
      .then(r => {
        setStos(r.data.data);
        setTotal(r.data.pagination.total);
      })
      .catch(err => setError(err.response?.data?.message || 'Failed to load STOs'))
      .finally(() => setLoading(false));
  }, [statusFilter, priorityFilter, search, page]);

  async function handleExport() {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter)   params.set('status',   statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (search)         params.set('search',   search);
      const r = await api.get(`/sto/export?${params}`);
      downloadCSV(r.data);
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setExportLoading(false);
    }
  }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page'); // reset to page 1 when filter changes
    setSearchParams(next);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">STO Requests</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exportLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {exportLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>↓</span>
              )}
              Export CSV
            </button>
            {user?.group === 'receiving_site' && (
              <Link to="/sto/new" className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 font-medium text-sm">
                + New Request
              </Link>
            )}
          </div>
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
            <div className="p-12 text-center text-gray-400">Loading…</div>
          ) : error ? (
            <div className="p-12 text-center text-red-500">{error}</div>
          ) : stos.length === 0 ? (
            <div className="p-12 text-center text-gray-400">No STOs match your filters</div>
          ) : (
            <>
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

              {/* Pagination controls */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  {total === 0 ? '0 results' : (
                    <>
                      Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
                      {Math.min(page * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
                    </>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="px-2 text-sm text-gray-600 font-medium">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
