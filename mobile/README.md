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
  `www/` gets rebuilt from the repo's real `dist/` build every time (see
  below), so there's only ever one source of truth for the app's content.

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
build time so the app calls your deployed Netlify site instead. This lives
in `src/main.js` now — the whole app used to be one inline `<script>` in
`index.html`; it's since been split into a real Vite build (`src/`,
`public/`, `dist/` at the repo root).

## First-time setup (run locally, not here)

```bash
cd mobile
npm install
npx cap init   # already have capacitor.config.json checked in — this just confirms it
```

## Build & sync

```bash
# from the repo root: build the actual web app first
npm install && npm run build

# then, from mobile/:
CAPACITOR_API_BASE=https://YOUR-SITE.netlify.app npm run sync
```

`npm run sync` runs `build-www.js` (copies the repo root's `dist/` — the
Vite build output — into `mobile/www/`, injecting the API base above), then
`npx cap sync` to copy `www/` into the native projects.

Replace `YOUR-SITE.netlify.app` with your actual deployed URL — the build
script refuses to run without it rather than silently shipping a native app
whose chat feature is quietly broken. It also refuses to run if `dist/`
doesn't exist yet, since it packages the build, it doesn't produce one.

## Subscriptions (RevenueCat — optional until you set it up)

Monthly/yearly pricing is shown in the app already (`src/main.js`'s
`upgrade_*` strings), but there's no payment processor wired up yet. Apple
and Google both require digital subscriptions *sold inside a native app* to
go through their own billing (StoreKit / Play Billing) — a web checkout
(Stripe etc.) would get the app rejected, so this only covers the native
path. The web build has no purchase UI at all; it isn't in scope here.

This uses [RevenueCat](https://www.revenuecat.com/) rather than raw
StoreKit/Play Billing calls, since it handles receipt validation and
subscription-state tracking for both stores through one API, instead of
you maintaining your own server-side verification against both Apple's and
Google's APIs.

**Setup (in RevenueCat's dashboard, not here):**
1. Create a RevenueCat project, connect it to your App Store Connect and
   Play Console apps.
2. Create your monthly/yearly products in App Store Connect / Play
   Console first, then import them into a RevenueCat **Offering** using
   its standard package identifiers (`$rc_monthly`, `$rc_annual`) — or
   update `MONTHLY_PACKAGE_ID`/`YEARLY_PACKAGE_ID` near the top of the
   purchases code in `src/main.js` if you use different ones.
3. Create an **Entitlement** named `premium` (or update
   `PREMIUM_ENTITLEMENT_ID` in `src/main.js` to whatever you name it) and
   attach both products to it.
4. Copy your iOS and Android **public** API keys from Project settings →
   API keys.

**Build with them set:**
```bash
CAPACITOR_API_BASE=https://YOUR-SITE.netlify.app \
REVENUECAT_IOS_API_KEY=appl_xxx \
REVENUECAT_ANDROID_API_KEY=goog_xxx \
npm run sync
```
Leaving the RevenueCat keys unset still builds fine — the app just keeps
the subscribe/restore buttons hidden (shows the existing pricing info plus
a note instead) until you set them.

**Not yet verified against a real build**: this was wired up against
`@revenuecat/purchases-capacitor@9.2.2`'s actual published TypeScript
definitions and its `@revenuecat/purchases-typescript-internal-esm@13.26.0`
dependency (read directly, not from a documentation summary — so the
`configure`/`getOfferings`/`purchasePackage`/`restorePurchases`/
`getCustomerInfo`/`addCustomerInfoUpdateListener` calls and the
`entitlements.active[id]` map shape in `src/main.js` are confirmed
correct for that exact version), but there was no actual RevenueCat
account, Xcode, or Android Studio to run a real purchase against. Before
relying on it in production, still confirm `MONTHLY_PACKAGE_ID` /
`YEARLY_PACKAGE_ID` / `PREMIUM_ENTITLEMENT_ID` in `src/main.js` match
what you actually name things in your RevenueCat dashboard — that part
is configuration on your end, not something any source read can verify.

**Capacitor 6, not the plugin's latest**: `@revenuecat/purchases-capacitor`
jumped to requiring Capacitor ≥8 starting at its v10 release. This repo's
native scaffold is pinned to Capacitor 6 (`mobile/package.json`), so this
uses the last 6.x-compatible release (9.2.2) rather than latest. Upgrading
the whole Capacitor major version to pick up newer RevenueCat releases is
a separate, bigger decision — not done as part of this.

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
