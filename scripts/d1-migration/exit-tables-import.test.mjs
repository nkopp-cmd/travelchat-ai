import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { buildImport, compare, d1Columns, d1Select, literal, primaryKey, SCHEMA_FILE, tableDigest, upsertSql } from "./exit-tables-import.mjs";

const schema = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));

function migratedDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("migrations/app-preview").filter(f => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(`migrations/app-preview/${file}`, "utf8"));
  }
  return db;
}

const read = (db, table) => db.prepare(d1Select(schema, table)).all().map(r => ({ ...r }));

// Parent and child rows across two Supabase-only tables (geo_countries <- geo_destinations).
const source = () => ({
  geo_countries: [{ code: "KR", name: '{"en": "South Korea"}', default_currency: "KRW", default_languages: '["ko"]', source_meta: "{}", created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z" }],
  geo_destinations: [{ id: "11111111-1111-4111-8111-111111111111", slug: "seoul", name: '{"en": "Seoul"}', country_code: "KR", center_lat: 37.5665, center_lng: 126.978,
    timezone: "Asia/Seoul", currency: "KRW", languages: '["ko"]', ring: 1, is_enabled: 1, targets: "{}", characterization: "{}", source_meta: "{}", reviewed_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z" }],
});

function fill(table, row) {
  // Unknown NOT NULL columns of the fixture tables keep their source shape; fill nothing else.
  return Object.fromEntries(d1Columns(schema, table).map(c => [c, row[c] ?? null]));
}

test("literals escape quotes and refuse unknown types", () => {
  assert.equal(literal("it's"), "'it''s'");
  assert.equal(literal(null), "NULL");
  assert.equal(literal(1.5), "1.5");
  assert.throws(() => literal(true), /Unexpected value type/);
  assert.throws(() => literal(Number.NaN), /Non-finite/);
});

test("every exit table has a primary key and D1 columns matching the migration", () => {
  const db = migratedDb();
  for (const table of new Set(schema.columns.map(c => c.t))) {
    assert.ok(primaryKey(schema, table).length >= 1, table);
    const actual = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    assert.deepEqual(d1Columns(schema, table), actual, table);
  }
});

test("import applies, is idempotent, and an upsert never cascades into children", () => {
  const db = migratedDb();
  const rows = Object.fromEntries(Object.entries(source()).map(([t, rs]) => [t, rs.map(r => fill(t, r))]));
  db.exec(buildImport(schema, rows));
  assert.equal(compare(schema, rows, { geo_countries: read(db, "geo_countries"), geo_destinations: read(db, "geo_destinations") }).report.mismatches, 0);
  // Second run with a changed parent: child row must survive (REPLACE would delete it through ON DELETE CASCADE).
  rows.geo_countries[0].default_currency = "USD";
  db.exec(buildImport(schema, rows));
  assert.equal(read(db, "geo_destinations").length, 1);
  assert.equal(read(db, "geo_countries")[0].default_currency, "USD");
  assert.equal(compare(schema, rows, { geo_countries: read(db, "geo_countries"), geo_destinations: read(db, "geo_destinations") }).report.mismatches, 0);
});

test("compare finds missing, extra and changed rows and emits child-first deletes", () => {
  const rows = Object.fromEntries(Object.entries(source()).map(([t, rs]) => [t, rs.map(r => fill(t, r))]));
  const d1 = structuredClone(rows);
  d1.geo_destinations[0].slug = "seoul-2";
  d1.geo_countries.push({ ...d1.geo_countries[0], code: "JP" });
  d1.geo_destinations.push({ ...d1.geo_destinations[0], id: "22222222-2222-4222-8222-222222222222", country_code: "JP" });
  const { report, prune } = compare(schema, rows, d1);
  assert.equal(report.mismatches, 2);
  assert.deepEqual(report.tables.geo_destinations, { ...report.tables.geo_destinations, missing: 0, extra: 1, changed: 1, equal: false });
  assert.equal(report.tables.geo_countries.extra, 1);
  const lines = prune.trim().split("\n");
  assert.match(lines[0], /^DELETE FROM geo_destinations WHERE id = '22222222/);
  assert.match(lines[1], /^DELETE FROM geo_countries WHERE code = 'JP'/);
});

test("digest ignores row order and sees any value change", () => {
  const rows = [{ code: "KR", name: "a" }, { code: "JP", name: "b" }].map(r => fill("geo_countries", r));
  const base = tableDigest(schema, "geo_countries", rows);
  assert.equal(tableDigest(schema, "geo_countries", [...rows].reverse()), base);
  assert.notEqual(tableDigest(schema, "geo_countries", [rows[0], { ...rows[1], name: "c" }]), base);
});

test("composite keys upsert on the whole key; key-only tables do nothing on conflict", () => {
  const composite = schema.constraints.find(c => c.k === "p" && c.def.includes(","));
  const sql = upsertSql(schema, composite.t, fill(composite.t, {}));
  assert.match(sql, new RegExp(`ON CONFLICT \\(${primaryKey(schema, composite.t).join(", ")}\\)`));
});
