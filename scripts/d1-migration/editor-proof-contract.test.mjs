import test from 'node:test';
import assert from 'node:assert/strict';
import { editorWriteDenied, privateNoStore } from './editor-proof-contract.mjs';

test('captured middleware 401 does not require a route marker', () => {
  const response = { status: 401, cache: 'no-store', source: null, body: { error: 'Unauthorized' } };
  assert.equal(editorWriteDenied(response, 401), true);
  assert.equal(editorWriteDenied({ ...response, source: 'd1-preview' }, 401), false);
  assert.equal(editorWriteDenied({ ...response, cache: 'public' }, 401), false);
  assert.equal(editorWriteDenied({ ...response, body: {} }, 401), false);
  assert.equal(editorWriteDenied(response, 403), false);
});

test('captured foreign 403 keeps its D1 marker, privacy and error code', () => {
  const response = { status: 403, cache: 'private, no-store', source: 'd1-preview', body: { error: { code: 'forbidden' } } };
  assert.equal(editorWriteDenied(response, 403), true);
  assert.equal(editorWriteDenied({ ...response, source: null }, 403), false);
  assert.equal(editorWriteDenied({ ...response, body: { error: { code: 'not_found' } } }, 403), false);
  assert.equal(editorWriteDenied({ ...response, status: 200 }, 403), false);
});

test('captured Next.js 404 strengthening remains private and uncached', () => {
  const response = { status: 404, cache: 'private, no-cache, no-store, max-age=0, must-revalidate', source: 'd1-preview', body: { error: { code: 'not_found' } } };
  assert.equal(editorWriteDenied(response, 404), true);
  assert.equal(editorWriteDenied({ ...response, source: null }, 404), false);
  assert.equal(editorWriteDenied({ ...response, body: { error: { code: 'forbidden' } } }, 404), false);
});

test('cache policy accepts ordering and case without accepting weaker policies', () => {
  for (const value of ['no-store, private', 'PRIVATE, NO-STORE', ' private , no-store, max-age="0" ']) assert.equal(privateNoStore(value), true);
  for (const value of [null, '', 'private', 'no-store', 'public, private, no-store', 'private, no-store, max-age=60', 'private, no-store, s-maxage=60', 'private="x", no-store', 'private, no-store,', 'private, no-store, max-age=0, max-age=20', 'private, no-store, stale-while-revalidate=60']) assert.equal(privateNoStore(value), false, String(value));
});

test('unknown denial shapes and success responses cannot pass', () => {
  for (const response of [null, {}, { status: 200 }, { status: 500, cache: 'private, no-store', source: 'd1-preview' }]) {
    for (const status of [401, 403, 404, 500]) assert.equal(editorWriteDenied(response, status), false);
  }
});
