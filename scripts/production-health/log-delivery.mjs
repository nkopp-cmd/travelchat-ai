// Only a generated public catalog probe may be queried. Never persist telemetry payloads.
const account = '664f242340bcec2f32daaeee15f58bde';
const service = 'localley-next';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validLogProbe(probe, now = Date.now()) {
  if (!probe || typeof probe !== 'object' || Array.isArray(probe)
      || Object.keys(probe).sort().join(',') !== 'startedAt,status,url,version'
      || probe.version !== 1 || probe.status !== 200 || !Number.isInteger(probe.startedAt)
      || probe.startedAt > now || now - probe.startedAt > 48 * 3600000) return false;
  try {
    const url = new URL(probe.url);
    return url.origin === 'https://www.localley.io' && !url.username && !url.password && !url.hash
      && url.pathname === '/api/cities' && [...url.searchParams.keys()].sort().join(',') === 'healthCanary,includeHidden,noCache'
      && url.searchParams.get('noCache') === 'true' && url.searchParams.get('includeHidden') === 'true'
      && uuid.test(url.searchParams.get('healthCanary') || '');
  } catch { return false; }
}

export async function checkLogDelivery(token, probe, { fetchImpl = fetch, now = Date.now() } = {}) {
  const base = { scope: 'one_previous_controlled_catalog_request', completeCoverage: false, confirmed: false };
  if (!probe) return { ...base, reason: 'no_previous_probe' };
  if (!validLogProbe(probe, now)) return { ...base, reason: 'invalid_or_expired_probe' };
  const ageSeconds = Math.floor((now - probe.startedAt) / 1000);
  const query = { queryId: 'localley-controlled-log-delivery', dry: true, view: 'events', limit: 20,
    timeframe: { from: probe.startedAt - 1000, to: Math.min(now, probe.startedAt + 60000) },
    parameters: { filters: [
      { key: '$metadata.service', operation: 'eq', type: 'string', value: service },
      { key: '$metadata.type', operation: 'eq', type: 'string', value: 'cf-worker-event' },
      { key: '$metadata.url', operation: 'eq', type: 'string', value: probe.url },
    ] } };
  try {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(query), signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) { await response.body?.cancel(); throw Error('query'); }
    const data = await response.json(), events = data.result?.events?.events;
    if (!data.success || data.errors?.length || data.result?.run?.status !== 'COMPLETED'
        || !Array.isArray(events) || events.length > 20) throw Error('query');
    const matched = events.filter(event => {
      const m = event?.$metadata, w = event?.$workers;
      const statuses = [m?.statusCode, w?.event?.response?.status].filter(x => x !== undefined);
      return m?.service === service && m.type === 'cf-worker-event' && m.url === probe.url
        && w?.outcome === 'ok' && uuid.test(w?.scriptVersion?.id || '')
        && w?.event?.request?.method === 'GET' && statuses.length > 0 && statuses.every(x => x === 200)
        && Number.isInteger(event.timestamp) && event.timestamp >= query.timeframe.from && event.timestamp <= query.timeframe.to;
    });
    const versions = [...new Set(matched.map(event => event.$workers.scriptVersion.id.toLowerCase()))];
    if (versions.length !== 1) return { ...base, ageSeconds, reason: 'matching_invocation_not_observed' };
    return { ...base, confirmed: true, ageSeconds, reason: 'matching_invocation_observed',
      versionId: versions[0], matchedInvocations: matched.length, status: 200, outcome: 'ok' };
  } catch { return { ...base, ageSeconds, reason: 'query_unavailable' }; }
}
