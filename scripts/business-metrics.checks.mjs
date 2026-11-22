// node --test scripts/business-metrics.checks.mjs — pure parts of the business-loop money + moat probe (no network).
import assert from "node:assert/strict";
import test from "node:test";
import { PAID_PATH_LIVE_SINCE, generateCallsNote, isInternal, plannerErrorsNote, summarize } from "./business-metrics.mjs";

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
    "repeat_payers_30d", "active_30d", "signups_30d", "paid_path_live_since", "proprietary_rows_30d", "ugc_30d", "owned_audience",
    "in_person_30d", "notes"]);
  assert.equal(out.paying_30d, 1);
  assert.equal(out.active_30d, 1);
  assert.equal(out.signups_30d, 1);
  assert.equal(out.revenue_30d, null);
  assert.equal(out.paying_prev_30d, null);
  assert.equal(out.paid_path_live_since, PAID_PATH_LIVE_SINCE);
  assert.match(out.notes, /checkout_paid funnel events 30d: 1 \(stripe 1\);/); // no source = older webhook row
  assert.match(out.notes, /checkout_start funnel events 30d: 0;/);
  assert.doesNotMatch(JSON.stringify(out), /@|sub_|u1|house/);
});

test("moat fields count our own records and outside user content only", () => {
  const base = { users, sessions: [], subscriptions: [], funnel: [] };
  const viral = { events: {
    a: { firstSeen: "2026-10-28T00:00:00Z", places: { x: { status: "created" }, y: { status: "matched" }, z: { status: "review" } } },
    b: { firstSeen: "2026-08-01T00:00:00Z", places: { x: { status: "created" } } },
  } };
  const out = summarize({ ...base,
    links: [{ authUserId: "house", ownerId: "user_legacy_house" }],
    ugc: [{ uid: "u1", at: "2026-10-29T00:00:00Z" }, { uid: "u1", at: "2026-09-01T00:00:00Z" },
      { uid: "house", at: "2026-10-29T00:00:00Z" }, { uid: "user_legacy_house", at: "2026-10-29T00:00:00Z" }, { uid: null, at: "2026-10-29T00:00:00Z" }],
    rankings: [{ created_at: "2026-10-27T00:00:00Z" }, { created_at: "2026-09-01T00:00:00Z" }],
    viral }, now);
  assert.equal(out.proprietary_rows_30d, 1 + 2 + 1);
  assert.equal(out.ugc_30d, 1);
  assert.equal(out.owned_audience, null);
  assert.equal(out.in_person_30d, null);
  assert.equal(summarize(base, now).proprietary_rows_30d, null); // no scout archive on this host = unknown
  assert.doesNotMatch(JSON.stringify(out), /@|u1|house|user_legacy/);
});

test("owned audience = confirmed Localley newsletter subscribers, own addresses out; unreadable table stays null", () => {
  const base = { users, sessions: [], subscriptions: [], funnel: [] };
  const t = (iso) => Date.parse(iso) / 1000;
  const subscribers = [
    { email: "a@example.com", status: "confirmed", created_at: t("2026-10-25T00:00:00Z") },
    { email: "b@example.com", status: "confirmed", created_at: t("2026-01-01T00:00:00Z") },
    { email: "c@example.com", status: "pending", created_at: t("2026-10-30T00:00:00Z") },
    { email: "d@example.com", status: "unsubscribed", created_at: t("2026-10-30T00:00:00Z") },
    { email: "nkopp@my-goodlife.com", status: "confirmed", created_at: t("2026-11-01T00:00:00Z") },
    { email: "hello@localley.io", status: "confirmed", created_at: t("2026-11-01T00:00:00Z") },
  ];
  const out = summarize({ ...base, subscribers }, now);
  assert.equal(out.owned_audience, 2);
  assert.match(out.notes, /Localley newsletter.*\(3 signups 30d\)/);
  assert.doesNotMatch(JSON.stringify(out), /@/);
  assert.equal(summarize({ ...base, subscribers: [] }, now).owned_audience, 0);
  assert.equal(summarize({ ...base, subscribers: null }, now).owned_audience, null);
});

test("notes show the last counted event day; a failed read stays unknown", () => {
  const out = summarize({ users, sessions: [], subscriptions: [], funnel: [], lastEvent: { funnel: "2026-10-30", cards: null } }, now);
  assert.match(out.notes, /last counted event day \(UTC; own checks are not counted\): funnel 2026-10-30, spot cards unknown;/);
  assert.match(summarize({ users, sessions: [], subscriptions: [], funnel: [] }, now).notes, /funnel unknown, spot cards unknown;/);
});

test("Push BW2: checkout starts 30d by source next to checkout_paid", () => {
  const funnel = [
    { day: "2026-10-25", step: "checkout_paid", source: "stripe", count: 1 },
    { day: "2026-10-20", step: "checkout_start", source: "pricing", count: 3 },
    { day: "2026-10-21", step: "checkout_start", source: "pricing", count: 2 },
    { day: "2026-10-22", step: "checkout_start", source: "preview", count: 1 },
    { day: "2026-09-01", step: "checkout_start", source: "pricing", count: 9 }, // older than 30 days
    { day: "2026-10-23", step: "preview_view", source: "preview", count: 7 },
  ];
  const out = summarize({ users, sessions: [], subscriptions: [], funnel }, now);
  assert.match(out.notes, /checkout_paid funnel events 30d: 1 \(stripe 1\); checkout_start funnel events 30d: 6 \(preview 1, pricing 5\);/);
});

test("Push BX3: checkout_paid 30d by start page; none -> plain 0", () => {
  const funnel = [
    { day: "2026-10-24", step: "checkout_paid", source: "pricing", count: 2 },
    { day: "2026-10-25", step: "checkout_paid", source: "preview", count: 1 },
    { day: "2026-10-26", step: "checkout_paid", source: "stripe", count: 1 },
    { day: "2026-09-01", step: "checkout_paid", source: "pricing", count: 5 }, // older than 30 days
  ];
  assert.match(summarize({ users, sessions: [], subscriptions: [], funnel }, now).notes,
    /checkout_paid funnel events 30d: 4 \(preview 1, pricing 2, stripe 1\);/);
  assert.match(summarize({ users, sessions: [], subscriptions: [], funnel: [] }, now).notes,
    /checkout_paid funnel events 30d: 0; checkout_start funnel events 30d: 0;/);
});

test("Push CC3: notes carry the Google index count, or unknown without a run", () => {
  const base = { users, sessions: [], subscriptions: [], funnel: [] };
  assert.match(summarize(base, now).notes, /google index of money\/entry pages: unknown \(no index-status run\);/);
  const indexStatus = { summary: { at: "2026-10-27T06:40:00Z", line: "indexed 14/20" } };
  assert.match(summarize({ ...base, indexStatus }, now).notes, /google index of money\/entry pages: indexed 14\/20 \(URL Inspection 2026-10-27\);/);
});

test("real generate calls: own servers, check header and verified bots are not visitors (push CE3)", () => {
  const call = (cf, status = 200, method = "POST") => ({ $workers: { event: { request: { method, cf }, response: { status } } } });
  const note = generateCallsNote([
    call({ asn: 24940 }),
    call({ asn: 7922, requestHeaderNames: ["x-localley-check"] }),
    call({ asn: 15169, verifiedBotCategory: "Search Engine Crawler" }),
    call({ asn: 7922 }),
    call({ asn: 4766 }, 429),
    call({ asn: 4766 }, 200, "GET"),
    { $workers: { event: {} } },
    { $workers: { event: { request: { method: "POST" } } } }, // a log line of a call: no cf
  ]);
  assert.equal(note, "2 (ok 1, own checks 2, verified bots 1 excluded)");
  assert.equal(generateCallsNote(null), "unknown: Worker log unreadable");
  assert.equal(generateCallsNote([]), "0 (ok 0, own checks 0, verified bots 0 excluded)");
});

test("the generate note is in the probe only when the log was read", () => {
  const base = { users: [], sessions: [], subscriptions: [], funnel: [] };
  assert.doesNotMatch(summarize(base, now).notes, /generate calls/);
  assert.match(summarize({ ...base, generateLog: [] }, now).notes, /real trip generate calls 7d \(Worker log\): 0 \(ok 0/);
  assert.match(summarize({ ...base, generateLog: null }, now).notes, /generate calls 7d \(Worker log\): unknown/);
});

test("planner no-spots errors count per city, own checks apart (push CG3)", () => {
  const line = (source) => ({ source: { message: "[generate] outcome", ...source }, $workers: { event: { request: { method: "POST" } } } });
  const note = plannerErrorsNote([
    line({ status: 422, reason: "no_spots", city: "canggu", suggestion: true }),
    line({ status: 422, reason: "no_spots", city: "canggu", suggestion: false }),
    line({ status: 422, reason: "no_spots", city: "taipei", suggestion: true }),
    line({ status: 422, reason: "no_spots", city: "tokyo", check: true }),
    line({ status: 422, reason: "no_spots" }), // before CG3: no city
    line({ status: 422, reason: "no_spots", city: "<script>" }),
    line({ status: 422, reason: "invalid_input", city: "seoul" }),
    line({ status: 200, reason: "ok", city: "seoul" }),
    { source: { message: "other", status: 422, reason: "no_spots", city: "x" } },
    { $workers: { event: { request: { method: "POST", cf: {} } } } },
  ]);
  assert.equal(note, "5 (canggu 2, unknown 2, taipei 1), smaller plan offered 2, own checks 1 excluded");
  assert.equal(plannerErrorsNote(null), "unknown: Worker log unreadable");
  assert.equal(plannerErrorsNote([]), "0, smaller plan offered 0, own checks 0 excluded");
});
