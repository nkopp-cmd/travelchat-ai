import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceAvailability, sourceAvailabilityInventory } from './source-availability.mjs';
const credentials = { sourceUrl: 'https://llehrhqeolfprutcaopi.supabase.co', sourceKey: 'private-test-key' };
const response = (body, status = 200, range = '*/5') => new Response(JSON.stringify(body), { status, headers: { 'Content-Range': range } });
test('reads only bounded zero-row exact counts without certifying physical schema', async () => {
  const result = await sourceAvailability('users', credentials, async (url, init) => {
    assert.equal(url, credentials.sourceUrl + '/rest/v1/users?select=*&limit=0');
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.headers.Prefer, 'count=exact');
    return response([], 200, '*/0');
  });
  assert.deepEqual(result, { table: 'users', state: 'available', status: 200, count: 0, physicalState: 'not_audited' });
});
test('missing Data API and denied access keep counts unknown and exclude provider error bodies', async () => {
  for (const status of [401,403,404,500]) {
    const result = await sourceAvailability('notifications', credentials, async () => response({ code: 'PGRST205', message: 'private-test-key' }, status));
    assert.equal(result.count, null); assert.equal(result.physicalState, 'not_audited');
    assert.equal(result.state, status === 404 ? 'unavailable_in_data_api' : [401,403].includes(status) ? 'access_denied' : 'unavailable');
    assert(!JSON.stringify(result).includes('private-test-key'));
  }
});
test('rejects uncertain counts, row bodies, malformed and oversized replies', async () => {
  for (const [body, range] of [[[], '*/01'], [[], '*/9007199254740992'], [[], '0-0/5'], [[{ id: 'unexpected' }], '*/5'], [{}, '*/5']]) {
    assert.equal((await sourceAvailability('users', credentials, async () => response(body, 200, range))).state, 'invalid_count_response');
  }
  for (const body of ['{', 'x'.repeat(65537)]) {
    assert.equal((await sourceAvailability('users', credentials, async () => new Response(body, { headers: { 'Content-Range': '*/5' } }))).state, 'invalid_count_response');
  }
});
test('rejects foreign origins and unsafe resource names before HTTP', async () => {
  let calls = 0; const request = async () => { calls++; return response([]); };
  for (const table of ['users/../../', 'users?select=email', '']) await assert.rejects(sourceAvailability(table, credentials, request));
  await assert.rejects(sourceAvailability('users', { ...credentials, sourceUrl: 'https://foreign.test' }, request));
  assert.equal(calls, 0);
});
test('reports request failure without leaking exception text', async () => {
  const result = await sourceAvailability('users', credentials, async () => { throw Error('private-test-key'); });
  assert.equal(result.state, 'request_failed'); assert.equal(result.count, null); assert(!JSON.stringify(result).includes(credentials.sourceKey));
});
test('requires a real readable spot control before querying other resources', async () => {
  const calls = [];
  await assert.rejects(sourceAvailabilityInventory({ resources: { 'table:spots': [], 'table:users': [] } }, credentials, async url => { calls.push(url); return response([], 403); }), /control/);
  assert.equal(calls.length, 1);
});
test('covers derived tables once with bounded concurrency and explicit unknown states', async () => {
  const names = ['spots','users','notifications','messages','conversations','subscriptions','saved_spots'];
  let active = 0, peak = 0; const seen = [];
  const result = await sourceAvailabilityInventory({ resources: Object.fromEntries(names.map(name => ['table:' + name, []])), sourceDigest: 'digest', checkoutPolicy: 'git_tracked_source' }, credentials, async url => {
    const table = new URL(url).pathname.split('/').at(-1); seen.push(table); peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return table === 'notifications' ? response({ code: 'PGRST205' }, 404) : response([], 200, table === 'spots' ? '*/3295' : '*/0');
  });
  assert.equal(peak, 4); assert.equal(new Set(seen).size, 7); assert.equal(seen.length, 7);
  assert.equal(result.summary.available, 6); assert.equal(result.summary.unavailable_in_data_api, 1);
  assert.equal(result.cutoverReady, false); assert.equal(result.readOnly, true);
  assert(result.tables.every(row => row.physicalState === 'not_audited'));
});
