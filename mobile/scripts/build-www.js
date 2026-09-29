#!/usr/bin/env node
// Copies the built web app (repo root's dist/, produced by `npm run
// build`) into mobile/www/ (Capacitor's webDir) and injects the
// production API base URL so the chat feature works from inside the
// native app shell, where there is no same-origin Netlify function to
// call.
//
// Usage:
//   npm run build --prefix ..                        # build dist/ first
//   CAPACITOR_API_BASE=https://your-site.netlify.app npm run build:www

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const WWW_DIR = path.resolve(__dirname, '..', 'www');

if (!fs.existsSync(DIST_DIR)) {
  console.error(
    `\n${DIST_DIR} doesn't exist.\n` +
    'This script packages the already-built web app, it doesn\'t build it. Run at the repo root first:\n\n' +
    '  npm install && npm run build\n'
  );
  process.exit(1);
}

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
fs.cpSync(DIST_DIR, WWW_DIR, { recursive: true });

const indexPath = path.join(WWW_DIR, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// A plain (non-module) inline script runs the moment the parser reaches
// it; the bundled <script type="module" src="/assets/..."> is deferred
// like any module script, so inserting this right before it guarantees
// window.CAPACITOR_API_BASE is set before index.html's own
// `const API_BASE = ... window.CAPACITOR_API_BASE ...` line runs.
const injected = `<script>window.CAPACITOR_API_BASE = ${JSON.stringify(apiBase)};</script>\n  <script type="module"`;
if (!html.includes('<script type="module"')) {
  console.error('Could not find the built module <script> tag in dist/index.html — aborting.');
  process.exit(1);
}
html = html.replace('<script type="module"', injected);

fs.writeFileSync(indexPath, html);

console.log(`Built mobile/www/ from dist/ with CAPACITOR_API_BASE=${apiBase}`);
