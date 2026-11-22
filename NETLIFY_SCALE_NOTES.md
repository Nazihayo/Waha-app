# Netlify Functions — scale & resilience review

A code-level review of `netlify/functions/*.js` under concurrent/high
traffic, done by reading the code and testing logic offline against a
mocked Blobs store. **No load test was run against the live production
site** — that needs the owner's explicit sign-off first, since it would
generate real traffic and real Anthropic API cost against a live service
other people may be using.

## What's already solid

- **Rate limiting fails open everywhere** (`chat.js`, `feedback.js`,
  `stats.js`): if Netlify Blobs itself is slow or down, every limiter
  catches the error and allows the request rather than breaking the app
  for everyone. A storage hiccup degrades cost control, never uptime.
- **`chat.js`** caps message length (`MAX_MESSAGE_LEN`), history size
  (`MAX_HISTORY_MESSAGES`) and reply length (`MAX_TOKENS`), so one
  conversation can't balloon a single request's cost or latency.
- **`stats.js`**'s public `ping` route is already rate-limited per IP
  (`PINGS_PER_IP_PER_DAY`); its `admin_stats` route (the one that reads
  every stored day/cohort) is behind `isAdmin()`, so its cost — which
  does grow with total days running — is only ever paid by the owner,
  not by public traffic, and grows by at most one key per day (bounded:
  ~365/year).

## Fixed in this pass

- **`feedback.js`'s public `GET` had no rate limit at all**, unlike its
  `submit` route. `GET` calls `loadAll()`, which re-reads *every* stored
  feedback item on *every* call — a cost that grows with total feedback
  volume, with no cap on how often an anonymous caller could repeat it.
  Added the same per-IP, per-day bucket pattern already used for
  `submit` (`READS_PER_DAY = 120`, generous enough that a real visitor
  reloading the page never notices it, verified offline against a mock
  store: 120 calls succeed, the 121st gets 429, a different IP is
  unaffected, and `submit`'s separate 3/day cap still works
  independently). The two rate checks were also deduplicated into one
  `underDailyLimit()` helper.

## Known limitation, not fixed (the library doesn't expose what would fix it)

**`chat.js`'s `checkRateLimit()` has a read-then-write race.** It does
`store.get(key)` → increment in memory → `store.setJSON(key, record)`,
which is not atomic. Two genuinely concurrent requests from the same IP
within the same 10-minute window can both read the same `count` before
either writes, so a true concurrent burst could let a few requests past
`RATE_LIMIT_MAX` before the counter catches up.

Checked whether this is fixable: `@netlify/blobs@8.1.0`'s public `Store`
API (`set`/`setJSON`) takes only `{ metadata }` — there's no
`onlyIfMatch`/conditional-write option exposed (confirmed by reading
`node_modules/@netlify/blobs/dist/main.d.ts` directly, not assumed), so
there's no compare-and-swap primitive to build a real atomic increment
from the public API in this version. Closing this properly would mean
moving the counter to a store with an atomic `INCR` (e.g. a real
KV/Redis) or using Netlify's own edge-level rate limiting if the plan
has it — both bigger infrastructure decisions, not a code fix inside
this function.

**Why this is lower priority than it sounds:** the limiter is a cost
control, not a security boundary — it caps a free-form AI chat feature's
spend, not access to any sensitive data. The window is generous (20
messages / 10 minutes), so a few extra messages slipping through during
a narrow race only matters at a scale of many truly concurrent requests
from one IP, which is a different (and already separately handled)
problem from a slow organic ramp in traffic. Worth knowing about before
scaling to a point where API cost is being actively watched; not worth a
risky change made without a way to verify it against the real service.

## Not reviewed here

- Real concurrent-load behavior of the Anthropic API calls in `chat.js`
  (no custom timeout/`AbortController` — relies on Netlify's own function
  timeout as the outer bound). Confirming this needs an actual load test,
  which needs the owner's go-ahead first (see above).
- `feedback.js`/`stats.js` admin routes still read their *entire* stored
  history with no pagination (only bounded by who can call them, not by
  size) — fine at pilot scale, worth revisiting if either store grows
  into the thousands of entries.
