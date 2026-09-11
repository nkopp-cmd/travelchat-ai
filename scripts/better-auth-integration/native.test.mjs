import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { startLocalServer } from "../../cloudflare/auth-proof/scripts/local-server.mjs";
import { assetsDirectory, buildEvidence } from "./build.mjs";
import { editorJourney } from "./editor-journey.mjs";
import { collectionJourney } from "./collection-journey.mjs";

const require = createRequire(new URL("../../cloudflare/auth-proof/package.json", import.meta.url));
const { chromium } = require("playwright");
const results = fileURLToPath(new URL("../../test-results/better-auth-integration/", import.meta.url));
const spotId = "10000000-0000-4000-8000-000000000001";

test("actual root provider and controls over local HTTPS, native workerd and D1", { timeout: 600_000 }, async (t) => {
  let server, browser, page;
  let stage = "start";
  const passed = [], calls = [], screenshots = [];
  let external = 0, pageErrors = 0;
  const checkpoint = (name) => { passed.push(name); t.diagnostic(name); };
  try {
    await mkdir(results, { recursive: true });
    server = await startLocalServer({ assetsDirectory });
    const { origin, db } = server;
    browser = await chromium.launch({ executablePath: process.env.LOCAL_INTEGRATION_BROWSER,
      headless: true, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: "block",
      reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
    context.on("page", (tab) => tab.on("pageerror", () => { pageErrors++; }));
    context.on("response", (response) => {
      const url = new URL(response.url());
      // Reset callback paths contain tokens too. Never retain them or URL queries.
      if (url.origin === origin && url.pathname.startsWith("/api/")) calls.push({
        method: response.request().method(), path: url.pathname.replace(/^(\/api\/auth\/reset-password)\/.+$/, "$1/:redacted"),
        status: response.status() });
    });
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== origin) { external++; return route.abort(); }
      return route.continue();
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    page = await context.newPage();
    page.setDefaultTimeout(12_000);
    const status = (value) => page.waitForFunction((value) => document.querySelector('[data-testid="status"]')?.textContent === value, value);
    const count = async (table) => (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n;
    const rate = () => db.prepare('DELETE FROM "rateLimit"').run();
    const call = (path, method = "GET", body, expected) => page.evaluate(async ({ path, method, body, expected }) => {
      const response = await fetch(path, { method, credentials: "same-origin", headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(expected === undefined ? {} : { "x-localley-session-id": expected }),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, data: await response.json() };
    }, { path, method, body, expected });
    const screenshot = async (name, widths = [390, 900, 1440]) => {
      // Clear fixture form values. Never capture callback URLs or credential fields.
      assert.equal(new URL(page.url()).searchParams.has("token"), false);
      await page.locator('form').evaluate((form) => form.reset());
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        if (name.startsWith("collection-")) await page.waitForTimeout(200);
        await page.evaluate(async (collection) => {
          const target = collection ? document.querySelector('[data-testid="collection"]') : null;
          await document.fonts.ready;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          window.scrollTo(0, target ? target.getBoundingClientRect().top + scrollY - 16 : 0);
          await new Promise(requestAnimationFrame);
        }, name.startsWith("collection-"));
        await page.screenshot({ path: join(results, `${name}-${width}.png`), fullPage: !name.startsWith("collection-") });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        screenshots.push(`${name}-${width}.png`);
      }
    };
    const save = () => page.getByTestId("save").getByRole("button");
    const interaction = () => page.getByTestId("interactions").getByRole("button", { name: /saved spots|^Save / });
    const pressed = (testId, value) => page.waitForFunction(({ testId, value }) => {
      const button = document.querySelector(`[data-testid="${testId}"] button[aria-pressed]`);
      return button?.getAttribute("aria-pressed") === String(value) && !button.disabled;
    }, { testId, value });
    const password = "Synthetic-" + randomBytes(20).toString("hex");
    const authenticate = async (email, action, expected, pwd = password) => {
      await rate();
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(pwd);
      const paths = { "Sign up": "/api/auth/sign-up/email", "Sign in": "/api/auth/sign-in/email",
        "Request password reset": "/api/auth/request-password-reset", "Reset password": "/api/auth/reset-password" };
      const response = page.waitForResponse((response) => new URL(response.url()).pathname ===
        paths[action] && response.request().method() === "POST");
      await page.getByRole("button", { name: action, exact: true }).click();
      await response;
      await page.waitForFunction((expected) => document.querySelector('[data-testid="auth-result"]')?.textContent === expected, expected);
    };
    const signup = async (email) => {
      await authenticate(email, "Sign up", "Auth success");
      await authenticate(email, "Sign in", "Auth error 403");
      assert.equal(await count("session"), 0);
      const user = await db.prepare("SELECT id FROM user WHERE email = ?").bind(email).first();
      const mail = await db.prepare("SELECT url FROM local_outbox WHERE authUserId = ? AND kind = 'verify' ORDER BY id DESC LIMIT 1").bind(user.id).first();
      assert.ok(mail);
      const callback = new URL(mail.url);
      assert.equal(callback.origin, origin);
      callback.searchParams.set("callbackURL", origin + "/");
      await page.goto(callback.href);
      await page.goto(origin);
      await authenticate(email, "Sign in", "Auth success");
      await status("unlinked");
      const cookie = (await context.cookies()).find((item) => item.name === "__Secure-better-auth.session_token");
      assert.ok(cookie?.secure && cookie.httpOnly && cookie.sameSite === "Lax");
      // Check exposure as a boolean, never return a JS cookie value to Node.
      assert.equal(await page.evaluate(() => document.cookie.includes("session_token")), false);
      return user.id;
    };

    stage = "signed-out actual controls and return path";
    assert.equal((await page.goto(origin)).status(), 200);
    await status("signedout");
    await save().click();
    assert.equal(new URL(page.url()).searchParams.get("redirect_url"), `/spots/${spotId}`);
    assert.equal(await count("saved_spots"), 0);
    assert.equal(calls.filter((c) => c.path === "/api/spots/save").length, 0);
    await screenshot("signedout");
    checkpoint(stage);

    stage = "SDK signup, unverified rejection, verification, unlinked guard";
    const alice = await signup("root-alice@example.test");
    assert.equal(await save().isDisabled(), true);
    assert.equal(await interaction().isDisabled(), true);
    assert.equal(await count("owners"), 0);
    const unlinked = (await call("/api/session")).data;
    const denied = await call("/api/spots/save", "POST", { spotId }, unlinked.sessionId);
    assert.equal(denied.status, 409);
    assert.equal(denied.data.error.code, "conflict");
    assert.equal(await count("saved_spots"), 0);
    await screenshot("unlinked");
    checkpoint(stage);

    stage = "explicit new account, unique owner/profile, root save and reload/remove";
    await page.getByRole("button", { name: "Create new local account" }).click();
    await status("ready");
    const aliceSession = (await call("/api/session")).data;
    assert.equal(aliceSession.authUserId, alice);
    assert.ok(aliceSession.ownerId && aliceSession.userRecordId);
    assert.equal(await count("owners"), 1);
    assert.equal(await count("profiles"), 1);
    await pressed("save", false);
    await save().click();
    await pressed("save", true);
    assert.equal((await db.prepare("SELECT ownerId, spotId FROM saved_spots").first()).ownerId, aliceSession.ownerId);
    assert.equal(await count("application_outbox"), 1);
    await page.reload();
    await status("ready");
    await pressed("save", true);
    await pressed("interactions", true);
    await screenshot("ready-saved");
    await interaction().click();
    await pressed("interactions", false);
    assert.equal(await count("saved_spots"), 0);
    assert.equal(await count("application_outbox"), 1);
    await page.reload();
    await status("ready");
    await pressed("save", false);
    checkpoint(stage);

    stage = "missing empty mismatched preconditions reject with no rows or events";
    for (const method of ["POST", "DELETE"]) for (const expected of [undefined, "", "stale-session"]) {
      assert.equal((await call("/api/spots/save", method, { spotId }, expected)).status, expected === "stale-session" ? 409 : 428);
      assert.equal(await count("saved_spots"), 0);
      assert.equal(await count("application_outbox"), 1);
    }
    checkpoint(stage);

    stage = "verified cookie cannot reach unsupported legacy routes";
    for (const path of ["/api/subscription/status", "/api/subscription/checkout", "/api/connect/status",
      "/api/connect/onboard", "/api/gamification/award", "/api/itineraries/generate",
      "/api/outbox", "/api/test-control"]) {
      assert.equal((await call(path, path.endsWith("status") || path === "/api/itineraries" ? "GET" : "POST", undefined)).status, 404);
    }
    checkpoint(stage);

    stage = "native D1 mapping fault blocks actual provider and controls";
    await db.exec("ALTER TABLE identity_links RENAME TO unavailable_identity_links");
    try {
      await page.getByRole("button", { name: "Refresh session" }).click();
      await status("blocked");
      assert.equal(await save().isDisabled(), true);
      assert.equal(await interaction().isDisabled(), true);
      assert.equal(await page.getByTestId("capability").textContent(), "false");
      assert.equal(await page.getByRole("region", { name: "Session" }).getAttribute("data-identity-cleared"), "true");
      await screenshot("mapping-error");
    } finally { await db.exec("ALTER TABLE unavailable_identity_links RENAME TO identity_links"); }
    await page.getByRole("button", { name: "Refresh session" }).click();
    await status("ready");
    await pressed("save", false);
    await save().click();
    await pressed("save", true);
    checkpoint(stage);

    stage = "second SDK account, secure cookie, isolated root save state";
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await status("signedout");
    const bob = await signup("root-bob@example.test");
    assert.notEqual(bob, alice);
    await page.getByRole("button", { name: "Create new local account" }).click();
    await status("ready");
    const bobSession = (await call("/api/session")).data;
    assert.notEqual(bobSession.ownerId, aliceSession.ownerId);
    assert.notEqual(bobSession.userRecordId, aliceSession.userRecordId);
    assert.equal(await count("owners"), 2);
    assert.equal(await count("profiles"), 2);
    await pressed("save", false);
    await pressed("interactions", false);
    assert.equal((await call("/api/spots/save", "POST", { spotId }, aliceSession.sessionId)).status, 409);
    assert.equal(await count("saved_spots"), 1);
    assert.equal(await count("application_outbox"), 2);
    await save().click();
    await pressed("save", true);
    assert.equal(await count("saved_spots"), 2);
    await page.reload();
    await status("ready");
    await pressed("interactions", true);
    await interaction().click();
    await pressed("interactions", false);
    assert.equal(await count("saved_spots"), 1);
    assert.equal((await db.prepare("SELECT ownerId FROM saved_spots").first()).ownerId, aliceSession.ownerId);
    checkpoint(stage);

    stage = "delayed real mapping response cannot restore a signed-out identity";
    let release, received;
    const held = new Promise((done) => { release = done; });
    const arrived = new Promise((done) => { received = done; });
    await page.route("**/api/session", async (route) => {
      const response = await route.fetch();
      received();
      await held;
      await route.fulfill({ response }).catch(() => {});
    });
    await page.getByRole("button", { name: "Refresh session" }).click();
    let delayTimer;
    try { await Promise.race([arrived, new Promise((_, reject) => { delayTimer = setTimeout(() => reject(new Error("mapping delay timeout")), 12_000); })]); }
    finally { clearTimeout(delayTimer); }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await status("signedout");
    release();
    await page.unroute("**/api/session");
    await page.waitForTimeout(300);
    await status("signedout");
    assert.equal(await page.getByTestId("capability").textContent(), "false");
    checkpoint(stage);

    stage = "revoked native session cookie returns 401 and clears root state";
    await authenticate("root-alice@example.test", "Sign in", "Auth success");
    await status("ready");
    await pressed("save", true);
    const live = (await call("/api/session")).data;
    await db.prepare("DELETE FROM session WHERE id = ?").bind(live.sessionId).run();
    assert.equal((await call("/api/session")).status, 401);
    assert.equal((await call("/api/spots/save", "DELETE", { spotId }, live.sessionId)).status, 401);
    await page.getByRole("button", { name: "Refresh session" }).click();
    await status("signedout");
    assert.equal(await page.getByTestId("capability").textContent(), "false");
    assert.equal(await save().getAttribute("aria-pressed"), "false");
    assert.equal(await page.getByRole("region", { name: "Session" }).getAttribute("data-identity-cleared"), "true");
    assert.equal(await count("saved_spots"), 1);
    checkpoint(stage);

    stage = "SDK password reset through Node-only outbox revokes old cookie";
    await authenticate("root-alice@example.test", "Sign in", "Auth success");
    await status("ready");
    const oldCookies = await context.cookies();
    await authenticate("root-alice@example.test", "Request password reset", "Auth success");
    const mail = await db.prepare("SELECT url FROM local_outbox WHERE authUserId = ? AND kind = 'reset' ORDER BY id DESC LIMIT 1").bind(alice).first();
    assert.ok(mail);
    assert.equal(new URL(mail.url).origin, origin);
    await page.goto(mail.url);
    const newPassword = "Synthetic-reset-" + randomBytes(20).toString("hex");
    await authenticate("root-alice@example.test", "Reset password", "Auth success", newPassword);
    await context.addCookies(oldCookies);
    assert.equal((await call("/api/session")).status, 401);
    await page.getByRole("button", { name: "Refresh session" }).click();
    await status("signedout");
    await authenticate("root-alice@example.test", "Sign in", "Auth error 401");
    await authenticate("root-alice@example.test", "Sign in", "Auth success", newPassword);
    await status("ready");
    await pressed("save", true);
    checkpoint(stage);

    stage = "account switch rejects delayed real saved-state replies";
    let holdAlice = true, releaseSaved, receivedSaved;
    const savedHeld = new Promise((done) => { releaseSaved = done; });
    const savedArrived = new Promise((done) => { receivedSaved = done; });
    const deliveries = [];
    await page.route("**/api/spots/save?*", async (route) => {
      if (!holdAlice) return route.continue();
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).saved, true);
      receivedSaved();
      const delivery = savedHeld.then(() => route.fulfill({ response }).catch(() => {}));
      deliveries.push(delivery);
      await delivery;
    });
    await page.getByRole("button", { name: "Refresh session" }).click();
    try { await Promise.race([savedArrived, new Promise((_, reject) => {
      delayTimer = setTimeout(() => reject(new Error("saved delay timeout")), 12_000);
    })]); } finally { clearTimeout(delayTimer); }
    holdAlice = false;
    await authenticate("root-bob@example.test", "Sign in", "Auth success");
    await status("ready");
    assert.equal((await call("/api/session")).data.authUserId, bob);
    await pressed("save", false);
    await pressed("interactions", false);
    releaseSaved();
    await Promise.all(deliveries);
    await page.unroute("**/api/spots/save?*");
    await page.waitForTimeout(300);
    await pressed("save", false);
    await pressed("interactions", false);
    assert.equal(await count("saved_spots"), 1);
    assert.equal(await count("application_outbox"), 3);
    checkpoint(stage);
    const editorEvidence = await editorJourney({ page, context, db, call, status, screenshot, calls,
      checkpoint: (name) => { stage = name; checkpoint(name); },
      setStage: (name) => { stage = name; },
      signIn: async (who) => { await authenticate(`root-${who}@example.test`, "Sign in", "Auth success", who === "alice" ? newPassword : password); await status("ready"); },
      aliceSession, bobSession, assetsDirectory });
    const collectionEvidence = await collectionJourney({ page, context, db, call, status, screenshot, calls,
      checkpoint: (name) => { stage = name; checkpoint(name); }, setStage: (name) => { stage = name; },
      signIn: async (who, options) => {
        const original = page;
        try {
          if (options?.modal) { page = await context.newPage(); await page.goto(origin); }
          await authenticate(`root-${who}@example.test`, "Sign in", "Auth success", who === "alice" ? newPassword : password);
          await status("ready");
        } finally {
          if (page !== original) { await page.close(); page = original; }
        }
        if (options?.modal) await page.getByRole("button", { name: "Refresh session", exact: true, includeHidden: true }).evaluate((button) => button.click());
      },
      aliceSession, bobSession, assetsDirectory });
    assert.equal(external, 0);
    assert.equal(server.outboundRequests, 0);
    assert.equal(pageErrors, 0);
    const groupedCalls = Object.entries(calls.reduce((counts, call) => {
      const key = `${call.method} ${call.path} ${call.status}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {})).map(([operation, count]) => ({ operation, count }));
    const evidence = JSON.stringify({ passed, calls, screenshots, editorEvidence, collectionEvidence,
      checkpointCount: passed.length, browserApiResponses: calls.length, screenshotCount: screenshots.length,
      externalRequests: external, workerOutboundRequests: server.outboundRequests, pageErrors,
      nativeApiRequests: server.nativeApiRequests, groupedCalls,
      nativeWorkerdD1: true, rootProvider: true, betterAuthVersion: buildEvidence.betterAuthVersion }, null, 2);
    for (const { token } of (await db.prepare("SELECT token FROM local_outbox").all()).results) {
      assert.equal(evidence.includes(token) || evidence.includes(encodeURIComponent(token)), false);
    }
    assert.equal(evidence.includes(password) || evidence.includes(newPassword), false);
    await writeFile(join(results, "evidence.json"), evidence);
    t.diagnostic(JSON.stringify({ passed: passed.length, nativeApiRequests: server.nativeApiRequests,
      browserApiResponses: calls.length, screenshots: screenshots.length,
      external, workerOutboundRequests: server.outboundRequests, pageErrors }));
    assert.equal(collectionEvidence.productIssues.length, 0, "Collection product issues remain; see evidence.json");
    await rm(join(results, "failure.json"), { force: true });
  } catch (error) {
    // Playwright errors can contain verification URLs. Never emit raw errors or traces.
    await writeFile(join(results, "failure.json"), JSON.stringify({ stage, passed, calls, screenshots,
      errorType: error?.constructor?.name,
      sourceLocations: String(error?.stack).match(/(?:collection-journey|editor-journey|native\.test)\.mjs:\d+:\d+/g),
      assertion: error?.code === "ERR_ASSERTION" ? {
        actual: ["number", "boolean"].includes(typeof error.actual) ? error.actual : "redacted",
        expected: ["number", "boolean"].includes(typeof error.expected) ? error.expected : "redacted",
      } : undefined }, null, 2));
    throw new Error(`Root native integration failed at: ${stage}`);
  } finally {
    try { await browser?.close(); } finally { await server?.close(); }
  }
});
