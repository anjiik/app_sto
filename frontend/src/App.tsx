import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GroupSelector } from './pages/GroupSelector';
import { Dashboard } from './pages/Dashboard';
import { STOList } from './pages/STOList';
import { STOForm } from './pages/STOForm';
import { STODetail } from './pages/STODetail';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (!user) return <Navigate to="/select-group" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/select-group" element={user ? <Navigate to="/dashboard" /> : <GroupSelector />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/sto" element={<ProtectedRoute><STOList /></ProtectedRoute>} />
      <Route path="/sto/new" element={<ProtectedRoute><STOForm /></ProtectedRoute>} />
      <Route path="/sto/:id" element={<ProtectedRoute><STODetail /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="*" element={<Navigate to="/dashboard" />} />
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
