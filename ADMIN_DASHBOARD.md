# Admin dashboard — setup

Checked this at your request: the usage dashboard you're asking for **already
exists and works** — `public/admin.html` (deployed at `https://YOUR-SITE/admin.html`,
same domain as the app, nothing extra to build or host). Verified end to end
against a mocked backend (login, wrong-key rejection, both tabs, the 30-day
bar chart, retention table, feature table, language table — all render
correctly with zero console errors beyond the expected 403 on a wrong key).

It has two tabs:
- **الآراء (Opinions)** — moderate pilot feedback/ratings (`feedback.js`).
- **الاستخدام (Usage)** — the stats dashboard: opted-in count, daily actives
  (30-day bar chart), D1/D3/D7/D14/D30 retention, feature usage, language
  breakdown (`stats.js`'s `admin_stats`).

**What was actually missing: nobody had ever documented how to turn the key
on**, so there was no way in. Both functions read `WAHA_ADMIN_KEY_SHA256`
from a Netlify environment variable and refuse access until it's set (by
design — see the comment at the top of `feedback.js` for why there's no
hardcoded fallback in this public repo).

## One-time setup

1. **Pick a password** — long and random, not something guessable. This is
   the only thing that gates both tabs; whoever has it can moderate opinions
   and read usage numbers.

2. **Hash it with SHA-256** (the server only ever sees/stores the hash, never
   your real password). Run one of these:
   ```bash
   # macOS/Linux terminal
   echo -n "your-chosen-password" | shasum -a 256
   ```
   ```js
   // or in any browser console
   crypto.subtle.digest("SHA-256", new TextEncoder().encode("your-chosen-password"))
     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join("")))
   ```

3. **Set it in Netlify**: Site settings → Environment variables → add
   `WAHA_ADMIN_KEY_SHA256` = the hex string from step 2 → redeploy (or trigger
   a new deploy so the functions pick it up).

4. Go to `https://YOUR-SITE/admin.html` and log in with your real password
   (the one from step 1, not the hash) — the page hashes nothing client-side,
   it just sends the password itself over HTTPS to the function, which
   hashes and compares it server-side.

That's it — no code change needed, nothing to redeploy beyond setting the
variable.
