// Shared constants used on both the Login page and the App Info page, so
// there's one place to update the real values before go-live.

// URL where users request access to the app (AD group membership). Update this
// to your real access-request form / ticketing link.
export const ACCESS_REQUEST_URL = 'https://your-company/access-request?app=STO-Management';

// Short PDF companion to the access-request flow — which group to ask for,
// matched to what you'll actually be doing. Unlike the user guide, this is
// pre-printed (not served as live HTML) since it's short enough that keeping
// a matching .html source in sync isn't worth the extra build step;
// re-export sto-access-guide.html → .pdf by hand if the content changes.
export const ACCESS_GUIDE_URL = `${import.meta.env.BASE_URL}sto-access-guide.pdf`;

// Development team contacts. TEMP placeholder values — replace with the real
// team/contact details before go-live.
export const DEVELOPER_TEAM = 'ABC Digital Systems';
export const DEVELOPER_CONTACTS = [
  { name: 'Contact 1', role: 'Developer', email: 'contact1@example.com' },
  { name: 'Contact 2', role: 'Developer', email: 'contact2@example.com' },
];
