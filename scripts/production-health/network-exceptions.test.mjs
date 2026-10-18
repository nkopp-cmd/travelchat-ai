import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeNetworkExceptions } from './network-exceptions.mjs';
const event = exception => ({ $metadata: { service: 'localley-next', error: 'Network connection lost.' },
  source: { message: 'PRIVATE_PAYLOAD', exception } });
test('provider name/timestamp-only exceptions leave cause and body completion unknown', () => {
  const events = Array.from({ length: 14 }, () => event({ name: 'PRIVATE_NAME', timestamp: 123 }));
  const r = summarizeNetworkExceptions(events);
  assert.equal(r.events, 14);
  assert.equal(r.withExceptionObject, 14);
  assert.equal(r.withRecognizedStackField, 0);
  assert.equal(r.withoutRecognizedStackField, 14);
  assert.equal(r.bodyCompletion, 'not_observed');
  assert.equal(r.cause, 'not_established');
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE/);
});
test('recognized nonempty stack fields record availability without retaining content', () => {
  for (const field of ['stack', 'stacktrace', 'stackTrace']) {
    const r = summarizeNetworkExceptions([event({ [field]: 'PRIVATE_STACK' })]);
    assert.equal(r.withRecognizedStackField, 1);
    assert.equal(r.withoutRecognizedStackField, 0);
    assert.doesNotMatch(JSON.stringify(r), /PRIVATE/);
  }
  const e = event(null); e.source.stack = 'PRIVATE_STACK';
  assert.equal(summarizeNetworkExceptions([e]).withRecognizedStackField, 1);
});
test('foreign services and other errors do not enter network evidence counts', () => {
  const foreign = event({ stack: 'PRIVATE' }); foreign.$metadata.service = 'other-worker';
  const other = event({ stack: 'PRIVATE' }); other.$metadata.error = 'other error';
  assert.equal(summarizeNetworkExceptions([foreign, other, null, {}]).events, 0);
});
test('malformed stack fields remain unknown and no error payload escapes', () => {
  for (const value of [null, [], {}, '', '  ', 4]) {
    const r = summarizeNetworkExceptions([event({ stack: value, cause: 'PRIVATE' })]);
    assert.equal(r.withRecognizedStackField, 0);
    assert.equal(r.withoutRecognizedStackField, 1);
    assert.doesNotMatch(JSON.stringify(r), /PRIVATE/);
  }
  assert.throws(() => summarizeNetworkExceptions(null), /^Error: Invalid network diagnostic input$/);
});

test('route-specific provider errors keep the existing classification priority', () => {
  const e = event({ stack: 'PRIVATE' });
  e.$metadata.url = 'https://www.localley.io/api/itineraries/generate?private=PRIVATE';
  e.$metadata.error = '[generate] GLM primary failed; falling back to OpenAI: Network connection lost.';
  assert.equal(summarizeNetworkExceptions([e]).events, 0);
});
