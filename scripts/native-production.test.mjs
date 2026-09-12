import test from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN, TARGET, verifyTarget, prepareProductionBatch, ingestProduction, requestProduction, readProductionReview } from './native-production.mjs';

export function fixture(overrides = {}) {
  return { schemaVersion: 'localley-native-v1', citySlug: 'seoul', publicationReady: false,
    collection: { paidProviderCalls: 0 }, places: [{ kind: 'place', providerPlaceId: 'visit-seoul:73',
      citySlug: 'seoul', countryCode: 'KR', name: { en: 'Gyeongbokgung Palace' }, address: { en: '161 Sajik-ro, Seoul' },
      latitude: 37.5796, longitude: 126.977, verified: false, state: 'pending', issues: [], images: [],
      provenance: { sourceUrl: 'https://english.visitseoul.net/attractions/Palace_/73', observedAt: new Date(Date.now() - 60000).toISOString() },
      ...overrides }] };
}

test('exact explicit target and configured origin only', () => {
  assert.equal(verifyTarget(TARGET, ORIGIN), ORIGIN);
  for (const target of [undefined, '', 'preview']) assert.throws(() => verifyTarget(target, ORIGIN));
  for (const origin of [undefined, 'http://localhost:54321', ORIGIN + '/', ORIGIN.replace('llehr', 'wrong')]) assert.throws(() => verifyTarget(TARGET, origin));
});
test('wrong target fails before any request, including apply', async () => {
  let called = false;
  const options = { target: 'preview', origin: ORIGIN, key: 'test', apply: true, fetcher: () => { called = true; } };
  await assert.rejects(ingestProduction(prepareProductionBatch(fixture()), options));
  await assert.rejects(requestProduction('/rest/v1/', options));
  assert.equal(called, false);
});
test('dry run is default and makes no request', async () => {
  const result = await ingestProduction(prepareProductionBatch(fixture()), { target: TARGET, origin: ORIGIN, fetcher: () => assert.fail('network') });
  assert.equal(result.applied, false); assert.equal(result.publicationReady, false);
});
test('embedded wrong target is rejected before RPC', async () => {
  const batch = prepareProductionBatch(fixture());
  await assert.rejects(ingestProduction({ ...batch, p_target: 'preview' }, {
    target: TARGET, origin: ORIGIN, key: 'test', apply: true, fetcher: () => assert.fail('network'),
  }));
});
test('transport cannot read private accounts or write public spots', async () => {
  for (const [path, method] of [['/rest/v1/users', 'GET'], ['/rest/v1/spots', 'GET'], ['/rest/v1/spots', 'POST']]) {
    await assert.rejects(requestProduction(path, { target: TARGET, origin: ORIGIN, key: 'test', method,
      fetcher: () => assert.fail('network'),
    }), /unscoped/);
  }
});
test('incomplete or unapproved manifest is rejected during dry preparation', () => {
  assert.throws(() => prepareProductionBatch(fixture(), [{ identityApproved: false }]));
  assert.throws(() => prepareProductionBatch(fixture(), [{ sourceKey: 'english.visitseoul.net:visit-seoul:73', identityApproved: true }]));
});
test('apply uses one RPC and never a public table write', async () => {
  const calls = [];
  const result = await ingestProduction(prepareProductionBatch(fixture()), { target: TARGET, origin: ORIGIN, key: 'test', apply: true,
    fetcher: async (url, options) => { calls.push({ url, options }); return Response.json({ publicationReady: false }); } });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, ORIGIN + '/rest/v1/rpc/native_production_ingest');
  assert.equal(calls[0].options.method, 'POST'); assert.equal(calls[0].options.redirect, 'error'); assert.equal(result.publicationReady, false);
});
test('requires version, private state, and explicit zero paid calls', () => {
  for (const change of [{ schemaVersion: 'unknown' }, { publicationReady: true }, { collection: {} }, { collection: { paidProviderCalls: 1 } }]) {
    assert.throws(() => prepareProductionBatch({ ...fixture(), ...change }));
  }
});
test('rejects social, invalid source, coordinates, and stale evidence', () => {
  for (const change of [{ kind: 'social' }, { longitude: 37.5, latitude: 127 }, { images: [{ sourceUrl: 'https://evil.example/a' }] },
    { provenance: { sourceUrl: 'https://evil.example/a', observedAt: new Date().toISOString() } }]) assert.throws(() => prepareProductionBatch(fixture(change)));
});
test('dedupes newest and rejects equal-time divergent payloads in both orders', () => {
  const input = fixture(), row = input.places[0];
  const older = { ...row, provenance: { ...row.provenance, observedAt: new Date(Date.now() - 3600000).toISOString() } };
  const batch = prepareProductionBatch({ ...input, places: [row, older, row] });
  assert.equal(JSON.parse(batch.p_body).rows.length, 1);
  assert.equal(JSON.parse(JSON.parse(batch.p_body).rows[0].payload).provenance.observedAt, row.provenance.observedAt);
  const conflict = { ...row, name: { en: 'Different' } };
  for (const places of [[row, conflict], [conflict, row]]) assert.throws(() => prepareProductionBatch({ ...input, places }), /conflict/);
  assert.equal(batch.p_hash, prepareProductionBatch({ ...input, places: [row] }).p_hash);
});
test('all permutations reject conflicting older observations even when newest comes first', () => {
  const input = fixture(), a = input.places[0];
  const b = { ...a, name: { en: 'Conflicting older payload' } };
  const c = { ...a, provenance: { ...a.provenance, observedAt: new Date(Date.parse(a.provenance.observedAt) + 1000).toISOString() } };
  for (const places of [[a,b,c], [a,c,b], [b,a,c], [b,c,a], [c,a,b], [c,b,a]]) {
    assert.throws(() => prepareProductionBatch({ ...input, places }), /Equal observation conflict/);
  }
});
test('identical older duplicates preserve newest records and independent source identities in every order', () => {
  const input = fixture(), a = input.places[0], duplicate = structuredClone(a);
  const c = { ...a, name: { en: 'Newest payload' }, provenance: { ...a.provenance,
    observedAt: new Date(Date.parse(a.provenance.observedAt) + 1000).toISOString() } };
  const other = { ...a, providerPlaceId: 'visit-seoul:74', name: { en: 'Independent source' } };
  const expected = prepareProductionBatch({ ...input, places: [c,other] });
  for (const places of [[a,duplicate,c], [a,c,duplicate], [duplicate,a,c], [duplicate,c,a], [c,a,duplicate], [c,duplicate,a]]) {
    assert.deepEqual(prepareProductionBatch({ ...input, places: [...places,other] }), expected);
  }
});
test('binding UUID case is normalized before duplicate checks, hashing, and serialization without changing snapshots', () => {
  const input = fixture(), row = input.places[0];
  const id = 'abcdefab-1111-4111-8111-111111111abc';
  const mapping = { sourceKey: 'english.visitseoul.net:visit-seoul:73', spotId: id, identityApproved: true,
    sourceDomain: 'english.visitseoul.net', sourceUrl: row.provenance.sourceUrl,
    expected: { name: row.name, address: row.address, location: 'EXACT', google_place_id: null,
      destination_id: 'ABCDEFAB-2222-4222-8222-222222222ABC', local_area_id: null } };
  const upper = { ...mapping, spotId: id.toUpperCase() };
  const lowerBatch = prepareProductionBatch(input, [mapping]);
  assert.deepEqual(prepareProductionBatch(input, [upper]), lowerBatch);
  const stored = JSON.parse(lowerBatch.p_body).mappings[0];
  assert.equal(stored.spotId, id);
  assert.deepEqual(stored.expected, upper.expected);
  assert.equal(upper.spotId, id.toUpperCase());
  const other = { ...row, providerPlaceId: 'visit-seoul:74' };
  for (const mappings of [[mapping, { ...upper, sourceKey: 'english.visitseoul.net:visit-seoul:74' }],
    [upper, { ...mapping, sourceKey: 'english.visitseoul.net:visit-seoul:74' }]]) {
    assert.throws(() => prepareProductionBatch({ ...input, places: [row,other] }, mappings), /identity manifest/);
  }
});
test('review fails closed on missing schema', async () => {
  await assert.rejects(readProductionReview(fixture(), { target: TARGET, origin: ORIGIN, key: 'test', fetcher: async () => Response.json({}) }), /schema/);
});
test('review rejects any name outside the thirteen-name scope before network', async () => {
  await assert.rejects(readProductionReview(fixture({ name: { en: 'Unrelated venue' } }), {
    target: TARGET, origin: ORIGIN, key: 'test', fetcher: () => assert.fail('network'),
  }), /thirteen/);
});
test('review queries only exact official name and Seoul with explicit public metadata columns', async () => {
  const queries = [];
  const expected = { id: 'uuid', name: 'jsonb', address: 'jsonb', location: 'public.geography(Point,4326)', google_place_id: 'text', destination_id: 'uuid', local_area_id: 'uuid' };
  const report = await readProductionReview(fixture(), { target: TARGET, origin: ORIGIN, key: 'test', fetcher: async url => {
    queries.push(url);
    return Response.json(queries.length === 1 ? { definitions: { spots: { properties: Object.fromEntries(Object.entries(expected).map(([k, format]) => [k, { format }])) }, geo_destinations: {}, geo_local_areas: {} } } : [{ id: 'review-only' }]);
  } });
  const query = new URL(queries[1]);
  assert.equal(query.searchParams.get('name->>en'), 'eq.Gyeongbokgung Palace');
  assert.equal(query.searchParams.get('address->>en'), 'ilike.*Seoul*');
  assert.equal(query.searchParams.get('select').includes('discovered_by'), false);
  assert.equal(report.matches[0].state, 'unreviewed');
});
