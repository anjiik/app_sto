import { useEffect, useState } from 'react';
import api from '../api/client';
import { Layout } from '../components/Layout';

// URL where users request access to the app (AD group membership). Update this
// to your real access-request form / ticketing link.
const ACCESS_REQUEST_URL = 'https://your-company/access-request?app=STO-Management';

// Path to the user guide PDF. It lives in the frontend public/ folder so it is
// copied verbatim into the build under the app base path.
const USER_GUIDE_URL = `${import.meta.env.BASE_URL}sto-user-guide.pdf`;

interface AdminContact { name: string; email: string; site: string; }

export function AppInfo() {
  const [admins, setAdmins] = useState<AdminContact[]>([]);

  useEffect(() => {
    // In dev-bypass mode /auth/demo-users lists the demo accounts; pull the admins
    // out of it so testers know who to contact. Returns [] in production (LDAP).
    api.get('/auth/demo-users')
      .then(r => {
        const list = (r.data as { displayName: string; group: string; site: string; username: string }[])
          .filter(u => u.group === 'admin')
          .map(u => ({ name: u.displayName, email: `${u.username}@demo.local`, site: u.site }));
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
            A complete, role-by-role guide to the app — the STO lifecycle, creating and
            submitting requests, every approval step, dashboards and queues, filters and
            export, analytics, multi-site access, and admin tasks.
          </p>
          <a
            href={USER_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 font-medium text-sm"
          >
            ↓ Download User Guide (PDF)
          </a>
        </section>

        {/* Access request */}
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-800 mb-2">Requesting Access</h2>
          <p className="text-sm text-gray-600 mb-3">
            Access is granted through Active Directory group membership for your site and role
            (e.g. <code className="bg-gray-100 px-1 rounded">ABC_LOGISTICS</code>). Submit a request
            using the link below and include your site(s) and the role you need.
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
                  {['Name', 'Email', 'Site'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map(a => (
                  <tr key={a.email}>
                    <td className="px-3 py-2 text-gray-900">{a.name}</td>
                    <td className="px-3 py-2">
                      <a href={`mailto:${a.email}`} className="text-blue-600 hover:text-blue-800">{a.email}</a>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{a.site}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </Layout>
  );
}
