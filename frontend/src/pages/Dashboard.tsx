import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { STORequest, STOStatus, Group } from '../types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { Layout } from '../components/Layout';
import { isAdmin, userRoles, sitesForRole } from '../lib/grants';

// ─── types ───────────────────────────────────────────────────────────────────
interface AuditEntry {
  id: number;
  sto_request_id: number;
  sto_id: string;
  action: string;
  old_status: STOStatus | null;
  new_status: STOStatus | null;
  performed_by_name: string;
  notes: string | null;
  performed_at: string;
}

interface Kpis {
  rushActive: number;
  dueSoon: number;
  overdue: number;
}

// ─── config ──────────────────────────────────────────────────────────────────

const GROUP_QUEUE: Partial<Record<Group, { label: string; statuses: STOStatus[] }>> = {
  shipping_planning: { label: 'Awaiting your Planning Review', statuses: ['PLANNING_REVIEW'] },
  shipping_logistics: {
    label: 'Awaiting your Logistics Submission',
    statuses: ['SHIPPING_LOGISTICS'],
  },
  management: {
    label: 'Awaiting your Shipping Management Approval',
    statuses: ['MANAGEMENT_REVIEW'],
  },
  receiving_management: {
    label: 'Awaiting your Receiving Management Approval',
    statuses: ['RECEIVING_MGMT_REVIEW'],
  },
  receiving_logistics: {
    label: 'Awaiting your Receipt Confirmation',
    statuses: ['RECEIVING_LOGISTICS'],
  },
  // NOTE: drafts are no longer a site-scoped role queue. They are shown to
  // whoever CREATED the STO, via the dedicated "My Drafts" section below —
  // scoped by requestor name, not by the receiving_site role.
};

// A per-role queue section on the dashboard. Multi-role users see one per role.
interface QueueSection {
  role: Group;
  label: string;
  statuses: STOStatus[];
  items: STORequest[];
  total: number;
}

// Build the API calls for a single role's queue, scoped to that role's sites.
// Returns the fetch plus the statuses/label so results can be assembled per role.
function fetchRoleQueue(
  role: Group,
  sites: string[],
): Promise<{ items: STORequest[]; total: number }> {
  const cfg = GROUP_QUEUE[role]!;
  const siteParam = encodeURIComponent(sites.join(','));
  type QueueRes = { data: { data: STORequest[]; pagination: { total: number } } };
  const get = (q: string): Promise<QueueRes> => api.get(`/sto${q}&limit=20`);

  const status = cfg.statuses[0];
  // Receiving-side roles scope by receiving_site; shipping-side roles by
  // shipping_site. management = shipping-side; receiving_management = receiving-side.
  const siteCol =
    role === 'receiving_logistics' ||
    role === 'receiving_site' ||
    role === 'receiving_management'
      ? 'receiving_site'
      : 'shipping_site';
  return get(`?status=${status}&${siteCol}=${siteParam}`).then(r => ({
    items: r.data.data,
    total: r.data.pagination.total,
  }));
}

const PIPELINE_STAGES: { label: string; status: STOStatus; color: string }[] = [
  { label: 'Draft', status: 'DRAFT', color: 'gray' },
  { label: 'Planning Review', status: 'PLANNING_REVIEW', color: 'yellow' },
  { label: 'Ship Logistics', status: 'SHIPPING_LOGISTICS', color: 'teal' },
  { label: 'Ship Mgmt Review', status: 'MANAGEMENT_REVIEW', color: 'orange' },
  { label: 'Recv Mgmt Review', status: 'RECEIVING_MGMT_REVIEW', color: 'purple' },
  { label: 'Recv Logistics', status: 'RECEIVING_LOGISTICS', color: 'cyan' },
  { label: 'Closed', status: 'CLOSED', color: 'green' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function needByColor(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = daysUntil(dateStr);
  if (d < 0) return 'text-red-600 font-semibold';
  if (d <= 7) return 'text-orange-500 font-medium';
  return 'text-gray-600';
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    CREATED: 'Created',
    SUBMITTED: 'Submitted for planning',
    PLANNING_APPROVED: 'Planning approved',
    PLANNING_REJECTED: 'Planning rejected',
    LOGISTICS_SUBMITTED: 'Logistics submitted',
    MANAGEMENT_APPROVED: 'Shipping mgmt approved',
    MANAGEMENT_REJECTED: 'Shipping mgmt rejected',
    RECEIVING_MGMT_APPROVED: 'Receiving mgmt approved',
    RECEIVING_MGMT_REJECTED: 'Receiving mgmt rejected',
    RECEIPT_CONFIRMED: 'Receipt confirmed',
  };
  return map[action] ?? action;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  value,
  label,
  sub,
  color,
}: {
  value: number | string;
  label: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <div className={`text-3xl font-bold text-${color}-600 leading-none`}>{value}</div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function StagePill({
  stage,
  count,
  loading,
}: {
  stage: (typeof PIPELINE_STAGES)[0];
  count: number;
  loading: boolean;
}) {
  const stalled = count > 0 && stage.status !== 'CLOSED' && stage.status !== 'DRAFT';
  return (
    <Link
      to={`/sto?status=${stage.status}`}
      className={`
        flex flex-col items-center px-4 py-3 rounded-xl ring-1 transition-all
        ${count > 0 ? `ring-${stage.color}-200 bg-${stage.color}-50 hover:bg-${stage.color}-100` : 'ring-gray-100 bg-gray-50 opacity-40 pointer-events-none'}
      `}
    >
      <div className="flex items-center gap-1">
        <span className={`text-2xl font-bold text-${stage.color}-600 leading-none`}>
          {loading ? '–' : count}
        </span>
        {stalled && count > 3 && (
          <span className="text-base" title="High volume — possible bottleneck">
            🔥
          </span>
        )}
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap mt-1">{stage.label}</span>
      {count > 0 && <span className={`text-xs text-${stage.color}-500 mt-0.5`}>View →</span>}
    </Link>
  );
}

// A list of the current user's own drafts. `accent` colours the header; used
// to visually separate "Needs Revision" (amber) from "Unsubmitted" (gray).
// Renders nothing when there are no drafts and `emptyHidden` is set.
function DraftSection({
  title,
  accent,
  drafts,
  emptyHidden,
}: {
  title: string;
  accent: 'amber' | 'gray';
  drafts: STORequest[];
  emptyHidden?: boolean;
}) {
  if (emptyHidden && drafts.length === 0) return null;
  const headerColor = accent === 'amber' ? 'text-amber-700' : 'text-gray-900';
  const badgeColor = accent === 'amber' ? 'bg-amber-500' : 'bg-gray-500';
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className={`font-semibold ${headerColor}`}>{title}</h2>
          <span className={`${badgeColor} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>
            {drafts.length}
          </span>
        </div>
        <Link to="/sto/new" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
          + New STO →
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {drafts.map(sto => (
          <div key={sto.id} className="px-6 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium text-gray-900 text-sm">{sto.sto_id}</span>
                {sto.rush_request && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                    RUSH
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 truncate max-w-[420px]">
                {sto.material_description || sto.material_sap || '—'}
              </div>
              {accent === 'amber' && sto.rejection_reason && (
                <div className="text-xs text-amber-700 mt-0.5 truncate max-w-[420px]">
                  {sto.rejection_reason}
                </div>
              )}
            </div>
            <Link
              to={`/sto/${sto.id}`}
              className="shrink-0 inline-flex items-center gap-1 bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {accent === 'amber' ? 'Revise →' : 'Continue →'}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// Non-terminal pipeline order, used to compute how far a request has
// progressed for the mini progress bar. REJECTED is handled separately since
// it can happen from several different stages, not a fixed position.
const PROGRESS_STAGES: STOStatus[] = [
  'DRAFT',
  'PLANNING_REVIEW',
  'SHIPPING_LOGISTICS',
  'MANAGEMENT_REVIEW',
  'RECEIVING_MGMT_REVIEW',
  'RECEIVING_LOGISTICS',
  'CLOSED',
];

// A compact segmented bar showing how far a request has progressed through
// the workflow. Rejected requests show a filled red bar instead of segments,
// since rejection can occur from any stage.
function MiniProgress({ status }: { status: STOStatus }) {
  if (status === 'REJECTED') {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 flex-1 rounded-full bg-red-400" />
        <span className="text-xs text-red-600 font-medium shrink-0">Rejected</span>
      </div>
    );
  }
  const idx = PROGRESS_STAGES.indexOf(status);
  const step = idx === -1 ? 0 : idx;
  return (
    <div className="flex items-center gap-0.5">
      {PROGRESS_STAGES.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 flex-1 rounded-full ${
            i <= step ? (status === 'CLOSED' ? 'bg-green-500' : 'bg-blue-500') : 'bg-gray-150'
          }`}
          style={i > step ? { backgroundColor: '#e5e7eb' } : undefined}
        />
      ))}
    </div>
  );
}

// Every STO the current user has ever requested, any status — lets a
// requestor see at a glance where each of their submissions currently sits,
// and flags anything that just reached a terminal state (CLOSED/REJECTED).
function MyRequestsSection({ requests }: { requests: STORequest[] }) {
  const [expanded, setExpanded] = useState(false);
  if (requests.length === 0) return null;
  const visible = expanded ? requests : requests.slice(0, 6);

  // "Just completed" = reached CLOSED or REJECTED within the last 3 days —
  // computed from updated_at, since there's no separate notification log.
  const isJustCompleted = (s: STORequest) =>
    (s.status === 'CLOSED' || s.status === 'REJECTED') && daysSince(s.updated_at) <= 3;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900">My Requests</h2>
          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {requests.length}
          </span>
        </div>
        <Link to="/sto/new" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
          + New STO →
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {visible.map(sto => {
          const justDone = isJustCompleted(sto);
          return (
            <Link
              key={sto.id}
              to={`/sto/${sto.id}`}
              className={`flex items-center gap-4 px-6 py-3 transition-colors ${
                justDone ? 'bg-green-50/60 hover:bg-green-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-medium text-gray-900 text-sm">
                    {sto.sto_id}
                  </span>
                  {sto.rush_request && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                      RUSH
                    </span>
                  )}
                  {justDone && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                      ✓ Just completed
                    </span>
                  )}
                  <StatusBadge status={sto.status} />
                </div>
                <div className="text-xs text-gray-500 truncate max-w-[420px] mt-0.5">
                  {sto.material_description || sto.material_sap || '—'}
                </div>
                <div className="mt-2 max-w-xs">
                  <MiniProgress status={sto.status} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {requests.length > 6 && (
        <div className="px-6 py-3 border-t border-gray-100 text-center">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {expanded ? 'Show less' : `Show all ${requests.length} →`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export function Dashboard() {
  const { user } = useAuth();

  // Each piece of state maps directly to one DB query — no derived counting in JS.
  const [stageCounts, setStageCounts] = useState<Partial<Record<STOStatus, number>>>({});
  // One queue section per role the user holds (sectioned-by-role dashboard).
  const [queueSections, setQueueSections] = useState<QueueSection[]>([]);
  const [myQueueTotal, setMyQueueTotal] = useState(0);
  // Drafts the current user created — shown regardless of role or site.
  // Split into reverted (sent back for revision) vs never-submitted.
  const [myDrafts, setMyDrafts] = useState<STORequest[]>([]);
  // STOs the current user requested where Shipping Logistics has asked for the
  // SAP STO# to be populated on the tracker, and it's still blank.
  const [stoNumberReminders, setStoNumberReminders] = useState<STORequest[]>([]);
  // Every STO the current user has ever requested, any status — "My Requests".
  const [myRequests, setMyRequests] = useState<STORequest[]>([]);
  const [kpis, setKpis] = useState<Kpis>({ rushActive: 0, dueSoon: 0, overdue: 0 });
  const [rushAlertItems, setRushAlertItems] = useState<STORequest[]>([]);
  const [needByItems, setNeedByItems] = useState<STORequest[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivePreview, setArchivePreview] = useState<{
    eligible: number;
    retention_years: number;
  } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  // Load archive preview count for admins
  useEffect(() => {
    if (isAdmin(user)) {
      api
        .get('/admin/archive/preview')
        .then(r => setArchivePreview(r.data))
        .catch(() => {});
    }
  }, [user]);
  const [queueSearch, setQueueSearch] = useState('');

  useEffect(() => {
    if (!user) return;

    // Build one queue section per role the user holds that has a queue config,
    // each scoped to the sites where they hold that role. Admins see every role,
    // scoped across all their sites.
    const roles = userRoles(user).filter(r => GROUP_QUEUE[r]);
    const adminRoles: Group[] = [
      'shipping_planning',
      'shipping_logistics',
      'management',
      'receiving_management',
      'receiving_logistics',
    ];
    const activeRoles = isAdmin(user) ? adminRoles : roles;

    const sectionFetches = activeRoles.map(role =>
      fetchRoleQueue(role, sitesForRole(user, role))
        .then(
          ({ items, total }): QueueSection => ({
            role,
            label: GROUP_QUEUE[role]!.label,
            statuses: GROUP_QUEUE[role]!.statuses,
            items,
            total,
          }),
        )
        .catch(
          (): QueueSection => ({
            role,
            label: GROUP_QUEUE[role]!.label,
            statuses: GROUP_QUEUE[role]!.statuses,
            items: [],
            total: 0,
          }),
        ),
    );

    Promise.all([
      // 1. Pipeline stage counts — GROUP BY in SQL, zero rows transferred
      api.get('/analytics/by-status'),
      // 2. Per-role action queues
      Promise.all(sectionFetches),
      // 3. KPI counts — three COUNT(*) queries, no rows transferred
      api.get('/sto/kpis'),
      // 4. Rush alert items — top 4
      api.get('/sto?rush_only=1&active_only=1&limit=4'),
      // 5. Need-by items — sorted most-urgent first, top 12
      api.get('/sto?has_need_by=1&active_only=1&sort=need_by_asc&limit=12'),
      // 6. Recent audit activity
      api.get('/sto/audit-log'),
      // 7. Drafts the current user created — by requestor name, any site/role.
      api.get(`/sto?status=DRAFT&requestor=${encodeURIComponent(user.name)}&limit=50`),
      // 8. This user's active STOs — filtered client-side for an outstanding
      // STO# request (there's no dedicated server-side filter for this yet).
      api.get(`/sto?active_only=1&requestor=${encodeURIComponent(user.name)}&limit=100`),
      // 9. Every STO this user has ever requested, any status — "My Requests".
      api.get(`/sto?requestor=${encodeURIComponent(user.name)}&limit=100`),
    ])
      .then(
        ([
          byStatusRes,
          sections,
          kpisRes,
          rushRes,
          needByRes,
          auditRes,
          myDraftsRes,
          myActiveRes,
          myRequestsRes,
        ]) => {
          const counts: Partial<Record<STOStatus, number>> = {};
          (byStatusRes.data as { status: STOStatus; count: number }[]).forEach(r => {
            counts[r.status] = r.count;
          });
          setStageCounts(counts);
          setQueueSections(sections);
          setMyQueueTotal(
            sections.reduce((n, s) => n + s.total, 0) + (myDraftsRes.data.pagination?.total ?? 0),
          );
          setKpis(kpisRes.data);
          setRushAlertItems(rushRes.data.data);
          setNeedByItems(needByRes.data.data);
          setAudit(auditRes.data);
          setMyDrafts(myDraftsRes.data.data);
          setStoNumberReminders(
            (myActiveRes.data.data as STORequest[]).filter(
              s => s.sto_number_requested_at && !s.sto_number,
            ),
          );
          setMyRequests(myRequestsRes.data.data);
        },
      )
      .finally(() => setLoading(false));
  }, [user]);

  // Apply the queue search across every section's items.
  const matchesSearch = (s: STORequest, q: string) =>
    s.sto_id?.toLowerCase().includes(q) ||
    s.material_description?.toLowerCase().includes(q) ||
    s.material_sap?.toLowerCase().includes(q) ||
    s.requestor_name?.toLowerCase().includes(q);

  const visibleSections = queueSections.map(sec => ({
    ...sec,
    filtered: queueSearch.trim()
      ? sec.items.filter(s => matchesSearch(s, queueSearch.toLowerCase()))
      : sec.items,
  }));

  // A draft that carries a rejection_reason was sent back for revision by a
  // reviewer; one without has never been submitted. Apply the same queue search.
  const draftMatches = (s: STORequest) =>
    !queueSearch.trim() || matchesSearch(s, queueSearch.toLowerCase());
  const revisionDrafts = myDrafts.filter(s => s.rejection_reason && draftMatches(s));
  const unsubmittedDrafts = myDrafts.filter(s => !s.rejection_reason && draftMatches(s));

  // needByItems is sorted most-overdue → most-urgent → further out.
  // Split into two views: overdue alert list and upcoming section.
  const overdueAlertItems = needByItems
    .filter(s => daysUntil(s.receiving_site_need_by_date!) < 0)
    .slice(0, 4);
  const upcomingItems = needByItems
    .filter(s => daysUntil(s.receiving_site_need_by_date!) >= 0)
    .slice(0, 8);

  const inProgress = (
    [
      'PLANNING_REVIEW',
      'SHIPPING_LOGISTICS',
      'MANAGEMENT_REVIEW',
      'RECEIVING_MGMT_REVIEW',
      'RECEIVING_LOGISTICS',
    ] as STOStatus[]
  ).reduce((n, s) => n + (stageCounts[s] || 0), 0);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const groupLabel: Record<Group, string> = {
    receiving_site: 'Receiving Site',
    shipping_planning: 'Shipping Planning',
    shipping_logistics: 'Shipping Logistics',
    management: 'Shipping Management',
    receiving_management: 'Receiving Management',
    receiving_logistics: 'Receiving Logistics',
    admin: 'Admin',
  };

  // Every role the user holds — shown as chips in the header (multi-role aware).
  const myRoles = user ? userRoles(user) : [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {greeting()}
              {user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {myRoles.map(r => (
                <span
                  key={r}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {groupLabel[r]}
                </span>
              ))}
              <span className="text-gray-400 text-sm">
                {user?.sites && user.sites.length
                  ? user.sites.join(', ')
                  : (user?.site ?? 'All Sites')}
              </span>
            </div>
          </div>
          <Link
            to="/sto/new"
            className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 font-medium text-sm"
          >
            + New STO Request
          </Link>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            value={loading ? '–' : myQueueTotal}
            label="My Queue"
            sub="Needs your action"
            color="blue"
          />
          <KpiCard
            value={loading ? '–' : kpis.rushActive}
            label="Rush / Urgent"
            sub="Active rush STOs"
            color="red"
          />
          <KpiCard
            value={loading ? '–' : kpis.dueSoon}
            label="Due This Week"
            sub="Need-by ≤ 7 days"
            color="orange"
          />
          <KpiCard
            value={loading ? '–' : kpis.overdue}
            label="Overdue"
            sub="Past need-by date"
            color="rose"
          />
        </div>

        {/* ── STO# needed — Shipping Logistics is waiting on the tracker number ── */}
        {!loading && stoNumberReminders.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-amber-100">
              <h2 className="font-semibold text-amber-800">⏰ STO# Needed</h2>
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {stoNumberReminders.length}
              </span>
            </div>
            <div className="divide-y divide-amber-100">
              {stoNumberReminders.map(sto => (
                <Link
                  key={sto.id}
                  to={`/sto/${sto.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-amber-100/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-gray-900 text-sm">
                        {sto.sto_id}
                      </span>
                      <StatusBadge status={sto.status} />
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-[420px]">
                      {sto.material_description || sto.material_sap || '—'}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-amber-700">
                    Add STO# →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── My Requests — every STO I've submitted, wherever it is now ── */}
        {!loading && <MyRequestsSection requests={myRequests} />}

        {/* ── My Drafts — STOs I created that are back with me ── */}
        {!loading && myDrafts.length > 0 && (
          <div className="space-y-4">
            <DraftSection
              title="Needs Revision"
              accent="amber"
              emptyHidden
              drafts={revisionDrafts}
            />
            <DraftSection
              title="Your Unsubmitted Drafts"
              accent="gray"
              emptyHidden
              drafts={unsubmittedDrafts}
            />
          </div>
        )}

        {/* ── My Action Queue(s) — one section per role held ── */}
        {visibleSections.length > 0 && (
          <div className="space-y-4">
            {/* Single search box across all role sections */}
            <div className="flex items-center justify-end">
              <input
                type="text"
                placeholder="Search queues…"
                value={queueSearch}
                onChange={e => setQueueSearch(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {visibleSections.map(sec => (
              <div key={sec.role} className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 gap-4">
                  <div className="flex items-center gap-2 shrink-0">
                    <h2 className="font-semibold text-gray-900">{sec.label}</h2>
                    {sec.total > 0 && (
                      <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {sec.total}
                      </span>
                    )}
                  </div>
                  <Link
                    to={`/sto?status=${sec.statuses[0]}`}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium shrink-0"
                  >
                    View all →
                  </Link>
                </div>

                {loading ? (
                  <div className="p-8 text-center text-gray-400">Loading...</div>
                ) : sec.items.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="text-xl mb-1">✓</div>
                    <div className="text-gray-500 text-sm font-medium">
                      Nothing waiting for your action
                    </div>
                  </div>
                ) : sec.filtered.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    No items match &ldquo;{queueSearch}&rdquo;
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-6 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                            STO
                          </th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                            Material
                          </th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                            Priority
                          </th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                            Need-By
                          </th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                            Waiting
                          </th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sec.filtered.map(sto => {
                          const waiting = daysSince(sto.updated_at);
                          const isStalled = waiting >= 3;
                          return (
                            <tr key={sto.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-3">
                                <div className="font-mono font-medium text-gray-900 text-sm">
                                  {sto.sto_id}
                                </div>
                                {sto.rush_request && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 mt-0.5">
                                    RUSH
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 max-w-[200px]">
                                <div className="truncate text-gray-700">
                                  {sto.material_description || sto.material_sap || '—'}
                                </div>
                                {sto.quantity && (
                                  <div className="text-xs text-gray-400">
                                    {sto.quantity} {sto.uom}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <PriorityBadge priority={sto.priority} />
                              </td>
                              <td className="px-4 py-3">
                                {sto.receiving_site_need_by_date ? (
                                  <span className={needByColor(sto.receiving_site_need_by_date)}>
                                    {new Date(sto.receiving_site_need_by_date).toLocaleDateString()}
                                    {daysUntil(sto.receiving_site_need_by_date) < 0 && (
                                      <span className="text-xs ml-1">(overdue)</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`text-sm ${isStalled ? 'text-red-600 font-semibold' : 'text-gray-500'}`}
                                >
                                  {waiting}d {isStalled && '⚠'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Link
                                  to={`/sto/${sto.id}`}
                                  className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                  Take Action →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Alerts: Rush + Overdue ── */}
        {!loading && (kpis.rushActive > 0 || kpis.overdue > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {kpis.rushActive > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-red-600 font-semibold text-sm">
                    🚨 Rush STOs in Progress
                  </span>
                  <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {kpis.rushActive}
                  </span>
                </div>
                <div className="space-y-2">
                  {rushAlertItems.map(sto => (
                    <Link
                      key={sto.id}
                      to={`/sto/${sto.id}`}
                      className="flex items-center justify-between p-2 bg-white rounded-lg hover:bg-red-50 transition-colors group"
                    >
                      <div>
                        <span className="font-mono text-sm font-medium text-gray-900">
                          {sto.sto_id}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          {sto.material_description || sto.material_sap}
                        </span>
                      </div>
                      <StatusBadge status={sto.status} />
                    </Link>
                  ))}
                  {kpis.rushActive > rushAlertItems.length && (
                    <Link
                      to="/sto?priority=1"
                      className="text-xs text-red-600 hover:underline block mt-1"
                    >
                      +{kpis.rushActive - rushAlertItems.length} more →
                    </Link>
                  )}
                </div>
              </div>
            )}
            {kpis.overdue > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-orange-700 font-semibold text-sm">
                    ⏰ Past Need-By Date
                  </span>
                  <span className="bg-orange-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {kpis.overdue}
                  </span>
                </div>
                <div className="space-y-2">
                  {overdueAlertItems.map(sto => (
                    <Link
                      key={sto.id}
                      to={`/sto/${sto.id}`}
                      className="flex items-center justify-between p-2 bg-white rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      <div>
                        <span className="font-mono text-sm font-medium text-gray-900">
                          {sto.sto_id}
                        </span>
                        <span className="text-xs text-red-600 ml-2">
                          {Math.abs(daysUntil(sto.receiving_site_need_by_date!))}d overdue
                        </span>
                      </div>
                      <StatusBadge status={sto.status} />
                    </Link>
                  ))}
                  {kpis.overdue > overdueAlertItems.length && (
                    <Link to="/sto" className="text-xs text-orange-600 hover:underline block mt-1">
                      +{kpis.overdue - overdueAlertItems.length} more →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Pipeline Overview ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Pipeline Overview</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                🔥 = high volume stage (possible bottleneck)
              </p>
            </div>
            <div className="text-xs text-gray-400">{loading ? '' : `${inProgress} in flight`}</div>
          </div>
          <div className="flex items-center flex-wrap gap-1">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.status} className="flex items-center">
                <StagePill stage={stage} count={stageCounts[stage.status] || 0} loading={loading} />
                {i < PIPELINE_STAGES.length - 1 && (
                  <span className="text-gray-300 text-base mx-1 shrink-0">→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom two-column ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Recent Activity</h2>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
            ) : audit.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No activity yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {audit.slice(0, 8).map(entry => (
                  <div key={entry.id} className="px-6 py-3 flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-700">
                        <Link
                          to={`/sto/${entry.sto_request_id}`}
                          className="font-mono font-medium hover:text-blue-600"
                        >
                          {entry.sto_id}
                        </Link>
                        {' — '}
                        <span>{actionLabel(entry.action)}</span>
                      </div>
                      {entry.notes && (
                        <div className="text-xs text-gray-400 truncate">{entry.notes}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-0.5">
                        {entry.performed_by_name} · {new Date(entry.performed_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Need-By Dates */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Upcoming Need-By Dates</h2>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
            ) : upcomingItems.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No pending need-by dates</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {upcomingItems.map(sto => {
                  const d = daysUntil(sto.receiving_site_need_by_date!);
                  return (
                    <Link
                      key={sto.id}
                      to={`/sto/${sto.id}`}
                      className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <div className="font-mono text-sm font-medium text-gray-900">
                          {sto.sto_id}
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-[180px]">
                          {sto.material_description || sto.material_sap}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-medium ${d <= 7 ? 'text-orange-500' : 'text-gray-600'}`}
                        >
                          {d === 0 ? 'Today' : `${d}d left`}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(sto.receiving_site_need_by_date!).toLocaleDateString()}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Admin: Archive panel ── */}
        {isAdmin(user) && archivePreview !== null && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Data Archive</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  CLOSED / REJECTED records older than {archivePreview.retention_years} years —{' '}
                  <span
                    className={
                      archivePreview.eligible > 0 ? 'text-amber-600 font-medium' : 'text-gray-500'
                    }
                  >
                    {archivePreview.eligible} record{archivePreview.eligible !== 1 ? 's' : ''}{' '}
                    eligible
                  </span>
                </p>
                {archiveMsg && <p className="text-xs text-green-600 mt-1">{archiveMsg}</p>}
              </div>
              <button
                disabled={archivePreview.eligible === 0 || archiving}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Archive ${archivePreview.eligible} record(s)? They will be hidden from all views but not deleted.`,
                    )
                  )
                    return;
                  setArchiving(true);
                  try {
                    const r = await api.post('/admin/archive/run');
                    setArchiveMsg(r.data.message);
                    setArchivePreview(p => (p ? { ...p, eligible: 0 } : p));
                  } catch {
                    setArchiveMsg('Archive failed — check backend logs.');
                  } finally {
                    setArchiving(false);
                  }
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-800 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
              >
                {archiving ? 'Archiving…' : 'Run Archive'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
