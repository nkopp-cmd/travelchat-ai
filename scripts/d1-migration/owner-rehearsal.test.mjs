import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADMIN_IDS, classifyOwners, fetchAuthIds, snapshotOwners } from './owner-rehearsal.mjs';

const h = value => createHash('sha256').update(value).digest('hex');
const tables = () => ({
  users: [{ id: 'profile-one', clerk_id: ADMIN_IDS[0] }, { id: 'profile-gone', clerk_id: 'historical' }],
  itineraries: [{ id: 'trip-one', clerk_user_id: ADMIN_IDS[0], user_id: 'profile-one' }, { id: 'trip-gone', clerk_user_id: 'historical', user_id: 'profile-gone' }],
  conversations: [{ id: 'conversation-one', clerk_user_id: 'historical' }],
  subscriptions: [{ id: 'sub-one', clerk_user_id: ADMIN_IDS[1] }],
  usage_tracking: [],
});

test('classifies old and new owners by exact ID, never by email', () => {
  const result = classifyOwners(tables(), [ADMIN_IDS[0], ADMIN_IDS[1]]);
  assert.equal(result.sourceProfiles, 2);
  assert.equal(result.sourceOwners, 3);
  assert.equal(result.sourceProfilesAbsentAuth, 1);
  assert.equal(result.authUsersWithoutSourceProfile, 1);
  assert.equal(result.ownerRecords.itineraries.unclaimed, 1);
  assert.equal(result.ownerRecords.conversations.unclaimed, 1);
  assert.equal(result.ownerRecords.subscriptions.unclaimed, 0);
  assert.deepEqual(result.missingAdminIds, []);
  assert.deepEqual(result.private.unclaimedOwners, ['historical']);
  assert.deepEqual(result.private.authWithoutProfile, [ADMIN_IDS[1]]);
  const forged = tables();
  forged.itineraries[0].user_id = 'profile-gone';
  assert.throws(() => classifyOwners(forged, [ADMIN_IDS[0], ADMIN_IDS[1]]), /conflicting_itinerary_owner/);
  assert.throws(() => classifyOwners(tables(), [ADMIN_IDS[0], ADMIN_IDS[0]]), /invalid_auth_ids/);
});

test('queries only Better Auth IDs from the pinned production auth store', async () => {
  const request = async (url, init) => {
    assert.match(url, /73378d0e-7f2a-465a-8188-a67cb6d2a5c2\/query$/);
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, 'POST');
    assert.equal(JSON.parse(init.body).sql, 'SELECT id FROM "user" ORDER BY id LIMIT 10001');
    assert.equal(init.headers.Authorization, 'Bearer fixture-only');
    return Response.json({ success: true, result: [{ results: [{ id: ADMIN_IDS[0] }, { id: ADMIN_IDS[1] }] }] });
  };
  assert.deepEqual(await fetchAuthIds('fixture-only', request), ADMIN_IDS);
  await assert.rejects(fetchAuthIds('', request), /missing_cloudflare_token/);
  await assert.rejects(fetchAuthIds('fixture-only', async () => Response.json({ success: false })), /auth_query_unavailable/);
});

test('rejects changed source bytes before matching any owners', async () => {
  const root = await mkdtemp(join(tmpdir(), 'localley-owners-'));
  try {
    const dir = join(root, 'private');
    await mkdir(dir, { mode: 0o700 });
    const schema = '{}';
    await writeFile(join(dir, 'schema.json'), schema);
    const data = tables();
    const manifest = { version: 1, complete: true, source: 'https://llehrhqeolfprutcaopi.supabase.co',
      startedAt: new Date().toISOString(), schemaSha256: h(schema), tables: [] };
    for (const [name, rows] of Object.entries(data)) {
      const text = JSON.stringify(rows);
      await writeFile(join(dir, `${name}-0.json`), text);
      manifest.tables.push({ name, count: rows.length, primaryKey: ['id'], pages: [{ file: `${name}-0.json`, rows: rows.length, sha256: h(text) }] });
    }
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
    assert.equal((await snapshotOwners(dir)).tables.itineraries.length, 2);
    await writeFile(join(dir, 'itineraries-0.json'), '[]');
    await assert.rejects(snapshotOwners(dir), /source_page_mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
