import "./host-environment.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel } from "miniflare";
import { createAuthClient } from "better-auth/client";

test("runtime configuration has no local bypass for hosted preview", async () => {
  const built = await build({ entryPoints: ["src/runtime.ts"], bundle: true, write: false, format: "esm", platform: "node", target: "es2022" });
  const { validRuntime, trustedIP } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
  const request = new Request("https://preview.localley.io/api/health");
  const env = { APP_MODE: "preview", LOCAL_PROOF: "true", AUTH_BASE_URL: "https://preview.localley.io",
    BETTER_AUTH_SECRET: "x".repeat(48), ACCESS_TEAM_DOMAIN: "https://fixture.cloudflareaccess.com", ACCESS_AUD: "a".repeat(64),
    PREVIEW_ALLOWED_EMAILS: "alice@example.test", NATIVE_EMAIL: { send() { throw new Error("Must never send"); } },
    DB: { prepare() { return { async first() { return { purpose: "localley-preview" }; } }; } },
  };
  assert.equal(await validRuntime(request, env), true);
  for (const patch of [{ APP_MODE: "local" }, { APP_MODE: "other" }, { AUTH_BASE_URL: "https://localhost" },
    { AUTH_BASE_URL: "https://preview.localley.io/" }, { AUTH_BASE_URL: "https://preview.invalid" },
    { BETTER_AUTH_SECRET: "short" }, { ACCESS_TEAM_DOMAIN: "http://fixture.cloudflareaccess.com" },
    { ACCESS_TEAM_DOMAIN: "https://attacker.test" }, { ACCESS_AUD: "" }, { PREVIEW_ALLOWED_EMAILS: "" }, { NATIVE_EMAIL: undefined }]) {
    assert.equal(await validRuntime(request, { ...env, ...patch }), false);
  }
  assert.equal(trustedIP(new Request(request, { headers: { "cf-connecting-ip": "2001:db8::1", "x-local-proof-ip": "spoof" } }), env), "2001:db8::1");
  assert.equal(trustedIP(new Request(request, { headers: { "x-local-proof-ip": "127.0.0.1" } }), env), null);
  assert.equal(trustedIP(request, { ...env, APP_MODE: "local" }), "127.0.0.1");
  assert.equal(await validRuntime(new Request("https://localhost/api/app-config"), { ...env, APP_MODE: "local", AUTH_BASE_URL: "https://localhost", CLAIM_SECRET: "x".repeat(48), DB: undefined, NATIVE_EMAIL: undefined }), true);
});

test("mail URL validation and escaped HTML use only mocked bindings", async t => {
  const built = await build({ entryPoints: ["src/preview-mail.ts"], bundle: true, write: false, format: "esm", platform: "node", target: "es2022" });
  const { sendPreviewMail } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
  const base = "https://preview.localley.io";
  const verify = `${base}/api/auth/verify-email?token=fixture`;
  const reset = `${base}/api/auth/reset-password/fixture`;
  const identity = { kind: "human", email: "alice@example.test" };
  const messages = [], statements = [];
  let receipt = { messageId: "fixture-receipt" };
  const env = { PREVIEW_ALLOWED_EMAILS: identity.email,
    DB: { prepare(sql) { return { bind(...values) { statements.push({ sql, values }); return { async run() { return { meta: { changes: 1 } }; } }; } }; } },
    NATIVE_EMAIL: { async send(message) { messages.push(message); return receipt; } },
  };
  const send = (purpose, url) => sendPreviewMail(env, identity, purpose, "fixture-user", identity.email, url);
  await t.test("unsafe origins, purpose paths, tokens and callbacks fail before reservation", async () => {
    for (const [purpose, url] of [
      ["verify", verify.replace("https:", "http:")], ["verify", verify.replace("preview.localley.io", "other.test")],
      ["verify", verify.replace("https://", "https://user:password@")], ["verify", verify + "#fragment"], ["verify", verify + "#"],
      ["verify", `${base}/api/auth/verify-email`], ["verify", `${base}/api/auth/verify-email?token=`],
      ["verify", `${base}/api/auth/verify-email?token=%20`], ["verify", verify + "&token=duplicate"],
      ["verify", verify.replace("verify-email", "sign-in/email")], ["verify", reset + "?callbackURL=/"],
      ["reset", verify], ["reset", `${base}/api/auth/reset-password?token=fixture&callbackURL=/`],
      ["reset", `${base}/api/auth/reset-password/?callbackURL=/`], ["reset", reset + "/extra?callbackURL=/"],
      ["reset", reset], ["reset", reset + "?callbackURL=/&token=other"],
      ["verify", verify + "&callbackURL=/&callbackURL=/other"], ["verify", verify + "&extra=unexpected"],
      ["verify", verify + "&callbackURL=" + encodeURIComponent("https://other.test/")],
      ["verify", verify + "&callbackURL=" + encodeURIComponent("//other.test/")],
      ["verify", verify + "&callbackURL=" + encodeURIComponent("javascript:alert(1)")],
      ["verify", verify + "&callbackURL=" + encodeURIComponent("https://user:pass@preview.localley.io/")],
      ["verify", verify + "&callbackURL=" + encodeURIComponent("/\\other.test/")],
      ["verify", verify + "&callbackURL=" + encodeURIComponent("/\n/other.test/")],
      ["verify", verify + "&callbackURL=" + encodeURIComponent("/reset#fragment")],
      ["verify", verify + "x".repeat(8192)], ["other", verify],
    ]) await assert.rejects(send(purpose, url));
    assert.equal(statements.length, 0);
    assert.equal(messages.length, 0);
  });
  await t.test("real callback shapes retain text and escape HTML attribute characters", async () => {
    const special = `${verify}'\"<>&callbackURL=${encodeURIComponent('/reset?first=one&second=two')}`;
    for (const [purpose, url] of [["verify", special], ["verify", verify], ["reset", reset + "?callbackURL="],
      ["reset", reset + "?callbackURL=" + encodeURIComponent(`${base}/reset`)], ["reset", reset + "?callbackURL=/reset"]]) {
      await send(purpose, url);
      const message = messages.at(-1);
      assert.ok(message.text.includes(url));
      const escaped = url.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
      assert.ok(message.html.includes(`href="${escaped}"`));
      assert.ok(message.html.includes("Localley restricted preview"));
      assert.ok(!message.html.includes("<script"));
    }
    assert.ok(messages[0].html.includes("&#39;&quot;&lt;&gt;&amp;callbackURL="));
    assert.ok(!JSON.stringify(statements).includes("https:"), "Audit statements never bind callback URLs");
  });
  await t.test("invalid message receipts hold unknown state and fail closed", async () => {
    for (receipt of [undefined, {}, { messageId: 17 }, { messageId: " " }, { messageId: "x".repeat(513) }, { messageId: "unsafe\nreceipt" }]) {
      const start = statements.length;
      await assert.rejects(send("verify", verify));
      const updates = statements.slice(start).filter(statement => statement.sql.startsWith("UPDATE"));
      assert.ok(updates.at(-1).sql.includes("state = 'unknown'"));
      assert.ok(!updates.some(statement => statement.sql.includes("state = 'accepted'")));
    }
  });
});

test("restricted preview: real RS256, native D1, mocked mail only", { timeout: 180000 }, async t => {
  const state = await mkdtemp(resolve(".local/preview-"));
  const base = "https://preview.localley.io";
  const issuer = "https://fixture.cloudflareaccess.com";
  const aud = "a".repeat(64);
  const nonce = randomBytes(32).toString("hex");
  const secret = randomBytes(48).toString("hex");
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "fixture", alg: "RS256", use: "sig" };
  const sign = (claims = {}, options = {}) => new SignJWT({ email: "alice@example.test", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" }).setIssuer(options.issuer ?? issuer)
    .setAudience(options.aud ?? aud).setIssuedAt().setExpirationTime(options.exp ?? "5m").sign(options.key ?? privateKey);
  const alice = await sign();
  const bob = await sign({ email: "bob@example.test" });
  const service = await sign({ email: undefined, common_name: "fixture-client.access" });
  const mail = await build({ entryPoints: ["src/preview-mail.ts"], bundle: true, write: false, format: "esm", platform: "neutral", external: ["node:*"], target: "es2022" });
  let outbound = 0;
  let logs = 0;
  const mf = new Miniflare({ workers: [{ config: {
    name: "preview-fixture", type: "worker", compatibilityDate: "2026-09-08", compatibilityFlags: ["nodejs_compat"],
    manifest: { mainModule: "preview-worker.mjs", modulesRoot: resolve("dist"), modules: {
      "worker.mjs": { type: "esm", contents: await readFile("dist/worker.mjs", "utf8") },
      "mail.mjs": { type: "esm", contents: mail.outputFiles[0].text },
      "preview-worker.mjs": { type: "esm", contents: await readFile("test/preview-worker.mjs", "utf8") },
    } },
    env: {
      ...Object.fromEntries(Object.entries({ APP_MODE: "preview", LOCAL_PROOF: "true", AUTH_BASE_URL: base,
        BETTER_AUTH_SECRET: secret, ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: aud,
        ACCESS_SERVICE_CLIENT_CN: "fixture-client.access", PREVIEW_ALLOWED_EMAILS: "alice@example.test,bob@example.test", FIXTURE_NONCE: nonce,
      }).map(([key, value]) => [key, { type: "json", value }])),
      DB: { type: "d1", id: "preview-fixture", dev: { remote: false } },
      ASSETS: { type: "fetcher", handler: () => new Response("fixture asset") },
    },
  }, dev: { outboundService: { type: "fetcher", handler: request => {
    outbound++;
    assert.equal(request.url, `${issuer}/cdn-cgi/access/certs`);
    return Response.json({ keys: [jwk] });
  } } } }], resourcePersistencePath: state, resourceTmpPath: state,
    telemetry: { enabled: false }, cf: false, logRequests: false, unsafeLocalExplorer: false,
    handleStructuredLogs: () => { logs++; }, log: new Log(LogLevel.ERROR),
  });
  const call = (path, { token = alice, body, raw, method = body === undefined && raw === undefined ? "GET" : "POST", headers = {} } = {}) => mf.dispatchFetch(base + path, {
    method, redirect: "manual", headers: { Origin: base, "cf-connecting-ip": "192.0.2.1",
      ...(token ? { "cf-access-jwt-assertion": token } : {}), ...(body === undefined && raw === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(body === undefined && raw === undefined ? {} : { body: raw ?? JSON.stringify(body) }),
  });
  const stats = async () => (await call("/__fixture/stats", { headers: { "x-fixture-nonce": nonce } })).json();
  try {
    const db = await mf.getD1Database("DB");
    for (const file of ["0001_local.sql", "0002_application.sql", "0003_preview_mail.sql", "0004_pilot_catalog.sql", "0005_itineraries.sql", "0007_email_preferences.sql"]) await db.exec(await readFile(`migrations/${file}`, "utf8"));
    await t.test("purpose marker fails closed before JWKS or mail", async () => {
      assert.equal((await call("/api/app-config")).status, 403);
      assert.equal(outbound, 0);
      await db.prepare("UPDATE runtime_purpose SET purpose = ? WHERE id = 1").bind("localley-preview").run();
    });
    await t.test("JWT signature, issuer, audience, expiry and human allowlist", async () => {
      const other = await generateKeyPair("RS256");
      for (const token of [null, "fake", await sign({}, { key: other.privateKey }), await sign({}, { issuer: "https://other.cloudflareaccess.com" }),
        await sign({}, { aud: "b".repeat(64) }), await sign({}, { exp: Math.floor(Date.now() / 1000) - 1 }), await sign({ email: "outsider@example.test" })]) {
        assert.equal((await call("/api/app-config", { token, headers: { "cf-access-authenticated-user-email": "alice@example.test" } })).status, 403);
      }
      assert.deepEqual(await (await call("/api/app-config")).json(), { mode: "preview", catalogSource: "seoul-pilot", registration: "restricted-preview", emailDelivery: "cloudflare" });
      assert.equal((await call("/", { token: null })).status, 403);
      assert.equal((await call("/api/spots", { token: null })).status, 403);
      assert.equal((await call("/__fixture/stats")).status, 404);
    });
    await t.test("service JWT is read-only; private APIs still need a session", async () => {
      for (const path of ["/api/app-config", "/api/health", "/api/spots", "/"]) assert.equal((await call(path, { token: service })).status, 200, path);
      assert.equal((await call("/api/health", { token: service, method: "HEAD" })).status, 200);
      assert.equal((await call("/api/spots", { token: service, method: "HEAD" })).status, 200);
      assert.equal((await call("/api/session", { token: service })).status, 401);
      assert.equal((await call("/api/user/email-preferences", { token: service })).status, 401);
      assert.equal((await call("/api/user/email-preferences", { token: service, method: "PUT", body: { preferences: { marketing: true } } })).status, 403);
      assert.equal((await call("/api/auth/sign-up/email", { token: service, body: {} })).status, 403);
      assert.equal((await call("/api/health", { token: await sign({ common_name: "other" }) })).status, 403);
      assert.equal((await call("/api/account/claim", { body: {} })).status, 404);
      assert.equal((await stats()).length, 0);
    });
    const password = randomBytes(24).toString("hex");
    await t.test("signup rejects mismatched email before account creation; IP is trusted", async () => {
      for (const email of ["outsider@example.test", "bob@example.test"]) assert.equal((await call("/api/auth/sign-up/email", { body: { email, name: "Fixture", password } })).status, 403);
      assert.equal((await db.prepare("SELECT count(*) n FROM user").first()).n, 0);
      assert.equal((await call("/api/auth/sign-up/email", { body: {}, headers: { "cf-connecting-ip": "garbage", "x-local-proof-ip": "127.0.0.1" } })).status, 403);
      for (const path of ["change-email", "delete-user", "update-user", "sign-in/social"]) assert.equal((await call(`/api/auth/${path}`, { body: {} })).status, 403);
      assert.equal((await call("/api/auth/sign-up/email", { body: { email: "alice@example.test", name: "Fixture", password } })).status, 200);
      const sent = await stats();
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0].from, { email: "auth@localley.io", name: "Localley" });
      assert.equal(sent[0].to, "alice@example.test");
      assert.equal((await db.prepare("SELECT count(*) n FROM local_outbox").first()).n, 0);
      assert.equal((await db.prepare("SELECT state FROM preview_mail_jobs").first()).state, "accepted");
    });
    await t.test("verification, reset, session ownership and atomic new profile", async () => {
      const url = (await stats())[0].text.split("\n").find(line => line.startsWith("https://"));
      const path = url.slice(base.length);
      assert.equal((await call(path, { token: bob })).status, 403);
      assert.ok([200, 302].includes((await call(path)).status));
      const login = await call("/api/auth/sign-in/email", { body: { email: "alice@example.test", password } });
      assert.equal(login.status, 200);
      const cookie = login.headers.getSetCookie().find(value => value.startsWith("__Secure-better-auth.session_token=")).split(";")[0];
      assert.equal((await call("/api/auth/get-session", { token: bob, headers: { cookie } })).status, 403);
      assert.equal((await call("/api/session", { token: bob, headers: { cookie } })).status, 403);
      const unlinked = await (await call("/api/session", { headers: { cookie } })).json();
      assert.equal((await call("/api/account/new", { body: {}, headers: { cookie } })).status, 428);
      const provisions = await Promise.all(Array.from({ length: 3 }, () => call("/api/account/new", { body: {}, headers: { cookie, "x-localley-session-id": unlinked.sessionId } })));
      assert.deepEqual(provisions.map(r => r.status).sort(), [200, 200, 201]);
      assert.equal((await db.prepare("SELECT count(*) n FROM profiles").first()).n, 1);
      const session = await (await call("/api/session", { headers: { cookie } })).json();
      const preferencesHeaders = { cookie, "x-localley-session-id": session.sessionId };
      assert.equal((await call("/api/user/email-preferences", { token: bob, headers: preferencesHeaders })).status, 403);
      assert.equal((await call("/api/user/email-preferences", { method: "PUT", token: service, headers: preferencesHeaders, body: { preferences: { marketing: true } } })).status, 403);
      assert.equal((await call("/api/user/email-preferences", { method: "PUT", headers: preferencesHeaders, body: { preferences: { marketing: false } } })).status, 200);
      assert.equal((await call("/api/auth/request-password-reset", { body: { email: "alice@example.test", redirectTo: `${base}/` } })).status, 200);
      const resetURL = (await stats())[1].text.split("\n").find(line => line.startsWith("https://"));
      assert.equal((await call(resetURL.slice(base.length), { token: bob })).status, 403);
      const reset = await call(resetURL.slice(base.length));
      assert.equal(reset.status, 302);
      const token = new URL(reset.headers.get("location")).searchParams.get("token");
      assert.equal((await call("/api/auth/reset-password", { token: bob, body: { token, newPassword: password + "new" } })).status, 403);
      assert.equal((await call("/api/auth/reset-password", { body: { token, newPassword: password + "new" } })).status, 200);
    });
    await t.test("SDK empty POST sign-out and revoke-sessions preserve auth checks and reject invalid JSON", async () => {
      for (const [action, empty] of [["revokeSessions", true], ["signOut", true], ["revokeSessions", false], ["signOut", false]]) {
        await db.prepare('DELETE FROM "rateLimit"').run();
        const login = await call("/api/auth/sign-in/email", { body: { email: "alice@example.test", password: password + "new" } });
        assert.equal(login.status, 200);
        const cookie = login.headers.getSetCookie().find(value => value.startsWith("__Secure-better-auth.session_token=")).split(";")[0];
        const path = action === "signOut" ? "/api/auth/sign-out" : "/api/auth/revoke-sessions";
        for (const raw of ["{", " "]) assert.equal((await call(path, { raw, headers: { cookie } })).status, 400);
        assert.equal((await call(path, { method: "POST", token: bob, headers: { cookie } })).status, 403);
        assert.equal((await call(path, { method: "POST", headers: { cookie, Origin: "https://other.test" } })).status, 403);
        assert.equal((await call("/api/session", { headers: { cookie } })).status, 200);
        let calls = 0;
        const client = createAuthClient({ baseURL: base, fetchOptions: { customFetchImpl: async (input, init) => {
          calls++;
          assert.equal(new URL(input).pathname, path);
          assert.equal(init.method, "POST");
          if (empty) assert.ok(init.body === null || init.body === undefined || init.body === "", "SDK fetch sends no body");
          else assert.equal(init.body, "{}", "SDK action sends an empty object");
          const headers = new Headers(init.headers);
          headers.set("Origin", base);
          headers.set("Cookie", cookie);
          headers.set("cf-access-jwt-assertion", alice);
          headers.set("cf-connecting-ip", "192.0.2.1");
          const response = await mf.dispatchFetch(input, { ...init, headers, redirect: "manual" });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("Cache-Control"), "no-store");
          assert.match(response.headers.get("Content-Type"), /application\/json/);
          if (action === "signOut") assert.ok(response.headers.getSetCookie().some(value => /session_token=.*Max-Age=0/i.test(value)));
          return response;
        } } });
        const result = empty ? await client.$fetch(path.slice("/api/auth".length), { method: "POST" }) : await client[action]();
        assert.equal(result.error, null);
        assert.equal(calls, 1);
        assert.equal((await call("/api/session", { headers: { cookie } })).status, 401);
      }
    });
    await t.test("callback failure is not signup success; partial row is preview-only", async () => {
      const response = await call("/api/auth/sign-up/email", { token: bob, body: { email: "bob@example.test", name: "Fixture", password }, headers: { "x-fixture-nonce": nonce, "x-fixture-mail": "reject" } });
      assert.equal(response.status, 500);
      assert.equal((await db.prepare("SELECT state FROM preview_mail_jobs ORDER BY rowid DESC LIMIT 1").first()).state, "unknown");
      assert.equal((await db.prepare("SELECT count(*) n FROM profiles").first()).n, 1);
    });
    await t.test("atomic global cap, hash dedupe and timeout hold attempts", async () => {
      const send = (url, mode) => call("/__fixture/mail", { body: { url }, headers: { "x-fixture-nonce": nonce, ...(mode ? { "x-fixture-mail": mode } : {}) } });
      const url = `${base}/api/auth/verify-email?token=fixture-dedupe`;
      const before = (await stats()).length;
      await Promise.all(Array.from({ length: 8 }, () => send(url)));
      assert.equal((await stats()).length, before + 1);
      assert.equal((await send(url)).status, 200);
      assert.equal((await send(`${base}/api/auth/verify-email?token=fixture-timeout`, "timeout")).status, 500);
      assert.equal((await db.prepare("SELECT state FROM preview_mail_jobs ORDER BY rowid DESC LIMIT 1").first()).state, "unknown");
      assert.equal((await send(`${base}/api/auth/verify-email?token=over-cap`)).status, 500);
      assert.equal((await db.prepare("SELECT count(*) n FROM preview_mail_jobs").first()).n, 5);
      const audit = JSON.stringify((await db.prepare("SELECT * FROM preview_mail_jobs").all()).results);
      assert.ok(!audit.includes("https:") && !audit.includes("fixture-timeout") && !audit.includes("fixture-dedupe"));
      await new Promise(resolve => setTimeout(resolve, 700));
      assert.equal((await db.prepare("SELECT state FROM preview_mail_jobs ORDER BY rowid DESC LIMIT 1").first()).state, "unknown");
    });
    await t.test("D1 faults fail closed; concurrent distinct callbacks share the next daily budget", async () => {
      // Move only fixture audit dates to simulate historical reservations, never reset their states.
      await db.prepare("UPDATE preview_mail_jobs SET day = date('now', '-1 day')").run();
      const send = (label, mode) => call("/__fixture/mail", { body: { url: `${base}/api/auth/verify-email?token=${label}` },
        headers: { "x-fixture-nonce": nonce, ...(mode ? { "x-fixture-mail": mode } : {}) } });
      const before = (await stats()).length;
      await db.exec("CREATE TRIGGER fixture_reserve BEFORE INSERT ON preview_mail_jobs BEGIN SELECT RAISE(ABORT, 'fixture'); END;");
      assert.equal((await send("reserve-fault")).status, 500);
      assert.equal((await stats()).length, before);
      await db.exec("DROP TRIGGER fixture_reserve;");
      await db.exec("CREATE TRIGGER fixture_sending BEFORE UPDATE OF state ON preview_mail_jobs WHEN NEW.state = 'sending' BEGIN SELECT RAISE(ABORT, 'fixture'); END;");
      assert.equal((await send("sending-fault")).status, 500);
      assert.equal((await stats()).length, before);
      await db.exec("DROP TRIGGER fixture_sending;");
      assert.equal((await send("sending-fault")).status, 500);
      await db.exec("CREATE TRIGGER fixture_accept BEFORE UPDATE OF state ON preview_mail_jobs WHEN NEW.state = 'accepted' BEGIN SELECT RAISE(ABORT, 'fixture'); END;");
      assert.equal((await send("accept-fault")).status, 500);
      await db.exec("DROP TRIGGER fixture_accept;");
      assert.equal((await send("accept-fault")).status, 500);
      assert.equal((await send("empty-receipt", "no-receipt")).status, 500);
      const responses = await Promise.all(Array.from({ length: 9 }, (_, index) => send(`distinct-${index}`)));
      assert.equal(responses.filter(response => response.status === 200).length, 2);
      assert.equal((await db.prepare("SELECT count(*) n FROM preview_mail_jobs WHERE day = date('now')").first()).n, 5);
      assert.equal((await stats()).length, before + 4);
    });
    assert.equal(logs, 0, "No private exceptions or token URLs in Worker logs");
  } finally { await mf.dispose(); await rm(state, { recursive: true, force: true }); }
});
