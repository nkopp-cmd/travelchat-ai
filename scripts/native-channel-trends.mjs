import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseNativeYouTubeFeed, CHANNEL_FEED_LIMIT } from '../lib/native-youtube-feed.ts';
import { nativeContentDigest, nativeSocialDigest, nativeVenueIdentity, reviewNativeSocial } from '../lib/native-social-trends.ts';
import { nativeTrendPayloadSchema } from '../lib/native-trend-contract.ts';
import { parseSpotCoordinates } from '../lib/spots/coordinates.ts';
import { withClientDeadline } from '../lib/auth/bounded-fetch.ts';

export const approval = JSON.parse(readFileSync(new URL('../cloudflare/auth-proof/pilot/channel-trends.json', import.meta.url), 'utf8'));
const origin = 'https://llehrhqeolfprutcaopi.supabase.co';
const root = fileURLToPath(new URL('../', import.meta.url));
const sha = text => createHash('sha256').update(text).digest('hex');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });

export async function readSourceText(url, fetcher = fetch, headers = {}) {
  return withClientDeadline(async signal => {
    const response = await fetcher(url, { headers, redirect: 'error', signal });
    if (!response.ok || response.redirected) throw new Error(`Source unavailable (${response.status})`);
    const chunks = []; let bytes = 0; const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty source body');
    try {
      for (;;) { const part = await reader.read(); if (part.done) break;
        bytes += part.value.length; if (bytes > CHANNEL_FEED_LIMIT) throw new Error('Source byte limit'); chunks.push(part.value); }
    } finally { await reader.cancel(); }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  });
}

export function buildChannelTrend(xml, ownerHtml, spot, observedAt, reviewed = approval) {
  const now = Date.parse(observedAt);
  if (!Number.isFinite(now) || now < Date.parse(reviewed.reviewedAt) || now >= Date.parse(reviewed.validUntil)) throw new Error('Channel review expired or predates approval');
  if (sha(ownerHtml) !== reviewed.ownerPageSha256
    || !ownerHtml.includes(`https://www.youtube.com/channel/${reviewed.channelId}/featured`)
    || !ownerHtml.includes(reviewed.venueName)) throw new Error('Official channel ownership evidence changed');
  if (spot.id !== reviewed.spotId || nativeSocialDigest(nativeVenueIdentity(spot)) !== reviewed.venueIdentityDigest) throw new Error('Reviewed venue identity changed');
  const feed = parseNativeYouTubeFeed(xml, reviewed, observedAt);
  const post = feed.records.find(post => post.externalId === reviewed.videoId);
  if (!post || post.publishedAt !== reviewed.publishedAt || nativeContentDigest(post) !== reviewed.contentDigest) throw new Error('Approved current post unavailable or changed');
  const binding = { platform: post.platform, externalId: post.externalId, canonicalUrl: post.canonicalUrl,
    contentDigest: nativeContentDigest(post), sourcePin: post.provenance, reviewedObservation: post,
    spotId: spot.id, canonicalVenueIdentity: nativeVenueIdentity(spot), review: {
      scope: 'exact_venue_and_branch', excerpt: post.contentText.split('\n')[0], venueName: reviewed.venueName, venueAddress: reviewed.venueAddress,
      venueSourceUrl: `${origin}/rest/v1/spots?id=eq.${spot.id}&select=*`,
      // This is the actual canonical database response, not a fabricated quotation from the market website.
      venueSourceExcerpt: JSON.stringify({ name: spot.name, address: spot.address }),
      assessment: reviewed.assessment, decision: reviewed.decision, rationale: reviewed.rationale,
    } };
  const manifest = { version: 'localley-native-social-review-v1', operator: 'Localley checked channel review', reviewedAt: observedAt,
    mappings: [{ ...binding, bindingHash: nativeSocialDigest(binding) }] };
  const result = reviewNativeSocial({ records: [post], discoveryLeads: [], socialSources: [] }, [spot], manifest, now, reviewed.citySlug);
  if (result.accepted.length !== 1 || result.rankings.length !== 1) throw new Error(`No publishable current trend: ${JSON.stringify(result.rejectionReasons)}`);
  const coordinates = parseSpotCoordinates(spot.location);
  const payload = nativeTrendPayloadSchema.parse({ version: 'localley-visible-trends-v1', reviewId: reviewed.reviewId, citySlug: reviewed.citySlug,
    weekStart: result.weekStart, observedAt, expiresAt: new Date(Math.min(now + 86400000, Date.parse(reviewed.validUntil))).toISOString(),
    sourceEntries: feed.source.entryCount, excludedEntries: feed.excluded.length, unreviewedEntries: feed.records.length - 1, coverage: reviewed.coverage,
    rankings: [{ rank: 1, spotId: spot.id, name: reviewed.venueName, address: reviewed.venueAddress,
      lat: coordinates.lat, lng: coordinates.lng, venueUrl: `https://localley.io/spots/${spot.id}`, postCount: 1, summary: reviewed.displaySummary,
      source: { platform: 'youtube', kind: 'venue_owned_channel', label: reviewed.channelLabel, channelId: reviewed.channelId,
        ownerUrl: reviewed.ownerUrl, feedUrl: feed.source.feedUrl, videoId: post.externalId, url: post.canonicalUrl,
        title: post.contentText.split('\n')[0], publishedAt: post.publishedAt, metrics: post.metrics, bodySha256: feed.source.bodySha256 } }],
  });
  return { payload, manifest, source: feed.source, excluded: feed.excluded,
    venueQuality: { verified: spot.verified, localleyScore: spot.localley_score, photoCount: spot.photos.length },
    acceptance: { posts: result.accepted.length, ranks: result.rankings.length } };
}

export function trendWrite(payload, previous) {
  const value = nativeTrendPayloadSchema.parse(payload), text = JSON.stringify(value), observed = Date.parse(value.observedAt);
  if (Buffer.byteLength(text) > 65536) throw new Error('Trend publication byte limit');
  if (previous && (observed < previous.observed_at || (observed === previous.observed_at && text !== previous.payload))) throw new Error('Stale or conflicting trend snapshot');
  return { sql: `INSERT INTO native_current_trends (city_slug,week_start,observed_at,expires_at,review_id,payload)
    SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM runtime_purpose WHERE id=1 AND purpose='localley-preview')
      AND (CASE WHEN ? IS NULL THEN NOT EXISTS (SELECT 1 FROM native_current_trends WHERE city_slug=?)
        ELSE EXISTS (SELECT 1 FROM native_current_trends WHERE city_slug=? AND observed_at=? AND payload=?) END)
    ON CONFLICT(city_slug) DO UPDATE SET week_start=excluded.week_start,observed_at=excluded.observed_at,
      expires_at=excluded.expires_at,review_id=excluded.review_id,payload=excluded.payload`,
    params: [value.citySlug, value.weekStart, observed, Date.parse(value.expiresAt), value.reviewId, text,
      previous?.observed_at ?? null, value.citySlug, value.citySlug, previous?.observed_at ?? null, previous?.payload ?? null] };
}

export async function main(args = process.argv.slice(2)) {
  const allowed = new Set(['--live', '--dry-run', '--apply', '--out']);
  const flags = {}; for (let i = 0; i < args.length; i++) {
    const key = args[i]; if (!allowed.has(key) || Object.hasOwn(flags, key)) throw new Error('Unsupported or duplicate argument');
    flags[key] = key === '--out' ? args[++i] : true;
  }
  if (!flags['--live'] || Boolean(flags['--dry-run']) === Boolean(flags['--apply']) || typeof flags['--out'] !== 'string'
    || !flags['--out'] || flags['--out'].startsWith('--')) throw new Error('Use --live and exactly one of --dry-run/--apply, with an exclusive --out path');
  const local = parseEnv(readFileSync(resolve(root, '.env.local'), 'utf8')), env = { ...local, ...process.env };
  if (env.NEXT_PUBLIC_SUPABASE_URL !== origin || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Pinned canonical read credentials unavailable');
  const ownerHtml = await readSourceText(approval.ownerUrl);
  const xml = await readSourceText(`https://www.youtube.com/feeds/videos.xml?channel_id=${approval.channelId}`);
  const observedAt = new Date().toISOString();
  const venueText = await readSourceText(`${origin}/rest/v1/spots?id=eq.${approval.spotId}&select=*`, fetch,
    { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` });
  const venues = JSON.parse(venueText); if (!Array.isArray(venues) || venues.length !== 1) throw new Error('Canonical venue unavailable');
  const report = buildChannelTrend(xml, ownerHtml, venues[0], observedAt);
  // Retain source and acceptance evidence before any uncertain write. Never overwrite an earlier attempt.
  save(flags['--out'], { ...report, sourceXml: xml, canonicalVenue: venues[0], ownerPageSha256: sha(ownerHtml), applied: false, mode: flags['--apply'] ? 'write_prepared' : 'dry_run' });
  if (flags['--apply']) {
    const config = JSON.parse(readFileSync(resolve(root, 'cloudflare/auth-proof/wrangler.preview.jsonc'), 'utf8'));
    if (config.account_id !== '664f242340bcec2f32daaeee15f58bde' || config.name !== 'localley-discovery-preview'
      || config.d1_databases[0].database_id !== 'e943548b-01ae-485d-9219-e2a46cb0da8e') throw new Error('Unexpected publication target');
    const token = env.CLOUDFLARE_API_TOKEN || parseEnv(readFileSync(`${homedir()}/secrets/keys.env`, 'utf8')).CLOUDFLARE_API_TOKEN;
    if (!token) throw new Error('Native publication credential unavailable');
    const execute = async (sql, params = []) => {
      const body = await readSourceText(`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/d1/database/${config.d1_databases[0].database_id}/query`,
        (url, options) => fetch(url, { ...options, method: 'POST', body: JSON.stringify({ sql, params }) }),
        { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
      const value = JSON.parse(body); if (!value.success || value.result?.length !== 1 || !value.result[0].success) throw new Error('Native database operation failed');
      return value.result[0];
    };
    const current = await execute('SELECT * FROM native_current_trends WHERE city_slug=?', [report.payload.citySlug]);
    if (current.results.length > 1) throw new Error('Ambiguous current snapshot');
    const statement = trendWrite(report.payload, current.results[0]);
    save(`${flags['--out']}.attempt.json`, { city: report.payload.citySlug, observedAt, preparedAt: new Date().toISOString() });
    const applied = await execute(statement.sql, statement.params);
    if (applied.meta.changes !== 1) throw new Error('Publication precondition changed; reconcile without blind retry');
    const stored = await execute('SELECT * FROM native_current_trends WHERE city_slug=?', [report.payload.citySlug]);
    if (stored.results[0]?.payload !== JSON.stringify(report.payload)) throw new Error('Publication verification failed');
    save(`${flags['--out']}.receipt.json`, { applied: true, reviewId: approval.reviewId, observedAt, city: report.payload.citySlug, posts: 1, ranks: 1 });
  }
  console.log(JSON.stringify({ mode: flags['--apply'] ? 'published' : 'dry_run', city: report.payload.citySlug,
    observedAt, acceptedPosts: report.acceptance.posts, ranks: report.acceptance.ranks, views: report.payload.rankings[0].source.metrics.views,
    expiresAt: report.payload.expiresAt, paidProviderCalls: 0, sourceMediaReused: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Native channel collection/publication failed. No automatic retry; inspect retained private evidence.'); process.exitCode = 1; });
}
