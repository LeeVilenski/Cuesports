import { defineConfig } from 'vite';

// Relative base so the lab works at any path (e.g. /lab/ on the Vercel deployment).
export default defineConfig({
  base: './',
  server: { host: true },
});
