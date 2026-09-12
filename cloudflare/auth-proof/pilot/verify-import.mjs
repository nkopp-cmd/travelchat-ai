// Explicit, offline review tool. Never called by package scripts or normal tests.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

if (process.argv.length !== 3 || process.argv[2] !== "--import-sql") throw new Error("Explicit --import-sql required; only disposable native local D1 is supported");
const root = new URL("../", import.meta.url);
const source = JSON.parse(await readFile(new URL("catalog.json", import.meta.url), "utf8"));
const research = JSON.parse(await readFile(new URL("research.json", import.meta.url), "utf8"));
const expectedIds = {
  "Seodaemun Independence Park": "0041a575-c6fd-4a7e-b9c3-56cc50e201d6",
  "Gyeongbokgung Palace": "cbd403a4-1912-45b8-8ae1-fc13b4c2f1e5",
  "Cheonggyecheon Stream": "f0fcf98e-76d7-4673-b8c3-6baf519a1551",
};
assert.equal(source.spots.length, 3);
assert.equal(new Set(source.spots.map(spot => spot.id)).size, 3);
assert.equal(source.spots.filter(spot => spot.legacyMapping.status === "confirmed").length, 2);
assert.equal(source.spots.filter(spot => spot.legacyMapping.status === "pending").length, 1);
const imageFiles = source.spots.flatMap(spot => spot.photos.map(() => `${spot.id}.jpg`)).sort();
assert.deepEqual((await readdir(new URL("images/", import.meta.url))).sort(), imageFiles);

const state = await mkdtemp(new URL(".native-d1-", import.meta.url));
let mf;
let outbound = 0;
try {
  // Drop inherited credentials and transport overrides before loading host dependencies.
  const path = process.env.PATH;
  for (const key of Object.keys(process.env)) delete process.env[key];
  process.env.PATH = path ?? "/usr/bin:/bin";
  for (const key of ["HOME", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]) {
    process.env[key] = join(state, key.toLowerCase());
    await mkdir(process.env[key]);
  }
  const { Miniflare, Log, LogLevel } = await import("miniflare");
  const nativeState = join(state, "native");
  const options = {
    workers: [{ config: {
      name: "pilot-import-fixture", type: "worker", compatibilityDate: "2026-09-08",
      manifest: { mainModule: "fixture.mjs", modulesRoot: new URL("./", import.meta.url).pathname,
        modules: { "fixture.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("No HTTP fixture routes", {status: 404}); } };' } } },
      env: { DB: { type: "d1", id: "pilot-import-fixture", dev: { remote: false } } },
    }, dev: { outboundService: { type: "fetcher", handler: () => {
      outbound++;
      return new Response("Outbound network disabled", { status: 502 });
    } } } }],
    resourcePersistencePath: nativeState, resourceTmpPath: process.env.TMPDIR,
    telemetry: { enabled: false }, cf: false, logRequests: false, unsafeLocalExplorer: false, log: new Log(LogLevel.ERROR),
  };
  const migrations = (await readdir(new URL("migrations/", root))).filter(file => /^\d+.*\.sql$/.test(file)).sort();
  assert.ok(migrations.includes("0004_pilot_catalog.sql"));
  const migrate = async db => {
    for (const file of migrations) await db.exec(await readFile(new URL(`migrations/${file}`, root), "utf8"));
  };
  mf = new Miniflare(options);
  const db = await mf.getD1Database("DB");
  await migrate(db);
  const count = async () => (await db.prepare("SELECT count(*) AS n FROM spots").first()).n;
  assert.equal(await count(), 0, "DDL does not seed places");
  const sql = await readFile(new URL("import.sql", import.meta.url), "utf8");
  // The curated seed is one multi-row statement; D1 does not support SQL BEGIN/ROLLBACK here.
  await db.prepare(sql).run();
  assert.equal(await count(), 3);
  assert.equal((await db.prepare("SELECT count(DISTINCT id) AS n FROM spots").first()).n, 3);
  await assert.rejects(db.prepare(sql).run(), /UNIQUE|constraint/i, "A second import must not overwrite existing IDs");
  assert.equal(await count(), 3);
  const hashes = new Set();
  for (const spot of source.spots) {
    assert.equal(spot.id, expectedIds[spot.name.en]);
    const row = await db.prepare("SELECT * FROM spots WHERE id = ?").bind(spot.id).first();
    for (const field of ["name", "description", "photos"]) assert.deepEqual(JSON.parse(row[field]), spot[field]);
    for (const field of ["category", "city", "address", "latitude", "longitude", "localley_score"]) assert.equal(row[field], spot[field]);
    assert.deepEqual(JSON.parse(row.photo_credits), spot.photoCredits);
    assert.deepEqual(JSON.parse(row.source_urls), spot.sourceUrls);
    assert.equal(row.visible, 1);
    assert.equal(spot.hours, null);
    assert.equal(spot.cost, null);
    if (spot.name.en === "Cheonggyecheon Stream") {
      assert.equal(spot.legacyMapping.status, "pending");
      assert.equal(spot.legacyMapping.legacyId, null);
      assert.equal(spot.legacyMapping.candidateId, "11107241-dfb3-4cfc-a0c5-d243630f07b8");
      assert.equal(await db.prepare("SELECT id FROM spots WHERE id = ?").bind(spot.legacyMapping.candidateId).first(), null);
    } else {
      assert.equal(spot.legacyMapping.status, "confirmed");
      assert.equal(spot.legacyMapping.legacyId, spot.id);
      assert.equal(spot.legacyMapping.existingName, spot.name.en);
    }
    assert.ok(spot.latitude > 37.4 && spot.latitude < 37.8 && spot.longitude > 126.7 && spot.longitude < 127.2);
    for (const url of spot.photos) {
      assert.equal(url, `/pilot/${spot.id}.jpg`);
      const bytes = await readFile(new URL(`images/${spot.id}.jpg`, import.meta.url));
      assert.ok(bytes.length < 10000000 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255);
      assert.equal(spot.photoCredits.filter(c => c.url === url).length, 1);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const evidence = research.downloads.find(item => item.included && item.outputSha256 === hash);
      assert.ok(evidence, "Image bytes must retain their reviewed hash");
      assert.equal(bytes.length, evidence.outputBytes);
      assert.ok(!hashes.has(hash));
      hashes.add(hash);
      console.log(`${spot.id}: ${bytes.length} bytes; SHA-256 ${hash}`);
    }
  }
  assert.equal(hashes.size, 2);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM spots WHERE localley_score IS NULL").first()).n, 3);
  for (const [field, value] of [["latitude", 91], ["longitude", -181]]) {
    await assert.rejects(db.prepare(`UPDATE spots SET ${field} = ?`).bind(value).run(), /CHECK|constraint/i);
  }
  await mf.dispose();
  mf = undefined;
  await rm(nativeState, { recursive: true, force: true });
  await assert.rejects(stat(nativeState), { code: "ENOENT" });
  // Recreate at the same path to prove teardown removed the first database, not a transaction rollback.
  mf = new Miniflare(options);
  const fresh = await mf.getD1Database("DB");
  assert.equal(await fresh.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'spots'").first(), null);
  await migrate(fresh);
  assert.equal((await fresh.prepare("SELECT count(*) AS n FROM spots").first()).n, 0);
  assert.equal(outbound, 0);
  console.log(`Native workerd/D1: migrations=${migrations.join(",")}; before=0, imported=3, fresh after teardown=0; no SQL rollback claimed.`);
  console.log("Canonical IDs=2; pending pilot ID=1; unique IDs=3; photos=2 distinct with unchanged hashes; missing=1; scores=NULL; outbound requests=0.");
} finally {
  try { await mf?.dispose(); }
  finally { await rm(state, { recursive: true, force: true }); }
}
await assert.rejects(stat(state), { code: "ENOENT" });
console.log("Both disposable native D1 instances and their local state were removed.");
