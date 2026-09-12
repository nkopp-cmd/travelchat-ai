import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const sha = value => createHash('sha256').update(value).digest('hex');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const plain = (value, max) => typeof value === 'string' && value.trim().length > 0
  && value.length <= max && !/[<>\u0000-\u001f]/.test(value);

export function prepareNativeImport(input, now = Date.now()) {
  if (!Number.isFinite(now) || input?.publicationReady !== false) throw new Error('Private native evidence required');
  const rows = input.schemaVersion === 'localley-native-v1' && input.citySlug === 'seoul'
    && input.collection?.paidProviderCalls === 0 && Array.isArray(input.places)
    ? input.places.map(row => ({ ...row, kind: 'place' }))
    : Array.isArray(input.records) ? input.records : null;
  if (!rows || rows.length > 5000) throw new Error('Unsupported or oversized native input');
  const accepted = new Map(), observations = new Map(), conflicts = new Set(), rejected = [];
  for (const row of rows) {
    try {
      if (row?.kind !== 'place') throw new Error('social_requires_separate_acceptance');
      if (row.citySlug !== 'seoul' || row.countryCode !== 'KR') throw new Error('unsupported_city');
      if (!/^visit-seoul:\d+$/.test(row.providerPlaceId || '')) throw new Error('unsupported_provider_identity');
      const source = new URL(row.provenance?.sourceUrl);
      if (source.protocol !== 'https:' || source.hostname !== 'english.visitseoul.net'
        || source.port || source.username || source.password || source.search || source.hash
        || !/(?:_\/\d+|\/ENP[A-Za-z0-9]+)\/?$/.test(source.pathname)) throw new Error('invalid_source');
      const observed = Date.parse(row.provenance?.observedAt);
      if (!Number.isFinite(observed) || observed > now || observed < now - 56 * 86400000) throw new Error('stale_or_invalid_observation');
      if (!plain(row.name?.en, 200) || !plain(row.address?.en, 500)) throw new Error('missing_name_or_address');
      if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)
        || row.latitude < 37.15 || row.latitude > 37.99 || row.longitude < 126.45 || row.longitude > 127.50) throw new Error('outside_seoul');
      if (row.verified !== false || row.state !== 'pending' || !Array.isArray(row.issues)) throw new Error('unexpected_publication_state');
      if (row.issues.some(issue => ['outside_city_pilot_radius', 'missing_or_invalid_coordinates', 'missing_address'].includes(issue))) throw new Error('source_quality_failed');
      if (!Array.isArray(row.images) || row.images.length > 4) throw new Error('invalid_images');
      // Keep source images private; never download arbitrary URLs or infer publication permission.
      for (const image of row.images) {
        const url = new URL(image.sourceUrl);
        if (url.protocol !== 'https:' || url.hostname !== source.hostname || url.pathname !== '/comm/getImage'
          || url.username || url.password || url.port || url.searchParams.get('srvcId') !== 'MEDIA') throw new Error('invalid_source_image');
      }
      const payload = JSON.stringify(row);
      if (Buffer.byteLength(payload) > 32000) throw new Error('oversized_record');
      const key = `english.visitseoul.net:${row.providerPlaceId}`;
      const candidate = { key, sourceUrl: source.href, observedAt: new Date(observed).toISOString(), payload };
      const observationKey = JSON.stringify([key, candidate.observedAt]);
      if (observations.has(observationKey) && observations.get(observationKey) !== payload) conflicts.add(key);
      observations.set(observationKey, payload);
      const previous = accepted.get(key);
      if (!previous || candidate.observedAt > previous.observedAt) accepted.set(key, candidate);
    } catch (error) {
      rejected.push({ recordId: typeof row?.recordId === 'string' ? row.recordId.slice(0, 64) : null, reason: error instanceof Error ? error.message : 'invalid_record' });
    }
  }
  if (conflicts.size) throw new Error('Equal-time native observation conflict; no import generated');
  if (accepted.size > 1000) throw new Error('Import exceeds 1000 distinct venues');
  const candidates = [...accepted.values()].sort((a, b) => a.key.localeCompare(b.key));
  const batchId = sha(JSON.stringify(candidates));
  const sql = ['-- Native evidence only; no writes to spots, photos, scores, users, or saved places.'];
  if (candidates.length) {
    // Exact provenance matching only. Name similarity never overwrites an existing UUID.
    const matches = `SELECT DISTINCT s.id FROM spots s, json_each(COALESCE(s.source_urls,'[]')) u WHERE u.value = c.source_url`;
    const count = `(SELECT COUNT(*) FROM (${matches}))`;
    const spot = `(SELECT CASE WHEN COUNT(*) = 1 THEN MIN(id) ELSE NULL END FROM (${matches}))`;
    const values = candidates.map(row => `(${[row.key,row.observedAt,row.sourceUrl,row.payload].map(quote).join(',')})`).join(',\n');
    // Materialize every conflict check before the single candidate write. A conflict or
    // capacity failure aborts the whole statement; no partial candidate batch can survive.
    sql.push(`WITH incoming(source_key,observed_at,source_url,payload) AS (VALUES ${values}),
checked AS MATERIALIZED (
 SELECT i.*,CASE WHEN EXISTS(SELECT 1 FROM runtime_purpose WHERE id=1 AND purpose='localley-preview')
 AND NOT EXISTS(SELECT 1 FROM native_place_candidates old WHERE old.source_key=i.source_key
   AND old.observed_at=i.observed_at AND old.payload COLLATE BINARY IS NOT i.payload)
 THEN 1 ELSE json('Native import conflict or target mismatch') END AS valid FROM incoming i
)
INSERT INTO native_place_candidates(source_key,city,observed_at,source_url,payload,matched_spot_id,match_state,batch_id)
SELECT c.source_key,'seoul',c.observed_at,c.source_url,c.payload,${spot},CASE ${count} WHEN 0 THEN 'unmatched' WHEN 1 THEN 'exact_source' ELSE 'ambiguous' END,${quote(batchId)}
FROM checked c WHERE c.valid=1
ON CONFLICT(source_key) DO UPDATE SET observed_at=excluded.observed_at,source_url=excluded.source_url,payload=excluded.payload,
matched_spot_id=excluded.matched_spot_id,match_state=excluded.match_state,batch_id=excluded.batch_id
WHERE excluded.observed_at > native_place_candidates.observed_at
 OR (excluded.observed_at=native_place_candidates.observed_at AND excluded.payload COLLATE BINARY IS native_place_candidates.payload);`);
  }
  // All rows are retry-safe. A receipt is written last, only after the preceding inserts succeed.
  sql.push(`INSERT INTO native_import_receipts VALUES(${quote(batchId)},${quote(new Date(now).toISOString())},${candidates.length},${rejected.length}) ON CONFLICT(batch_id) DO NOTHING;`);
  sql.push(`DELETE FROM native_import_receipts WHERE imported_at < ${quote(new Date(now - 14 * 86400000).toISOString())};`);
  return { batchId, accepted: candidates.length, rejected, publicationReady: false, sql: sql.join('\n') + '\n' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('Usage: node scripts/native-import.mjs INPUT.json OUTPUT.sql');
  const raw = readFileSync(input);
  if (raw.length > 8 * 1024 * 1024) throw new Error('Input exceeds 8 MiB');
  const { sql, ...receipt } = prepareNativeImport(JSON.parse(raw));
  if (!receipt.accepted) throw new Error('No acceptable native places');
  writeFileSync(output, sql, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(receipt));
}
