import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { prepareNativeImport } from '../cloudflare/auth-proof/scripts/native-import.mjs';

export const ORIGIN = 'https://llehrhqeolfprutcaopi.supabase.co';
export const TARGET = 'production-supabase';
export const sha256 = text => createHash('sha256').update(text).digest('hex');
const reviewNames = new Map(Object.entries({
  14618: "Mother and Daughter's Gimbap", 1537: 'Seoul Museum of Art (Seosomun Main Building)',
  24680: 'Dongdaemun Design Plaza (DDP)', 24707: 'Sewoon Shopping Center', 24725: 'Gukseon Otchil',
  26253: 'Soonhee Food', 287: 'Gwangjang Market', 35: 'Cheonggyecheon Stream', 47532: 'Public Garden',
  508: 'Jongoh Underground Shopping Center', 51933: 'Hyeongje Yukhoe Main', 549: 'Jongmyo Shrine', 73: 'Gyeongbokgung Palace',
}));
const reviewColumns = 'id,name,address,location,google_place_id,destination_id,local_area_id';

export function verifyTarget(target, origin) {
  if (target !== TARGET || origin !== ORIGIN) throw new Error('Explicit production target and pinned configured origin required');
  return ORIGIN;
}

export function prepareProductionBatch(input, mappings = [], now = Date.now()) {
  if (input?.schemaVersion !== 'localley-native-v1' || input.citySlug !== 'seoul'
    || input.collection?.paidProviderCalls !== 0 || input.publicationReady !== false
    || !Array.isArray(input.places) || input.places.length > 5000) throw new Error('Versioned zero-paid private feed required');
  const accepted = new Map(), observationHashes = new Map(), validated = [];
  // Validate individually: the preview validator's equal-time lexical winner is not a production conflict policy.
  for (const place of input.places) {
    if (place.kind && place.kind !== 'place') throw new Error('Social evidence requires separate acceptance');
    const validation = prepareNativeImport({ ...input, places: [place] }, now);
    if (validation.rejected.length || validation.accepted !== 1) throw new Error('Invalid native place');
    const payload = JSON.stringify({ ...place, kind: 'place' });
    const key = `english.visitseoul.net:${place.providerPlaceId}`;
    const row = { key, payload, hash: sha256(payload) };
    const observed = Date.parse(place.provenance.observedAt);
    const observationKey = `${key}:${observed}`;
    const priorHash = observationHashes.get(observationKey);
    if (priorHash !== undefined && priorHash !== row.hash) throw new Error('Equal observation conflict');
    observationHashes.set(observationKey, row.hash);
    validated.push({ row, observed });
  }
  // A newer record must not hide conflicting older observations in the same input.
  for (const { row, observed } of validated) {
    const prior = accepted.get(row.key);
    if (prior) {
      const oldTime = Date.parse(JSON.parse(prior.payload).provenance.observedAt);
      if (oldTime >= observed) continue;
    }
    accepted.set(row.key, row);
  }
  if (!accepted.size || accepted.size > 1000 || !Array.isArray(mappings) || mappings.length > accepted.size) throw new Error('Batch bounds exceeded');
  mappings = mappings.map(mapping => typeof mapping?.spotId === 'string'
    ? { ...mapping, spotId: mapping.spotId.toLowerCase() } : mapping);
  const boundKeys = new Set(), boundIds = new Set();
  for (const mapping of mappings) {
    const candidate = accepted.get(mapping?.sourceKey);
    const expected = mapping?.expected;
    if (!candidate || boundKeys.has(mapping.sourceKey) || boundIds.has(mapping.spotId)
      || mapping.identityApproved !== true || mapping.sourceDomain !== 'english.visitseoul.net'
      || mapping.sourceUrl !== JSON.parse(candidate.payload).provenance.sourceUrl
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mapping.spotId || '')
      || !expected || Array.isArray(expected)
      || ['name', 'address', 'location', 'google_place_id', 'destination_id', 'local_area_id'].some(key => !Object.hasOwn(expected, key))) {
      throw new Error('Explicit complete identity manifest required');
    }
    boundKeys.add(mapping.sourceKey); boundIds.add(mapping.spotId);
  }
  const rows = [...accepted.values()].sort((a, b) => a.key < b.key ? -1 : 1);
  const body = JSON.stringify({ version: 'localley-native-production-v1', paidProviderCalls: 0, publicationReady: false, rows, mappings });
  if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('Batch exceeds 8 MiB');
  return { p_target: TARGET, p_origin: ORIGIN, p_body: body, p_hash: sha256(body) };
}

export async function requestProduction(path, { target, origin, key, method = 'GET', body, fetcher = fetch }) {
  verifyTarget(target, origin);
  if (!key) throw new Error('Existing service credential required');
  const url = new URL(path, origin);
  const scopedSpots = url.pathname === '/rest/v1/spots'
    && url.searchParams.get('select') === reviewColumns
    && url.searchParams.get('address->>en') === 'ilike.*Seoul*'
    && [...reviewNames.values()].some(name => url.searchParams.get('name->>en') === `eq.${name}`)
    && url.searchParams.get('limit') === '51'
    && [...url.searchParams.keys()].length === 4;
  if (url.origin !== origin || !(method === 'GET' && (path === '/rest/v1/' || scopedSpots)
    || method === 'POST' && path === '/rest/v1/rpc/native_production_ingest')) throw new Error('Unsupported or unscoped API request');
  const response = await fetcher(origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Production request failed: HTTP ${response.status}`);
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 8 * 1024 * 1024) throw new Error('Response exceeds 8 MiB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function ingestProduction(batch, options) {
  verifyTarget(options.target, options.origin);
  verifyTarget(batch.p_target, batch.p_origin);
  if (!options.apply) return { applied: false, publicationReady: false, batchHash: batch.p_hash };
  const result = await requestProduction('/rest/v1/rpc/native_production_ingest', { ...options, method: 'POST', body: batch });
  return { applied: true, publicationReady: false, result };
}

export async function readProductionReview(input, options) {
  const batch = prepareProductionBatch(input);
  const rows = JSON.parse(batch.p_body).rows;
  if (rows.some(row => {
    const place = JSON.parse(row.payload);
    return reviewNames.get(place.providerPlaceId.split(':')[1]) !== place.name.en;
  })) throw new Error('Production review is limited to the thirteen approved official name filters');
  const spec = await requestProduction('/rest/v1/', options);
  const properties = spec.definitions?.spots?.properties;
  const expected = { id: 'uuid', name: 'jsonb', address: 'jsonb', location: 'public.geography(Point,4326)', google_place_id: 'text', destination_id: 'uuid', local_area_id: 'uuid' };
  if (Object.entries(expected).some(([key, format]) => properties?.[key]?.format !== format)
    || !spec.definitions?.geo_destinations || !spec.definitions?.geo_local_areas) throw new Error('Required live schema missing or unknown');
  const matches = [];
  for (const row of rows) {
    const place = JSON.parse(row.payload);
    const query = new URLSearchParams({ select: reviewColumns,
      'address->>en': 'ilike.*Seoul*', 'name->>en': `eq.${place.name.en}`, limit: '51' });
    const spots = await requestProduction(`/rest/v1/spots?${query}`, options);
    if (!Array.isArray(spots) || spots.length > 50) throw new Error('Review match bound exceeded');
    matches.push({ sourceKey: row.key, officialName: place.name.en, state: 'unreviewed', candidates: spots });
  }
  return { target: TARGET, projectRef: 'llehrhqeolfprutcaopi', originVerified: true,
    schema: expected, constraints: 'Requires SQL catalog verification; OpenAPI is insufficient',
    nativeRpcExposed: !!spec.paths?.['/rpc/native_production_ingest'], publicationReady: false, matches };
}

async function main() {
  const args = process.argv.slice(2), values = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply' || arg === '--review') { if (values[arg]) throw new Error('Duplicate flag'); values[arg] = true; }
    else if (['--target', '--input', '--manifest', '--out'].includes(arg) && args[i + 1] && !values[arg]) values[arg] = args[++i];
    else throw new Error('Usage: --target production-supabase --input FILE [--manifest FILE] [--apply | --review --out FILE]');
  }
  dotenv.config({ path: '.env.local', quiet: true });
  const options = { target: values['--target'], origin: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY, apply: !!values['--apply'] };
  verifyTarget(options.target, options.origin);
  if (!values['--input'] || (values['--apply'] && values['--review'])) throw new Error('Input required; review cannot apply');
  const load = file => { const raw = readFileSync(file); if (raw.length > 8 * 1024 * 1024) throw new Error('Input exceeds 8 MiB'); return JSON.parse(raw); };
  const input = load(values['--input']);
  if (values['--review']) {
    if (!values['--out']) throw new Error('Private output required');
    const report = await readProductionReview(input, options);
    writeFileSync(values['--out'], JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ target: TARGET, reviewedSources: report.matches.length, applied: false }));
  } else {
    const batch = prepareProductionBatch(input, values['--manifest'] ? load(values['--manifest']) : []);
    console.log(JSON.stringify(await ingestProduction(batch, options)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Native production command failed closed. Check target, input, schema, and review requirements.'); process.exitCode = 1; });
}
