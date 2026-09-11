import logger from './logger';
import { Group } from '../types';
import { groupCNFor, listGroupMembers } from './ldap';

// Formats a DECIMAL column value (freight_cost, material_value, quantity,
// etc.) for a plain-text/HTML email — mssql/msnodesqlv8 can hand back
// DECIMAL columns as either a string or a number depending on the value's
// magnitude, and passing the raw value straight into email_vars risks the
// relay's own template substitution rendering it in scientific notation
// (e.g. "1.2345678e+07" instead of "12,345,678") for larger amounts.
// toLocaleString() always produces a plain, comma-grouped decimal string
// regardless of the input's original type or magnitude.
function formatDecimal(value: number | string | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n)) return '';
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

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

// Resolves a single known real address (e.g. the requestor's own email) to
// an actual destination. In test mode, always the override; otherwise the
// real address if one was given, or null (skip) if not. For a whole
// role/site group instead of one known address, see
// resolveGroupDestinations() below.
function resolveDestination(realEmail: string | undefined | null): string | null {
  if (TEST_MODE) return TEST_NOTIFICATION_OVERRIDE;
  return realEmail || null;
}

// Resolves every real email address for a role+site (e.g. "Shipping
// Planning at ABC") by looking up the matching AD group and querying its
// members — reuses the same listGroupMembers() the App Info page's admin
// contacts list already relies on, via the group's CN from GROUP_MAP's
// reverse index (groupCNFor). In test mode, returns just the override
// address (one notification, not one per real group member) — this also
// means the group->AD lookup is skipped entirely in test mode, so it works
// the same in DEV_BYPASS/no-LDAP setups as every other notification here.
// Returns [] (skip, not throw) if the group can't be resolved or the AD
// query fails — a notification going out late/never is preferable to a
// workflow action failing because a distribution list lookup broke.
async function resolveGroupDestinations(group: Group, site: string): Promise<string[]> {
  if (TEST_MODE) return [TEST_NOTIFICATION_OVERRIDE];
  const groupCN = groupCNFor(group, site);
  if (!groupCN) {
    logger.warn({ group, site }, 'no AD group mapped for this role+site — notification skipped');
    return [];
  }
  try {
    const members = await listGroupMembers(groupCN);
    return members.map(m => m.email).filter((email): email is string => Boolean(email));
  } catch (err) {
    logger.error({ group, site, groupCN, err }, 'failed to resolve group members for notification');
    return [];
  }
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

// Same as postNotification, but for a whole group of recipients — sends one
// notification per address rather than a single call with multiple
// destinations, since the relay's /notifications endpoint (per the payload
// shape above) takes one destination per call. If the group resolves to zero
// addresses (unmapped role+site, or an AD lookup failure — see
// resolveGroupDestinations), this is a no-op, same as a single skipped send.
function postGroupNotification(
  destinations: string[],
  payload: Record<string, unknown>,
  logCtx: Record<string, unknown>,
): void {
  if (destinations.length === 0) {
    logger.info({ ...logCtx }, 'group notification skipped — no recipients resolved');
    return;
  }
  for (const destination of destinations) {
    postNotification(destination, payload, logCtx);
  }
}

// "STO Receipt Confirmed and Closed" — sent when Receiving Site Logistics
// confirms actual receipt and closes out delivery (5) Receiving Site
// Logistics / Receipt Closeout). Replaces the previous STO-completion email;
// this is now the sole "STO closed" notification, per spec recipients:
// Requestor, Receiving Site Logistics, Shipping Site Logistics, Planning.
// Requires an "sto-receipt-closed" template on the relay (subject: "STO
// Receipt Confirmed and Closed").
//
// Sent to the requestor plus every member of Receiving Logistics (at
// receiving_site), Shipping Logistics (at shipping_site), and Planning (at
// shipping_site) — resolved via resolveGroupDestinations() for the three
// groups, matching the spec recipients in the comment above.
export async function sendReceiptClosedEmail(sto: {
  sto_id: string;
  requestor_email?: string | null;
  shipping_site?: string;
  receiving_site?: string;
  actual_receipt_date?: string | null;
  sto_number?: string | null;
  delivery_closed_out?: boolean;
}): Promise<void> {
  const groupLookups: Promise<string[]>[] = [];
  if (sto.receiving_site) groupLookups.push(resolveGroupDestinations('receiving_logistics', sto.receiving_site));
  if (sto.shipping_site) groupLookups.push(resolveGroupDestinations('shipping_logistics', sto.shipping_site));
  if (sto.shipping_site) groupLookups.push(resolveGroupDestinations('shipping_planning', sto.shipping_site));
  const groupResults = await Promise.all(groupLookups);
  const destinations = [
    resolveDestination(sto.requestor_email),
    ...groupResults.flat(),
  ].filter((d): d is string => Boolean(d));
  postGroupNotification(
    destinations,
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
// Sent to every member of the shipping site's Planning and Logistics AD
// groups outside test mode, resolved via resolveGroupDestinations().
export async function sendStoAwaitingPlanningEmail(sto: {
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
}): Promise<void> {
  if (!sto.shipping_site) return;
  const [planning, logistics] = await Promise.all([
    resolveGroupDestinations('shipping_planning', sto.shipping_site),
    resolveGroupDestinations('shipping_logistics', sto.shipping_site),
  ]);
  postGroupNotification(
    [...planning, ...logistics],
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
        di_value: formatDecimal(sto.di_value),
        material_sap: sto.material_sap ?? '',
        material_description: sto.material_description ?? '',
        brand_at_receiving_site: sto.brand_at_receiving_site ?? '',
        inco_terms: sto.inco_terms ?? '',
        quantity: formatDecimal(sto.quantity, 4),
        uom: sto.uom ?? '',
        shipping_conditions: sto.shipping_conditions ?? '',
        material_value: formatDecimal(sto.material_value),
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
// Always sent to the requestor. On approval, also fans out to Shipping
// Logistics at shipping_site — that's who the STO moves to next; revise/
// reject are dead ends back to the requestor only, so no group lookup runs
// for those outcomes.
export async function sendPlanningReviewEmail(
  outcome: 'approve' | 'revise' | 'reject',
  sto: {
    sto_id: string;
    requestor_email?: string | null;
    shipping_site?: string;
    mpn_number?: string | null;
    batch_number?: string | null;
    expiration_date?: string | null;
    notes?: string | null;
  },
): Promise<void> {
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

  const destinations = [resolveDestination(sto.requestor_email)].filter(
    (d): d is string => Boolean(d),
  );
  if (outcome === 'approve' && sto.shipping_site) {
    destinations.push(...(await resolveGroupDestinations('shipping_logistics', sto.shipping_site)));
  }
  postGroupNotification(
    destinations,
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
// Sent to every member of the shipping site's Management AD group outside
// test mode, resolved via resolveGroupDestinations().
export async function sendManagementRequestedEmail(sto: {
  sto_id: string;
  shipping_site?: string;
  approval_reasons?: string;
  freight_cost?: number | null;
  material_value?: number | null;
  shipment_ratio?: string;
  shipping_conditions?: string;
  rush_reason?: string | null;
  controlled_shipping_required?: boolean;
}): Promise<void> {
  if (!sto.shipping_site) return;
  const destinations = await resolveGroupDestinations('management', sto.shipping_site);
  postGroupNotification(
    destinations,
    {
      event_id: `sto-management-requested-${sto.sto_id}-${Date.now()}`,
      event_name: `STO ${sto.sto_id} requires management approval`,
      message: 'Your STO request requires management review before it can proceed.',
      email_template: RELAY_MANAGEMENT_REQUESTED_TEMPLATE,
      email_vars: {
        sto_id: sto.sto_id,
        approval_reasons: sto.approval_reasons ?? '',
        freight_cost: formatDecimal(sto.freight_cost),
        material_value: formatDecimal(sto.material_value),
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
// Always sent to the requestor. When the RECEIVING-side management approval
// is what just happened (both managements have now signed off), also fans
// out to Shipping Logistics at shipping_site — the STO returns there next.
// Pass notify_logistics_at_shipping_site only for that second approval; the
// first (shipping-side) approval just informs the requestor, since the next
// actor (Receiving Management) is a human approval step, not a notification.
export async function sendManagementGrantedEmail(sto: {
  sto_id: string;
  requestor_email?: string | null;
  approving_group: string;
  approval_date?: string;
  notes?: string | null;
  notify_logistics_at_shipping_site?: string;
}): Promise<void> {
  const destinations = [resolveDestination(sto.requestor_email)].filter(
    (d): d is string => Boolean(d),
  );
  if (sto.notify_logistics_at_shipping_site) {
    destinations.push(
      ...(await resolveGroupDestinations('shipping_logistics', sto.notify_logistics_at_shipping_site)),
    );
  }
  postGroupNotification(
    destinations,
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
// Sent to the requestor — a denial is a dead end, so they're the only one
// who needs to know.
export function sendManagementDeniedEmail(sto: {
  sto_id: string;
  requestor_email?: string | null;
  denial_reason?: string | null;
  approving_site?: string;
}): void {
  const destination = resolveDestination(sto.requestor_email);
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
// Sent to every member of the shipping site's Logistics AD group outside
// test mode, resolved via resolveGroupDestinations().
export async function sendLogisticsInProgressEmail(sto: {
  sto_id: string;
  shipping_site?: string;
}): Promise<void> {
  if (!sto.shipping_site) return;
  const destinations = await resolveGroupDestinations('shipping_logistics', sto.shipping_site);
  postGroupNotification(
    destinations,
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
// Sent to every member of the receiving site's Logistics AD group outside
// test mode, resolved via resolveGroupDestinations() — that's who the STO
// moves on to.
export async function sendReadyToShipAndExecutedEmails(sto: {
  sto_id: string;
  receiving_site?: string;
  sto_number?: string | null;
  shipment_id?: string | null;
  scheduled_ship_date?: string | null;
  actual_ship_date?: string | null;
}): Promise<void> {
  if (!sto.receiving_site) return;
  const destinations = await resolveGroupDestinations('receiving_logistics', sto.receiving_site);

  postGroupNotification(
    destinations,
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

  postGroupNotification(
    destinations,
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
