// Audit current configuration only; this does not certify ingestion over the query window.
const bool = value => typeof value === 'boolean' ? value : null;
const rate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => ({ available: false, scope: 'current_configuration_only', usable: false,
  coverageWarnings: ['logging_configuration_unavailable', 'ingestion_delivery_not_proven'] });

export function summarizeIngestionSettings(settings) {
  if (!object(settings?.observability) || !object(settings.observability.logs)) return unavailable();
  const o = settings.observability, logs = o.logs;
  // Only documented optional sampling rates receive their default. Invalid values stay unknown.
  const sampling = value => value == null ? 1 : rate(value);
  const configuration = { enabled: bool(o.enabled), headSamplingRate: sampling(o.head_sampling_rate),
    logsEnabled: bool(logs.enabled), logSamplingRate: sampling(logs.head_sampling_rate),
    invocationLogs: bool(logs.invocation_logs), persist: bool(logs.persist) };
  const warnings = ['ingestion_delivery_not_proven'];
  if (Object.values(configuration).some(value => value === null)) warnings.push('logging_configuration_incomplete');
  for (const [field, warning] of [['enabled','observability_disabled'],['logsEnabled','logs_disabled'],
    ['invocationLogs','invocation_logs_disabled'],['persist','log_persistence_disabled']]) {
    if (configuration[field] === false) warnings.push(warning);
  }
  if ([configuration.headSamplingRate, configuration.logSamplingRate].some(value => value !== null && value < 1)) {
    warnings.push('ingestion_sampling_configured');
  }
  return { available: true, scope: 'current_configuration_only', configuration,
    usable: configuration.enabled === true && configuration.logsEnabled === true
      && configuration.invocationLogs === true && configuration.persist === true
      && configuration.headSamplingRate !== null && configuration.headSamplingRate > 0
      && configuration.logSamplingRate !== null && configuration.logSamplingRate > 0,
    coverageWarnings: warnings };
}

export async function auditIngestionSettings(token, request = fetch) {
  if (typeof token !== 'string' || !token) return unavailable();
  try {
    const response = await request('https://api.cloudflare.com/client/v4/accounts/664f242340bcec2f32daaeee15f58bde/workers/scripts/localley-next/script-settings', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(8000), headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) { await response.body?.cancel(); return unavailable(); }
    if (!response.body) return unavailable();
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    let data;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 65536) throw Error('oversized_settings');
        chunks.push(Buffer.from(value));
      }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (data?.success !== true || (data.errors != null && (!Array.isArray(data.errors) || data.errors.length > 0))) return unavailable();
    return summarizeIngestionSettings(data.result);
  } catch { return unavailable(); }
}
