import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { planningSpot, tripIds } from "./public-fixture.mjs";

export async function editorJourney({ page, context, db, call, status, screenshot, calls, checkpoint,
  setStage, signIn, aliceSession, bobSession, assetsDirectory }) {
  const [a, b] = tripIds;
  const evidence = { assertions: [], trips: 2, raceResponses: [], focusAuthRequests: 0, productIssues: [] };
  const start = (name) => setStage(`editor: ${name}`);
  const pass = (name) => { evidence.assertions.push(name); checkpoint(`editor: ${name}`); };
  const editor = page.getByTestId("editor");
  const title = () => editor.getByPlaceholder("e.g., 3-Day Seoul Adventure");
  const choose = (id) => page.getByLabel("Trip ID", { exact: true }).selectOption(id);
  const loaded = async (value) => {
    await title().waitFor();
    await page.waitForFunction((value) => document.querySelector('[placeholder="e.g., 3-Day Seoul Adventure"]')?.value === value, value);
  };
  const row = (id) => db.prepare("SELECT * FROM itineraries WHERE id = ?").bind(id).first();
  const snapshot = (raw) => ({ title: raw.title, city: raw.city, activities: JSON.parse(raw.activities),
    highlights: raw.highlights === null ? null : JSON.parse(raw.highlights), estimated_cost: raw.estimated_cost });
  const immutable = (raw) => Object.fromEntries(["id", "ownerId", "days", "subtitle", "local_score", "created_at", "status", "is_favorite"].map((key) => [key, raw[key]]));
  const patchCount = () => calls.filter((c) => c.method === "PATCH" && c.path.startsWith("/api/itineraries/")).length;
  const save = async (expectedStatus) => {
    const waiting = page.waitForResponse((r) => r.request().method() === "PATCH" && new URL(r.url()).pathname.endsWith("/update"));
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    const response = await waiting;
    assert.equal(response.status(), expectedStatus);
    return response;
  };
  const noPrivate = async (values) => {
    assert.equal(await editor.evaluate((element, values) => {
      const visible = element.textContent + Array.from(element.querySelectorAll("input,textarea"), (field) => field.value).join("\n");
      return values.some((value) => visible.includes(value));
    }, values), false);
  };
  const noSavedToast = async () => {
    assert.equal(await page.getByText("Saved successfully", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Auto-saved", { exact: true }).count(), 0);
  };
  // Only delay responses produced by the real Worker. Never fabricate a response body.
  const holdResponse = async (path, method) => {
    let release, arrived, finish;
    const held = new Promise((done) => { release = done; });
    const received = new Promise((done) => { arrived = done; });
    const delivered = new Promise((done) => { finish = done; });
    let first = true;
    const handler = async (route) => {
      if (!first || route.request().method() !== method) return route.continue();
      first = false;
      const response = await route.fetch();
      evidence.raceResponses.push({ method, path, status: response.status() });
      arrived(response);
      await held;
      await route.fulfill({ response }).catch(() => {});
      finish();
    };
    await page.route(`**${path}`, handler);
    return { received, release: async () => { release(); await delivered; await page.unroute(`**${path}`, handler); } };
  };

  start("Node-only private fixtures after verified account creation");
  for (const session of [aliceSession, bobSession]) {
    const verified = await db.prepare('SELECT emailVerified FROM user WHERE id = ?').bind(session.authUserId).first();
    assert.equal(verified.emailVerified, 1);
    assert.ok(await db.prepare("SELECT id FROM profiles WHERE id = ? AND ownerId = ?").bind(session.userRecordId, session.ownerId).first());
  }
  const marker = randomBytes(8).toString("hex");
  const privateA = [`Alice private journey ${marker}`, `Alice private annotation ${marker}`, `Alice private courtyard ${marker}`];
  const privateB = [`Bob private journey ${marker}`, `Bob private annotation ${marker}`, `Bob private courtyard ${marker}`];
  const plans = (values) => ({ dailyPlans: [{ day: 1, theme: "Private morning", unknownDay: { retained: true },
    activities: [{ name: values[2], description: values[1], lat: 37.56, lng: 126.97, address: "Private courtyard, Seoul",
      unknownActivity: { retained: [1, null, "opaque"] } }] }, { day: 2, theme: "Private afternoon", activities: [] }],
    insights: [{ id: "private-insight", kind: "insight", label: "Trip insight", text: values[1] }] });
  for (const [id, session, values] of [[a, aliceSession, privateA], [b, bobSession, privateB]]) {
    await db.prepare(`INSERT INTO itineraries (id, ownerId, title, city, days, activities, highlights, estimated_cost,
      subtitle, local_score, created_at, status, is_favorite) VALUES (?, ?, ?, 'Seoul', 2, ?, NULL, NULL, ?, 5.25, '2026-09-11T10:20:30.123Z', 'private', 1)`)
      .bind(id, session.ownerId, values[0], JSON.stringify(plans(values)), `Immutable ${values[0]}`).run();
  }
  await db.prepare("UPDATE spots SET city = ?, address = ?, latitude = ?, longitude = ? WHERE id = ?")
    .bind(planningSpot.city, JSON.stringify({ en: planningSpot.address }), planningSpot.latitude, planningSpot.longitude, planningSpot.id).run();
  const publicRow = await db.prepare("SELECT * FROM spots WHERE id = ?").bind(planningSpot.id).first();
  assert.equal(JSON.parse(publicRow.name).en, planningSpot.name);
  assert.equal(publicRow.city, planningSpot.city);
  assert.equal(publicRow.latitude, planningSpot.latitude);
  assert.equal(publicRow.longitude, planningSpot.longitude);
  const bundle = await readFile(join(assetsDirectory, "assets/app.js"), "utf8");
  for (const value of [...privateA, ...privateB]) assert.equal(bundle.includes(value), false);
  const originalA = await row(a), originalB = await row(b);
  pass("Node-only private fixtures after verified account creation");

  start("owner-filtered summaries and foreign detail/update denial");
  await signIn("alice");
  let current = (await call("/api/session")).data;
  const listing = await call("/api/itineraries");
  assert.equal(listing.status, 200);
  assert.deepEqual(listing.data.itineraries.map((item) => item.id), [a]);
  assert.equal(listing.data.nextOffset, null);
  assert.equal(Object.hasOwn(listing.data.itineraries[0], "activities"), false);
  assert.equal(listing.data.itineraries[0].ownerId, current.ownerId);
  assert.equal((await call("/api/itineraries?limit=26")).status, 400);
  assert.deepEqual((await call("/api/itineraries?limit=1&offset=1")).data, { itineraries: [], nextOffset: null });
  assert.equal((await call(`/api/itineraries/${b}`)).status, 404);
  assert.equal((await call(`/api/itineraries/${b}/update`, "PATCH", {}, current.sessionId)).status, 404);
  await choose(b);
  await editor.getByText("This itinerary is not available.", { exact: true }).waitFor();
  await noPrivate(privateB);
  await screenshot("editor-private-denial");
  assert.deepEqual(await row(b), originalB);
  pass("owner-filtered summaries and foreign detail/update denial");

  start("actual native editor load and explicit day/position staging");
  await choose(a);
  await loaded(privateA[0]);
  await noPrivate(privateB);
  assert.equal(await editor.getByText(privateA[2], { exact: true }).count(), 1);
  assert.equal(await editor.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
  await screenshot("editor-loaded");
  assert.equal(await editor.getByRole("button", { name: "Add to draft", exact: true }).isDisabled(), true);
  await editor.getByLabel("Day", { exact: true }).selectOption("1");
  assert.equal(await editor.getByRole("button", { name: "Add to draft", exact: true }).isDisabled(), true);
  await editor.getByLabel("Position", { exact: true }).selectOption("0");
  await editor.getByRole("button", { name: "Add to draft", exact: true }).click();
  assert.deepEqual(await row(a), originalA);
  await screenshot("editor-staged");
  pass("actual native editor load and explicit day/position staging");

  start("same-identity SDK background focus refetch preserves unsaved draft");
  const authBefore = calls.filter((c) => c.path === "/api/auth/get-session").length;
  const loadsBefore = calls.filter((c) => c.path === `/api/itineraries/${a}` && c.method === "GET").length;
  await title().evaluate((node) => { node.dataset.retainedAcrossFocus = "true"; });
  await page.waitForTimeout(5500);
  const focusResponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/get-session");
  // The official SDK observes document visibility, not an explicit AppSession.refresh call.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  assert.equal((await focusResponse).status(), 200);
  await page.waitForTimeout(500);
  await loaded(privateA[0]);
  assert.equal(await title().getAttribute("data-retained-across-focus"), "true");
  assert.equal(await editor.getByText("This spot is already in your plan.", { exact: true }).count(), 1);
  assert.equal(await editor.getByRole("button", { name: "Save", exact: true }).isEnabled(), true);
  assert.equal(calls.filter((c) => c.path === `/api/itineraries/${a}` && c.method === "GET").length, loadsBefore);
  evidence.focusAuthRequests = calls.filter((c) => c.path === "/api/auth/get-session").length - authBefore;
  assert.ok(evidence.focusAuthRequests > 0);
  pass("same-identity SDK background focus refetch preserves unsaved draft");

  start("Save writes five raw expected fields and current session header");
  const savedResponse = await save(200);
  const payload = savedResponse.request().postDataJSON();
  assert.equal(savedResponse.request().headers()["x-localley-session-id"], current.sessionId);
  assert.deepEqual(payload.expected, snapshot(originalA));
  assert.deepEqual(Object.keys(payload.expected).sort(), ["activities", "city", "estimated_cost", "highlights", "title"]);
  await page.getByText("Saved successfully", { exact: true }).waitFor();
  const savedA = await row(a);
  assert.deepEqual(immutable(savedA), immutable(originalA));
  const stored = JSON.parse(savedA.activities);
  assert.deepEqual(stored.dailyPlans[0].activities[0], { name: planningSpot.name, description: planningSpot.description,
    address: planningSpot.address, category: planningSpot.category, spotId: planningSpot.id, lat: planningSpot.latitude, lng: planningSpot.longitude });
  assert.deepEqual(stored.dailyPlans[0].activities[1], plans(privateA).dailyPlans[0].activities[0]);
  assert.deepEqual(stored.dailyPlans[0].unknownDay, { retained: true });
  assert.equal(stored.insights[0].text, privateA[1]);
  assert.deepEqual(await row(b), originalB);
  await screenshot("editor-saved");
  await page.reload();
  await status("ready");
  await choose(a);
  await loaded(privateA[0]);
  await editor.getByText("This spot is already in your plan.", { exact: true }).waitFor();
  assert.equal(await editor.getByPlaceholder("Add one trip-level insight per line. These stay outside the day sections.").inputValue(), privateA[1]);
  await screenshot("editor-reloaded");
  pass("Save writes five raw expected fields and current session header");

  start("core activity cancel, undo to baseline, and onNavigate without Next");
  const beforeUndo = patchCount();
  await editor.getByRole("button", { name: `Edit ${privateA[2]}`, exact: true }).click();
  await editor.getByLabel("Activity name", { exact: true }).fill("Discard this activity edit");
  await editor.getByRole("button", { name: "Cancel activity changes", exact: true }).click();
  await editor.getByText(privateA[2], { exact: true }).waitFor();
  await title().fill("Discard this title edit");
  await title().fill(privateA[0]);
  assert.equal(await editor.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
  await title().fill("Unsaved navigation draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await editor.getByRole("button", { name: "Cancel", exact: true }).first().click();
  assert.equal(await title().inputValue(), "Unsaved navigation draft");
  page.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "Cancel", exact: true }).first().click();
  assert.equal(await page.getByTestId("destination").textContent(), `/itineraries/${a}`);
  assert.equal(await title().count(), 0);
  assert.equal(patchCount(), beforeUndo);
  assert.deepEqual(await row(a), savedA);
  pass("core activity cancel, undo to baseline, and onNavigate without Next");

  start("external D1 snapshot conflict retains draft and stops autosave beyond 30 seconds");
  await choose(a);
  await loaded(privateA[0]);
  const conflictDraft = `${privateA[0]} unsaved conflict`;
  await title().fill(conflictDraft);
  await db.prepare("UPDATE itineraries SET title = ? WHERE id = ?").bind(`${privateA[0]} external`, a).run();
  const externalRow = await row(a);
  const sessionRequests = calls.filter((c) => c.path === "/api/session").length;
  const conflictResponse = await save(409);
  assert.deepEqual(conflictResponse.request().postDataJSON().expected, snapshot(savedA));
  await editor.getByRole("alert").filter({ hasText: "Automatic saving has stopped" }).waitFor();
  assert.equal(await title().inputValue(), conflictDraft);
  await noSavedToast();
  const blockedWrites = patchCount();
  await screenshot("editor-conflict");
  await page.waitForTimeout(31_000);
  assert.equal(patchCount(), blockedWrites);
  assert.equal(calls.filter((c) => c.path === "/api/session").length, sessionRequests);
  assert.equal(await title().inputValue(), conflictDraft);
  assert.equal(await editor.getByRole("button", { name: "Save", exact: true }).isDisabled(), true);
  assert.deepEqual(await row(a), externalRow);
  await noSavedToast();
  evidence.conflictWaitMs = 31000;
  pass("external D1 snapshot conflict retains draft and stops autosave beyond 30 seconds");

  for (const method of ["GET", "PATCH"]) {
    start(`account switch discards held real ${method} response before Bob load`);
    await choose("");
    await signIn("alice");
    const before = await row(a);
    if (method === "PATCH") { await choose(a); await loaded(before.title); await title().fill(`${privateA[0]} held draft`); }
    const hold = await holdResponse(`/api/itineraries/${a}${method === "PATCH" ? "/update" : ""}`, method);
    if (method === "GET") await choose(a);
    else await editor.getByRole("button", { name: "Save", exact: true }).click();
    assert.equal((await hold.received).status(), 200);
    await signIn("bob");
    await editor.getByText("This itinerary is not available.", { exact: true }).waitFor();
    await noPrivate(privateA);
    await noSavedToast();
    const bobHold = await holdResponse(`/api/itineraries/${b}`, "GET");
    await choose(b);
    await bobHold.received;
    await noPrivate([...privateA, ...privateB]);
    await screenshot(`editor-switch-${method.toLowerCase()}-loading`);
    await hold.release();
    await page.waitForTimeout(300);
    await noPrivate(privateA);
    await noSavedToast();
    await bobHold.release();
    await loaded(privateB[0]);
    await noPrivate(privateA);
    await noSavedToast();
    assert.equal(await page.getByText("Save failed", { exact: true }).count(), 0);
    assert.deepEqual(await row(b), originalB);
    assert.deepEqual(immutable(await row(a)), immutable(originalA));
    if (method === "GET") assert.deepEqual(await row(a), before);
    else assert.equal((await row(a)).title, `${privateA[0]} held draft`);
    await screenshot(`editor-switch-${method.toLowerCase()}-bob`);
    pass(`account switch discards held real ${method} response before Bob load`);
  }
  const bobList = await call("/api/itineraries");
  assert.equal(bobList.status, 200);
  assert.deepEqual(bobList.data.itineraries.map((item) => item.id), [b]);
  assert.equal(Object.hasOwn(bobList.data.itineraries[0], "activities"), false);

  start("nested session_changed PATCH refreshes actual provider without cross-owner write");
  const bobCookies = await context.cookies();
  await choose("");
  await signIn("alice");
  await choose(a);
  const beforeChanged = await row(a);
  await loaded(beforeChanged.title);
  await title().fill(`${privateA[0]} stale session draft`);
  const oldSession = (await call("/api/session")).data;
  // Replace only real HttpOnly cookies. Do not notify the SDK or replace its observer.
  await context.addCookies(bobCookies);
  const changedResponse = await save(409);
  assert.equal((await changedResponse.json()).error.code, "session_changed");
  assert.equal(changedResponse.request().headers()["x-localley-session-id"], oldSession.sessionId);
  await editor.getByText("This itinerary is not available.", { exact: true }).waitFor();
  await status("ready");
  assert.equal((await call("/api/session")).data.ownerId, bobSession.ownerId);
  await noPrivate(privateA);
  await noSavedToast();
  assert.deepEqual(await row(a), beforeChanged);
  assert.deepEqual(await row(b), originalB);
  await screenshot("editor-session-changed");
  assert.equal(await page.getByText(/Your draft remains here/).count(), 0, "Do not claim draft retention after an identity change closes the editor");
  pass("nested session_changed PATCH refreshes actual provider without cross-owner write");

  start("nested session_changed GET refreshes actual provider");
  await choose("");
  await signIn("alice");
  await context.addCookies(bobCookies);
  const changedGet = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/itineraries/${a}` && r.status() === 409);
  await choose(a);
  assert.equal((await (await changedGet).json()).error.code, "session_changed");
  await editor.getByText("This itinerary is not available.", { exact: true }).waitFor();
  await noPrivate(privateA);
  assert.equal((await call("/api/session")).data.ownerId, bobSession.ownerId);
  pass("nested session_changed GET refreshes actual provider");

  start("current-owner header required and revoked session cannot write");
  await choose("");
  await signIn("alice");
  current = (await call("/api/session")).data;
  const beforeRevoked = await row(a);
  const deniedPayload = { ...payload, expected: snapshot(beforeRevoked), title: "Must not persist" };
  for (const expected of [undefined, "", "stale-session"]) {
    assert.equal((await call(`/api/itineraries/${a}/update`, "PATCH", deniedPayload, expected)).status, expected === "stale-session" ? 409 : 428);
    assert.deepEqual(await row(a), beforeRevoked);
  }
  await choose(a);
  await loaded(beforeRevoked.title);
  await title().fill(`${privateA[0]} revoked draft`);
  await db.prepare("DELETE FROM session WHERE id = ?").bind(current.sessionId).run();
  await save(401);
  await status("signedout");
  await noPrivate(privateA);
  await noSavedToast();
  assert.deepEqual(await row(a), beforeRevoked);
  assert.deepEqual(await row(b), originalB);
  await screenshot("editor-revoked");
  assert.equal(await page.getByText(/Your draft remains here/).count(), 0, "Do not claim draft retention after revocation closes the editor");
  pass("current-owner header required and revoked session cannot write");
  evidence.finalRows = (await db.prepare("SELECT id, days, status, is_favorite FROM itineraries ORDER BY id").all()).results;
  evidence.immutableMetadataUnchanged = true;
  evidence.bobRowUnchanged = true;
  evidence.privatePayloadsAbsentFromBundle = true;
  evidence.patchResponses = calls.filter((c) => c.method === "PATCH" && c.path.startsWith("/api/itineraries/"));
  return evidence;
}
