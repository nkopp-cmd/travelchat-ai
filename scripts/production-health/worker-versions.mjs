import { recordEventTime, summarizeEventTime } from './event-times.mjs';

// Only the provider's scriptVersion.id identifies a Worker version. Do not
// infer it from messages, headers, URL queries or application metadata.
export function workerVersionId(event) {
  const candidate = event?.$workers?.scriptVersion?.id;
  return typeof candidate === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate.toLowerCase() : null;
}

export function summarizeWorkerVersions(events, timeframe, errorGroups) {
  const groups = new Map();
  for (const event of events) {
    const versionId = workerVersionId(event);
    groups.set(versionId, recordEventTime(groups.get(versionId), event?.timestamp, timeframe));
  }
  const ordered = [...groups].map(([versionId, times]) => ({ versionId, ...summarizeEventTime(times) }))
    .sort((a, b) => b.count - a.count || (String(a.versionId) < String(b.versionId) ? -1 : String(a.versionId) > String(b.versionId) ? 1 : 0));
  return { scope: 'returned_events_only', attribution: 'provider_script_version_only', totalEvents: events.length,
    unknownVersionEvents: groups.get(null)?.count ?? 0,
    versions: ordered.slice(0, 20).map(version => {
      if (errorGroups === undefined) return version;
      // These groups come from the same sanitized classification pass as global top5.
      const ranked = errorGroups.filter(group => group.versionId === version.versionId)
        .map(({ path, errorClass, message, status, count, eventTimes }) => ({ path, errorClass, message, status, count, eventTimes }))
        .sort((a, b) => b.count - a.count || JSON.stringify(a).localeCompare(JSON.stringify(b)));
      if (ranked.reduce((n, group) => n + group.count, 0) !== version.count) throw Error('version_error_count_mismatch');
      return { ...version, top5: ranked.slice(0, 5), omittedErrorEvents: ranked.slice(5).reduce((n, group) => n + group.count, 0) };
    }),
    omittedEvents: ordered.slice(20).reduce((total, group) => total + group.count, 0) };
}
