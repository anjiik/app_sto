import axios from 'axios';

// Default API path is prefixed with the app's base (/sto/) so requests go to
// /sto/api and flow through the same IIS ^sto/(.*) reverse-proxy rule.
// Override with VITE_API_URL at build time if the backend is exposed elsewhere.
// Hardcoded rather than derived from import.meta.env.BASE_URL — that variable
// wasn't resolving to /sto/ in production builds on the deploy server, even
// though vite.config.ts's base: '/sto/' looked correct.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/sto/api',
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('sto_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sto_token');
      window.location.href = '/sto/login';
    }
    return Promise.reject(err);
  },
);

export default api;
