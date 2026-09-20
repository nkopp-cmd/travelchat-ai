import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { startLocalServer } from "../scripts/local-server.mjs";
import { browserUiChecks } from "./browser-ui.mjs";
import { captureBrowserState } from "./browser-visual.mjs";
import { loadPreviewExpectations, checkPreviewBrowser } from "../scripts/check-native-preview.mjs";
import { itineraryHTTPSChecks } from "./itineraries-https.mjs";
import { tripsUiChecks } from "./trips-ui.mjs";

test("reviewed real catalog renders licensed images and map journeys through local workerd and D1", { timeout: 150_000 }, async (t) => {
  const { chromium } = await import("playwright");
  const { startLocalServer } = await import("../scripts/local-server.mjs");
  const expected = await loadPreviewExpectations();
  const server = await startLocalServer();
  let browser;
  try {
    // Only this disposable local database is replaced; no HTTP fixture controls exist.
    await server.db.prepare("DELETE FROM spots").run();
    await server.db.batch(expected.spots.map(spot => server.db.prepare(`INSERT INTO spots
      (id,name,description,category,localley_score,photos,visible,city,address,latitude,longitude,photo_credits,source_urls)
      VALUES (?,?,?,?,NULL,?,1,'Seoul',?,?,?,?,?)`).bind(spot.id, JSON.stringify(spot.name), JSON.stringify(spot.description), spot.category,
        JSON.stringify(spot.photos), spot.address, spot.latitude, spot.longitude, JSON.stringify(spot.photoCredits), JSON.stringify(spot.sourceUrls))));
    const before = (await server.db.prepare("SELECT * FROM spots ORDER BY id").all()).results;
    browser = await chromium.launch({ headless: true, executablePath: process.env.AUTH_PROOF_BROWSER_EXECUTABLE });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, reducedMotion: "reduce" });
    let blocked = 0;
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === server.origin || url.origin === "https://tile.openstreetmap.org") return route.continue();
      blocked++; return route.abort();
    });
    // Presentation only: all API reads still execute the local Worker and real D1 binding.
    await context.route("**/api/app-config", route => route.fulfill({ json: {
      mode: "preview", catalogSource: "seoul-pilot", registration: "restricted-preview", emailDelivery: "cloudflare",
    } }));
    const parent = resolve("../../test-results/native-catalog"); await mkdir(parent, { recursive: true });
    const output = await mkdtemp(resolve(parent, "run-"));
    const result = await checkPreviewBrowser(context, expected, { output, baseUrl: server.origin });
    assert.deepEqual((await server.db.prepare("SELECT * FROM spots ORDER BY id").all()).results, before);
    assert.equal(server.outboundRequests, 0); assert.equal(blocked, 0);
    t.diagnostic(JSON.stringify({ output, realReviewedPlaces: expected.spots.length, images: expected.assets.length,
      ...result, localDatabaseUnchanged: true, realEmailSent: false, workerOutboundRequests: 0,
      browserExternalSource: "OpenStreetMap tiles only" }));
  } finally { try { await browser?.close(); } finally { await server.close(); } }
});

test("HTTPS itinerary edits, native Trips UI and route-specific UTF8 body limits", { timeout: 120_000 }, async () => {
  const server = await startLocalServer();
  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ executablePath: process.env.AUTH_PROOF_BROWSER_EXECUTABLE, headless: true, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: "block" });
    let external = 0;
    const errors = [];
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === server.origin) return route.continue();
      external++; return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.origin);
    const call = async (path, method = "GET", body, expected) => page.evaluate(async ({ path, method, body, expected }) => {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json",
        ...(expected === undefined ? {} : { "x-localley-session-id": expected }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, data: await response.json() };
    }, { path, method, body, expected });
    const email = "itinerary-https@example.test", password = "Synthetic-" + randomBytes(20).toString("hex");
    const signup = await call("/api/auth/sign-up/email", "POST", { email, password, name: "Synthetic itinerary" });
    assert.equal(signup.status, 200);
    const mail = await server.db.prepare("SELECT url FROM local_outbox WHERE authUserId = ? AND kind = 'verify' ORDER BY id DESC LIMIT 1").bind(signup.data.user.id).first();
    await page.goto(mail.url);
    await page.goto(server.origin);
    assert.equal((await call("/api/auth/sign-in/email", "POST", { email, password })).status, 200);
    const session = await call("/api/session");
    assert.equal(session.status, 200);
    assert.equal(session.data.state, "unlinked");
    assert.equal((await call("/api/account/new", "POST", {}, session.data.sessionId)).status, 201);
    assert.deepEqual(await call("/api/itineraries"), { status: 200, data: { itineraries: [], nextOffset: null } });
    assert.equal((await call("/api/itineraries/generate", "POST", {}, session.data.sessionId)).status, 400);
    await itineraryHTTPSChecks({ db: server.db, page, call });
    await server.db.prepare("DELETE FROM itineraries").run();
    await tripsUiChecks({ db: server.db, page, call, origin: server.origin });
    assert.deepEqual(errors, []);
    assert.equal(external, 0);
    assert.equal(server.outboundRequests, 0);
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
  }
});

test("HTTPS browser through native assets, workerd and D1", { timeout: 240_000 }, async (t) => {
  let stage = "start local runtime";
  let server;
  let browser;
  const started = performance.now();
  const metrics = [];
  const evidence = [];
  const resultsRoot = resolve("../../test-results/cloudflare-frontend");
  assert.ok((await stat(resolve("../.."))).isDirectory());
  await mkdir(resultsRoot, { recursive: true });
  const results = await mkdtemp(resolve(resultsRoot, "run-"));
  t.diagnostic(JSON.stringify({ evidenceDirectory: results }));
  let page;
  try {
    server = await startLocalServer();
    const { origin, db } = server;
    const { chromium } = await import("playwright");
    stage = "start local Chromium";
    browser = await chromium.launch({ executablePath: process.env.AUTH_PROOF_BROWSER_EXECUTABLE, headless: true, args: ["--no-proxy-server", "--disable-background-networking"] });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: "block", reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
    let blocked = 0;
    let pageErrors = 0;
    let browserApiResponses = 0;
    context.on("page", (tab) => tab.on("pageerror", () => { pageErrors++; }));
    context.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin === origin && url.pathname.startsWith("/api/")) browserApiResponses++;
    });
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== origin) { blocked++; return route.abort(); }
      return route.continue();
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    page = await context.newPage();
    const call = async (path, method = "GET", body, expected) => {
      const start = performance.now();
      const result = await page.evaluate(async ({ path, method, body, expected }) => {
        const response = await fetch(path, { method, headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(expected === undefined ? {} : { "x-localley-session-id": expected }),
        }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, data: await response.json() };
      }, { path, method, body, expected });
      metrics.push({ operation: path.split("?")[0], status: result.status, wallMs: Math.round(performance.now() - start) });
      return result;
    };
    const count = async (table) => (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n;
    const rate = () => db.prepare('DELETE FROM "rateLimit"').run();
    const password = "Synthetic-" + randomBytes(20).toString("hex");
    const signup = async (email) => {
      await rate();
      const result = await call("/api/auth/sign-up/email", "POST", { name: "Synthetic browser account", email, password });
      assert.equal(result.status, 200);
      const mail = await db.prepare("SELECT url FROM local_outbox WHERE authUserId = ? AND kind = 'verify' ORDER BY id DESC LIMIT 1").bind(result.data.user.id).first();
      assert.ok(mail);
      // Tokens never leave trusted Node except for the intended browser callback.
      const callback = new URL(mail.url);
      assert.equal(callback.origin, origin);
      callback.searchParams.set("callbackURL", origin + "/");
      await page.goto(callback.href);
      await page.goto(origin);
      return result.data.user.id;
    };
    const login = async (email, pwd = password) => {
      await rate();
      return call("/api/auth/sign-in/email", "POST", { email, password: pwd });
    };

    stage = "native assets and public catalog";
    assert.equal((await page.goto(origin)).status(), 200);
    for (const path of ["/assets/app.js", "/assets/app.css"]) {
      assert.equal(await page.evaluate(async (path) => (await fetch(path)).status, path), 200);
    }
    const catalog = await call("/api/spots?limit=1");
    assert.equal(catalog.status, 200);
    assert.equal(catalog.data.nextOffset, 1);
    const spotId = catalog.data.spots[0].id;
    assert.deepEqual(Object.keys(catalog.data.spots[0]).sort(), [
      "address", "category", "city", "description", "id", "latitude", "localley_score", "longitude", "name", "photoCredits", "photos", "sourceUrls",
    ]);
    assert.equal(typeof catalog.data.spots[0].name, "object");
    assert.equal(catalog.data.spots[0].photos, null);
    assert.equal(catalog.data.spots[0].localley_score, null);
    for (const key of ["address", "city", "latitude", "longitude"]) assert.equal(catalog.data.spots[0][key], null);
    assert.deepEqual(catalog.data.spots[0].photoCredits, []);
    assert.deepEqual(catalog.data.spots[0].sourceUrls, []);
    for (const query of ["limit=0", "limit=101", "offset=-1", "offset=10001", "limit=1&limit=2", "ownerId=forged", "limit=1.5", "limit=", "offset=Infinity"]) {
      assert.equal((await call("/api/spots?" + query)).status, 400);
    }
    assert.equal((await call("/api/spots?limit=100&offset=10000")).data.nextOffset, null);
    await db.prepare("UPDATE spots SET visible = 0 WHERE id = ?").bind(spotId).run();
    assert.equal((await call("/api/spots")).data.spots.length, 3);
    await db.prepare("UPDATE spots SET visible = 1 WHERE id = ?").bind(spotId).run();
    for (const path of ["/api/outbox", "/api/local-outbox", "/api/test-control"]) assert.equal((await call(path)).status, 404);
    assert.equal((await call("/api/spots/save", "POST", { spotId }, "not-authentication")).status, 401);

    stage = "real browser signup, verification and secure cookie";
    const alice = await signup("browser-alice@example.test");
    assert.equal((await login("browser-alice@example.test", "incorrect-random-password")).status, 401);
    assert.equal((await login("browser-alice@example.test")).status, 200);
    const cookies = await context.cookies();
    const credential = cookies.find((cookie) => cookie.name === "__Secure-better-auth.session_token");
    assert.ok(credential?.secure && credential.httpOnly && credential.sameSite === "Lax");
    assert.ok(!(await page.evaluate(() => document.cookie)).includes("session_token"));
    const aliceSession = (await call("/api/session")).data;
    assert.equal(aliceSession.state, "unlinked");
    assert.equal((await call("/api/account/new", "POST", {}, "stale-session")).status, 409);
    assert.equal(await count("owners"), 0);
    assert.equal((await call("/api/account/new", "POST", {}, aliceSession.sessionId)).status, 201);
    for (const method of ["POST", "DELETE"]) {
      const missing = await call("/api/spots/save", method, { spotId });
      assert.equal(missing.status, 428);
      assert.equal(missing.data.error.code, "session_required");
    }
    assert.equal(await count("saved_spots"), 0);
    assert.equal(await count("application_outbox"), 0);
    assert.equal((await call("/api/spots/save", "POST", { spotId }, aliceSession.sessionId)).status, 200);
    assert.equal(await count("application_outbox"), 1);
    assert.equal((await call("/api/spots/save", "DELETE", { spotId }, aliceSession.sessionId)).status, 200);

    stage = "cross-user expected-session regression with zero writes and events";
    const bob = await signup("browser-bob@example.test");
    assert.equal((await login("browser-bob@example.test")).status, 200);
    const bobSession = (await call("/api/session")).data;
    const before = await count("application_outbox");
    for (const path of ["/api/account/new", "/api/account/claim", "/api/private-notes", "/api/spots/save"]) {
      const response = await call(path, "POST", path.endsWith("save") ? { spotId } : {}, aliceSession.sessionId);
      t.diagnostic(JSON.stringify({ checkpoint: "cross-user expected-session", path, status: response.status,
        sessionChanged: response.data.error?.code === "session_changed", conflict: response.data.error?.code === "conflict" }));
      assert.equal(response.status, 409);
      assert.equal(response.data.error.code, "session_changed");
    }
    assert.equal(await count("owners"), 1);
    assert.equal(await count("saved_spots"), 0);
    assert.equal(await count("private_notes"), 0);
    assert.equal(await count("application_outbox"), before);
    assert.equal((await call("/api/account/new", "POST", {}, bobSession.sessionId)).status, 201);
    assert.equal((await login("browser-alice@example.test")).status, 200);
    assert.equal((await call("/api/spots/save", "POST", { spotId }, bobSession.sessionId)).status, 409);
    assert.equal(await count("saved_spots"), 0);
    assert.equal(await count("application_outbox"), before);
    assert.notEqual(alice, bob);

    stage = "password reset revokes old cookie";
    const oldCookies = await context.cookies();
    const newPassword = "Synthetic-new-" + randomBytes(20).toString("hex");
    assert.equal((await call("/api/auth/request-password-reset", "POST", { email: "browser-alice@example.test", redirectTo: origin + "/" })).status, 200);
    const reset = await db.prepare("SELECT url, token FROM local_outbox WHERE authUserId = ? AND kind = 'reset' ORDER BY id DESC LIMIT 1").bind(alice).first();
    assert.ok(reset);
    assert.equal(new URL(reset.url).origin, origin);
    await page.goto(reset.url);
    assert.equal((await call("/api/auth/reset-password", "POST", { token: reset.token, newPassword })).status, 200);
    await context.addCookies(oldCookies);
    assert.equal((await call("/api/session")).status, 401);
    assert.equal((await login("browser-alice@example.test", password)).status, 401);
    assert.equal((await login("browser-alice@example.test", newPassword)).status, 200);
    assert.equal((await call("/api/auth/sign-out", "POST", {})).status, 200);
    assert.equal((await call("/api/session")).status, 401);

    t.diagnostic(JSON.stringify({ checkpoint: "native browser API regressions passed", nativeAssets: true,
      nativeWorkerdD1: true, requests: metrics.length, wallMs: Math.round(performance.now() - started) }));

    await browserUiChecks({ page, context, origin, db, call, stage: (value) => { stage = value; },
      capture: (state) => captureBrowserState(page, results, state, evidence, /^(preferences|trends)-/.test(state) ? [390, 900, 1440] : undefined).catch((error) => {
        if (error.code === "ERR_ASSERTION") t.diagnostic(JSON.stringify({ visualCheck: error.message }));
        throw error;
      }) });

    stage = "public screenshots at three widths";
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelectorAll("article").length >= 4);
    await page.getByText("Signed out.", { exact: false }).waitFor();
    await captureBrowserState(page, results, "public", evidence, [390, 900, 1440]);
    assert.equal(pageErrors, 0);
    assert.equal(blocked, 0);
    t.diagnostic(JSON.stringify({ nativeAssets: true, nativeWorkerdD1: true, wallMs: Math.round(performance.now() - started), requests: metrics.length,
      maximumRequestMs: Math.max(...metrics.map((row) => row.wallMs)), browserApiResponses, pageErrors, blockedExternalRequests: blocked }));
    t.diagnostic(JSON.stringify({ visualEvidence: evidence }));
  } catch {
    if (page && !new URL(page.url()).searchParams.has("token")) {
      await page.screenshot({ path: resolve(results, "failure.png"), fullPage: true }).catch(() => {});
    }
    // Browser errors can contain token callback URLs. Emit only a fixed stage label.
    throw new Error(`Local browser check failed: ${stage}`);
  } finally {
    try { await browser?.close(); } finally { await server?.close(); }
  }
});
