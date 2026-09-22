// Build D1 import SQL from the verified private source snapshot and the R2 story projection.
// It never contacts Supabase, Clerk, Stripe or Cloudflare. Output is private data: keep it in
// .preview-private or another private directory, never in Git.
//
//   node scripts/legacy-import.mjs --snapshot DIR --projection DIR --out FILE.sql --report FILE.json
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex');
export const IMPORTED_TABLES = ['owners', 'legacy_owners', 'profiles', 'owner_limits', 'legacy_profile_stats', 'spots', 'legacy_spot_source',
  'spot_listing_places', 'itineraries', 'legacy_itinerary_media', 'conversations', 'messages', 'legacy_subscriptions', 'legacy_usage'];
// Source tables that stay archived in R2 until their feature is ported. They are counted, not dropped.
export const ARCHIVED_ONLY = ['affiliate_clicks', 'affiliate_earnings', 'apify_spot_candidates', 'apify_spot_discovery_runs', 'challenges',
  'content_engagement', 'contribution_token_ledger', 'early_adopters', 'follows', 'geo_aliases', 'geo_countries', 'geo_destinations',
  'geo_local_area_vibe_scores', 'geo_local_areas', 'geo_vibe_taxonomy', 'guide_earnings', 'guide_profiles', 'review_helpful_votes',
  'saved_itineraries', 'saved_spots', 'social_spot_submission_aliases', 'social_spot_submission_candidates', 'social_spot_submission_media',
  'social_spot_submission_media_jobs', 'social_spot_submissions', 'spot_contributors', 'spot_reviews', 'story_image_jobs', 'transfer_edges',
  'trip_activities', 'trip_days', 'trip_stops', 'trip_transfer_legs', 'trips', 'user_challenges', 'user_progress', 'weekly_city_spot_rankings',
  'weekly_social_content', 'weekly_social_spot_leads', 'weekly_social_trend_city_builds', 'weekly_social_trend_runs'];
const IMPORTED_SOURCES = ['users', 'spots', 'itineraries', 'conversations', 'messages', 'subscriptions', 'usage_tracking'];

// Snapshot pages are verified against the manifest hash before any row is used.
export function loadSnapshot(dir) {
  const manifestBytes = readFileSync(join(dir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.complete !== true || !Array.isArray(manifest.tables)) throw new Error('Snapshot manifest is not complete');
  const tables = {};
  for (const table of manifest.tables) {
    const rows = [];
    for (const page of table.pages) {
      const bytes = readFileSync(join(dir, page.file));
      if (sha256(bytes) !== page.sha256) throw new Error(`Hash mismatch: ${page.file}`);
      const parsed = JSON.parse(bytes);
      const pageRows = Array.isArray(parsed) ? parsed : parsed.rows;
      if (pageRows.length !== page.rows) throw new Error(`Row count mismatch: ${page.file}`);
      rows.push(...pageRows);
    }
    if (rows.length !== (table.count ?? 0)) throw new Error(`Count mismatch: ${table.name}`);
    tables[table.name] = rows;
  }
  for (const name of IMPORTED_SOURCES) if (!tables[name]) throw new Error(`Missing source table ${name}`);
  const unknown = Object.keys(tables).filter(name => !IMPORTED_SOURCES.includes(name) && !ARCHIVED_ONLY.includes(name));
  if (unknown.length) throw new Error(`Unclassified source tables: ${unknown.join(',')}`);
  return { manifestSha256: sha256(manifestBytes), tables };
}

export function loadProjection(dir) {
  const rows = new Map();
  const hash = createHash('sha256');
  for (const file of readdirSync(dir).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).sort()) {
    const bytes = readFileSync(join(dir, file));
    hash.update(file).update(bytes);
    const row = JSON.parse(bytes);
    if (`${row.id}.json` !== file) throw new Error(`Projection id mismatch: ${file}`);
    rows.set(row.id, row);
  }
  return { projectionSha256: hash.digest('hex'), rows };
}

// Existing public-quality and city rules from the live application, bundled from source.
export async function loadRules() {
  const root = resolve(here, '../../..');
  const out = await build({ stdin: { contents: `export { shouldShowPublicSpot, getPublicSpotQualityIssue } from '@/lib/spots/public-quality';
    export { inferCityFromAddress } from '@/lib/cities';`, resolveDir: root, sourcefile: 'rules.ts', loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'neutral', tsconfig: join(root, 'tsconfig.json'), logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}

// EWKB point with SRID 4326, little endian: 0101000020E6100000 + x + y.
export function wkbPoint(value) {
  if (typeof value !== 'string' || !/^0101000020E6100000[0-9A-Fa-f]{32}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'hex');
  const lng = bytes.readDoubleLE(9), lat = bytes.readDoubleLE(17);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
export function photoPlaceIds(photos) {
  const ids = new Set();
  for (const photo of Array.isArray(photos) ? photos : []) {
    const text = typeof photo === 'string' ? photo : JSON.stringify(photo);
    for (const match of text.matchAll(/places(?:\/|%2F)([A-Za-z0-9_-]{1,256})(?:\/|%2F)photos/g)) ids.add(match[1]);
  }
  return [...ids];
}
const text = value => value && typeof value === 'object' ? value.en ?? Object.values(value)[0] ?? '' : value ?? '';
export function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Non-finite number'); return String(value); }
  if (typeof value === 'object') value = JSON.stringify(value);
  if (/\u0000/.test(value)) throw new Error('NUL in text');
  // Keep every statement on one line without deep expressions (D1 limits expression depth to 100):
  // text with line breaks is stored through one JSON string literal.
  const quote = raw => `'${raw.replaceAll("'", "''")}'`;
  return /[\r\n]/.test(value) ? `json_extract(${quote(JSON.stringify(String(value)))}, '$')` : quote(String(value));
}
const insert = (table, row) => `INSERT OR IGNORE INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(sql).join(', ')});`;

// Returns the ordered expected rows per D1 table plus the SQL text.
export function buildImport(snapshot, projection, rules) {
  const t = snapshot.tables;
  const expected = Object.fromEntries(IMPORTED_TABLES.map(name => [name, []]));
  const users = new Map(t.users.map(user => [user.clerk_id, user]));
  const ownerIds = new Set(t.users.map(user => user.clerk_id));
  for (const name of ['itineraries', 'conversations', 'subscriptions', 'usage_tracking']) for (const row of t[name]) {
    if (typeof row.clerk_user_id !== 'string' || !row.clerk_user_id) throw new Error(`Row without owner in ${name}`);
    ownerIds.add(row.clerk_user_id);
  }
  const batchId = sha256(`${snapshot.manifestSha256}:${projection.projectionSha256}:legacy-import-v1`);
  for (const ownerId of [...ownerIds].sort()) {
    expected.owners.push({ id: ownerId, source: 'legacy-fixture' });
    expected.legacy_owners.push({ ownerId, clerkUserId: ownerId, hasSourceProfile: users.has(ownerId) ? 1 : 0, batchId });
    // Server-controlled default quota; paid tiers are not inferred from legacy rows.
    expected.owner_limits.push({ ownerId, savedSpotLimit: 10 });
  }
  for (const user of t.users) {
    expected.profiles.push({ id: user.id, ownerId: user.clerk_id });
    expected.legacy_profile_stats.push({ profileId: user.id, username: user.username, xp: user.xp, level: user.level, title: user.title, createdAt: user.created_at });
  }
  const issues = {};
  for (const spot of t.spots) {
    const point = wkbPoint(spot.location);
    const issue = rules.getPublicSpotQualityIssue({ name: spot.name, address: spot.address, location: spot.location, photos: spot.photos, google_place_id: spot.google_place_id });
    issues[issue ?? 'public'] = (issues[issue ?? 'public'] ?? 0) + 1;
    const address = text(spot.address);
    const score = Number.isInteger(spot.localley_score) && spot.localley_score >= 1 && spot.localley_score <= 6 ? spot.localley_score : null;
    // Legacy Google photo proxies are not copied: listing photos are resolved at request time instead.
    expected.spots.push({ id: spot.id, name: spot.name, description: spot.description, category: spot.category, localley_score: score,
      photos: [], visible: issue === null ? 1 : 0, city: rules.inferCityFromAddress(address)?.name ?? null, address: address || null,
      latitude: point?.lat ?? null, longitude: point?.lng ?? null, photo_credits: null, source_urls: null });
    expected.legacy_spot_source.push({ spotId: spot.id, payload: spot, publicIssue: issue });
    const places = photoPlaceIds(spot.photos);
    const placeId = spot.google_place_id ?? (places.length === 1 ? places[0] : null);
    if (placeId && /^[A-Za-z0-9_-]{1,256}$/.test(placeId) && places.every(id => id === placeId)) {
      expected.spot_listing_places.push({ spot_id: spot.id, provider: 'google', place_id: placeId,
        source: spot.google_place_id ? 'live google_place_id' : 'live catalog photo reference' });
    }
  }
  const itineraryIds = new Set(t.itineraries.map(row => row.id));
  if (projection.rows.size !== itineraryIds.size || [...projection.rows.keys()].some(id => !itineraryIds.has(id))) throw new Error('Projection does not match itineraries');
  for (const source of t.itineraries) {
    const row = projection.rows.get(source.id);
    for (const key of ['clerk_user_id', 'title', 'city', 'days', 'created_at']) if (JSON.stringify(row[key]) !== JSON.stringify(source[key])) throw new Error(`Projection changed ${key}`);
    if (row.share_code || row.shared) throw new Error('Unexpected legacy share state');
    const highlights = Array.isArray(row.highlights) ? row.highlights : null;
    expected.itineraries.push({ id: row.id, ownerId: row.clerk_user_id, title: row.title, city: row.city, days: row.days, activities: row.activities ?? [],
      highlights, estimated_cost: row.estimated_cost === null || row.estimated_cost === undefined ? null : String(row.estimated_cost), subtitle: row.subtitle,
      local_score: typeof row.local_score === 'number' ? row.local_score : null, created_at: row.created_at, status: row.status,
      is_favorite: row.is_favorite ? 1 : 0, shared: 0, share_code: null });
    expected.legacy_itinerary_media.push({ itineraryId: row.id, aiBackgrounds: row.ai_backgrounds ?? null, storySlides: row.story_slides ?? null,
      isPublic: row.is_public ? 1 : 0, likeCount: row.like_count ?? 0, viewCount: row.view_count ?? 0, sourceProfileId: row.user_id });
  }
  const conversationIds = new Set(t.conversations.map(row => row.id));
  for (const row of t.conversations) expected.conversations.push({ id: row.id, ownerId: row.clerk_user_id, title: row.title,
    linkedItineraryId: row.linked_itinerary_id, createdAt: row.created_at, updatedAt: row.updated_at });
  for (const row of t.messages) {
    if (!conversationIds.has(row.conversation_id)) throw new Error('Message without conversation');
    expected.messages.push({ id: row.id, conversationId: row.conversation_id, role: row.role, content: row.content ?? '', createdAt: row.created_at });
  }
  for (const row of t.subscriptions) expected.legacy_subscriptions.push({ id: row.id, ownerId: row.clerk_user_id, tier: row.tier, status: row.status,
    billingCycle: row.billing_cycle, stripeCustomerId: row.stripe_customer_id, stripeSubscriptionId: row.stripe_subscription_id, stripePriceId: row.stripe_price_id,
    currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end, cancelAtPeriodEnd: row.cancel_at_period_end ? 1 : 0,
    trialStart: row.trial_start, trialEnd: row.trial_end, createdAt: row.created_at, updatedAt: row.updated_at });
  for (const row of t.usage_tracking) expected.legacy_usage.push({ id: row.id, ownerId: row.clerk_user_id, usageType: row.usage_type,
    periodType: row.period_type, periodStart: row.period_start, count: row.count, createdAt: row.created_at, updatedAt: row.updated_at });

  const counts = Object.fromEntries(IMPORTED_TABLES.map(name => [name, expected[name].length]));
  const statements = [insert('legacy_import_batches', { id: batchId, manifestSha256: snapshot.manifestSha256, projectionSha256: projection.projectionSha256, counts })];
  // Parents first: owners and spots before every dependent row.
  const order = ['owners', 'legacy_owners', 'profiles', 'owner_limits', 'legacy_profile_stats', 'spots', 'legacy_spot_source', 'spot_listing_places',
    'itineraries', 'legacy_itinerary_media', 'conversations', 'messages', 'legacy_subscriptions', 'legacy_usage'];
  for (const name of order) for (const row of expected[name]) statements.push(insert(name, row));
  const longest = Math.max(...statements.map(statement => Buffer.byteLength(statement)));
  // D1 rejects SQL statements above 100 KB.
  if (longest > 100_000) throw new Error(`Statement too large: ${longest}`);
  const archived = Object.fromEntries(ARCHIVED_ONLY.map(name => [name, t[name]?.length ?? 0]));
  return { batchId, sql: statements.join('\n') + '\n', expected, counts, archived, spotIssues: issues, longestStatementBytes: longest, statements: statements.length };
}

// Local rehearsal on node:sqlite with every native migration, then an exact comparison.
export async function rehearse(sqlText, expected) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const migrations = readdirSync(join(here, '../migrations')).filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations) db.exec(readFileSync(join(here, '../migrations', name), 'utf8'));
  db.exec('BEGIN'); db.exec(sqlText); db.exec('COMMIT');
  const first = Object.fromEntries(IMPORTED_TABLES.map(name => [name, db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n]));
  const before = db.prepare('SELECT total_changes() AS n').get().n;
  db.exec('BEGIN'); db.exec(sqlText); db.exec('COMMIT');
  const repeatChanges = db.prepare('SELECT total_changes() AS n').get().n - before;
  const mismatches = [];
  const keys = { owners: 'id', legacy_owners: 'ownerId', profiles: 'id', owner_limits: 'ownerId', legacy_profile_stats: 'profileId', spots: 'id',
    legacy_spot_source: 'spotId', spot_listing_places: 'spot_id', itineraries: 'id', legacy_itinerary_media: 'itineraryId', conversations: 'id',
    messages: 'id', legacy_subscriptions: 'id', legacy_usage: 'id' };
  for (const name of IMPORTED_TABLES) {
    const stored = new Map(db.prepare(`SELECT * FROM ${name}`).all().map(row => [row[keys[name]], row]));
    for (const row of expected[name]) {
      const actual = stored.get(row[keys[name]]);
      if (!actual) { mismatches.push(`${name}:${row[keys[name]]}:missing`); continue; }
      for (const [column, value] of Object.entries(row)) {
        const want = value === null || value === undefined ? null : typeof value === 'object' ? JSON.stringify(value) : typeof value === 'boolean' ? Number(value) : value;
        if (actual[column] !== want) mismatches.push(`${name}:${row[keys[name]]}:${column}`);
      }
    }
  }
  const result = { migrations: migrations.length, counts: first, repeatChanges, mismatches: mismatches.slice(0, 20), mismatchCount: mismatches.length,
    foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all().length, integrity: db.prepare('PRAGMA integrity_check').get().integrity_check,
    largestRowBytes: Math.max(...['itineraries', 'legacy_spot_source', 'legacy_itinerary_media', 'messages'].map(name =>
      db.prepare(`SELECT max(length(CAST(${name === 'itineraries' ? 'activities' : name === 'messages' ? 'content' : name === 'legacy_spot_source' ? 'payload' : 'aiBackgrounds'} AS BLOB))) AS n FROM ${name}`).get().n ?? 0)) };
  db.close();
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ''), all[index + 1]]], []));
  if (!args.snapshot || !args.projection || !args.out || !args.report) throw new Error('Usage: --snapshot DIR --projection DIR --out FILE.sql --report FILE.json');
  const built = buildImport(loadSnapshot(args.snapshot), loadProjection(args.projection), await loadRules());
  writeFileSync(args.out, built.sql, { mode: 0o600, flag: 'wx' });
  const rehearsal = await rehearse(built.sql, built.expected);
  const report = { batchId: built.batchId, sqlSha256: sha256(built.sql), statements: built.statements, longestStatementBytes: built.longestStatementBytes,
    counts: built.counts, archivedOnly: built.archived, spotIssues: built.spotIssues, rehearsal };
  writeFileSync(args.report, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ batchId: report.batchId, sqlSha256: report.sqlSha256, counts: report.counts, visibleSpots: built.expected.spots.filter(s => s.visible).length,
    listings: built.counts.spot_listing_places, rehearsal: { ...rehearsal, mismatches: undefined } }));
  if (rehearsal.mismatchCount || rehearsal.repeatChanges || rehearsal.foreignKeyViolations || rehearsal.integrity !== 'ok') process.exitCode = 1;
}
