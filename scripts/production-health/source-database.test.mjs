import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkSourceDatabase } from './source-database.mjs';
const configuration = { NEXT_PUBLIC_SUPABASE_URL: 'https://llehrhqeolfprutcaopi.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'private-fixture-key' };

test('one bounded query uses only the pinned origin, zero rows and no redirects', async () => {
  let calls = 0, discarded = false;
  const report = await checkSourceDatabase(configuration, async (url, options) => {
    calls++;
    assert.equal(url, configuration.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/subscriptions?select=id&limit=0');
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.apikey, 'private-fixture-key');
    assert.equal(options.headers.authorization, 'Bearer private-fixture-key');
    assert.equal(options.body, undefined);
    return { status: 200, body: { cancel: async () => { discarded = true; } } };
  });
  assert.equal(calls, 1); assert.ok(discarded); assert.equal(report.usable, true);
  assert.equal(report.scope, 'one_read_only_billing_query_not_checkout_or_data_parity');
  assert.doesNotMatch(JSON.stringify(report), /private-fixture-key|subscriptions\?/);
});
test('missing credentials and foreign or insecure URLs refuse without network access', async () => {
  for (const config of [undefined, {}, { ...configuration, SUPABASE_SERVICE_ROLE_KEY: '' },
    { ...configuration, NEXT_PUBLIC_SUPABASE_URL: 'https://foreign.example' },
    { ...configuration, NEXT_PUBLIC_SUPABASE_URL: 'http://llehrhqeolfprutcaopi.supabase.co' }]) {
    const report = await checkSourceDatabase(config, () => { throw Error('network must not run'); });
    assert.equal(report.usable, false); assert.equal(report.reason, 'source_configuration_unavailable');
  }
});
test('544 and other failures remain failures without error text, rows or retry', async () => {
  for (const status of [401, 403, 429, 500, 503, 544]) {
    let calls = 0;
    const report = await checkSourceDatabase(configuration, async () => {
      calls++; return new Response('private-fixture-key private@example.com private-row', { status });
    });
    assert.equal(calls, 1); assert.equal(report.usable, false); assert.equal(report.status, status);
    assert.equal(report.reason, status === 544 ? 'database_timeout' : 'billing_query_failed');
    assert.doesNotMatch(JSON.stringify(report), /private-fixture|private@|private-row/);
  }
});
test('transport exceptions discard raw error text without retry', async () => {
  let calls = 0;
  const report = await checkSourceDatabase(configuration, async () => {
    calls++; throw Error('private-fixture-key private@example.com');
  });
  assert.equal(calls, 1); assert.equal(report.status, null); assert.equal(report.usable, false);
  assert.equal(report.reason, 'billing_query_failed_or_timed_out');
  assert.doesNotMatch(JSON.stringify(report), /private-fixture|private@/);
});
test('body disposal failures cannot claim a successful database probe', async () => {
  const report = await checkSourceDatabase(configuration, async () => ({ status: 200,
    body: { cancel: async () => { throw Error('private error'); } } }));
  assert.equal(report.usable, false); assert.equal(report.status, null);
});
test('actual CLI fails when public pages and logs pass but the database is unavailable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'localley-source-health-'));
  try {
    await writeFile(join(directory, '.env.local'), Object.entries(configuration).map(([k,v]) => `${k}=${v}`).join('\n'), { mode: 0o600 });
    const preload = `globalThis.fetch=async (url)=>{
      if(String(url).includes('supabase.co'))return new Response('private-fixture-key private-row',{status:544});
      if(String(url).endsWith('/script-settings'))return new Response(JSON.stringify({success:true,result:{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,invocation_logs:true,persist:true}}}}));
      if(String(url).includes('/telemetry/query'))return new Response(JSON.stringify({success:true,result:{run:{status:'COMPLETED'},events:{count:0,events:[]}}}));
      if(String(url).includes('/api/cities?'))return new Response(JSON.stringify({success:true,total:1,cities:[{slug:'seoul',spotCount:1,status:'beta'}]}));return new Response('ok');};`;
    const path = join(directory, 'report.json');
    const run = spawnSync(process.execPath, ['--import', 'data:text/javascript;base64,' + Buffer.from(preload).toString('base64'),
      resolve('scripts/check-production-health.mjs'), '--source-check', '--report', path],
    { cwd: directory, env: { ...process.env, CLOUDFLARE_API_TOKEN: 'private-cf-token' }, encoding: 'utf8' });
    assert.equal(run.status, 1, run.stderr);
    const report = JSON.parse(await readFile(path, 'utf8'));
    assert.ok(report.health.every(r => r.status === 200)); assert.equal(report.logs.available, true);
    assert.equal(report.sourceDatabase.usable, false); assert.equal(report.sourceDatabase.reason, 'database_timeout');
    assert.doesNotMatch(JSON.stringify(report) + run.stdout + run.stderr, /private-fixture|private-cf-token|private-row/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('installed unit opts into source checking from the stable app checkout', async () => {
  const unit = await readFile('ops/localley-user-health.service', 'utf8');
  assert.match(unit, /WorkingDirectory=\/home\/dev\/projects\/CyberLink\/apps\/Localley/);
  assert.match(unit, /ExecStart=.*check-production-health\.mjs --source-check/);
  assert.doesNotMatch(unit, /worktrees|SERVICE_ROLE_KEY/);
});
