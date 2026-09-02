import { useEffect, useState } from 'react';
import api from '../api/client';
import { Layout } from '../components/Layout';

// URL where users request access to the app (AD group membership). Update this
// to your real access-request form / ticketing link.
const ACCESS_REQUEST_URL = 'https://your-company/access-request?app=STO-Management';

// Development team contacts, shown at the bottom of this page. TEMP placeholder
// values — replace with the real team/contact details before go-live.
const DEVELOPER_TEAM = 'ABC Digital Systems';
const DEVELOPER_CONTACTS = [
  { name: 'Contact 1', role: 'Developer', email: 'contact1@example.com' },
  { name: 'Contact 2', role: 'Developer', email: 'contact2@example.com' },
];

// Path to the user guide. It lives in the frontend public/ folder so it is
// copied verbatim into the build under the app base path. Served as HTML
// (not a pre-printed PDF) so it always reflects the current source file —
// no manual "print to PDF and replace the file" step required to update it.
const USER_GUIDE_URL = `${import.meta.env.BASE_URL}sto-user-guide.html`;

interface AdminContact {
  name: string;
  email: string;
}

export function AppInfo() {
  const [admins, setAdmins] = useState<AdminContact[]>([]);

  useEffect(() => {
    // In DEV_BYPASS mode this lists demo_users with group_key='admin'; in
    // production it queries the real APP-STO_MANAGEMENT_ADMIN AD group. Admin
    // is company-wide (no per-site admin tier), so there's no site to show.
    api
      .get('/auth/admins')
      .then(r => {
        const list = (r.data as { displayName: string; email: string }[]).map(a => ({
          name: a.displayName,
          email: a.email,
        }));
        setAdmins(list);
      })
      .catch(() => setAdmins([]));
  }, []);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">App Information</h1>

        {/* User guide */}
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-800 mb-2">User Guide</h2>
          <p className="text-sm text-gray-600 mb-4">
            A complete, role-by-role guide to the app — the STO lifecycle, creating and submitting
            requests, every approval step, dashboards and queues, filters and export, analytics,
            multi-site access, and admin tasks.
          </p>
          <a
            href={USER_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 font-medium text-sm"
          >
            Open User Guide ↗
          </a>
        </section>

        {/* Access request */}
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-800 mb-2">Requesting Access</h2>
          <p className="text-sm text-gray-600 mb-3">
            Access is granted entirely through Active Directory group membership — there's no
            in-app user management. Creating a new STO needs no group membership at all; groups
            only govern the workflow steps below.
          </p>

          <div className="text-sm text-gray-600 mb-4">
            <p className="mb-2">
              Groups follow the pattern{' '}
              <code className="bg-gray-100 px-1 rounded">APP-{'{SITE}'}-STO_Management_{'{Role}'}</code>,
              one per role per site:
            </p>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden mb-2">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Group suffix
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  ['Planning', 'Shipping Planning'],
                  ['Logistics', 'Shipping Logistics'],
                  ['Logistics_Receiving', 'Receiving Logistics'],
                  ['Management', 'Management (shipping site)'],
                  ['Management_Receiving', 'Receiving Management'],
                ].map(([suffix, role]) => (
                  <tr key={suffix}>
                    <td className="px-3 py-2">
                      <code className="bg-gray-100 px-1 rounded">...{suffix}</code>
                    </td>
                    <td className="px-3 py-2 text-gray-900">{role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Example: <code className="bg-gray-100 px-1 rounded">APP-ABC-STO_Management_Logistics</code>{' '}
              grants Shipping Logistics at site ABC. There's no per-site admin group — admin access
              is a single company-wide group,{' '}
              <code className="bg-gray-100 px-1 rounded">APP-STO_MANAGEMENT_ADMIN</code>.
            </p>
          </div>

          <p className="text-sm text-gray-600 mb-3">
            Submit a request using the link below and include your site(s) and the role(s) you need.
          </p>
          <a
            href={ACCESS_REQUEST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 font-medium text-sm break-all"
          >
            {ACCESS_REQUEST_URL}
          </a>
        </section>

        {/* Admin contacts */}
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-800 mb-3">Administrators</h2>
          <p className="text-sm text-gray-600 mb-4">
            Contact an administrator for access issues, corrections, or to send an STO back a step.
          </p>
          {admins.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              Administrator contacts are managed in Active Directory. Contact your IT service desk.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name', 'Email'].map(h => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map(a => (
                  <tr key={a.email}>
                    <td className="px-3 py-2 text-gray-900">{a.name}</td>
                    <td className="px-3 py-2">
                      <a href={`mailto:${a.email}`} className="text-blue-600 hover:text-blue-800">
                        {a.email}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Developer contacts */}
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-800 mb-1">Developed By</h2>
          <p className="text-sm text-gray-600 mb-4">{DEVELOPER_TEAM}</p>
          <div className="space-y-3">
            {DEVELOPER_CONTACTS.map(c => (
              <div
                key={c.email}
                className="flex items-center justify-between gap-4 border border-gray-100 rounded-lg px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.role}</div>
                </div>
                <a
                  href={`mailto:${c.email}`}
                  className="inline-flex items-center gap-2 bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-900 font-medium text-xs whitespace-nowrap"
                >
                  Email {c.name}
                </a>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
