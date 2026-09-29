# Waha — native app packaging (Capacitor)

This folder wraps the web app (the repo's `index.html`) into a real iOS/Android
app shell using [Capacitor](https://capacitorjs.com/). It was scaffolded and
config-checked here, but **not actually built** — that needs Xcode (iOS,
Mac-only) and/or Android Studio, neither of which exist in this environment.
Everything below is what you'd run locally.

## Why this is a separate folder

- Its `package.json`/`node_modules` are independent from the repo root and
  from `netlify/`, so installing Capacitor's tooling here can never affect
  the Netlify web deploy or the chat serverless function.
- `www/`, `ios/`, and `android/` are all generated output (gitignored) —
  `www/` gets rebuilt from the real `index.html` every time, so there's only
  ever one source of truth for the app's content.

## The one real code change this required

Inside the native app shell there's no same-origin Netlify function to call
for chat — `fetch('/.netlify/functions/chat')` would hit nothing. `index.html`
now computes:

```js
const API_BASE = (window.Capacitor && window.CAPACITOR_API_BASE) ? window.CAPACITOR_API_BASE : '';
const CHAT_ENDPOINT = API_BASE + '/.netlify/functions/chat';
```

On the web this is unaffected (`window.Capacitor` is undefined, so
`API_BASE` stays `''` and the path is relative, exactly as before). Inside
Capacitor, `build-www.js` (below) injects `window.CAPACITOR_API_BASE` at
build time so the app calls your deployed Netlify site instead.

## First-time setup (run locally, not here)

```bash
cd mobile
npm install
npx cap init   # already have capacitor.config.json checked in — this just confirms it
```

## Build & sync

```bash
CAPACITOR_API_BASE=https://YOUR-SITE.netlify.app npm run sync
```

This runs `build-www.js` (copies `index.html`, `sw.js`, `manifest.json`, and
the icons from the repo root into `mobile/www/`, injecting the API base
above), then `npx cap sync` to copy `www/` into the native projects.

Replace `YOUR-SITE.netlify.app` with your actual deployed URL — the build
script refuses to run without it rather than silently shipping a native app
whose chat feature is quietly broken.

## iOS (Mac + Xcode only)

```bash
npx cap add ios      # first time only
npm run open:ios     # opens the Xcode project
```

In Xcode: set your Team (Signing & Capabilities) and Bundle Identifier
(currently `com.waha.app` in `capacitor.config.json` — **change this before
your first App Store submission**, since it can't be changed afterward
without becoming a new app listing), then Product → Run or Archive.

## Android (Android Studio + SDK)

```bash
npx cap add android   # first time only
npm run open:android  # opens the Android Studio project
```

Build → Generate Signed Bundle/APK from there.

## Known gaps to check before shipping

- **`appId`** (`com.waha.app`) is a placeholder — pick your real reverse-DNS
  identifier before the first store submission.
- **App icons / splash screens**: Capacitor needs platform-specific icon
  sizes beyond the web `icon-192.png`/`icon-512.png` here. Use
  [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) to
  generate the full set from a single source image once you have final
  branding.
- **Service worker in a native WebView**: `sw.js` registers fine, but
  `serviceWorker` support inside Capacitor's WebView varies by iOS/Android
  version — the offline app-shell caching this repo's `sw.js` does may not
  be as reliable as in a real browser. Test actual offline behavior on both
  platforms before relying on it.
- **Push notifications, deep links, native permissions**: none of that is
  set up here — this scaffold only gets you a WebView-wrapped app, not a
  fully native-feeling one.
- **Store review**: an AI mental-wellness chat with crisis-related content
  gets extra scrutiny from both Apple and Google review teams. Expect to
  provide context on the crisis-detection safeguards (see
  `netlify/functions/chat.js`) during review, and to set an appropriate age
  rating.
