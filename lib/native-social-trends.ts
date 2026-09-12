import { createHash } from "node:crypto";
import { z } from "zod";
import { getPublicSpotQualityIssue } from "./spots/public-quality";
import { parseSpotCoordinates } from "./spots/coordinates";

export const NATIVE_SOCIAL_VERSION = "localley-social-evidence-v1";
export const metricWeights = { views: 1, likes: 8, comments: 12, shares: 20, saves: 16 } as const;
const keys = Object.keys(metricWeights) as (keyof typeof metricWeights)[];
const text = z.string().min(1).max(4000).refine(value => value.trim().length > 0);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const metricsSchema = z.object({ views: count, likes: count, comments: count, shares: count, saves: count }).strict();
const provenanceSchema = z.object({ jobId: text, sourceUrl: text, observedAt: text }).passthrough();
const evidenceSchema = z.object({ locator: text, sourceText: text, publicationTimeText: text,
  addressText: z.string().max(4000), metrics: metricsSchema }).passthrough();
const postSchema = z.object({ kind: z.literal("social"), recordId: text, citySlug: z.literal("seoul"),
  platform: z.enum(["youtube", "instagram", "tiktok"]), externalId: text, canonicalUrl: text,
  contentText: text, publishedAt: text, weekStart: text, metrics: metricsSchema,
  provenance: provenanceSchema, evidence: z.array(evidenceSchema).min(1).max(6),
  extractionComplete: z.literal(true), state: z.enum(["pending_place_match", "rejected"]),
  issues: z.array(z.literal("engagement_unavailable")),
}).passthrough().refine(post => post.state === "pending_place_match" ? post.issues.length === 0
  : post.issues.length > 0 && keys.every(k => post.metrics[k] === null));
export type NativeSocialPost = z.infer<typeof postSchema>;

// Stable JSON hashing is order-independent for objects, but preserves arrays and raw timestamp strings.
export function nativeSocialDigest(value: unknown): string {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, x]) => [k, stable(x)])) : v;
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function exactNativeSocialTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/);
  if (!m || m[7] === "-00:00") return null;
  const [, y, month, d, h, minute, second, zone] = m;
  const calendar = new Date(`${y}-${month}-${d}T00:00:00Z`), n = Date.parse(value);
  if (!Number.isFinite(n) || !Number.isFinite(+calendar) || calendar.toISOString().slice(0, 10) !== `${y}-${month}-${d}`
    || +h > 23 || +minute > 59 || +second > 59
    || (zone !== "Z" && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) return null;
  return n;
}

export function nativeSocialWeek(now: number): string {
  if (!Number.isFinite(now) || !Number.isFinite(+new Date(now)) || now <= 0) throw new Error("Invalid review time");
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

export function nativeSocialIdentity(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return null;
    const hosts = { tiktok: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
      instagram: ["instagram.com", "www.instagram.com"],
      youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"] };
    for (const platform of ["tiktok", "instagram", "youtube"] as const) {
      if (!hosts[platform].includes(u.hostname)) continue;
      const externalId = platform === "tiktok" ? u.pathname.match(/^\/@[^/]{1,64}\/(?:video|photo)\/(\d{1,25})\/?$/)?.[1]
        : platform === "instagram" ? u.pathname.match(/^\/(?:p|reel|tv)\/([A-Za-z0-9_-]{1,100})\/?$/)?.[1]
          : u.hostname === "youtu.be" ? u.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
            : u.pathname === "/watch" && u.searchParams.getAll("v").length === 1 ? u.searchParams.get("v")
              : u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
      if (!externalId || (platform === "youtube" && !/^[A-Za-z0-9_-]{11}$/.test(externalId))) return null;
      return { platform, externalId, canonicalUrl: platform === "youtube" ? `https://www.youtube.com/watch?v=${externalId}`
        : `https://www.${platform}.com${u.pathname.replace(/\/$/, "")}` };
    }
  } catch { /* Invalid URLs are evidence failures, not network requests. */ }
  return null;
}

export function nativeContentDigest(post: NativeSocialPost): string {
  return nativeSocialDigest({ platform: post.platform, externalId: post.externalId, canonicalUrl: post.canonicalUrl,
    contentText: post.contentText, publishedAt: post.publishedAt,
    sourceIdentity: nativeSocialIdentity(post.provenance.sourceUrl),
    evidence: post.evidence.map(({ locator, sourceText, publicationTimeText, addressText }) =>
      ({ locator, sourceText, publicationTimeText, addressText })) });
}

export function validateNativeSocialPost(raw: unknown, now: number): { post?: NativeSocialPost; reason?: string } {
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) return { reason: "malformed_or_ineligible_post" };
  const post = parsed.data, identity = nativeSocialIdentity(post.canonicalUrl), source = nativeSocialIdentity(post.provenance.sourceUrl);
  if (!identity || !source || identity.platform !== post.platform || identity.externalId !== post.externalId
    || identity.canonicalUrl !== post.canonicalUrl || source.canonicalUrl !== post.canonicalUrl) return { reason: "source_identity_mismatch" };
  const published = exactNativeSocialTime(post.publishedAt), observed = exactNativeSocialTime(post.provenance.observedAt);
  if (published === null || observed === null) return { reason: "inexact_timestamp" };
  if (observed > now || published > observed) return { reason: "future_timestamp" };
  if (published <= 0) return { reason: "outside_current_week" };
  if (post.weekStart !== nativeSocialWeek(now) || nativeSocialWeek(published) !== nativeSocialWeek(now)) return { reason: "outside_current_week" };
  // A single source observation must support the complete vector. Never combine jobs or incompatible excerpts.
  if (!post.evidence.some(e => exactNativeSocialTime(e.publicationTimeText) === published
    && post.contentText.startsWith(e.sourceText) && keys.every(k => e.metrics[k] === post.metrics[k]))) {
    return { reason: "incoherent_source_evidence" };
  }
  if (post.evidence.some(e => exactNativeSocialTime(e.publicationTimeText) !== published
    || !post.contentText.startsWith(e.sourceText)
    || keys.some(k => e.metrics[k] !== null && e.metrics[k] !== post.metrics[k]))) return { reason: "conflicting_source_evidence" };
  return { post };
}

const identitySchema = z.object({ name: z.union([text, z.record(z.string(), z.string())]),
  address: z.union([text, z.record(z.string(), z.string())]), location: z.unknown(),
  google_place_id: z.string().nullable(), destination_id: z.string().nullable(), local_area_id: z.string().nullable() }).strict();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const mappingSchema = z.object({ platform: postSchema.shape.platform, externalId: text, canonicalUrl: text,
  contentDigest: sha, sourcePin: provenanceSchema.strict(), reviewedObservation: postSchema,
  spotId: z.string().uuid(), canonicalVenueIdentity: identitySchema,
  review: z.object({ scope: z.literal("exact_venue_and_branch"), excerpt: text, venueName: text,
    venueAddress: text, venueSourceUrl: z.string().url(), venueSourceExcerpt: text,
    assessment: z.enum(["positive", "ambiguous", "negative"]),
    decision: z.enum(["exact_venue_recommendation", "exact_context_review"]), rationale: text }).strict(),
  bindingHash: sha }).strict();
const manifestSchema = z.object({ version: z.literal("localley-native-social-review-v1"),
  operator: text, reviewedAt: text, mappings: z.array(mappingSchema).max(1000) }).strict();
export type NativeSocialMapping = z.infer<typeof mappingSchema>;
const localized = (v: unknown): string => typeof v === "string" ? v
  : v && typeof v === "object" ? String((v as Record<string, unknown>).en || Object.values(v)[0] || "") : "";
export function nativeVenueIdentity(spot: Record<string, unknown>) {
  return Object.fromEntries(["name", "address", "location", "google_place_id", "destination_id", "local_area_id"].map(k => [k, spot[k]]));
}

// Only the explicit CLI manifest file supplies this argument. Feed-body approval fields have no authority.
export function validateNativeSocialManifest(raw: unknown, now: number): NativeSocialMapping[] {
  if (raw === undefined) return [];
  const manifest = manifestSchema.parse(raw), reviewedAt = exactNativeSocialTime(manifest.reviewedAt);
  if (reviewedAt === null || reviewedAt > now) throw new Error("Invalid manifest review time");
  const seen = new Set<string>();
  for (const mapping of manifest.mappings) {
    const { bindingHash, ...binding } = mapping, post = mapping.reviewedObservation, review = mapping.review;
    const validation = validateNativeSocialPost(post, reviewedAt);
    const key = `${mapping.platform}:${mapping.externalId}`;
    const sourceUrl = new URL(review.venueSourceUrl);
    if (!validation.post || seen.has(key) || nativeSocialDigest(binding) !== bindingHash
      || nativeContentDigest(post) !== mapping.contentDigest || post.platform !== mapping.platform
      || post.externalId !== mapping.externalId || post.canonicalUrl !== mapping.canonicalUrl
      || nativeSocialDigest(mapping.sourcePin) !== nativeSocialDigest(post.provenance)
      || !post.evidence.some(e => e.sourceText.includes(review.excerpt))
      || review.venueName !== localized(mapping.canonicalVenueIdentity.name)
      || review.venueAddress !== localized(mapping.canonicalVenueIdentity.address)
      || !review.venueSourceExcerpt.includes(review.venueName) || !review.venueSourceExcerpt.includes(review.venueAddress)
      || sourceUrl.protocol !== "https:" || sourceUrl.username || sourceUrl.password || sourceUrl.port
      || ((review.assessment !== "positive" || /\b(?:not|avoid|closed|wrong|another|other branch|bad|never)\b/i.test(post.contentText))
        && review.decision !== "exact_context_review")) throw new Error("Invalid or ambiguous review binding");
    seen.add(key);
  }
  return manifest.mappings;
}

export function reviewNativeSocial(input: { records: unknown[]; discoveryLeads: unknown[]; socialSources: unknown[] },
  existingSpots: Record<string, unknown>[], manifest: unknown = undefined, now = Date.now()) {
  const weekStart = nativeSocialWeek(now), mappings = validateNativeSocialManifest(manifest, now);
  if ([input.records, input.discoveryLeads, input.socialSources, existingSpots].some(x => !Array.isArray(x) || x.length > 5000)) throw new Error("Review bounds exceeded");
  const rejected: { observation: unknown; reason: string }[] = [], observations: NativeSocialPost[] = [];
  for (const raw of input.records) {
    if (raw && typeof raw === "object" && (raw as { kind?: string }).kind === "place") continue;
    const result = validateNativeSocialPost(raw, now);
    if (result.post) observations.push(result.post); else rejected.push({ observation: raw, reason: result.reason! });
  }
  const groups = new Map<string, NativeSocialPost[]>();
  for (const post of observations) {
    const key = `${post.platform}:${post.externalId}`;
    groups.set(key, [...(groups.get(key) || []), post]);
  }
  const latest: NativeSocialPost[] = [];
  for (const group of groups.values()) {
    const byTime = new Map<number, string>();
    let conflict = false;
    for (const post of group) {
      const time = exactNativeSocialTime(post.provenance.observedAt)!;
      const signature = nativeSocialDigest([nativeContentDigest(post), post.metrics]);
      if (byTime.has(time) && byTime.get(time) !== signature) conflict = true;
      byTime.set(time, signature);
    }
    if (conflict) { rejected.push(...group.map(observation => ({ observation, reason: "same_time_conflict" }))); continue; }
    group.sort((a, b) => Date.parse(b.provenance.observedAt) - Date.parse(a.provenance.observedAt)
      || lexical(nativeSocialDigest(a), nativeSocialDigest(b)));
    latest.push(group[0]);
  }
  latest.sort((a, b) => lexical(`${a.platform}:${a.externalId}`, `${b.platform}:${b.externalId}`));
  const unmatched: { observation: NativeSocialPost; reason: string }[] = [];
  const accepted: { observation: NativeSocialPost; spotId: string; weightedScoreLowerBound: number }[] = [];
  const lowerBound = (post: NativeSocialPost) => keys.reduce((sum, k) => sum + (post.metrics[k] === null ? 0 : post.metrics[k]! * metricWeights[k]), 0);
  // Select the latest coherent observation first. Unknown refreshes must never revive older known counts.
  const metricEligible = latest.filter(post => {
    const reason = keys.every(k => post.metrics[k] === null) ? "metrics_unavailable"
      : !Number.isSafeInteger(lowerBound(post)) ? "weighted_count_overflow" : null;
    if (reason) rejected.push({ observation: post, reason });
    return reason === null;
  });
  for (const post of metricEligible) {
    const mapping = mappings.find(m => m.platform === post.platform && m.externalId === post.externalId);
    let reason = !mapping ? "trusted_manual_mapping_required" : mapping.contentDigest !== nativeContentDigest(post) ? "review_content_changed" : "";
    const spots = existingSpots.filter(s => s.id === mapping?.spotId), spot = spots[0];
    if (!reason && (!spot || spots.length !== 1 || nativeSocialDigest(nativeVenueIdentity(spot)) !== nativeSocialDigest(mapping!.canonicalVenueIdentity))) reason = "venue_identity_mismatch";
    if (!reason && spot) {
      const coords = parseSpotCoordinates(spot.location), address = localized(spot.address);
      if (spot.verified !== true || typeof spot.localley_score !== "number" || !Number.isFinite(spot.localley_score) || spot.localley_score < 4
        || !Array.isArray(spot.photos) || !spot.photos.every(p => typeof p === "string")
        || !coords || coords.lat < 37.4 || coords.lat > 37.72 || coords.lng < 126.76 || coords.lng > 127.19
        || !/(?:\bSeoul\b|서울)/i.test(address)
        || getPublicSpotQualityIssue({ ...spot, name: spot.name as string, address: spot.address as string, photos: spot.photos as string[] })) reason = "spot_not_public_quality_seoul";
    }
    if (reason) unmatched.push({ observation: post, reason });
    else accepted.push({ observation: post, spotId: mapping!.spotId, weightedScoreLowerBound: lowerBound(post) });
  }
  // Parity: normalize against all valid current city posts, including unmatched posts, as the paid formula does.
  const maxima = new Map<string, number>();
  for (const post of metricEligible) maxima.set(post.platform, Math.max(maxima.get(post.platform) || 1, lowerBound(post)));
  const ranked = [...new Set(accepted.map(x => x.spotId))].flatMap(spotId => {
    const signals = accepted.filter(x => x.spotId === spotId && x.weightedScoreLowerBound > 0);
    if (!signals.length) return [];
    const values = signals.map(x => Math.log1p(x.weightedScoreLowerBound) / Math.log1p(maxima.get(x.observation.platform)!));
    const platformCount = new Set(signals.map(x => x.observation.platform)).size;
    const peak = Math.max(...values), mean = values.reduce((a, b) => a + b, 0) / values.length;
    const corroboration = Math.min(1, (signals.length - 1) / 3 + (platformCount - 1) / 2);
    const recency = signals.filter(x => now - Date.parse(x.observation.publishedAt) <= 8 * 86400000).length / signals.length;
    return [{ spotId, score: Math.min(100, (peak * .55 + mean * .2 + corroboration * .15 + recency * .1) * 100),
      postCount: signals.length, platformCount, components: { peak, mean, corroboration, recency } }];
  }).sort((a, b) => b.score - a.score || lexical(a.spotId, b.spotId)).slice(0, 5).map((x, i) => ({ ...x, rank: i + 1 }));
  const rejectionReasons: Record<string, number> = {};
  for (const row of [...rejected, ...unmatched]) rejectionReasons[row.reason] = (rejectionReasons[row.reason] || 0) + 1;
  return { publicationReady: false as const, applied: false as const, publicRankingsAction: "unchanged" as const,
    status: ranked.length ? "dry_run_candidates_only" : "unready", citySlug: "seoul", weekStart,
    reviewedAt: new Date(now).toISOString(), paidProviderCalls: 0, rankingSemantics: "Observed contributions only; weightedScoreLowerBound is not an assertion that unknown metrics are zero. Scores are provisional normalized lower-bound inputs, not lower bounds on final ranks.",
    counts: { records: input.records.length, validObservations: observations.length, uniquePosts: latest.length,
      acceptedPosts: accepted.length, ranks: ranked.length, rejected: rejected.length, unmatched: unmatched.length,
      discoveryLeads: input.discoveryLeads.length, socialSources: input.socialSources.length },
    rejectionReasons, rejected, unmatched, observations, accepted, rankings: ranked,
    discoveryLeads: input.discoveryLeads.map(lead => ({ evidence: lead, status: "discovery_only", acceptanceEligible: false })),
    socialSources: input.socialSources };
}

function lexical(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
