// Waha — pilot feedback (ratings + written opinions) and moderation.
//
// Public:
//   GET                      -> approved opinions + honest stats
//   POST {action:"submit"}   -> store one rating/opinion (status "pending")
// Owner only (admin key):
//   POST {action:"admin_list", key}
//   POST {action:"moderate", key, id, status}
//
// HONESTY RULES built into the data model:
// - The owner can never edit what someone wrote; he can only decide
//   whether the TEXT is shown.
// - "hidden" keeps the person's star rating in the average (only the text
//   stays private), so choosing which texts to show cannot inflate the
//   score. Only "spam" (junk / not a real participant) leaves the average.
// - Nothing is public until approved: people sometimes write private
//   details or something worrying, and that must never appear on a page.
//
// ADMIN KEY: the repository is public, so only a SHA-256 hash of the key is
// in the code. WAHA_ADMIN_KEY_SHA256 (Netlify environment variable)
// overrides it if the owner ever wants to change the key.

const { connectLambda, getStore } = require("@netlify/blobs");
const crypto = require("crypto");

const DEFAULT_ADMIN_HASH = "e669a6968de9d0f76ff2d2756572025e512e04576a17bfb1c3d2dd71369742d8";
const STORE = "waha-feedback";
const MAX_TEXT = 600;
const SUBMITS_PER_DAY = 3; // per visitor (IP), against spam
const STATUSES = ["pending", "approved", "hidden", "spam"];

// Same idea as the chat's crisis net: a worrying opinion is never shown
// publicly and is flagged for the owner, who then follows the pilot's
// safety protocol (contact the person, share helplines).
const CRISIS_WORDS = ["انتحار", "اقتل نفسي", "انهي حياتي", "بدي اموت", "اريد الموت", "نفسي اموت", "عايز اموت", "ابي اموت",
  "suicide", "kill myself", "end my life", "want to die", "self-harm", "selbstmord", "suizid", "ich will sterben",
  "intihar", "ölmek istiyorum"];
function looksLikeCrisis(text) {
  const t = String(text || "").toLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[أإآ]/g, "ا");
  return CRISIS_WORDS.some((w) => t.includes(w.replace(/[أإآ]/g, "ا")));
}

const json = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(obj) });

function isAdmin(key) {
  if (typeof key !== "string" || key.length < 12 || key.length > 200) return false;
  const want = (process.env.WAHA_ADMIN_KEY_SHA256 || DEFAULT_ADMIN_HASH).toLowerCase();
  const got = crypto.createHash("sha256").update(key).digest("hex");
  return want.length === got.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
function clientIp(event) {
  return event.headers["x-nf-client-connection-ip"] || (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
}
function cleanUsage(u) {
  if (!u || typeof u !== "object") return null;
  const out = {};
  for (const k of ["daysActive", "chatMessages", "plansMade", "stepsHelped", "stepsNotHelped", "exercisesDone", "moodLogs"]) {
    const v = Number(u[k]);
    if (Number.isFinite(v) && v >= 0 && v < 100000) out[k] = Math.round(v);
  }
  return Object.keys(out).length ? out : null;
}
async function loadAll(store) {
  const { blobs } = await store.list({ prefix: "fb-" });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }).catch(() => null)));
  return items.filter(Boolean).sort((a, b) => b.ts - a.ts);
}
function statsOf(items) {
  // Every real rating counts from the moment it arrives (pending too), so
  // the timing of moderation can't shape the score either.
  const counted = items.filter((i) => i.status !== "spam");
  const ratings = counted.map((i) => i.rating);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  return { count: ratings.length, average: avg === null ? null : Math.round(avg * 10) / 10 };
}
function publicView(i) {
  return { id: i.id, rating: i.rating, text: i.text, date: new Date(i.ts).toISOString().slice(0, 10), lang: i.lang, pilot: !!i.pilot };
}

exports.handler = async function (event) {
  try { connectLambda(event); } catch (e) { console.error("connectLambda failed:", e); }
  let store;
  try { store = getStore({ name: STORE, consistency: "strong" }); } catch (e) {
    console.error("Blobs unavailable:", e);
    return json(503, { error: "Storage unavailable" });
  }

  if (event.httpMethod === "GET") {
    try {
      const items = await loadAll(store);
      return json(200, { stats: statsOf(items), items: items.filter((i) => i.status === "approved").slice(0, 50).map(publicView) });
    } catch (e) {
      console.error("Feedback list failed:", e);
      return json(500, { error: "Server error" });
    }
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let p;
  try { p = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }

  if (p.action === "submit") {
    const rating = Number(p.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(400, { error: "Rating must be 1-5" });
    const text = typeof p.text === "string" ? p.text.trim().slice(0, MAX_TEXT) : "";
    const pilot = typeof p.pilot === "string" && /^[A-Za-z0-9-]{2,16}$/.test(p.pilot) ? p.pilot.toUpperCase() : null;
    const lang = typeof p.lang === "string" && /^[a-z]{2}$/.test(p.lang) ? p.lang : "ar";

    // Anti-spam: a few submissions per visitor per day.
    const ip = clientIp(event);
    const dayKey = "rl-" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24) + "-" + new Date().toISOString().slice(0, 10);
    try {
      const n = Number(await store.get(dayKey)) || 0;
      if (n >= SUBMITS_PER_DAY) return json(429, { error: "Too many submissions today" });
      await store.set(dayKey, String(n + 1));
    } catch (e) { console.error("Feedback rate limit failed, allowing:", e); }

    const crisis = looksLikeCrisis(text);
    const item = {
      id: "fb-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex"),
      ts: Date.now(),
      rating, text, lang, pilot,
      publicOk: !!p.publicOk && !crisis,
      usage: p.shareUsage ? cleanUsage(p.usage) : null,
      status: "pending",
      flag: crisis ? "crisis" : null,
    };
    try { await store.setJSON(item.id, item); } catch (e) {
      console.error("Feedback save failed:", e);
      return json(500, { error: "Server error" });
    }
    return json(200, { ok: true, crisis });
  }

  if (p.action === "admin_list" || p.action === "moderate") {
    if (!isAdmin(p.key)) return json(403, { error: "Wrong key" });
    if (p.action === "moderate") {
      if (typeof p.id !== "string" || !/^fb-\d+-[0-9a-f]{8}$/.test(p.id) || !STATUSES.includes(p.status)) return json(400, { error: "Bad request" });
      const item = await store.get(p.id, { type: "json" }).catch(() => null);
      if (!item) return json(404, { error: "Not found" });
      // A text the person did not agree to publish, or a worrying one, can never be approved.
      if (p.status === "approved" && (!item.publicOk || item.flag === "crisis")) return json(409, { error: "This opinion cannot be published" });
      item.status = p.status;
      item.moderatedAt = Date.now();
      await store.setJSON(item.id, item);
    }
    const items = await loadAll(store);
    const withUsage = items.filter((i) => i.usage && i.status !== "spam");
    const usageAvg = {};
    for (const k of ["daysActive", "chatMessages", "plansMade", "stepsHelped", "exercisesDone", "moodLogs"]) {
      const vals = withUsage.map((i) => i.usage[k]).filter((v) => typeof v === "number");
      if (vals.length) usageAvg[k] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    }
    return json(200, { stats: statsOf(items), usage: { people: withUsage.length, averages: usageAvg }, items });
  }

  return json(400, { error: "Unknown action" });
};
