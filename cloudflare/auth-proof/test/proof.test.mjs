import "./host-environment.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { issueFixtureGrant } from "./fixture-issuer.mjs";
import { applicationTests } from "./application.test.mjs";

await mkdir(process.env.TMPDIR, { recursive: true });
const { getAuthTables } = await import("better-auth/db");
const { Miniflare, Log, LogLevel } = await import("miniflare");
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const base = "https://localhost";
const password = "Local-only-random-" + randomBytes(16).toString("hex");

test("native workerd + D1 authentication and migration proof", { timeout: 180_000 }, async (t) => {
  const started = performance.now();
  const state = await mkdtemp(resolve(".local/run-"));
  const secret = randomBytes(48).toString("hex");
  const claimSecret = randomBytes(48).toString("hex");
  const worker = {
    config: {
      name: config.name, type: "worker", compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      manifest: { mainModule: "worker.mjs", modulesRoot: resolve("dist"), modules: { "worker.mjs": { type: "esm", contents: await readFile("dist/worker.mjs", "utf8") } } },
      env: {
        ...Object.fromEntries(Object.entries({ ...config.vars, BETTER_AUTH_SECRET: secret, CLAIM_SECRET: claimSecret }).map(([key, value]) => [key, { type: "json", value }])),
        DB: { type: "d1", id: config.d1_databases[0].database_id, dev: { remote: false } },
      },
    },
    dev: { outboundService: { type: "fetcher", handler: () => new Response("Outbound network disabled", { status: 502 }) } },
  };
  let workerLogCount = 0;
  const options = { workers: [worker], resourcePersistencePath: state, resourceTmpPath: state,
    handleStructuredLogs: () => { workerLogCount++; },
    telemetry: { enabled: false }, cf: false, logRequests: false, unsafeLocalExplorer: false, log: new Log(LogLevel.ERROR) };
  const fixtureWorker = { ...worker, config: { ...worker.config, manifest: { ...worker.config.manifest,
    mainModule: "fixture-worker.mjs", modules: { ...worker.config.manifest.modules,
      "fixture-worker.mjs": { type: "esm", contents: await readFile("test/fixture-worker.mjs", "utf8") } } } } };
  const mf = new Miniflare(options);
  const metrics = [];
  const call = async (path, { method = "GET", body, cookie, origin = base, raw, headers = {} } = {}) => {
    const before = performance.now();
    const response = await mf.dispatchFetch(path.startsWith("https:") ? path : base + path, {
      method, redirect: "manual", duplex: "half",
      headers: { Origin: origin, ...(body === undefined && raw === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body === undefined && raw === undefined ? {} : { body: raw ?? JSON.stringify(body) }),
    });
    metrics.push({ operation: path.startsWith("/api/spots/save") ? "/api/spots/save" : path.includes("?") ? "token-callback" : path.startsWith("https:") ? "callback" : path, status: response.status, wallMs: Math.round(performance.now() - before) });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    return response;
  };
  const post = (path, body, cookie, extra = {}) => call(path, { method: "POST", body, cookie, ...extra });
  let db;
  const mail = async (userId, kind) => {
    const row = await db.prepare("SELECT url, token FROM local_outbox WHERE authUserId = ? AND kind = ? ORDER BY id DESC LIMIT 1").bind(userId, kind).first();
    assert.ok(row, "Outbox entry must exist when the HTTP response completes");
    return row;
  };
  const clearRate = () => db.prepare('DELETE FROM "rateLimit"').run();
  const signup = async (email) => {
    await clearRate();
    const response = await post("/api/auth/sign-up/email", { email, name: "Synthetic fixture", password, emailVerified: true });
    assert.equal(response.status, 200, "signup status");
    const data = await response.json();
    assert.equal(data.user.emailVerified, false, "spoofed verification must not work");
    assert.equal(data.token, null);
    return data.user.id;
  };
  const login = async (email, pwd = password) => {
    await clearRate();
    const response = await post("/api/auth/sign-in/email", { email, password: pwd });
    assert.equal(response.status, 200, "login status");
    const cookies = response.headers.getSetCookie();
    const credential = cookies.find((value) => value.startsWith("__Secure-better-auth.session_token="));
    assert.ok(credential, "secure session cookie exists");
    for (const flag of [/; Secure/i, /; HttpOnly/i, /; SameSite=Lax/i, /; Path=\//i]) assert.ok(flag.test(credential), "cookie security attribute");
    assert.ok(!/; Domain=/i.test(credential), "host-only cookie");
    assert.ok(!cookies.some((value) => value.includes("session_data=")), "no cookie cache");
    return credential.split(";")[0];
  };
  let alice, bob, claimant, aliceCookie, bobCookie, claimCookie, noteId;
  try {
    db = await mf.getD1Database("DB");
    await db.exec(await readFile("migrations/0001_local.sql", "utf8"));
    await db.exec(await readFile("migrations/0002_application.sql", "utf8"));
    await t.test("real D1 migration and schema", async () => {
      assert.equal((await db.prepare("PRAGMA foreign_keys").first()).foreign_keys, 1);
      assert.equal((await db.prepare("SELECT count(*) AS n FROM user").first()).n, 0);
      const before = Date.now();
      const clock = (await db.prepare("SELECT CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER) AS ms").first()).ms;
      assert.ok(Number.isSafeInteger(clock) && clock >= before - 100 && clock <= Date.now() + 100, "D1 clock returns current epoch milliseconds");
      for (const [name, table] of Object.entries(getAuthTables({ rateLimit: { storage: "database" } }))) {
        const columns = (await db.prepare(`PRAGMA table_info("${name}")`).all()).results;
        assert.deepEqual(columns.map((column) => column.name).sort(), ["id", ...Object.keys(table.fields)].sort());
      }
    });
    await t.test("signup spoof, unverified login, verification, default scrypt, wrong password, secure login", async () => {
      alice = await signup("alice@example.test");
      assert.equal((await post("/api/auth/sign-in/email", { email: "alice@example.test", password })).status, 403);
      assert.equal((await call("/api/private-notes")).status, 401);
      const stored = await db.prepare("SELECT password FROM account WHERE userId = ?").bind(alice).first();
      assert.ok(/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored.password), "default scrypt hash format");
      assert.equal((await call((await mail(alice, "verify")).url)).status, 302);
      assert.equal((await post("/api/auth/sign-in/email", { email: "alice@example.test", password: "incorrect-password" })).status, 401);
      aliceCookie = await login("alice@example.test");
      assert.equal((await call("/api/session", { cookie: aliceCookie })).status, 200);
      assert.equal((await call("/api/private-notes", { cookie: aliceCookie })).status, 409);
    });
    await t.test("explicit new identity and private CRUD", async () => {
      assert.equal((await post("/api/account/new", { ownerId: "forged" }, aliceCookie)).status, 400);
      const provision = await post("/api/account/new", {}, aliceCookie);
      assert.equal(provision.status, 201);
      assert.match((await provision.json()).ownerId, /^[0-9a-f-]{36}$/);
      assert.equal((await post("/api/account/new", {}, aliceCookie)).status, 200);
      assert.equal((await post("/api/private-notes", { body: "hello", ownerId: "forged" }, aliceCookie)).status, 400);
      const created = await post("/api/private-notes", { body: "Alice private note" }, aliceCookie);
      assert.equal(created.status, 201);
      noteId = (await created.json()).id;
      assert.equal((await call(`/api/private-notes/${noteId}`, { cookie: aliceCookie })).status, 200);
      assert.equal((await call(`/api/private-notes/${noteId}`, { method: "PATCH", body: { body: "Updated note" }, cookie: aliceCookie })).status, 200);
      bob = await signup("bob@example.test");
      assert.equal((await call((await mail(bob, "verify")).url)).status, 302);
      bobCookie = await login("bob@example.test");
      assert.equal((await post("/api/account/new", {}, bobCookie)).status, 201);
      assert.deepEqual(await (await call("/api/private-notes", { cookie: bobCookie })).json(), []);
      for (const method of ["GET", "PATCH", "DELETE"]) {
        assert.equal((await call(`/api/private-notes/${noteId}`, { method, cookie: bobCookie, ...(method === "PATCH" ? { body: { body: "stolen" } } : {}) })).status, 404);
      }
    });
    await t.test("CSRF, callback validation, local gate, private outbox, counted stream limit", async () => {
      await clearRate();
      assert.equal((await post("/api/auth/sign-in/email", { email: "alice@example.test", password }, undefined, { origin: "https://evil.test" })).status, 403);
      assert.equal((await post("/api/auth/sign-in/email", { email: "alice@example.test", password, callbackURL: "https://evil.test/steal" })).status, 403);
      assert.equal((await post("/api/auth/request-password-reset", { email: "alice@example.test", redirectTo: "https://evil.test/reset" })).status, 403);
      assert.equal((await post("/api/private-notes", { body: "csrf" }, aliceCookie, { origin: "https://evil.test" })).status, 403);
      assert.equal((await call("https://localley.io/api/session", { cookie: aliceCookie })).status, 403);
      assert.equal((await call("https://localhost.evil.test/api/session")).status, 403);
      for (const path of ["/api/outbox", "/api/local-outbox", "/api/claim/mint", "/api/auth/outbox"]) assert.equal((await call(path)).status, 404);
      const raw = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(8192))); controller.enqueue(new TextEncoder().encode("x".repeat(8193))); controller.close(); } });
      assert.equal((await call("/api/auth/sign-up/email", { method: "POST", raw })).status, 413);
    });
    await t.test("target-bound legacy claim, concurrent replay, conflict, expiry, tampering", async (claimTest) => {
      claimant = await signup("claimant@example.test");
      await call((await mail(claimant, "verify")).url);
      claimCookie = await login("claimant@example.test");
      const legacy = "user_ordinary-legacy_owner/string";
      const otherLegacy = "ordinary-legacy-owner-two";
      const historicalProfile = "12345678-1234-1234-1234-123456789abc";
      const historicalSave = "23456789-1234-1234-1234-123456789abc";
      const historicalSpot = "34567890-1234-1234-1234-123456789abc";
      for (const id of [legacy, otherLegacy]) {
        await db.prepare("INSERT INTO owners VALUES (?, 'legacy-fixture')").bind(id).run();
        await db.prepare("INSERT INTO profiles VALUES (?, ?)").bind(id === legacy ? historicalProfile : randomUUID(), id).run();
        await db.prepare("INSERT INTO owner_limits VALUES (?, 100)").bind(id).run();
      }
      await db.prepare("INSERT INTO saved_spots VALUES (?, ?, ?, ?)").bind(historicalSave, legacy, historicalSpot, 1234567890123).run();
      await db.prepare("INSERT INTO private_notes VALUES (?, ?, ?)").bind("legacy-note", legacy, "Synthetic legacy content").run();
      const grant = await issueFixtureGrant(db, claimSecret, claimant, legacy);
      await db.prepare("UPDATE user SET emailVerified = 0 WHERE id = ?").bind(claimant).run();
      assert.equal((await post("/api/account/claim", { token: grant }, claimCookie)).status, 403);
      assert.equal((await call("/api/private-notes", { cookie: claimCookie })).status, 403);
      await db.prepare("UPDATE user SET emailVerified = 1 WHERE id = ?").bind(claimant).run();
      assert.equal((await post("/api/account/claim", { token: grant }, bobCookie)).status, 409);
      assert.equal((await post("/api/account/claim", { token: grant }, undefined)).status, 401);
      assert.equal((await post("/api/account/claim", { token: grant }, claimCookie, { origin: "https://evil.test" })).status, 403);
      assert.equal((await post("/api/account/claim", { token: grant + "tampered" }, claimCookie)).status, 409);
      const expired = await issueFixtureGrant(db, claimSecret, claimant, otherLegacy, Date.now() - 1000);
      assert.equal((await post("/api/account/claim", { token: expired }, claimCookie)).status, 409);
      assert.equal((await db.prepare("SELECT count(*) AS n FROM identity_links WHERE authUserId = ?").bind(claimant).first()).n, 0);
      const results = await Promise.all(Array.from({ length: 6 }, () => post("/api/account/claim", { token: grant }, claimCookie)));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409, 409, 409, 409]);
      assert.equal((await call("/api/session", { cookie: claimCookie }).then((r) => r.json())).ownerId, legacy);
      assert.equal((await call("/api/session", { cookie: claimCookie }).then((r) => r.json())).userRecordId, historicalProfile);
      assert.deepEqual((await call("/api/spots/save", { cookie: claimCookie }).then((r) => r.json())).spots,
        [{ id: historicalSave, spot_id: historicalSpot, created_at: new Date(1234567890123).toISOString(), spots: null }]);
      assert.deepEqual(await db.prepare("SELECT * FROM saved_spots WHERE id = ?").bind(historicalSave).first(),
        { id: historicalSave, ownerId: legacy, spotId: historicalSpot, createdAtMs: 1234567890123 });
      assert.equal((await call("/api/private-notes/legacy-note", { cookie: claimCookie })).status, 200);
      const overwrite = await issueFixtureGrant(db, claimSecret, claimant, otherLegacy);
      assert.equal((await post("/api/account/claim", { token: overwrite }, claimCookie)).status, 409);
      const newOwnerConflict = await issueFixtureGrant(db, claimSecret, alice, otherLegacy);
      assert.equal((await post("/api/account/claim", { token: newOwnerConflict }, aliceCookie)).status, 409);
      const fourth = await signup("fourth@example.test");
      await call((await mail(fourth, "verify")).url);
      const fourthCookie = await login("fourth@example.test");
      const occupiedOwner = await issueFixtureGrant(db, claimSecret, fourth, legacy);
      assert.equal((await post("/api/account/claim", { token: occupiedOwner }, fourthCookie)).status, 409);
      assert.equal((await call("/api/private-notes", { cookie: fourthCookie })).status, 409);
      assert.equal((await db.prepare("SELECT count(*) AS n FROM claim_grants WHERE consumedAt IS NOT NULL").first()).n, 1);
      assert.equal((await call(`/api/private-notes/${noteId}`, { cookie: aliceCookie })).status, 200);
      await claimTest.test("D1 denies a grant that expires after validation but before batch execution", { timeout: 15_000 }, async () => {
        await mf.setOptions({ ...options, workers: [fixtureWorker] });
        db = await mf.getD1Database("DB");
        try {
          const expiresAt = Date.now() + 2000;
          const delayedGrant = await issueFixtureGrant(db, claimSecret, fourth, otherLegacy, expiresAt);
          const response = await post("/api/account/claim", { token: delayedGrant }, fourthCookie,
            { headers: { "x-fixture-batch-expiry": String(expiresAt) } });
          assert.ok(response.headers.has("x-fixture-before-batch"), "claim passed the early checks and reached batch");
          const beforeBatch = Number(response.headers.get("x-fixture-before-batch"));
          const afterDelay = Number(response.headers.get("x-fixture-after-delay"));
          assert.ok(beforeBatch < expiresAt, "grant was valid when batch was called");
          assert.ok(afterDelay > expiresAt, "native D1 clock passed expiry before SQL execution");
          assert.equal(response.status, 409);
          assert.equal((await db.prepare("SELECT count(*) AS n FROM identity_links WHERE authUserId = ?").bind(fourth).first()).n, 0);
          assert.equal((await db.prepare("SELECT consumedAt FROM claim_grants WHERE authUserId = ? AND expiresAt = ?").bind(fourth, expiresAt).first()).consumedAt, null);
          t.diagnostic(JSON.stringify({ delayedClaim: "denied by D1", remainingMsAtBatchCall: expiresAt - beforeBatch, expiredMsBeforeExecution: afterDelay - expiresAt }));
        } finally {
          await mf.setOptions(options);
          db = await mf.getD1Database("DB");
        }
      });
    });
    await t.test("whole-body deadline handles stalled, trickling, and failed native streams", async () => {
      await mf.setOptions({ ...options, workers: [fixtureWorker] });
      db = await mf.getD1Database("DB");
      const usersBefore = (await db.prepare("SELECT count(*) AS n FROM user").first()).n;
      try {
        for (const mode of ["stall", "trickle", "error"]) {
          const started = performance.now();
          const response = await post("/api/auth/sign-up/email", {}, undefined, { headers: { "x-fixture-body": mode } });
          const wallMs = Math.round(performance.now() - started);
          assert.equal(response.status, mode === "error" ? 400 : 408);
          assert.equal(response.headers.getSetCookie().length, 0);
          assert.deepEqual(await response.json(), { error: mode === "error" ? "Body read failed" : "Body read timeout" });
          if (mode !== "error") {
            assert.ok(wallMs >= 4900 && wallMs < 8000, "whole body deadline remains five seconds despite incoming chunks");
            assert.equal(response.headers.get("x-fixture-cancelled"), "true", "source cancellation was attempted");
          }
          if (mode === "trickle") assert.ok(Number(response.headers.get("x-fixture-chunks")) >= 5);
          t.diagnostic(JSON.stringify({ bodyMode: mode, status: response.status, wallMs }));
        }
        assert.equal((await db.prepare("SELECT count(*) AS n FROM user").first()).n, usersBefore);
      } finally {
        await mf.setOptions(options);
        db = await mf.getD1Database("DB");
      }
    });
    await t.test("D1 outbox and account write failures do not grant sessions or ownership", async () => {
      for (const table of ["local_outbox", "account"]) {
        await clearRate();
        const email = `${table}-failure@example.test`;
        const ownersBefore = (await db.prepare("SELECT count(*) AS n FROM owners").first()).n;
        await db.exec(`CREATE TRIGGER fixture_abort_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'synthetic private write failure'); END;`);
        try {
          const response = await post("/api/auth/sign-up/email", { email, name: "Failure fixture", password });
          assert.equal(response.status, 500);
          assert.equal(response.headers.getSetCookie().length, 0);
          assert.deepEqual(await response.json(), { error: "Local proof failure" });
          const orphan = await db.prepare("SELECT id, emailVerified FROM user WHERE email = ?").bind(email).first();
          assert.ok(orphan, "pinned nontransactional adapter leaves the created user row");
          assert.equal(orphan.emailVerified, 0);
          for (const privateTable of ["session", "identity_links", "local_outbox"]) {
            const field = privateTable === "session" ? "userId" : "authUserId";
            assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${privateTable} WHERE ${field} = ?`).bind(orphan.id).first()).n, 0);
          }
          assert.equal((await db.prepare("SELECT count(*) AS n FROM account WHERE userId = ?").bind(orphan.id).first()).n, table === "account" ? 0 : 1);
          assert.equal((await db.prepare("SELECT count(*) AS n FROM owners").first()).n, ownersBefore);
          assert.equal((await post("/api/account/new", {})).status, 401);
          t.diagnostic(JSON.stringify({ failedInsert: table, orphanUser: true, session: false, owner: false, outbox: false }));
          if (table === "local_outbox") {
            const reset = await post("/api/auth/request-password-reset", { email: "alice@example.test", redirectTo: base + "/reset" });
            assert.equal(reset.status, 500);
            assert.equal(reset.headers.getSetCookie().length, 0);
            assert.deepEqual(await reset.json(), { error: "Local proof failure" });
            assert.equal((await db.prepare("SELECT count(*) AS n FROM local_outbox WHERE authUserId = ? AND kind = 'reset'").bind(alice).first()).n, 0);
            assert.equal((await call("/api/session", { cookie: aliceCookie })).status, 200);
          }
        } finally {
          await db.exec("DROP TRIGGER fixture_abort_write;");
        }
        const loginAttempt = await post("/api/auth/sign-in/email", { email, password });
        assert.equal(loginAttempt.status, table === "account" ? 401 : 403);
        assert.equal(loginAttempt.headers.getSetCookie().length, 0);
      }
      assert.equal(workerLogCount, 0, "failure paths must not log SQL, credentials, or callback errors");
    });
    await applicationTests(t, { db, call, post, signup, login, mail, alice, aliceCookie, bob, bobCookie, claimSecret });
    assert.equal(workerLogCount, 0, "application failure paths must not log private data");
    await t.test("logout invalidates old cookie and session expiry", async () => {
      assert.equal((await post("/api/auth/sign-out", {}, bobCookie)).status, 200);
      assert.equal((await call("/api/session", { cookie: bobCookie })).status, 401);
      for (const method of ["GET", "POST", "DELETE"]) assert.equal((await call("/api/spots/save", { method, cookie: bobCookie,
        ...(method === "GET" ? {} : { body: { spotId: randomUUID() } }) })).status, 401);
      bobCookie = await login("bob@example.test");
      await db.prepare("UPDATE session SET expiresAt = 1 WHERE userId = ?").bind(bob).run();
      assert.equal((await call("/api/session", { cookie: bobCookie })).status, 401);
    });
    await t.test("password reset revokes every session, rejects reuse and expired tokens", async () => {
      const secondCookie = await login("alice@example.test");
      assert.ok(secondCookie !== aliceCookie, "separate login creates a separate session");
      assert.equal((await post("/api/auth/request-password-reset", { email: "alice@example.test", redirectTo: base + "/reset" })).status, 200);
      const reset = await mail(alice, "reset");
      const newPassword = password + "-new";
      assert.equal((await post("/api/auth/reset-password", { token: reset.token, newPassword })).status, 200);
      for (const cookie of [aliceCookie, secondCookie]) assert.equal((await call("/api/session", { cookie })).status, 401);
      assert.equal((await db.prepare("SELECT count(*) AS n FROM session WHERE userId = ?").bind(alice).first()).n, 0);
      assert.equal((await post("/api/auth/reset-password", { token: reset.token, newPassword })).status, 400);
      await clearRate();
      assert.equal((await post("/api/auth/sign-in/email", { email: "alice@example.test", password })).status, 401);
      aliceCookie = await login("alice@example.test", newPassword);
      await db.prepare("DELETE FROM local_outbox WHERE authUserId = ? AND kind = 'reset'").bind(alice).run();
      await post("/api/auth/request-password-reset", { email: "alice@example.test", redirectTo: base + "/reset" });
      const expired = await mail(alice, "reset");
      await db.prepare("UPDATE verification SET expiresAt = 1 WHERE identifier LIKE 'reset-password:%'").run();
      assert.equal((await post("/api/auth/reset-password", { token: expired.token, newPassword })).status, 400);
      assert.equal((await call("/api/session", { cookie: aliceCookie })).status, 200);
      const unverified = await signup("expired@example.test");
      const verification = await mail(unverified, "verify");
      const [head, payload] = verification.token.split(".");
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      claims.exp = Math.floor(Date.now() / 1000) - 10;
      const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const signed = `${head}.${encoded}`;
      const expiredJwt = `${signed}.${createHmac("sha256", secret).update(signed).digest("base64url")}`;
      const response = await call("/api/auth/verify-email?token=" + expiredJwt);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).code, "TOKEN_EXPIRED");
      assert.equal((await db.prepare("SELECT emailVerified FROM user WHERE id = ?").bind(unverified).first()).emailVerified, 0);
    });
    await t.test("database rate limiting survives fresh auth instances and forged IP headers", async () => {
      await clearRate();
      const statuses = [];
      for (let i = 0; i < 6; i++) statuses.push((await post("/api/auth/sign-in/email", { email: "nobody@example.test", password }, undefined, { headers: { "x-forwarded-for": `192.0.2.${i}`, "x-local-proof-ip": `192.0.2.${i}` } })).status);
      assert.ok(statuses.includes(429));
      assert.ok((await db.prepare('SELECT count(*) AS n FROM "rateLimit"').first()).n > 0);
      await clearRate();
      const burst = await Promise.all(Array.from({ length: 8 }, () => post("/api/auth/sign-in/email", { email: "nobody@example.test", password })));
      assert.equal(burst.filter((r) => r.status === 401).length, 3);
      assert.equal(burst.filter((r) => r.status === 429).length, 5);
    });
    await t.test("owner can delete private note", async () => {
      assert.equal((await call(`/api/private-notes/${noteId}`, { method: "DELETE", cookie: aliceCookie })).status, 200);
      assert.equal((await call(`/api/private-notes/${noteId}`, { cookie: aliceCookie })).status, 404);
    });
    await t.test("disabled flag and nonlocal configuration fail closed", async () => {
      for (const vars of [{ LOCAL_PROOF: "false" }, { AUTH_BASE_URL: "https://localley.io" }, { AUTH_BASE_URL: "http://localhost" }]) {
        await mf.setOptions({ ...options, workers: [{ ...worker, config: { ...worker.config,
          env: { ...worker.config.env, ...Object.fromEntries(Object.entries(vars).map(([key, value]) => [key, { type: "json", value }])) } } }] });
        assert.equal((await call("/api/session")).status, 403);
      }
      await mf.setOptions({ ...options, workers: [{ ...worker, config: { ...worker.config, env: { ...worker.config.env, AUTH_BASE_URL: { type: "json", value: "https://proof.test" } } } }] });
      assert.equal((await call("https://proof.test/api/session", { origin: "https://proof.test" })).status, 401);
    });
  } finally {
    await mf.dispose();
    await rm(state, { recursive: true, force: true });
    t.diagnostic(JSON.stringify({ runtime: "native workerd 1.20260907.1 / Miniflare 5.20260907.0-alpha / D1 binding", totalWallMs: Math.round(performance.now() - started), requests: metrics.length,
      applicationRequests: metrics.filter((m) => m.operation === "/api/spots/save").length,
      statuses: Object.fromEntries([...new Set(metrics.map((m) => m.status))].sort().map((status) => [status, metrics.filter((m) => m.status === status).length])),
      kdfRequests: metrics.filter((m) => ["/api/auth/sign-up/email", "/api/auth/sign-in/email", "/api/auth/reset-password"].includes(m.operation)), cpu: "NOT MEASURED; wall time is not CPU time" }));
  }
});
