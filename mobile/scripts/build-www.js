#!/usr/bin/env node
// Copies the web app's static files into mobile/www/ (Capacitor's webDir)
// and injects the production API base URL so the chat feature works from
// inside the native app shell, where there is no same-origin Netlify
// function to call.
//
// Usage:
//   CAPACITOR_API_BASE=https://your-site.netlify.app npm run build:www

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WWW_DIR = path.resolve(__dirname, '..', 'www');

const FILES_TO_COPY = [
  'sw.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon.svg',
  'og-image.png',
];

const apiBase = process.env.CAPACITOR_API_BASE;
if (!apiBase) {
  console.error(
    '\nCAPACITOR_API_BASE is not set.\n' +
    'The native app has no same-origin server to call for the chat feature, ' +
    'so it needs the full URL of your deployed Netlify site, e.g.:\n\n' +
    '  CAPACITOR_API_BASE=https://waha-app.netlify.app npm run build:www\n\n' +
    'Refusing to build www/ without it — shipping without this would silently ' +
    'break the chat feature in the native app.\n'
  );
  process.exit(1);
}
if (!/^https:\/\//.test(apiBase)) {
  console.error(`CAPACITOR_API_BASE must be a full https:// URL, got: ${apiBase}`);
  process.exit(1);
}

fs.rmSync(WWW_DIR, { recursive: true, force: true });
fs.mkdirSync(WWW_DIR, { recursive: true });

for (const file of FILES_TO_COPY) {
  const src = path.join(REPO_ROOT, file);
  if (!fs.existsSync(src)) {
    console.warn(`Skipping missing file: ${file}`);
    continue;
  }
  fs.copyFileSync(src, path.join(WWW_DIR, file));
}

let html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

// Inject window.CAPACITOR_API_BASE before the app's own <script> block so
// it's set by the time API_BASE is computed (see index.html's
// `const API_BASE = ... window.CAPACITOR_API_BASE ...` line).
const injected = `<script>window.CAPACITOR_API_BASE = ${JSON.stringify(apiBase)};</script>\n<script>`;
if (!html.includes('<script>')) {
  console.error('Could not find <script> tag in index.html to inject into — aborting.');
  process.exit(1);
}
html = html.replace('<script>', injected);

fs.writeFileSync(path.join(WWW_DIR, 'index.html'), html);

console.log(`Built mobile/www/ with CAPACITOR_API_BASE=${apiBase}`);
