// Supabase exit step 5 / gate 1: full current-data import into D1 and exact compare, through the same D1 facade the app
// uses (lib/app-data/d1-postgrest.ts), so stored formats and derived columns (spots.visible, listing places) match the
// write path. Source reads are read-only (PostgREST with the service key; Management API for geography tables).
//   node scripts/d1-migration/exit-full-import.mjs --out FILE.sql --report FILE.json
//   node scripts/d1-migration/exit-full-import.mjs --out FILE.sql --report FILE.json --verify-remote DB [--env production | --config FILE]
// --out: INSERT statements for every loaded D1 table (apply to a FRESH database with `wrangler d1 execute --file`).
// --verify-remote: read every table back from that D1 and require equality with the local load. Nothing is applied here.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadFacade } from "./facade-bundle.mjs";
import { mergedCatalog } from "./facade-specs.mjs";
import { literal, upsertSql } from "./exit-tables-import.mjs";
import { sourceSelect } from "./pg-to-d1-schema.mjs";

/** Tables with geography columns the facade refuses: loaded from the catalog-typed source select instead. */
export const GEO_TABLES = ["geo_destinations", "geo_local_areas"];
const SKIP_DUMP = new Set(["d1_migrations", "_cf_KV", "_cf_METADATA", "sqlite_sequence"]);

export function migratedDatabase(D1Sqlite, dir = "migrations/app-preview") {
  const db = new D1Sqlite();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(`${dir}/${file}`, "utf8"));
  // Parents and children arrive in any order; the foreign-key check runs after the load.
  db.sqlite.exec("PRAGMA foreign_keys = OFF");
  return db;
}

async function rest(table, from, to, order) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=*&order=${order}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${to}` } });
  if (!response.ok) throw new Error(`Source read ${table}: ${response.status}`);
  return response.json();
}

async function sourceRows(table, primaryKey) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(table, from, from + 999, primaryKey.join(","));
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function managementQuery(query) {
  const response = await fetch("https://api.supabase.com/v1/projects/llehrhqeolfprutcaopi/database/query", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, read_only: true }),
  });
  if (!response.ok) throw new Error(`Source query failed: ${response.status}`);
  return response.json();
}

/** Load every facade table into `db` and compare each one with the source. Returns per-table results. */
export async function loadAndCompare(facade, db, { read = sourceRows, geoRows = null } = {}) {
  // A copy, not an app write: trigger equivalents off; spots' derived columns (afterWrite) still apply.
  const service = facade.d1Client(db, { role: "service" }, { triggers: false });
  const loaded = [];
  const results = {};
  const catalog = mergedCatalog();
  for (const [table, spec] of Object.entries(facade.TABLES)) {
    if (GEO_TABLES.includes(table)) {
      const rows = geoRows ? geoRows[table] : await managementQuery(sourceSelect(catalog, table));
      db.sqlite.exec(rows.map((row) => upsertSql(catalog, table, row)).join("\n"));
      results[table] = { source: rows.length, loaded: rows.length, equal: true, via: "catalog select" };
      continue;
    }
    const rows = await read(table, spec.primaryKey);
    const errors = [];
    for (const row of rows) {
      const { error } = await service.from(table).insert(row);
      if (error) errors.push(error.message);
    }
    if (table === "spots") {
      // Detail and photo routes read the exact source row (legacy_spot_source.payload) until payload retires.
      const insert = db.sqlite.prepare("INSERT INTO legacy_spot_source (spotId, payload, publicIssue) VALUES (?, ?, NULL)");
      for (const row of rows) insert.run(row.id, JSON.stringify(row));
    }
    results[table] = { source: rows.length, loaded: rows.length - errors.length, errors: errors.slice(0, 3) };
    loaded.push([table, spec, rows]);
  }
  // Compare only after every table is loaded, so a write to one table that changes another is caught.
  for (const [table, spec, rows] of loaded) {
    let query = service.from(table).select("*");
    for (const key of spec.primaryKey) query = query.order(key);
    const { data: back, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    results[table].equal = JSON.stringify(back) === JSON.stringify(rows);
  }
  results.foreignKeyViolations = db.sqlite.prepare("PRAGMA foreign_key_check").all().length;
  return results;
}

/** Rows a fresh migrated database already holds (seed rows from migrations): table -> set of row JSON. */
export function baselineRows(db) {
  const names = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    .filter((name) => !SKIP_DUMP.has(name) && !name.startsWith("sqlite_"));
  return new Map(names.map((t) => [t, new Set(db.sqlite.prepare(`SELECT * FROM "${t}"`).all().map((r) => JSON.stringify(r)))]));
}

/** The loaded rows as INSERT statements (one per row, each under D1's 100 KB limit), minus the migration seed rows. */
export function dumpSql(db, baseline = new Map()) {
  const names = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name)
    .filter((name) => !SKIP_DUMP.has(name) && !name.startsWith("sqlite_"));
  // Parents first: D1's file import checks foreign keys per statement.
  const parents = new Map(names.map((t) => [t, db.sqlite.prepare(`PRAGMA foreign_key_list("${t}")`).all().map((fk) => fk.table).filter((p) => p !== t)]));
  const tables = [], seen = new Set();
  const visit = (t, path = new Set()) => {
    if (seen.has(t) || !parents.has(t)) return;
    if (path.has(t)) throw new Error(`Foreign-key cycle at ${t}`);
    path.add(t);
    for (const p of parents.get(t)) visit(p, path);
    seen.add(t); tables.push(t);
  };
  for (const t of names) visit(t);
  const statements = [];
  for (const table of tables) {
    const rows = db.sqlite.prepare(`SELECT * FROM "${table}"`).all();
    for (const row of rows) {
      if (baseline.get(table)?.has(JSON.stringify(row))) continue;
      const cols = Object.keys(row);
      statements.push(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((c) => literal(row[c] === undefined ? null : row[c])).join(", ")});`);
    }
  }
  const longest = Math.max(0, ...statements.map((s) => Buffer.byteLength(s)));
  if (longest > 100_000) throw new Error(`Statement too large: ${longest}`);
  return { sql: `${statements.join("\n")}\n`, tables, rows: statements.length };
}

/** Order-independent digest of one table's rows (sorted by their JSON text). */
export function tableDigest(rows) {
  return createHash("sha256").update(rows.map((r) => JSON.stringify(r)).sort().join("\n")).digest("hex");
}

function remoteRows(db, { env, config }, table) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", db, "--remote", "--json", ...(env ? ["--env", env] : []), ...(config ? ["--config", config] : []),
    "--command", `SELECT * FROM "${table}"`],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out)[0].results;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), all[index + 1]]], []));
  if (args["verify-report"]) return verifyRemote(args);
  if (!args.out || !args.report) throw new Error("Usage: --out FILE.sql --report FILE.json | --verify-report FILE.json --verify-remote DB [--env E | --config F]");
  const facade = await loadFacade();
  const db = migratedDatabase(facade.D1Sqlite);
  const baseline = baselineRows(db);
  const results = await loadAndCompare(facade, db);
  const dump = dumpSql(db, baseline);
  writeFileSync(args.out, dump.sql, { mode: 0o600, flag: "wx" });
  const digests = Object.fromEntries(dump.tables.map((t) => [t, tableDigest(db.sqlite.prepare(`SELECT * FROM "${t}"`).all())]));
  const report = { at: new Date().toISOString(), results, rows: dump.rows, digests, sqlSha256: createHash("sha256").update(dump.sql).digest("hex") };
  writeFileSync(args.report, JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
  const tables = Object.entries(results).filter(([k]) => k !== "foreignKeyViolations");
  const mismatches = tables.filter(([, r]) => !r.equal || r.loaded !== r.source).map(([t]) => t);
  console.log(JSON.stringify({ tables: tables.length, sourceRows: tables.reduce((n, [, r]) => n + r.source, 0), dumpRows: dump.rows,
    mismatches, foreignKeyViolations: results.foreignKeyViolations }));
  if (mismatches.length || results.foreignKeyViolations) process.exitCode = 1;
}

/** After the SQL file of a run is applied: every remote table must equal that run's local digest. */
function verifyRemote(args) {
  const report = JSON.parse(readFileSync(args["verify-report"], "utf8"));
  const mismatches = Object.entries(report.digests)
    .filter(([table, digest]) => tableDigest(remoteRows(args["verify-remote"], { env: args.env, config: args.config }, table)) !== digest)
    .map(([table]) => table);
  console.log(JSON.stringify({ tables: Object.keys(report.digests).length, remoteMismatches: mismatches }));
  if (mismatches.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`Full import failed: ${error.message}. No remote data was changed.`); process.exitCode = 1; });
}
