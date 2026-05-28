import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function PingCallback() {
  const [searchParams] = useSearchParams();
  const { exchangePingCode } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    // Strict Mode fires effects twice in dev — guard against double-exchange
    if (ran.current) return;
    ran.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const savedState = sessionStorage.getItem('ping_oauth_state');

    if (!code) {
      setError('No authorization code returned from PingFederate.');
      return;
    }

    if (state !== savedState) {
      setError('State mismatch — possible CSRF attempt. Please try signing in again.');
      return;
    }

    sessionStorage.removeItem('ping_oauth_state');

    exchangePingCode(code)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(err => setError(err.message || 'Authentication failed. Please try again.'));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mb-4">
            <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Sign-in failed</h2>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="bg-blue-700 hover:bg-blue-800 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500 text-sm">Completing sign-in…</p>
      </div>
    </div>
  );
}
