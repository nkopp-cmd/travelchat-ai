import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { issueFixtureGrant } from './fixture-issuer.mjs';

// Synthetic legacy input only. This does not import a customer or mint production migration authority.
export async function ownershipRehearsal(t, { db, call, post, signup, login, mail, bobCookie, claimSecret }) {
  const email = 'ownership-rehearsal@example.test';
  const authUserId = await signup(email); await call((await mail(authUserId, 'verify')).url);
  let cookie = await login(email);
  const unlinked = await (await call('/api/session', { cookie })).json();
  const ownerId = 'synthetic/legacy-owner-' + randomUUID(), profileId = randomUUID(), saveId = randomUUID(), spotId = randomUUID(), itineraryId = randomUUID();
  const preferences = { marketing: false, weekly_digest: true, product_updates: false, itinerary_shared: true };
  const activities = JSON.stringify({ dailyPlans: [{ day: 1, activities: [{ name: 'Synthetic stop', time: '10:00', duration: '1 hour', type: 'attraction' }] }], importedMetadata: { label: 'SYNTHETIC preserved metadata' } });
  await db.batch([
    db.prepare("INSERT INTO owners VALUES (?, 'legacy-fixture')").bind(ownerId),
    db.prepare('INSERT INTO profiles VALUES (?, ?)').bind(profileId, ownerId),
    db.prepare('INSERT INTO owner_limits VALUES (?, 100)').bind(ownerId),
    db.prepare('INSERT INTO saved_spots VALUES (?, ?, ?, ?)').bind(saveId, ownerId, spotId, 1234567890123),
    db.prepare('INSERT INTO itineraries (id, ownerId, title, city, days, activities, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .bind(itineraryId, ownerId, 'SYNTHETIC legacy trip', 'Seoul', activities, '2020-01-02T03:04:05.678Z'),
    db.prepare('INSERT INTO email_preferences VALUES (?, 0, 1, 0, 1)').bind(ownerId),
  ]);
  const retained = () => Promise.all(['profiles', 'owner_limits', 'saved_spots', 'itineraries', 'email_preferences']
    .map(async table => (await db.prepare(`SELECT * FROM ${table} WHERE ownerId = ? ORDER BY rowid`).bind(ownerId).all()).results));
  const original = await retained();
  const token = await issueFixtureGrant(db, claimSecret, authUserId, ownerId);

  await t.test('account mutations require exact session preconditions without consuming grants or creating profiles', async () => {
    const before = await Promise.all(['owners', 'profiles', 'owner_limits', 'identity_links', 'claim_grants']
      .map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
    for (const path of ['/api/account/new', '/api/account/claim']) {
      for (const [headers, expected] of [[{}, 428], [{ 'x-localley-session-id': '' }, 428], [{ 'x-localley-session-id': 'stale' }, 409]]) {
        const response = await call(path, { method: 'POST', cookie, headers, body: path.endsWith('claim') ? { token } : {} });
        assert.equal(response.status, expected);
      }
      assert.equal((await call(path, { method: 'POST', headers: { 'x-localley-session-id': unlinked.sessionId }, body: {} })).status, 401);
    }
    assert.equal((await call('/api/session', { cookie, headers: { 'x-localley-session-id': 'stale' } })).status, 409);
    assert.deepEqual(await Promise.all(['owners', 'profiles', 'owner_limits', 'identity_links', 'claim_grants']
      .map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results)), before);
  });

  await t.test('legacy grant preserves owner, profile, saved IDs, timestamps, quota, itinerary payload and consent', async () => {
    assert.equal((await call('/api/itineraries', { cookie })).status, 409);
    assert.equal((await post('/api/account/claim', { token }, cookie)).status, 200);
    const session = await (await call('/api/session', { cookie })).json();
    assert.deepEqual(session, { state: 'ready', authUserId, sessionId: unlinked.sessionId, ownerId, userRecordId: profileId });
    assert.notEqual(authUserId, ownerId); assert.notEqual(profileId, ownerId);
    assert.deepEqual(await retained(), original);
    const saves = await (await call('/api/spots/save', { cookie })).json();
    assert.deepEqual(saves.spots, [{ id: saveId, spot_id: spotId, created_at: new Date(1234567890123).toISOString(), spots: null }]);
    const trip = await (await call(`/api/itineraries/${itineraryId}`, { cookie })).json();
    assert.equal(trip.id, itineraryId); assert.equal(trip.ownerId, ownerId); assert.deepEqual(trip.activities, JSON.parse(activities));
    assert.equal(trip.created_at, '2020-01-02T03:04:05.678Z');
    assert.deepEqual(await (await call('/api/user/email-preferences', { cookie })).json(), { preferences });
    assert.deepEqual(await (await post('/api/account/new', {}, cookie)).json(), { ownerId, userRecordId: profileId });
    assert.equal((await post('/api/account/claim', { token }, cookie)).status, 409);
    assert.deepEqual(await retained(), original);
  });

  await t.test('another verified account cannot read or change the migrated private records', async () => {
    const bob = await (await call('/api/session', { cookie: bobCookie })).json();
    assert.equal((await call(`/api/itineraries/${itineraryId}`, { cookie: bobCookie })).status, 404);
    assert.equal((await call(`/api/itineraries/${itineraryId}`, { method: 'DELETE', cookie: bobCookie, headers: { 'x-localley-session-id': bob.sessionId } })).status, 200);
    const rejected = await call('/api/session', { cookie: bobCookie, headers: { 'x-localley-session-id': unlinked.sessionId } });
    assert.equal(rejected.status, 409); assert.deepEqual(Object.keys(await rejected.json()), ['error']);
    assert.deepEqual(await retained(), original);
  });

  await t.test('local password recovery revokes old sessions without replacing legacy ownership or consent', async () => {
    assert.equal((await post('/api/auth/request-password-reset', { email, redirectTo: 'https://localhost/' })).status, 200);
    const reset = await mail(authUserId, 'reset');
    const password = 'Synthetic-recovery-' + randomUUID();
    assert.equal((await post('/api/auth/reset-password', { token: reset.token, newPassword: password })).status, 200);
    for (const path of ['/api/session', '/api/spots/save', '/api/itineraries', '/api/user/email-preferences']) assert.equal((await call(path, { cookie })).status, 401);
    cookie = await login(email, password);
    const session = await (await call('/api/session', { cookie })).json();
    assert.equal(session.ownerId, ownerId); assert.equal(session.userRecordId, profileId); assert.notEqual(session.sessionId, unlinked.sessionId);
    assert.deepEqual(await (await call('/api/user/email-preferences', { cookie })).json(), { preferences });
    assert.deepEqual(await retained(), original);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  });
}
