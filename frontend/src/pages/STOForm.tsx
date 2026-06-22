import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../api/client';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

type FormData = Record<string, string | boolean | number>;

function Field({ label, hint, children, required }: {
  label: string; hint?: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function toDate(v: string | null | undefined): string {
  return v ? v.slice(0, 10) : '';
}

export function STOForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState('');

  const rushRequest = watch('rush_request');

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/sto/${id}`)
      .then(r => {
        const s = r.data;
        reset({
          requestor_name:                s.requestor_name ?? '',
          requestor_email:               s.requestor_email ?? '',
          priority:                      String(s.priority ?? 3),
          requesting_plant:              s.requesting_plant ?? '',
          repeat_shipment_calendar_year: s.repeat_shipment_calendar_year ?? '',
          shipping_site:                 s.shipping_site ?? '',
          receiving_site:                s.receiving_site ?? '',
          standard_estimated_ship_date:  toDate(s.standard_estimated_ship_date),
          receiving_site_need_by_date:   toDate(s.receiving_site_need_by_date),
          estimated_ship_by_date:        toDate(s.estimated_ship_by_date),
          expedited_estimated_ship_date: toDate(s.expedited_estimated_ship_date),
          rush_request:                  Boolean(s.rush_request),
          public_holiday:                Boolean(s.public_holiday),
          toll_mfg:                      Boolean(s.toll_mfg),
          rush_reason:                   s.rush_reason ?? '',
          material_sap:                  s.material_sap ?? '',
          material_description:          s.material_description ?? '',
          brand_at_receiving_site:       s.brand_at_receiving_site ?? '',
          inco_terms:                    s.inco_terms ?? '',
          quantity:                      s.quantity ?? '',
          uom:                           s.uom ?? '',
          shipping_conditions:           s.shipping_conditions ?? '',
          material_value:                s.material_value ?? '',
          controlled_shipping_required:  Boolean(s.controlled_shipping_required),
          insurance_loss_required:       Boolean(s.insurance_loss_required),
          sto_number:                    s.sto_number ?? '',
          shipment_id:                   s.shipment_id ?? '',
          corporate_sto_tracker_status:  s.corporate_sto_tracker_status ?? '',
        });
      })
      .catch(() => setError('Failed to load STO for editing'))
      .finally(() => setLoading(false));
  }, [id, isEdit, reset]);

  async function onSubmit(data: FormData) {
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.put(`/sto/${id}`, data);
        navigate(`/sto/${id}`);
      } else {
        const res = await api.post('/sto', {
          ...data,
          request_date: new Date().toISOString().slice(0, 10),
          requestor_name: data.requestor_name || user?.name,
        });
        navigate(`/sto/${res.data.id}`);
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(msg || (isEdit ? 'Failed to update STO' : 'Failed to create STO'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout><div className="p-12 text-center text-gray-400">Loading...</div></Layout>;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit STO' : 'New STO Request'}</h1>
        </div>

        {!isEdit && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg mb-6 text-sm">
            Fill in the transfer request details below. Once submitted, this goes to the Shipping Site Planning queue.
          </div>
        )}

        {isEdit && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-6 text-sm">
            Editing STO — changes are saved immediately and logged in the audit trail.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Requestor Info */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800 border-b pb-2">Requestor Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Requestor Name" required>
                <input {...register('requestor_name', { required: true })} defaultValue={user?.name} className={INPUT} />
              </Field>
              <Field label="Requestor Email" required>
                <input type="email" {...register('requestor_email', { required: true })} className={INPUT} placeholder="you@company.com" />
              </Field>
            </div>
          </div>

          {/* Request Info */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800 border-b pb-2">Request Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Priority" required>
                <select {...register('priority', { required: true })} className={INPUT}>
                  <option value="3">3 – Standard (45 days)</option>
                  <option value="2">2 – Expedited</option>
                  <option value="1">1 – Urgent (15 days)</option>
                </select>
              </Field>
              <Field label="Requesting Plant" required>
                <input {...register('requesting_plant', { required: true })} defaultValue={user?.site ?? ''} className={INPUT} placeholder="e.g. Plant B" />
              </Field>
              <Field label="Repeat Shipment (Calendar Year)" hint="Enter year if this is a repeat">
                <input {...register('repeat_shipment_calendar_year')} className={INPUT} placeholder="e.g. 2026" />
              </Field>
              <Field label="Shipping Site" required hint="Site shipping FROM">
                <input {...register('shipping_site', { required: true })} className={INPUT} placeholder="Plant A" />
              </Field>
              <Field label="Receiving Site" required hint="Site shipping TO">
                <input {...register('receiving_site', { required: true })} className={INPUT} placeholder="Plant B" />
              </Field>
              <Field label="Standard Estimated Ship Date">
                <input type="date" {...register('standard_estimated_ship_date')} className={INPUT} />
              </Field>
              <Field label="Receiving Site Need By Date" required>
                <input type="date" {...register('receiving_site_need_by_date', { required: true })} className={INPUT} />
              </Field>
              <Field label="Estimated Ship By Date">
                <input type="date" {...register('estimated_ship_by_date')} className={INPUT} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-6">
              {[
                { name: 'rush_request', label: 'Rush Request' },
                { name: 'public_holiday', label: 'Public Holiday at Shipping/Receiving Site' },
                { name: 'toll_mfg', label: 'Toll MFG (Contract Manufacturing)' },
              ].map(cb => (
                <label key={cb.name} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register(cb.name as keyof FormData)} className="w-4 h-4 text-blue-600 rounded" />
                  <span className="text-sm text-gray-700">{cb.label}</span>
                </label>
              ))}
            </div>

            {rushRequest && (
              <Field label="Rush Reason" required hint="Required for rush requests">
                <textarea {...register('rush_reason', { required: !!rushRequest })} rows={2} className={INPUT} placeholder="Explain urgency..." />
                {errors.rush_reason && <p className="text-red-500 text-xs mt-1">Rush reason is required</p>}
              </Field>
            )}
            {rushRequest && (
              <Field label="Expedited Estimated Ship Date">
                <input type="date" {...register('expedited_estimated_ship_date')} className={INPUT} />
              </Field>
            )}
          </div>

          {/* Material */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800 border-b pb-2">Material Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Material SAP #" required>
                <input {...register('material_sap', { required: true })} className={INPUT} placeholder="SAP Material Number" />
              </Field>
              <Field label="Material Description" required>
                <input {...register('material_description', { required: true })} className={INPUT} placeholder="Full material description" />
              </Field>
              <Field label="Brand at Receiving Site">
                <input {...register('brand_at_receiving_site')} className={INPUT} />
              </Field>
              <Field label="INCO Terms" hint="e.g. EXW, FOB, CIF, DAP">
                <input {...register('inco_terms')} className={INPUT} placeholder="e.g. EXW, FOB" />
              </Field>
              <Field label="Quantity" required>
                <input type="number" step="any" {...register('quantity', { required: true, min: 0.001 })} className={INPUT} placeholder="0" />
              </Field>
              <Field label="UOM" required hint="Unit of Measure">
                <input {...register('uom', { required: true })} className={INPUT} placeholder="e.g. EA, KG, LT" />
              </Field>
              <Field label="Shipping Conditions" hint="Temp/restrictions">
                <input {...register('shipping_conditions')} className={INPUT} placeholder="e.g. 2–8°C, Fragile" />
              </Field>
              <Field label="Material Value (USD)" hint="Used for management approval threshold">
                <input type="number" step="0.01" {...register('material_value')} className={INPUT} placeholder="0.00" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('controlled_shipping_required')} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm text-gray-700">Controlled Shipping Required</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('insurance_loss_required')} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm text-gray-700">Insurance Loss Required</span>
              </label>
            </div>
          </div>

          {/* Tracking Reference */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800 border-b pb-2">Tracking Reference</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="STO Number" hint="SAP STO reference number">
                <input {...register('sto_number')} className={INPUT} placeholder="e.g. STO-PA-2026-0001" />
              </Field>
              <Field label="Shipment ID" hint="Shipment reference ID">
                <input {...register('shipment_id')} className={INPUT} placeholder="e.g. SHP-20001" />
              </Field>
              <Field label="Corporate STO Tracker Status">
                <input {...register('corporate_sto_tracker_status')} className={INPUT} placeholder="e.g. In Transit, Pending" />
              </Field>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => navigate(-1)} className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 font-medium disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save as Draft'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
