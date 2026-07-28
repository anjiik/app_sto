import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { STORequest, STOStatus } from '../types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { isAdmin as checkAdmin } from '../lib/grants';

function escape(v: unknown): string {
  const s = String(v ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

function downloadRowsCSV(
  rows: Record<string, unknown>[],
  headers: string[],
  fields: string[],
  filename: string,
): void {
  const lines = rows.map(r => fields.map(f => escape(r[f])).join(','));
  const csv = [headers.map(h => escape(h)).join(','), ...lines].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(rows: Record<string, unknown>[]): void {
  const headers = [
    'STO ID',
    'Status',
    'Request Date',
    'Requestor',
    'Requestor Email',
    'Shipping Site',
    'Receiving Site',
    'Requesting Plant',
    'Material SAP',
    'Material Description',
    'Quantity',
    'UOM',
    'Priority',
    'Rush',
    'Material Value',
    'Need-By Date',
    'Est. Ship Date',
    'STO Number',
    'Tracking ID',
    'Created At',
    'Updated At',
  ];
  const fields: (keyof (typeof rows)[0])[] = [
    'sto_id',
    'status',
    'request_date',
    'requestor_name',
    'requestor_email',
    'shipping_site',
    'receiving_site',
    'requesting_plant',
    'material_sap',
    'material_description',
    'quantity',
    'uom',
    'priority',
    'rush_request',
    'material_value',
    'receiving_site_need_by_date',
    'estimated_ship_by_date',
    'sto_number',
    'tracking_id',
    'created_at',
    'updated_at',
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
  'DRAFT',
  'PLANNING_REVIEW',
  'SHIPPING_LOGISTICS',
  'MANAGEMENT_REVIEW',
  'RECEIVING_MGMT_REVIEW',
  'RECEIVING_LOGISTICS',
  'CLOSED',
  'REJECTED',
];

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

const PAGE_SIZE = 50;
const SITES = ['ABC', 'ABL', 'ABS', 'MBM', 'Toll MFG'];

interface Route {
  shipping_site: string;
  receiving_site: string;
}
const routeKey = (r: Route) => `${r.shipping_site}→${r.receiving_site}`;

export function STOList() {
  const { user } = useAuth();
  const isAdmin = checkAdmin(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [auditLoading, setAuditLoading] = useState(false);

  const [stos, setStos] = useState<STORequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [requestors, setRequestors] = useState<string[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  const statusFilter = searchParams.get('status') || '';
  const priorityFilter = searchParams.get('priority') || '';
  const shippingSite = searchParams.get('shipping_site') || '';
  const receivingSite = searchParams.get('receiving_site') || '';
  const requestorFilter = searchParams.get('requestor') || '';
  const routeFilter = searchParams.get('route') || '';
  const needByFrom = searchParams.get('need_by_from') || '';
  const needByTo = searchParams.get('need_by_to') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A selected route overrides the individual site filters (it IS a site pair).
  const [routeShip, routeRecv] = routeFilter ? routeFilter.split('→') : ['', ''];

  // Distinct requestors + routes for the dropdowns — fetched once.
  useEffect(() => {
    api
      .get('/sto/filter-options')
      .then(r => {
        setRequestors(r.data.requestors || []);
        setRoutes(r.data.routes || []);
      })
      .catch(() => {
        /* non-fatal: dropdowns just stay empty */
      });
  }, []);

  // Build the query params shared by the list + export requests.
  function buildParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    if (search) params.set('search', search);
    if (requestorFilter) params.set('requestor', requestorFilter);
    if (needByFrom) params.set('need_by_from', needByFrom);
    if (needByTo) params.set('need_by_to', needByTo);
    // Route wins over the standalone site dropdowns when set.
    if (routeFilter) {
      if (routeShip) params.set('shipping_site', routeShip);
      if (routeRecv) params.set('receiving_site', routeRecv);
    } else {
      if (shippingSite) params.set('shipping_site', shippingSite);
      if (receivingSite) params.set('receiving_site', receivingSite);
    }
    return params;
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = buildParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));

    api
      .get(`/sto?${params}`)
      .then(r => {
        setStos(r.data.data);
        setTotal(r.data.pagination.total);
      })
      .catch(err => setError(err.response?.data?.message || 'Failed to load STOs'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    statusFilter,
    priorityFilter,
    search,
    shippingSite,
    receivingSite,
    requestorFilter,
    routeFilter,
    needByFrom,
    needByTo,
    page,
  ]);

  async function handleExport() {
    setExportLoading(true);
    try {
      const r = await api.get(`/sto/export?${buildParams()}`);
      downloadCSV(r.data);
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setExportLoading(false);
    }
  }

  // Admin-only: export the full audit trail as an Excel-friendly CSV.
  async function handleAuditExport() {
    setAuditLoading(true);
    try {
      const r = await api.get('/sto/audit-log/export');
      downloadRowsCSV(
        r.data,
        [
          'Audit ID',
          'STO ID',
          'Action',
          'From Status',
          'To Status',
          'Performed By',
          'Notes',
          'Performed At',
        ],
        [
          'id',
          'sto_id',
          'action',
          'old_status',
          'new_status',
          'performed_by_name',
          'notes',
          'performed_at',
        ],
        `sto-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch {
      setError('Audit export failed. Please try again.');
    } finally {
      setAuditLoading(false);
    }
  }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    // Route and the individual site dropdowns are mutually exclusive.
    if (key === 'route' && value) {
      next.delete('shipping_site');
      next.delete('receiving_site');
    }
    if ((key === 'shipping_site' || key === 'receiving_site') && value) next.delete('route');
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
            {isAdmin && (
              <button
                onClick={handleAuditExport}
                disabled={auditLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Export the full audit trail (admin only)"
              >
                {auditLoading ? (
                  <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>↓</span>
                )}
                Export Audit Trail
              </button>
            )}
            <Link
              to="/sto/new"
              className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 font-medium text-sm"
            >
              + New Request
            </Link>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
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
              {ALL_STATUSES.map(s => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
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

          <div className="flex flex-wrap gap-3 items-end">
            {/* From site — cleared when a route is selected */}
            <label className="text-xs text-gray-500">
              <span className="block mb-1">From Site</span>
              <select
                value={shippingSite}
                disabled={!!routeFilter}
                onChange={e => setFilter('shipping_site', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">All</option>
                {SITES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              <span className="block mb-1">To Site</span>
              <select
                value={receivingSite}
                disabled={!!routeFilter}
                onChange={e => setFilter('receiving_site', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">All</option>
                {SITES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              <span className="block mb-1">Route</span>
              <select
                value={routeFilter}
                onChange={e => setFilter('route', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Routes</option>
                {routes.map(r => (
                  <option key={routeKey(r)} value={routeKey(r)}>
                    {r.shipping_site} → {r.receiving_site}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              <span className="block mb-1">Requestor</span>
              <select
                value={requestorFilter}
                onChange={e => setFilter('requestor', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Requestors</option>
                {requestors.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              <span className="block mb-1">Need By From</span>
              <input
                type="date"
                value={needByFrom}
                onChange={e => setFilter('need_by_from', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="text-xs text-gray-500">
              <span className="block mb-1">Need By To</span>
              <input
                type="date"
                value={needByTo}
                onChange={e => setFilter('need_by_to', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            {(shippingSite ||
              receivingSite ||
              routeFilter ||
              requestorFilter ||
              needByFrom ||
              needByTo) && (
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  [
                    'shipping_site',
                    'receiving_site',
                    'route',
                    'requestor',
                    'need_by_from',
                    'need_by_to',
                    'page',
                  ].forEach(k => next.delete(k));
                  setSearchParams(next);
                }}
                className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
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
                      {[
                        'STO ID',
                        'Material',
                        'Requestor',
                        'Route',
                        'Priority',
                        'Status',
                        'Need By',
                        'Updated',
                      ].map(h => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stos.map(sto => (
                      <tr key={sto.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono font-semibold text-blue-700">
                          {sto.sto_id}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 truncate max-w-48">
                            {sto.material_description || '–'}
                          </div>
                          <div className="text-xs text-gray-400">{sto.material_sap || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{sto.requestor_name}</div>
                          <div className="text-xs text-gray-400">{sto.requesting_plant}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {sto.shipping_site || '–'} → {sto.receiving_site || '–'}
                        </td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={sto.priority} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={sto.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {sto.receiving_site_need_by_date
                            ? new Date(sto.receiving_site_need_by_date).toLocaleDateString()
                            : '–'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {new Date(sto.updated_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/sto/${sto.id}`}
                            className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  {total === 0 ? (
                    '0 results'
                  ) : (
                    <>
                      Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
                      {Math.min(page * PAGE_SIZE, total).toLocaleString()} of{' '}
                      {total.toLocaleString()}
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
