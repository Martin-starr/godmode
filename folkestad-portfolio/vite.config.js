import { defineConfig } from 'vite';

// Static single-page build. Deploys to the domain root (folkestad.design),
// so the default base '/' is correct. public/assets/* are referenced with
// absolute /assets/... paths and copied verbatim into dist/.
export default defineConfig({
  build: {
    target: 'es2019',
    assetsInlineLimit: 2048
  },
  server: {
    host: true
  }
});
