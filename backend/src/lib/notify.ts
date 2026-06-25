import logger from './logger';

const RELAY_URL      = process.env.NOTIFICATION_RELAY_URL;
const RELAY_USER     = process.env.NOTIFICATION_RELAY_USER;
const RELAY_PASS     = process.env.NOTIFICATION_RELAY_PASSWORD;
const RELAY_TEMPLATE = process.env.NOTIFICATION_RELAY_TEMPLATE || 'sto-completion';

function configured(): boolean {
  return Boolean(RELAY_URL && RELAY_USER && RELAY_PASS);
}

// Fire-and-forget — call without await so a relay failure never blocks the caller.
// Logs an error if the relay is reachable but returns a non-2xx response.
export function sendStoCompletedEmail(sto: {
  sto_id:               string;
  requestor_name:       string;
  requestor_email:      string;
  shipping_site?:       string;
  receiving_site?:      string;
  material_description?: string;
  material_sap?:        string;
}): void {
  if (!configured() || !sto.requestor_email) return;

  const creds = Buffer.from(`${RELAY_USER}:${RELAY_PASS}`).toString('base64');

  fetch(`${RELAY_URL}/api/v1/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${creds}`,
    },
    body: JSON.stringify({
      event_id:    `sto-closed-${sto.sto_id}`,
      event_name:  `STO ${sto.sto_id} completed`,
      message:     `STO ${sto.sto_id} has been delivered and closed.`,
      destinations: [{ channel: 'email', target: sto.requestor_email }],
      email_template: RELAY_TEMPLATE,
      email_vars: {
        sto_id:               sto.sto_id,
        requestor_name:       sto.requestor_name,
        shipping_site:        sto.shipping_site  ?? '',
        receiving_site:       sto.receiving_site ?? '',
        material_description: sto.material_description ?? '',
        material_sap:         sto.material_sap   ?? '',
      },
    }),
  })
    .then(res => {
      if (!res.ok) {
        res.text().then(body =>
          logger.error({ status: res.status, body, sto_id: sto.sto_id }, 'notification relay error'),
        );
      }
    })
    .catch(err => logger.error({ err, sto_id: sto.sto_id }, 'notification relay unreachable'));
}
