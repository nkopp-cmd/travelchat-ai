export const photoFailureReasons = [
  'rate_limit_unavailable', 'source_unavailable', 'provider_key_missing',
  'provider_http', 'provider_payload_oversize', 'provider_payload_missing',
  'provider_payload_invalid', 'listing_id_conflict', 'listing_city_conflict',
  'listing_coordinate_conflict', 'listing_name_conflict', 'request_timeout',
  'request_exception',
];

/** Parse our bounded event only. Never copy arbitrary provider or customer text. */
export function parsePhotoFailure(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('[spot-photos] ') || raw.length > 500) return null;
  try {
    const data = JSON.parse(raw.slice('[spot-photos] '.length));
    if (!data || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.spotId)
      || !photoFailureReasons.includes(data.reason) || ![502, 503, 504].includes(data.status)
      || (data.upstreamStatus !== undefined && (!Number.isInteger(data.upstreamStatus)
        || data.upstreamStatus < 100 || data.upstreamStatus > 599))) return null;
    return { spotId: data.spotId.toLowerCase(), reason: data.reason, status: data.status,
      ...(data.upstreamStatus === undefined ? {} : { upstreamStatus: data.upstreamStatus }) };
  } catch { return null; }
}
