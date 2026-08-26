import logger from './logger';

const RELAY_URL = process.env.NOTIFICATION_RELAY_URL;
const RELAY_USER = process.env.NOTIFICATION_RELAY_USER;
const RELAY_PASS = process.env.NOTIFICATION_RELAY_PASSWORD;
const RELAY_TEMPLATE = process.env.NOTIFICATION_RELAY_TEMPLATE || 'sto-completion';
const RELAY_SUBMITTED_TEMPLATE = process.env.NOTIFICATION_RELAY_SUBMITTED_TEMPLATE || 'sto-submitted';

// TESTING ONLY — every "STO submitted" email is redirected to this address
// instead of the real requestor, so the relay + template can be verified
// without emailing anyone for real. Remove TEST_NOTIFICATION_OVERRIDE (or
// unset it) once ready to send to the actual requestor_email.
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
