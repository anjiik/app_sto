import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

interface DemoUser { username: string; password: string; name: string; role: string; plant: string; }

export function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);

  useEffect(() => {
    if (user) navigate('/dashboard');
    api.get('/auth/demo-users').then(r => setDemoUsers(r.data)).catch(() => {});
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  }

  const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    requestor: 'bg-blue-100 text-blue-700',
    inventory_reviewer: 'bg-yellow-100 text-yellow-700',
    management: 'bg-orange-100 text-orange-700',
    finance: 'bg-green-100 text-green-700',
    logistics: 'bg-teal-100 text-teal-700',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl flex gap-8 items-start">
        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">STO Management</h1>
            <p className="text-gray-500 text-sm mt-1">Stock Transfer Order System</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className="text-xs text-center text-gray-400 mt-6">
            Demo mode — Active Directory integration ready
          </p>
        </div>

        {/* Demo users panel */}
        {demoUsers.length > 0 && (
          <div className="flex-1 bg-white/10 backdrop-blur rounded-2xl p-6 text-white">
            <h2 className="font-bold text-lg mb-4">Demo Accounts</h2>
            <div className="grid grid-cols-1 gap-2">
              {demoUsers.map(u => (
                <button
                  key={u.username}
                  onClick={() => { setUsername(u.username); setPassword(u.password); }}
                  className="flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-lg px-4 py-3 transition-colors text-left"
                >
                  <div>
                    <div className="font-medium text-sm">{u.name}</div>
                    <div className="text-xs text-blue-200">{u.username} / {u.password}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-700'}`}>
                    {u.role.replace('_', ' ')}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-blue-300 mt-4">Click a row to auto-fill credentials</p>
          </div>
        )}
      </div>
    </div>
  );
}
