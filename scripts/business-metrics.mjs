#!/usr/bin/env node
// Money probe for shared/scripts/business-review.py (contract: shared/plans/business-loop.md).
// Prints ONE JSON line. Read-only SELECTs on production D1 (localley-app + localley-auth) via the D1 HTTP API.
// Unknown = null, never a guess. No email, id or secret in the output; our own accounts are left out of the counts.
// Moat fields (shared/plans/moats.md): counts only; the archives they count stay private.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { indexNote } from "./seo/index-status-lib.mjs";

const ACCOUNT = "664f242340bcec2f32daaeee15f58bde";
const APP_DB = "f1cc916b-5606-443f-9c4f-695c4ccc4a63"; // localley-app (production)
const AUTH_DB = "73378d0e-7f2a-465a-8188-a67cb6d2a5c2"; // localley-auth (production)
const DAY = 86_400_000;
// First live Stripe checkout session on the Worker (localley-full-cutover.md, Attempt566/574, 2026-10-15).
export const PAID_PATH_LIVE_SINCE = "2026-10-15";
// Team, house and test accounts: whole domains, plus sha256 of single owner addresses (no address in the code).
const INTERNAL_DOMAINS = new Set(["brenkogroup.com", "localley.io", "my-goodlife.com"]);
const INTERNAL_EMAIL_SHA256 = new Set(["97e25833e1476659d6dba1fa5cb00c02f846a2673dfd60d8b9785506be0027df"]);
const PAID_TIERS = new Set(["pro", "premium"]);
const PAYING_STATUS = new Set(["active", "past_due"]); // trialing has not paid yet
const VIRAL_STATE = join(homedir(), ".local/state/localley/viral-scout.json"); // private scout archive (host only)
// Push CC3: weekly Google URL Inspection of the money/entry pages (scripts/seo/index-status.mjs).
const INDEX_STATE = join(homedir(), "projects/CyberLink/claude-work/localley-index-status.json");
const RESOLVED = new Set(["matched", "created"]);
// Push CE3: our own servers (Hetzner) and checks that send x-localley-check are not visitors.
const OWN_ASNS = new Set([24940, 213230]);
const LOG_LIMIT = 2000;
const ownCall = (cf) => OWN_ASNS.has(Number(cf.asn)) || (cf.requestHeaderNames ?? []).includes("x-localley-check");
// User content rows: [table, user column, time column]. private_notes has no timestamp, so it is not counted.
const UGC_TABLES = [
  ["community_questions", "user_id", "created_at"], ["community_answers", "user_id", "created_at"],
  ["spot_reviews", "clerk_user_id", "created_at"], ["spot_tips", "user_id", "created_at"],
  ["social_spot_submissions", "clerk_user_id", "created_at"],
];

export function isInternal(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value.includes("@")) return true; // no real address = not a customer
  return INTERNAL_DOMAINS.has(value.split("@").pop()) || INTERNAL_EMAIL_SHA256.has(createHash("sha256").update(value).digest("hex"));
}

const at = (value) => {
  const ms = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : null;
};
const within = (value, from, to) => { const ms = at(value); return ms !== null && ms >= from && ms < to; };

/**
 * Pure: Worker log events of POST /api/itineraries/generate -> "real N (ok M)". Generate is never edge-cached, so the
 * Worker log sees every call; the funnel table only sees browsers that ran the beacon. null = log unreadable.
 */
export function generateCallsNote(events) {
  if (!Array.isArray(events)) return "unknown: Worker log unreadable";
  let real = 0, ok = 0, own = 0, bots = 0;
  for (const e of events) {
    const request = e?.$workers?.event?.request;
    // Only the fetch event carries request.cf; log lines of the same call repeat the request without it.
    if (!request?.cf || request.method !== "POST") continue;
    const cf = request.cf;
    if (ownCall(cf)) { own += 1; continue; }
    if (cf.verifiedBotCategory) { bots += 1; continue; }
    real += 1;
    const status = Number(e.$workers.event.response?.status);
    if (status >= 200 && status < 300) ok += 1;
  }
  const capped = events.length >= LOG_LIMIT ? " (log capped, at least)" : "";
  return `${real} (ok ${ok}, own checks ${own}, verified bots ${bots} excluded)${capped}`;
}

/**
 * Pure (push CG3): "[generate] outcome" log lines with status 422 no_spots -> planner errors per city, most first.
 * Own checks carry `check` (x-localley-check header or a check user agent); lines from before CG3 have no city and
 * no `check`, so (push CK2) a line also counts as own when the fetch event of the same $metadata.requestId came from our ASN or
 * sent x-localley-check: on 2026-11-22 all 5 "unknown" errors were our own checks from ASN 24940.
 * The 2026-12-19 offer check reads where planner_start does not reach trip_generated from this.
 */
export function plannerErrorsNote(events) {
  if (!Array.isArray(events)) return "unknown: Worker log unreadable";
  const ownIds = new Set();
  for (const e of events) {
    const cf = e?.$workers?.event?.request?.cf;
    const id = e.$metadata?.requestId;
    if (cf && id && ownCall(cf)) ownIds.add(id);
  }
  const byCity = new Map();
  let total = 0, suggested = 0, own = 0;
  for (const e of events) {
    const line = e?.source;
    if (line?.message !== "[generate] outcome" || Number(line.status) !== 422 || line.reason !== "no_spots") continue;
    if (line.check || (e.$metadata?.requestId && ownIds.has(e.$metadata.requestId))) { own += 1; continue; }
    total += 1;
    if (line.suggestion === true) suggested += 1;
    const city = typeof line.city === "string" && /^[a-z0-9-]{1,40}$/.test(line.city) ? line.city : "unknown";
    byCity.set(city, (byCity.get(city) ?? 0) + 1);
  }
  const cities = [...byCity].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c, n]) => `${c} ${n}`).join(", ");
  return `${total}${cities ? ` (${cities})` : ""}, smaller plan offered ${suggested}, own checks ${own} excluded`;
}

/**
 * Pure (push CN1): Worker log events of POST /api/auth/sign-up|sign-in -> "real N (sign-up email a, sign-in email b,
 * social c; non-2xx d), own checks e excluded". Only localley.io hosts count (the preview Worker logs the same paths).
 * On 2026-11-22 the auth pages were the top landings (26 page loads 7 d) with 0 real auth POSTs, so this tells
 * "read the form and leave" from "tried and failed". null = log unreadable.
 */
export function authAttemptsNote(events) {
  if (!Array.isArray(events)) return "unknown: Worker log unreadable";
  let real = 0, own = 0, failed = 0;
  const kinds = new Map();
  for (const e of events) {
    const request = e?.$workers?.event?.request;
    if (!request?.cf || request.method !== "POST") continue;
    let url;
    try { url = new URL(request.url); } catch { continue; }
    if (url.hostname !== "localley.io" && !url.hostname.endsWith(".localley.io")) continue;
    const kind = /^\/api\/auth\/sign-up\/email\/?$/.test(url.pathname) ? "sign-up email"
      : /^\/api\/auth\/sign-in\/email\/?$/.test(url.pathname) ? "sign-in email"
      : /^\/api\/auth\/sign-in\/social\/?$/.test(url.pathname) ? "social" : null;
    if (!kind) continue;
    if (ownCall(request.cf)) { own += 1; continue; }
    real += 1;
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    const status = Number(e.$workers.event.response?.status);
    if (!(status >= 200 && status < 300)) failed += 1;
  }
  const parts = ["sign-up email", "sign-in email", "social"].filter((k) => kinds.has(k)).map((k) => `${k} ${kinds.get(k)}`);
  const capped = events.length >= LOG_LIMIT ? " (log capped, at least)" : "";
  return `${real} (${parts.length ? `${parts.join(", ")}; ` : ""}non-2xx ${failed}), own checks ${own} excluded${capped}`;
}

/** Push CM3: CF RUM page loads 7d grouped by referrer host -> "N (bing.com 9, facebook.com 2) of M page loads".
 * Own hosts (localley.io and subdomains) and empty referrers (direct, our own checks) are not arrivals. */
export function externalArrivalsNote(rows) {
  if (!Array.isArray(rows)) return "unknown";
  const counts = {};
  let total = 0;
  for (const row of rows) {
    const n = Number(row?.count || 0);
    total += n;
    const host = String(row?.dimensions?.refererHost ?? "").trim().toLowerCase().replace(/^www\./, "");
    if (!host || host === "localley.io" || host.endsWith(".localley.io")) continue;
    counts[host] = (counts[host] ?? 0) + n;
  }
  const hosts = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const external = hosts.reduce((sum, h) => sum + counts[h], 0);
  return `${external}${external ? ` (${hosts.map((h) => `${h} ${counts[h]}`).join(", ")})` : ""} of ${total} page loads`;
}

/** Push DB1: CF RUM planner page loads 7d grouped by same-origin refererPath -> "sign-in a, sign-up b". The auth-page
 * lead link (Push CM1/CN2) is a full page load, so these are visitors who left the account form for the free planner. */
export function authLeadNote(rows) {
  if (!Array.isArray(rows)) return "unknown";
  const counts = { "sign-in": 0, "sign-up": 0 };
  for (const row of rows) {
    const d = row?.dimensions ?? {};
    if (String(d.requestPath ?? "") !== "/itineraries/new") continue;
    const host = String(d.refererHost ?? "").trim().toLowerCase().replace(/^www\./, "");
    if (host !== "localley.io") continue;
    const from = String(d.refererPath ?? "").replace(/\/+$/, "");
    if (from === "/sign-in" || from === "/sign-up") counts[from.slice(1)] += Number(row?.count || 0);
  }
  return `sign-in ${counts["sign-in"]}, sign-up ${counts["sign-up"]}`;
}

/** Pure: rows from the two databases -> the probe line. */
export function summarize({ users, sessions, subscriptions, funnel, links = [], ugc = [], rankings = [], viral = null, subscribers = null, lastEvent = null, indexStatus = null, generateLog = undefined, arrivals = undefined, authLog = undefined, authLead = undefined }, now = Date.now()) {
  const from30 = now - 30 * DAY;
  const internal = new Set(users.filter((u) => isInternal(u.email)).map((u) => u.id));
  for (const l of links) if (internal.has(l.authUserId)) internal.add(l.ownerId); // legacy rows carry the owner id
  const customers = users.filter((u) => !internal.has(u.id));
  const active = new Set(sessions.filter((s) => !internal.has(s.userId) && within(s.updatedAt, from30, now + DAY)).map((s) => s.userId));
  // Subscription rows hold the CURRENT state only, so only the current window is known.
  const paying = subscriptions.filter((s) => s.authUserId && !internal.has(s.authUserId) && PAID_TIERS.has(s.tier)
    && PAYING_STATUS.has(s.status) && s.stripeSubscriptionId);
  // Localley newsletter (D1 newsletter_subscribers, double opt-in): confirmed outside addresses only.
  const outside = Array.isArray(subscribers) ? subscribers.filter((r) => !isInternal(r.email)) : null;
  const audience = outside && {
    confirmed: outside.filter((r) => r.status === "confirmed").length,
    signups30: outside.filter((r) => within(Number(r.created_at) * 1000, from30, now + DAY)).length,
  };
  const recent = (rows, key) => rows.filter((r) => within(r[key], from30, now + DAY));
  // Our own records: viral events (first seen) + their resolved places, and weekly spot rankings.
  const events = viral ? recent(Object.values(viral.events ?? {}), "firstSeen") : null;
  const places = events ? events.reduce((n, e) => n + Object.values(e.places ?? {}).filter((p) => RESOLVED.has(p.status)).length, 0) : null;
  const ranked = recent(rankings, "created_at").length;
  // Push BW2/BX3: starts and payments by source, so an offer change (localley-decisions.md) can read start -> paid.
  // checkout_paid source = the page the checkout started on (Push BX1), "stripe" for older or unknown sessions.
  const bySource = (step, fallback) => {
    const counts = {};
    for (const f of funnel) {
      if (f.step !== step || !within(`${f.day}T00:00:00Z`, from30, now + DAY)) continue;
      const source = f.source || fallback;
      counts[source] = (counts[source] ?? 0) + Number(f.count || 0);
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return `${total}${total ? ` (${Object.keys(counts).sort().map((k) => `${k} ${counts[k]}`).join(", ")})` : ""}`;
  };
  return {
    app: "Localley",
    currency: "usd",
    paying_30d: new Set(paying.map((s) => s.authUserId)).size,
    paying_prev_30d: null,
    revenue_30d: null,
    revenue_prev_30d: null,
    repeat_payers_30d: null,
    active_30d: active.size,
    signups_30d: customers.filter((u) => within(u.createdAt, from30, now + DAY)).length,
    paid_path_live_since: PAID_PATH_LIVE_SINCE,
    proprietary_rows_30d: events ? events.length + places + ranked : null,
    ugc_30d: recent(ugc.filter((r) => r.uid && !internal.has(r.uid)), "at").length,
    owned_audience: audience ? audience.confirmed : null,
    in_person_30d: null,
    notes: `paying = active/past_due Pro/Premium Stripe subscriptions now (D1 legacy_subscriptions, own accounts excluded); `
      + `checkout_paid funnel events 30d: ${bySource("checkout_paid", "stripe")}; `
      + `checkout_start funnel events 30d: ${bySource("checkout_start", "other")}; `
      // Push AN2: the last day the collector counted anything, so "beacons broken" and "no visitors" look different.
      + `last counted event day (UTC; own checks are not counted): funnel ${lastEvent?.funnel ?? "unknown"}, spot cards ${lastEvent?.cards ?? "unknown"}; `
      + `${indexNote(indexStatus, now)}; `
      // Push CE3: tells "no visitors" from "visitors who stop" (no funnel step needed, so no D1 migration).
      + (generateLog === undefined ? "" : `real trip generate calls 7d (Worker log): ${generateCallsNote(generateLog)}; planner no-spots errors 7d by city: ${plannerErrorsNote(generateLog)}; `)
      // Push CM3: search arrivals next to sign-ups, so "no visitors" and "visitors who do not pay" look different.
      + (arrivals === undefined ? "" : `external arrivals 7d (CF RUM, referrer not localley.io): ${externalArrivalsNote(arrivals)}; `)
      // Push CN1: the sign-up step: visitors who try the account form, next to the arrivals above.
      + (authLog === undefined ? "" : `real auth attempts 7d (Worker log, POST /api/auth sign-up/sign-in): ${authAttemptsNote(authLog)}; `)
      // Push DB1: the auth-page lead link to the free planner, read at the 2026-12-19 offer check.
      + (authLead === undefined ? "" : `planner loads from the auth-page lead 7d (CF RUM refererPath): ${authLeadNote(authLead)}; `)
      + `revenue/prev/repeat null: Stripe key is a Worker secret only and D1 keeps no invoice history; `
      + `proprietary = ${events ? `${events.length} viral events + ${places} resolved places` : "viral archive missing"} + ${ranked} weekly rankings; `
      + `ugc = questions/answers/reviews/tips/social submissions; owned_audience = ${audience
        ? `confirmed Localley newsletter subscribers, own addresses excluded (${audience.signups30} signups 30d)` : "null: newsletter table unreadable"}; in_person null: no in-person service`,
  };
}

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const line = readFileSync(join(homedir(), "secrets/keys.env"), "utf8").split("\n").find((l) => l.startsWith("CLOUDFLARE_API_TOKEN="));
  if (!line) throw new Error("CLOUDFLARE_API_TOKEN missing");
  return line.slice("CLOUDFLARE_API_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
}

async function select(database, sql, auth) {
  if (!/^\s*select\b/i.test(sql)) throw new Error("read-only probe: SELECT only");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${database}/query`, {
    method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify({ sql }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(`D1 HTTP ${response.status}`);
  return body.result?.[0]?.results ?? [];
}

/** Read-only Worker observability query: the last 7 days of generate calls. null when the log cannot be read. */
async function generateEvents(auth, now = Date.now()) {
  return logEvents(auth, "/api/itineraries/generate", now);
}

/** Push CN1: the last 7 days of auth POSTs. Two queries: an "includes" value that ends in "-" matched 3 of 21 events. */
async function authEvents(auth, now = Date.now()) {
  const [up, inn] = await Promise.all([logEvents(auth, "/api/auth/sign-up", now), logEvents(auth, "/api/auth/sign-in", now)]);
  return up && inn ? [...up, ...inn] : null;
}

async function logEvents(auth, path, now) {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/observability/telemetry/query`, {
      method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ queryId: "adhoc", view: "events", limit: LOG_LIMIT, timeframe: { from: now - 7 * DAY, to: now },
        parameters: { filters: [
          // One filter only: on 2026-11-22 a second filter (method or scriptName) cut 24 matching calls to 4.
          { key: "$workers.event.request.url", operation: "includes", value: path, type: "string" },
        ] } }),
    });
    const body = await response.json().catch(() => ({}));
    return response.ok && body.success ? body.result?.events?.events ?? [] : null;
  } catch {
    return null;
  }
}

/** Push DB1: read-only CF RUM planner page loads 7d by same-origin referrer path. null when it cannot be read. */
async function rumAuthLead(auth, now = Date.now()) {
  const since = new Date(now - 7 * DAY).toISOString().slice(0, 10);
  const query = `{viewer{accounts(filter:{accountTag:"${ACCOUNT}"}){rumPageloadEventsAdaptiveGroups(limit:100,`
    + `filter:{date_geq:"${since}",requestHost_like:"%localley.io",requestPath:"/itineraries/new"}){count dimensions{refererHost refererPath requestPath}}}}}`;
  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify({ query }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.errors?.length) return null;
    return body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? null;
  } catch {
    return null;
  }
}

/** Read-only CF RUM (Web Analytics) query: page loads 7d by referrer host. null when it cannot be read. */
async function rumArrivals(auth, now = Date.now()) {
  const since = new Date(now - 7 * DAY).toISOString().slice(0, 10);
  const query = `{viewer{accounts(filter:{accountTag:"${ACCOUNT}"}){rumPageloadEventsAdaptiveGroups(limit:500,`
    + `filter:{date_geq:"${since}",requestHost_like:"%localley.io"}){count dimensions{refererHost}}}}}`;
  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify({ query }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.errors?.length) return null;
    return body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const auth = token();
  const lastDay = (table) => select(AUTH_DB, `SELECT max(day) AS day FROM ${table}`, auth).then((r) => r[0]?.day ?? null, () => null);
  const [users, sessions, funnel, subscriptions, links, ugc, rankings, subscribers, funnelDay, cardsDay, generateLog, arrivals, authLog, authLead] = await Promise.all([
    select(AUTH_DB, "SELECT id, email, createdAt FROM user", auth),
    select(AUTH_DB, "SELECT userId, updatedAt FROM session WHERE updatedAt >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days')", auth),
    select(AUTH_DB, "SELECT day, step, source, count FROM funnel_events_daily WHERE step IN ('checkout_paid', 'checkout_start')", auth),
    select(APP_DB, `SELECT l.authUserId, s.tier, s.status, s.stripeSubscriptionId FROM legacy_subscriptions s
      LEFT JOIN identity_links l ON l.ownerId = s.ownerId`, auth),
    select(APP_DB, "SELECT authUserId, ownerId FROM identity_links", auth),
    select(APP_DB, UGC_TABLES.map(([t, u, c]) => `SELECT ${u} AS uid, ${c} AS at FROM ${t}`).join(" UNION ALL "), auth),
    select(APP_DB, "SELECT created_at FROM weekly_city_spot_rankings", auth),
    // Unknown (null), not zero, when the table is not there yet or the read fails.
    select(APP_DB, "SELECT email, status, created_at FROM newsletter_subscribers", auth).catch(() => null),
    lastDay("funnel_events_daily"), lastDay("spot_card_events_daily"), generateEvents(auth), rumArrivals(auth), authEvents(auth), rumAuthLead(auth),
  ]);
  const viral = existsSync(VIRAL_STATE) ? JSON.parse(readFileSync(VIRAL_STATE, "utf8")) : null;
  let indexStatus = null;
  try { indexStatus = JSON.parse(readFileSync(INDEX_STATE, "utf8")); } catch { /* no run yet: the note says unknown */ }
  process.stdout.write(`${JSON.stringify(summarize({ users, sessions, subscriptions, funnel, links, ugc, rankings, viral, subscribers, lastEvent: { funnel: funnelDay, cards: cardsDay }, indexStatus, generateLog, arrivals, authLog, authLead }))}\n`);
}

// realpath: the probe also runs through symlinked checkouts, where argv[1] is not the resolved module path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().catch((error) => { process.stderr.write(`business-metrics: ${error.message}\n`); process.exit(1); });
}
