// Waha — anonymous usage statistics (opt-in only).
//
// PRIVACY BY DESIGN: there is no user id, no device id, no content and no
// IP stored with the numbers. Each opted-in device sends at most one
// "ping" per day with:
//   - since: the date it opted in (its cohort, a calendar date)
//   - dayN:  how many days after opting in this is
//   - counts of features used since its last ping (numbers only)
//   - its UI language and whether it is in the pilot
// The server only ADDS these to totals:
//   day-YYYY-MM-DD  -> {active, pilot, langs:{}, features:{}}
//   ret-YYYY-MM-DD  -> {days:{"0":n,"1":n,...}}   (cohort retention)
// From the totals we can show daily actives, retention (D1/D7/D30) and
// which features are used — what investors and judges ask for — without
// being able to follow any single person.
//
// Owner only: POST {action:"admin_stats", key} with the same admin key as
// the opinions page (hash in code; WAHA_ADMIN_KEY_SHA256 overrides).

const { connectLambda, getStore } = require("@netlify/blobs");
const crypto = require("crypto");

const DEFAULT_ADMIN_HASH = "e669a6968de9d0f76ff2d2756572025e512e04576a17bfb1c3d2dd71369742d8";
const STORE = "waha-stats";
const FEATURES = ["chat_message", "agent_plan", "agent_feedback", "exercise_completion", "mood_log", "health_log",
  "agent_calendar_export", "chat_action_started", "opinion_sent", "habit_completion"];
const LANGS = ["ar", "en", "de", "fr", "tr", "ku", "es", "fa", "ur", "ru", "pt", "it"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PINGS_PER_IP_PER_DAY = 4; // a household may share one IP; this only stops floods

const json = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(obj) });
const today = () => new Date().toISOString().slice(0, 10);

function isAdmin(key) {
  if (typeof key !== "string" || key.length < 12 || key.length > 200) return false;
  const want = (process.env.WAHA_ADMIN_KEY_SHA256 || DEFAULT_ADMIN_HASH).toLowerCase();
  const got = crypto.createHash("sha256").update(key).digest("hex");
  return want.length === got.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
function clientIp(event) {
  return event.headers["x-nf-client-connection-ip"] || (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
}
async function bump(store, key, fn, empty) {
  const cur = (await store.get(key, { type: "json" }).catch(() => null)) || empty();
  fn(cur);
  await store.setJSON(key, cur);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try { connectLambda(event); } catch (e) { console.error("connectLambda failed:", e); }
  let store;
  try { store = getStore({ name: STORE, consistency: "strong" }); } catch (e) { return json(503, { error: "Storage unavailable" }); }
  let p;
  try { p = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }

  if (p.action === "ping") {
    const since = typeof p.since === "string" && DATE_RE.test(p.since) ? p.since : null;
    const dayN = Number(p.dayN);
    if (!since || !Number.isInteger(dayN) || dayN < 0 || dayN > 730) return json(400, { error: "Bad ping" });
    const t = today();
    // Flood guard: a one-way hash of the IP, kept for the day only, never with the numbers.
    const rlKey = "rl-" + crypto.createHash("sha256").update(clientIp(event) + "|" + t).digest("hex").slice(0, 24) + "-" + t;
    try {
      const n = Number(await store.get(rlKey)) || 0;
      if (n >= PINGS_PER_IP_PER_DAY) return json(200, { ok: true, counted: false });
      await store.set(rlKey, String(n + 1));
    } catch (e) { console.error("Stats rate limit failed, allowing:", e); }

    const lang = LANGS.includes(p.lang) ? p.lang : "other";
    const counts = {};
    if (p.counts && typeof p.counts === "object") {
      for (const f of FEATURES) {
        const v = Number(p.counts[f]);
        if (Number.isFinite(v) && v > 0) counts[f] = Math.min(Math.round(v), 500);
      }
    }
    try {
      await bump(store, "day-" + t, (d) => {
        d.active += 1;
        if (p.pilot) d.pilot += 1;
        d.langs[lang] = (d.langs[lang] || 0) + 1;
        for (const f of Object.keys(counts)) {
          d.features[f] = (d.features[f] || 0) + counts[f];
          d.users[f] = (d.users[f] || 0) + 1; // how many people used it that day
        }
      }, () => ({ active: 0, pilot: 0, langs: {}, features: {}, users: {} }));
      await bump(store, "ret-" + since, (r) => { r.days[String(dayN)] = (r.days[String(dayN)] || 0) + 1; }, () => ({ days: {} }));
    } catch (e) {
      console.error("Stats save failed:", e);
      return json(500, { error: "Server error" });
    }
    return json(200, { ok: true, counted: true });
  }

  if (p.action === "admin_stats") {
    if (!isAdmin(p.key)) return json(403, { error: "Wrong key" });
    try {
      const [dayList, retList] = await Promise.all([store.list({ prefix: "day-" }), store.list({ prefix: "ret-" })]);
      const days = (await Promise.all(dayList.blobs.map(async (b) => ({ date: b.key.slice(4), ...(await store.get(b.key, { type: "json" })) }))))
        .filter((d) => DATE_RE.test(d.date)).sort((a, b) => a.date.localeCompare(b.date));
      const cohorts = (await Promise.all(retList.blobs.map(async (b) => ({ since: b.key.slice(4), ...(await store.get(b.key, { type: "json" })) }))))
        .filter((c) => DATE_RE.test(c.since));
      // Retention for day N = people seen on day N / people who started, over
      // cohorts old enough to have reached day N (younger ones would drag it down).
      const t = Date.parse(today());
      const retention = {};
      for (const n of [1, 3, 7, 14, 30]) {
        const eligible = cohorts.filter((c) => (t - Date.parse(c.since)) / 864e5 >= n && (c.days["0"] || 0) > 0);
        const started = eligible.reduce((s, c) => s + (c.days["0"] || 0), 0);
        // Day N, or the closest later day within a small window, since people don't open every single day.
        const back = eligible.reduce((s, c) => {
          let best = 0;
          for (let k = n; k <= n + (n >= 7 ? 3 : 0); k++) best = Math.max(best, c.days[String(k)] || 0);
          return s + Math.min(best, c.days["0"] || 0);
        }, 0);
        retention["d" + n] = { started, returned: back, percent: started ? Math.round((back / started) * 100) : null };
      }
      const last30 = days.slice(-30);
      const featureTotals = {}, featureUsers = {}, langTotals = {};
      for (const d of last30) {
        for (const [f, v] of Object.entries(d.features || {})) featureTotals[f] = (featureTotals[f] || 0) + v;
        for (const [f, v] of Object.entries(d.users || {})) featureUsers[f] = (featureUsers[f] || 0) + v;
        for (const [l, v] of Object.entries(d.langs || {})) langTotals[l] = (langTotals[l] || 0) + v;
      }
      const newPeople = cohorts.reduce((s, c) => s + (c.days["0"] || 0), 0);
      return json(200, {
        today: today(),
        optedIn: newPeople,
        days: last30.map((d) => ({ date: d.date, active: d.active, pilot: d.pilot })),
        retention, featureTotals, featureUsers, langTotals,
      });
    } catch (e) {
      console.error("Stats read failed:", e);
      return json(500, { error: "Server error" });
    }
  }

  return json(400, { error: "Unknown action" });
};
