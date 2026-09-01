import logger from './logger';

const RELAY_URL = process.env.NOTIFICATION_RELAY_URL;
const RELAY_USER = process.env.NOTIFICATION_RELAY_USER;
const RELAY_PASS = process.env.NOTIFICATION_RELAY_PASSWORD;
const RELAY_SUBMITTED_TEMPLATE = process.env.NOTIFICATION_RELAY_SUBMITTED_TEMPLATE || 'sto-submitted';
const RELAY_PLANNING_QUEUE_TEMPLATE =
  process.env.NOTIFICATION_RELAY_PLANNING_QUEUE_TEMPLATE || 'sto-planning-queue';
const RELAY_PLANNING_APPROVED_TEMPLATE =
  process.env.NOTIFICATION_RELAY_PLANNING_APPROVED_TEMPLATE || 'sto-planning-approved';
const RELAY_PLANNING_REVISION_TEMPLATE =
  process.env.NOTIFICATION_RELAY_PLANNING_REVISION_TEMPLATE || 'sto-planning-revision';
const RELAY_PLANNING_REJECTED_TEMPLATE =
  process.env.NOTIFICATION_RELAY_PLANNING_REJECTED_TEMPLATE || 'sto-planning-rejected';
const RELAY_MANAGEMENT_REQUESTED_TEMPLATE =
  process.env.NOTIFICATION_RELAY_MANAGEMENT_REQUESTED_TEMPLATE || 'sto-management-requested';
const RELAY_MANAGEMENT_GRANTED_TEMPLATE =
  process.env.NOTIFICATION_RELAY_MANAGEMENT_GRANTED_TEMPLATE || 'sto-management-granted';
const RELAY_MANAGEMENT_DENIED_TEMPLATE =
  process.env.NOTIFICATION_RELAY_MANAGEMENT_DENIED_TEMPLATE || 'sto-management-denied';
const RELAY_LOGISTICS_IN_PROGRESS_TEMPLATE =
  process.env.NOTIFICATION_RELAY_LOGISTICS_IN_PROGRESS_TEMPLATE || 'sto-logistics-in-progress';
const RELAY_READY_TO_SHIP_TEMPLATE =
  process.env.NOTIFICATION_RELAY_READY_TO_SHIP_TEMPLATE || 'sto-ready-to-ship';
const RELAY_SHIPMENT_EXECUTED_TEMPLATE =
  process.env.NOTIFICATION_RELAY_SHIPMENT_EXECUTED_TEMPLATE || 'sto-shipment-executed';
const RELAY_RECEIPT_CLOSED_TEMPLATE =
  process.env.NOTIFICATION_RELAY_RECEIPT_CLOSED_TEMPLATE || 'sto-receipt-closed';

// Test mode toggle. When on, EVERY notification this module would send is
// redirected to TEST_NOTIFICATION_OVERRIDE instead of the real recipient —
// this is the current production setting (deliberately), so nothing goes to
// a real inbox until it's explicitly switched off with
// NOTIFICATION_TEST_MODE=false once real recipients are ready everywhere.
// Defaults ON (missing/unset = test mode) so this is safe-by-default even if
// the var is never set at all — the previous hardcoded behavior, just now a
// single flag instead of a value buried in code.
const TEST_MODE = process.env.NOTIFICATION_TEST_MODE !== 'false';
const TEST_NOTIFICATION_OVERRIDE = process.env.NOTIFICATION_TEST_EMAIL || 'ABC123@gmail.com';

function configured(): boolean {
  return Boolean(RELAY_URL && RELAY_USER && RELAY_PASS);
}

// Resolves who a notification should actually go to. In test mode, always
// the override. Otherwise the real address if one was given — some events
// (see the per-function comments below) have no real per-role/per-site
// recipient on file yet, only the requestor's own email, so those pass
// `undefined` here and get skipped rather than guessing at a fake target.
function resolveDestination(realEmail: string | undefined | null): string | null {
  if (TEST_MODE) return TEST_NOTIFICATION_OVERRIDE;
  return realEmail || null;
}

// Shared POST to the relay's /notifications endpoint — fire-and-forget (no
// await from the caller) so a relay failure never blocks the workflow action
// that triggered it. Logs but does not throw on error. Returns without
// calling the relay at all if there's no destination to send to (relay not
// configured, or no real recipient available outside test mode).
function postNotification(
  destination: string | null,
  payload: Record<string, unknown>,
  logCtx: Record<string, unknown>,
): void {
  if (!configured()) return;
  if (!destination) {
    logger.info({ ...logCtx }, 'notification skipped — no recipient available');
    return;
  }

  const creds = Buffer.from(`${RELAY_USER}:${RELAY_PASS}`).toString('base64');

  fetch(`${RELAY_URL}/api/v1/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${creds}`,
    },
    body: JSON.stringify({ ...payload, destinations: [{ channel: 'email', target: destination }] }),
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

// "STO Receipt Confirmed and Closed" — sent when Receiving Site Logistics
// confirms actual receipt and closes out delivery (5) Receiving Site
// Logistics / Receipt Closeout). Replaces the previous STO-completion email;
// this is now the sole "STO closed" notification, per spec recipients:
// Requestor, Receiving Site Logistics, Shipping Site Logistics, Planning.
// Requires an "sto-receipt-closed" template on the relay (subject: "STO
// Receipt Confirmed and Closed").
//
// No per-role distribution list exists yet for Receiving/Shipping
// Logistics/Planning — outside test mode this is skipped until one does.
export function sendReceiptClosedEmail(sto: {
  sto_id: string;
  actual_receipt_date?: string | null;
  sto_number?: string | null;
  delivery_closed_out?: boolean;
}): void {
  const destination = resolveDestination(undefined);
  postNotification(
    destination,
    {
      event_id: `sto-receipt-closed-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} receipt confirmed and closed`,
      message: 'The material has been received and the STO has been closed out.',
      email_template: RELAY_RECEIPT_CLOSED_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        actual_receipt_date: sto.actual_receipt_date ?? '',
        sto_number: sto.sto_number ?? '',
        delivery_closeout_status: sto.delivery_closed_out ? 'Closed' : '',
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
// Sent to the requestor's own email outside test mode.
export function sendStoSubmittedEmail(sto: {
  sto_id: string;
  requestor_name: string;
  requestor_email?: string | null;
}): void {
  const destination = resolveDestination(sto.requestor_email);
  postNotification(
    destination,
    {
      event_id: `sto-submitted-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} submitted`,
      message: `STO ${sto.sto_id} has been submitted and is under Shipping Site Planning review.`,
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
// No per-role distribution list exists yet for Shipping Planning/Logistics —
// outside test mode this is skipped until one does (see requestor_email on
// the payload for a human to manually loop them in, in the meantime).
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
  const destination = resolveDestination(undefined);
  postNotification(
    destination,
    {
      event_id: `sto-planning-queue-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} submitted for review`,
      message: 'A new STO request has been submitted and is ready for Shipping Site Planning review.',
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
// Sent to the requestor's own email outside test mode (Shipping
// Logistics/other stakeholders have no distribution list yet).
export function sendPlanningReviewEmail(
  outcome: 'approve' | 'revise' | 'reject',
  sto: {
    sto_id: string;
    requestor_email?: string | null;
    mpn_number?: string | null;
    batch_number?: string | null;
    expiration_date?: string | null;
    notes?: string | null;
  },
): void {
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

  const destination = resolveDestination(sto.requestor_email);
  postNotification(
    destination,
    {
      event_id: `sto-planning-${byOutcome.eventSuffix}-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} planning ${byOutcome.eventSuffix}`,
      message: byOutcome.message,
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

// "Management Approval Requested" — sent when an STO is routed into
// MANAGEMENT_REVIEW (i.e. the logistics submission determined management
// approval is required). Requires an "sto-management-requested" template
// (subject: "STO Request Requires Management Approval").
//
// No per-role distribution list exists yet for Management — outside test
// mode this is skipped until one does.
export function sendManagementRequestedEmail(sto: {
  sto_id: string;
  approval_reasons?: string;
  freight_cost?: number | null;
  material_value?: number | null;
  shipment_ratio?: string;
  shipping_conditions?: string;
  rush_reason?: string | null;
  controlled_shipping_required?: boolean;
}): void {
  const destination = resolveDestination(undefined);
  postNotification(
    destination,
    {
      event_id: `sto-management-requested-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} requires management approval`,
      message: 'Your STO request requires management review before it can proceed.',
      email_template: RELAY_MANAGEMENT_REQUESTED_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        approval_reasons: sto.approval_reasons ?? '',
        freight_cost: sto.freight_cost ?? '',
        material_value: sto.material_value ?? '',
        shipment_ratio: sto.shipment_ratio ?? '',
        shipping_conditions: sto.shipping_conditions ?? '',
        rush_reason: sto.rush_reason ?? '',
        controlled_shipping: sto.controlled_shipping_required ? 'Yes' : 'No',
      },
    },
    { sto_id: sto.sto_id },
  );
}

// "Management Approval Granted" — sent when either shipping-site or
// receiving-site management approves. Requires an "sto-management-granted"
// template (subject: "STO Request Approved by Management").
//
// No per-role distribution list exists yet — outside test mode this is
// skipped until one does.
export function sendManagementGrantedEmail(sto: {
  sto_id: string;
  approving_group: string;
  approval_date?: string;
  notes?: string | null;
}): void {
  const destination = resolveDestination(undefined);
  postNotification(
    destination,
    {
      event_id: `sto-management-granted-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} management approval granted`,
      message: 'Management approval has been granted and the request will move to the next processing step.',
      email_template: RELAY_MANAGEMENT_GRANTED_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        approving_group: sto.approving_group,
        approval_date: sto.approval_date ?? '',
        notes: sto.notes ?? '',
      },
    },
    { sto_id: sto.sto_id },
  );
}

// "Management Approval Denied" — sent when either shipping-site or
// receiving-site management rejects. Requires an "sto-management-denied"
// template (subject: "STO Request Denied by Management").
//
// No per-role distribution list exists yet — outside test mode this is
// skipped until one does.
export function sendManagementDeniedEmail(sto: {
  sto_id: string;
  denial_reason?: string | null;
  approving_site?: string;
}): void {
  const destination = resolveDestination(undefined);
  postNotification(
    destination,
    {
      event_id: `sto-management-denied-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} management approval denied`,
      message: 'Management approval was denied. The STO request cannot proceed.',
      email_template: RELAY_MANAGEMENT_DENIED_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        denial_reason: sto.denial_reason ?? '',
        approving_site: sto.approving_site ?? '',
      },
    },
    { sto_id: sto.sto_id },
  );
}

// "Logistics In Progress" — sent when an STO enters SHIPPING_LOGISTICS (i.e.
// Planning approves it). Requires an "sto-logistics-in-progress" template
// (subject: "STO Request in Shipping Logistics Processing").
//
// No per-role distribution list exists yet — outside test mode this is
// skipped until one does.
export function sendLogisticsInProgressEmail(sto: { sto_id: string }): void {
  const destination = resolveDestination(undefined);
  postNotification(
    destination,
    {
      event_id: `sto-logistics-in-progress-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} in shipping logistics processing`,
      message: 'Your STO request is now with Shipping Site Logistics for execution planning.',
      email_template: RELAY_LOGISTICS_IN_PROGRESS_TEMPLATE,
      email_vars: { sto_id: sto.sto_id },
    },
    { sto_id: sto.sto_id },
  );
}

// "Ready to Ship" + "Shipment Executed" — sent together when a logistics
// submission has ready_to_ship=true and the STO moves on to Receiving
// Logistics. The app does not treat these as two distinct actions today, so
// both fire from the same event. Requires "sto-ready-to-ship" (subject: "STO
// Ready to Ship") and "sto-shipment-executed" (subject: "STO Shipment
// Executed") templates on the relay.
//
// No per-role distribution list exists yet — outside test mode both are
// skipped until one does.
export function sendReadyToShipAndExecutedEmails(sto: {
  sto_id: string;
  sto_number?: string | null;
  shipment_id?: string | null;
  scheduled_ship_date?: string | null;
  actual_ship_date?: string | null;
}): void {
  const destination = resolveDestination(undefined);

  postNotification(
    destination,
    {
      event_id: `sto-ready-to-ship-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} ready to ship`,
      message:
        'The STO is ready to ship. All required approvals, documentation, and booking activities have been completed.',
      email_template: RELAY_READY_TO_SHIP_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        sto_number: sto.sto_number ?? '',
        shipment_id: sto.shipment_id ?? '',
        scheduled_ship_date: sto.scheduled_ship_date ?? '',
        shipping_documentation_status: 'Complete',
      },
    },
    { sto_id: sto.sto_id },
  );

  postNotification(
    destination,
    {
      event_id: `sto-shipment-executed-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} shipment executed`,
      message: 'The shipment has been executed and the request has moved to Receiving Site Logistics.',
      email_template: RELAY_SHIPMENT_EXECUTED_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        actual_ship_date: sto.actual_ship_date ?? '',
        shipment_id: sto.shipment_id ?? '',
        tracking_reference: sto.sto_number ?? '',
      },
    },
    { sto_id: sto.sto_id },
  );
}
