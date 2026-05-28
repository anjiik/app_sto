import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Group } from '../types';

interface DemoUser {
  username: string;
  password: string;
  displayName: string;
  site: string;
  group: Group;
  groupLabel: string;
}

const GROUP_COLORS: Record<Group, string> = {
  receiving_site:     'bg-blue-100 text-blue-800',
  shipping_planning:  'bg-amber-100 text-amber-800',
  shipping_logistics: 'bg-teal-100 text-teal-800',
  management:         'bg-purple-100 text-purple-800',
  finance:            'bg-green-100 text-green-800',
  receiving_logistics:'bg-orange-100 text-orange-800',
};

const SITE_COLORS: Record<string, string> = {
  ABC: 'bg-indigo-600',
  ABL: 'bg-cyan-600',
  XYZ: 'bg-rose-600',
};

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [filterSite, setFilterSite] = useState<string>('ALL');

  useEffect(() => {
    api.get('/auth/demo-users').then(r => setDemoUsers(r.data)).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  }

  function autofill(u: DemoUser) {
    setUsername(u.username);
    setPassword(u.password);
    setError('');
  }

  const sites = ['ALL', ...Array.from(new Set(demoUsers.map(u => u.site))).sort()];
  const filtered = filterSite === 'ALL' ? demoUsers : demoUsers.filter(u => u.site === filterSite);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-800 flex items-start justify-center p-6 pt-16">
      <div className="w-full max-w-5xl flex gap-6 items-start">

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-80 flex-shrink-0">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-full mb-4">
              <svg className="w-7 h-7 text-blue-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">STO Management</h1>
            <p className="text-gray-400 text-sm mt-1">Stock Transfer Order System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. abc.recv"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-xs text-center text-gray-400 mt-6">
            Dev mode — click any account on the right to auto-fill
          </p>
        </div>

        {/* Demo accounts panel */}
        {demoUsers.length > 0 && (
          <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-2xl p-5 text-white min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">Demo Accounts</h2>
              {/* Site filter tabs */}
              <div className="flex gap-1">
                {sites.map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterSite(s)}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                      filterSite === s
                        ? 'bg-white text-blue-900'
                        : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filtered.map(u => (
                <button
                  key={u.username}
                  onClick={() => autofill(u)}
                  className="flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-xl px-4 py-3 transition-colors text-left w-full"
                >
                  {/* Site badge */}
                  <span className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white ${SITE_COLORS[u.site] || 'bg-gray-600'}`}>
                    {u.site}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{u.displayName}</div>
                    <div className="text-xs text-blue-200 truncate">{u.username} / {u.password}</div>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${GROUP_COLORS[u.group]}`}>
                    {u.groupLabel.split(' ').slice(-1)[0]}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-xs text-blue-300 mt-4">
              All accounts use password <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">Demo123!</span> — click a row to auto-fill
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
