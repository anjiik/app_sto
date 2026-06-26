import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { STORequest, STOStatus } from '../types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(val?: string | null) {
  if (!val) return '–';
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return new Date(val).toLocaleDateString();
  return val;
}

function Row({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === null || value === undefined || value === '') return null;
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-44 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{display}</span>
    </div>
  );
}

// ── Process timeline ────────────────────────────────────────────────────────
const STEPS: { key: STOStatus; label: string }[] = [
  { key: 'DRAFT',                label: 'Draft' },
  { key: 'PLANNING_REVIEW',      label: 'Planning' },
  { key: 'SHIPPING_LOGISTICS',   label: 'Logistics' },
  { key: 'MANAGEMENT_REVIEW',    label: 'Ship. Mgmt' },
  { key: 'RECEIVING_MGMT_REVIEW', label: 'Recv. Mgmt' },
  { key: 'RECEIVING_LOGISTICS',  label: 'Recv. Logistics' },
  { key: 'CLOSED',               label: 'Closed' },
];

const STEP_ORDER = STEPS.map(s => s.key);

function Timeline({ status }: { status: STOStatus }) {
  if (status === 'REJECTED') {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <span className="text-red-500 font-bold">✗</span>
        <span className="text-red-700 font-medium text-sm">Rejected</span>
      </div>
    );
  }
  const currentIdx = STEP_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-0 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 overflow-x-auto">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1 px-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                done   ? 'bg-blue-600 text-white' :
                active ? 'bg-blue-700 text-white ring-4 ring-blue-200' :
                         'bg-gray-200 text-gray-400'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-xs whitespace-nowrap ${active ? 'text-blue-700 font-semibold' : done ? 'text-blue-500' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 mt-[-14px] ${i < currentIdx ? 'bg-blue-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Approval panel (for planning / management / finance) ────────────────────
function ApprovalPanel({ title, onApprove, loading, showIgb }: {
  title: string;
  onApprove: (approved: boolean, notes: string, igb_complete?: boolean) => void;
  loading: boolean;
  showIgb?: boolean;
}) {
  const [note, setNote] = useState('');
  const [igb, setIgb] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="font-semibold text-amber-900 mb-3">{title} — Action Required</div>
      {!open ? (
        <button onClick={() => setOpen(true)} className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-amber-700">
          Review &amp; Decide
        </button>
      ) : (
        <div className="space-y-3">
          {showIgb && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={igb} onChange={e => setIgb(e.target.checked)} className="w-4 h-4 text-amber-600 rounded" />
              <span className="text-sm text-gray-700 font-medium">IGB Complete</span>
            </label>
          )}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional notes..."
            rows={2}
            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex gap-2">
            <button disabled={loading} onClick={() => onApprove(true, note, igb)}
              className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">✓ Approve</button>
            <button disabled={loading} onClick={() => onApprove(false, note, igb)}
              className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">✗ Reject</button>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-700 px-2 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalResult({ approved, by, notes }: { approved?: boolean | null; by?: string; notes?: string }) {
  if (approved === undefined || approved === null) return (
    <div className="text-sm text-gray-400 italic">Pending</div>
  );
  return (
    <div className={`rounded-xl p-3 ${approved ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
      <div className={`font-medium text-sm ${approved ? 'text-green-800' : 'text-red-800'}`}>
        {approved ? '✓ Approved' : '✗ Rejected'}{by ? ` by ${by}` : ''}
      </div>
      {notes && <div className={`text-xs mt-1 ${approved ? 'text-green-600' : 'text-red-600'}`}>{notes}</div>}
    </div>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, active, icon, children }: {
  title: string; active?: boolean; icon: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-5 ${active ? 'border-blue-300 bg-blue-50/30 shadow-sm' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{icon}</span>
        <h3 className={`font-semibold ${active ? 'text-blue-800' : 'text-gray-800'}`}>{title}</h3>
        {active && <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Your Turn</span>}
      </div>
      {children}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function STODetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sto, setSto] = useState<STORequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [planningForm,  setPlanningForm]  = useState<Record<string, string>>({});
  const [logisticsForm, setLogisticsForm] = useState<Record<string, string | boolean>>({});
  const [recvForm,      setRecvForm]      = useState<Record<string, string | boolean>>({});
  const [trackingForm,  setTrackingForm]  = useState<Record<string, string>>({});
  const [editTracking,  setEditTracking]  = useState(false);

  function load() {
    setLoading(true);
    api.get(`/sto/${id}`).then(r => setSto(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]);

  async function doAction(endpoint: string, body: object) {
    setActionLoading(true);
    setMessage(null);
    try {
      const r = await api.post(`/sto/${id}/${endpoint}`, body);
      setMessage({ text: r.data.message || 'Done', ok: true });
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Error';
      setMessage({ text: msg || 'Error', ok: false });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <Layout><div className="p-12 text-center text-gray-400">Loading...</div></Layout>;
  if (!sto) return <Layout><div className="p-12 text-center text-red-500">STO not found</div></Layout>;

  const g = user?.group;
  const isRequestor = user?.name === sto.requestor_name;

  // Who is active right now?
  const myTurn = (
    ((isRequestor || g === 'admin') && sto.status === 'DRAFT') ||
    (g === 'shipping_planning'  && sto.status === 'PLANNING_REVIEW'      && user?.site === sto.shipping_site) ||
    (g === 'shipping_logistics' && sto.status === 'SHIPPING_LOGISTICS'   && user?.site === sto.shipping_site) ||
    (g === 'management'         && sto.status === 'MANAGEMENT_REVIEW'     && user?.site === sto.shipping_site) ||
    (g === 'management'         && sto.status === 'RECEIVING_MGMT_REVIEW' && user?.site === sto.receiving_site) ||
    (g === 'receiving_logistics'&& sto.status === 'RECEIVING_LOGISTICS'  && user?.site === sto.receiving_site)
  );

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-sm mb-2 block">← Back</button>
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{sto.sto_id}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge status={sto.status} />
              <PriorityBadge priority={sto.priority} />
              {sto.rush_request && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">RUSH</span>}
              {sto.toll_mfg && <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">Toll MFG</span>}
              {myTurn && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">Action Required from You</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {sto.status === 'DRAFT' && (
              <button
                onClick={() => doAction('submit', {})}
                disabled={actionLoading}
                className="bg-blue-700 text-white px-5 py-2.5 rounded-lg hover:bg-blue-800 font-medium disabled:opacity-50"
              >
                Submit for Planning Review →
              </button>
            )}
            {g === 'admin' && (
              <button
                onClick={() => navigate(`/sto/${id}/edit`)}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 font-medium text-sm"
              >
                Edit
              </button>
            )}
            {g === 'admin' && sto.status !== 'DRAFT' && (
              <button
                onClick={() => { if (window.confirm(`Revert this STO one step back from ${sto.status}?`)) doAction('revert', {}); }}
                disabled={actionLoading}
                className="bg-white border border-red-300 text-red-700 px-4 py-2.5 rounded-lg hover:bg-red-50 font-medium text-sm disabled:opacity-50"
              >
                Revert One Step
              </button>
            )}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`px-4 py-3 rounded-lg text-sm ${message.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Rejection banner */}
        {sto.status === 'REJECTED' && sto.rejection_reason && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="font-semibold text-red-800 mb-1">Rejected</div>
            <p className="text-red-700 text-sm">{sto.rejection_reason}</p>
          </div>
        )}

        {/* Timeline */}
        <Timeline status={sto.status} />

        {/* ── SECTION 1: Request & Material Info (Receiving Site fills) ── */}
        <Section title="Request &amp; Material Information" icon="📋" active={g === 'receiving_site' && sto.status === 'DRAFT'}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Requestor</p>
              <Row label="Name" value={sto.requestor_name} />
              <Row label="Email" value={sto.requestor_email} />
              <Row label="Requesting Plant" value={sto.requesting_plant} />
              <Row label="Shipping Site" value={sto.shipping_site} />
              <Row label="Receiving Site" value={sto.receiving_site} />

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4">Schedule</p>
              <Row label="Request Date" value={fmt(sto.request_date)} />
              <Row label="Need By Date" value={fmt(sto.receiving_site_need_by_date)} />
              <Row label="Std. Est. Ship Date" value={fmt(sto.standard_estimated_ship_date)} />
              <Row label="Est. Ship By" value={fmt(sto.estimated_ship_by_date)} />
              <Row label="Expedited Ship Date" value={fmt(sto.expedited_estimated_ship_date)} />
              <Row label="Repeat Shipment Year" value={sto.repeat_shipment_calendar_year} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Material</p>
              <Row label="SAP Material #" value={sto.material_sap} />
              <Row label="MPN #" value={sto.mpn_number} />
              <Row label="Description" value={sto.material_description} />
              <Row label="Quantity" value={sto.quantity != null ? `${sto.quantity} ${sto.uom || ''}` : undefined} />
              <Row label="Batch #" value={sto.batch_number} />
              <Row label="Expiration Date" value={fmt(sto.expiration_date)} />
              <Row label="Shipping Conditions" value={sto.shipping_conditions} />
              <Row label="Brand at Receiving" value={sto.brand_at_receiving_site} />
              <Row label="Material Value" value={sto.material_value != null ? `$${Number(sto.material_value).toLocaleString()}` : undefined} />

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4">Flags</p>
              <Row label="Rush Request" value={sto.rush_request} />
              {sto.rush_reason && <Row label="Rush Reason" value={sto.rush_reason} />}
              <Row label="Public Holiday" value={sto.public_holiday} />
              <Row label="Toll MFG" value={sto.toll_mfg} />
              <Row label="Controlled Shipping" value={sto.controlled_shipping_required} />
              <Row label="Insurance Loss Req." value={sto.insurance_loss_required} />
            </div>
          </div>
        </Section>

        {/* ── SECTION 2: Shipping Planning Review ── */}
        <Section title="Shipping Site Planning Review" icon="🗂️" active={g === 'shipping_planning' && sto.status === 'PLANNING_REVIEW' && user?.site === sto.shipping_site}>
          {g === 'shipping_planning' && sto.status === 'PLANNING_REVIEW' && user?.site === sto.shipping_site ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Complete the inventory review fields below, then approve or reject.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { key: 'mpn_number',      label: 'MPN Number',      placeholder: 'Manufacturer Part Number', required: true },
                  { key: 'batch_number',    label: 'Batch Number',    placeholder: 'e.g. B-2026-001',          required: true },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {f.label} {f.required && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      placeholder={f.placeholder}
                      onChange={e => setPlanningForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiration Date <span className="text-red-500">*</span>
                  </label>
                  <input type="date"
                    onChange={e => setPlanningForm(p => ({ ...p, expiration_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  />
                </div>
              </div>
              {sto.material_value != null && (
                <div className={`px-4 py-2 rounded-lg text-sm ${sto.material_value > 100000 ? 'bg-orange-50 border border-orange-200 text-orange-800' : 'bg-gray-50 border border-gray-200 text-gray-600'}`}>
                  Material Value: <strong>${Number(sto.material_value).toLocaleString()}</strong>
                  {sto.material_value > 100000 && ' — Management approval will be required (value > $100,000)'}
                </div>
              )}
              <ApprovalPanel
                title="Inventory Request"
                loading={actionLoading}
                onApprove={(approved, notes) => doAction('planning', { approved, notes, ...planningForm })}
              />

            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><span className="text-xs text-gray-400 block">MPN Number</span>{sto.mpn_number || '–'}</div>
                <div><span className="text-xs text-gray-400 block">Batch Number</span>{sto.batch_number || '–'}</div>
                <div><span className="text-xs text-gray-400 block">Expiration Date</span>{fmt(sto.expiration_date)}</div>
              </div>
              <ApprovalResult approved={sto.planning_approved} notes={sto.planning_notes} />
            </div>
          )}
        </Section>

        {/* ── SECTION 3: Shipping Logistics ── */}
        <Section title="Shipping Site Logistics" icon="📦" active={g === 'shipping_logistics' && sto.status === 'SHIPPING_LOGISTICS' && user?.site === sto.shipping_site}>
          {g === 'shipping_logistics' && sto.status === 'SHIPPING_LOGISTICS' && user?.site === sto.shipping_site ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Fill in the shipment details, then submit. Management approval is required if: material &gt; $100,000, freight &gt; $20,000, cold/frozen shipping, or freight cost &gt; 30% of material value.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'container_information', label: 'Container Information (UOM Conversion)', placeholder: 'e.g. 12 units per carton' },
                  { key: 'tracking_id',            label: 'Tracking ID',                           placeholder: '' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                    <input
                      placeholder={f.placeholder}
                      onChange={e => setLogisticsForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Freight Cost (USD) <span className="text-red-500">*</span></label>
                  <input
                    type="number" step="0.01" placeholder="0.00"
                    onChange={e => setLogisticsForm(p => ({ ...p, freight_cost: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Management approval required if &gt;$20,000 or &gt;30% of material value</p>
                </div>
                {[
                  { key: 'pgi_date',               label: 'PGI Date (Goods Issued from SAP)' },
                  { key: 'estimated_delivery_date', label: 'Estimated Delivery Date' },
                  { key: 'actual_ship_date',        label: 'Actual Ship Date' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                    <input type="date" onChange={e => setLogisticsForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" onChange={e => setLogisticsForm(p => ({ ...p, ready_to_ship: e.target.checked }))}
                  className="w-4 h-4 text-teal-600 rounded" />
                <span className="text-sm text-gray-700 font-medium">Ready to Ship</span>
              </label>
              <button
                onClick={() => doAction('logistics', logisticsForm)}
                disabled={actionLoading}
                className="bg-teal-700 text-white px-5 py-2 rounded-lg hover:bg-teal-800 font-medium text-sm disabled:opacity-50"
              >
                Submit Logistics →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><span className="text-xs text-gray-400 block">Container Info</span>{sto.container_information || '–'}</div>
              <div><span className="text-xs text-gray-400 block">Freight Cost</span>{sto.freight_cost != null ? `$${Number(sto.freight_cost).toLocaleString()}` : '–'}</div>
              <div><span className="text-xs text-gray-400 block">Ready to Ship</span>{sto.ready_to_ship ? 'Yes' : '–'}</div>
              <div><span className="text-xs text-gray-400 block">PGI Date</span>{fmt(sto.pgi_date)}</div>
              <div><span className="text-xs text-gray-400 block">Est. Delivery Date</span>{fmt(sto.estimated_delivery_date)}</div>
              <div><span className="text-xs text-gray-400 block">Actual Ship Date</span>{fmt(sto.actual_ship_date)}</div>
              <div><span className="text-xs text-gray-400 block">Tracking ID</span>{sto.tracking_id || '–'}</div>
            </div>
          )}
        </Section>

        {/* ── SECTION 4: Management Review ── */}
        <Section title="Shipping Site Management Approval" icon="✅" active={g === 'management' && sto.status === 'MANAGEMENT_REVIEW' && user?.site === sto.shipping_site}>
          {sto.management_approval_required === false && sto.status !== 'MANAGEMENT_REVIEW' ? (
            <div className="text-sm text-gray-400 italic">Not required for this order</div>
          ) : g === 'management' && sto.status === 'MANAGEMENT_REVIEW' && user?.site === sto.shipping_site ? (
            <ApprovalPanel
              title="Management Approval"
              showIgb
              loading={actionLoading}
              onApprove={(approved, notes, igb_complete) => doAction('management', { approved, notes, igb_complete })}
            />
          ) : (
            <div className="space-y-2">
              <ApprovalResult approved={sto.management_approved} notes={sto.management_notes} />
              {sto.igb_complete && <div className="text-xs text-gray-500">IGB Complete: Yes</div>}
            </div>
          )}
        </Section>

        {/* ── SECTION 5: Receiving Site Management Review ── */}
        <Section title="Receiving Site Management Approval" icon="✅" active={g === 'management' && sto.status === 'RECEIVING_MGMT_REVIEW' && user?.site === sto.receiving_site}>
          {g === 'management' && sto.status === 'RECEIVING_MGMT_REVIEW' && user?.site === sto.receiving_site ? (
            <ApprovalPanel
              title="Receiving Site Management Approval"
              loading={actionLoading}
              onApprove={(approved, notes) => doAction('receiving-management', { approved, notes })}
            />
          ) : (
            <ApprovalResult approved={sto.receiving_mgmt_approved} notes={sto.receiving_mgmt_notes} />
          )}
        </Section>

        {/* ── SECTION 6: Receiving Logistics ── */}
        <Section title="Receiving Site Logistics" icon="🏭" active={g === 'receiving_logistics' && sto.status === 'RECEIVING_LOGISTICS' && user?.site === sto.receiving_site}>
          {g === 'receiving_logistics' && sto.status === 'RECEIVING_LOGISTICS' && user?.site === sto.receiving_site ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Confirm receipt details and close out the delivery.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actual Receipt Date <span className="text-red-500">*</span></label>
                  <input type="date" onChange={e => setRecvForm(p => ({ ...p, actual_receipt_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" onChange={e => setRecvForm(p => ({ ...p, delivery_closed_out: e.target.checked }))}
                  className="w-4 h-4 text-orange-600 rounded" />
                <span className="text-sm text-gray-700 font-medium">Close Out Delivery (marks STO as Closed)</span>
              </label>
              <button
                onClick={() => doAction('receiving-logistics', recvForm)}
                disabled={actionLoading}
                className="bg-orange-600 text-white px-5 py-2 rounded-lg hover:bg-orange-700 font-medium text-sm disabled:opacity-50"
              >
                Save Receipt Details
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-xs text-gray-400 block">Receipt Date</span>{fmt(sto.actual_receipt_date)}</div>
              <div><span className="text-xs text-gray-400 block">Delivery Closed Out</span>{sto.delivery_closed_out ? 'Yes' : '–'}</div>
            </div>
          )}
        </Section>

        {/* ── Tracking Reference (editable by requestor or admin) ── */}
        {(isRequestor || g === 'admin') && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Tracking Reference</h3>
              {!editTracking && (
                <button
                  onClick={() => {
                    setTrackingForm({
                      sto_number: sto.sto_number ?? '',
                      shipment_id: sto.shipment_id ?? '',
                      corporate_sto_tracker_status: sto.corporate_sto_tracker_status ?? '',
                    });
                    setEditTracking(true);
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Edit
                </button>
              )}
            </div>
            {editTracking ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { key: 'sto_number',                  label: 'STO Number' },
                    { key: 'shipment_id',                 label: 'Shipment ID' },
                    { key: 'corporate_sto_tracker_status', label: 'Corporate STO Tracker Status' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                      <input
                        value={trackingForm[f.key] ?? ''}
                        onChange={e => setTrackingForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={actionLoading}
                    onClick={async () => {
                      setActionLoading(true);
                      setMessage(null);
                      try {
                        await api.patch(`/sto/${id}/tracking`, trackingForm);
                        setMessage({ text: 'Tracking reference updated', ok: true });
                        setEditTracking(false);
                        load();
                      } catch (err: unknown) {
                        const msg = err && typeof err === 'object' && 'response' in err
                          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                          : 'Error';
                        setMessage({ text: msg || 'Error', ok: false });
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    className="bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-800 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditTracking(false)} className="text-gray-500 hover:text-gray-700 px-3 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div><span className="text-xs text-gray-400 block">STO Number</span>{sto.sto_number || '–'}</div>
                <div><span className="text-xs text-gray-400 block">Shipment ID</span>{sto.shipment_id || '–'}</div>
                <div><span className="text-xs text-gray-400 block">Corporate Tracker Status</span>{sto.corporate_sto_tracker_status || '–'}</div>
              </div>
            )}
          </div>
        )}

        {/* ── Audit Log ── */}
        {sto.audit_log && sto.audit_log.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Activity Log</h3>
            <div className="space-y-2">
              {sto.audit_log.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{entry.action.replace(/_/g, ' ')}</span>
                      {entry.old_status && entry.new_status && (
                        <span className="text-xs text-gray-400">{entry.old_status} → {entry.new_status}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">by {entry.performed_by_name} · {new Date(entry.performed_at).toLocaleString()}</div>
                    {entry.notes && <div className="text-xs text-gray-600 mt-0.5">{entry.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
