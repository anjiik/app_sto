import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Analytics } from './pages/Analytics';
import { STOList } from './pages/STOList';
import { STOForm } from './pages/STOForm';
import { STODetail } from './pages/STODetail';
import { AppInfo } from './pages/AppInfo';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="inline-block w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Analytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sto"
        element={
          <ProtectedRoute>
            <STOList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sto/new"
        element={
          <ProtectedRoute>
            <STOForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sto/:id/edit"
        element={
          <ProtectedRoute>
            <STOForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sto/:id"
        element={
          <ProtectedRoute>
            <STODetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app-info"
        element={
          <ProtectedRoute>
            <AppInfo />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
