/** One bounded dependency probe. Never retain credentials, rows, or provider error text. */
const sourceOrigin = 'https://llehrhqeolfprutcaopi.supabase.co';
const scope = 'one_read_only_billing_query_not_checkout_or_data_parity';

export async function checkSourceDatabase(configuration, fetcher = fetch) {
  const result = { checked: true, usable: false, status: null, scope };
  // Pin the destination before attaching the privileged server credential.
  if (configuration?.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') !== sourceOrigin
      || typeof configuration?.SUPABASE_SERVICE_ROLE_KEY !== 'string'
      || !configuration.SUPABASE_SERVICE_ROLE_KEY.trim()) {
    return { ...result, reason: 'source_configuration_unavailable' };
  }
  try {
    const response = await fetcher(`${sourceOrigin}/rest/v1/subscriptions?select=id&limit=0`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: configuration.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${configuration.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
      ? response.status : null;
    // This query returns no rows. Discard all response content, including error bodies.
    await response.body?.cancel();
    return { ...result, status, usable: status === 200,
      reason: status === 200 ? 'billing_query_available'
        : status === 544 ? 'database_timeout' : 'billing_query_failed' };
  } catch {
    return { ...result, reason: 'billing_query_failed_or_timed_out' };
  }
}
