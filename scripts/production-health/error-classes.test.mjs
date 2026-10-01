import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyUserError, summarizeErrorClasses } from './error-classes.mjs';

test('distinguishes primary format failures from fallback failures without claiming fallback success', () => {
  const path = '/api/itineraries/generate';
  const primary = classifyUserError('Failed to parse GLM response; retrying with OpenAI: secret raw output', path, null);
  const fallback = classifyUserError('Failed to parse OpenAI response: private itinerary', path, null);
  assert.equal(primary.errorClass, 'glm_invalid_json');
  assert.match(primary.message, /requested$/);
  assert.equal(fallback.errorClass, 'openai_invalid_json');
  assert.equal(JSON.stringify([primary, fallback]).includes('secret'), false);
  assert.equal(classifyUserError('Failed to parse GLM response; retrying with OpenAI:', '/unrelated', null).errorClass, 'server_error_unclassified');
});
test('labels intentional notification unavailability separately from server errors', () => {
  const path = '/api/notifications/preferences';
  assert.equal(classifyUserError('PATCH private URL', path, 503).errorClass, 'notification_preferences_unavailable');
  assert.equal(classifyUserError('GET private URL', path, 500).errorClass, 'notification_preferences_failed');
  assert.equal(classifyUserError('GET private URL', path, 200).errorClass, 'http_request_failed');
});
test('keeps structured venue diagnosis separate from legacy HTTP failure', () => {
  const path = '/api/spots/REDACTED/photos';
  const event = '[spot-photos] ' + JSON.stringify({ spotId: '550e8400-e29b-41d4-a716-446655440000', reason: 'listing_coordinate_conflict', status: 502 });
  assert.equal(classifyUserError(event, path, null).errorClass, 'venue_photo_listing_coordinate_conflict');
  assert.equal(classifyUserError('GET secret', path, 502).errorClass, 'venue_photos_failed');
  assert.equal(classifyUserError('GET secret', '/api/spots/photos/private', 502).errorClass, 'http_request_failed');
});
test('retains fixed classes for profile, record and network failures', () => {
  const cases = [
    ['[auth] user hook failed private payload', 'auth_profile_sync_failed'],
    ['Cannot coerce the result to a single JSON object private payload', 'application_record_missing'],
    ['Network connection lost. private payload', 'network_connection_lost'],
    ['[generate] GLM primary failed; falling back to OpenAI: private payload', 'glm_primary_failed'],
  ];
  for (const [raw, errorClass] of cases) assert.equal(classifyUserError(raw, '/api/itineraries/generate', null).errorClass, errorClass);
});
test('unrecognized or hostile log payloads never enter report labels', () => {
  for (const raw of [null, {}, 'password=unlabelledCredential person@example.com https://private/?key=hidden', '[spot-photos] {"reason":"hidden"}']) {
    assert.deepEqual(classifyUserError(raw, '/dashboard', null), {
      errorClass: 'server_error_unclassified', message: 'Server error; inspect private Cloudflare logs',
    });
  }
});
test('class totals preserve event counts and status distinctions rather than counting users', () => {
  const classified = classifyUserError('Network connection lost.', '/dashboard', null);
  const result = summarizeErrorClasses([
    { ...classified, path: '/dashboard', status: null, count: 2 },
    { ...classified, path: '/settings', status: 500, count: 1 },
    { ...classified, path: '/settings', status: 'secret', count: 1 },
    { ...classifyUserError('GET', '/api/spots/REDACTED/photos', 502), status: 502, count: 24 },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].errorClass, 'venue_photos_failed');
  assert.equal(result[0].count, 24);
  assert.deepEqual(result[1].statuses, { 500: 1, unknown: 3 });
  assert.equal(result[1].count, 4);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
