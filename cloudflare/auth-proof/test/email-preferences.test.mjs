import assert from 'node:assert/strict';

export async function emailPreferenceTests(t, { db, call, post, signup, login, mail, aliceCookie, bobCookie }) {
  const path = '/api/user/email-preferences';
  const session = await (await call('/api/session', { cookie: aliceCookie })).json();
  const bob = await (await call('/api/session', { cookie: bobCookie })).json();
  const headers = { 'x-localley-session-id': session.sessionId };
  const defaults = { marketing: false, weekly_digest: false, product_updates: false, itinerary_shared: false };
  const read = (cookie = aliceCookie, extra = {}) => call(path, { cookie, ...extra });
  const put = (preferences, extra = {}) => call(path, { method: 'PUT', cookie: aliceCookie, headers, body: { preferences }, ...extra });
  const rows = async () => (await db.prepare('SELECT * FROM email_preferences ORDER BY ownerId').all()).results;
  const untouched = async () => Promise.all(['spots', 'saved_spots', 'itineraries', 'application_outbox', 'owners', 'profiles', 'identity_links', 'owner_limits']
    .map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));

  await t.test('new native preferences default off without writing during GET; partial updates preserve other fields', async () => {
    const before = await untouched();
    assert.deepEqual(await (await read()).json(), { preferences: defaults });
    assert.deepEqual(await rows(), []);
    assert.deepEqual(await (await put({ marketing: true })).json(), { success: true, preferences: { ...defaults, marketing: true } });
    assert.deepEqual(await (await put({ weekly_digest: true })).json(), { success: true, preferences: { ...defaults, marketing: true, weekly_digest: true } });
    assert.deepEqual(await (await read(bobCookie)).json(), { preferences: defaults });
    const beforeRetry = await rows();
    assert.equal((await put({ weekly_digest: true })).status, 200);
    assert.deepEqual(await rows(), beforeRetry);
    assert.deepEqual(await untouched(), before);
  });

  await t.test('concurrent disjoint updates preserve each choice, including first-row creation', async () => {
    for (const exists of [false, true]) {
      await db.prepare('DELETE FROM email_preferences WHERE ownerId = ?').bind(session.ownerId).run();
      if (exists) assert.equal((await put(defaults)).status, 200);
      const responses = await Promise.all(Object.keys(defaults).map(key => put({ [key]: true })));
      assert.ok(responses.every(response => response.status === 200));
      assert.deepEqual(await (await read()).json(), { preferences: Object.fromEntries(Object.keys(defaults).map(key => [key, true])) });
    }
  });

  await t.test('strict shape, values, owner fields, query selectors, methods, UTF-8 and body budgets fail closed', async () => {
    const before = await rows();
    for (const body of [{}, { preferences: null }, { preferences: [] }, { preferences: {} },
      { preferences: { marketing: 'false' } }, { preferences: { marketing: 0 } }, { preferences: { marketing: null } },
      { preferences: { extra: true } }, { preferences: { marketing: false }, ownerId: bob.ownerId },
      { preferences: { ownerId: true } }]) {
      assert.equal((await put(null, { body })).status, 400);
    }
    assert.equal((await call(path + '?ownerId=' + bob.ownerId, { cookie: aliceCookie })).status, 400);
    assert.equal((await call(path, { method: 'PATCH', cookie: aliceCookie, headers, body: { preferences: defaults } })).status, 405);
    assert.equal((await put(null, { raw: '{' })).status, 400);
    assert.equal((await put(null, { raw: new Uint8Array([255]) })).status, 400);
    assert.equal((await put(null, { raw: ' '.repeat(16385) })).status, 413);
    assert.deepEqual(await rows(), before);
  });

  await t.test('cookies authenticate; session headers fence reads and writes across account changes', async () => {
    const before = await rows();
    for (const [extra, expected] of [
      [{ cookie: undefined }, 401], [{ headers: {} }, 428], [{ headers: { 'x-localley-session-id': '' } }, 428],
      [{ headers: { 'x-localley-session-id': bob.sessionId } }, 409], [{ cookie: bobCookie }, 409],
      [{ origin: 'https://other.test' }, 403],
    ]) assert.equal((await put({ marketing: false }, extra)).status, expected);
    for (const cookie of [aliceCookie, bobCookie]) {
      assert.equal((await read(cookie, { headers: { 'x-localley-session-id': 'stale' } })).status, 409);
    }
    assert.deepEqual(await rows(), before);
  });

  await t.test('legacy identity requires explicit imported preferences; false choices remain false', async () => {
    const before = await rows();
    await db.prepare("UPDATE owners SET source = 'legacy-fixture' WHERE id = ?").bind(bob.ownerId).run();
    try {
      assert.equal((await read(bobCookie)).status, 409);
      assert.equal((await put({ marketing: true }, { cookie: bobCookie, headers: { 'x-localley-session-id': bob.sessionId } })).status, 409);
      assert.deepEqual(await rows(), before);
      await db.prepare('INSERT INTO email_preferences VALUES (?, 0, 1, 0, 1)').bind(bob.ownerId).run();
      assert.deepEqual(await (await read(bobCookie)).json(), { preferences: { ...defaults, weekly_digest: true, itinerary_shared: true } });
      const response = await put({ weekly_digest: false }, { cookie: bobCookie, headers: { 'x-localley-session-id': bob.sessionId } });
      assert.deepEqual(await response.json(), { success: true, preferences: { ...defaults, itinerary_shared: true } });
    } finally {
      await db.prepare("UPDATE owners SET source = 'new' WHERE id = ?").bind(bob.ownerId).run();
    }
  });

  await t.test('unverified, unlinked and incomplete accounts cannot read or mutate preferences', async () => {
    const id = await signup('preferences-incomplete@example.test');
    await call((await mail(id, 'verify')).url);
    const cookie = await login('preferences-incomplete@example.test');
    const dto = await (await call('/api/session', { cookie })).json();
    const options = { cookie, headers: { 'x-localley-session-id': dto.sessionId } };
    assert.equal((await read(cookie)).status, 409);
    assert.equal((await put({ marketing: true }, options)).status, 409);
    const provision = await (await post('/api/account/new', {}, cookie)).json();
    await db.prepare('DELETE FROM profiles WHERE ownerId = ?').bind(provision.ownerId).run();
    assert.equal((await read(cookie)).status, 409);
    assert.equal((await put({ marketing: true }, options)).status, 409);
    await db.prepare('UPDATE user SET emailVerified = 0 WHERE id = ?').bind(id).run();
    assert.equal((await read(cookie)).status, 403);
    assert.equal((await put({ marketing: true }, options)).status, 403);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM email_preferences WHERE ownerId = ?').bind(provision.ownerId).first()).n, 0);
  });

  await t.test('database write failure returns no success and preserves preferences', async () => {
    const before = await rows();
    await db.exec("CREATE TRIGGER preferences_failure BEFORE UPDATE ON email_preferences BEGIN SELECT RAISE(ABORT, 'synthetic'); END;");
    try { assert.equal((await put({ marketing: false })).status, 500); }
    finally { await db.exec('DROP TRIGGER preferences_failure;'); }
    assert.deepEqual(await rows(), before);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  });
}
