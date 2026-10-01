// Whitelist coverage metadata; never serialize query definitions or log payloads.
const boundedNumber = value => typeof value === 'number' && Number.isFinite(value)
  && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;

export function summarizeQueryCoverage(result, returnedEvents, limit = 500) {
  // Cloudflare documents absent ABR as level 1. An invalid present value stays unknown.
  const rawLevel = result?.statistics?.abr_level ?? result?.run?.statistics?.abr_level;
  const candidate = rawLevel == null ? 1 : boundedNumber(rawLevel);
  const abrLevel = candidate !== null && candidate >= 1 ? candidate : null;
  const sampled = abrLevel === null ? null : abrLevel > 1;
  const matchingEventsReported = boundedNumber(result?.events?.count);
  const truncated = returnedEvents >= limit || (matchingEventsReported !== null && matchingEventsReported > returnedEvents);
  const warnings = ['ingestion_sampling_not_audited'];
  if (sampled) warnings.push('query_sampled');
  if (sampled === null) warnings.push('query_sampling_unknown');
  if (matchingEventsReported === null) warnings.push('matching_count_unknown');
  if (truncated) warnings.push('event_result_incomplete');
  return { querySampling: { abrLevel, sampled }, matchingEventsReported, truncated,
    rankingScope: 'returned_events_only', coverageWarnings: warnings };
}
