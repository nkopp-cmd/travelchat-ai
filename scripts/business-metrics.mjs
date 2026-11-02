#!/usr/bin/env node
// Money probe for shared/scripts/business-review.py (contract: shared/plans/business-loop.md).
// Prints ONE JSON line. Read-only SELECTs on production D1 (localley-app + localley-auth) via the D1 HTTP API.
// Unknown = null, never a guess. No email, id or secret in the output; our own accounts are left out of the counts.
// Moat fields (shared/plans/moats.md): counts only; the archives they count stay private.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

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
const RESOLVED = new Set(["matched", "created"]);
// Seoul Living newsletter (shared/plans/seoul-living-newsletter.md "Signup contract"): nilsgroove holds the list,
// its probe returns counts for our ?src=localley link only. Addresses never leave nilsgroove.
const NEWSLETTER_PROBE = join(homedir(), "projects/CyberLink/apps/nilsgroove/scripts/business-metrics");
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

/** Pure: rows from the two databases -> the probe line. */
export function summarize({ users, sessions, subscriptions, funnel, links = [], ugc = [], rankings = [], viral = null, newsletter = null }, now = Date.now()) {
  const from30 = now - 30 * DAY;
  const internal = new Set(users.filter((u) => isInternal(u.email)).map((u) => u.id));
  for (const l of links) if (internal.has(l.authUserId)) internal.add(l.ownerId); // legacy rows carry the owner id
  const customers = users.filter((u) => !internal.has(u.id));
  const active = new Set(sessions.filter((s) => !internal.has(s.userId) && within(s.updatedAt, from30, now + DAY)).map((s) => s.userId));
  // Subscription rows hold the CURRENT state only, so only the current window is known.
  const paying = subscriptions.filter((s) => s.authUserId && !internal.has(s.authUserId) && PAID_TIERS.has(s.tier)
    && PAYING_STATUS.has(s.status) && s.stripeSubscriptionId);
  const recent = (rows, key) => rows.filter((r) => within(r[key], from30, now + DAY));
  // Our own records: viral events (first seen) + their resolved places, and weekly spot rankings.
  const events = viral ? recent(Object.values(viral.events ?? {}), "firstSeen") : null;
  const places = events ? events.reduce((n, e) => n + Object.values(e.places ?? {}).filter((p) => RESOLVED.has(p.status)).length, 0) : null;
  const ranked = recent(rankings, "created_at").length;
  const paid30 = funnel.filter((f) => f.step === "checkout_paid" && within(`${f.day}T00:00:00Z`, from30, now + DAY))
    .reduce((sum, f) => sum + Number(f.count || 0), 0);
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
    owned_audience: Number.isInteger(newsletter?.confirmed) ? newsletter.confirmed : null,
    in_person_30d: null,
    notes: `paying = active/past_due Pro/Premium Stripe subscriptions now (D1 legacy_subscriptions, own accounts excluded); `
      + `checkout_paid funnel events 30d: ${paid30}; revenue/prev/repeat null: Stripe key is a Worker secret only and D1 keeps no invoice history; `
      + `proprietary = ${events ? `${events.length} viral events + ${places} resolved places` : "viral archive missing"} + ${ranked} weekly rankings; `
      + `ugc = questions/answers/reviews/tips/social submissions; owned_audience = ${Number.isInteger(newsletter?.confirmed)
        ? `confirmed Seoul Living subscribers from the Localley link (${newsletter.signups_30d ?? "?"} signups 30d)` : "null: newsletter probe unavailable"}; in_person null: no in-person service`,
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

/** Counts from the nilsgroove probe, or null when it is missing or fails (unknown, not zero). */
export async function newsletterCounts(probe = NEWSLETTER_PROBE) {
  if (!existsSync(probe)) return null;
  try {
    const { stdout } = await promisify(execFile)(probe, ["--seoul-living-source", "localley"], { timeout: 30_000 });
    const row = JSON.parse(stdout.trim().split("\n").pop());
    return row?.source === "localley" ? row : null;
  } catch {
    return null;
  }
}

async function main() {
  const auth = token();
  const [users, sessions, funnel, subscriptions, links, ugc, rankings, newsletter] = await Promise.all([
    select(AUTH_DB, "SELECT id, email, createdAt FROM user", auth),
    select(AUTH_DB, "SELECT userId, updatedAt FROM session WHERE updatedAt >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days')", auth),
    select(AUTH_DB, "SELECT day, step, count FROM funnel_events_daily WHERE step = 'checkout_paid'", auth),
    select(APP_DB, `SELECT l.authUserId, s.tier, s.status, s.stripeSubscriptionId FROM legacy_subscriptions s
      LEFT JOIN identity_links l ON l.ownerId = s.ownerId`, auth),
    select(APP_DB, "SELECT authUserId, ownerId FROM identity_links", auth),
    select(APP_DB, UGC_TABLES.map(([t, u, c]) => `SELECT ${u} AS uid, ${c} AS at FROM ${t}`).join(" UNION ALL "), auth),
    select(APP_DB, "SELECT created_at FROM weekly_city_spot_rankings", auth),
    newsletterCounts(),
  ]);
  const viral = existsSync(VIRAL_STATE) ? JSON.parse(readFileSync(VIRAL_STATE, "utf8")) : null;
  process.stdout.write(`${JSON.stringify(summarize({ users, sessions, subscriptions, funnel, links, ugc, rankings, viral, newsletter }))}\n`);
}

// realpath: the probe also runs through symlinked checkouts, where argv[1] is not the resolved module path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().catch((error) => { process.stderr.write(`business-metrics: ${error.message}\n`); process.exit(1); });
}
