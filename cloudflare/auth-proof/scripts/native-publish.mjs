// Preview SQL only. This generator never connects to a database or publishes assets.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const root = new URL('../', import.meta.url);
const approved = JSON.parse(readFileSync(new URL('pilot/native-reviewed.json', root))).spots;
const licenses = new Map([
  ['CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/'],
  ['KOGL Type 1', 'https://www.kogl.or.kr/info/licenseType1.do'],
  ['CC0 1.0 Universal', 'https://creativecommons.org/publicdomain/zero/1.0/deed.en'],
]);
const columns = ['id','name','description','category','localley_score','photos','visible','city','address','latitude','longitude','photo_credits','source_urls'];

// trustedReviewRegistry is an explicit in-process dependency for synthetic fixtures, never a CLI option.
export function publicationSql(input, sourceRecords, trustedReviewRegistry = approved) {
  let records;
  if (Array.isArray(sourceRecords)) records = sourceRecords;
  else if (sourceRecords?.publicationReady === false) {
    if (sourceRecords.schemaVersion === 'localley-native-v1' && sourceRecords.citySlug === 'seoul'
      && sourceRecords.collection?.paidProviderCalls === 0 && Array.isArray(sourceRecords.places)) {
      // The staged transport adds kind first. Preserve all collected fields and verify the exact pinned digest below.
      records = sourceRecords.places.map(record => ({ kind: 'place', ...record }));
    } else if (sourceRecords.schemaVersion === undefined && Array.isArray(sourceRecords.records)) records = sourceRecords.records;
  }
  if (!records?.length || records.length > 5000 || Buffer.byteLength(JSON.stringify(records)) > 8 * 1024 * 1024) throw new Error('Bounded private observations required');
  const reviews = Array.isArray(input) ? input : [input];
  if (!reviews.length || reviews.length > 20 || new Set(reviews.map(r => r.id)).size !== reviews.length
    || new Set(reviews.map(r => r.providerPlaceId)).size !== reviews.length) throw new Error('Bounded unique review required');
  const rows = reviews.map(review => {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(review.id)
      || !/^visit-seoul:\d+$/.test(review.providerPlaceId) || !['culture','shopping','market'].includes(review.category)) throw new Error('Unsupported reviewed place');
    const mapping = review.legacyMapping;
    if (!(mapping?.status === 'new_preview_only' && mapping.legacyId === null)
      && !(mapping?.status === 'reviewed_existing_uuid' && mapping.legacyId === review.id && mapping.identityReviewReference)) throw new Error('Invalid identity review');
    const source = new URL(review.sourceUrl);
    if (source.origin !== 'https://english.visitseoul.net' || source.username || source.password || source.search || source.hash) throw new Error('Invalid reviewed source');
    const asset = `/pilot/${review.id}.jpg`;
    if (!isDeepStrictEqual(review.photos, [asset]) || review.photoCredits?.length !== 1) throw new Error('One reviewed image required');
    const credit = review.photoCredits[0];
    const pinned = trustedReviewRegistry.find(r => r.id === review.id);
    if (credit.url !== asset || !credit.author?.trim() || !licenses.has(credit.license)
      || licenses.get(credit.license) !== credit.licenseUrl || credit.sourceUrl !== pinned?.photoCredits[0].sourceUrl) throw new Error('Unsupported image license review');
    if (credit.takenAt && (!credit.caption?.includes(credit.takenAt) || !review.description?.en?.includes(credit.takenAt.slice(0,4)))) throw new Error('Historical caption required');
    const imageFile = new URL(`pilot/images/${review.id}.jpg`, root);
    if (!lstatSync(imageFile).isFile()) throw new Error('Reviewed image must be a regular file');
    const bytes = readFileSync(imageFile);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Reviewed JPEG required');
    if (createHash('sha256').update(bytes).digest('hex') !== review.imageSha256) throw new Error('Reviewed image bytes changed');
    if (!review.description?.en || review.description.en.length > 500 || !review.name?.en) throw new Error('Reviewed factual copy required');
    if (!Number.isFinite(review.latitude) || !Number.isFinite(review.longitude) || review.latitude < 37.15
      || review.latitude > 37.99 || review.longitude < 126.45 || review.longitude > 127.50) throw new Error('Reviewed Seoul coordinates required');
    if (review.localleyScore != null || review.localley_score != null) throw new Error('Native publication cannot assign scores');
    // The checked-in review is the grant. A caller cannot swap identity, facts, credits, or source URLs.
    if (!isDeepStrictEqual(review, pinned)) throw new Error('Unapproved review changes');
    const observation = review.actualCandidate;
    if (!/^[a-f0-9]{64}$/.test(observation?.recordId) || !Number.isFinite(Date.parse(observation?.observedAt))
      || !observation.sourceNameEn) throw new Error('Reviewed native observation required');
    const candidates = records.filter(record => record?.providerPlaceId === review.providerPlaceId);
    const matching = candidates.filter(record => record.recordId === observation.recordId
      && record.provenance?.observedAt === observation.observedAt && record.provenance?.sourceUrl === review.sourceUrl
      && createHash('sha256').update(JSON.stringify(record)).digest('hex') === observation.payloadSha256);
    if (!matching.length || candidates.some(record => !Number.isFinite(Date.parse(record.provenance?.observedAt))
      || Date.parse(record.provenance.observedAt) > Date.parse(observation.observedAt)
      || (Date.parse(record.provenance.observedAt) === Date.parse(observation.observedAt)
        && JSON.stringify(record) !== JSON.stringify(matching[0])))) throw new Error('Missing, changed, or stale private observation');
    const candidate = matching[0];
    if (candidate.kind !== 'place' || candidate.citySlug !== 'seoul' || candidate.countryCode !== 'KR'
      || candidate.name?.en !== observation.sourceNameEn || candidate.address?.en !== review.address
      || candidate.latitude !== review.latitude || candidate.longitude !== review.longitude
      || candidate.verified !== false || candidate.state !== 'pending' || candidate.category != null || candidate.localleyScore != null
      || !Array.isArray(candidate.issues) || candidate.issues.some(issue => ['outside_city_pilot_radius','missing_or_invalid_coordinates','missing_address'].includes(issue))) throw new Error('Private observation facts do not match review');
    const payload = JSON.stringify(candidate);
    const values = [review.id, JSON.stringify(review.name), JSON.stringify(review.description), review.category, null,
      JSON.stringify(review.photos), 1, 'Seoul', review.address, review.latitude, review.longitude,
      JSON.stringify(review.photoCredits), JSON.stringify(review.sourceUrls), `english.visitseoul.net:${review.providerPlaceId}`,
      review.providerPlaceId, review.sourceUrl, observation.recordId, observation.observedAt, observation.sourceNameEn, payload];
    return '(' + values.map(v => v === null ? 'NULL' : typeof v === 'number' ? String(v) : quote(v)).join(',') + ')';
  });
  const equal = columns.map(c => `s.${c} IS r.${c}`).join(' AND ');
  const cte = `WITH reviewed(${columns.join(',')},source_key,provider_id,source_url,record_id,observed_at,source_name,source_payload) AS (VALUES ${rows.join(',\n')})`;
  // One atomic INSERT validates every row before inserting any row. No unsupported BEGIN/COMMIT,
  // silent ON CONFLICT, temporary schema, or mutation of an existing public record is needed.
  return `-- PREVIEW ONLY. Requires the reviewed assets to be staged separately. Never use on production.
${cte}, checked AS MATERIALIZED (
 SELECT r.*, CASE WHEN EXISTS(SELECT 1 FROM runtime_purpose WHERE id=1 AND purpose='localley-preview') AND
 EXISTS(SELECT 1 FROM native_place_candidates c WHERE c.source_key=r.source_key AND c.source_url=r.source_url
   AND c.payload=r.source_payload
   AND c.city='seoul' AND c.observed_at=r.observed_at
   AND json_extract(c.payload,'$.recordId')=r.record_id
   AND json_extract(c.payload,'$.providerPlaceId')=r.provider_id
   AND json_extract(c.payload,'$.provenance.sourceUrl')=r.source_url
   AND json_extract(c.payload,'$.provenance.observedAt')=r.observed_at
   AND json_extract(c.payload,'$.kind')='place'
   AND json_extract(c.payload,'$.citySlug')='seoul' AND json_extract(c.payload,'$.countryCode')='KR'
   AND json_extract(c.payload,'$.name.en')=r.source_name
   AND json_extract(c.payload,'$.address.en')=r.address
   AND json_extract(c.payload,'$.latitude')=r.latitude AND json_extract(c.payload,'$.longitude')=r.longitude
   AND json_type(c.payload,'$.latitude') IN ('real','integer') AND json_type(c.payload,'$.longitude') IN ('real','integer')
   AND json_type(c.payload,'$.verified')='false' AND json_extract(c.payload,'$.state')='pending'
   AND json_extract(c.payload,'$.localleyScore') IS NULL AND json_extract(c.payload,'$.category') IS NULL
   AND json_type(c.payload,'$.issues')='array'
   AND NOT EXISTS(SELECT 1 FROM json_each(c.payload,'$.issues') WHERE value IN ('outside_city_pilot_radius','missing_or_invalid_coordinates','missing_address'))
   AND ((c.match_state='unmatched' AND c.matched_spot_id IS NULL)
     OR (c.match_state='exact_source' AND c.matched_spot_id=r.id)))
 AND NOT EXISTS(SELECT 1 FROM spots s,json_each(COALESCE(s.source_urls,'[]')) u WHERE u.value=r.source_url AND s.id<>r.id)
 AND NOT EXISTS(SELECT 1 FROM spots s WHERE s.id=r.id AND NOT (${equal}))
 THEN 1 ELSE json('Native publication guard failed') END AS valid FROM reviewed r
)
INSERT INTO spots(${columns.join(',')})
SELECT ${columns.map(c => `r.${c}`).join(',')} FROM checked r
WHERE r.valid=1 AND NOT EXISTS(SELECT 1 FROM spots s WHERE s.id=r.id)
RETURNING id AS insertedPreviewId;
${cte}
UPDATE native_place_candidates AS c SET matched_spot_id=(SELECT r.id FROM reviewed r WHERE r.source_key=c.source_key),match_state='exact_source'
WHERE c.match_state='unmatched' AND c.matched_spot_id IS NULL
 AND EXISTS(SELECT 1 FROM reviewed r JOIN spots s ON s.id=r.id WHERE r.source_key=c.source_key
   AND c.source_url=r.source_url AND c.observed_at=r.observed_at AND c.payload=r.source_payload AND ${equal});
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [input,output,...extra] = process.argv.slice(2);
    if (!input || !output || extra.length) throw new Error('Private input and output required');
    if (!lstatSync(input).isFile() || lstatSync(input).size > 8 * 1024 * 1024) throw new Error('Bounded private input required');
    const observations = JSON.parse(readFileSync(input,'utf8'));
    if (Array.isArray(observations)) throw new Error('Private export envelope required');
    writeFileSync(output, publicationSql(approved, observations), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ reviewedPlaces: approved.length, maximumInsertions: approved.length,
      insertedPlaces: null, insertionReceipt: 'Count insertedPreviewId rows from INSERT RETURNING; generation does not insert rows', target: 'Localley preview only' }));
  } catch {
    // JSON parse errors can include source text. Never print private input, paths, or raw errors.
    console.error('Native publication failed closed. Usage: node scripts/native-publish.mjs PRIVATE_INPUT.json PRIVATE_OUTPUT.sql');
    process.exitCode = 1;
  }
}
