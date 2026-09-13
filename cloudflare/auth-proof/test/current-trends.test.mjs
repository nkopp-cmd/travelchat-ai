import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

test('native D1 current trends enforce reviewed identity, freshness and bounded data', async t => {
  const compiled = await build({ stdin: { contents: `import { currentTrends } from './src/current-trends.ts'; export default { fetch(r,e) { return currentTrends(r,e,Number(r.headers.get('x-test-now'))); } };`,
    resolveDir: process.cwd(), sourcefile: 'synthetic-trends-fixture.ts' }, bundle: true, write: false, format: 'esm', platform: 'browser' });
  const state = await mkdtemp(join(tmpdir(), 'localley-trends-fixture-'));
  const mf = new Miniflare({ workers: [{ config: { name: 'current-trends-fixture', type: 'worker', compatibilityDate: '2026-09-07',
    manifest: { mainModule: 'fixture.mjs', modulesRoot: resolve('test'), modules: { 'fixture.mjs': { type: 'esm', contents: compiled.outputFiles[0].text } } },
    env: { DB: { type: 'd1', id: 'current-trends-fixture', dev: { remote: false } } } },
    dev: { outboundService: { type: 'fetcher', handler: () => { throw new Error('No outbound requests allowed'); } } } }],
    resourcePersistencePath: state, resourceTmpPath: state, telemetry: { enabled: false }, cf: false, logRequests: false, unsafeLocalExplorer: false });
  try {
    const db = await mf.getD1Database('DB');
    await db.exec(await readFile('migrations/0008_current_trends.sql', 'utf8'));
    const review = JSON.parse(await readFile('pilot/channel-trends.json', 'utf8'));
    const observedAt = '2026-09-12T12:00:00.000Z', expiresAt = '2026-09-13T12:00:00.000Z';
    const payload = { version: 'localley-visible-trends-v1', reviewId: review.reviewId, citySlug: 'tokyo', weekStart: '2026-09-07', observedAt, expiresAt,
      sourceEntries: 15, excludedEntries: 14, unreviewedEntries: 0, coverage: review.coverage, rankings: [{ rank: 1, spotId: review.spotId,
        name: review.venueName, address: review.venueAddress, lat: review.latitude, lng: review.longitude,
        venueUrl: `https://localley.io/spots/${review.spotId}`, postCount: 1, summary: review.displaySummary,
        source: { platform: 'youtube', kind: 'venue_owned_channel', label: review.channelLabel, channelId: review.channelId,
          ownerUrl: review.ownerUrl, feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${review.channelId}`,
          videoId: review.videoId, url: `https://www.youtube.com/watch?v=${review.videoId}`, title: 'SYNTHETIC test observation, not live evidence',
          publishedAt: review.publishedAt, metrics: { views: 100, likes: null, comments: null, shares: null, saves: null }, bodySha256: 'a'.repeat(64) } }] };
    const write = async value => db.prepare('INSERT OR REPLACE INTO native_current_trends VALUES (?,?,?,?,?,?)')
      .bind('tokyo', value.weekStart, Date.parse(value.observedAt), Date.parse(value.expiresAt), value.reviewId, JSON.stringify(value)).run();
    const call = (now = '2026-09-12T13:00:00Z', query = '') => mf.dispatchFetch(`https://local.test/api/trends/current${query}`, { headers: { 'x-test-now': String(Date.parse(now)) } });
    await t.test('empty means no accepted snapshot, not invented rankings', async () => {
      const response = await call(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual((await response.json()).rankings, []);
    });
    await t.test('accepted snapshot preserves nulls and provides server freshness time', async () => {
      await write(payload); const response = await call(); const data = await response.json();
      assert.equal(response.status, 200); assert.equal(data.status, 'ready'); assert.equal(data.serverNow, '2026-09-12T13:00:00.000Z');
      assert.deepEqual(data.rankings[0].source.metrics, payload.rankings[0].source.metrics);
    });
    await t.test('expiry, week rollover and future snapshots cannot appear current', async () => {
      assert.equal((await (await call(expiresAt)).json()).status, 'unready');
      assert.equal((await (await call('2026-09-14T00:00:00Z')).json()).status, 'unready');
      assert.equal((await call('2026-09-12T11:00:00Z')).status, 503);
    });
    await t.test('unknown city and selector parameters fail closed', async () => {
      for (const query of ['?city=seoul', '?city=tokyo&city=tokyo', '?ownerId=other']) assert.equal((await call(undefined, query)).status, 400);
    });
    const mutations = [
      ['review', value => { value.reviewId = 'unreviewed'; }],
      ['identity', value => { value.rankings[0].spotId = '00000000-0000-4000-8000-000000000001'; }],
      ['coordinate', value => { value.rankings[0].lat = 37.5; }],
      ['source channel', value => { value.rankings[0].source.channelId = `UC${'b'.repeat(22)}`; }],
      ['unsafe link', value => { value.rankings[0].source.url = 'javascript:alert(1)'; }],
      ['invented like count', value => { value.rankings[0].source.metrics.likes = 7; }],
      ['missing views', value => { value.rankings[0].source.metrics.views = null; }],
      ['wrong publication time', value => { value.rankings[0].source.publishedAt = '2026-09-08T00:00:00Z'; }],
      ['extra source', value => { value.rankings.push(structuredClone(value.rankings[0])); }],
    ];
    for (const [name, mutate] of mutations) await t.test(`corrupt ${name} never produces a visible ranking`, async () => {
      const changed = structuredClone(payload); mutate(changed); await write(changed); assert.equal((await call()).status, 503);
    });
    await t.test('database rejects oversized payload and extended expiry', async () => {
      await assert.rejects(write({ ...payload, coverage: 'x'.repeat(65537) }));
      await assert.rejects(write({ ...payload, expiresAt: '2026-09-14T12:00:00Z' }));
    });
  } finally { await mf.dispose(); await rm(state, { recursive: true, force: true }); }
});
