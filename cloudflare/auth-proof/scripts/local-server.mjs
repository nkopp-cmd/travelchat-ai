import { randomBytes } from "node:crypto";
import { createServer } from "node:https";
import { chmod, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

// This module is a trusted Node fixture host. It exposes no HTTP test controls.
export async function startLocalServer({ assetsDirectory } = {}) {
  if (process.env.AUTH_PROOF_BROWSER_CHILD !== "1") throw new Error("Use the isolated browser-check launcher");
  const root = resolve(".");
  if (!(await stat(join(root, "scripts"))).isDirectory()) throw new Error("Run from the auth-proof package");
  await mkdir(join(root, ".local"), { recursive: true, mode: 0o700 });
  const run = await mkdtemp(join(root, ".local/browser-server-"));
  await chmod(run, 0o700);
  const origin = "https://localhost:8790";
  let mf;
  let server;
  let outboundRequests = 0;
  let nativeApiRequests = 0;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
    try { await mf?.dispose(); }
    finally { await rm(run, { recursive: true, force: true }); }
  };
  try {
    const key = join(run, "localhost.key");
    const cert = join(run, "localhost.crt");
    const tls = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-keyout", key, "-out", cert, "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"],
    { stdio: "ignore", timeout: 15_000 });
    if (tls.status !== 0) throw new Error("Local TLS certificate generation failed");
    await Promise.all([chmod(key, 0o600), chmod(cert, 0o600)]);
    const { Miniflare, Log, LogLevel } = await import("miniflare");
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
    const assets = assetsDirectory ? resolve(assetsDirectory) : join(root, "dist/public");
    for (const file of ["index.html", "assets/app.js", "assets/app.css"]) await stat(join(assets, file));
    mf = new Miniflare({
      workers: [{ config: {
        name: config.name, type: "worker", compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        manifest: { mainModule: "worker.mjs", modulesRoot: join(root, "dist"),
          modules: { "worker.mjs": { type: "esm", contents: await readFile("dist/worker.mjs", "utf8") } } },
        assets: { directory: assets, hasUserWorker: true,
          runWorkerFirst: true, notFoundHandling: "single-page-application" },
        env: {
          ...Object.fromEntries(Object.entries({ APP_MODE: "local", LOCAL_PROOF: "true", AUTH_BASE_URL: origin,
            BETTER_AUTH_SECRET: randomBytes(48).toString("hex"), CLAIM_SECRET: randomBytes(48).toString("hex") })
            .map(([name, value]) => [name, { type: "json", value }])),
          DB: { type: "d1", id: config.d1_databases[0].database_id, dev: { remote: false } },
          ASSETS: { type: "assets" },
        },
      }, dev: { outboundService: { type: "fetcher", handler: () => {
        outboundRequests++;
        return new Response("Outbound network disabled", { status: 502 });
      } } } }],
      resourcePersistencePath: run, resourceTmpPath: run, telemetry: { enabled: false }, cf: false,
      logRequests: false, unsafeLocalExplorer: false, handleStructuredLogs: () => {}, log: new Log(LogLevel.NONE),
    });
    const db = await mf.getD1Database("DB");
    for (const migration of ["0001_local.sql", "0002_application.sql", "0003_preview_mail.sql", "0004_pilot_catalog.sql", "0005_itineraries.sql", "0007_email_preferences.sql", "0008_current_trends.sql", "0009_itinerary_share.sql", "0010_ai_requests.sql"]) await db.exec(await readFile(join("migrations", migration), "utf8"));
    const names = [
      ["Synthetic quiet reading cafe", "\uac00\uc0c1 \uace8\ubaa9 \ucc45\uc77d\ub294 \uce74\ud398", "cafe"],
      ["Synthetic neighborhood walking garden", "\uac00\uc0c1 \uc11c\uc6b8 \uace8\ubaa9\uc5d0\uc11c \ucc9c\ucc9c\ud788 \uac78\uc73c\uba70 \uc26c\uc5b4\uac00\ub294 \uc791\uc740 \uc815\uc6d0", "nature"],
      ["Synthetic paper workshop", "\uac00\uc0c1 \uc885\uc774 \uacf5\ubc29", "culture"],
      ["Synthetic evening kitchen", "\uac00\uc0c1 \uc800\ub141 \uc2dd\ub2f9", "food"],
    ];
    await db.batch(names.map(([en, ko, category], i) => db.prepare("INSERT INTO spots (id, name, description, category, localley_score, photos, visible) VALUES (?, ?, ?, ?, NULL, NULL, 1)")
      .bind(`10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, JSON.stringify(i === 1 ? { ko } : { en, ko }),
        JSON.stringify({ en: "Synthetic local fixture. Not a real place or recommendation.", ko: "\uc2e4\uc81c \uc7a5\uc18c\uac00 \uc544\ub2cc \uac00\uc0c1 \ud14c\uc2a4\ud2b8 \uc790\ub8cc\uc785\ub2c8\ub2e4." }), category)));
    server = createServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
      // Reject absolute-form URLs, foreign Host values, and proxy metadata.
      if (req.headers.host !== "localhost:8790" || !req.url?.startsWith("/") || req.url.startsWith("//")) {
        res.writeHead(403).end(); return;
      }
      const timer = setTimeout(() => req.destroy(), 6000);
      try {
        const headers = new Headers();
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const name = req.rawHeaders[i];
          if (!/^(host|connection|transfer-encoding|content-length|forwarded|x-forwarded-.*)$/i.test(name)) headers.append(name, req.rawHeaders[i + 1]);
        }
        let size = 0;
        const bodyLimit = req.method === "PATCH" && /^\/api\/itineraries\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/update$/i.test(new URL(origin + req.url).pathname) ? 512 * 1024 : 16 * 1024;
        const bounded = new Transform({ transform(chunk, encoding, done) {
          size += chunk.length;
          if (size > bodyLimit && !res.headersSent) res.writeHead(413, { "Cache-Control": "no-store" }).end();
          done(size > bodyLimit ? new Error("Request limit") : null, chunk);
        } });
        const hasBody = !["GET", "HEAD"].includes(req.method);
        req.on("error", () => { if (hasBody) bounded.destroy(new Error("Request interrupted")); });
        // GET bodies are not forwarded; discard them without retaining bytes.
        if (!hasBody) req.resume();
        const requestBody = hasBody ? Readable.toWeb(req.pipe(bounded)) : undefined;
        if (new URL(origin + req.url).pathname.startsWith("/api/")) nativeApiRequests++;
        const response = await mf.dispatchFetch(origin + req.url, {
          method: req.method, headers, body: requestBody, duplex: "half", redirect: "manual",
        });
        clearTimeout(timer);
        res.statusCode = response.status;
        for (const [name, value] of response.headers) {
          if (!/^(set-cookie|transfer-encoding|connection|content-length|content-encoding)$/i.test(name)) res.setHeader(name, value);
        }
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader("Set-Cookie", cookies);
        if (response.body) await pipeline(Readable.fromWeb(response.body), res);
        else res.end();
      } catch {
        if (!res.headersSent) res.writeHead(502, { "Cache-Control": "no-store" });
        res.end();
      } finally { clearTimeout(timer); }
    });
    server.requestTimeout = 10_000;
    server.headersTimeout = 10_000;
    await new Promise((done, reject) => { server.once("error", reject); server.listen(8790, "127.0.0.1", done); });
    return { origin, db, close, get outboundRequests() { return outboundRequests; },
      get nativeApiRequests() { return nativeApiRequests; } };
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.AUTH_PROOF_BROWSER_CHILD !== "1") {
    const result = spawnSync(process.execPath, ["scripts/browser-check.mjs", "--serve"], { stdio: "inherit" });
    process.exitCode = result.status ?? 1;
  } else {
    const server = await startLocalServer();
    console.log(server.origin);
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
  }
}
