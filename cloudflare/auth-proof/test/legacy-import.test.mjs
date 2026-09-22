import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildImport, loadProjection, loadRules, loadSnapshot, rehearse, wkbPoint, sql } from '../scripts/legacy-import.mjs';
import { rehearseD1 } from '../scripts/legacy-import-d1.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const point = (lng, lat) => { const b = Buffer.alloc(25); Buffer.from('0101000020E6100000', 'hex').copy(b); b.writeDoubleLE(lng, 9); b.writeDoubleLE(lat, 17); return b.toString('hex').toUpperCase(); };
const ids = { a: 'user_fixtureA', b: 'user_fixtureB', c: 'user_billingOnly' };
const place = 'ChIJod7tSseifDUR9hXHLFNGMIs';
const photo = `/api/places/photo?w=1200&v=2&name=places%2F${place}%2Fphotos%2FRef1`;
function source() {
  return {
    users: [{ id: '11111111-1111-4111-8111-111111111111', clerk_id: ids.a, username: null, email: null, level: 2, xp: 40, title: 'Explorer', created_at: '2026-01-01T00:00:00+00:00' },
      { id: '22222222-2222-4222-8222-222222222222', clerk_id: ids.b, username: 'b', email: null, level: 1, xp: 0, title: 'Newbie', created_at: '2026-01-02T00:00:00+00:00' }],
    spots: [{ id: 'cbd403a4-1912-45b8-8ae1-fc13b4c2f1e5', name: { en: 'Gyeongbokgung Palace' }, description: { en: "Seoul's main palace" }, category: 'Culture',
      localley_score: 5, photos: [photo], address: { en: '161 Sajik-ro, Jongno District, Seoul, South Korea' }, location: point(126.9767996, 37.5798841), google_place_id: place, verified: true },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: { en: 'Gangnam Office District' }, description: { en: 'Broad area' }, category: 'Area',
        localley_score: 2, photos: [], address: { en: 'Gangnam, Seoul' }, location: point(127.03, 37.5), google_place_id: null, verified: false }],
    itineraries: [{ id: '33333333-3333-4333-8333-333333333333', clerk_user_id: ids.a, user_id: '11111111-1111-4111-8111-111111111111', title: "Seoul's day\nline two",
      city: 'Seoul', days: 1, activities: [{ day: 1, activities: [{ name: 'Palace' }] }], highlights: ['Palace'], estimated_cost: '$20', subtitle: null,
      local_score: 7.5, created_at: '2026-02-01T00:00:00+00:00', status: 'draft', is_favorite: false, is_public: false, like_count: 0, view_count: 3,
      shared: false, share_code: null, ai_backgrounds: null, story_slides: null }],
    conversations: [{ id: '44444444-4444-4444-8444-444444444444', clerk_user_id: ids.b, title: 'Trip', linked_itinerary_id: null, created_at: '2026-02-02T00:00:00+00:00', updated_at: null }],
    messages: [{ id: '55555555-5555-4555-8555-555555555555', conversation_id: '44444444-4444-4444-8444-444444444444', role: 'user', content: 'Line 1\r\nLine "2" \'quoted\'', created_at: '2026-02-02T00:00:01+00:00' }],
    subscriptions: [{ id: 'sub-1', clerk_user_id: ids.c, tier: 'free', status: 'active', billing_cycle: null, stripe_customer_id: 'cus_fixture', stripe_subscription_id: null,
      stripe_price_id: null, current_period_start: null, current_period_end: null, cancel_at_period_end: false, trial_start: null, trial_end: null, created_at: null, updated_at: null }],
    usage_tracking: [{ id: 'use-1', clerk_user_id: ids.a, usage_type: 'itinerary', period_type: 'monthly', period_start: '2026-02-01', count: 2, created_at: null, updated_at: null }],
    challenges: [{ id: 'c1' }],
  };
}
async function write(dir, tables, projectionRows, { corrupt, extraTable } = {}) {
  const snapshot = join(dir, 'snapshot'), projection = join(dir, 'projection');
  await mkdir(snapshot); await mkdir(projection);
  const all = { ...tables, ...(extraTable ? { unknown_table: [{ id: 1 }] } : {}) };
  const manifest = { complete: true, tables: [] };
  for (const [name, rows] of Object.entries(all)) {
    const bytes = JSON.stringify(rows);
    await writeFile(join(snapshot, `${name}-0.json`), corrupt === name ? bytes.replace('Seoul', 'Busan') : bytes);
    manifest.tables.push({ name, count: rows.length, pages: [{ file: `${name}-0.json`, rows: rows.length, sha256: sha(bytes) }] });
  }
  await writeFile(join(snapshot, 'manifest.json'), JSON.stringify(manifest));
  for (const row of projectionRows) await writeFile(join(projection, `${row.id}.json`), JSON.stringify(row));
  return { snapshot, projection };
}

test('legacy import builds exact, idempotent D1 rows and reads back through the Worker', { timeout: 120_000 }, async t => {
  const root = await mkdtemp(resolve('.local/legacy-import-'));
  try {
    const rules = await loadRules();
    await t.test('EWKB points and SQL literals stay exact and single-line', () => {
      assert.deepEqual(wkbPoint(point(126.5, 37.25)), { lat: 37.25, lng: 126.5 });
      assert.equal(wkbPoint('0101000000'), null);
      assert.equal(sql("it's"), "'it''s'");
      assert.ok(!sql('a\nb').includes('\n'));
      assert.equal(sql(true), '1');
    });
    const tables = source();
    await mkdir(join(root, 'good'));
    const good = await write(join(root, 'good'), tables, tables.itineraries);
    const built = buildImport(loadSnapshot(good.snapshot), loadProjection(good.projection), rules);
    await t.test('owners keep legacy strings, including billing-only and profile-less history', () => {
      assert.deepEqual(built.expected.owners.map(o => o.id), [ids.c, ids.a, ids.b].sort());
      assert.deepEqual(built.expected.legacy_owners.find(o => o.ownerId === ids.c).hasSourceProfile, 0);
      assert.ok(built.expected.owners.every(o => o.source === 'legacy-fixture'));
      assert.ok(built.expected.owner_limits.every(o => o.savedSpotLimit === 10));
      assert.equal(built.archived.challenges, 1);
    });
    await t.test('spots use live visibility rules, drop proxy photos and keep listing identity', () => {
      const [palace, broad] = built.expected.spots;
      assert.equal(palace.visible, 1); assert.equal(broad.visible, 0);
      assert.deepEqual(palace.photos, []); assert.equal(palace.city, 'Seoul');
      assert.equal(palace.latitude, 37.5798841);
      assert.deepEqual(built.expected.spot_listing_places, [{ spot_id: palace.id, provider: 'google', place_id: place, source: 'live google_place_id' }]);
      assert.equal(built.expected.legacy_spot_source[1].publicIssue, 'broad_place_name');
    });
    await t.test('node:sqlite rehearsal: exact rows, second run changes nothing, no FK violations', async () => {
      const result = await rehearse(built.sql, built.expected);
      assert.equal(result.mismatchCount, 0, result.mismatches.join(','));
      assert.equal(result.repeatChanges, 0); assert.equal(result.foreignKeyViolations, 0); assert.equal(result.integrity, 'ok');
    });
    await t.test('workerd D1 rehearsal serves only public spots and keeps itineraries private', async () => {
      const result = await rehearseD1(built, { stateRoot: root });
      assert.equal(result.repeatChanges, 0); assert.equal(result.foreignKeyViolations, 0);
      assert.equal(result.workerCatalogServed, 1); assert.equal(result.expectedVisible, 1);
      assert.equal(result.privateItineraryWithoutSession, 401);
      assert.equal(result.counts.messages, 1);
    });
    await t.test('corrupt pages, unknown tables and projection drift are refused', async () => {
      const corrupt = join(root, 'corrupt'); await mkdir(corrupt);
      const bad = await write(corrupt, source(), source().itineraries, { corrupt: 'spots' });
      assert.throws(() => loadSnapshot(bad.snapshot), /Hash mismatch/);
      const extra = join(root, 'extra'); await mkdir(extra);
      const unknown = await write(extra, source(), source().itineraries, { extraTable: true });
      assert.throws(() => loadSnapshot(unknown.snapshot), /Unclassified/);
      const drift = join(root, 'drift'); await mkdir(drift);
      const changed = await write(drift, source(), [{ ...source().itineraries[0], title: 'Changed' }]);
      assert.throws(() => buildImport(loadSnapshot(changed.snapshot), loadProjection(changed.projection), rules), /Projection changed title/);
      const orphan = source(); orphan.messages[0].conversation_id = '99999999-9999-4999-8999-999999999999';
      const lost = join(root, 'orphan'); await mkdir(lost);
      const files = await write(lost, orphan, orphan.itineraries);
      assert.throws(() => buildImport(loadSnapshot(files.snapshot), loadProjection(files.projection), rules), /Message without conversation/);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});
