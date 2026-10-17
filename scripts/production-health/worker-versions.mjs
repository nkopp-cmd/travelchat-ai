import { recordEventTime, summarizeEventTime } from './event-times.mjs';

// Only the provider's scriptVersion.id identifies a Worker version. Do not
// infer it from messages, headers, URL queries or application metadata.
export function summarizeWorkerVersions(events, timeframe) {
  const groups = new Map();
  for (const event of events) {
    const candidate = event?.$workers?.scriptVersion?.id;
    const versionId = typeof candidate === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
      ? candidate.toLowerCase() : null;
    groups.set(versionId, recordEventTime(groups.get(versionId), event?.timestamp, timeframe));
  }
  const ordered = [...groups].map(([versionId, times]) => ({ versionId, ...summarizeEventTime(times) }))
    .sort((a, b) => b.count - a.count || (String(a.versionId) < String(b.versionId) ? -1 : String(a.versionId) > String(b.versionId) ? 1 : 0));
  return { scope: 'returned_events_only', attribution: 'provider_script_version_only', totalEvents: events.length,
    unknownVersionEvents: groups.get(null)?.count ?? 0,
    versions: ordered.slice(0, 20),
    omittedEvents: ordered.slice(20).reduce((total, group) => total + group.count, 0) };
}
