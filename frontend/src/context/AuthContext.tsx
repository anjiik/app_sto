import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  devBypassMode: boolean; // true in demo mode OR ldap mode — both show the login form
  ldapMode: boolean;      // true when AD/LDAP auth is active (hides demo cards)
  login: (username: string, password: string) => Promise<void>;
  exchangePingCode: (code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('sto_token'));
  const [loading, setLoading] = useState(true);
  const [devBypassMode, setDevBypassMode] = useState(false);
  const [ldapMode, setLdapMode] = useState(false);

  // Determine auth mode once on mount — always runs regardless of token state
  useEffect(() => {
    api.get('/auth/ping-login-url')
      .then(r => {
        const isDevBypass = r.data.devBypass === true;
        const isLdap      = r.data.ldapMode   === true;
        setLdapMode(isLdap);
        setDevBypassMode(isDevBypass || isLdap); // both modes use the login form
      })
      .catch(() => {});
  }, []);

  // Validate existing token or finish loading
  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then(r => setUser(r.data))
        .catch(() => { localStorage.removeItem('sto_token'); setToken(null); })
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

  async function exchangePingCode(code: string) {
    const r = await api.post('/auth/ping-exchange', { code });
    storeSession(r.data.token, r.data.user);
  }

  function logout() {
    localStorage.removeItem('sto_token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, devBypassMode, ldapMode, login, exchangePingCode, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
