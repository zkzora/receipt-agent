import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The verify console talks to the running receipt-agent (Fastify, default :8787).
 * We proxy `/api/*` → the backend's `/dev/*` routes so the browser stays same-origin
 * (no CORS, custom `x-receipt-*` headers readable). Override the target with
 * VITE_API_TARGET when the agent runs elsewhere.
 */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/dev'),
      },
      '/health': { target: API_TARGET, changeOrigin: true },
    },
  },
});
