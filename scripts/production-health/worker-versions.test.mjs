import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { summarizeWorkerVersions } from './worker-versions.mjs';

const from = Date.parse('2026-10-17T00:00:00Z'), window = { from, to: from + 86400000 };
const old = '2c328128-27cd-44dd-be51-e1d0dec9e91d';
const current = '3132337f-a1bc-4ff5-a780-bdbe7a65e557';
const event = (id, timestamp = from) => ({ timestamp, $workers: { scriptVersion: { id } } });

test('retains multiple versions, exact event totals and timestamp bounds without deduplication', () => {
  const result = summarizeWorkerVersions([event(old, from + 20), event(current), event(old, from + 10)], window);
  assert.deepEqual(result.versions.map(x => [x.versionId, x.count]), [[old, 2], [current, 1]]);
  assert.equal(result.versions[0].eventTimes.firstSeen, new Date(from + 10).toISOString());
  assert.equal(result.versions[0].eventTimes.lastSeen, new Date(from + 20).toISOString());
  assert.equal(result.totalEvents, 3);
  assert.equal(result.scope, 'returned_events_only');
  assert.equal(result.attribution, 'provider_script_version_only');
  assert.equal(result.unknownVersionEvents, 0);
  assert.equal(result.omittedEvents, 0);
});
test('malformed and absent provider IDs stay unknown; other fields cannot supply a version', () => {
  const hostile = [null, undefined, {}, [], 12, 'PRIVATEBYTES', old + '?PRIVATEBYTES', ' ' + old, old.slice(0, -1)];
  const events = hostile.map(id => ({ ...event(id), $metadata: { version: current, message: current }, versionId: current }));
  events.push({ timestamp: from, $workers: { scriptVersion: current } }, null);
  const result = summarizeWorkerVersions(events, window);
  assert.equal(result.versions.length, 1);
  assert.equal(result.versions[0].versionId, null);
  assert.equal(result.unknownVersionEvents, events.length);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATEBYTES|3132337f/);
});
test('UUID case normalizes, invalid event times remain unknown, and empty input stays empty', () => {
  const result = summarizeWorkerVersions([event(old.toUpperCase(), 'PRIVATEBYTES'), event(old, window.to + 1)], window);
  assert.equal(result.versions[0].versionId, old);
  assert.equal(result.versions[0].count, 2);
  assert.equal(result.versions[0].eventTimes.unknownCount, 2);
  assert.equal(result.versions[0].eventTimes.firstSeen, null);
  assert.deepEqual(summarizeWorkerVersions([], window).versions, []);
});
test('bounded version output accounts for every omitted event and is stable across input order', () => {
  const events = Array.from({ length: 23 }, (_, i) => event(`${i.toString(16).padStart(8, '0')}-1234-5678-9abc-123456789abc`));
  events.push(event(undefined), event(undefined));
  const result = summarizeWorkerVersions(events, window);
  assert.equal(result.versions.length, 20);
  assert.equal(result.unknownVersionEvents, 2);
  assert.equal(result.omittedEvents, 4);
  assert.equal(result.versions.reduce((n, x) => n + x.count, result.omittedEvents), events.length);
  assert.deepEqual(result, summarizeWorkerVersions(events.reverse(), window));
});
test('actual CLI preserves route/class/status counts and coverage while adding private-safe version evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'localley-worker-versions-'));
  try {
    const preload = `globalThis.fetch=async(url,options)=>{
      if(String(url).endsWith('/script-settings')) return new Response(JSON.stringify({success:true,result:{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,invocation_logs:true,persist:true}}}}));
      if(String(url).includes('/telemetry/query')){
        const q=JSON.parse(options.body);const ids=${JSON.stringify([old, current, 'PRIVATEBYTES', null])};
        const events=ids.map((id,i)=>({timestamp:q.timeframe.to-i*1000,$metadata:{service:'localley-next',url:'https://www.localley.io/dashboard?token=PRIVATEBYTES',message:'Network connection lost.',version:'PRIVATEBYTES'},$workers:{scriptVersion:{id},event:{response:{status:i===0?502:undefined},request:{headers:{cookie:'PRIVATEBYTES'}}}}}));
        return new Response(JSON.stringify({success:true,result:{run:{status:'COMPLETED'},statistics:{abr_level:10},events:{count:4,events}}}));
      }
      if(String(url).includes('/api/cities?'))return new Response(JSON.stringify({success:true,total:1,cities:[{slug:'seoul',spotCount:1,status:'beta'}]}));return new Response('ok');};`;
    const path = join(directory, 'report.json');
    const run = spawnSync(process.execPath, ['--import', 'data:text/javascript;base64,' + Buffer.from(preload).toString('base64'), 'scripts/check-production-health.mjs', '--report', path], { env: { ...process.env, CLOUDFLARE_API_TOKEN: 'fixture-token' }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(report.logs.observedEvents, 4);
    assert.equal(report.logs.top5.reduce((n, x) => n + x.count, 0), 4);
    assert.deepEqual(report.logs.errorClasses, [{ errorClass: 'network_connection_lost', message: 'Network connection lost', count: 4, statuses: { '502': 1, unknown: 3 } }]);
    assert.equal(report.logs.workerVersions.unknownVersionEvents, 2);
    assert.equal(report.logs.workerVersions.versions.reduce((n, x) => n + x.count, 0), 4);
    const byVersion = new Map(report.logs.workerVersions.versions.map(v => [v.versionId, v]));
    assert.equal(byVersion.get(old).top5[0].status, 502);
    assert.equal(byVersion.get(current).top5[0].status, null);
    assert.equal(byVersion.get(null).top5[0].count, 2);
    for (const version of byVersion.values()) {
      assert.equal(version.top5.reduce((n, group) => n + group.count, version.omittedErrorEvents), version.count);
      assert.ok(version.top5.every(group => group.path === '/dashboard' && group.errorClass === 'network_connection_lost'));
    }
    assert.equal(report.logs.querySampling.abrLevel, 10);
    assert.ok(report.logs.coverageWarnings.includes('query_sampled'));
    assert.equal(report.logs.countingUnit, 'log_events_not_requests_or_users');
    assert.doesNotMatch(JSON.stringify(report) + run.stdout, /PRIVATEBYTES|fixture-token/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('per-version rankings bound five groups, account for omitted events and keep versions separate', () => {
  const groups = Array.from({length: 7}, (_, i) => ({versionId: old, path: '/route-' + i,
    errorClass: 'server_error_unclassified', message: 'Server error', status: 503, count: i + 1,
    eventTimes: {}, privateExtra: 'PRIVATEBYTES'}));
  groups.push({versionId: current, path: '/current', errorClass: 'network_connection_lost',
    message: 'Network connection lost', status: null, count: 2, eventTimes: {}});
  const events = groups.flatMap(group => Array.from({length: group.count}, () => event(group.versionId)));
  const result = summarizeWorkerVersions(events, window, groups);
  const previous = result.versions.find(v => v.versionId === old);
  assert.equal(previous.top5.length, 5);
  assert.deepEqual(previous.top5.map(g => g.count), [7,6,5,4,3]);
  assert.equal(previous.omittedErrorEvents, 3);
  assert.equal(result.versions.find(v => v.versionId === current).top5[0].path, '/current');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATEBYTES|privateExtra/);
  assert.deepEqual(result, summarizeWorkerVersions(events.reverse(), window, groups.reverse()));
});
test('a missing version classification fails visibly instead of silently dropping errors', () => {
  assert.throws(() => summarizeWorkerVersions([event(old)], window, []), /version_error_count_mismatch/);
});
