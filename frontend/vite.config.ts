import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // App is served under /sto/ (IIS reverse-proxies ^sto/(.*) to this site).
  // This makes built asset URLs resolve to /sto/assets/... instead of /assets/...
  base: '/sto/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/sto/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/sto\/api/, '/api'),
      },
    },
  },
});
