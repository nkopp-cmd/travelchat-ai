import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { startLocalServer } from "../scripts/local-server.mjs";
import { browserUiChecks } from "./browser-ui.mjs";
import { captureBrowserState } from "./browser-visual.mjs";

test("HTTPS browser through native assets, workerd and D1", { timeout: 240_000 }, async (t) => {
  let stage = "start local runtime";
  let server;
  let browser;
  const started = performance.now();
  const metrics = [];
  const evidence = [];
  const results = resolve("../../test-results/cloudflare-frontend");
  assert.ok((await stat(resolve("../.."))).isDirectory());
  await mkdir(results, { recursive: true });
  let page;
  try {
    server = await startLocalServer();
    const { origin, db } = server;
    const { chromium } = await import("playwright");
    stage = "start local Chromium";
    browser = await chromium.launch({ headless: true, args: ["--no-proxy-server", "--disable-background-networking"] });
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
    assert.deepEqual(Object.keys(catalog.data.spots[0]).sort(), ["category", "description", "id", "localley_score", "name", "photos"]);
    assert.equal(typeof catalog.data.spots[0].name, "object");
    assert.equal(catalog.data.spots[0].photos, null);
    assert.equal(catalog.data.spots[0].localley_score, null);
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
      capture: (state) => captureBrowserState(page, results, state, evidence).catch((error) => {
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
