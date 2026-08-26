import logger from './logger';

const RELAY_URL = process.env.NOTIFICATION_RELAY_URL;
const RELAY_USER = process.env.NOTIFICATION_RELAY_USER;
const RELAY_PASS = process.env.NOTIFICATION_RELAY_PASSWORD;
const RELAY_TEMPLATE = process.env.NOTIFICATION_RELAY_TEMPLATE || 'sto-completion';
const RELAY_SUBMITTED_TEMPLATE = process.env.NOTIFICATION_RELAY_SUBMITTED_TEMPLATE || 'sto-submitted';
const RELAY_PLANNING_QUEUE_TEMPLATE =
  process.env.NOTIFICATION_RELAY_PLANNING_QUEUE_TEMPLATE || 'sto-planning-queue';
const RELAY_PLANNING_APPROVED_TEMPLATE =
  process.env.NOTIFICATION_RELAY_PLANNING_APPROVED_TEMPLATE || 'sto-planning-approved';
const RELAY_PLANNING_REVISION_TEMPLATE =
  process.env.NOTIFICATION_RELAY_PLANNING_REVISION_TEMPLATE || 'sto-planning-revision';
const RELAY_PLANNING_REJECTED_TEMPLATE =
  process.env.NOTIFICATION_RELAY_PLANNING_REJECTED_TEMPLATE || 'sto-planning-rejected';

// TESTING ONLY — every notification this module sends is redirected to this
// address instead of the real recipient(s), so the relay + templates can be
// verified without emailing anyone for real. Remove TEST_NOTIFICATION_OVERRIDE
// (or unset it) once ready to send to real recipients — group/role
// notifications will then need a real per-site distribution list/address,
// since there is no per-role email on file today (only individual
// requestor_email).
const TEST_NOTIFICATION_OVERRIDE = 'ABC123@gmail.com';

function configured(): boolean {
  return Boolean(RELAY_URL && RELAY_USER && RELAY_PASS);
}

// Shared POST to the relay's /notifications endpoint — fire-and-forget (no
// await from the caller) so a relay failure never blocks the workflow action
// that triggered it. Logs but does not throw on error.
function postNotification(payload: Record<string, unknown>, logCtx: Record<string, unknown>): void {
  const creds = Buffer.from(`${RELAY_USER}:${RELAY_PASS}`).toString('base64');

  fetch(`${RELAY_URL}/api/v1/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${creds}`,
    },
    body: JSON.stringify(payload),
  })
    .then(res => {
      if (!res.ok) {
        res
          .text()
          .then(body =>
            logger.error({ ...logCtx, status: res.status, body }, 'notification relay error'),
          );
      }
    })
    .catch(err => logger.error({ ...logCtx, err }, 'notification relay unreachable'));
}

// Fire-and-forget — call without await so a relay failure never blocks the caller.
// Logs an error if the relay is reachable but returns a non-2xx response.
export function sendStoCompletedEmail(sto: {
  sto_id: string;
  requestor_name: string;
  requestor_email: string;
  shipping_site?: string;
  receiving_site?: string;
  material_description?: string;
  material_sap?: string;
}): void {
  if (!configured() || !sto.requestor_email) return;

  postNotification(
    {
      event_id: `sto-closed-${sto.sto_id}`,
      event_name: `STO ${sto.sto_id} completed`,
      message: `STO ${sto.sto_id} has been delivered and closed.`,
      destinations: [{ channel: 'email', target: sto.requestor_email }],
      email_template: RELAY_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        requestor_name: sto.requestor_name,
        shipping_site: sto.shipping_site ?? '',
        receiving_site: sto.receiving_site ?? '',
        material_description: sto.material_description ?? '',
        material_sap: sto.material_sap ?? '',
      },
    },
    { sto_id: sto.sto_id },
  );
}

// "STO submitted" notification to the requestor — sent when a DRAFT is
// submitted and enters Shipping Site Planning review. Requires a
// "sto-submitted" template on the relay (subject: "STO Request Submitted",
// body confirming the request is under Shipping Site Planning review) — see
// docs/admin/configuration.md for the one-time setup call.
//
// TESTING: destination is hardcoded to TEST_NOTIFICATION_OVERRIDE regardless
// of the real requestor_email — see the constant above to change this.
export function sendStoSubmittedEmail(sto: { sto_id: string; requestor_name: string }): void {
  if (!configured()) return;

  postNotification(
    {
      event_id: `sto-submitted-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} submitted`,
      message: `STO ${sto.sto_id} has been submitted and is under Shipping Site Planning review.`,
      destinations: [{ channel: 'email', target: TEST_NOTIFICATION_OVERRIDE }],
      email_template: RELAY_SUBMITTED_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        requestor_name: sto.requestor_name,
      },
    },
    { sto_id: sto.sto_id },
  );
}

// "New STO Request Submitted for Review" notification — sent alongside
// sendStoSubmittedEmail() when a DRAFT is submitted and enters PLANNING_REVIEW.
// Per spec: recipients are Shipping Site Planning, Shipping Site Logistics,
// and the requestor; the email carries the full request snapshot so reviewers
// don't have to open the app to see what's waiting.
// Requires an "sto-planning-queue" template on the relay — subject "New STO
// Request Submitted for Review", body "A new STO request has been submitted
// and is ready for Shipping Site Planning review.", referencing the
// email_vars below (sto_id plus every field in the spec's "key details" list).
//
// TESTING: destination is hardcoded to TEST_NOTIFICATION_OVERRIDE — there is
// no real distribution list for "Shipping Planning + Logistics at site X"
// today, only individual requestor_email. Wire up real recipients (site-scoped
// distribution lists, or every user holding those roles at the site) before
// removing the override.
export function sendStoAwaitingPlanningEmail(sto: {
  sto_id: string;
  requestor_name?: string;
  requestor_email?: string;
  requesting_plant?: string;
  shipping_site?: string;
  receiving_site?: string;
  priority?: number;
  repeat_shipment_calendar_year?: string | null;
  rush_request?: boolean;
  rush_reason?: string | null;
  receiving_site_need_by_date?: string | null;
  distressed_inventory?: boolean;
  di_value?: number | null;
  material_sap?: string;
  material_description?: string;
  brand_at_receiving_site?: string;
  inco_terms?: string | null;
  quantity?: number;
  uom?: string;
  shipping_conditions?: string;
  material_value?: number;
  controlled_shipping_required?: boolean;
  sto_number?: string | null;
  shipment_id?: string | null;
  corporate_sto_tracker_status?: string | null;
}): void {
  if (!configured()) return;

  postNotification(
    {
      event_id: `sto-planning-queue-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} submitted for review`,
      message: 'A new STO request has been submitted and is ready for Shipping Site Planning review.',
      destinations: [{ channel: 'email', target: TEST_NOTIFICATION_OVERRIDE }],
      email_template: RELAY_PLANNING_QUEUE_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        requestor_name: sto.requestor_name ?? '',
        requestor_email: sto.requestor_email ?? '',
        requesting_plant: sto.requesting_plant ?? '',
        shipping_site: sto.shipping_site ?? '',
        receiving_site: sto.receiving_site ?? '',
        priority: sto.priority ?? '',
        repeat_shipment: sto.repeat_shipment_calendar_year ?? '',
        rush_request: sto.rush_request ? 'Yes' : 'No',
        rush_reason: sto.rush_reason ?? '',
        need_by_date: sto.receiving_site_need_by_date ?? '',
        distressed_inventory: sto.distressed_inventory ? 'Yes' : 'No',
        di_value: sto.di_value ?? '',
        material_sap: sto.material_sap ?? '',
        material_description: sto.material_description ?? '',
        brand_at_receiving_site: sto.brand_at_receiving_site ?? '',
        inco_terms: sto.inco_terms ?? '',
        quantity: sto.quantity ?? '',
        uom: sto.uom ?? '',
        shipping_conditions: sto.shipping_conditions ?? '',
        material_value: sto.material_value ?? '',
        controlled_shipping: sto.controlled_shipping_required ? 'Yes' : 'No',
        sto_number: sto.sto_number ?? '',
        shipment_id: sto.shipment_id ?? '',
        corporate_sto_tracker_status: sto.corporate_sto_tracker_status ?? '',
      },
    },
    { sto_id: sto.sto_id },
  );
}

// "Shipping Site Planning Review" outcome notification — sent when Planning
// approves, requests revision on, or rejects a submitted STO. Per spec, one
// of three subjects/bodies/templates depending on outcome; recipients are the
// requestor, Shipping Site Logistics, and relevant site stakeholders.
// Requires three templates on the relay:
//   sto-planning-approved — "STO Request Approved by Shipping Site Planning"
//   sto-planning-revision — "STO Request Requires Revision"
//   sto-planning-rejected — "STO Request Rejected by Shipping Site Planning"
//
// TESTING: destination is hardcoded to TEST_NOTIFICATION_OVERRIDE — see the
// constant above.
export function sendPlanningReviewEmail(
  outcome: 'approve' | 'revise' | 'reject',
  sto: {
    sto_id: string;
    mpn_number?: string | null;
    batch_number?: string | null;
    expiration_date?: string | null;
    notes?: string | null;
  },
): void {
  if (!configured()) return;

  const byOutcome = {
    approve: {
      template: RELAY_PLANNING_APPROVED_TEMPLATE,
      eventSuffix: 'approved',
      message:
        'Your STO request has been approved by Shipping Site Planning and has moved to Shipping Site Logistics for further processing.',
    },
    revise: {
      template: RELAY_PLANNING_REVISION_TEMPLATE,
      eventSuffix: 'revision-requested',
      message: 'Your STO request requires revision and has been returned to the requestor for update.',
    },
    reject: {
      template: RELAY_PLANNING_REJECTED_TEMPLATE,
      eventSuffix: 'rejected',
      message: 'Your STO request has been rejected and the case is closed.',
    },
  }[outcome];

  postNotification(
    {
      event_id: `sto-planning-${byOutcome.eventSuffix}-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} planning ${byOutcome.eventSuffix}`,
      message: byOutcome.message,
      destinations: [{ channel: 'email', target: TEST_NOTIFICATION_OVERRIDE }],
      email_template: byOutcome.template,
      email_vars: {
        sto_id: sto.sto_id,
        mpn_number: sto.mpn_number ?? '',
        batch_number: sto.batch_number ?? '',
        expiration_date: sto.expiration_date ?? '',
        planning_notes: sto.notes ?? '',
      },
    },
    { sto_id: sto.sto_id, outcome },
  );
}
