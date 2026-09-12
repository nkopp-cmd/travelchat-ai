import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function collectionJourney({ page, db, call, screenshot, checkpoint, setStage,
  signIn, aliceSession, bobSession, assetsDirectory }) {
  const evidence = { assertions: [], productIssues: [], pages: [], deletes: [], focus: [], touch: [], heldResponses: [] };
  const start = (name) => setStage(`collection: ${name}`);
  const pass = (name) => { evidence.assertions.push(name); checkpoint(`collection: ${name}`); };
  const collection = page.getByTestId("collection");
  const dialog = page.getByRole("alertdialog");
  const actions = () => collection.getByRole("button", { name: /^Actions for / });
  const rows = () => db.prepare("SELECT * FROM itineraries ORDER BY id").all().then((r) => r.results);
  const row = (id) => db.prepare("SELECT * FROM itineraries WHERE id = ?").bind(id).first();
  const callbacks = () => page.getByTestId("deleted-callbacks").textContent();
  const loaded = (n) => page.waitForFunction((n) => document.querySelectorAll('[data-testid="collection"] button[aria-label^="Actions for "]').length === n, n);
  const close = async () => { if (await page.getByRole("button", { name: "Close collection", exact: true }).count()) await page.getByRole("button", { name: "Close collection", exact: true }).click(); };
  const open = () => page.getByRole("button", { name: "Open collection", exact: true }).click();
  const confirm = () => dialog.getByRole("button", { name: "Delete", exact: true });
  const requestLog = (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/itineraries" && request.method() === "GET") evidence.pages.push({ offset: Number(url.searchParams.get("offset") || 0), limit: Number(url.searchParams.get("limit") || 25) });
    if (url.pathname.startsWith("/api/itineraries/") && request.method() === "DELETE") evidence.deletes.push({ path: url.pathname, emptyBody: request.postData() === null });
  };
  page.on("request", requestLog);
  const menu = async (title) => {
    await collection.getByRole("button", { name: `Actions for ${title}`, exact: true }).click();
    assert.equal(await page.getByRole("menuitem", { name: /Duplicate|Share|Create/ }).count(), 0);
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await dialog.waitFor();
  };
  const noUnsupported = async () => {
    assert.equal(await collection.locator("img").count(), 0);
    assert.equal(await collection.getByRole("link", { name: /Create|Share|Duplicate/ }).count(), 0);
  };
  const hold = async (method, path, expectedSID) => {
    let resolveReceived, resolveRelease, resolveDone, first = true;
    const received = new Promise((r) => { resolveReceived = r; });
    const release = new Promise((r) => { resolveRelease = r; });
    const done = new Promise((r) => { resolveDone = r; });
    const pattern = `**${path}`;
    const handler = async (route) => {
      if (!first || route.request().method() !== method) return route.continue();
      first = false;
      if (expectedSID) {
        assert.equal(route.request().headers()["x-localley-session-id"], expectedSID);
        assert.equal(route.request().postData(), null);
      }
      const response = await route.fetch();
      evidence.heldResponses.push({ method, status: response.status() });
      resolveReceived(response);
      const lost = await release;
      if (lost) await route.abort("failed").catch(() => {});
      else await route.fulfill({ response }).catch(() => {});
      resolveDone();
    };
    await page.route(pattern, handler);
    return { received, release: async (lost = false) => { resolveRelease(lost); await done; await page.unroute(pattern, handler); } };
  };
  const focus = async (state, expected) => {
    const actual = await page.evaluate(() => ({ tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute("aria-label"), text: document.activeElement?.textContent?.slice(0, 80),
      tabIndex: document.activeElement?.getAttribute("tabindex"), busy: document.activeElement?.getAttribute("aria-busy") }));
    evidence.focus.push({ state, ...actual });
    if (!expected(actual)) evidence.productIssues.push(`Focus ${state}: ${JSON.stringify(actual)}`);
  };
  const deleteUI = async (title, id, expected = 200) => {
    await menu(title);
    const sid = (await call("/api/session")).data.sessionId;
    const pending = await hold("DELETE", `/api/itineraries/${id}`, sid);
    await confirm().click();
    const response = await pending.received;
    assert.equal(response.status(), expected);
    if (expected === 200) assert.deepEqual(await response.json(), { success: true });
    await pending.release();
    await dialog.waitFor({ state: "hidden" });
  };

  try {
  start("Node-only fixtures and actual 25 plus next page isolation");
  await page.getByLabel("Trip ID", { exact: true }).selectOption("");
  for (const session of [aliceSession, bobSession]) {
    assert.equal((await db.prepare('SELECT emailVerified FROM user WHERE id = ?').bind(session.authUserId).first()).emailVerified, 1);
    assert.ok(await db.prepare("SELECT id FROM profiles WHERE id = ? AND ownerId = ?").bind(session.userRecordId, session.ownerId).first());
  }
  const marker = randomBytes(8).toString("hex");
  const fixtures = Array.from({ length: 27 }, (_, index) => ({ id: randomUUID(), title: `Alice collection ${String(index).padStart(2, "0")} ${marker}`,
    annotation: `Private annotation ${index} ${marker}` }));
  for (const [index, fixture] of fixtures.entries()) await db.prepare(`INSERT INTO itineraries
    (id, ownerId, title, city, days, activities, created_at, status, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'private', 0)`).bind(fixture.id, aliceSession.ownerId, fixture.title,
      index % 2 ? "Tokyo" : "Seoul", index % 2 + 1,
      JSON.stringify({ dailyPlans: [{ day: 1, activities: [{ name: fixture.annotation }] }] }),
      new Date(Date.UTC(2026, 8, 12, 0, index)).toISOString()).run();
  const bundle = await readFile(join(assetsDirectory, "assets/app.js"), "utf8");
  assert.equal(bundle.includes(marker), false);
  const baseline = await rows();
  const bobRows = baseline.filter((r) => r.ownerId === bobSession.ownerId);
  assert.ok(bobRows.length >= 1);
  const bob = bobRows[0];
  const eventBaseline = (await db.prepare("SELECT * FROM application_outbox ORDER BY eventKey").all()).results;
  await signIn("alice"); await open(); await loaded(25);
  const firstPage = await call("/api/itineraries?limit=25&offset=0");
  assert.equal(firstPage.status, 200); assert.equal(firstPage.data.nextOffset, 25);
  assert.equal(firstPage.data.itineraries.length, 25);
  assert.ok(Buffer.byteLength(JSON.stringify(firstPage.data)) <= 1024 * 1024);
  assert.ok(firstPage.data.itineraries.every((r) => r.ownerId === aliceSession.ownerId && !Object.hasOwn(r, "activities")));
  assert.equal(JSON.stringify(firstPage.data).includes("Private annotation"), false);
  assert.equal(await collection.getByText(bob.title, { exact: true }).count(), 0);
  await noUnsupported(); await screenshot("collection-loaded");
  await collection.getByRole("textbox", { name: "Search loaded trips", exact: true }).fill(bob.title);
  await collection.getByText("No itineraries found", { exact: true }).waitFor();
  await collection.getByText("Search, filters, and sorting apply to loaded trips only.", { exact: true }).waitFor();
  await screenshot("collection-filter");
  await collection.getByRole("button", { name: "Clear Filters", exact: true }).click();
  await collection.getByRole("button", { name: "Load more", exact: true }).click(); await loaded(28);
  assert.ok(evidence.pages.some((p) => p.offset === 25 && p.limit === 25));
  const next = await call("/api/itineraries?limit=25&offset=25");
  assert.equal(next.data.itineraries.length, 3); assert.equal(next.data.nextOffset, null);
  assert.equal(await collection.getByRole("button", { name: "Load more", exact: true }).count(), 0);
  await collection.getByRole("textbox", { name: "Search itineraries", exact: true }).waitFor();
  await collection.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "1 day", exact: true }).click();
  await page.keyboard.press("Escape");
  await loaded(14); await screenshot("collection-duration-filter");
  await collection.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clear filters", exact: true }).click(); await loaded(28);
  await collection.getByRole("button", { name: "List view", exact: true }).click();
  await screenshot("collection-list");
  await collection.getByRole("button", { name: "Grid view", exact: true }).click();
  evidence.seededAliceRows = 27; evidence.initialAliceRows = 28; evidence.privatePayloadsAbsentFromBundle = true;
  pass("Node-only fixtures and actual 25 plus next page isolation");

  start("real card editor navigation and keyboard cancel with no writes");
  const target = fixtures[26];
  await collection.locator(`a[href="/itineraries/${target.id}"]`).last().click();
  await page.getByTestId("editor").getByPlaceholder("e.g., 3-Day Seoul Adventure").waitFor();
  assert.equal(await page.getByTestId("editor").getByPlaceholder("e.g., 3-Day Seoul Adventure").inputValue(), target.title);
  const beforeCancel = evidence.deletes.length;
  await menu(target.title); await screenshot("collection-confirmation");
  for (const key of ["Tab", "Shift+Tab"]) for (let i = 0; i < 4; i++) {
    await page.keyboard.press(key);
    assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
  }
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await focus("cancel", (a) => a.label === `Actions for ${target.title}`);
  assert.equal(evidence.deletes.length, beforeCancel); assert.deepEqual(await rows(), baseline);
  pass("real card editor navigation and keyboard cancel with no writes");

  start("held delete double click current SID empty body reset offset and clear editor");
  await menu(target.title);
  const sid = (await call("/api/session")).data.sessionId;
  const held = await hold("DELETE", `/api/itineraries/${target.id}`, sid);
  await confirm().evaluate((button) => { button.click(); button.click(); });
  const real = await held.received;
  assert.equal(real.status(), 200); assert.deepEqual(await real.json(), { success: true });
  assert.equal(await row(target.id), null);
  assert.equal(evidence.deletes.length, beforeCancel + 1);
  assert.equal(await dialog.getByRole("button", { name: "Deleting...", exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
  await screenshot("collection-pending");
  const pageIndex = evidence.pages.length;
  await held.release(); await loaded(25); await dialog.waitFor({ state: "hidden" });
  assert.equal(evidence.pages[pageIndex].offset, 0);
  assert.equal(await page.getByTestId("editor").locator("input").count(), 0);
  assert.equal(await callbacks(), target.id);
  await focus("success", (a) => a.tag === "SECTION" && a.label === "Your itineraries" && a.tabIndex === "-1" && a.busy === "false");
  await screenshot("collection-deleted");
  assert.deepEqual(await call(`/api/itineraries/${target.id}`, "DELETE", undefined, sid), { status: 200, data: { success: true } });
  assert.deepEqual(await call(`/api/itineraries/${bob.id}`, "DELETE", undefined, sid), { status: 200, data: { success: true } });
  const deletedSnapshot = baseline.find((r) => r.id === target.id);
  const expected = Object.fromEntries(["title", "city", "activities", "highlights", "estimated_cost"].map((key) => [key,
    ["activities", "highlights"].includes(key) && deletedSnapshot[key] !== null ? JSON.parse(deletedSnapshot[key]) : deletedSnapshot[key]]));
  assert.equal((await call(`/api/itineraries/${target.id}/update`, "PATCH", { ...expected, expected }, sid)).status, 404);
  assert.equal(await row(target.id), null); assert.deepEqual(await row(bob.id), bob);
  pass("held delete double click current SID empty body reset offset and clear editor");

  start("D1 abort retains row and manual confirmation retry succeeds");
  const fault = fixtures[25];
  await db.exec("CREATE TRIGGER collection_delete_fault BEFORE DELETE ON itineraries BEGIN SELECT RAISE(ABORT, 'local collection fault'); END");
  try {
    await deleteUI(fault.title, fault.id, 500);
    await collection.getByText("Could not confirm deletion. Reload the list and check before retrying.", { exact: true }).waitFor();
    assert.ok(await row(fault.id)); await screenshot("collection-error");
  } finally { await db.exec("DROP TRIGGER collection_delete_fault"); }
  const failedCount = evidence.deletes.length;
  await page.waitForTimeout(500); assert.equal(evidence.deletes.length, failedCount);
  await deleteUI(fault.title, fault.id); await loaded(25); assert.equal(await row(fault.id), null);
  pass("D1 abort retains row and manual confirmation retry succeeds");

  start("lost committed response stays uncertain and manual repeat is safe");
  const lostTarget = fixtures[24]; await menu(lostTarget.title);
  const lost = await hold("DELETE", `/api/itineraries/${lostTarget.id}`);
  await confirm().click(); assert.equal((await lost.received).status(), 200);
  assert.equal(await row(lostTarget.id), null);
  const beforeDeadline = evidence.deletes.length;
  await collection.getByText("Could not confirm deletion. Reload the list and check before retrying.", { exact: true }).waitFor({ timeout: 23_000 });
  assert.equal(evidence.deletes.length, beforeDeadline);
  evidence.deleteDeadlineMs = 20_000;
  await lost.release(true);
  await dialog.waitFor({ state: "hidden" }); await screenshot("collection-lost-response");
  const lostCount = evidence.deletes.length; await page.waitForTimeout(500); assert.equal(evidence.deletes.length, lostCount);
  await deleteUI(lostTarget.title, lostTarget.id); await loaded(25);
  assert.deepEqual(await row(bob.id), bob);
  pass("lost committed response stays uncertain and manual repeat is safe");

  start("successful delete and later read fault use distinct message");
  const reloadTarget = fixtures[23]; await menu(reloadTarget.title);
  const reloadHold = await hold("DELETE", `/api/itineraries/${reloadTarget.id}`);
  await confirm().click(); assert.equal((await reloadHold.received).status(), 200);
  await db.exec("ALTER TABLE itineraries RENAME TO collection_unavailable");
  try {
    await reloadHold.release();
    await collection.getByText("Itinerary deleted, but the list could not reload.", { exact: true }).waitFor();
    await screenshot("collection-read-error");
  } finally { await db.exec("ALTER TABLE collection_unavailable RENAME TO itineraries"); }
  assert.equal(await row(reloadTarget.id), null);
  await collection.getByRole("button", { name: "Reload itineraries", exact: true }).click(); await loaded(24);
  pass("successful delete and later read fault use distinct message");

  start("real held GET reaches 20 second deadline without automatic retry");
  await close();
  const deadline = await hold("GET", "/api/itineraries?*");
  await open(); assert.equal((await deadline.received).status(), 200);
  const deadlineReads = evidence.pages.length;
  await collection.getByText("Could not load itineraries. The response may be invalid. Reload to try again.", { exact: true }).waitFor({ timeout: 23_000 });
  assert.equal(evidence.pages.length, deadlineReads);
  await screenshot("collection-get-timeout");
  await deadline.release(); assert.equal(await actions().count(), 0);
  await collection.getByRole("button", { name: "Reload itineraries", exact: true }).click(); await loaded(24);
  pass("real held GET reaches 20 second deadline without automatic retry");

  for (const method of ["GET", "DELETE"]) {
    start(`account switch discards held ${method} rows dialog and callback`);
    await close(); await signIn("alice");
    const switchTarget = fixtures[22];
    if (method === "DELETE") { await open(); await loaded(24); await menu(switchTarget.title); }
    const pending = await hold(method, method === "GET" ? "/api/itineraries?*" : `/api/itineraries/${switchTarget.id}`);
    const priorCallbacks = await callbacks();
    if (method === "GET") await open(); else await confirm().click();
    assert.equal((await pending.received).status(), 200);
    // The real SDK form in a second same-context tab can sign in while the first tab has a modal.
    await signIn("bob", { modal: true });
    await loaded(bobRows.length);
    assert.equal(await dialog.count(), 0);
    assert.equal((await collection.textContent()).includes(marker), false);
    await pending.release(); await page.waitForTimeout(300);
    assert.equal((await collection.textContent()).includes(marker), false);
    assert.equal(await callbacks(), priorCallbacks); assert.deepEqual(await row(bob.id), bob);
    await screenshot(`collection-account-switched-${method.toLowerCase()}`);
    pass(`account switch discards held ${method} rows dialog and callback`);
  }

  start("last row deletion gives honest empty state and touch measurements");
  await page.setViewportSize({ width: 390, height: 1000 });
  evidence.touch = await collection.locator("button").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect(); return { label: button.getAttribute("aria-label") || button.textContent,
      width: rect.width, height: rect.height };
  }));
  for (const button of evidence.touch) if (button.width < 24 || button.height < 24) evidence.productIssues.push(`Touch target below 24px: ${button.label}`);
  await deleteUI(bob.title, bob.id);
  await collection.getByText("No itineraries yet", { exact: true }).waitFor();
  await noUnsupported(); await screenshot("collection-empty");
  await focus("empty success", (a) => a.tag === "SECTION" && a.label === "Your itineraries" && a.tabIndex === "-1" && a.busy === "false");
  assert.equal(await row(bob.id), null);
  const deletedIds = new Set([target.id, fault.id, lostTarget.id, reloadTarget.id, fixtures[22].id, bob.id]);
  assert.deepEqual(await rows(), baseline.filter((r) => !deletedIds.has(r.id)));
  assert.deepEqual((await db.prepare("SELECT * FROM application_outbox ORDER BY eventKey").all()).results, eventBaseline);
  assert.ok(evidence.deletes.every((r) => r.emptyBody));
  assert.ok(evidence.pages.every((p) => p.limit <= 25));
  pass("last row deletion gives honest empty state and touch measurements");

  start("actual metadata pages enforce 1 MiB and native aggregate 4 MiB");
  await close(); await signIn("alice");
  const budgetIds = Array.from({ length: 6 }, () => randomUUID());
  const privateMetadata = `Node-only metadata ${randomBytes(8).toString("hex")} ` + "x".repeat(800_000);
  assert.equal(bundle.includes(privateMetadata.slice(0, 35)), false);
  for (const [index, id] of budgetIds.entries()) await db.prepare(`INSERT INTO itineraries
    (id, ownerId, title, city, days, activities, highlights, created_at, status, is_favorite)
    VALUES (?, ?, ?, 'Seoul', 1, '[]', ?, ?, 'private', 0)`).bind(id, aliceSession.ownerId,
      `Private budget trip ${index} ${marker}`, JSON.stringify([privateMetadata]), `2026-09-13T00:0${index}:00.000Z`).run();
  try {
    const bounded = await call("/api/itineraries?limit=25&offset=0");
    assert.equal(bounded.status, 200); assert.equal(bounded.data.itineraries.length, 1);
    assert.equal(bounded.data.nextOffset, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(bounded.data)) <= 1024 * 1024);
    await open(); await loaded(1);
    for (let count = 2; count <= 5; count++) {
      await collection.getByRole("button", { name: "Load more", exact: true }).click(); await loaded(count);
    }
    await collection.getByRole("button", { name: "Load more", exact: true }).click();
    await collection.getByText("Collection size limit reached (4 MiB). Only previously loaded trips are shown. More trips remain unchecked.", { exact: true }).waitFor();
    await loaded(5);
    assert.equal(await collection.getByRole("button", { name: "Load more", exact: true }).isDisabled(), true);
    await close();
    await db.prepare("UPDATE itineraries SET highlights = ? WHERE id = ?").bind(JSON.stringify(["x".repeat(1024 * 1024)]), budgetIds[5]).run();
    assert.equal((await call("/api/itineraries?limit=25&offset=0")).status, 413);
    evidence.aggregateByteLimit = { retainedRows: 5, rejectedPage: 6, nativeOversizedStatus: 413 };
  } finally {
    await close();
    for (const id of budgetIds) await db.prepare("DELETE FROM itineraries WHERE id = ?").bind(id).run();
  }
  pass("actual metadata pages enforce 1 MiB and native aggregate 4 MiB");

  start("actual native collection stops at 1000 rows without silent completeness");
  const rowIds = Array.from({ length: 1001 }, () => randomUUID());
  try {
    for (let offset = 0; offset < rowIds.length; offset += 100) await db.batch(rowIds.slice(offset, offset + 100).map((id, index) =>
      db.prepare(`INSERT INTO itineraries (id, ownerId, title, city, days, activities, created_at, status, is_favorite)
        VALUES (?, ?, ?, 'Seoul', 1, '[]', '2026-09-14T00:00:00.000Z', 'private', 0)`)
        .bind(id, aliceSession.ownerId, `Private row boundary ${offset + index} ${marker}`)));
    await open(); await loaded(25);
    for (let count = 50; count <= 1000; count += 25) {
      await collection.getByRole("button", { name: "Load more", exact: true }).click(); await loaded(count);
    }
    await collection.getByText("Loaded 1,000 trips. More trips exist. This collection cannot load more.", { exact: true }).waitFor();
    assert.equal(await collection.getByRole("button", { name: "Load more", exact: true }).count(), 0);
    await collection.getByRole("textbox", { name: "Search loaded trips", exact: true }).waitFor();
    evidence.aggregateRowLimit = { loaded: 1000, moreRemain: true };
  } finally {
    await close();
    for (let offset = 0; offset < rowIds.length; offset += 100) await db.batch(rowIds.slice(offset, offset + 100).map((id) => db.prepare("DELETE FROM itineraries WHERE id = ?").bind(id)));
  }
  assert.deepEqual(await rows(), baseline.filter((r) => !deletedIds.has(r.id)));
  assert.deepEqual((await db.prepare("SELECT * FROM application_outbox ORDER BY eventKey").all()).results, eventBaseline);
  pass("actual native collection stops at 1000 rows without silent completeness");
  return evidence;
  } finally {
    page.off("request", requestLog);
    await writeFile(join(assetsDirectory, "../collection-evidence.json"), JSON.stringify(evidence, null, 2));
  }
}
