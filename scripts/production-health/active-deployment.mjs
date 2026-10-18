// A deployment snapshot identifies configured traffic at inspection time only.
// Returned error events can predate it, include version overrides, or be sampled.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const unknown = () => ({ available: false, scope: 'configuration_at_inspection_only',
  coverageWarnings: ['active_deployment_unavailable', 'error_absence_not_proven'] });

export function summarizeActiveDeployment(result, versions) {
  const deployment = result?.deployments?.[0];
  if (!uuid(deployment?.id) || !Array.isArray(deployment.versions) || !deployment.versions.length
      || deployment.versions.length > 2 || !Number.isFinite(Date.parse(deployment.created_on))) return unknown();
  const seen = new Set(); let percentage = 0;
  for (const version of deployment.versions) {
    if (!uuid(version?.version_id) || seen.has(version.version_id.toLowerCase())
        || typeof version.percentage !== 'number' || !Number.isFinite(version.percentage)
        || version.percentage <= 0 || version.percentage > 100) return unknown();
    seen.add(version.version_id.toLowerCase()); percentage += version.percentage;
  }
  if (Math.abs(percentage - 100) > 0.000001) return unknown();
  const validSummary = versions?.scope === 'returned_events_only' && Array.isArray(versions.versions)
    && Number.isSafeInteger(versions.totalEvents) && versions.totalEvents >= 0
    && Number.isSafeInteger(versions.omittedEvents) && versions.omittedEvents >= 0;
  const activeVersions = deployment.versions.map(version => {
    const versionId = version.version_id.toLowerCase();
    const match = validSummary ? versions.versions.find(v => v.versionId === versionId) : undefined;
    return { versionId, percentage: version.percentage,
      returnedWindowErrorEvents: match?.count ?? (validSummary && versions.omittedEvents === 0 ? 0 : null) };
  });
  return { available: true, scope: 'configuration_at_inspection_only', deploymentId: deployment.id.toLowerCase(),
    createdAt: new Date(deployment.created_on).toISOString(), activeVersions,
    coverageWarnings: ['returned_events_may_predate_deployment', 'version_overrides_not_excluded', 'error_absence_not_proven'] };
}

export async function auditActiveDeployment(token, versions, request = fetch) {
  if (typeof token !== 'string' || !token) return unknown();
  try {
    const response = await request('https://api.cloudflare.com/client/v4/accounts/664f242340bcec2f32daaeee15f58bde/workers/scripts/localley-next/deployments', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(8000), headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) { await response.body?.cancel(); return unknown(); }
    if (!response.body) return unknown();
    const reader = response.body.getReader(), chunks = []; let bytes = 0, complete = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) { complete = true; break; }
        bytes += value.byteLength; if (bytes > 65536) return unknown(); chunks.push(value);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return data?.success === true && (!data.errors || Array.isArray(data.errors) && data.errors.length === 0)
        ? summarizeActiveDeployment(data.result, versions) : unknown();
    } finally { if (!complete) await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } catch { return unknown(); }
}
