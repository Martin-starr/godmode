import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Multi-page: Martin's app is built to /martin/. Mathias's static app and all
// PWA assets live in public/ and pass through to the dist root untouched.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        martin: resolve(__dirname, 'martin/index.html'),
      },
    },
  },
});
