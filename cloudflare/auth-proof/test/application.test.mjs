import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { issueFixtureGrant } from "./fixture-issuer.mjs";

// Runs inside the existing isolated native workerd/D1 harness, not a replacement database.
export async function applicationTests(t, { db, call, post, signup, login, mail, alice, aliceCookie, bobCookie, claimSecret }) {
  const route = "/api/spots/save";
  const dto = async (cookie = aliceCookie) => (await call("/api/session", { cookie })).json();
  const owner = (await dto()).ownerId;
  const count = async (table) => (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n;
  const sessionHeaders = async (cookie = aliceCookie) => {
    const session = await dto(cookie);
    assert.equal(session.state, "ready");
    assert.ok(session.sessionId);
    return { "x-localley-session-id": session.sessionId };
  };
  const save = async (spotId, cookie = aliceCookie) => post(route, { spotId }, cookie, { headers: await sessionHeaders(cookie) });
  const unsave = async (spotId, cookie = aliceCookie) => call(route, { method: "DELETE", body: { spotId }, cookie, headers: await sessionHeaders(cookie) });
  const list = async (cookie = aliceCookie) => (await call(route, { cookie })).json();
  const state = async (spotId, cookie = aliceCookie) => (await call(route + "?spotId=" + spotId, { cookie })).json();
  const limit = (value) => db.prepare("UPDATE owner_limits SET savedSpotLimit = ? WHERE ownerId = ?").bind(value, owner).run();
  const clear = () => db.prepare("DELETE FROM saved_spots WHERE ownerId = ?").bind(owner).run();
  const bookmarkSnapshot = async () => Promise.all(["saved_spots", "application_outbox"].map(async (table) =>
    (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  const catalog = Array.from({ length: 14 }, () => randomUUID());
  const name = { en: "Synthetic test cafe", ko: "\uac00\uc0c1 \ud14c\uc2a4\ud2b8 \uce74\ud398" };
  const description = { en: "Synthetic catalog only. Not a real place.", ko: "\uc2e4\uc81c \uc7a5\uc18c\uac00 \uc544\ub2cc \uac00\uc0c1 \ub370\uc774\ud130" };
  await db.batch(catalog.map((id) => db.prepare("INSERT INTO spots VALUES (?, ?, ?, 'cafe', 4, '[]', 1)")
    .bind(id, JSON.stringify(name), JSON.stringify(description))));

  await t.test("application session UUID, neutral DTO, idempotent and concurrent atomic provisioning", async () => {
    const session = await dto();
    assert.deepEqual(Object.keys(session).sort(), ["authUserId", "ownerId", "sessionId", "state", "userRecordId"]);
    assert.equal(session.state, "ready");
    assert.equal(session.authUserId, alice);
    assert.match(session.userRecordId, /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    assert.notEqual(session.userRecordId, session.ownerId);
    assert.equal(typeof session.sessionId, "string");
    const credential = await db.prepare("SELECT token FROM session WHERE id = ?").bind(session.sessionId).first();
    assert.ok(!JSON.stringify(session).includes(credential.token));
    assert.equal((await db.prepare("SELECT savedSpotLimit FROM owner_limits WHERE ownerId = ?").bind(owner).first()).savedSpotLimit, 10);
    assert.deepEqual(await (await post("/api/account/new", {}, aliceCookie)).json(), { ownerId: owner, userRecordId: session.userRecordId });
    const id = await signup("concurrent-new@example.test");
    await call((await mail(id, "verify")).url);
    const cookie = await login("concurrent-new@example.test");
    const before = await count("owners");
    const responses = await Promise.all(Array.from({ length: 6 }, () => post("/api/account/new", {}, cookie)));
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 200, 200, 200, 200, 201]);
    const identities = await Promise.all(responses.map((r) => r.json()));
    assert.ok(identities.every((value) => JSON.stringify(value) === JSON.stringify(identities[0])));
    assert.equal(await count("owners"), before + 1);
    for (const table of ["profiles", "owner_limits", "identity_links"]) {
      assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ownerId = ?`).bind(identities[0].ownerId).first()).n, 1);
    }
  });

  await t.test("unlinked and incomplete identities fail closed; claim requires validated legacy profile and limit", async () => {
    const id = await signup("incomplete@example.test");
    await call((await mail(id, "verify")).url);
    const cookie = await login("incomplete@example.test");
    const initialSession = await dto(cookie);
    assert.equal(initialSession.state, "unlinked");
    const bookmarksBefore = await bookmarkSnapshot();
    const assertMutationDenied = async (status, code) => {
      for (const method of ["POST", "DELETE"]) {
        for (const headers of [{}, { "x-localley-session-id": "" }, { "x-localley-session-id": initialSession.sessionId }, { "x-localley-session-id": "wrong-session" }]) {
          const response = await call(route, { method, cookie, headers, body: { spotId: catalog[0] } });
          assert.equal(response.status, status);
          assert.equal((await response.json()).error.code, status === 409 && headers["x-localley-session-id"] === "wrong-session" ? "session_changed" : code);
          assert.deepEqual(await bookmarkSnapshot(), bookmarksBefore);
        }
      }
    };
    await assertMutationDenied(409, "conflict");
    for (const method of ["GET", "POST", "DELETE"]) assert.equal((await call(route, { method, cookie,
      ...(method === "GET" ? {} : { body: { spotId: catalog[0] } }) })).status, 409);
    const legacy = "synthetic/incomplete-owner";
    await db.prepare("INSERT INTO owners VALUES (?, 'legacy-fixture')").bind(legacy).run();
    await assert.rejects(issueFixtureGrant(db, claimSecret, id, legacy));
    const profile = randomUUID();
    await db.prepare("INSERT INTO profiles VALUES (?, ?)").bind(profile, legacy).run();
    await assert.rejects(issueFixtureGrant(db, claimSecret, id, legacy));
    await db.prepare("INSERT INTO owner_limits VALUES (?, 100)").bind(legacy).run();
    const grant = await issueFixtureGrant(db, claimSecret, id, legacy);
    await db.prepare("DELETE FROM profiles WHERE ownerId = ?").bind(legacy).run();
    assert.equal((await post("/api/account/claim", { token: grant }, cookie)).status, 409);
    await db.prepare("INSERT INTO profiles VALUES (?, ?)").bind(profile, legacy).run();
    await db.prepare("DELETE FROM owner_limits WHERE ownerId = ?").bind(legacy).run();
    assert.equal((await post("/api/account/claim", { token: grant }, cookie)).status, 409);
    await db.prepare("INSERT INTO owner_limits VALUES (?, 100)").bind(legacy).run();
    await db.prepare("INSERT INTO identity_links VALUES (?, ?)").bind(id, legacy).run();
    await db.prepare("DELETE FROM profiles WHERE ownerId = ?").bind(legacy).run();
    assert.equal((await dto(cookie)).state, "incomplete");
    await assertMutationDenied(409, "conflict");
    const before = await count("profiles");
    for (const path of [route, "/api/private-notes"]) assert.equal((await call(path, { cookie })).status, 409);
    assert.equal((await post("/api/account/new", {}, cookie)).status, 409);
    assert.equal(await count("profiles"), before);
    await db.prepare("INSERT INTO profiles VALUES (?, ?)").bind(profile, legacy).run();
    assert.equal((await dto(cookie)).userRecordId, profile);
    await db.prepare("UPDATE user SET emailVerified = 0 WHERE id = ?").bind(id).run();
    await assertMutationDenied(403, "forbidden");
    assert.equal((await call(route, { cookie })).status, 403);
    assert.equal((await call("/api/private-notes", { cookie })).status, 403);
  });

  await t.test("bookmark mutations require a nonempty matching native session without changing rows or events", async (guardTest) => {
    const oldSession = await dto();
    const newCookie = await login("alice@example.test");
    const newSession = await dto(newCookie);
    assert.notEqual(newCookie, aliceCookie);
    assert.notEqual(newSession.sessionId, oldSession.sessionId);
    assert.equal(newSession.ownerId, oldSession.ownerId);
    assert.equal((await save(catalog[13], newCookie)).status, 200);
    for (const method of ["POST", "DELETE"]) {
      const spotId = method === "POST" ? catalog[12] : catalog[13];
      for (const [label, cookie, headers, status, code] of [
        ["missing", newCookie, {}, 428, "session_required"],
        ["empty", newCookie, { "x-localley-session-id": "" }, 428, "session_required"],
        ["mismatch", newCookie, { "x-localley-session-id": newSession.sessionId + "-wrong" }, 409, "session_changed"],
        ["stale session with new cookie", newCookie, { "x-localley-session-id": oldSession.sessionId }, 409, "session_changed"],
        ["other owner session", newCookie, await sessionHeaders(bobCookie), 409, "session_changed"],
        ["header is not a credential", undefined, { "x-localley-session-id": newSession.sessionId }, 401, "unauthorized"],
        ["signed out without header", undefined, {}, 401, "unauthorized"],
      ]) {
        await guardTest.test(`${method}: ${label}`, async () => {
          const before = await bookmarkSnapshot();
          const response = await call(route, { method, cookie, headers, body: { spotId } });
          assert.equal(response.status, status);
          assert.deepEqual(await response.json(), { error: { code, message: status === 428
            ? "Refresh your session before trying again." : status === 401
              ? "Please sign in to continue." : "Your session changed. Refresh before trying again." } });
          assert.deepEqual(await bookmarkSnapshot(), before);
        });
      }
      await guardTest.test(`${method}: current cookie and exact session header`, async () => {
        const eventsBefore = await count("application_outbox");
        const response = await call(route, { method, cookie: newCookie, headers: await sessionHeaders(newCookie), body: { spotId } });
        assert.equal(response.status, 200);
        assert.deepEqual(await state(spotId, newCookie), { saved: method === "POST" });
        assert.deepEqual(await state(spotId, bobCookie), { saved: false });
        assert.equal(await count("application_outbox"), eventsBefore + (method === "POST" ? 1 : 0));
      });
    }
    assert.equal((await unsave(catalog[12], newCookie)).status, 200);
  });

  await t.test("saved GET rejects cookie B with observer A header without leaking cross-owner status", async () => {
    const observerA = await sessionHeaders();
    assert.equal((await save(catalog[12])).status, 200);
    const before = await bookmarkSnapshot();
    assert.deepEqual(await state(catalog[12]), { saved: true });
    assert.deepEqual(await state(catalog[12], bobCookie), { saved: false });
    for (const path of [route, route + "?spotId=" + catalog[12]]) {
      for (const headers of [observerA, { "x-localley-session-id": "wrong-session" }]) {
        const response = await call(path, { cookie: bobCookie, headers });
        assert.equal(response.status, 409, `Saved GET ${path === route ? "list" : "status"} rejects stale observer`);
        const data = await response.json();
        assert.equal(data.error.code, "session_changed");
        assert.deepEqual(Object.keys(data), ["error"]);
      }
      assert.equal((await call(path, { cookie: bobCookie })).status, 200);
      assert.equal((await call(path, { cookie: bobCookie, headers: await sessionHeaders(bobCookie) })).status, 200);
      const noCookie = await call(path, { headers: observerA });
      assert.equal(noCookie.status, 401);
      assert.equal((await noCookie.json()).error.code, "unauthorized");
    }
    assert.deepEqual(await bookmarkSnapshot(), before);
    assert.equal((await unsave(catalog[12])).status, 200);
  });

  await t.test("unsupported private APIs stay native 404 for a verified mapped account", async () => {
    assert.equal((await dto()).state, "ready");
    const before = await bookmarkSnapshot();
    for (const path of ["/api/subscription", "/api/connect", "/api/gamification", "/api/itineraries"]) {
      for (const suffix of ["", "/status"]) {
        for (const method of ["GET", "POST", "DELETE"]) {
          const response = await call(path + suffix, { method, cookie: aliceCookie, headers: await sessionHeaders() });
          if (path === "/api/itineraries" && !suffix) {
            assert.equal(response.status, method === "GET" ? 200 : method === "POST" ? 400 : 405);
            if (method === "GET") assert.deepEqual(await response.json(), { itineraries: [], nextOffset: null });
            continue;
          }
          assert.equal(response.status, 404);
          assert.deepEqual(await response.json(), { error: "Not found" });
        }
      }
    }
    assert.deepEqual(await bookmarkSnapshot(), before);
  });

  await t.test("same-save concurrency produces one row and event; UUID normalization and multilingual DTO", async () => {
    const before = await count("application_outbox");
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => save(i % 2 ? catalog[0].toUpperCase() : catalog[0])));
    assert.ok(responses.every((r) => r.status === 200));
    assert.equal(await count("application_outbox"), before + 1);
    assert.equal((await list()).spots.length, 1);
    const row = (await list()).spots[0];
    assert.equal(row.spot_id, catalog[0]);
    assert.deepEqual(row.spots, { id: catalog[0], name, description, category: "cafe", localley_score: 4, photos: [] });
    assert.deepEqual(await state(catalog[0].toUpperCase()), { saved: true });
    assert.ok(Number.isFinite(Date.parse(row.created_at)));
    const event = await db.prepare("SELECT * FROM application_outbox WHERE saveId = ?").bind(row.id).first();
    assert.equal(event.eventKey, row.id + ":save");
    assert.equal(event.ownerId, owner);
    assert.equal(event.spotId, catalog[0]);
  });

  await t.test("default ten, last-slot concurrency, duplicate at cap, and server-only 100/999 fixtures", async () => {
    for (const id of catalog.slice(1, 9)) assert.equal((await save(id)).status, 200);
    const before = await count("application_outbox");
    const responses = await Promise.all(catalog.slice(9, 11).map((id) => save(id)));
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 429]);
    assert.deepEqual(await responses.find((r) => r.status === 429).json(), { error: {
      code: "limit_exceeded", message: "You've reached your saved spots limit.",
      details: { limitType: "saved spots", current: 10, limit: 10 },
    } });
    assert.equal((await list()).spots.length, 10);
    assert.equal(await count("application_outbox"), before + 1);
    assert.equal((await save(catalog[0])).status, 200);
    assert.equal((await save(catalog[11])).status, 429);
    for (const value of [100, 999]) {
      await limit(value);
      assert.equal((await db.prepare("SELECT savedSpotLimit FROM owner_limits WHERE ownerId = ?").bind(owner).first()).savedSpotLimit, value);
      assert.equal((await save(catalog[11])).status, 200);
      await unsave(catalog[11]);
    }
    await limit(0);
    const zeroLimit = await save(catalog[11]);
    assert.equal(zeroLimit.status, 429);
    assert.deepEqual((await zeroLimit.json()).error.details, { limitType: "saved spots", current: 10, limit: 0 });
    assert.equal((await save(catalog[0])).status, 200);
    await limit(10);
  });

  await t.test("missing quota blocks only new writes; quota and outbox failures roll back", async () => {
    await db.prepare("DELETE FROM owner_limits WHERE ownerId = ?").bind(owner).run();
    assert.equal((await save(catalog[0])).status, 200);
    const unavailable = await save(catalog[12]);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: { code: "database_error", message: "Database operation failed. Please try again." } });
    assert.equal((await list()).spots.length, 10);
    assert.equal((await unsave(catalog[0])).status, 200);
    await db.prepare("INSERT INTO owner_limits VALUES (?, 10)").bind(owner).run();
    const before = await count("application_outbox");
    await db.exec("CREATE TRIGGER fixture_event_failure BEFORE INSERT ON application_outbox BEGIN SELECT RAISE(ABORT, 'synthetic event failure'); END;");
    try {
      const response = await save(catalog[12]);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { code: "internal_error", message: "An unexpected error occurred. Please try again." } });
      assert.deepEqual(await state(catalog[12]), { saved: false });
      assert.equal(await count("application_outbox"), before);
    } finally { await db.exec("DROP TRIGGER fixture_event_failure;"); }
    await db.exec("CREATE TRIGGER fixture_save_failure BEFORE INSERT ON saved_spots BEGIN SELECT RAISE(ABORT, 'synthetic save constraint failure'); END;");
    try {
      assert.equal((await save(catalog[12])).status, 500);
      assert.deepEqual(await state(catalog[12]), { saved: false });
      assert.equal(await count("application_outbox"), before);
    } finally { await db.exec("DROP TRIGGER fixture_save_failure;"); }
    await limit(9);
    assert.equal((await save(catalog[12])).status, 429);
    assert.deepEqual(await state(catalog[12]), { saved: false });
    assert.equal(await count("application_outbox"), before);
    await limit(10);
  });

  await t.test("second-user isolation, strict fields, origins, invalid UUIDs and no public quota setter", async () => {
    assert.deepEqual(await state(catalog[1], bobCookie), { saved: false });
    assert.deepEqual((await list(bobCookie)).spots, []);
    assert.equal((await unsave(catalog[1], bobCookie)).status, 200);
    assert.deepEqual(await state(catalog[1]), { saved: true });
    const saveRow = (await list()).spots[0];
    assert.deepEqual(await state(saveRow.id, bobCookie), { saved: false });
    assert.equal((await unsave(saveRow.id, bobCookie)).status, 200);
    assert.deepEqual(await state(saveRow.spot_id), { saved: true });
    for (const field of ["ownerId", "owner", "saveRowId", "tier", "quota", "savedSpotLimit"]) {
      for (const method of ["POST", "DELETE"]) assert.equal((await call(route, { method, cookie: aliceCookie,
        headers: await sessionHeaders(),
        body: { spotId: catalog[1], [field]: field === "saveRowId" ? saveRow.id : "forged" } })).status, 400);
      assert.equal((await call(route + "?" + field + "=forged", { cookie: aliceCookie })).status, 400);
    }
    for (const spotId of ["bad", "' OR 1=1 --", 1, null]) assert.equal((await save(spotId)).status, 400);
    assert.equal((await call(route + "?spotId=bad", { cookie: aliceCookie })).status, 400);
    assert.equal((await call(route + "?spotId=" + catalog[0] + "&spotId=" + catalog[1], { cookie: aliceCookie })).status, 400);
    assert.equal((await call(route, { method: "POST", raw: "{", cookie: aliceCookie, headers: await sessionHeaders() })).status, 400);
    assert.equal((await post(route, { spotId: catalog[0] }, aliceCookie, { origin: "https://evil.test" })).status, 403);
    assert.equal((await post("/api/owner-limits", { savedSpotLimit: 999 }, aliceCookie)).status, 404);
    assert.equal((await call("/api/application-outbox", { cookie: aliceCookie })).status, 404);
  });

  await t.test("hidden and unknown are identical; saved hidden rows become tombstones; hard delete retains events", async () => {
    await db.prepare("UPDATE spots SET visible = 0 WHERE id IN (?, ?)").bind(catalog[1], catalog[12]).run();
    const hidden = await save(catalog[12]);
    const missing = await save(randomUUID());
    assert.equal(hidden.status, 404);
    assert.equal(missing.status, 404);
    const hiddenBody = await hidden.json();
    assert.deepEqual(hiddenBody, { error: { code: "not_found", message: "Spot not found." } });
    assert.deepEqual(hiddenBody, await missing.json());
    assert.deepEqual(await state(catalog[1]), { saved: true });
    const row = (await list()).spots.find((r) => r.spot_id === catalog[1]);
    assert.equal(row.spots, null);
    assert.equal((await save(catalog[1])).status, 200);
    assert.equal((await unsave(catalog[1])).status, 200);
    assert.equal((await unsave(catalog[1])).status, 200);
    assert.deepEqual(await state(catalog[1]), { saved: false });
    assert.ok(await db.prepare("SELECT eventKey FROM application_outbox WHERE saveId = ?").bind(row.id).first());
    assert.equal(await db.prepare("SELECT id FROM saved_spots WHERE id = ?").bind(row.id).first(), null);
    await db.prepare("UPDATE spots SET visible = 1 WHERE id = ?").bind(catalog[1]).run();
    assert.equal((await save(catalog[1])).status, 200);
    const replacement = (await list()).spots.find((r) => r.spot_id === catalog[1]);
    assert.notEqual(replacement.id, row.id);
    assert.ok(await db.prepare("SELECT eventKey FROM application_outbox WHERE saveId = ?").bind(replacement.id).first());
  });

  await t.test("trusted over-limit history stays readable through 1000; stable ties and explicit overflow", async () => {
    await clear();
    const ids = Array.from({ length: 1001 }, () => ({ id: randomUUID(), spot: randomUUID() }));
    for (let start = 0; start < ids.length; start += 80) await db.batch(ids.slice(start, start + 80).map(({ id, spot }) =>
      db.prepare("INSERT INTO saved_spots VALUES (?, ?, ?, ?)").bind(id, owner, spot, 1234567890123)));
    assert.equal((await call(route, { cookie: aliceCookie })).status, 409);
    assert.equal((await unsave(ids[1000].spot)).status, 200);
    const rows = (await list()).spots;
    assert.equal(rows.length, 1000);
    assert.deepEqual(rows.map((r) => r.id), ids.slice(0, 1000).map((r) => r.id).sort().reverse());
    assert.ok(rows.every((r) => r.spots === null));
    assert.equal((await save(catalog[0])).status, 429);
    for (const value of [100, 999]) {
      await limit(value);
      const full = await save(catalog[0]);
      assert.equal(full.status, 429);
      assert.deepEqual((await full.json()).error.details, { limitType: "saved spots", current: 1000, limit: value });
      assert.equal((await list()).spots.length, 1000);
    }
    await limit(10);
    assert.equal((await save(ids[0].spot)).status, 200);
    assert.equal((await unsave(ids[0].spot)).status, 200);
    assert.equal((await list()).spots.length, 999);
    await clear();
  });

  await t.test("profile and limit provisioning triggers roll back every application row without remapping", async () => {
    const id = await signup("provision-failure@example.test");
    await call((await mail(id, "verify")).url);
    const cookie = await login("provision-failure@example.test");
    for (const table of ["profiles", "owner_limits", "identity_links"]) {
      const before = await Promise.all(["owners", "profiles", "owner_limits", "identity_links"].map(count));
      await db.exec(`CREATE TRIGGER fixture_provision_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'synthetic provisioning failure'); END;`);
      try {
        assert.equal((await post("/api/account/new", {}, cookie)).status, 500);
        assert.deepEqual(await Promise.all(["owners", "profiles", "owner_limits", "identity_links"].map(count)), before);
        assert.equal((await dto(cookie)).state, "unlinked");
        assert.equal((await call(route, { cookie })).status, 409);
      } finally { await db.exec("DROP TRIGGER fixture_provision_failure;"); }
    }
    assert.equal((await post("/api/account/new", {}, cookie)).status, 201);
    await db.prepare("DELETE FROM session WHERE userId = ?").bind(id).run();
    for (const path of [route, "/api/private-notes", "/api/session"]) assert.equal((await call(path, { cookie })).status, 401);
  });

  await t.test("native D1 enforces UUID, fixed JSON shapes, unique profiles and integer quota constraints", async () => {
    for (const value of [-1, 1000, 1.5]) await assert.rejects(limit(value));
    await assert.rejects(db.prepare("INSERT INTO profiles VALUES ('invalid', ?)").bind(owner).run());
    await assert.rejects(db.prepare("INSERT INTO profiles VALUES (?, ?)").bind(randomUUID(), owner).run());
    for (const [field, value] of [["name", "[]"], ["description", "null"], ["photos", "{}"], ["name", "not json"]]) {
      await assert.rejects(db.prepare(`UPDATE spots SET ${field} = ? WHERE id = ?`).bind(value, catalog[0]).run());
    }
    await assert.rejects(db.prepare("INSERT INTO saved_spots VALUES (?, ?, ?, 1)").bind(randomUUID(), owner, "not-uuid").run());
    await limit(10);
  });

  await t.test("saved list preserves nullable root fields and native D1 rejects invalid scores", async () => {
    for (const score of [42, 1.5, 0, 7, "invalid"]) {
      await assert.rejects(db.prepare("UPDATE spots SET localley_score = ? WHERE id = ?").bind(score, catalog[13]).run());
    }
    for (const score of [1, 6]) {
      await db.prepare("UPDATE spots SET localley_score = ? WHERE id = ?").bind(score, catalog[13]).run();
      assert.equal((await db.prepare("SELECT localley_score FROM spots WHERE id = ?").bind(catalog[13]).first()).localley_score, score);
    }
    await db.prepare("UPDATE spots SET localley_score = NULL, photos = NULL WHERE id = ?").bind(catalog[13]).run();
    assert.equal((await save(catalog[13])).status, 200);
    const result = await list();
    const stored = await db.prepare("SELECT id, createdAtMs FROM saved_spots WHERE ownerId = ? AND spotId = ?").bind(owner, catalog[13]).first();
    assert.deepEqual(result, { success: true, spots: [{ id: stored.id, spot_id: catalog[13],
      created_at: new Date(stored.createdAtMs).toISOString(),
      spots: { id: catalog[13], name, description, category: "cafe", localley_score: null, photos: null },
    }] });
    await unsave(catalog[13]);
  });

  await t.test("saved route uses structured auth and validation errors without changing native auth responses", async () => {
    const signedout = await call(route);
    assert.equal(signedout.status, 401);
    assert.deepEqual(await signedout.json(), { error: { code: "unauthorized", message: "Please sign in to continue." } });
    await db.prepare("UPDATE user SET emailVerified = 0 WHERE id = ?").bind(alice).run();
    try {
      const unverified = await call(route, { cookie: aliceCookie });
      assert.equal(unverified.status, 403);
      assert.deepEqual(await unverified.json(), { error: { code: "forbidden", message: "Verify email" } });
    } finally { await db.prepare("UPDATE user SET emailVerified = 1 WHERE id = ?").bind(alice).run(); }
    const origin = await post(route, { spotId: catalog[0] }, aliceCookie, { origin: "https://evil.test" });
    assert.equal(origin.status, 403);
    assert.deepEqual(await origin.json(), { error: { code: "forbidden", message: "Invalid origin" } });
    for (const [options, message] of [
      [{ body: { spotId: "invalid" } }, "Spot ID must be a valid UUID"],
      [{ body: { spotId: catalog[0], ownerId: owner } }, "Only spotId accepted"],
      [{ body: [] }, "Invalid body"],
      [{ raw: "{" }, "Invalid JSON"],
    ]) {
      const response = await call(route, { method: "POST", cookie: aliceCookie, headers: await sessionHeaders(), ...options });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: { code: "validation_error", message } });
    }
    const query = await call(route + "?spotId=invalid", { cookie: aliceCookie });
    assert.equal(query.status, 400);
    assert.deepEqual(await query.json(), { error: { code: "validation_error", message: "Spot ID must be a valid UUID" } });
  });
}
