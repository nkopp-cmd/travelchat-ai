import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeQueryCoverage } from './query-coverage.mjs';

test('reports sampled results without scaling returned counts or promising completeness', () => {
  const report = summarizeQueryCoverage({ statistics: { abr_level: 10 }, events: { count: 4 } }, 4);
  assert.deepEqual(report.querySampling, { abrLevel: 10, sampled: true });
  assert.equal(report.matchingEventsReported, 4);
  assert.equal(report.truncated, false);
  assert.equal(report.rankingScope, 'returned_events_only');
  assert.deepEqual(report.coverageWarnings, ['ingestion_sampling_not_audited', 'query_sampled']);
});
test('ABR1 and absent ABR follow the documented default without implying ingestion coverage', () => {
  for (const statistics of [{ abr_level: 1 }, {}]) {
    const report = summarizeQueryCoverage({ statistics, events: { count: 38 } }, 38);
    assert.deepEqual(report.querySampling, { abrLevel: 1, sampled: false });
    assert.deepEqual(report.coverageWarnings, ['ingestion_sampling_not_audited']);
  }
});
test('detects omitted matches even when fewer than 500 events return', () => {
  const report = summarizeQueryCoverage({ statistics: { abr_level: 1 }, events: { count: 80 } }, 38);
  assert.equal(report.truncated, true);
  assert.ok(report.coverageWarnings.includes('event_result_incomplete'));
  assert.equal(summarizeQueryCoverage({ events: { count: 500 } }, 500).truncated, true);
});
test('uses run statistics only when top-level ABR is absent', () => {
  const result = { statistics: { abr_level: 10 }, run: { statistics: { abr_level: 1 } }, events: { count: 1 } };
  assert.equal(summarizeQueryCoverage(result, 1).querySampling.abrLevel, 10);
  delete result.statistics.abr_level;
  assert.equal(summarizeQueryCoverage(result, 1).querySampling.abrLevel, 1);
});
test('invalid or hostile metadata remains unknown and never enters the report', () => {
  for (const value of ['secret@example.com', {}, -1, 0, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const report = summarizeQueryCoverage({ statistics: { abr_level: value }, events: { count: 'private response' }, query: 'secret' }, 0);
    assert.deepEqual(report.querySampling, { abrLevel: null, sampled: null });
    assert.equal(report.matchingEventsReported, null);
    assert.ok(report.coverageWarnings.includes('query_sampling_unknown'));
    assert.equal(JSON.stringify(report).includes('secret'), false);
    assert.equal(JSON.stringify(report).includes('private'), false);
  }
});
test('missing matching counts and invalid counts never become proof of zero failures', () => {
  for (const count of [undefined, null, -1, NaN, Infinity, {}, '0']) {
    const report = summarizeQueryCoverage({ events: { count } }, 0);
    assert.equal(report.matchingEventsReported, null);
    assert.ok(report.coverageWarnings.includes('matching_count_unknown'));
    assert.equal(report.rankingScope, 'returned_events_only');
  }
});
