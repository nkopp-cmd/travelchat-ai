// Supabase exit gate 2 rehearsal: prove that D1 writes replay into Postgres exactly, without touching production.
// Needs a local Postgres + PostGIS loaded with scripts/d1-migration/fixtures/supabase-schema-20261024.sql, e.g.
//   docker run -d -e POSTGRES_PASSWORD=... -p 127.0.0.1:54329:5432 postgis/postgis:16-3.4; psql ... -f that file
//   PGURL=postgres://postgres:...@127.0.0.1:54329/rehearsal node scripts/d1-migration/rollback-rehearsal.mjs --report FILE.json
// Steps: live source (read-only) -> identical local D1 (gate-1 loader) and local Postgres; scripted app writes on D1
// through the facade (journaled); replay the journal into Postgres; every facade table must be equal again.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadFacade } from "./facade-bundle.mjs";
import { GEO_TABLES, loadAndCompare, migratedDatabase } from "./exit-full-import.mjs";
import { META_QUERY, buildReplay } from "./rollback-replay.mjs";

function psql(sql) {
  return execFileSync("psql", [process.env.PGURL, "-v", "ON_ERROR_STOP=1", "-qtA", "-c", sql], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

function psqlFile(sql) {
  return execFileSync("psql", [process.env.PGURL, "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], { input: sql, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;

async function restRows(table, primaryKey) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=*&order=${primaryKey.join(",")}`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!response.ok) throw new Error(`Source read ${table}: ${response.status}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/** Postgres rows of a table in PostgREST JSON shape, ordered by primary key. */
function pgRows(table, primaryKey) {
  const out = psql(`select coalesce(json_agg(t order by ${primaryKey.map((c) => `"${c}"`).join(", ")}), '[]') from public."${table}" t`);
  return JSON.parse(out);
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), all[index + 1]]], []));
  if (!process.env.PGURL || !args.report) throw new Error("Usage: PGURL=... --report FILE.json");
  const facade = await loadFacade();
  const meta = JSON.parse(psql(META_QUERY));
  const tables = Object.keys(facade.TABLES);

  // 1. Identical starting state: D1 through the gate-1 loader, Postgres from the same source rows (triggers off).
  const source = {};
  const read = async (table, primaryKey) => (source[table] = await restRows(table, primaryKey));
  const db = migratedDatabase(facade.D1Sqlite);
  const geoRows = {};
  for (const table of GEO_TABLES) geoRows[table] = []; // geography tables: compared below only on the Postgres side
  const load = await loadAndCompare(facade, db, { read, geoRows });
  const truncate = tables.filter((t) => meta[t]).map((t) => `public."${t}"`).join(", ");
  const loadSql = ["BEGIN;", "SET LOCAL session_replication_role = replica;", `TRUNCATE ${truncate} CASCADE;`];
  for (const [table, rows] of Object.entries(source)) {
    if (!rows.length) continue;
    const cols = meta[table].columns.map((c) => `"${c}"`).join(", ");
    loadSql.push(`INSERT INTO public."${table}" (${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::public."${table}", ${quote(JSON.stringify(rows))}::jsonb);`);
  }
  loadSql.push("COMMIT;");
  psqlFile(loadSql.join("\n"));

  // 2. Scripted app writes on D1 (journaled), as a signed-in user and as the service role.
  const owner = source.itineraries.find((r) => r.clerk_user_id)?.clerk_user_id;
  const user = facade.d1Client(db, { role: "user", userId: owner });
  const service = facade.d1Client(db, { role: "service" });
  const target = source.itineraries.find((r) => r.clerk_user_id === owner);
  const writes = [];
  const record = async (label, promise) => { const { error } = await promise; writes.push({ label, error: error?.message ?? null }); };
  await record("itinerary insert", user.from("itineraries").insert({ clerk_user_id: owner, title: "Rollback rehearsal trip", city: "Seoul", days: 2, activities: [{ day: 1, activities: [] }], highlights: ["test"] }));
  await record("itinerary update", user.from("itineraries").update({ title: "Renamed in rehearsal", is_favorite: true }).eq("id", target.id));
  const conv = source.conversations.find((r) => r.clerk_user_id === owner) ?? null;
  if (conv) await record("chat message (trigger)", user.from("messages").insert({ conversation_id: conv.id, role: "user", content: "rehearsal message" }));
  await record("saved spot", user.from("saved_spots").insert({ clerk_user_id: owner, spot_id: source.spots[0].id }));
  await record("subscription upsert", service.from("subscriptions").upsert({ clerk_user_id: owner, tier: "pro", status: "active" }, { onConflict: "clerk_user_id" }));
  const victim = source.itineraries.find((r) => r.clerk_user_id === owner && r.id !== target.id);
  if (victim) await record("itinerary delete", user.from("itineraries").delete().eq("id", victim.id));
  await record("spot update (derived columns)", service.from("spots").update({ category: "Rehearsal" }).eq("id", source.spots[1].id));

  // 3. Replay the journal into Postgres.
  const { results: entries } = await db.prepare("SELECT seq, table_name, op, pk FROM _journal ORDER BY seq").all();
  const replay = await buildReplay(facade, db, entries, meta);
  psqlFile(replay.sql);

  // 4. Every facade table equal on both sides again (geography tables are not loaded into D1 here).
  const compared = {};
  for (const table of tables.filter((t) => !GEO_TABLES.includes(t) && meta[t])) {
    let query = service.from(table).select("*");
    for (const key of facade.TABLES[table].primaryKey) query = query.order(key);
    const { data } = await query;
    compared[table] = JSON.stringify(pgRows(table, facade.TABLES[table].primaryKey)) === JSON.stringify(data);
  }
  const mismatches = Object.entries(compared).filter(([, equal]) => !equal).map(([t]) => t);
  const report = { at: new Date().toISOString(), loadMismatches: Object.entries(load).filter(([k, r]) => k !== "foreignKeyViolations" && !r.equal).map(([t]) => t),
    writes, journalEntries: entries.length, replayKeys: replay.keys, tablesCompared: Object.keys(compared).length, mismatches };
  writeFileSync(args.report, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
  if (mismatches.length || writes.some((w) => w.error)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`Rollback rehearsal failed: ${error.message}`); process.exitCode = 1; });
}
