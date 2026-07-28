import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  ldapMode: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('sto_token'));
  const [loading, setLoading] = useState(true);
  const [ldapMode, setLdapMode] = useState(false);

  // Determine auth mode once on mount — controls login page hint text
  useEffect(() => {
    api
      .get('/auth/ping-login-url')
      .then(r => {
        setLdapMode(r.data.ldapMode === true);
      })
      .catch(() => {});
  }, []);

  // Validate existing token or finish loading
  useEffect(() => {
    if (token) {
      api
        .get('/auth/me')
        .then(r => setUser(r.data))
        .catch(() => {
          localStorage.removeItem('sto_token');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  function storeSession(newToken: string, newUser: User) {
    localStorage.setItem('sto_token', newToken);
    setToken(newToken);
    setUser(newUser);
  }

  async function login(username: string, password: string) {
    const r = await api.post('/auth/login', { username, password });
    storeSession(r.data.token, r.data.user);
  }

  function logout() {
    localStorage.removeItem('sto_token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, ldapMode, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
