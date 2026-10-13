/** Disposable workerd D1 replay. No remote bindings, network or current-page claims. */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { IMPORTED_TABLES, keys } from './core-import.mjs';

export async function rehearseCoreD1(built) {
  const state = await mkdtemp('/tmp/localley-core-d1-');
  let mf;
  try {
    mf = new Miniflare({ workers: [{ config: {
      name: 'core-rehearsal', compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'],
      manifest: { mainModule: 'worker.mjs', modulesRoot: state,
        modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("Local SQL proof only"); } };' } } },
      env: { DB: { type: 'd1', id: '00000000-0000-0000-0000-00000000d1d1', dev: { remote: false } } },
    }, dev: { outboundService: { type: 'fetcher', handler: () => new Response('Outbound disabled', { status: 502 }) } } }],
    resourcePersistencePath: state, resourceTmpPath: state, telemetry: { enabled: false }, cf: false,
    logRequests: false, unsafeLocalExplorer: false, log: new Log(LogLevel.ERROR) });
    const db = await mf.getD1Database('DB');
    const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations/app-preview');
    const migrations = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
    for (const name of migrations) {
      const text = await readFile(join(directory, name), 'utf8');
      await db.exec(text.split('\n').filter(line => !line.trimStart().startsWith('--')).join(' '));
    }
    const statements = built.sql.trimEnd().split('\n');
    const replay = async () => {
      let changes = 0;
      for (let i = 0; i < statements.length; i += 50) {
        const results = await db.batch(statements.slice(i, i + 50).map(sql => db.prepare(sql)));
        changes += results.reduce((sum, result) => sum + result.meta.changes, 0);
      }
      return changes;
    };
    const insertedRows = await replay();
    const repeatChanges = await replay();
    const counts = {}; let mismatchCount = insertedRows === statements.length ? 0 : 1;
    for (const name of IMPORTED_TABLES) {
      const rows = (await db.prepare(`SELECT * FROM ${name}`).all()).results;
      counts[name] = rows.length;
      if (rows.length !== built.expected[name].length) mismatchCount++;
      const stored = new Map(rows.map(row => [row[keys[name]], row]));
      for (const row of built.expected[name]) {
        const actual = stored.get(row[keys[name]]);
        if (!actual) { mismatchCount++; continue; }
        for (const [column, value] of Object.entries(row)) {
          const want = value == null ? null : typeof value === 'object' ? JSON.stringify(value) : typeof value === 'boolean' ? Number(value) : value;
          if (actual[column] !== want) mismatchCount++;
        }
      }
    }
    const batches = (await db.prepare('SELECT id,counts FROM legacy_import_batches').all()).results;
    if (batches.length !== 1 || batches[0].id !== built.batchId || JSON.stringify(JSON.parse(batches[0].counts)) !== JSON.stringify(built.counts)) mismatchCount++;
    const schemaObjects = (await db.prepare("SELECT type,name,tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;
    const foreignKeyViolations = (await db.prepare('PRAGMA foreign_key_check').all()).results.length;
    return { localOnly: true, noOutboundCode: true, migrations: migrations.length, insertedRows,
      repeatChanges, counts, schemaObjects, mismatchCount, foreignKeyViolations, servingApiVerified: false };
  } finally {
    await mf?.dispose();
    await rm(state, { recursive: true, force: true });
  }
}
