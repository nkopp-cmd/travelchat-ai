// Register directly applied candidate migrations only after complete schema validation.
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const CANDIDATE = '6f5b1df7-2eb5-479f-8803-8095e72c7053';
export const BASE_COMMIT = '25a48dfcdae92f9a02893a731d4f248626ad4b31';
const quote = s => `'${s.replaceAll("'", "''")}'`;
export const normalize = s => s.replace(/--[^\n]*/g, '').replace(/\bIF\s+NOT\s+EXISTS\b/ig, '')
  .replace(/\s+/g, ' ').replace(/\s*([(),;=])\s*/g, '$1').replace(/;$/, '').trim();
const digest = s => createHash('sha256').update(s).digest('hex');
export function expectedSchema(root = '.') {
  const db = new DatabaseSync(':memory:');
  try {
    const names = execFileSync('git', ['ls-tree', '-r', '--name-only', BASE_COMMIT, 'cloudflare/auth-proof/migrations'], { encoding: 'utf8' })
      .trim().split('\n').filter(n => /\/00(?:0[1-9]|1[0-3])_[^/]+\.sql$/.test(n)).sort();
    if (names.length !== 13) throw new Error('Missing pinned base migrations');
    for (const name of names) db.exec(execFileSync('git', ['show', `${BASE_COMMIT}:${name}`], { encoding: 'utf8' }));
    const files = readdirSync(`${root}/migrations/app-preview`).filter(n => /^\d{4}_[a-z_]+\.sql$/.test(n)).sort();
    const migrations = files.map(name => ({ name, sha256: digest(readFileSync(`${root}/migrations/app-preview/${name}`)) }));
    for (const name of files) db.exec(readFileSync(`${root}/migrations/app-preview/${name}`, 'utf8'));
    const schema = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return { schema, migrations };
  } finally { db.close(); }
}
export function reconcileLedger({ databaseId, expected, actual, ledger, foreignKeys }) {
  if (databaseId !== CANDIDATE || !Array.isArray(actual) || !Array.isArray(ledger)
    || !Array.isArray(foreignKeys) || foreignKeys.length) throw new Error('Invalid candidate evidence');
  const migrations = expected.migrations;
  if (!migrations.length || new Set(migrations.map(m => m.name)).size !== migrations.length
    || migrations.some(m => !/^\d{4}_[a-z_]+\.sql$/.test(m.name) || !/^[a-f0-9]{64}$/.test(m.sha256))) throw new Error('Invalid migration inventory');
  const wanted = new Set(migrations.map(m => m.name));
  if (ledger.some(r => !wanted.has(r.name)) || new Set(ledger.map(r => r.name)).size !== ledger.length) throw new Error('Unknown or duplicate ledger entry');
  const byName = new Map(actual.map(r => [r.name, r]));
  if (byName.size !== actual.length || !expected.schema.length) throw new Error('Invalid schema inventory');
  for (const row of expected.schema) {
    const found = byName.get(row.name);
    if (!found || found.type !== row.type || normalize(found.sql) !== normalize(row.sql)) throw new Error(`Schema mismatch: ${row.name}`);
  }
  const approved = new Set(expected.schema.map(r => r.name));
  approved.add('d1_migrations');
  const internal = byName.get('_cf_KV');
  if (internal) {
    if (internal.type !== 'table' || normalize(internal.sql) !== normalize('CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value BLOB) WITHOUT ROWID')) throw new Error('Invalid D1 internal table');
    approved.add('_cf_KV');
  }
  if (actual.some(r => !approved.has(r.name))) throw new Error('Unknown schema object');
  const table = byName.get('d1_migrations');
  if (!table || table.type !== 'table') throw new Error('Missing migration ledger');
  // Exact sqlite_master guards prevent applying a stale preflight. This is one INSERT, never DDL.
  const schemaValues = actual.map(r => `(${quote(r.name)},${quote(r.type)},${quote(r.sql)})`).join(',');
  const sql = `WITH approved_schema(name,type,sql) AS (VALUES ${schemaValues}),
approved(name) AS (VALUES ${migrations.map(m => `(${quote(m.name)})`).join(',')})
INSERT INTO d1_migrations(name) SELECT name FROM approved a
WHERE NOT EXISTS (SELECT 1 FROM d1_migrations d WHERE d.name=a.name)
AND NOT EXISTS (SELECT 1 FROM approved_schema p LEFT JOIN sqlite_master m
  ON m.name=p.name AND m.type=p.type AND m.sql=p.sql WHERE m.name IS NULL)
AND (SELECT count(*) FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%')=${actual.length}
AND NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name NOT IN (${migrations.map(m => quote(m.name)).join(',')}));\n`;
  if (Buffer.byteLength(sql) > 100_000) throw new Error('Registration exceeds D1 statement limit');
  return { sql, report: { databaseId, baseCommit: BASE_COMMIT, schemaObjects: expected.schema.length,
    schemaSha256: digest(JSON.stringify(expected.schema.map(r => [r.type, r.name, normalize(r.sql)]))), migrations,
    pending: migrations.filter(m => !ledger.some(r => r.name === m.name)).map(m => m.name), sqlSha256: digest(sql) } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [evidencePath, sqlPath] = process.argv.slice(2);
  if (!evidencePath || !sqlPath) throw new Error('Usage: reconcile-ledger.mjs candidate-evidence.json private-output.sql');
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const result = reconcileLedger({ ...evidence, expected: expectedSchema() });
  writeFileSync(sqlPath, result.sql, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(result.report));
}
