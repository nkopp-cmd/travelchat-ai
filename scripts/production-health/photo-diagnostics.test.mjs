import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotoFailure, photoFailureReasons } from './photo-diagnostics.mjs';
const spotId = '550e8400-e29b-41d4-a716-446655440000';
const event = data => '[spot-photos] ' + JSON.stringify({ spotId, reason: 'listing_coordinate_conflict', status: 502, ...data });
test('classifies every fixed reason with a source ID and HTTP status', () => {
  for (const reason of photoFailureReasons) assert.deepEqual(parsePhotoFailure(event({ reason })), { spotId, reason, status: 502 });
});
test('retains only bounded public diagnostic fields', () => {
  const parsed = parsePhotoFailure(event({ upstreamStatus: 429, url: 'https://private.example/?key=secret', email: 'person@example.com', userId: 'private' }));
  assert.deepEqual(parsed, { spotId, reason: 'listing_coordinate_conflict', status: 502, upstreamStatus: 429 });
  assert.equal(JSON.stringify(parsed).includes('secret'), false);
});
test('refuses malformed, unbounded and unsupported diagnostic values', () => {
  for (const raw of [null, 'GET https://private.example/?key=secret', '[spot-photos] {', event({ spotId: 'private' }),
    event({ reason: 'secret@example.com' }), event({ status: 200 }), event({ upstreamStatus: 'secret' }),
    event({ upstreamStatus: 999 }), event({ padding: 'x'.repeat(500) }), '[spot-photos] null']) assert.equal(parsePhotoFailure(raw), null);
});
