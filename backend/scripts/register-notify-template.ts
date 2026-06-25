/**
 * One-time setup: registers the STO completion email template in the notification relay.
 * Run once after notification_relay is deployed:
 *   npx ts-node --transpile-only scripts/register-notify-template.ts
 *
 * Reads NOTIFICATION_RELAY_URL, NOTIFICATION_RELAY_USER, NOTIFICATION_RELAY_PASSWORD from .env
 */
import dotenv from 'dotenv';
dotenv.config();

const url      = process.env.NOTIFICATION_RELAY_URL;
const user     = process.env.NOTIFICATION_RELAY_USER;
const password = process.env.NOTIFICATION_RELAY_PASSWORD;

if (!url || !user || !password) {
  console.error('Set NOTIFICATION_RELAY_URL, NOTIFICATION_RELAY_USER, NOTIFICATION_RELAY_PASSWORD in .env');
  process.exit(1);
}

const creds = Buffer.from(`${user}:${password}`).toString('base64');

const template = {
  template_name: 'sto-completion',
  subject: 'Your STO {{.sto_id}} has been completed',
  body: `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#1e3a5f">STO Delivery Completed</h2>
  <p>Hi {{.requestor_name}},</p>
  <p>Your Stock Transfer Order has been delivered and closed out.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">STO ID</td>
        <td style="padding:8px;border:1px solid #e5e7eb">{{.sto_id}}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Material</td>
        <td style="padding:8px;border:1px solid #e5e7eb">{{.material_sap}} — {{.material_description}}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">From</td>
        <td style="padding:8px;border:1px solid #e5e7eb">{{.shipping_site}}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">To</td>
        <td style="padding:8px;border:1px solid #e5e7eb">{{.receiving_site}}</td></tr>
  </table>
  <p style="color:#6b7280;font-size:13px">This is an automated message from the STO Management System.</p>
</div>
`.trim(),
  required_vars: ['sto_id', 'requestor_name', 'shipping_site', 'receiving_site'],
  description: 'Sent to the STO requestor when their request is delivered and closed',
};

fetch(`${url}/api/v1/templates`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Basic ${creds}` },
  body: JSON.stringify(template),
})
  .then(async res => {
    const body = await res.text();
    if (res.ok) {
      console.log('Template registered successfully:', body);
    } else if (res.status === 409) {
      console.log('Template already exists — no action needed.');
    } else {
      console.error(`Failed (${res.status}):`, body);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Could not reach notification relay:', err.message);
    process.exit(1);
  });
