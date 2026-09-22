// Rehearse a built legacy import on real local workerd D1 and read it back through the built Worker.
//   npm run build && node scripts/legacy-import-d1.mjs --snapshot DIR --projection DIR --report FILE.json
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { buildImport, loadProjection, loadRules, loadSnapshot, IMPORTED_TABLES } from './legacy-import.mjs';

// D1 exec runs one statement per line; migrations with multi-line statements are flattened first.
export const flatten = text => text.split('\n').filter(line => !line.trimStart().startsWith('--')).join(' ');

export async function rehearseD1(built, { stateRoot = resolve('.local') } = {}) {
  const state = await mkdtemp(join(stateRoot, 'import-d1-'));
  const mf = new Miniflare({ workers: [{ config: { name: 'import-rehearsal', type: 'worker', compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'],
    manifest: { mainModule: 'worker.mjs', modulesRoot: resolve('dist'), modules: { 'worker.mjs': { type: 'esm', contents: await readFile('dist/worker.mjs', 'utf8') } } },
    env: { APP_MODE: { type: 'json', value: 'local' }, LOCAL_PROOF: { type: 'json', value: 'true' }, AUTH_BASE_URL: { type: 'json', value: 'https://localhost' },
      BETTER_AUTH_SECRET: { type: 'json', value: randomBytes(48).toString('hex') }, CLAIM_SECRET: { type: 'json', value: randomBytes(48).toString('hex') },
      DB: { type: 'd1', id: '00000000-0000-0000-0000-00000000d1d1', dev: { remote: false } } } },
    dev: { outboundService: { type: 'fetcher', handler: () => new Response('Outbound network disabled', { status: 502 }) } } }],
    resourcePersistencePath: state, resourceTmpPath: state, telemetry: { enabled: false }, cf: false, logRequests: false, unsafeLocalExplorer: false, log: new Log(LogLevel.ERROR) });
  try {
    const db = await mf.getD1Database('DB');
    const migrations = (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort();
    for (const name of migrations) await db.exec(flatten(await readFile(join('migrations', name), 'utf8')));
    const statements = built.sql.trimEnd().split('\n');
    // Values never contain raw newlines: sql() keeps JSON-escaped text on one line, so each line is one statement.
    let changes = 0;
    for (let i = 0; i < statements.length; i += 200) changes += (await db.batch(statements.slice(i, i + 200).map(s => db.prepare(s)))).reduce((n, r) => n + r.meta.changes, 0);
    let repeat = 0;
    for (let i = 0; i < statements.length; i += 200) repeat += (await db.batch(statements.slice(i, i + 200).map(s => db.prepare(s)))).reduce((n, r) => n + r.meta.changes, 0);
    const counts = {};
    for (const name of IMPORTED_TABLES) counts[name] = (await db.prepare(`SELECT count(*) AS n FROM ${name}`).first()).n;
    const fk = (await db.prepare('PRAGMA foreign_key_check').all()).results.length;
    // Read the public catalog through the actual Worker, page by page.
    let offset = 0, served = 0, pages = 0;
    while (offset !== null && pages < 200) {
      const response = await mf.dispatchFetch(`https://localhost/api/spots?limit=100&offset=${offset}`);
      if (response.status !== 200) throw new Error(`Catalog status ${response.status}`);
      const page = await response.json(); served += page.spots.length; offset = page.nextOffset; pages++;
    }
    const itinerary = built.expected.itineraries[0];
    const unauthenticated = (await mf.dispatchFetch(`https://localhost/api/itineraries/${itinerary.id}`)).status;
    return { migrations: migrations.length, statements: statements.length, insertedRows: changes, repeatChanges: repeat, counts, foreignKeyViolations: fk,
      workerCatalogServed: served, workerCatalogPages: pages, expectedVisible: built.expected.spots.filter(s => s.visible).length, privateItineraryWithoutSession: unauthenticated };
  } finally { await mf.dispose(); await rm(state, { recursive: true, force: true }); }
}

if (process.argv[1]?.endsWith('legacy-import-d1.mjs')) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ''), all[index + 1]]], []));
  const built = buildImport(loadSnapshot(args.snapshot), loadProjection(args.projection), await loadRules());
  const result = await rehearseD1(built);
  await writeFile(args.report, JSON.stringify({ batchId: built.batchId, ...result }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(result));
  if (result.repeatChanges || result.foreignKeyViolations || result.workerCatalogServed !== result.expectedVisible) process.exitCode = 1;
}
