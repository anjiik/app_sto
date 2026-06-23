import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Layout } from '../components/Layout';
import api from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Summary {
  total: number; active: number; closed: number; rejected: number;
  totalValue: number; monthValue: number;
  rushCount: number; totalCount: number; avgCloseDays: number;
}
interface ByStatus  { status: string; count: number; value: number; }
interface ByMonth   { month: string; count: number; value: number; }
interface SiteCount { site: string; count: number; value?: number; }
interface SiteFlow  { from: string; to: string; count: number; value: number; }
interface RushSplit { month: string; rush: number; normal: number; }
interface RawRow {
  id: number; sto_id: string; request_date: string; requestor_name: string;
  shipping_site: string | null; receiving_site: string | null;
  status: string; rush_request: boolean;
  material_description: string | null; material_sap: string | null;
  quantity: number | null; uom: string | null; material_value: number;
}

interface Filters {
  status: string; rush: string; dateFrom: string; dateTo: string;
}

// ── Colour palette ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT:               '#94a3b8',
  PLANNING_REVIEW:     '#f59e0b',
  SHIPPING_LOGISTICS:  '#06b6d4',
  MANAGEMENT_REVIEW:   '#8b5cf6',
  FINANCE_REVIEW:      '#10b981',
  RECEIVING_LOGISTICS: '#f97316',
  CLOSED:              '#3b82f6',
  REJECTED:            '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT:               'Draft',
  PLANNING_REVIEW:     'Planning Review',
  SHIPPING_LOGISTICS:  'Shipping Logistics',
  MANAGEMENT_REVIEW:   'Management Review',
  FINANCE_REVIEW:      'Finance Review',
  RECEIVING_LOGISTICS: 'Receiving Logistics',
  CLOSED:              'Closed',
  REJECTED:            'Rejected',
};

const SITE_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`bg-white rounded-xl border-l-4 p-5 shadow-sm ${color}`}>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
        {sub && (
          <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
            {sub}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full border border-blue-100">
      {label}
      <button onClick={onRemove} className="text-blue-400 hover:text-blue-700 leading-none">✕</button>
    </span>
  );
}

function ValueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.name.toLowerCase().includes('value') ? fmt$(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#94a3b8';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: color + '1a', color }}>
      {label}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: Filters = { status: '', rush: '', dateFrom: '', dateTo: '' };

export function Analytics() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [byStatus,  setByStatus]  = useState<ByStatus[]>([]);
  const [byMonth,   setByMonth]   = useState<ByMonth[]>([]);
  const [bySite,    setBySite]    = useState<{ shipping: SiteCount[]; receiving: SiteCount[] } | null>(null);
  const [siteFlow,  setSiteFlow]  = useState<SiteFlow[]>([]);
  const [rushSplit, setRushSplit] = useState<RushSplit[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [rawData,      setRawData]      = useState<RawRow[]>([]);
  const [rawTotal,     setRawTotal]     = useState(0);
  const [rawPage,      setRawPage]      = useState(1);
  const [tableLoading, setTableLoading] = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const isFirstLoad = useRef(true);

  const hasFilters = Object.values(filters).some(Boolean);

  function setFilter(key: keyof Filters, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }));
    setRawPage(1);
  }

  function toggleFilter(key: keyof Filters, value: string) {
    setFilter(key, filters[key] === value ? '' : value);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setRawPage(1);
  }

  // Memoised so effects that depend on buildParams only re-run when filters change,
  // not on every render — this lets us list it honestly in dependency arrays.
  const buildParams = useCallback((extra: Record<string, string> = {}): string => {
    const p = new URLSearchParams();
    if (filters.status)   p.set('status',   filters.status);
    if (filters.rush)     p.set('rush',     filters.rush);
    if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
    if (filters.dateTo)   p.set('dateTo',   filters.dateTo);
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p.toString();
  }, [filters]);

  // Fetch chart data whenever filters change (buildParams changes with filters)
  useEffect(() => {
    const q = buildParams();
    const first = isFirstLoad.current;
    setError(null);

    Promise.all([
      api.get(`/analytics/summary?${q}`),
      api.get(`/analytics/by-status?${q}`),
      api.get(`/analytics/by-month?${q}`),
      api.get(`/analytics/by-site?${q}`),
      api.get(`/analytics/site-flow?${q}`),
      api.get(`/analytics/rush-split?${q}`),
    ]).then(([s, st, m, si, sf, rs]) => {
      setSummary(s.data);
      setByStatus(st.data);
      setByMonth(m.data);
      setBySite(si.data);
      setSiteFlow(sf.data);
      setRushSplit(rs.data);
    }).catch(err => {
      setError(err.response?.data?.message || 'Failed to load analytics data');
    }).finally(() => {
      if (first) { isFirstLoad.current = false; setLoading(false); }
    });
  }, [buildParams]);

  // Fetch raw data whenever filters or page changes
  useEffect(() => {
    setTableLoading(true);
    const q = buildParams({ page: String(rawPage) });
    api.get(`/analytics/raw-data?${q}`)
      .then(r => { setRawData(r.data.rows); setRawTotal(r.data.total); })
      .catch(err => setError(err.response?.data?.message || 'Failed to load table data'))
      .finally(() => setTableLoading(false));
  }, [buildParams, rawPage]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const rushPct = summary && summary.totalCount > 0
    ? Math.round((summary.rushCount / summary.totalCount) * 100) : 0;

  const pieData = byStatus.map(d => ({
    name:      STATUS_LABELS[d.status] ?? d.status,
    statusKey: d.status,
    value:     d.count,
    color:     STATUS_COLORS[d.status] ?? '#94a3b8',
  }));

  const totalPages = Math.max(1, Math.ceil(rawTotal / 50));

  return (
    <Layout>
      <div className="space-y-6">

        {/* ── Page header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-400 text-sm mt-0.5">STO activity across all sites</p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">Live data</span>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* ── Filter bar ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status</label>
              <select
                value={filters.status}
                onChange={e => setFilter('status', e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[170px]">
                <option value="">All Statuses</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Rush */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Priority</label>
              <select
                value={filters.rush}
                onChange={e => setFilter('rush', e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All</option>
                <option value="1">Rush</option>
                <option value="0">Normal</option>
              </select>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">From</label>
              <input type="month" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">To</label>
              <input type="month" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {hasFilters && (
              <button onClick={resetFilters}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100">
                ✕ Reset
              </button>
            )}
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
              {filters.status   && <FilterChip label={`Status: ${STATUS_LABELS[filters.status] ?? filters.status}`} onRemove={() => setFilter('status', '')} />}
              {filters.rush     && <FilterChip label={filters.rush === '1' ? 'Rush only' : 'Normal only'} onRemove={() => setFilter('rush', '')} />}
              {filters.dateFrom && <FilterChip label={`From: ${filters.dateFrom}`} onRemove={() => setFilter('dateFrom', '')} />}
              {filters.dateTo   && <FilterChip label={`To: ${filters.dateTo}`} onRemove={() => setFilter('dateTo', '')} />}
            </div>
          )}
        </div>

        {/* ── KPI row ──────────────────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KPI label="Total STOs"    value={summary.total}           sub={`${summary.active} active`}                    color="border-blue-500" />
            <KPI label="Closed"        value={summary.closed}          sub={`${summary.rejected} rejected`}                color="border-green-500" />
            <KPI label="Total Value"   value={fmt$(summary.totalValue)} sub={`${fmt$(summary.monthValue)} this month`}     color="border-purple-500" />
            <KPI label="Rush Requests" value={`${rushPct}%`}           sub={`${summary.rushCount} of ${summary.totalCount}`} color="border-orange-500" />
          </div>
        )}

        {/* ── Row 1: Status donut + Monthly trend ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <Section title="STOs by Status" sub="click to filter">
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    cursor="pointer"
                    onClick={(data: any) => toggleFilter('status', data.statusKey)}>
                    {pieData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.color}
                        opacity={filters.status && filters.status !== entry.statusKey ? 0.3 : 1}
                        stroke={filters.status === entry.statusKey ? entry.color : 'none'}
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, 'STOs']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {pieData.map(d => (
                  <button
                    key={d.name}
                    onClick={() => toggleFilter('status', d.statusKey)}
                    className={`w-full flex items-center justify-between text-sm rounded-lg px-2 py-1 transition-colors text-left
                      ${filters.status === d.statusKey ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{d.value}</span>
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Monthly Volume (last 12 months)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byMonth.map(d => ({ ...d, month: fmtMonth(d.month) }))}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left"  tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={fmt$} />
                <Tooltip content={<ValueTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left"  type="monotone" dataKey="count" name="STOs"  stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line yAxisId="right" type="monotone" dataKey="value" name="Value" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        </div>

        {/* ── Row 2: Top shipping sites + Top receiving sites ───────────────────── */}
        {bySite && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <Section title="Top Shipping Sites">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={bySite.shipping} layout="vertical"
                  margin={{ top: 0, right: 16, left: 16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="site" tick={{ fontSize: 12 }} width={60} />
                  <Tooltip content={<ValueTooltip />} />
                  <Bar dataKey="count" name="STOs Shipped" radius={[0, 4, 4, 0]}>
                    {bySite.shipping.map((_, i) => (
                      <Cell key={i} fill={SITE_COLORS[i % SITE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>

            <Section title="Top Receiving Sites">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={bySite.receiving} layout="vertical"
                  margin={{ top: 0, right: 16, left: 16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="site" tick={{ fontSize: 12 }} width={60} />
                  <Tooltip content={<ValueTooltip />} />
                  <Bar dataKey="count" name="STOs Received" radius={[0, 4, 4, 0]}>
                    {bySite.receiving.map((_, i) => (
                      <Cell key={i} fill={SITE_COLORS[(i + 3) % SITE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          </div>
        )}

        {/* ── Row 3: Rush split + Site flow table ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <Section title="Rush vs Normal Requests" sub="click to filter">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rushSplit.map(d => ({ ...d, month: fmtMonth(d.month) }))}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<ValueTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="normal" name="Normal" stackId="a" fill="#3b82f6"
                  cursor="pointer" opacity={filters.rush === '1' ? 0.3 : 1}
                  onClick={() => toggleFilter('rush', '0')} />
                <Bar dataKey="rush" name="Rush" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]}
                  cursor="pointer" opacity={filters.rush === '0' ? 0.3 : 1}
                  onClick={() => toggleFilter('rush', '1')} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Site-to-Site Transfer Flow">
            {siteFlow.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No transfer data yet</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <th className="px-4 py-2.5 text-left font-medium">From</th>
                      <th className="px-4 py-2.5 text-left font-medium">To</th>
                      <th className="px-4 py-2.5 text-right font-medium">STOs</th>
                      <th className="px-4 py-2.5 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {siteFlow.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{r.from}</td>
                        <td className="px-4 py-2.5 text-gray-600">
                          <span className="flex items-center gap-1"><span className="text-gray-300">→</span> {r.to}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{r.count}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{fmt$(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* ── Value by status bar ───────────────────────────────────────────────── */}
        <Section title="Total Material Value by Status" sub="click to filter">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={byStatus.map(d => ({ name: STATUS_LABELS[d.status] ?? d.status, value: d.value, statusKey: d.status }))}
              margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt$} />
              <Tooltip formatter={(v: any) => [fmt$(v), 'Material Value']} />
              <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(data: any) => toggleFilter('status', data.statusKey)}>
                {byStatus.map((d, i) => (
                  <Cell key={i}
                    fill={STATUS_COLORS[d.status] ?? SITE_COLORS[i % SITE_COLORS.length]}
                    opacity={filters.status && filters.status !== d.status ? 0.3 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>

        {/* ── Raw data table ────────────────────────────────────────────────────── */}
        <Section title={`Raw Data — ${rawTotal.toLocaleString()} STOs`}>
          {tableLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rawData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">No STOs match the current filters.</p>
              {hasFilters && (
                <button onClick={resetFilters} className="mt-3 text-sm text-blue-600 hover:underline">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-3 text-left font-medium">STO ID</th>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                      <th className="px-4 py-3 text-left font-medium">From</th>
                      <th className="px-4 py-3 text-left font-medium">To</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Priority</th>
                      <th className="px-4 py-3 text-left font-medium">Material</th>
                      <th className="px-4 py-3 text-right font-medium">Qty</th>
                      <th className="px-4 py-3 text-right font-medium">Value</th>
                      <th className="px-4 py-3 text-left font-medium">Requestor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rawData.map(row => (
                      <tr key={row.sto_id}
                        className="hover:bg-blue-50 cursor-pointer transition-colors group"
                        onClick={() => navigate(`/sto/${row.id}`)}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-blue-600 group-hover:underline">
                            {row.sto_id}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(row.request_date)}</td>
                        <td className="px-4 py-3">
                          {row.shipping_site
                            ? <span className="font-medium text-gray-800">{row.shipping_site}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {row.receiving_site
                            ? <span className="font-medium text-gray-800">{row.receiving_site}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                        <td className="px-4 py-3">
                          {row.rush_request
                            ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">Rush</span>
                            : <span className="text-gray-400 text-xs">Normal</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                          <span className="truncate block" title={row.material_description ?? ''}>
                            {row.material_description || row.material_sap || <span className="text-gray-300">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {row.quantity != null ? `${row.quantity.toLocaleString()} ${row.uom ?? ''}`.trim() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800 whitespace-nowrap">
                          {row.material_value > 0 ? fmt$(row.material_value) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.requestor_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing {((rawPage - 1) * 50 + 1).toLocaleString()}–{Math.min(rawPage * 50, rawTotal).toLocaleString()} of {rawTotal.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRawPage(p => p - 1)}
                    disabled={rawPage === 1}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors">
                    ← Prev
                  </button>
                  <span className="px-3 py-1.5 text-sm font-medium text-gray-700">
                    {rawPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setRawPage(p => p + 1)}
                    disabled={rawPage >= totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors">
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </Section>

      </div>
    </Layout>
  );
}
