import { defineConfig } from 'vite';

// Everything under public/ (sw.js, manifest.json, icons, og-image.png, and
// the standalone privacy/terms/impressum pages) is copied to dist/ as-is —
// none of it needs Vite's JS/CSS asset pipeline. index.html, src/main.js,
// and src/styles.css are the only things actually built.
export default defineConfig({
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
