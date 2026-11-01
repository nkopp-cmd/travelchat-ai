// node --test scripts/business-metrics.checks.mjs — pure parts of the business-loop money probe (no network).
import assert from "node:assert/strict";
import test from "node:test";
import { PAID_PATH_LIVE_SINCE, isInternal, summarize } from "./business-metrics.mjs";

const now = Date.parse("2026-11-01T12:00:00Z");
const users = [
  { id: "u1", email: "guest@example.com", createdAt: "2026-10-20T01:00:00.000Z" },
  { id: "u2", email: "old@example.com", createdAt: "2026-03-13T01:00:00.000Z" },
  { id: "house", email: "team@localley.io", createdAt: "2026-10-30T01:00:00.000Z" },
];

test("own accounts and rows without an address are not customers", () => {
  assert.equal(isInternal("Team@LOCALLEY.io"), true);
  assert.equal(isInternal("x@brenkogroup.com"), true);
  assert.equal(isInternal(""), true);
  assert.equal(isInternal("guest@example.com"), false);
});

test("counts paying, active and sign-ups; unknown money stays null", () => {
  const out = summarize({
    users,
    sessions: [{ userId: "u1", updatedAt: "2026-10-31T00:00:00.000Z" }, { userId: "u1", updatedAt: "2026-10-30T00:00:00.000Z" },
      { userId: "u2", updatedAt: "2026-09-01T00:00:00.000Z" }, { userId: "house", updatedAt: "2026-11-01T00:00:00.000Z" }],
    subscriptions: [
      { authUserId: "u1", tier: "pro", status: "active", stripeSubscriptionId: "sub_1" },
      { authUserId: "u2", tier: "premium", status: "trialing", stripeSubscriptionId: "sub_2" },
      { authUserId: "house", tier: "premium", status: "active", stripeSubscriptionId: "sub_3" },
      { authUserId: null, tier: "pro", status: "active", stripeSubscriptionId: "sub_4" },
      { authUserId: "u2", tier: "free", status: "active", stripeSubscriptionId: null },
    ],
    funnel: [{ day: "2026-10-25", step: "checkout_paid", count: 1 }, { day: "2026-09-01", step: "checkout_paid", count: 4 }],
  }, now);
  assert.deepEqual(Object.keys(out), ["app", "currency", "paying_30d", "paying_prev_30d", "revenue_30d", "revenue_prev_30d",
    "repeat_payers_30d", "active_30d", "signups_30d", "paid_path_live_since", "notes"]);
  assert.equal(out.paying_30d, 1);
  assert.equal(out.active_30d, 1);
  assert.equal(out.signups_30d, 1);
  assert.equal(out.revenue_30d, null);
  assert.equal(out.paying_prev_30d, null);
  assert.equal(out.paid_path_live_since, PAID_PATH_LIVE_SINCE);
  assert.match(out.notes, /checkout_paid funnel events 30d: 1;/);
  assert.doesNotMatch(JSON.stringify(out), /@|sub_|u1|house/);
});
