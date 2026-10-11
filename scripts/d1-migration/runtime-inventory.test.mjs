import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeInventory, inventoryCheckout } from './runtime-inventory.mjs';

const client = 'import { createSupabaseAdmin as make } from "@/lib/supabase"; const db = make();';
test('finds reads, writes, RPCs and storage without comments, string text or built-in from calls', () => {
  const result = runtimeInventory({ 'lib/data.ts': `${client}
    // db.from('fake').delete();
    const text = "db.from('also_fake')";
    Array.from([]); Buffer.from('bytes'); Uint8Array.from([]);
    db.from('spots').select('*'); db.from('users').upsert({});
    db.rpc('check_and_increment_usage', {}); db.storage.from('stories').upload('key', data);
    db.storage.from('stories').getPublicUrl('key');` });
  assert.equal(result.summary.accessSites, 5);
  assert.deepEqual(Object.keys(result.resources).sort(), ['rpc:check_and_increment_usage', 'storage:stories', 'table:spots', 'table:users']);
  assert.deepEqual(result.resources['table:users'][0].operations, ['upsert']);
  assert.deepEqual(result.resources['storage:stories'].map(a => a.operations), [['upload'], ['getPublicUrl']]);
  assert.equal(result.summary.unresolvedReceivers, 0);
});
test('follows awaited aliases and retains dynamic resource and unknown receiver uncertainty', () => {
  const result = runtimeInventory({ 'lib/data.ts': `${client}
    const alias = await db; alias.from(tableName).delete(); unknown.from('other').select('*');` });
  assert.equal(result.summary.dynamicResources, 1);
  assert.equal(result.resources['table:<dynamic>'][0].evidence, 'source_client');
  assert.equal(result.summary.unresolvedReceivers, 1);
  assert.equal(result.resources['table:other'][0].evidence, 'unresolved_receiver');
  assert.equal(result.cutoverReady, false);
});
test('traces shared auth hooks, re-exports, dynamic literal imports and import cycles', () => {
  const result = runtimeInventory({
    'app/api/auth/route.ts': 'import { sync } from "@/lib/barrel";',
    'lib/barrel.ts': 'export { sync } from "./sync";',
    'lib/sync.ts': `${client} import './cycle'; db.from('users').upsert({});`,
    'lib/cycle.ts': 'import "./sync";',
    'app/api/cron/route.ts': 'await import("@/lib/sync");',
    'lib/supabase.ts': 'export const createSupabaseAdmin = () => null;',
  });
  assert.equal(result.summary.sourceReachableEntrypoints, 2);
  for (const entry of result.entrypoints) assert.deepEqual(entry.sourceModules, ['lib/sync.ts']);
  assert.equal(result.summary.unresolvedImports, 0);
});
test('candidate coexistence stays unproven and source-only callers remain visible', () => {
  const result = runtimeInventory({
    'app/profile/page.tsx': `import "@/lib/app-data/preview-profile"; ${client} db.from('users').select('*');`,
    'app/api/export/route.ts': `${client} db.from('itineraries').select('*');`,
    'lib/app-data/preview-profile.ts': 'export const candidate = true;',
  });
  assert.equal(result.summary.withCandidateImports, 1);
  assert.equal(result.summary.withoutCandidateImports, 1);
  assert.ok(result.entrypoints.every(e => e.parity === 'not_proven'));
  assert.equal(result.cutoverReady, false);
});
test('retains unresolved local and computed module imports without leaking source literals', () => {
  const result = runtimeInventory({ 'app/api/sample/route.ts': 'import "@/lib/missing"; import "./style.css"; import(path); const secret = "do_not_include";' });
  assert.deepEqual(result.entrypoints[0].unresolvedImports, [{ path: 'app/api/sample/route.ts', import: '@/lib/missing' }]);
  assert.deepEqual(result.entrypoints[0].dynamicImports, [{ path: 'app/api/sample/route.ts', line: 1 }]);
  assert.ok(!JSON.stringify(result).includes('do_not_include'));
});
test('hashes all scanned runtime bytes deterministically, including otherwise unused modules', () => {
  const a = { 'lib/b.ts': 'export const b=1;', 'lib/a.ts': 'export const a=1;' };
  assert.deepEqual(runtimeInventory(a), runtimeInventory(Object.fromEntries(Object.entries(a).reverse())));
  assert.notEqual(runtimeInventory(a).sourceDigest, runtimeInventory({ ...a, 'lib/b.ts': 'export const b=2;' }).sourceDigest);
});
test('does not mistake nested helper calls for operations on the source query', () => {
  const result = runtimeInventory({ 'lib/data.ts': `${client} db.from('spots').select(helper.delete());` });
  assert.deepEqual(result.resources['table:spots'][0].operations, ['select']);
});

test('includes explicit bracket methods and separates operational scripts from app callers', () => {
  const result = runtimeInventory({ 'scripts/import.mjs': `${client} db['from']('spots').insert({});`,
    'app/api/spots/route.ts': `${client} db['rpc']('find_spots');` });
  assert.equal(result.summary.applicationSourceEntrypoints, 1);
  assert.equal(result.summary.operationalSourceEntrypoints, 1);
  assert.equal(result.resources['table:spots'][0].evidence, 'source_client');
  assert.equal(result.resources['rpc:find_spots'][0].evidence, 'source_client');
});

test('includes root layouts and storage aliases, auth, functions, realtime and raw HTTP', () => {
  const r = runtimeInventory({'app/layout.tsx': `${client}
    const bucket = db.storage; bucket.from('media').download('key');
    db.auth.admin.getUserById('id'); db.functions.invoke('worker'); db.channel('spots');
    fetch(\`\${process.env.SUPABASE_URL}/rest/v1/users\`);`});
  assert.equal(r.summary.applicationSourceEntrypoints, 1);
  assert.ok(r.resources['storage:media']); assert.ok(r.resources['auth:getUserById']);
  assert.ok(r.resources['function:worker']); assert.ok(r.resources['realtime:spots']);
  assert.ok(r.resources['raw-http:source-http']); assert.equal(r.cutoverReady, false);
});

test('refuses a misplaced checkout instead of reporting an empty inventory', async () => {
  await assert.rejects(inventoryCheckout('/nonexistent-localley-checkout-for-inventory'));
});

test('keeps injected and destructured subsystem calls and metadata/proxy callers visible', () => {
  const r=runtimeInventory({ 'proxy.ts': `function hook(client) { client.auth.admin.listUsers(); client.functions.invoke('job'); }`,
    'app/sitemap.ts': `const { auth, storage } = unknown; auth.signOut(); storage.from('media').download('key');`,
    'src/middleware.ts': `${client} db.from('users').select('*');`,
    'app/error.jsx': `${client} export default () => <div>{db.from('users').select('*')}</div>;` });
  assert.equal(r.summary.applicationSourceEntrypoints,4);
  assert.ok(r.resources['auth:listUsers']); assert.ok(r.resources['auth:signOut']);
  assert.ok(r.resources['function:job']); assert.ok(r.resources['storage:media']);
  assert.equal(r.resources['auth:listUsers'][0].evidence,'unresolved_receiver');
});

test('subsystem words in strings and regex do not turn data values into clients', () => {
  const r=runtimeInventory({'lib/data.ts': `const text = '.auth .functions'; const regex = /\\.auth|\\.storage/; text.slice(); regex.test('x');`});
  assert.equal(r.summary.accessSites,0);
});
