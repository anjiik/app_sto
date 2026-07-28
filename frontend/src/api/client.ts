import axios from 'axios';

// Default API path is prefixed with the app's base (/sto/) so requests go to
// /sto/api and flow through the same IIS ^sto/(.*) reverse-proxy rule.
// Override with VITE_API_URL at build time if the backend is exposed elsewhere.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`,
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
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;
