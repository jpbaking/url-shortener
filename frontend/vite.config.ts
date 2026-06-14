import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, proxy /api/* to the backend so CORS isn't an issue.
// In production, Nginx handles this proxy instead.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
