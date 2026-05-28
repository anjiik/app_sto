import { useEffect, useState } from 'react';
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

// ── KPI card ───────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`bg-white rounded-xl border-l-4 p-5 shadow-sm ${color}`}>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-5">{title}</h3>
      {children}
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

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

// ── Main page ──────────────────────────────────────────────────────────────────

export function Analytics() {
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [byStatus,  setByStatus]  = useState<ByStatus[]>([]);
  const [byMonth,   setByMonth]   = useState<ByMonth[]>([]);
  const [bySite,    setBySite]    = useState<{ shipping: SiteCount[]; receiving: SiteCount[] } | null>(null);
  const [siteFlow,  setSiteFlow]  = useState<SiteFlow[]>([]);
  const [rushSplit, setRushSplit] = useState<RushSplit[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/summary'),
      api.get('/analytics/by-status'),
      api.get('/analytics/by-month'),
      api.get('/analytics/by-site'),
      api.get('/analytics/site-flow'),
      api.get('/analytics/rush-split'),
    ]).then(([s, st, m, si, sf, rs]) => {
      setSummary(s.data);
      setByStatus(st.data);
      setByMonth(m.data);
      setBySite(si.data);
      setSiteFlow(sf.data);
      setRushSplit(rs.data);
    }).finally(() => setLoading(false));
  }, []);

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
    ? Math.round((summary.rushCount / summary.totalCount) * 100)
    : 0;

  const pieData = byStatus.map(d => ({
    name:  STATUS_LABELS[d.status] ?? d.status,
    value: d.count,
    color: STATUS_COLORS[d.status] ?? '#94a3b8',
  }));

  return (
    <Layout>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-400 text-sm mt-0.5">STO activity across all sites</p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">Live data</span>
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KPI label="Total STOs"       value={summary.total}          sub={`${summary.active} active`}          color="border-blue-500" />
            <KPI label="Closed"           value={summary.closed}         sub={`${summary.rejected} rejected`}      color="border-green-500" />
            <KPI label="Total Value"      value={fmt$(summary.totalValue)} sub={`${fmt$(summary.monthValue)} this month`} color="border-purple-500" />
            <KPI label="Rush Requests"    value={`${rushPct}%`}          sub={`${summary.rushCount} of ${summary.totalCount}`} color="border-orange-500" />
          </div>
        )}

        {/* ── Row 1: Status donut + Monthly trend ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Status breakdown — donut */}
          <Section title="STOs by Status">
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    paddingAngle={2} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, 'STOs']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* Monthly volume trend */}
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
                <Line yAxisId="left"  type="monotone" dataKey="count" name="STOs"  stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="value" name="Value" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        </div>

        {/* ── Row 2: Site shipping + Site receiving ───────────────────────────── */}
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

        {/* ── Row 3: Rush split + Site flow table ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Rush vs Normal stacked bar */}
          <Section title="Rush vs Normal Requests">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rushSplit.map(d => ({ ...d, month: fmtMonth(d.month) }))}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<ValueTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="normal" name="Normal" stackId="a" fill="#3b82f6" />
                <Bar dataKey="rush"   name="Rush"   stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Site-to-site flow table */}
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
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{r.from}</td>
                        <td className="px-4 py-2.5 text-gray-600">
                          <span className="flex items-center gap-1">
                            <span className="text-gray-300">→</span> {r.to}
                          </span>
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

        {/* ── Value by status bar ──────────────────────────────────────────────── */}
        <Section title="Total Material Value by Status">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={byStatus.map(d => ({ name: STATUS_LABELS[d.status] ?? d.status, value: d.value }))}
              margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt$} />
              <Tooltip formatter={(v: any) => [fmt$(v), 'Material Value']} />
              <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                {byStatus.map((d, i) => (
                  <Cell key={i} fill={STATUS_COLORS[d.status] ?? SITE_COLORS[i % SITE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>

      </div>
    </Layout>
  );
}
