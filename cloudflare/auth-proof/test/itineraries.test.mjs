import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isBoundedJSON, isEditableItineraryPlan } from "./plan-contract.mjs";

// Trusted fixture recipe only. No HTTP seed controls and no legacy production data.
export async function itineraryTests(t, { db, call, post, signup, login, mail, alice, aliceCookie, bobCookie }) {
  const base = "/api/itineraries";
  const session = async (cookie = aliceCookie) => (await call("/api/session", { cookie })).json();
  const identity = await session();
  const owner = identity.ownerId;
  const headers = { "x-localley-session-id": identity.sessionId };
  const seed = async (overrides = {}) => {
    const row = { id: randomUUID(), ownerId: owner, title: "Synthetic trip", city: "Seoul", days: 7,
      activities: JSON.stringify([{ day: 1, notes: "day note", custom: { b: 2, a: 1 }, activities: [{ name: "Synthetic stop", title: "Unknown title", notes: "keep", coords: { lat: 37, lng: 127 }, spotId: randomUUID(), unknown: [null, true, 3] }] }]),
      highlights: null, estimated_cost: "", subtitle: "Synthetic only", local_score: 4.5,
      created_at: "2026-09-11T01:02:03.004Z", status: "draft", is_favorite: 1, ...overrides };
    await db.prepare(`INSERT INTO itineraries (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`).bind(...Object.values(row)).run();
    return row.id;
  };
  const raw = (id) => db.prepare("SELECT * FROM itineraries WHERE id = ? AND ownerId = ?").bind(id, owner).first();
  const detail = async (id, cookie = aliceCookie) => (await call(`${base}/${id}`, { cookie })).json();
  const snapshot = (row) => Object.fromEntries(["title", "city", "activities", "highlights", "estimated_cost"].map((key) => [key, row[key]]));
  const body = async (id, overrides = {}) => {
    const row = await detail(id);
    return { title: "Edited trip", city: "Seoul", days: Array.isArray(row.activities) ? row.activities : [], expected: snapshot(row), ...overrides };
  };
  const patch = async (id, value, options = {}) => {
    const response = await call(`${base}/${id}/update`, { method: "PATCH", cookie: aliceCookie, headers, body: value, ...options });
    if (response.status === 200) {
      const { itinerary } = await response.clone().json();
      assert.equal(isEditableItineraryPlan(itinerary.activities), true, "Every accepted PATCH must remain editable");
      assert.ok(Number.isSafeInteger(itinerary.days) && itinerary.days > 0);
      assert.ok(typeof itinerary.title === "string" && itinerary.title.trim());
      assert.ok(typeof itinerary.city === "string" && itinerary.city.trim());
      assert.equal(itinerary.ownerId, owner);
    }
    return response;
  };
  const remove = (id, options = {}) => call(`${base}/${id}`, { method: "DELETE", cookie: aliceCookie, headers, ...options });
  const rows = async () => (await db.prepare("SELECT * FROM itineraries ORDER BY id").all()).results;
  const effects = () => Promise.all(["owner_limits", "saved_spots", "application_outbox", "local_outbox"].map(async (table) =>
    (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));

  await t.test("itinerary collection paginates owned history and detail hides foreign rows", async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await seed());
    const foreign = await seed({ ownerId: (await session(bobCookie)).ownerId });
    const found = [];
    let offset = 0;
    do {
      const response = await call(`${base}?limit=2&offset=${offset}`, { cookie: aliceCookie });
      assert.equal(response.status, 200);
      const page = await response.json();
      assert.ok(page.itineraries.length <= 2);
      for (const summary of page.itineraries) {
        const { activities, ...metadata } = await detail(summary.id);
        assert.ok(activities);
        assert.deepEqual(summary, metadata);
        assert.equal(Object.hasOwn(summary, "activities"), false);
      }
      found.push(...page.itineraries.map((row) => row.id));
      offset = page.nextOffset;
    } while (offset !== null);
    assert.deepEqual(found, ids.sort().reverse());
    const row = await detail(ids[0]);
    assert.deepEqual(Object.keys(row).sort(), ["id", "ownerId", "title", "city", "days", "activities", "highlights", "estimated_cost", "subtitle", "local_score", "created_at", "status", "is_favorite"].sort());
    assert.equal(row.ownerId, owner);
    assert.equal(row.days, 7);
    assert.equal(row.is_favorite, true);
    assert.equal(row.created_at, "2026-09-11T01:02:03.004Z");
    for (const id of [foreign, randomUUID()]) {
      for (const method of ["GET", "PATCH"]) {
        const response = method === "GET" ? await call(`${base}/${id}`, { cookie: aliceCookie }) : await patch(id, await body(ids[0]));
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { error: "Not found" });
      }
    }
    for (const query of ["limit=0", "limit=26", "limit=101", "offset=-1", "offset=1.2", "limit=2&limit=3", "ownerId=forged", "offset=9007199254740992", "limit="]) {
      assert.equal((await call(`${base}?${query}`, { cookie: aliceCookie })).status, 400);
    }
    for (const path of ["/generate", "/share", "/status", `/${ids[0]}/share`, "/bad-id"]) {
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) assert.equal((await call(base + path, { method, cookie: aliceCookie, headers })).status, 404);
    }
    for (const method of ["POST", "DELETE"]) assert.equal((await call(base, { method, cookie: aliceCookie, headers })).status, 405);
    for (const method of ["POST", "PUT", "PATCH", "HEAD", "OPTIONS"]) assert.equal((await call(`${base}/${ids[0]}`, { method, cookie: aliceCookie, headers })).status, 405);
    assert.equal((await call(`${base}/${ids[0]}/update`, { method: "DELETE", cookie: aliceCookie, headers })).status, 405);
  });

  await t.test("itinerary summary default and maximum are 25 without reading stored plans", async () => {
    const ids = [];
    try {
      // Valid database JSON beyond the detail parser's depth limit must not affect summaries.
      for (let i = 0; i < 26; i++) ids.push(await seed({ created_at: "2027-01-01T00:00:00.000Z", activities: "[".repeat(70) + "null" + "]".repeat(70) }));
      for (const query of ["", "?limit=25"]) {
        const result = await (await call(base + query, { cookie: aliceCookie })).json();
        assert.equal(result.itineraries.length, 25);
        assert.equal(result.nextOffset, 25);
        assert.deepEqual(result.itineraries.map((row) => row.id), ids.toSorted().reverse().slice(0, 25));
        assert.ok(result.itineraries.every((row) => !Object.hasOwn(row, "activities")));
      }
      const next = await (await call(base + "?offset=25", { cookie: aliceCookie })).json();
      assert.equal(next.itineraries[0].id, ids.toSorted()[0]);
    } finally {
      for (const id of ids) await db.prepare("DELETE FROM itineraries WHERE id = ? AND ownerId = ?").bind(id, owner).run();
    }
  });

  await t.test("itinerary summary UTF8 budget returns contiguous prefixes and explicit oversized-row errors", async () => {
    const ids = [];
    try {
      for (let i = 0; i < 3; i++) ids.push(await seed({ created_at: "2027-01-01T00:00:00.000Z", subtitle: "\ud55c".repeat(200000) }));
      const ordered = ids.toSorted().reverse();
      for (let offset = 0; offset < 3; offset++) {
        const response = await call(`${base}?limit=3&offset=${offset}`, { cookie: aliceCookie });
        assert.equal(response.status, 200);
        const text = await response.text();
        assert.ok(Buffer.byteLength(text) <= 1024 * 1024);
        const page = JSON.parse(text);
        assert.equal(page.itineraries[0].id, ordered[offset]);
        assert.equal(page.itineraries[0].subtitle, "\ud55c".repeat(200000));
        assert.equal(page.nextOffset, offset + page.itineraries.length);
        if (offset < 2) assert.equal(page.itineraries.length, 1);
      }
      // Escaping also consumes bytes. Two 300K quote strings cannot fit one response.
      for (const id of ids) await db.prepare("UPDATE itineraries SET subtitle = ? WHERE id = ? AND ownerId = ?").bind('"'.repeat(300000), id, owner).run();
      const escapedResponse = await call(`${base}?limit=3`, { cookie: aliceCookie });
      const escapedText = await escapedResponse.text();
      assert.ok(Buffer.byteLength(escapedText) <= 1024 * 1024);
      assert.equal(JSON.parse(escapedText).itineraries.length, 1);
      assert.equal(JSON.parse(escapedText).nextOffset, 1);
      await db.prepare("UPDATE itineraries SET subtitle = ? WHERE id = ? AND ownerId = ?").bind("\ud55c".repeat(360000), ordered[1], owner).run();
      const prefix = await (await call(`${base}?limit=3`, { cookie: aliceCookie })).json();
      assert.deepEqual(prefix.itineraries.map((row) => row.id), [ordered[0]]);
      assert.equal(prefix.nextOffset, 1);
      const oversized = await call(`${base}?offset=1`, { cookie: aliceCookie });
      assert.equal(oversized.status, 413);
      assert.deepEqual(await oversized.json(), { error: "Itinerary summary exceeds response budget" });
      // A foreign oversized summary must not affect this owner's page.
      assert.equal((await call(base, { cookie: bobCookie })).status, 200);
    } finally {
      for (const id of ids) await db.prepare("DELETE FROM itineraries WHERE id = ? AND ownerId = ?").bind(id, owner).run();
    }
  });

  await t.test("itinerary concurrent edits yield one success and one conflict; immutable and unknown fields survive", async () => {
    const id = await seed();
    const before = await raw(id);
    const input = await body(id, { insights: [{ text: "Synthetic tip", kind: "tip", custom: { keep: [1, null] } }], highlights: [], estimated_cost: "NULL" });
    const responses = await Promise.all([patch(id, input), patch(id, { ...input, title: "Other edit" })]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const success = await responses.find((r) => r.status === 200).json();
    assert.equal(success.success, true);
    assert.deepEqual(success.itinerary, await detail(id));
    const after = await raw(id);
    for (const key of ["id", "ownerId", "days", "subtitle", "local_score", "created_at", "status", "is_favorite"]) assert.equal(after[key], before[key]);
    assert.deepEqual(success.itinerary.activities, { dailyPlans: JSON.parse(before.activities), insights: input.insights });
    assert.deepEqual(success.itinerary.highlights, []);
    assert.equal(success.itinerary.estimated_cost, "NULL");
  });

  for (const field of ["title", "city", "activities", "highlights", "estimated_cost"]) {
    await t.test(`itinerary stale ${field} snapshot rejects without writes`, async () => {
      const id = await seed();
      const input = await body(id);
      const changed = { title: "Different", city: "Busan", activities: "[]", highlights: "[]", estimated_cost: null }[field];
      await db.prepare(`UPDATE itineraries SET ${field} = ? WHERE id = ? AND ownerId = ?`).bind(changed, id, owner).run();
      const before = await raw(id);
      assert.equal((await patch(id, input)).status, 409);
      assert.deepEqual(await raw(id), before);
    });
  }

  await t.test("itinerary semantic JSON ignores nested key order but preserves array order and scalar types", async () => {
    const id = await seed({ activities: '[{"day":1,"activities":[],"extra":{"b":2,"a":[1,2]}}]' });
    const input = await body(id);
    input.expected.activities = [{ extra: { a: [1, 2], b: 2 }, activities: [], day: 1 }];
    assert.equal((await patch(id, input)).status, 200);
    for (const value of [[2, 1], ["1", 2], [1, null]]) {
      const next = await body(id);
      next.expected.activities[0].extra.a = value;
      const before = await raw(id);
      assert.equal((await patch(id, next)).status, 409);
      assert.deepEqual(await raw(id), before);
    }
  });

  await t.test("itinerary nullable snapshots preserve SQL null, empty arrays, empty strings and literal NULL", async () => {
    const id = await seed({ title: null, city: null, activities: "null", estimated_cost: null });
    assert.deepEqual(snapshot(await detail(id)), { title: null, city: null, activities: null, highlights: null, estimated_cost: null });
    assert.equal((await patch(id, await body(id))).status, 200);
    assert.equal((await raw(id)).highlights, "[]");
    assert.equal((await raw(id)).estimated_cost, null);
    for (const value of ["", "NULL", null]) {
      assert.equal((await patch(id, await body(id, { estimated_cost: value, highlights: [] }))).status, 200);
      assert.equal((await raw(id)).estimated_cost, value || null);
      assert.equal((await raw(id)).highlights, "[]");
    }
    const input = await body(id);
    input.expected.highlights = null;
    assert.equal((await patch(id, input)).status, 409);
  });

  await t.test("itinerary PATCH replacement defaults match legacy while expected raw values stay distinct", async () => {
    for (const oldCost of [null, "", "NULL", "100 KRW"]) {
      const id = await seed({ highlights: '["old"]', estimated_cost: oldCost });
      const input = await body(id);
      assert.equal(input.expected.estimated_cost, oldCost);
      const before = await raw(id);
      assert.equal((await patch(id, { ...input, highlights: null })).status, 400);
      assert.deepEqual(await raw(id), before);
      const stale = { ...input, expected: { ...input.expected, estimated_cost: oldCost === null ? "" : null } };
      assert.equal((await patch(id, stale)).status, 409);
      assert.deepEqual(await raw(id), before);
      assert.equal((await patch(id, input)).status, 200);
      assert.equal((await raw(id)).highlights, "[]");
      assert.equal((await raw(id)).estimated_cost, null);
      for (const cost of ["", null, "NULL", " "]) {
        const response = await patch(id, await body(id, { highlights: ["new"], estimated_cost: cost }));
        assert.equal(response.status, 200);
        const saved = (await response.json()).itinerary;
        assert.deepEqual(saved.highlights, ["new"]);
        assert.equal(saved.estimated_cost, cost || null);
      }
    }
  });

  await t.test("itinerary invalid snapshots, forged identity, malformed JSON, nonfinite and deep JSON fail safely", async () => {
    const id = await seed();
    const input = await body(id);
    const before = await raw(id);
    const missing = { ...input }; delete missing.expected;
    assert.equal((await patch(id, missing)).status, 428);
    for (const expected of [null, [], {}, { ...input.expected, title: 2 }, { ...input.expected, highlights: {} }, { ...input.expected, extra: true }]) {
      assert.equal((await patch(id, { ...input, expected })).status, 400);
    }
    for (const key of ["ownerId", "authUserId", "user_id", "daysNumber", "status"]) assert.equal((await patch(id, { ...input, [key]: "forged" })).status, 400);
    for (const extra of [{ days: [{}] }, { days: [{ day: 1, activities: [null] }] }, { insights: {} }, { highlights: [3] }]) assert.equal((await patch(id, { ...input, ...extra })).status, 400);
    assert.equal((await patch(id, undefined, { raw: "{" })).status, 400);
    assert.equal((await patch(id, undefined, { raw: JSON.stringify(input).replace('"day":1', '"day":1e999') })).status, 400);
    let nested = null;
    for (let i = 0; i < 66; i++) nested = [nested];
    assert.equal((await patch(id, { ...input, insights: [nested] })).status, 400);
    assert.deepEqual(await raw(id), before);
  });

  await t.test("editable plan contract rejects invalid rendered fields without changing rows", async () => {
    const id = await seed(), input = await body(id), before = await rows(), untouched = await effects();
    const day = { day: 1, activities: [{ name: "Synthetic stop" }] };
    const invalid = [
      ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"].map((number) => ({ days: [{ ...day, day: number }] })),
      { days: [day, day] }, { days: JSON.stringify([day]) }, { days: [{ ...day, theme: 4 }] },
      ...[{}, { name: null }, { name: 3 }, { name: "" }, { name: " \t\n" }].map((activity) => ({ days: [{ ...day, activities: [activity] }] })),
      ...["spotId", "description", "time", "duration", "cost", "address", "type", "category"].map((key) => ({ days: [{ ...day, activities: [{ name: "Stop", [key]: {} }] }] })),
      ...["lat", "lng", "localleyScore"].map((key) => ({ days: [{ ...day, activities: [{ name: "Stop", [key]: "37" }] }] })),
      ...[null, {}, "[]", [null], [{}], [{ text: 1 }], [{ text: "tip", id: 1 }], [{ text: "tip", label: [] }], [{ text: "tip", kind: {} }]].map((insights) => ({ insights })),
      { title: " " }, { city: "" },
    ];
    for (const extra of invalid) {
      assert.equal((await patch(id, { ...input, ...extra })).status, 400, JSON.stringify(extra));
      assert.deepEqual(await rows(), before);
    }
    for (const key of ["lat", "lng", "localleyScore", "unknown"]) {
      const raw = JSON.stringify({ ...input, days: [{ ...day, activities: [{ name: "Stop", [key]: "NONFINITE" }] }] }).replace('"NONFINITE"', '1e999');
      assert.equal((await patch(id, undefined, { raw })).status, 400);
    }
    assert.deepEqual(await rows(), before);
    assert.deepEqual(await effects(), untouched);
  });

  await t.test("shared plan contract parses legacy strings strictly and preserves metadata and raw snapshots", async () => {
    const days = [{ day: Number.MAX_SAFE_INTEGER, theme: null, unknown: { order: [2, 1] }, activities: [{ name: " Stop ", lat: 37, lng: 127,
      localleyScore: 4.5, cost: null, unknown: { keep: true } }] }];
    const plan = { dailyPlans: days, insights: [{ text: "", id: null, label: "Tip", kind: "custom", unknown: [null] }], unknown: { keep: [1] } };
    const legacy = JSON.stringify(plan);
    for (const value of [days, plan, legacy, [], "[]"]) assert.equal(isEditableItineraryPlan(value), true);
    for (const value of [null, {}, "", "null", "{}", "[", legacy + "garbage", JSON.stringify(legacy)]) assert.equal(isEditableItineraryPlan(value), false);
    let nested = null;
    for (let i = 0; i < 64; i++) nested = [nested];
    assert.equal(isBoundedJSON(nested), true);
    assert.equal(isBoundedJSON([nested]), false);
    assert.equal(isEditableItineraryPlan({ ...plan, unknown: nested }), false);
    for (const value of [NaN, Infinity, -Infinity, undefined]) assert.equal(isBoundedJSON(value), false);
    assert.equal(JSON.stringify(plan), legacy, "Validation never mutates metadata");
    const id = await seed({ title: null, city: null, activities: JSON.stringify(legacy) });
    const input = await body(id, { days, insights: plan.insights });
    assert.equal(input.expected.activities, legacy);
    const before = await raw(id);
    assert.equal((await patch(id, { ...input, expected: { ...input.expected, activities: plan } })).status, 409);
    assert.deepEqual(await raw(id), before);
    assert.equal((await patch(id, input)).status, 200);
    assert.deepEqual((await detail(id)).activities, { dailyPlans: days, insights: plan.insights });
    assert.equal((await patch(id, await body(id, { days: [] }))).status, 200);
    assert.deepEqual((await detail(id)).activities, []);
  });

  await t.test("invalid immutable day metadata requires repair, not an uneditable successful write", async () => {
    for (const days of [0, Number.MAX_SAFE_INTEGER + 1]) {
      const id = await seed({ days }), before = await raw(id);
      const response = await patch(id, await body(id));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "Itinerary metadata requires repair" });
      assert.deepEqual(await raw(id), before);
    }
  });

  await t.test("malformed UTF8 in non-auth JSON returns a specific 400 without writes", async () => {
    const id = await seed(), input = await body(id), before = await rows(), untouched = await effects();
    for (const bytes of [[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xe2, 0x82]]) {
      const encoded = JSON.stringify({ ...input, title: "UTF8_MARKER" });
      const [prefix, suffix] = encoded.split("UTF8_MARKER");
      const raw = Buffer.concat([Buffer.from(prefix), Buffer.from(bytes), Buffer.from(suffix)]);
      const response = await patch(id, undefined, { raw });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "Invalid UTF-8" });
    }
    const note = await call("/api/private-notes", { method: "POST", cookie: aliceCookie,
      raw: Buffer.concat([Buffer.from('{"body":"'), Buffer.from([0xff]), Buffer.from('"}')]) });
    assert.equal(note.status, 400);
    assert.deepEqual(await note.json(), { error: "Invalid UTF-8" });
    assert.deepEqual(await rows(), before);
    assert.deepEqual(await effects(), untouched);
  });

  await t.test("itinerary Korean 42 and 56 stop snapshots exceed 16KiB and save intact; UTF8 cap is 512KiB", async () => {
    for (const stops of [42, 56]) {
      const days = Array.from({ length: 7 }, (_, day) => ({ day: day + 1, unknown: "keep", activities: Array.from({ length: stops / 7 }, () => ({ name: "\uc11c\uc6b8", title: "Unknown title", notes: "\ud55c\uad6d\uc5b4 \ud14c\uc2a4\ud2b8 ".repeat(80), coords: { lat: 37, lng: 127 }, spotId: randomUUID() })) }));
      const id = await seed({ activities: JSON.stringify(days) });
      const input = await body(id);
      assert.ok(Buffer.byteLength(JSON.stringify(input)) > 16 * 1024);
      assert.equal((await patch(id, input)).status, 200);
      assert.deepEqual((await detail(id)).activities, days);
    }
    const id = await seed();
    const input = await body(id);
    const encoded = JSON.stringify(input);
    assert.equal((await patch(id, undefined, { raw: encoded + " ".repeat(512 * 1024 - Buffer.byteLength(encoded)) })).status, 200);
    const before = await raw(id);
    const tooLarge = JSON.stringify({ ...await body(id), title: "\ud55c".repeat(180000) });
    assert.ok(tooLarge.length < 512 * 1024 && Buffer.byteLength(tooLarge) > 512 * 1024);
    assert.equal((await patch(id, undefined, { raw: tooLarge })).status, 413);
    for (const path of ["/api/auth/sign-in/email", "/api/private-notes", `${base}/${id}`]) {
      assert.equal((await call(path, { method: "PATCH", cookie: aliceCookie, raw: " ".repeat(16385) })).status, 413);
    }
    assert.deepEqual(await raw(id), before);
  });

  await t.test("itinerary session header fences reads optionally and mutations mandatorily without auth bypass", async () => {
    const id = await seed();
    const input = await body(id), before = await raw(id);
    for (const [cookie, guard, status] of [[aliceCookie, {}, 428], [aliceCookie, { "x-localley-session-id": "" }, 428],
      [aliceCookie, { "x-localley-session-id": "wrong" }, 409], [bobCookie, headers, 409], [undefined, headers, 401]]) {
      assert.equal((await patch(id, input, { cookie, headers: guard })).status, status);
    }
    for (const path of [base, `${base}/${id}`]) {
      assert.equal((await call(path, { cookie: aliceCookie })).status, 200);
      assert.equal((await call(path, { cookie: aliceCookie, headers: { "x-localley-session-id": "wrong" } })).status, 409);
    }
    assert.equal((await patch(id, input, { origin: "https://evil.test" })).status, 403);
    await db.prepare("UPDATE user SET emailVerified = 0 WHERE id = ?").bind(alice).run();
    try { assert.equal((await patch(id, input)).status, 403); }
    finally { await db.prepare("UPDATE user SET emailVerified = 1 WHERE id = ?").bind(alice).run(); }
    const profile = identity.userRecordId;
    await db.prepare("DELETE FROM profiles WHERE ownerId = ?").bind(owner).run();
    try { assert.equal((await patch(id, input)).status, 409); }
    finally { await db.prepare("INSERT INTO profiles VALUES (?, ?)").bind(profile, owner).run(); }
    assert.deepEqual(await raw(id), before);
  });

  await t.test("itinerary expired and revoked native sessions cannot write", async () => {
    const id = await seed();
    const before = await raw(id), input = await body(id);
    for (const expired of [true, false]) {
      const cookie = await login("alice@example.test");
      const current = await session(cookie);
      if (expired) await db.prepare("UPDATE session SET expiresAt = 0 WHERE id = ?").bind(current.sessionId).run();
      else await db.prepare("DELETE FROM session WHERE id = ?").bind(current.sessionId).run();
      assert.equal((await patch(id, input, { cookie, headers: { "x-localley-session-id": current.sessionId } })).status, 401);
      assert.equal((await call(`${base}/${id}`, { cookie })).status, 401);
    }
    const userId = await signup("itinerary-unlinked@example.test");
    await call((await mail(userId, "verify")).url);
    const cookie = await login("itinerary-unlinked@example.test");
    assert.equal((await patch(id, input, { cookie })).status, 409);
    assert.deepEqual(await raw(id), before);
  });

  await t.test("itinerary native D1 constraints and database faults fail closed", async () => {
    await assert.rejects(seed({ id: "bad" }));
    await assert.rejects(seed({ ownerId: "missing-owner" }));
    await assert.rejects(seed({ activities: "not-json" }));
    await assert.rejects(seed({ highlights: "null" }));
    const id = await seed(), input = await body(id), before = await raw(id);
    await db.exec("CREATE TRIGGER fixture_itinerary_failure BEFORE UPDATE ON itineraries BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
    try {
      assert.equal((await patch(id, input)).status, 500);
      assert.deepEqual(await raw(id), before);
    } finally { await db.exec("DROP TRIGGER fixture_itinerary_failure;"); }
    await db.exec("ALTER TABLE itineraries RENAME TO fixture_itineraries_unavailable;");
    try {
      for (const path of [base, `${base}/${id}`]) assert.equal((await call(path, { cookie: aliceCookie })).status, 500);
      assert.equal((await patch(id, input)).status, 500);
    } finally { await db.exec("ALTER TABLE fixture_itineraries_unavailable RENAME TO itineraries;"); }
  });

  await t.test("itinerary DELETE removes only the owned row, updates collection, and repeats without enumeration or side effects", async () => {
    const id = await seed({ created_at: "2028-01-01T00:00:00.000Z" });
    const foreign = await seed({ ownerId: (await session(bobCookie)).ownerId });
    const before = await rows(), untouched = await effects();
    assert.ok((await (await call(base, { cookie: aliceCookie })).json()).itineraries.some((row) => row.id === id));
    for (const target of [id.toUpperCase(), id, foreign, randomUUID()]) {
      const response = await remove(target);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true });
      assert.deepEqual(await rows(), before.filter((row) => row.id !== id));
      assert.deepEqual(await effects(), untouched);
    }
    assert.equal(await raw(id), null);
    assert.equal((await call(`${base}/${id}`, { cookie: aliceCookie })).status, 404);
    assert.ok(!(await (await call(base, { cookie: aliceCookie })).json()).itineraries.some((row) => row.id === id));
  });

  await t.test("itinerary DELETE requires current verified ready identity and preserves stale-session precedence", async () => {
    const id = await seed(), before = await rows();
    const userId = await signup("delete-unlinked@example.test");
    await call((await mail(userId, "verify")).url);
    const cookie = await login("delete-unlinked@example.test");
    const current = await session(cookie), untouched = await effects();
    for (const [options, status, code] of [
      [{ headers: {} }, 428, "session_required"],
      [{ headers: { "x-localley-session-id": "" } }, 428, "session_required"],
      [{ headers: { "x-localley-session-id": "wrong" } }, 409, "session_changed"],
      [{ cookie: bobCookie }, 409, "session_changed"],
      [{ cookie: undefined }, 401],
      [{ cookie }, 409, "session_changed"],
      [{ cookie, headers: { "x-localley-session-id": current.sessionId } }, 409],
    ]) {
      const response = await remove(id, options);
      assert.equal(response.status, status);
      if (code) assert.equal((await response.json()).error.code, code);
      assert.deepEqual(await rows(), before);
    }
    await db.prepare("UPDATE user SET emailVerified = 0 WHERE id = ?").bind(alice).run();
    try { assert.equal((await remove(id)).status, 403); }
    finally { await db.prepare("UPDATE user SET emailVerified = 1 WHERE id = ?").bind(alice).run(); }
    await db.prepare("DELETE FROM profiles WHERE ownerId = ?").bind(owner).run();
    try {
      const stale = await remove(id, { headers: { "x-localley-session-id": "wrong" } });
      assert.equal(stale.status, 409);
      assert.equal((await stale.json()).error.code, "session_changed");
      assert.equal((await remove(id)).status, 409);
    } finally { await db.prepare("INSERT INTO profiles VALUES (?, ?)").bind(identity.userRecordId, owner).run(); }
    assert.deepEqual(await rows(), before);
    assert.deepEqual(await effects(), untouched);
  });

  await t.test("itinerary DELETE rejects origins, queries, all body bytes and invalid paths without effects", async () => {
    const id = await seed(), before = await rows(), untouched = await effects();
    for (const origin of ["https://evil.test", ""]) assert.equal((await remove(id, { origin })).status, 403);
    for (const query of ["?ownerId=forged", "?expected={}", "?x", "?x=1&x=2"]) assert.equal((await remove(id + query)).status, 400);
    for (const raw of ["{}", " ", "\n\t", "null", "[]", "{", '{"ownerId":"forged"}', "x".repeat(16384)]) {
      assert.equal((await remove(id, { raw })).status, 400);
    }
    for (const [chunks, status] of [[["", " ", "{}"], 400], [["x".repeat(8192), "x".repeat(8193)], 413]]) {
      const raw = new ReadableStream({ start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      } });
      assert.equal((await remove(id, { raw, headers: { ...headers, "Content-Length": "0" } })).status, status);
    }
    for (const invalid of ["bad-id", `${id}/extra`, `${id}/`, "%27%20OR%201=1"]) assert.equal((await remove(invalid)).status, 404);
    assert.deepEqual(await rows(), before);
    assert.deepEqual(await effects(), untouched);
  });

  await t.test("itinerary DELETE retains the default whole-body deadline", async () => {
    const id = await seed(), before = await rows();
    const raw = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([32])); } });
    const start = performance.now();
    assert.equal((await remove(id, { raw })).status, 408);
    assert.ok(performance.now() - start >= 4900);
    assert.deepEqual(await rows(), before);
  });

  await t.test("itinerary DELETE database failure never reports successful deletion", async () => {
    const id = await seed(), before = await rows(), untouched = await effects();
    await db.exec("CREATE TRIGGER fixture_delete_failure BEFORE DELETE ON itineraries BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
    try {
      const response = await remove(id);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "Local proof failure" });
      assert.deepEqual(await rows(), before);
      assert.deepEqual(await effects(), untouched);
    } finally { await db.exec("DROP TRIGGER fixture_delete_failure;"); }
  });

  await t.test("itinerary DELETE targets current intent and PATCH cannot resurrect in either order or concurrently", async () => {
    const untouched = await effects();
    for (const order of ["patch-first", "delete-first", "concurrent", "concurrent", "concurrent"]) {
      const id = await seed(), input = await body(id);
      if (order === "patch-first") {
        assert.equal((await patch(id, input)).status, 200);
        assert.equal((await remove(id)).status, 200);
      } else if (order === "delete-first") {
        assert.equal((await remove(id)).status, 200);
        assert.equal((await patch(id, input)).status, 404);
      } else {
        const [deleted, edited] = await Promise.all([remove(id), patch(id, input)]);
        assert.equal(deleted.status, 200);
        assert.ok([200, 404].includes(edited.status));
      }
      assert.equal(await raw(id), null);
      assert.equal((await patch(id, input)).status, 404);
      assert.equal((await call(`${base}/${id}`, { cookie: aliceCookie })).status, 404);
    }
    assert.deepEqual(await effects(), untouched);
  });

  await t.test("itinerary zero UPDATE distinguishes owned conflict from deletion with owner-scoped existence", async () => {
    for (const deleted of [false, true]) {
      const id = await seed(), input = await body(id);
      await db.exec(`CREATE TRIGGER fixture_itinerary_zero BEFORE UPDATE ON itineraries BEGIN ${deleted ? "DELETE FROM itineraries WHERE id = OLD.id AND ownerId = OLD.ownerId;" : ""} SELECT RAISE(IGNORE); END;`);
      try { assert.equal((await patch(id, input)).status, deleted ? 404 : 409); }
      finally { await db.exec("DROP TRIGGER fixture_itinerary_zero;"); }
    }
  });
}
