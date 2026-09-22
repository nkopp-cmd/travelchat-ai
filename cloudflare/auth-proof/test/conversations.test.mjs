import assert from 'node:assert/strict';

export async function conversationTests(t, { db, call, aliceCookie, bobCookie }) {
  const alice = await (await call('/api/session', { cookie: aliceCookie })).json();
  const bob = await (await call('/api/session', { cookie: bobCookie })).json();
  const ids = { a1: 'c0000000-0000-4000-8000-00000000000a', a2: 'c0000000-0000-4000-8000-00000000000b', b1: 'c0000000-0000-4000-8000-00000000000c' };
  const insert = (id, ownerId, title, createdAt, updatedAt) => db.prepare('INSERT INTO conversations (id, ownerId, title, linkedItineraryId, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, ?)')
    .bind(id, ownerId, title, createdAt, updatedAt).run();
  await insert(ids.a1, alice.ownerId, 'Older trip', '2026-01-01T00:00:00+00:00', null);
  await insert(ids.a2, alice.ownerId, 'Newer trip', '2026-01-02T00:00:00+00:00', '2026-01-03T00:00:00+00:00');
  await insert(ids.b1, bob.ownerId, 'Bob private', '2026-01-05T00:00:00+00:00', null);
  const message = (id, conversationId, role, content, createdAt) => db.prepare('INSERT INTO messages (id, conversationId, role, content, createdAt) VALUES (?, ?, ?, ?, ?)')
    .bind(id, conversationId, role, content, createdAt).run();
  await message('d0000000-0000-4000-8000-000000000001', ids.a2, 'assistant', 'Second', '2026-01-02T00:00:02+00:00');
  await message('d0000000-0000-4000-8000-000000000002', ids.a2, 'user', 'First\nline two', '2026-01-02T00:00:01+00:00');
  await message('d0000000-0000-4000-8000-000000000003', ids.b1, 'user', 'Bob secret', '2026-01-05T00:00:01+00:00');
  const get = (path, cookie, session) => call(path, { cookie, headers: session ? { 'x-localley-session-id': session } : {} });

  await t.test('owner lists only their conversations, newest activity first', async () => {
    const response = await get('/api/conversations', aliceCookie, alice.sessionId);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.conversations.map(c => c.id), [ids.a2, ids.a1]);
    assert.equal(data.truncated, false);
    assert.ok(!JSON.stringify(data).includes('Bob'));
  });
  await t.test('messages are ordered, exact, and another owner cannot tell a conversation exists', async () => {
    const own = await (await get(`/api/conversations/${ids.a2}/messages`, aliceCookie, alice.sessionId)).json();
    assert.deepEqual(own.messages.map(m => [m.role, m.content]), [['user', 'First\nline two'], ['assistant', 'Second']]);
    const foreign = await get(`/api/conversations/${ids.b1}/messages`, aliceCookie, alice.sessionId);
    const missing = await get('/api/conversations/c0000000-0000-4000-8000-0000000000ff/messages', aliceCookie, alice.sessionId);
    assert.equal(foreign.status, 404); assert.equal(missing.status, 404);
    assert.deepEqual(await foreign.json(), await missing.json());
    const bobOwn = await (await get(`/api/conversations/${ids.b1}/messages`, bobCookie, bob.sessionId)).json();
    assert.equal(bobOwn.messages[0].content, 'Bob secret');
  });
  await t.test('sign-in, session fence, query selectors and writes fail closed', async () => {
    assert.equal((await call('/api/conversations')).status, 401);
    assert.equal((await get('/api/conversations', aliceCookie, bob.sessionId)).status, 409);
    assert.equal((await get(`/api/conversations?ownerId=${bob.ownerId}`, aliceCookie, alice.sessionId)).status, 400);
    assert.equal((await get('/api/conversations/not-a-uuid/messages', aliceCookie, alice.sessionId)).status, 404);
    const before = (await db.prepare('SELECT count(*) AS n FROM messages').first()).n;
    assert.equal((await call('/api/conversations', { method: 'POST', cookie: aliceCookie, headers: { 'x-localley-session-id': alice.sessionId }, body: { title: 'x' } })).status, 405);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM messages').first()).n, before);
  });
}
