// Shared constants used on both the Login page and the App Info page, so
// there's one place to update the real values before go-live.

// URL where users request access to the app (AD group membership). Update this
// to your real access-request form / ticketing link.
export const ACCESS_REQUEST_URL = 'https://your-company/access-request?app=STO-Management';

// Development team contacts. TEMP placeholder values — replace with the real
// team/contact details before go-live.
export const DEVELOPER_TEAM = 'ABC Digital Systems';
export const DEVELOPER_CONTACTS = [
  { name: 'Contact 1', role: 'Developer', email: 'contact1@example.com' },
  { name: 'Contact 2', role: 'Developer', email: 'contact2@example.com' },
];
