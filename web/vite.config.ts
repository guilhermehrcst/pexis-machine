import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves this repository from /pexis-machine/. Keep local dev at /.
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js alone is ~600 kB minified; split vendors so they cache
    // independently of the app.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom', 'react-dom/client'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
