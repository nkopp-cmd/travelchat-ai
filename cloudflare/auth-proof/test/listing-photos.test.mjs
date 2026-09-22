import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const spot = 'cbd403a4-1912-45b8-8ae1-fc13b4c2f1e5', far = '0041a575-c6fd-4a7e-b9c3-56cc50e201d6';
const bare = '0ec5db76-1250-482b-b780-33009930854b', hidden = '7f258ce1-b46c-4ab7-96ce-02a5fe5d6b67';
const place = 'ChIJod7tSseifDUR9hXHLFNGMIs', farPlace = 'ChIJnwNS1oKifDURA3ZlINZqXew';
const photo = n => `places/${place}/photos/Ref${n}`;
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1]);
const gif = new TextEncoder().encode('GIF89a-not-allowed-here');

test('listing photos verify identity, fail closed and never act as an open proxy', async t => {
  const compiled = await build({ stdin: { contents: `import { listingGallery, listingGalleryPath, listingPhoto } from './src/listing-photos.ts';
    const limiter = (mode, real) => mode === 'missing' ? undefined : mode === 'real' ? real
      : { async limit() { if (mode === 'throw') throw new Error('store down'); return { success: mode !== 'deny' }; } };
    export default { async fetch(r, env) {
      const mode = r.headers.get('x-limit') ?? 'allow', url = new URL(r.url);
      const e = { ...env, LISTING_LIMITER: limiter(mode, env.REAL_LIMITER), LISTING_MEDIA_LIMITER: limiter(mode, env.REAL_LIMITER),
        GOOGLE_PLACES_API_KEY: r.headers.get('x-no-key') ? undefined : env.GOOGLE_PLACES_API_KEY };
      const match = listingGalleryPath.exec(url.pathname);
      return match ? listingGallery(match[1], e, '203.0.113.9') : listingPhoto(url, e, '203.0.113.9');
    } };`, resolveDir: process.cwd(), sourcefile: 'listing-fixture.ts' }, bundle: true, write: false, format: 'esm', platform: 'browser' });
  const state = await mkdtemp(join(tmpdir(), 'localley-listing-test-'));
  const calls = [];
  let details = () => Response.json({ id: place, location: { latitude: 37.579617, longitude: 126.977041 }, photos: [
    { name: photo(1), authorAttributions: [{ displayName: 'Min <script>', uri: '//maps.google.com/maps/contrib/1' }] },
    { name: photo(1) }, { name: `places/${farPlace}/photos/Other` }, { name: 'bad name' },
    { name: photo(2), authorAttributions: [{ displayName: 'Ana', uri: 'javascript:alert(1)' }] },
    { name: photo(3) }, { name: photo(4) }, { name: photo(5) }] });
  let media = () => Response.json({ photoUri: 'https://lh3.googleusercontent.com/p/abc' });
  let image = () => new Response(jpeg, { headers: { 'content-type': 'image/png' } });
  const mf = new Miniflare({ workers: [{ config: { name: 'listing-fixture', type: 'worker', compatibilityDate: '2026-09-07',
    manifest: { mainModule: 'fixture.mjs', modulesRoot: resolve('test'), modules: { 'fixture.mjs': { type: 'esm', contents: compiled.outputFiles[0].text } } },
    env: { GOOGLE_PLACES_API_KEY: { type: 'json', value: 'offline-key-0123456789abcdef' },
      DB: { type: 'd1', id: '00000000-0000-0000-0000-000000000012', dev: { remote: false } },
      REAL_LIMITER: { type: 'rate-limit', namespace: '1001', simple: { limit: 2, period: 60 } } } },
    dev: { outboundService: { type: 'fetcher', handler: async request => {
      const url = new URL(request.url);
      calls.push({ url: request.url, key: request.headers.get('x-goog-api-key'), mask: request.headers.get('x-goog-fieldmask') });
      if (url.hostname === 'places.googleapis.com' && url.pathname.endsWith('/media')) return media(url);
      if (url.hostname === 'places.googleapis.com') return details(url);
      if (url.hostname.endsWith('googleusercontent.com')) return image(url);
      throw new Error(`Unexpected outbound ${url.hostname}`);
    } } } }], resourcePersistencePath: state, resourceTmpPath: state,
    telemetry: { enabled: false }, cf: false, logRequests: false, unsafeLocalExplorer: false });
  const get = (path, headers = {}) => mf.dispatchFetch(`https://local.test${path}`, { headers });
  const gallery = async (id, headers) => { const r = await get(`/api/spots/${id}/photos`, headers); return { status: r.status, cache: r.headers.get('cache-control'), body: await r.json() }; };
  try {
    const db = await mf.getD1Database('DB');
    for (const name of ['0001_local.sql', '0002_application.sql', '0004_pilot_catalog.sql', '0012_listing_places.sql']) await db.exec((await readFile(`migrations/${name}`, 'utf8')).split('\n').filter(line => !line.startsWith('--')).join(' '));
    const insert = (id, visible, lat, lng) => db.prepare(`INSERT INTO spots (id, name, description, category, localley_score, photos, visible, city, latitude, longitude)
      VALUES (?, '{"en":"Fixture"}', '{"en":"Fixture"}', 'Culture', NULL, '[]', ?, 'Seoul', ?, ?)`).bind(id, visible, lat, lng).run();
    await insert(spot, 1, 37.5798841, 126.9767996); await insert(far, 1, 37.5752858, 126.9550192);
    await insert(bare, 1, 37.573382, 126.99303); await insert(hidden, 0, 37.57, 126.99);
    for (const [id, pid] of [[spot, place], [far, place], [hidden, place]]) await db.prepare("INSERT INTO spot_listing_places (spot_id, provider, place_id, source) VALUES (?, 'google', ?, 'fixture')").bind(id, pid).run();
    await assert.rejects(db.prepare("INSERT INTO spot_listing_places (spot_id, provider, place_id, source) VALUES (?, 'google', 'bad id', 'fixture')").bind(bare).run());
    await assert.rejects(db.prepare("INSERT INTO spot_listing_places (spot_id, provider, place_id, source) VALUES (?, 'other', 'abc', 'fixture')").bind(bare).run());

    await t.test('verified listing returns up to four distinct, attributed, same-listing photos', async () => {
      const result = await gallery(spot);
      assert.equal(result.status, 200); assert.equal(result.cache, 'no-store');
      assert.equal(result.body.status, 'available');
      assert.deepEqual(result.body.photos.map(p => p.id), [photo(1), photo(2), photo(3), photo(4)]);
      assert.ok(result.body.photos.every(p => p.sourceLabel === 'Google listing photo' && p.url.startsWith(`/api/places/photo?spot=${spot}&`)));
      assert.deepEqual(result.body.photos[0].attributions, [{ displayName: 'Min  script', uri: 'https://maps.google.com/maps/contrib/1' }]);
      assert.deepEqual(result.body.photos[1].attributions, [{ displayName: 'Ana' }]);
      assert.equal(calls.at(-1).key, 'offline-key-0123456789abcdef'); assert.equal(calls.at(-1).mask, 'id,location,photos');
    });
    await t.test('listing farther than 1 km from the catalog place shows no photos', async () => {
      const result = await gallery(far);
      assert.equal(result.body.status, 'unavailable'); assert.equal(result.body.photos.length, 0);
      assert.match(result.body.message, /not at this place/);
    });
    await t.test('no stored listing, hidden or unknown place: no provider call', async () => {
      const before = calls.length;
      assert.deepEqual([(await gallery(bare)).status, (await gallery(bare)).body.status], [200, 'unavailable']);
      assert.equal((await gallery(hidden)).status, 404);
      assert.equal((await gallery('00000000-0000-4000-8000-000000000000')).status, 404);
      assert.equal(calls.length, before);
    });
    await t.test('limiter missing, failing or denying fails closed before D1 and provider', async () => {
      const before = calls.length;
      assert.equal((await gallery(spot, { 'x-limit': 'missing' })).status, 503);
      assert.equal((await gallery(spot, { 'x-limit': 'throw' })).status, 503);
      const denied = await gallery(spot, { 'x-limit': 'deny' });
      assert.equal(denied.status, 429); assert.equal(denied.body.photos.length, 0);
      assert.equal((await get(`/api/places/photo?spot=${spot}&name=${encodeURIComponent(photo(1))}&w=1200`, { 'x-limit': 'throw' })).status, 503);
      assert.equal(calls.length, before);
    });
    await t.test('the real Workers rate-limit binding blocks after its limit', async () => {
      const statuses = [];
      for (let i = 0; i < 3; i++) statuses.push((await gallery(bare, { 'x-limit': 'real' })).status);
      assert.deepEqual(statuses, [200, 200, 429]);
    });
    await t.test('missing key and provider faults stay unavailable, never a substitute', async () => {
      assert.equal((await gallery(spot, { 'x-no-key': '1' })).status, 503);
      for (const [response, status] of [[() => new Response('x', { status: 500 }), 502], [() => new Response(null, { status: 302, headers: { location: 'https://evil.test/' } }), 502],
        [() => new Response('{bad'), 502], [() => Response.json({ id: 'other', location: { latitude: 37.5796, longitude: 126.977 } }), 502],
        [() => Response.json({ id: place, location: { latitude: 37.5796, longitude: 126.977 }, pad: 'x'.repeat(300000) }), 502],
        [() => Response.json({ id: place, location: { latitude: 37.5796, longitude: 126.977 }, photos: [] }), 200]]) {
        const saved = details; details = response;
        const result = await gallery(spot);
        details = saved;
        assert.equal(result.status, status); assert.equal(result.body.status, 'unavailable'); assert.deepEqual(result.body.photos, []);
      }
    });
    await t.test('photo proxy serves only this listing, checks magic bytes and never forwards the key', async () => {
      const url = `/api/places/photo?spot=${spot}&name=${encodeURIComponent(photo(2))}&w=1200&v=venue-photos-cf1`;
      const before = calls.length;
      const response = await get(url);
      assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/jpeg');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), jpeg);
      const [mediaCall, imageCall] = calls.slice(before);
      assert.match(mediaCall.url, /\/v1\/places\/ChIJod7tSseifDUR9hXHLFNGMIs\/photos\/Ref2\/media\?maxWidthPx=1200&skipHttpRedirect=true$/);
      assert.equal(imageCall.key, null);
      const stranger = calls.length;
      for (const bad of [`/api/places/photo?spot=${bare}&name=${encodeURIComponent(photo(1))}`, `/api/places/photo?spot=${hidden}&name=${encodeURIComponent(photo(1))}`,
        `/api/places/photo?spot=${spot}&name=${encodeURIComponent(`places/${farPlace}/photos/Other`)}`]) assert.equal((await get(bad)).status, 404);
      for (const bad of ['/api/places/photo', `/api/places/photo?spot=${spot}&name=bad`, `${url}&extra=1`, `${url}&w=99999`, `/api/places/photo?spot=x&name=${encodeURIComponent(photo(1))}`,
        `/api/places/photo?spot=${spot}&spot=${spot}&name=${encodeURIComponent(photo(1))}`]) assert.equal((await get(bad)).status, 400);
      assert.equal(calls.length, stranger);
      for (const [m, i] of [[() => Response.json({ photoUri: 'https://evil.test/p' }), image], [media, () => new Response(gif)],
        [media, () => new Response(null, { status: 302, headers: { location: 'https://evil.test/x' } })], [() => new Response('no', { status: 404 }), image]]) {
        const [sm, si] = [media, image]; media = m; image = i;
        const status = (await get(url)).status;
        media = sm; image = si;
        assert.ok([404, 502].includes(status), `unsafe media returned ${status}`);
      }
    });
  } finally { await mf.dispose(); await rm(state, { recursive: true, force: true }); }
});
