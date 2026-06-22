import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Group } from '../types';

interface AppUser {
  id: number;
  ad_username: string;
  display_name: string;
  email: string | null;
  site: string | null;
  app_group: Group;
  is_active: boolean;
  created_at: string;
}

interface Site {
  code: string;
  name: string;
}

const GROUP_OPTIONS: { value: Group; label: string }[] = [
  { value: 'receiving_site',      label: 'Receiving Site' },
  { value: 'shipping_planning',   label: 'Shipping Planning' },
  { value: 'shipping_logistics',  label: 'Shipping Logistics' },
  { value: 'management',          label: 'Management' },
  { value: 'finance',             label: 'Finance' },
  { value: 'receiving_logistics', label: 'Receiving Logistics' },
  { value: 'admin',               label: 'Admin' },
];

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<AppUser[]>('/users'),
      api.get<Site[]>('/sites'),
    ])
      .then(([usersRes, sitesRes]) => {
        setUsers(usersRes.data);
        setSites(sitesRes.data);
      })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  async function updateUser(id: number, patch: Partial<Pick<AppUser, 'site' | 'app_group' | 'is_active'>>) {
    setSaving(id);
    setError('');
    try {
      const r = await api.put<AppUser>(`/users/${id}`, patch);
      setUsers(prev => prev.map(u => u.id === id ? r.data : u));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update user.');
    } finally {
      setSaving(null);
    }
  }

  if (!currentUser || currentUser.group !== 'admin') {
    return (
      <Layout>
        <p className="text-red-600 font-medium">Access denied. Admin role required.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Role and site changes take effect on the user's next login.
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Username</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Site</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => {
                  const isSaving = saving === u.id;
                  const isSelf = currentUser.userId === u.id;
                  return (
                    <tr key={u.id} className={`${!u.is_active ? 'bg-gray-50 text-gray-400' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {u.display_name}
                        {isSelf && <span className="ml-2 text-xs text-blue-600">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{u.ad_username}</td>

                      {/* Site */}
                      <td className="px-4 py-3">
                        <select
                          value={u.site ?? ''}
                          disabled={isSaving}
                          onChange={e => updateUser(u.id, { site: e.target.value || null })}
                          className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        >
                          <option value="">— Pending setup —</option>
                          {sites.map(s => (
                            <option key={s.code} value={s.code}>{s.code}</option>
                          ))}
                        </select>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <select
                          value={u.app_group}
                          disabled={isSaving || (isSelf && u.app_group === 'admin')}
                          onChange={e => updateUser(u.id, { app_group: e.target.value as Group })}
                          className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                        >
                          {GROUP_OPTIONS.map(g => (
                            <option key={g.value} value={g.value}>{g.label}</option>
                          ))}
                        </select>
                      </td>

                      {/* Active toggle */}
                      <td className="px-4 py-3">
                        <button
                          disabled={isSaving || isSelf}
                          onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${u.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${u.is_active ? 'translate-x-4.5' : 'translate-x-1'}`}
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {users.length === 0 && (
              <p className="text-center text-gray-400 py-12">No users found.</p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
