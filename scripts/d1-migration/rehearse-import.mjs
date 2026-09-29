// Replay PR151 SQL into disposable local workerd D1, never a configured remote binding.
// Supply private generated SQL, report, the PR151 migrations and its built Worker.
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Miniflare, Log, LogLevel } from 'miniflare';

export async function rehearseImport({ sqlFile, sourceReport, ownersReport, snapshotDir, migrationsDir, workerFile, stateRoot, output }) {
  const expected = JSON.parse(await readFile(sourceReport));
  const owners = JSON.parse(await readFile(ownersReport));
  const sql = await readFile(sqlFile);
  const statements = sql.toString('utf8').trimEnd().split('\n');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  if (!expected.batchId || statements.length !== expected.statements || !statements[0].includes(expected.batchId) || statements.some(s => !s.endsWith(';')) ||
      sha(sql) !== expected.sqlSha256 || owners.sourceManifestSha256 !== sha(await readFile(join(snapshotDir, 'manifest.json'))) ||
      expected.rehearsal?.mismatchCount !== 0 || expected.rehearsal?.repeatChanges !== 0 || expected.rehearsal?.foreignKeyViolations !== 0) throw new Error('import_sql_report_mismatch');
  const worker = await readFile(workerFile, 'utf8');
  const state = await mkdtemp(join(stateRoot, 'import-d1-'));
  let mf, phase = 'initialize';
  try {
    mf = new Miniflare({ workers: [{ config: { name: 'import-rehearsal', compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'],
      manifest: { mainModule: 'worker.mjs', modulesRoot: resolve(workerFile, '..'), modules: { 'worker.mjs': { type: 'esm', contents: worker } } },
      env: { APP_MODE: { type: 'json', value: 'local' }, LOCAL_PROOF: { type: 'json', value: 'true' }, AUTH_BASE_URL: { type: 'json', value: 'https://localhost' },
        BETTER_AUTH_SECRET: { type: 'json', value: randomBytes(48).toString('hex') }, CLAIM_SECRET: { type: 'json', value: randomBytes(48).toString('hex') },
        DB: { type: 'd1', id: '00000000-0000-0000-0000-00000000d1d1', dev: { remote: false } } } },
      dev: { outboundService: { type: 'fetcher', handler: () => new Response('Outbound network disabled', { status: 502 }) } } }],
      resourcePersistencePath: state, resourceTmpPath: state, telemetry: { enabled: false }, cf: false, logRequests: false, unsafeLocalExplorer: false, log: new Log(LogLevel.ERROR) });
    const db = await mf.getD1Database('DB');
    phase = 'migrations';
    const migrations = (await readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort();
    for (const name of migrations) {
      const text = await readFile(join(migrationsDir, name), 'utf8');
      // Mirrors PR151's migration flattening; do not change the migration source.
      await db.exec(text.split('\n').filter(line => !line.trimStart().startsWith('--')).join(' '));
    }
    const replay = async () => {
      let changes = 0;
      for (let i = 0; i < statements.length; i += 50) {
        const batch = await db.batch(statements.slice(i, i + 50).map(s => db.prepare(s)));
        changes += batch.reduce((total, result) => total + result.meta.changes, 0);
      }
      return changes;
    };
    phase = 'first_replay';
    const insertedRows = await replay();
    phase = 'repeat_replay';
    const repeatChanges = await replay();
    phase = 'counts';
    const counts = {};
    for (const [name, count] of Object.entries(expected.counts)) {
      phase = `count_${name}`;
      if (!/^[a-z_]+$/.test(name)) throw new Error('invalid_report_table');
      counts[name] = (await db.prepare(`SELECT count(*) AS n FROM ${name}`).first()).n;
      if (counts[name] !== count) throw new Error(`d1_table_count_mismatch_${name}`);
    }
    phase = 'foreign_keys';
    const foreignKeyViolations = (await db.prepare('PRAGMA foreign_key_check').all()).results.length;
    phase = 'owner_reconciliation';
    const importedOwners = (await db.prepare('SELECT id, source FROM owners').all()).results;
    const unclaimed = new Set(owners.private.unclaimedOwners);
    if (importedOwners.length !== owners.sourceOwners || importedOwners.some(row => row.source !== 'legacy-fixture') ||
      unclaimed.size !== owners.unclaimedSourceOwners || ![...unclaimed].every(id => importedOwners.some(row => row.id === id)) || owners.missingAdminIds.length) throw new Error('owner_identity_mismatch');
    const importedOwnerIds = new Set(importedOwners.map(row => row.id));
    for (const [table, source] of Object.entries({ itineraries: 'itineraries', conversations: 'conversations', legacy_subscriptions: 'subscriptions', legacy_usage: 'usage_tracking' })) {
      const rows = (await db.prepare(`SELECT ownerId FROM ${table}`).all()).results;
      if (rows.some(row => !importedOwnerIds.has(row.ownerId)) || rows.filter(row => unclaimed.has(row.ownerId)).length !== owners.ownerRecords[source].unclaimed) throw new Error('owner_history_mismatch');
    }
    const legacyOwners = (await db.prepare('SELECT ownerId, clerkUserId FROM legacy_owners').all()).results;
    if (legacyOwners.length !== importedOwners.length || legacyOwners.some(row => row.ownerId !== row.clerkUserId || !importedOwnerIds.has(row.ownerId))) throw new Error('legacy_identity_mismatch');
    phase = 'catalog';
    let offset = 0, workerCatalogServed = 0, workerCatalogPages = 0;
    while (offset !== null && workerCatalogPages < 200) {
      const response = await mf.dispatchFetch(`https://localhost/api/spots?limit=100&offset=${offset}`);
      if (response.status !== 200) throw new Error('worker_catalog_unavailable');
      const page = await response.json();
      workerCatalogServed += page.spots.length;
      offset = page.nextOffset;
      workerCatalogPages++;
    }
    const result = { batchId: expected.batchId, migrations: migrations.length, statements: statements.length, insertedRows, repeatChanges,
      counts, foreignKeyViolations, sourceSqliteIntegrity: expected.rehearsal.integrity, workerCatalogServed, workerCatalogPages, expectedVisible: expected.spotIssues.public,
      localOnly: true, unclaimedOwnersKept: unclaimed.size };
    if (insertedRows !== statements.length || repeatChanges || foreignKeyViolations || result.sourceSqliteIntegrity !== 'ok' || workerCatalogServed !== result.expectedVisible || offset !== null) throw new Error('d1_rehearsal_mismatch');
    phase = 'write_report';
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return result;
  } catch (error) {
    if (!/^[a-z_]+$/.test(error?.message ?? '')) throw new Error(`rehearsal_failed_at_${phase}`, { cause: error });
    throw error;
  } finally {
    await mf?.dispose();
    await rm(state, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 16 || args.some((value, i) => i % 2 === 0 && value !== ['--sql', '--report', '--owners', '--snapshot', '--migrations', '--worker', '--state-root', '--out'][i / 2])) throw new Error('usage: rehearse-import.mjs --sql PRIVATE_SQL --report PRIVATE_REPORT --owners PRIVATE_OWNER_REPORT --snapshot PRIVATE_SNAPSHOT --migrations PR151_MIGRATIONS --worker PR151_DIST/worker.mjs --state-root PRIVATE_STATE_PARENT --out NEW_PRIVATE_REPORT');
  const [sqlFile, sourceReport, ownersReport, snapshotDir, migrationsDir, workerFile, stateRoot, output] = [1, 3, 5, 7, 9, 11, 13, 15].map(index => resolve(args[index]));
  rehearseImport({ sqlFile, sourceReport, ownersReport, snapshotDir, migrationsDir, workerFile, stateRoot, output }).then(result => console.log(JSON.stringify(result))).catch(error => {
    const reason = /^[a-z_]+$/.test(error?.message ?? '') ? error.message : error?.name ?? 'unknown';
    console.error(`Isolated D1 rehearsal failed (${reason}); no remote database was touched.`); process.exitCode = 1;
  });
}
