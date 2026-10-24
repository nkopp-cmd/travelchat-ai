import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { sourceSelect, translateExpression, translateSchema } from "./pg-to-d1-schema.mjs";

const schema = JSON.parse(readFileSync("scripts/d1-migration/fixtures/supabase-exit-schema-20261024.json", "utf8"));
const MIGRATION = "migrations/app-preview/0034_supabase_exit_tables.sql";

function migratedDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("migrations/app-preview").filter(f => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(`migrations/app-preview/${file}`, "utf8"));
  }
  return db;
}

test("the committed migration is exactly the translation of the pinned catalog", () => {
  assert.equal(readFileSync(MIGRATION, "utf8"), translateSchema(schema));
});

test("migration 0038 is exactly the translation of its pinned catalog", () => {
  const more = JSON.parse(readFileSync("scripts/d1-migration/fixtures/supabase-exit-schema-20261024b.json", "utf8"));
  assert.equal(readFileSync("migrations/app-preview/0038_supabase_exit_more_tables.sql", "utf8"), translateSchema(more));
});

test("every Supabase-only table gets a D1 table, in foreign-key order, on top of the candidate schema", () => {
  const db = migratedDb();
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
  for (const t of new Set(schema.columns.map(c => c.t))) assert.ok(tables.has(t), t);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  const columns = db.prepare("PRAGMA table_info(geo_destinations)").all().map(c => c.name);
  assert.ok(columns.includes("center_lat") && columns.includes("center_lng") && !columns.includes("center"));
});

test("translated CHECKs keep the source rules", () => {
  const db = migratedDb();
  const country = (code, currency = "KRW") => () => db.prepare(
    "INSERT INTO geo_countries (code, name, default_currency, default_languages) VALUES (?, '{\"en\":\"x\"}', ?, '[\"ko\"]')",
  ).run(code, currency);
  assert.doesNotThrow(country("KR"));
  assert.throws(country("kr"), /CHECK/);
  assert.throws(country("KOR"), /CHECK/);
  assert.throws(country("JP", "yen"), /CHECK/);
  const uuid = db.prepare("INSERT INTO spot_contributors (email, public_credit_name) VALUES ('a@b.test', 'A') RETURNING id").get().id;
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.throws(() => db.prepare("INSERT INTO spot_contributors (email, public_credit_name) VALUES ('A@B.test', 'A')").run(), /CHECK/);
});

test("expression rules: regex as GLOB, ANY as IN, jsonb types and keys, num_nonnulls", () => {
  const db = new DatabaseSync(":memory:");
  const slug = translateExpression("((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text))");
  const ok = value => db.prepare(`SELECT ${slug} AS ok FROM (SELECT ? AS slug)`).get(value).ok;
  assert.deepEqual(["seoul", "jeju-si", "a1-b2-c3"].map(ok), [1, 1, 1]);
  assert.deepEqual(["Seoul", "-a", "a-", "a--b", "", "a b"].map(ok), [0, 0, 0, 0, 0, 0]);
  assert.equal(translateExpression("((status = ANY (ARRAY['a'::text, 'b'::text])))"), "((status IN ('a', 'b')))");
  assert.equal(translateExpression("((jsonb_typeof(evidence) = ANY (ARRAY['object'::text, 'array'::text])))"),
    "((json_type(evidence) IN ('object', 'array')))");
  assert.equal(translateExpression("(((jsonb_typeof(name) = 'object'::text) AND (name ? 'en'::text)))"),
    "(((json_type(name) = 'object') AND (json_type(name, '$.en') IS NOT NULL)))");
  assert.equal(translateExpression("((num_nonnulls(a, b) = 1))"), "((((a IS NOT NULL) + (b IS NOT NULL)) = 1))");
});

test("anything unknown fails loudly instead of being dropped", () => {
  assert.throws(() => translateExpression("((name ~ '^x+$'::text))"), /Unsupported regex/);
  assert.throws(() => translateExpression("((tags && ARRAY['a'::text]))"), /Untranslated/);
  assert.throws(() => translateSchema({ ...schema, columns: [...schema.columns, { t: "x", col: "v", udt: "tsvector", nul: "YES", def: null }] }), /Unsupported type/);
});

test("source select reads geography as lat/lng and timestamps as PostgREST text", () => {
  const sql = sourceSelect(schema, "geo_destinations");
  assert.match(sql, /ST_Y\("center"::geometry\) AS center_lat, ST_X\("center"::geometry\) AS center_lng/);
  assert.match(sql, /to_json\("created_at"\) #>> '\{\}' AS created_at/);
  assert.throws(() => sourceSelect(schema, "nope"), /Unknown table/);
});

test("migration 0036 backfills the itinerary media columns from legacy_itinerary_media", () => {
  const db = new DatabaseSync(":memory:");
  const files = readdirSync("migrations/app-preview").filter(f => f.endsWith(".sql")).sort();
  for (const file of files.filter(f => f < "0036")) db.exec(readFileSync(`migrations/app-preview/${file}`, "utf8"));
  const id = "11111111-1111-4111-8111-111111111111", bare = "22222222-2222-4222-8222-222222222222";
  db.exec("INSERT INTO owners (id, source) VALUES ('user_a', 'legacy-fixture')");
  for (const trip of [id, bare]) db.prepare("INSERT INTO itineraries (id, ownerId, days, activities) VALUES (?, 'user_a', 1, '[]')").run(trip);
  db.prepare(`INSERT INTO legacy_itinerary_media (itineraryId, aiBackgrounds, storySlides, isPublic, likeCount, viewCount, sourceProfileId)
    VALUES (?, '{"cover":"u"}', NULL, 1, 4, 9, 'p1')`).run(id);
  db.exec(readFileSync("migrations/app-preview/0036_itinerary_media_columns.sql", "utf8"));
  const row = id => ({ ...db.prepare("SELECT ai_backgrounds, story_slides, is_public, like_count, view_count, user_id FROM itineraries WHERE id = ?").get(id) });
  assert.deepEqual(row(id), { ai_backgrounds: '{"cover":"u"}', story_slides: null, is_public: 1, like_count: 4, view_count: 9, user_id: "p1" });
  assert.deepEqual(row(bare), { ai_backgrounds: null, story_slides: null, is_public: 0, like_count: 0, view_count: 0, user_id: null });
});

