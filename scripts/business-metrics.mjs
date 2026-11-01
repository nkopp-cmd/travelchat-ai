#!/usr/bin/env node
// Money probe for shared/scripts/business-review.py (contract: shared/plans/business-loop.md).
// Prints ONE JSON line. Read-only SELECTs on production D1 (localley-app + localley-auth) via the D1 HTTP API.
// Unknown = null, never a guess. No email, id or secret in the output; our own accounts are left out of the counts.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
export function summarize({ users, sessions, subscriptions, funnel }, now = Date.now()) {
  const from30 = now - 30 * DAY;
  const internal = new Set(users.filter((u) => isInternal(u.email)).map((u) => u.id));
  const customers = users.filter((u) => !internal.has(u.id));
  const active = new Set(sessions.filter((s) => !internal.has(s.userId) && within(s.updatedAt, from30, now + DAY)).map((s) => s.userId));
  // Subscription rows hold the CURRENT state only, so only the current window is known.
  const paying = subscriptions.filter((s) => s.authUserId && !internal.has(s.authUserId) && PAID_TIERS.has(s.tier)
    && PAYING_STATUS.has(s.status) && s.stripeSubscriptionId);
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
    notes: `paying = active/past_due Pro/Premium Stripe subscriptions now (D1 legacy_subscriptions, own accounts excluded); `
      + `checkout_paid funnel events 30d: ${paid30}; revenue/prev/repeat null: Stripe key is a Worker secret only and D1 keeps no invoice history`,
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

async function main() {
  const auth = token();
  const [users, sessions, funnel, subscriptions] = await Promise.all([
    select(AUTH_DB, "SELECT id, email, createdAt FROM user", auth),
    select(AUTH_DB, "SELECT userId, updatedAt FROM session WHERE updatedAt >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days')", auth),
    select(AUTH_DB, "SELECT day, step, count FROM funnel_events_daily WHERE step = 'checkout_paid'", auth),
    select(APP_DB, `SELECT l.authUserId, s.tier, s.status, s.stripeSubscriptionId FROM legacy_subscriptions s
      LEFT JOIN identity_links l ON l.ownerId = s.ownerId`, auth),
  ]);
  process.stdout.write(`${JSON.stringify(summarize({ users, sessions, subscriptions, funnel }))}\n`);
}

// realpath: the probe also runs through symlinked checkouts, where argv[1] is not the resolved module path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().catch((error) => { process.stderr.write(`business-metrics: ${error.message}\n`); process.exit(1); });
}
