import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const apiPort = Number(process.env.API_PORT || 3001);

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'client/src') } },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.VITE_PORT || 5000),
    allowedHosts: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
  build: { outDir: '../dist/client', emptyOutDir: true },
  test: undefined as never,
});
