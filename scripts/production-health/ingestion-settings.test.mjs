import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditIngestionSettings, summarizeIngestionSettings } from './ingestion-settings.mjs';

const fixture = () => ({ observability: { enabled: true, head_sampling_rate: 1,
  logs: { enabled: true, head_sampling_rate: 1, invocation_logs: true, persist: true } } });
const reply = result => new Response(JSON.stringify({ success: true, result }));

test('allowlists configured flags while retaining the ingestion limitation', () => {
  const raw = fixture(); raw.bindings = [{ secret: 'private-token' }]; raw.observability.logs.destinations = ['private@example.com'];
  const report = summarizeIngestionSettings(raw);
  assert.equal(report.available, true); assert.equal(report.usable, true);
  assert.equal(report.scope, 'current_configuration_only');
  assert.deepEqual(report.configuration, { enabled: true, headSamplingRate: 1, logsEnabled: true,
    logSamplingRate: 1, invocationLogs: true, persist: true });
  assert.deepEqual(report.coverageWarnings, ['ingestion_delivery_not_proven']);
  assert.doesNotMatch(JSON.stringify(report), /private|bindings|destinations/);
});
test('disabled flags and zero rates cannot yield a usable logging gate', () => {
  for (const field of ['enabled', 'logs.enabled', 'logs.invocation_logs', 'logs.persist']) {
    const raw = fixture(); const [first, second] = field.split('.');
    if (second) raw.observability[first][second] = false; else raw.observability[first] = false;
    const report = summarizeIngestionSettings(raw);
    assert.equal(report.usable, false); assert.ok(report.coverageWarnings.some(x => x.endsWith('_disabled')));
  }
  const raw = fixture(); raw.observability.logs.head_sampling_rate = 0;
  assert.equal(summarizeIngestionSettings(raw).usable, false);
});
test('sampled configurations retain exact rates and do not claim full coverage', () => {
  const raw = fixture(); raw.observability.head_sampling_rate = 0.5; raw.observability.logs.head_sampling_rate = 0.1;
  const report = summarizeIngestionSettings(raw);
  assert.equal(report.usable, true); assert.equal(report.configuration.headSamplingRate, 0.5);
  assert.equal(report.configuration.logSamplingRate, 0.1);
  assert.deepEqual(report.coverageWarnings, ['ingestion_delivery_not_proven', 'ingestion_sampling_configured']);
});
test('documented optional rate defaults require recognized configuration objects', () => {
  const raw = fixture(); delete raw.observability.head_sampling_rate; delete raw.observability.logs.head_sampling_rate;
  assert.equal(summarizeIngestionSettings(raw).configuration.headSamplingRate, 1);
  assert.equal(summarizeIngestionSettings(raw).configuration.logSamplingRate, 1);
  for (const malformed of [null, {}, { observability: [] }, { observability: { enabled: true } }]) {
    assert.equal(summarizeIngestionSettings(malformed).available, false);
  }
});
test('missing or hostile flags/rates remain unknown without echoing payloads', () => {
  for (const value of [undefined, 'private-token', {}, [], NaN, Infinity, -1, 2]) {
    const raw = fixture(); raw.observability.logs.enabled = value;
    if (value !== undefined) raw.observability.head_sampling_rate = value;
    const report = summarizeIngestionSettings(raw);
    assert.equal(report.configuration.logsEnabled, null); assert.equal(report.usable, false);
    if (value !== undefined) assert.equal(report.configuration.headSamplingRate, null);
    assert.ok(report.coverageWarnings.includes('logging_configuration_incomplete'));
    assert.doesNotMatch(JSON.stringify(report), /private-token/);
  }
});
test('audits only the pinned production settings endpoint with bounded read options', async () => {
  const report = await auditIngestionSettings('fixture-token', async (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/664f242340bcec2f32daaeee15f58bde/workers/scripts/localley-next/script-settings');
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal); return reply(fixture());
  });
  assert.equal(report.usable, true); assert.doesNotMatch(JSON.stringify(report), /fixture-token/);
});
test('unavailable, failed, malformed and oversized settings never expose provider content', async () => {
  let calls = 0;
  assert.equal((await auditIngestionSettings('', () => { calls++; })).available, false); assert.equal(calls, 0);
  for (const request of [
    async () => { throw Error('private-token'); },
    async () => new Response('private-token', { status: 403 }),
    async () => new Response('private-token'),
    async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'private-token' }] })),
    async () => new Response(JSON.stringify({ success: true, result: fixture(), errors: [{ message: 'private-token' }] })),
    async () => new Response(JSON.stringify({ success: true, result: fixture(), errors: 'private-token' })),
    async () => new Response(' '.repeat(65537) + JSON.stringify({ success: true, result: fixture() })),
  ]) {
    const report = await auditIngestionSettings('fixture-token', request);
    assert.equal(report.available, false); assert.equal(report.usable, false);
    assert.doesNotMatch(JSON.stringify(report), /private-token/);
  }
});
test('daily CLI persists failed configuration, preserves event coverage and exits nonzero', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'localley-settings-test-'));
  try {
    const preloader = `globalThis.fetch = async url => {
      if (String(url).endsWith('/script-settings')) return new Response(JSON.stringify({success:true,result:{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:false,head_sampling_rate:1,invocation_logs:true,persist:true},bindings:[{secret:'private-token'}]}}}));
      if (String(url).includes('/telemetry/query')) return new Response(JSON.stringify({success:true,result:{run:{status:'COMPLETED'},statistics:{abr_level:1},events:{count:0,events:[]}}}));
      if(String(url).includes('/api/cities?'))return new Response(JSON.stringify({success:true,total:1,cities:[{slug:'seoul',spotCount:150,status:'recommended'}]}));return new Response('ok');
    };`;
    const path = join(dir, 'report.json');
    const run = spawnSync(process.execPath, ['--import', 'data:text/javascript;base64,' + Buffer.from(preloader).toString('base64'),
      'scripts/check-production-health.mjs', '--report', path], { env: { ...process.env, CLOUDFLARE_API_TOKEN: 'fixture-token' }, encoding: 'utf8' });
    assert.equal(run.status, 1, run.stderr);
    const report = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(report.ingestionSettings.usable, false); assert.ok(report.ingestionSettings.coverageWarnings.includes('logs_disabled'));
    assert.equal(report.logs.available, true); assert.equal(report.logs.observedEvents, 0);
    assert.equal(report.logs.rankingScope, 'returned_events_only');
    assert.ok(report.logs.coverageWarnings.includes('ingestion_sampling_not_audited'));
    assert.deepEqual(report.health.map(x => x.status), [200,200,200]);
    assert.doesNotMatch(JSON.stringify(report) + run.stdout, /private-token|fixture-token/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
