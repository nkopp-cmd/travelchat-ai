import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLogDelivery, validLogProbe } from './log-delivery.mjs';
const now = Date.parse('2026-10-18T02:00:00Z');
const nonce = '11111111~1111~4111~8111~111111111111';
const version = '38d2d7e6-40ea-48df-9783-24a0a121ad10';
const probe = { version: 1, startedAt: now - 60000, status: 200,
  url: 'https://www.localley.io/api/cities?noCache=true&includeHidden=true&healthCanary=' + encodeURIComponent(nonce).replaceAll('~', '%7E') };
const event = () => ({ timestamp: probe.startedAt + 100, $metadata: { service: 'localley-next',
  type: 'cf-worker-event', statusCode: 200, requestId: 'PRIVATE_REQUEST_ID' },
  $workers: { outcome: 'ok', scriptVersion: { id: version }, event: { request: { method: 'GET', url: probe.url } } },
  private: 'PRIVATE_PAYLOAD' });
const envelope = events => ({ success: true, result: { run: { status: 'COMPLETED' }, events: { events } } });
const run = (events, options = {}) => checkLogDelivery('PRIVATE_TOKEN', probe,
  { now, fetchImpl: async () => Response.json(envelope(events)), ...options });

test('confirms the exact previous controlled invocation without exposing its URL, marker or private fields', async () => {
  let calls = 0;
  const result = await run([event()], { fetchImpl: async (url, options) => {
    calls++; assert.match(url, /^https:\/\/api.cloudflare.com\/client\/v4\/accounts\/664f242340bcec2f32daaeee15f58bde\/workers\/observability\/telemetry\/query$/);
    const query = JSON.parse(options.body);
    assert.equal(query.limit, 20); assert.equal(query.view, 'events');
    assert.equal(query.parameters.filters.find(x => x.key === '$workers.event.request.url').value, probe.url);
    assert.deepEqual(query.timeframe, { from: probe.startedAt - 1000, to: now });
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(envelope([event()]));
  } });
  assert.equal(calls, 1); assert.equal(result.confirmed, true); assert.equal(result.versionId, version);
  assert.equal(result.completeCoverage, false); assert.equal(result.scope, 'one_previous_controlled_catalog_request');
  assert.equal(result.ageSeconds, 60); assert.equal(result.matchedInvocations, 1);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|healthCanary|11111111|localley\.io/);
});
test('requires every provider identity, method, outcome, time and status boundary', async () => {
  const changes = [e => e.$metadata.service = 'other', e => e.$metadata.type = 'cf-worker',
    e => e.$workers.event.request.url = probe.url + '&secret=PRIVATE', e => e.$workers.scriptVersion.id = 'PRIVATE',
    e => e.$workers.outcome = 'exception', e => e.$workers.event.request.method = 'POST',
    e => e.$metadata.statusCode = 503, e => e.$workers.event.response = { status: 503 },
    e => e.timestamp = probe.startedAt - 1001, e => e.timestamp = now + 1,
    e => delete e.$metadata.statusCode, e => e.timestamp = 'PRIVATE'];
  for (const change of changes) { const row = event(); change(row); assert.equal((await run([row])).confirmed, false); }
});
test('refuses redacted, missing and differently encoded URLs despite otherwise matching metadata', async () => {
  for (const url of [undefined, probe.url.replace(/healthCanary=.*/, 'healthCanary=REDACTED'),
    probe.url.replaceAll('%7E', '~')]) {
    const row = event(); row.$workers.event.request.url = url; row.$metadata.url = probe.url;
    assert.equal((await run([row])).confirmed, false);
  }
});
test('does not infer provider version from other metadata or accept conflicting invocation versions', async () => {
  const row = event(); delete row.$workers.scriptVersion; row.versionId = version; row.$metadata.version = version;
  assert.equal((await run([row])).confirmed, false);
  const other = event(); other.$workers.scriptVersion.id = '037dee7f-555b-45f3-89cd-44174301f6d5';
  assert.equal((await run([event(), other])).confirmed, false);
});
test('accepts a matching response status when metadata status is absent and normalizes version case', async () => {
  const row = event(); delete row.$metadata.statusCode; row.$workers.event.response = { status: 200 };
  row.$workers.scriptVersion.id = version.toUpperCase(); assert.equal((await run([row])).versionId, version);
});
test('empty, sampled-away or delayed results stay unconfirmed, never healthy absence', async () => {
  const result = await run([]); assert.equal(result.confirmed, false); assert.equal(result.completeCoverage, false);
  assert.equal(result.reason, 'matching_invocation_not_observed');
});
test('rejects incomplete, malformed or unbounded provider results without retaining raw failures', async () => {
  const invalid = [{ success: false, errors: ['PRIVATE'] }, { ...envelope([]), errors: ['PRIVATE'] },
    { success: true, result: { run: { status: 'RUNNING' } } }, envelope(null), envelope(Array(21).fill(event()))];
  for (const data of invalid) {
    const result = await run([], { fetchImpl: async () => Response.json(data) });
    assert.equal(result.reason, 'query_unavailable'); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  }
  const failed = await run([], { fetchImpl: async () => { throw Error('PRIVATE'); } });
  assert.equal(failed.reason, 'query_unavailable'); assert.doesNotMatch(JSON.stringify(failed), /PRIVATE/);
});
test('cancels a refused provider response and never parses its private body', async () => {
  const response = new Response('PRIVATE', { status: 403 });
  const result = await run([], { fetchImpl: async () => response });
  assert.equal(result.reason, 'query_unavailable'); assert.equal(response.body.locked, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});
test('invalid, foreign, secret-bearing, future and expired probes make zero provider calls', async () => {
  const invalid = [null, [], {}, { ...probe, startedAt: now + 1 }, { ...probe, startedAt: now - 48 * 3600000 - 1 },
    { ...probe, status: 503 }, { ...probe, secret: 'PRIVATE' }, { ...probe, url: probe.url.replace('www.localley.io', 'evil.test') },
    { ...probe, url: probe.url + '&token=PRIVATE' }, { ...probe, url: probe.url + '&noCache=true' },
    { ...probe, url: probe.url.replace('11111111%7E', 'PRIVATE%7E') }, { ...probe, url: probe.url.replace('https:', 'http:') },
    { ...probe, url: probe.url + '#PRIVATE' }, { ...probe, url: probe.url.replace('/api/cities', '/api/notifications') }];
  let calls = 0;
  for (const row of invalid) { const result = await checkLogDelivery('PRIVATE', row, { now,
    fetchImpl: async () => { calls++; throw Error('must not call'); } }); assert.equal(result.confirmed, false); }
  assert.equal(calls, 0); assert.equal(validLogProbe(probe, now), true);
});

test('actual CLI stages a private probe then confirms its next-run event without changing uptime or exposing the marker', async () => {
  const { mkdtemp, readFile, rm, stat, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const directory = await mkdtemp(join(tmpdir(), 'localley-log-delivery-'));
  try {
    const path = join(directory, 'report.json');
    const preloader = `globalThis.fetch=async (url,options)=>{
      if(String(url).endsWith('/script-settings'))return Response.json({success:true,result:{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,invocation_logs:true,persist:true}}}});
      if(String(url).includes('/telemetry/query')){
        const q=JSON.parse(options.body);let events=[];
        if(q.queryId==='localley-controlled-log-delivery')events=[{timestamp:q.timeframe.from+1000,
          $metadata:{service:'localley-next',type:'cf-worker-event',statusCode:200},
          $workers:{outcome:'ok',scriptVersion:{id:'${version}'},event:{request:{method:'GET',url:q.parameters.filters.find(x=>x.key==='$workers.event.request.url').value}}},private:'PRIVATE_PAYLOAD'}];
        return Response.json({success:true,result:{run:{status:'COMPLETED'},statistics:{abr_level:1},events:{count:events.length,events}}});
      }
      if(String(url).includes('/api/cities?'))return Response.json({success:true,total:1,cities:[{slug:'seoul',spotCount:150,status:'recommended',name:'PRIVATE_CITY'}]});
      return new Response('ok');};`;
    const cli = () => spawnSync(process.execPath, ['--import', 'data:text/javascript;base64,' + Buffer.from(preloader).toString('base64'),
      'scripts/check-production-health.mjs', '--report', path], { env: { ...process.env, CLOUDFLARE_API_TOKEN: 'PRIVATE_TOKEN' }, encoding: 'utf8' });
    let result = cli(); assert.equal(result.status, 0, result.stderr);
    const first = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(first.loggingCanary.reason, 'no_previous_probe');
    const pending = JSON.parse(await readFile(path + '.logging-probe.json', 'utf8'));
    assert.equal(validLogProbe(pending), true); assert.equal((await stat(path + '.logging-probe.json')).mode & 0o777, 0o600);
    result = cli(); assert.equal(result.status, 0, result.stderr);
    const second = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(second.loggingCanary.confirmed, true); assert.equal(second.loggingCanary.versionId, version);
    assert.deepEqual(second.health, first.health); assert.deepEqual(second.logs, first.logs);
    assert.ok(second.ingestionSettings.coverageWarnings.includes('ingestion_delivery_not_proven'));
    const next = JSON.parse(await readFile(path + '.logging-probe.json', 'utf8'));
    assert.notEqual(next.url, pending.url);
    assert.doesNotMatch(JSON.stringify(second) + result.stdout, /PRIVATE|healthCanary/);
    assert.equal((await readdir(directory)).filter(x => x.includes('.next-')).length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
