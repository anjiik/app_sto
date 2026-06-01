import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { PingCallback } from './pages/PingCallback';
import { Dashboard } from './pages/Dashboard';
import { Analytics } from './pages/Analytics';
import { STOList } from './pages/STOList';
import { STOForm } from './pages/STOForm';
import { STODetail } from './pages/STODetail';
import api from './api/client';

// Shown when unauthenticated and NOT in dev bypass mode.
// Redirects to PingFederate if configured, or to /login for LDAP mode.
function PingRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    api.get('/auth/ping-login-url')
      .then(r => {
        if (r.data.url) {
          sessionStorage.setItem('ping_oauth_state', r.data.state);
          window.location.href = r.data.url;
        } else {
          // ldapMode or devBypass — show the regular login form
          navigate('/login', { replace: true });
        }
      })
      .catch(() => navigate('/login', { replace: true }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500 text-sm">Redirecting to sign-in…</p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="inline-block w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, devBypassMode } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return devBypassMode ? <Navigate to="/login" replace /> : <PingRedirect />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading, devBypassMode } = useAuth();
  const navigate = useNavigate();

  // Once loading is done, if there's no user and we're in dev mode, go to login
  useEffect(() => {
    if (!loading && !user && devBypassMode) {
      navigate('/login', { replace: true });
    }
  }, [loading, user, devBypassMode]);

  if (loading) return <Spinner />;

  return (
    <Routes>
      {/* Ping OIDC callback */}
      <Route path="/auth/callback" element={<PingCallback />} />

      {/* Dev bypass login */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* Protected app routes */}
      <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/analytics"  element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/sto"        element={<ProtectedRoute><STOList /></ProtectedRoute>} />
      <Route path="/sto/new"    element={<ProtectedRoute><STOForm /></ProtectedRoute>} />
      <Route path="/sto/:id"    element={<ProtectedRoute><STODetail /></ProtectedRoute>} />

      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : (devBypassMode ? <Navigate to="/login" replace /> : <PingRedirect />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
