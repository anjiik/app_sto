import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Group } from '../types';

const GROUP_LABELS: Record<Group, string> = {
  shipping_planning: 'Shipping Planning',
  shipping_logistics: 'Shipping Logistics',
  management: 'Shipping Management',
  receiving_management: 'Receiving Management',
  receiving_logistics: 'Receiving Logistics',
  admin: 'Admin',
};

const GROUP_COLORS: Record<Group, string> = {
  shipping_planning: 'bg-amber-600',
  shipping_logistics: 'bg-teal-600',
  management: 'bg-purple-700',
  receiving_management: 'bg-fuchsia-700',
  receiving_logistics: 'bg-orange-600',
  admin: 'bg-red-700',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, ldapMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function handleSwitch() {
    logout();
    navigate('/login', { replace: true });
  }

  // Creating an STO requires no specific role — any authenticated user can.
  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/sto', label: 'All STOs' },
    { to: '/analytics', label: 'Analytics' },
    { to: '/sto/new', label: 'New Request' },
    { to: '/app-info', label: 'App Info' },
  ];

  const groupColor = user ? GROUP_COLORS[user.group] : 'bg-blue-900';

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <span className="font-bold text-lg tracking-wide">STO Management</span>
              <div className="hidden md:flex gap-1">
                {navLinks.map(link => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      location.pathname === link.to
                        ? 'bg-blue-700 text-white'
                        : 'text-blue-100 hover:bg-blue-800'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {user && (
                <div
                  className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg ${groupColor}`}
                >
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-white/70">·</span>
                  <span className="text-xs text-white/80">{GROUP_LABELS[user.group]}</span>
                </div>
              )}
              <button
                onClick={handleSwitch}
                className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded text-sm transition-colors border border-white/20"
              >
                {ldapMode ? 'Sign Out' : 'Switch Group'}
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
