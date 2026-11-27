// node --test scripts/business-metrics.checks.mjs — pure parts of the business-loop money + moat probe (no network).
import assert from "node:assert/strict";
import test from "node:test";
import { FUNNEL_REAL_SINCE, PAID_PATH_LIVE_SINCE, authAttemptsNote, bookingClicksNote, authLeadNote, externalArrivalsNote, isDevHost, landingGroup, generateCallsNote, isInternal, plannerErrorsNote, summarize } from "./business-metrics.mjs";

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
    { email: "a@example.com", status: "confirmed", source: "city-az", created_at: t("2026-10-25T00:00:00Z") },
    { email: "b@example.com", status: "confirmed", created_at: t("2026-01-01T00:00:00Z") },
    { email: "c@example.com", status: "pending", source: "city-az", created_at: t("2026-10-30T00:00:00Z") },
    { email: "d@example.com", status: "unsubscribed", created_at: t("2026-10-30T00:00:00Z") },
    { email: "nkopp@my-goodlife.com", status: "confirmed", source: "spot", created_at: t("2026-11-01T00:00:00Z") },
    { email: "hello@localley.io", status: "confirmed", created_at: t("2026-11-01T00:00:00Z") },
    { email: "delivered@resend.dev", status: "unsubscribed", source: "livetest", created_at: t("2026-10-30T00:00:00Z") },
  ];
  const out = summarize({ ...base, subscribers }, now);
  assert.equal(out.owned_audience, 2);
  // Push DQ2: 30-day sign-ups by form source, own addresses out, missing source = "site".
  assert.match(out.notes, /Localley newsletter.*\(3 signups 30d by source: city-az 2, site 1\)/);
  assert.doesNotMatch(out.notes, /spot 1|livetest/);
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
    { day: "2026-12-25", step: "checkout_paid", source: "stripe", count: 1 },
    { day: "2026-12-20", step: "checkout_start", source: "pricing", count: 3 },
    { day: "2026-12-21", step: "checkout_start", source: "pricing", count: 2 },
    { day: "2026-12-22", step: "checkout_start", source: "preview", count: 1 },
    { day: "2026-11-01", step: "checkout_start", source: "pricing", count: 9 }, // older than 30 days
    { day: "2026-12-23", step: "preview_view", source: "preview", count: 7 },
  ];
  const out = summarize({ users, sessions: [], subscriptions: [], funnel }, Date.parse("2026-12-31T12:00:00Z"));
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
  // The pre-CG3 line (no city, no check) has no fetch event in the log: unmatched (push DI1), not real.
  assert.equal(note, "4 (canggu 2, taipei 1, unknown 1), smaller plan offered 2, own checks 1 excluded, 1 old lines without their request excluded");
  assert.equal(plannerErrorsNote(null), "unknown: Worker log unreadable");
  assert.equal(plannerErrorsNote([]), "0, smaller plan offered 0, own checks 0 excluded");
});

test("Push CK2: a no-spots line counts as own when its request came from our ASN or sent the check header", () => {
  const fetch = (requestId, cf) => ({ $metadata: { requestId }, $workers: { event: { request: { method: "POST", cf } } } });
  const line = (requestId, source) => ({ source: { message: "[generate] outcome", status: 422, reason: "no_spots", ...source },
    $metadata: { requestId }, $workers: { event: { request: { method: "POST" } } } });
  const note = plannerErrorsNote([
    fetch("r1", { asn: 24940 }), line("r1", {}), // pre-CG3 own check: no city, no check flag
    fetch("r2", { asn: 7922, requestHeaderNames: ["x-localley-check"] }), line("r2", { city: "jeju" }),
    fetch("r3", { asn: 28573 }), line("r3", { city: "canggu" }), // a real visitor
    line("r4", { city: "nara" }), // fetch event outside the read window: counts as real
    fetch(undefined, { asn: 24940 }), line(undefined, {}), // no requestId: never matches, so an old line is unmatched
  ]);
  assert.equal(note, "2 (canggu 1, nara 1), smaller plan offered 0, own checks 2 excluded, 1 old lines without their request excluded");
});

test("Push DI1: a pre-CG3 line counts as real only while its fetch event is in the log and not own", () => {
  const fetch = (requestId, cf) => ({ $metadata: { requestId }, $workers: { event: { request: { method: "POST", cf } } } });
  const line = (requestId, source) => ({ source: { message: "[generate] outcome", status: 422, reason: "no_spots", ...source },
    $metadata: { requestId }, $workers: { event: { request: { method: "POST" } } } });
  // 2026-11-25: five pre-CG3 own-check lines whose fetch events had left the log read as "5 (unknown 5)".
  const gone = ["a", "b", "c", "d", "e"].map((id) => line(id, {}));
  assert.equal(plannerErrorsNote(gone), "0, smaller plan offered 0, own checks 0 excluded, 5 old lines without their request excluded");
  assert.equal(plannerErrorsNote([fetch("v", { asn: 28573 }), line("v", {})]), "1 (unknown 1), smaller plan offered 0, own checks 0 excluded");
  assert.equal(plannerErrorsNote([line("n", { city: "nara" })]), "1 (nara 1), smaller plan offered 0, own checks 0 excluded");
  assert.equal(plannerErrorsNote([line("k", { city: "kyoto", check: false })]), "1 (kyoto 1), smaller plan offered 0, own checks 0 excluded");
});

test("external arrivals: referrer hosts outside localley.io, own hosts and direct loads excluded (Push CM3)", () => {
  const rows = [
    { count: 9, dimensions: { refererHost: "www.bing.com" } },
    { count: 2, dimensions: { refererHost: "l.facebook.com" } },
    { count: 1, dimensions: { refererHost: "bing.com" } },
    { count: 40, dimensions: { refererHost: "www.localley.io" } },
    { count: 3, dimensions: { refererHost: "localley.io" } },
    { count: 20, dimensions: { refererHost: "" } },
    { count: 1, dimensions: {} },
  ];
  assert.equal(externalArrivalsNote(rows), "12 (bing.com 10, l.facebook.com 2) of 76 page loads");
  assert.equal(externalArrivalsNote([]), "0 of 0 page loads");
  assert.equal(externalArrivalsNote(null), "unknown");
  const line = summarize({ users, sessions: [], subscriptions: [], funnel: [], arrivals: rows }, now);
  assert.match(line.notes, /external arrivals 7d \(CF RUM, referrer not localley\.io\): 12 \(bing\.com 10, l\.facebook\.com 2\) of 76 page loads; /);
  assert.doesNotMatch(summarize({ users, sessions: [], subscriptions: [], funnel: [] }, now).notes, /external arrivals/);
});

test("auth attempts (Push CN1): real localley.io POSTs by kind, own checks and the preview host left out", () => {
  const ev = (url, { method = "POST", asn = 7922, status = 200, headers = [], cf = true } = {}) => ({
    $workers: { event: { request: { url, method, ...(cf ? { cf: { asn, requestHeaderNames: headers } } : {}) }, response: { status } } },
  });
  const events = [
    ev("https://www.localley.io/api/auth/sign-up/email"),
    ev("https://www.localley.io/api/auth/sign-up/email", { status: 422 }),
    ev("https://localley.io/api/auth/sign-in/email", { status: 401 }),
    ev("https://www.localley.io/api/auth/sign-in/social"),
    ev("https://www.localley.io/api/auth/sign-in/email", { asn: 24940 }),
    ev("https://www.localley.io/api/auth/sign-up/email", { headers: ["x-localley-check"] }),
    ev("https://localley-next-preview.nkopp.workers.dev/api/auth/sign-up/email"),
    ev("https://www.localley.io/api/auth/sign-in/email", { method: "GET" }),
    ev("https://www.localley.io/api/auth/sign-in/email", { cf: false }),
    ev("https://www.localley.io/api/auth/sign-out"),
    ev("https://evil.example/www.localley.io/api/auth/sign-up/email"),
  ];
  assert.equal(authAttemptsNote(events), "4 (sign-up email 2, sign-in email 1, social 1; non-2xx 2), own checks 2 excluded");
  assert.equal(authAttemptsNote([]), "0 (non-2xx 0), own checks 0 excluded");
  assert.equal(authAttemptsNote(null), "unknown: Worker log unreadable");
  const line = summarize({ users, sessions: [], subscriptions: [], funnel: [], authLog: events }, now);
  assert.match(line.notes, /real auth attempts 7d \(Worker log, POST \/api\/auth sign-up\/sign-in\): 4 \(sign-up email 2, /);
  assert.doesNotMatch(summarize({ users, sessions: [], subscriptions: [], funnel: [] }, now).notes, /auth attempts/);
});

test("planner lead (Push DB1/DG1): planner loads from /, /sign-in and /sign-up only, same origin only", () => {
  const row = (count, refererHost, refererPath, requestPath = "/itineraries/new") => ({ count, dimensions: { refererHost, refererPath, requestPath } });
  const rows = [
    row(10, "www.localley.io", "/sign-in"), row(3, "localley.io", "/sign-up/"), row(2, "www.localley.io", "/sign-up"),
    row(7, "www.localley.io", "/"), row(1, "localley.io", ""), row(2, "www.localley.io", "/blog/x"), row(6, "google.com", "/"), row(5, "bing.com", "/sign-in"), row(4, "www.localley.io", "/sign-in", "/spots"),
    row(1, "evil-localley.io", "/sign-in"),
  ];
  assert.equal(authLeadNote(rows), "home 8, sign-in 10, sign-up 5");
  assert.equal(authLeadNote([]), "home 0, sign-in 0, sign-up 0");
  assert.equal(authLeadNote(null), "unknown");
  const line = summarize({ users, sessions: [], subscriptions: [], funnel: [], authLead: rows }, now);
  assert.match(line.notes, /planner loads from home and the auth-page lead 7d \(CF RUM refererPath\): home 8, sign-in 10, sign-up 5; /);
  assert.doesNotMatch(summarize({ users, sessions: [], subscriptions: [], funnel: [] }, now).notes, /auth-page lead/);
});

test("external arrivals (Push DC1): dev and preview referrers count as dev, not as visitors", () => {
  for (const h of ["localhost", "localhost:3000", "127.0.0.1", "100.124.34.110", "app.local", "x.workers.dev", "y.vercel.app", "[::1]", "::1"]) assert.equal(isDevHost(h), true, h);
  for (const h of ["bing.com", "l.facebook.com", "domainlions.com", "", "1password.com"]) assert.equal(isDevHost(h), false, h);
  const r = (refererHost, count) => ({ count, dimensions: { refererHost } });
  const rows = [r("bing.com", 6), r("localhost", 3), r("127.0.0.1", 2), r("www.localley.io", 20), r("", 10), r("localley-preview.workers.dev", 1)];
  assert.equal(externalArrivalsNote(rows), "6 (bing.com 6) of 42 page loads, dev 6");
  assert.equal(externalArrivalsNote([r("bing.com", 1)]), "1 (bing.com 1) of 1 page loads");
});

test("external arrivals (Push DE1): landing paths grouped by page type, own and dev loads not counted", () => {
  const r = (refererHost, requestPath, count) => ({ count, dimensions: { refererHost, requestPath } });
  const rows = [r("www.bing.com", "/spots/gwangjang-market", 4), r("bing.com", "/spots/x-y/", 2), r("google.com", "/", 2),
    r("l.facebook.com", "/blog/paying-in-tokyo?fbclid=1", 2), r("google.com", "/itineraries/new", 1),
    r("www.localley.io", "/pricing", 30), r("localhost", "/help/faq", 3), r("", "/", 9)];
  assert.equal(externalArrivalsNote(rows), "11 (bing.com 6, google.com 3, l.facebook.com 2) of 53 page loads, landing /spots/* 6, / 2, /blog/* 2, /itineraries/new 1, dev 3");
  assert.equal(landingGroup("/Spots"), "/spots");
  assert.equal(landingGroup("/help/a/b"), "/help/*");
  assert.equal(landingGroup("//"), "/");
  assert.equal(landingGroup("/%3Cscript%3E/x"), "other");
});

test("planner_start and trip_generated by source 30d (Push DH1)", () => {
  const now = Date.parse("2026-12-30T12:00:00Z");
  const funnel = [
    { day: "2026-12-20", step: "planner_start", source: "home", count: 3 },
    { day: "2026-12-21", step: "planner_start", source: "direct", count: 1 },
    { day: "2026-12-22", step: "trip_generated", source: "home", count: 2 },
    { day: "2026-12-22", step: "plan_requested", source: "home", count: 1 }, // Push BH3
    { day: "2026-11-20", step: "planner_start", source: "home", count: 9 }, // older than 30 days
  ];
  const out = summarize({ users: [], sessions: [], subscriptions: [], funnel }, now);
  assert.match(out.notes, /checkout_start funnel events 30d: 0; planner_start funnel events 30d: 4 \(direct 1, home 3\); plan_requested funnel events 30d: 1 \(home 1\); trip_generated funnel events 30d: 2 \(home 2\);/);
  assert.equal(out.paying_30d, 0);
  assert.match(summarize({ users: [], sessions: [], subscriptions: [], funnel: [] }, now).notes, /planner_start funnel events 30d: 0; plan_requested funnel events 30d: 0; trip_generated funnel events 30d: 0;/);
});

test("booking clicks count by partner + placement; own, old, non-click and legacy rows handled", () => {
  const rows = [
    { partner: "viator", tracking_id: "viator-12345P1-spot", event_type: "click", clerk_user_id: "u1", created_at: "2026-10-31T10:00:00.000Z" },
    { partner: "viator", tracking_id: "viator-12345P1-spot", event_type: "click", clerk_user_id: null, created_at: "2026-10-30T10:00:00.000Z" },
    { partner: "viator", tracking_id: "viator-9X-itinerary", event_type: "click", clerk_user_id: null, created_at: "2026-10-29T10:00:00.000Z" },
    { partner: "viator", tracking_id: "abc123", event_type: "click", clerk_user_id: null, created_at: "2026-10-28T10:00:00.000Z" },
    { partner: "viator", tracking_id: "viator-1-spot", event_type: "click", clerk_user_id: "house", created_at: "2026-10-31T10:00:00.000Z" },
    { partner: "viator", tracking_id: "viator-1-spot", event_type: "view", clerk_user_id: null, created_at: "2026-10-31T10:00:00.000Z" },
    { partner: "viator", tracking_id: "viator-1-spot", event_type: "click", clerk_user_id: null, created_at: "2026-09-01T10:00:00.000Z" },
    { partner: "getyourguide", tracking_id: "getyourguide-d2-itinerary-day", event_type: "click", clerk_user_id: null, created_at: "2026-10-30T10:00:00.000Z" },
  ];
  assert.equal(bookingClicksNote(rows, new Set(["house"]), now), "5 (getyourguide itinerary-day 1, viator itinerary 1, viator legacy 1, viator spot 2)");
  assert.equal(bookingClicksNote([], new Set(), now), "0");
  assert.equal(bookingClicksNote(null, new Set(), now), "unknown: affiliate_clicks unreadable");
});

test("browser funnel steps count only from the own-check filter day; Stripe payments keep 30 days", () => {
  const at = Date.parse("2026-11-26T18:00:00Z");
  const funnel = [
    { day: "2026-11-03", step: "planner_start", source: "direct", count: 261 }, // check run before the filter
    { day: "2026-11-16", step: "planner_start", source: "direct", count: 5 },
    { day: "2026-11-17", step: "planner_start", source: "spots", count: 2 },
    { day: "2026-11-20", step: "checkout_start", source: "pricing", count: 1 },
    { day: "2026-11-05", step: "trip_generated", source: "direct", count: 3 },
    { day: "2026-11-05", step: "checkout_paid", source: "pricing", count: 1 },
  ];
  const out = summarize({ users, sessions: [], subscriptions: [], funnel }, at);
  assert.equal(FUNNEL_REAL_SINCE, "2026-11-17");
  assert.match(out.notes, /browser funnel steps counted from 2026-11-17 \(collector skips own checks since 2026-11-17\);/);
  assert.match(out.notes, /planner_start funnel events 30d: 2 \(spots 2\);/);
  assert.match(out.notes, /trip_generated funnel events 30d: 0;/);
  assert.match(out.notes, /checkout_start funnel events 30d: 1 \(pricing 1\);/);
  assert.match(out.notes, /checkout_paid funnel events 30d: 1 \(pricing 1\);/);
  // Once the filter day is older than 30 days, the plain 30-day window applies.
  const later = summarize({ users, sessions: [], subscriptions: [], funnel: [{ day: "2026-12-20", step: "planner_start", source: "home", count: 4 }] }, Date.parse("2026-12-30T00:00:00Z"));
  assert.match(later.notes, /browser funnel steps counted from 2026-11-30 /);
  assert.match(later.notes, /planner_start funnel events 30d: 4 \(home 4\);/);
});
