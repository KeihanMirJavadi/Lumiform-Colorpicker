import { defineConfig } from 'vite';

/**
 * Builds the existing web app into `plugin/web`, where the UXP panel loads it
 * through a local WebView. The output is post-processed into a single HTML file
 * by `scripts/inline-plugin-build.mjs` so the `plugin:/` origin never has to
 * resolve a separate ES-module graph or asset requests.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'plugin/web',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 100 * 1024 * 1024,
    chunkSizeWarningLimit: 2000,
  },
});
