// Supabase exit gate 2: replay D1 writes back into Postgres (shared/plans/localley-decisions.md 2026-10-24).
// The D1 facade journals every write key (_journal, migration 0040). Replay takes each key once (latest seq wins),
// reads the current D1 rows for it through the facade, and makes the Postgres rows of that key equal: delete the ones
// D1 no longer has, upsert the rest. It runs in one transaction with session_replication_role = replica, so Postgres
// triggers do not rewrite replayed values (updated_at, conversation timestamps).
//   node scripts/d1-migration/rollback-replay.mjs --since-seq N --d1-id <database_id> --out FILE.sql [--apply-supabase]
// Without --apply-supabase it only writes the SQL (review first). Applying is a production write: rollback only.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadFacade } from "./facade-bundle.mjs";

const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected identifier ${name}`);
  return `"${name}"`;
};
const text = (value) => `'${String(value).replaceAll("'", "''")}'`;

/** Journal entries -> one key per (table, key) in first-seen order; the replay reads the latest D1 state anyway. */
export function journalKeys(entries) {
  const seen = new Map();
  for (const entry of [...entries].sort((a, b) => a.seq - b.seq)) {
    const id = `${entry.table_name}|${entry.pk}`;
    if (!seen.has(id)) seen.set(id, { table: entry.table_name, key: JSON.parse(entry.pk), lastSeq: entry.seq });
    else seen.get(id).lastSeq = entry.seq;
  }
  return [...seen.values()];
}

/**
 * SQL that makes the Postgres rows matching `key` equal to `rows` (the D1 rows matching it, in PostgREST JSON shape).
 * `meta` = { columns: insertable column names, primaryKey: [...] } of the Postgres table.
 */
export function replaySql(table, key, rows, meta) {
  const keyMatch = Object.entries(key).map(([c, v]) => v === null ? `${ident(c)} IS NULL` : `${ident(c)}::text = ${text(v)}`).join(" AND ");
  const pk = meta.primaryKey.map(ident).join(", ");
  const recordset = `jsonb_populate_recordset(NULL::public.${ident(table)}, ${text(JSON.stringify(rows))}::jsonb)`;
  const keep = rows.length ? ` AND (${pk}) NOT IN (SELECT ${pk} FROM ${recordset})` : "";
  const statements = [`DELETE FROM public.${ident(table)} WHERE ${keyMatch}${keep};`];
  if (rows.length) {
    const cols = meta.columns.map(ident).join(", ");
    const updates = meta.columns.filter((c) => !meta.primaryKey.includes(c)).map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`);
    statements.push(`INSERT INTO public.${ident(table)} (${cols}) SELECT ${cols} FROM ${recordset} ON CONFLICT (${pk}) ` +
      (updates.length ? `DO UPDATE SET ${updates.join(", ")};` : "DO NOTHING;"));
  }
  return statements.join("\n");
}

/** Query that returns { table: { columns, primaryKey } } for every public table (run on the Postgres target). */
export const META_QUERY = `select json_object_agg(t, json_build_object('columns', cols, 'primaryKey', pk)) meta from (
  select c.table_name t,
    json_agg(c.column_name order by c.ordinal_position) filter (where c.is_generated = 'NEVER' and c.identity_generation is null) cols,
    (select json_agg(a.attname order by array_position(i.indkey, a.attnum)) from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ('public.' || c.table_name)::regclass and i.indisprimary) pk
  from information_schema.columns c where c.table_schema = 'public' group by c.table_name) x`;

/** D1 rows for one key, through the facade (service role, Postgres-shaped JSON). */
export async function d1RowsFor(facade, db, table, key) {
  let query = facade.d1Client(db, { role: "service" }).from(table).select("*");
  for (const [column, value] of Object.entries(key)) query = value === null ? query.is(column, null) : query.eq(column, value);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

/** Full replay script for a journal slice. */
export async function buildReplay(facade, db, entries, meta) {
  const parts = ["BEGIN;", "SET LOCAL session_replication_role = replica;"];
  const keys = journalKeys(entries);
  for (const { table, key } of keys) {
    if (!meta[table]) throw new Error(`Postgres has no table ${table}`);
    parts.push(replaySql(table, key, await d1RowsFor(facade, db, table, key), meta[table]));
  }
  parts.push("COMMIT;");
  return { sql: parts.join("\n") + "\n", keys: keys.length };
}

/** Minimal D1 binding over the Cloudflare D1 REST API (read side of the facade; one HTTP call per statement). */
export class D1Rest {
  constructor(accountId, databaseId, token) { Object.assign(this, { accountId, databaseId, token }); }
  prepare(sql) {
    const run = async (params) => {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`, {
        method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ sql, params }),
      });
      const body = await response.json();
      if (!body.success) throw new Error(`D1 query failed: ${JSON.stringify(body.errors).slice(0, 200)}`);
      return body.result[0];
    };
    const statement = (params = []) => ({
      bind: (...values) => statement(values),
      all: async () => ({ results: (await run(params)).results }),
      first: async () => (await run(params)).results[0] ?? null,
      run: async () => ({ meta: (await run(params)).meta }),
    });
    return statement();
  }
  async batch() { throw new Error("D1Rest is read-only"); }
}

async function managementQuery(query) {
  const response = await fetch("https://api.supabase.com/v1/projects/llehrhqeolfprutcaopi/database/query", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Supabase query failed: ${response.status} ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), all[index + 1]]], []));
  if (!args["d1-id"] || !args.out || args["since-seq"] === undefined) throw new Error("Usage: --since-seq N --d1-id ID --out FILE.sql [--apply-supabase yes]");
  const facade = await loadFacade();
  const db = new D1Rest(process.env.CLOUDFLARE_ACCOUNT_ID, args["d1-id"], process.env.CLOUDFLARE_API_TOKEN);
  const { results: entries } = await db.prepare("SELECT seq, table_name, op, pk FROM _journal WHERE seq > ? ORDER BY seq").bind(Number(args["since-seq"])).all();
  const meta = (await managementQuery(META_QUERY))[0].meta;
  const { sql, keys } = await buildReplay(facade, db, entries, meta);
  writeFileSync(args.out, sql, { mode: 0o600, flag: "wx" });
  if (args["apply-supabase"] === "yes") await managementQuery(readFileSync(args.out, "utf8"));
  console.log(JSON.stringify({ journalEntries: entries.length, keys, lastSeq: entries.at(-1)?.seq ?? null, applied: args["apply-supabase"] === "yes" }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`Rollback replay failed: ${error.message}`); process.exitCode = 1; });
}
