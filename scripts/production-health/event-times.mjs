// Use only the documented root event timestamp (epoch milliseconds).
// Never infer time from user text, URL fields, metadata strings or other units.
export function recordEventTime(previous, timestamp, timeframe) {
  const group = previous || { count: 0, known: 0, unknown: 0, first: null, last: null };
  group.count++;
  const { from, to } = timeframe || {};
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to > 253402300799999
    || from > to || !Number.isSafeInteger(timestamp) || timestamp < from || timestamp > to) {
    group.unknown++;
  } else {
    group.known++;
    group.first = group.first === null ? timestamp : Math.min(group.first, timestamp);
    group.last = group.last === null ? timestamp : Math.max(group.last, timestamp);
  }
  return group;
}

export function summarizeEventTime(group) {
  return { count: group.count, eventTimes: {
    firstSeen: group.first === null ? null : new Date(group.first).toISOString(),
    lastSeen: group.last === null ? null : new Date(group.last).toISOString(),
    knownCount: group.known, unknownCount: group.unknown, scope: 'returned_events_only',
  } };
}
