import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Analytics } from './pages/Analytics';
import { STOList } from './pages/STOList';
import { STOForm } from './pages/STOForm';
import { STODetail } from './pages/STODetail';
import { SitePicker } from './pages/SitePicker';
import { UserManagement } from './pages/UserManagement';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="inline-block w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Redirects unauthenticated users to /login.
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Redirects users who haven't picked a site yet to /setup-site.
function SiteRequired({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.site) return <Navigate to="/setup-site" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* Site setup — authenticated but no site assigned yet */}
      <Route path="/setup-site" element={<ProtectedRoute><SitePicker /></ProtectedRoute>} />

      {/* Admin-only */}
      <Route path="/users" element={<ProtectedRoute><SiteRequired><UserManagement /></SiteRequired></ProtectedRoute>} />

      {/* Main app — requires both auth and site */}
      <Route path="/dashboard"  element={<ProtectedRoute><SiteRequired><Dashboard /></SiteRequired></ProtectedRoute>} />
      <Route path="/analytics"  element={<ProtectedRoute><SiteRequired><Analytics /></SiteRequired></ProtectedRoute>} />
      <Route path="/sto"        element={<ProtectedRoute><SiteRequired><STOList /></SiteRequired></ProtectedRoute>} />
      <Route path="/sto/new"      element={<ProtectedRoute><SiteRequired><STOForm /></SiteRequired></ProtectedRoute>} />
      <Route path="/sto/:id/edit" element={<ProtectedRoute><SiteRequired><STOForm /></SiteRequired></ProtectedRoute>} />
      <Route path="/sto/:id"      element={<ProtectedRoute><SiteRequired><STODetail /></SiteRequired></ProtectedRoute>} />

      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
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
