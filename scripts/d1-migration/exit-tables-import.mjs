// Supabase exit step 5: idempotent import + compare for the Supabase-only tables (migration 0034).
// Source rows come from the read-only sourceSelect() of each table, already in D1 value shapes.
//   node scripts/d1-migration/exit-tables-import.mjs --out FILE.sql --report FILE.json [--compare-d1 DB --env production]
// --out writes upserts (ON CONFLICT DO UPDATE, never REPLACE: REPLACE deletes and would cascade into children).
// --compare-d1 reads the same columns from D1 and reports per-table counts, digests, missing/extra/changed keys;
// rows only in D1 get explicit DELETEs (children first) in FILE.sql.prune. Nothing is applied by this tool.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sourceSelect, tableOrder } from "./pg-to-d1-schema.mjs";

export const SCHEMA_FILE = "scripts/d1-migration/fixtures/supabase-exit-schema-20261024.json";

/** D1 column names in source order (geography -> _lat/_lng, geometry -> _geojson), as sourceSelect aliases them. */
export function d1Columns(schema, table) {
  return schema.columns.filter(c => c.t === table).flatMap(c =>
    c.udt === "geography" ? [`${c.col}_lat`, `${c.col}_lng`] : c.udt === "geometry" ? [`${c.col}_geojson`] : [c.col]);
}

export function primaryKey(schema, table) {
  const pk = schema.constraints.find(c => c.t === table && c.k === "p");
  if (!pk) throw new Error(`No primary key on ${table}`);
  return pk.def.match(/^PRIMARY KEY \((.+)\)$/)[1].split(", ");
}

export function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number ${value}`);
    return String(value);
  }
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`Unexpected value type ${typeof value}`);
}

export function upsertSql(schema, table, row) {
  const cols = d1Columns(schema, table), pk = primaryKey(schema, table);
  const rest = cols.filter(c => !pk.includes(c));
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(c => literal(row[c])).join(", ")}) ON CONFLICT (${pk.join(", ")}) ` +
    (rest.length ? `DO UPDATE SET ${rest.map(c => `${c} = excluded.${c}`).join(", ")};` : "DO NOTHING;");
}

const keyOf = (pk, row) => JSON.stringify(pk.map(c => row[c]));
const rowText = (cols, row) => JSON.stringify(cols.map(c => row[c] ?? null));

/** Order-independent table digest: sha256 over rows sorted by primary key, values in column order. */
export function tableDigest(schema, table, rows) {
  const cols = d1Columns(schema, table), pk = primaryKey(schema, table);
  const lines = rows.map(r => [keyOf(pk, r), rowText(cols, r)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return createHash("sha256").update(lines.map(l => l[1]).join("\n")).digest("hex");
}

export function buildImport(schema, sourceRows) {
  const statements = [];
  for (const table of tableOrder(schema)) for (const row of sourceRows[table] ?? []) statements.push(upsertSql(schema, table, row));
  const longest = Math.max(0, ...statements.map(s => Buffer.byteLength(s)));
  // D1 rejects SQL statements above 100 KB.
  if (longest > 100_000) throw new Error(`Statement too large: ${longest}`);
  return statements.join("\n") + "\n";
}

/** Per-table compare. Returns the report and the DELETEs for rows that exist only in D1 (children first). */
export function compare(schema, sourceRows, d1Rows) {
  const tables = {}, prune = [];
  let mismatches = 0;
  for (const table of tableOrder(schema)) {
    const cols = d1Columns(schema, table), pk = primaryKey(schema, table);
    const src = new Map((sourceRows[table] ?? []).map(r => [keyOf(pk, r), r]));
    const dst = new Map((d1Rows[table] ?? []).map(r => [keyOf(pk, r), r]));
    const missing = [...src.keys()].filter(k => !dst.has(k));
    const extra = [...dst.keys()].filter(k => !src.has(k));
    const changed = [...src.keys()].filter(k => dst.has(k) && rowText(cols, src.get(k)) !== rowText(cols, dst.get(k)));
    const sourceDigest = tableDigest(schema, table, [...src.values()]), d1Digest = tableDigest(schema, table, [...dst.values()]);
    const equal = sourceDigest === d1Digest && !missing.length && !extra.length && !changed.length;
    if (!equal) mismatches++;
    tables[table] = { source: src.size, d1: dst.size, sourceDigest, d1Digest, equal, missing: missing.length, extra: extra.length, changed: changed.length };
    for (const k of extra) {
      const values = JSON.parse(k);
      prune.unshift(`DELETE FROM ${table} WHERE ${pk.map((c, i) => `${c} = ${literal(values[i])}`).join(" AND ")};`);
    }
  }
  return { report: { mismatches, tables }, prune: prune.length ? prune.join("\n") + "\n" : "" };
}

export function d1Select(schema, table) {
  return `SELECT ${d1Columns(schema, table).join(", ")} FROM ${table}`;
}

async function managementQuery(query) {
  const response = await fetch("https://api.supabase.com/v1/projects/llehrhqeolfprutcaopi/database/query", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, read_only: true }),
  });
  if (!response.ok) throw new Error(`Source query failed: ${response.status}`);
  return response.json();
}

function wranglerRows(db, env, sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", db, "--remote", "--json", ...(env ? ["--env", env] : []), "--command", sql],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out)[0].results;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), all[index + 1]]], []));
  if (!args.out || !args.report) throw new Error("Usage: --out FILE.sql --report FILE.json [--compare-d1 DB --env production]");
  const schema = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));
  const sourceRows = {};
  for (const table of tableOrder(schema)) sourceRows[table] = await managementQuery(sourceSelect(schema, table));
  writeFileSync(args.out, buildImport(schema, sourceRows), { mode: 0o600, flag: "wx" });
  const counts = Object.fromEntries(Object.entries(sourceRows).map(([t, rows]) => [t, { rows: rows.length, digest: tableDigest(schema, t, rows) }]));
  let result = { at: new Date().toISOString(), counts };
  if (args["compare-d1"]) {
    const d1Rows = {};
    for (const table of tableOrder(schema)) d1Rows[table] = wranglerRows(args["compare-d1"], args.env, d1Select(schema, table));
    const { report, prune } = compare(schema, sourceRows, d1Rows);
    if (prune) writeFileSync(`${args.out}.prune`, prune, { mode: 0o600, flag: "wx" });
    result = { ...result, compare: report };
  }
  writeFileSync(args.report, JSON.stringify(result, null, 2), { mode: 0o600, flag: "wx" });
  const rows = Object.values(counts).reduce((n, c) => n + c.rows, 0);
  console.log(JSON.stringify({ tables: Object.keys(counts).length, rows, mismatches: result.compare?.mismatches ?? null }));
  if (result.compare?.mismatches) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Exit-table import failed: ${error.message}. No remote data was changed.`); process.exitCode = 1; });
}
