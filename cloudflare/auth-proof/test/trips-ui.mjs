import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";

// Node-only seeds. The actual web entry, Better Auth, Worker and D1 handle every private operation.
export async function tripsUiChecks({ page, db, call, origin }) {
  const session = (await call("/api/session")).data;
  assert.equal(session.state, "ready");
  const id = randomUUID();
  const otherOwner = randomUUID();
  const otherId = randomUUID();
  await db.prepare("INSERT INTO owners (id, source) VALUES (?, 'new')").bind(otherOwner).run();
  const days = [{ day: 1, theme: "Local walk", activities: [
    { name: "Custom stop", address: "Manual address", description: "Local browser test", time: "10:00" },
    { spotId: randomUUID(), name: "Linked stop", address: "Linked address", time: "11:00" },
  ] }];
  for (const [trip, owner, title] of [[id, session.ownerId, "Local browser trip"], [otherId, otherOwner, "Other owner private trip"]]) {
    await db.prepare("INSERT INTO itineraries (id, ownerId, title, city, days, activities) VALUES (?, ?, ?, 'Seoul', 1, ?)")
      .bind(trip, owner, title, JSON.stringify(days)).run();
  }
  // Only public presentation config is substituted. Authentication stays explicitly local/captured.
  const previewConfig = (route) => route.fulfill({ json: { mode: "preview", catalogSource: "seoul-pilot", registration: "restricted-preview", emailDelivery: "cloudflare" } });
  await page.route("**/api/app-config", previewConfig);
  let mappingReads = 0;
  let armed = false;
  let changedAtRead = 0;
  let prematureRead = false;
  let tripReads = 0;
  const mappingChange = async (route) => {
    assert.ok(route.request().headers()["x-localley-session-id"], "Both native consumers fence mapping reads");
    mappingReads++;
    if (armed && !changedAtRead) {
      changedAtRead = mappingReads;
      // The shell has verified the old profile. The root provider must reject that stale expectation.
      await new Promise((done) => setTimeout(done, 200));
      assert.equal(mappingReads, changedAtRead, "Root loading must not refresh the shell");
      assert.equal(tripReads, 0, "No trip reads before both contexts agree");
      await db.prepare("UPDATE profiles SET id = ? WHERE ownerId = ?").bind(randomUUID(), session.ownerId).run();
    }
    await route.continue();
  };
  const watchTrips = (request) => {
    if (new URL(request.url()).pathname === "/api/itineraries") {
      tripReads++;
      prematureRead ||= !changedAtRead || mappingReads < changedAtRead + 2;
    }
  };
  await page.route("**/api/session", mappingChange);
  page.on("request", watchTrips);
  await page.goto(origin);
  // Startup observers can replace an in-flight shell check. Arm only once its identity is rendered.
  await page.locator(".identity").waitFor({ state: "attached" });
  armed = true;
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  const pane = page.getByRole("region", { name: "Trips preview", exact: true });
  await pane.getByRole("heading", { name: "Local browser trip", exact: true }).first().waitFor();
  assert.equal(prematureRead, false, `Profile mismatch must refresh both contexts before reading trips: ${JSON.stringify({ mappingReads, changedAtRead, tripReads })}`);
  assert.ok(changedAtRead > 0);
  assert.equal(mappingReads, changedAtRead + 2);
  page.off("request", watchTrips);
  await page.unroute("**/api/session", mappingChange);
  assert.equal(await pane.getByText("Other owner private trip", { exact: true }).count(), 0);
  assert.equal((await call(`/api/itineraries/${otherId}`)).status, 404);
  const resultsRoot = resolve("../../test-results/cloudflare-trips");
  await mkdir(resultsRoot, { recursive: true });
  const results = await mkdtemp(resolve(resultsRoot, "run-"));
  const capture = async (state) => {
    for (const width of [390, 900, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${state} overflow at ${width}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: resolve(results, `${state}-${width}.png`), fullPage: state !== "delete-confirmation" });
    }
  };
  await capture("collection");
  await pane.getByRole("link", { name: /Local browser trip/ }).first().click();
  const title = pane.getByPlaceholder("e.g., 3-Day Seoul Adventure");
  await title.waitFor();
  await title.fill("Local browser edited trip");
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  assert.equal(await title.inputValue(), "Local browser edited trip", "Tab changes retain the native draft");
  await pane.getByRole("button", { name: "Edit Linked stop", exact: true }).click();
  assert.equal(await pane.getByLabel("Activity name", { exact: true }).getAttribute("readonly"), "");
  assert.equal(await pane.getByLabel("Address", { exact: true }).getAttribute("readonly"), "");
  await pane.getByRole("button", { name: "Cancel activity changes", exact: true }).click();
  await pane.getByRole("button", { name: "Edit Custom stop", exact: true }).click();
  await pane.getByPlaceholder("Search for address or place...").fill("Updated manual address");
  await pane.getByRole("button", { name: "Apply activity changes", exact: true }).click();
  await capture("editor");
  const saved = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/itineraries/${id}/update`);
  await pane.getByRole("button", { name: "Save Changes", exact: true }).click();
  assert.equal((await saved).status(), 200);
  await pane.getByText("Saved", { exact: true }).waitFor();
  await pane.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await pane.getByRole("heading", { name: "Local browser edited trip", exact: true }).first().waitFor();
  assert.equal((await db.prepare("SELECT title FROM itineraries WHERE id = ? AND ownerId = ?").bind(id, session.ownerId).first()).title, "Local browser edited trip");
  const stored = JSON.parse((await db.prepare("SELECT activities FROM itineraries WHERE id = ?").bind(id).first()).activities);
  assert.equal(stored[0].activities[0].address, "Updated manual address");
  const openDelete = async () => {
    await pane.getByRole("button", { name: "Actions for Local browser edited trip", exact: true }).click();
    assert.equal(await page.getByRole("menuitem", { name: /Share|Duplicate/ }).count(), 0);
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
  };
  await openDelete();
  await capture("delete-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("alertdialog").evaluate((dialog) => dialog.contains(document.activeElement)), true);
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("alertdialog").evaluate((dialog) => dialog.contains(document.activeElement)), true);
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await pane.getByRole("button", { name: "Actions for Local browser edited trip", exact: true }).evaluate((button) => button === document.activeElement), true);
  assert.ok(await db.prepare("SELECT id FROM itineraries WHERE id = ?").bind(id).first());
  await openDelete();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await pane.getByText("No itineraries yet", { exact: true }).waitFor();
  assert.equal(await db.prepare("SELECT id FROM itineraries WHERE id = ?").bind(id).first(), null);
  assert.ok(await db.prepare("SELECT id FROM itineraries WHERE id = ? AND ownerId = ?").bind(otherId, otherOwner).first());
  assert.equal(await pane.getByRole("link", { name: /Create/ }).count(), 0);
  let failedChecks = 0;
  let shellChecks = 0;
  let failProvider = false;
  const providerFailure = (route) => {
    assert.ok(route.request().headers()["x-localley-session-id"]);
    if (failProvider) {
      failedChecks++;
      return route.fulfill({ status: 503, json: { error: "Local provider failure" } });
    }
    shellChecks++;
    return route.continue();
  };
  await page.route("**/api/session", providerFailure);
  await page.reload();
  await page.locator(".identity").waitFor({ state: "attached" });
  failProvider = true;
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  await pane.getByText("Trip access could not be confirmed. Trips remain hidden.", { exact: true }).waitFor();
  const initialShellChecks = shellChecks;
  await pane.getByRole("button", { name: "Retry trip access", exact: true }).click();
  await pane.getByText("Trip access could not be confirmed. Trips remain hidden.", { exact: true }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(failedChecks, 2, "Only explicit retry repeats a failed provider check");
  assert.equal(shellChecks, initialShellChecks, "Provider failures must not refresh the parent repeatedly");
  await page.unroute("**/api/session", providerFailure);
  await pane.getByRole("button", { name: "Retry trip access", exact: true }).click();
  await pane.getByText("No itineraries yet", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Preview account access", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await pane.getByText("Sign in with a verified, linked account to view trips.", { exact: true }).waitFor();
  assert.equal(await page.locator(".native-trips").count(), 0);
  await page.unroute("**/api/app-config", previewConfig);
}
