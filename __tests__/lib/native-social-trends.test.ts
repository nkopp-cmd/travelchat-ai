import { describe, expect, it } from "vitest";
import { exactNativeSocialTime, nativeContentDigest, nativeSocialDigest, nativeSocialIdentity,
  nativeSocialWeek, nativeVenueIdentity, reviewNativeSocial, validateNativeSocialPost, validateNativeSocialManifest,
  type NativeSocialPost } from "../../lib/native-social-trends";

// All posts, jobs, venues, reviews, and metric values below are SYNTHETIC, never live evidence.
const now = Date.parse("2026-09-12T12:00:00Z");
const metrics = { views: 100, likes: null, comments: null, shares: null, saves: null };
function post(id = "SYNTHETIC01", changes: Record<string, unknown> = {}): NativeSocialPost {
  const canonicalUrl = `https://www.youtube.com/watch?v=${id}`;
  return { kind: "social", recordId: `synthetic-record-${id}`, citySlug: "seoul", platform: "youtube", externalId: id,
    canonicalUrl, contentText: "SYNTHETIC: Seoul Test Venue at 12 Eulji-ro, Seoul.", publishedAt: "2026-09-08T03:00:00.000Z",
    weekStart: "2026-09-07", metrics: { ...metrics }, extractionComplete: true, state: "pending_place_match", issues: [],
    provenance: { jobId: "synthetic-job", sourceUrl: canonicalUrl, observedAt: "2026-09-09T12:00:00.000Z" },
    evidence: [{ locator: "synthetic.player", sourceText: "SYNTHETIC: Seoul Test Venue at 12 Eulji-ro, Seoul.",
      publicationTimeText: "2026-09-08T12:00:00+09:00", addressText: "12 Eulji-ro, Seoul", metrics: { ...metrics } }], ...changes } as NativeSocialPost;
}
function spot(index = 1) {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, name: { en: "Test Venue" },
    address: { en: "12 Eulji-ro, Seoul" }, location: { type: "Point", coordinates: [126.978, 37.5665] },
    google_place_id: null, destination_id: null, local_area_id: null, verified: true, localley_score: 4,
    photos: ["https://cdn.localley.io/spots/synthetic-test.jpg"] };
}
function manifest(posts = [post()], spots = [spot()]) {
  return { version: "localley-native-social-review-v1", operator: "SYNTHETIC TEST OPERATOR", reviewedAt: "2026-09-10T12:00:00Z",
    mappings: posts.map((p, i) => {
      const binding = { platform: p.platform, externalId: p.externalId, canonicalUrl: p.canonicalUrl,
        contentDigest: nativeContentDigest(p), sourcePin: p.provenance, reviewedObservation: p,
        spotId: spots[i].id, canonicalVenueIdentity: nativeVenueIdentity(spots[i]),
        review: { scope: "exact_venue_and_branch", excerpt: p.evidence[0].sourceText, venueName: "Test Venue",
          venueAddress: "12 Eulji-ro, Seoul", venueSourceUrl: "https://example.org/synthetic-venue",
          venueSourceExcerpt: "SYNTHETIC Test Venue: 12 Eulji-ro, Seoul", assessment: "positive",
          decision: "exact_venue_recommendation", rationale: "SYNTHETIC reviewed exact venue and branch, not a market or nearby stall." } };
      return { ...binding, bindingHash: nativeSocialDigest(binding) };
    }) };
}
function refreshed(p: NativeSocialPost, views: number | null, time = "2026-09-11T12:00:00.000Z") {
  const copy = structuredClone(p);
  copy.metrics.views = views; copy.evidence[0].metrics.views = views;
  copy.provenance.observedAt = time; copy.provenance.jobId = "synthetic-refresh-job";
  return copy;
}
function review(posts = [post()], spots = [spot()], m: unknown = manifest()) {
  return reviewNativeSocial({ records: posts, discoveryLeads: [], socialSources: [] }, spots, m, now);
}
function rehash(m: ReturnType<typeof manifest>) {
  for (const row of m.mappings) {
    const binding = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "bindingHash"));
    row.bindingHash = nativeSocialDigest(binding);
  }
  return m;
}

describe("native social dry-run synthetic evidence", () => {
  it("ranks reviewed public spots without publication and preserves raw evidence/null metrics", () => {
    const result = review();
    expect(result.counts.acceptedPosts).toBe(1);
    expect(result.rankings[0]).toMatchObject({ rank: 1, score: 85, postCount: 1 });
    expect(result.accepted[0]).toMatchObject({ observation: post(), weightedScoreLowerBound: 100 });
    expect(result).toMatchObject({ publicationReady: false, applied: false, publicRankingsAction: "unchanged", paidProviderCalls: 0 });
  });
  it("requires trusted manifest, never a body approval or name substring", () => {
    const p = post(); p.approved = true; p.spotId = spot().id;
    const result = reviewNativeSocial({ records: [p], discoveryLeads: [], socialSources: [] }, [spot()], undefined, now);
    expect(result.unmatched[0].reason).toBe("trusted_manual_mapping_required");
    expect(result.rankings).toEqual([]);
  });
  it("permits metric refreshes and declines without re-review or mixing jobs", () => {
    const p = post(), fresh = refreshed(p, 8);
    fresh.metrics.likes = 2; fresh.evidence[0].metrics.likes = 2;
    const result = review([p, fresh]);
    expect(nativeContentDigest(fresh)).toBe(nativeContentDigest(p));
    expect(result.accepted[0].weightedScoreLowerBound).toBe(24);
    expect(result.accepted[0].observation.provenance.jobId).toBe("synthetic-refresh-job");
    expect(result.observations).toHaveLength(2);
  });
  it("distinguishes observed zero from all unknown and excludes zero-only ranking parity", () => {
    const p = refreshed(post(), 0);
    expect(review([p]).accepted[0].observation.metrics).toEqual({ ...metrics, views: 0 });
    expect(review([p]).rankings).toEqual([]);
    expect(review([refreshed(post(), null)]).rejectionReasons.metrics_unavailable).toBe(1);
  });
  it.each([false, true])("never carries older known counts through a newer unknown observation (producer rejection: %s)", producerRejection => {
    const old = post(), latest = refreshed(old, null), m = manifest([old]);
    if (producerRejection) { latest.state = "rejected"; latest.issues = ["engagement_unavailable"]; }
    expect(validateNativeSocialPost(latest, now).post).toEqual(latest);
    expect(nativeContentDigest(latest)).toBe(m.mappings[0].contentDigest);
    expect(validateNativeSocialManifest(m, now)).toHaveLength(1);
    for (const records of [[old, latest], [latest, old]]) {
      const result = review(records, [spot()], m);
      expect(result.observations).toEqual(records);
      expect(result.rejected).toEqual([{ observation: latest, reason: "metrics_unavailable" }]);
      expect(result).toMatchObject({ status: "unready", accepted: [], rankings: [], unmatched: [],
        counts: { validObservations: 2, uniquePosts: 1, acceptedPosts: 0 },
        publicationReady: false, publicRankingsAction: "unchanged" });
    }
  });
  it.each([[null, 0], [0, null], [null, 100]] as const)("selects chronological metrics %s -> %s in every input order", (olderViews, newerViews) => {
    const old = refreshed(post(), olderViews, "2026-09-09T12:00:00.000Z"), latest = refreshed(post(), newerViews);
    const a = review([old, latest]), b = review([latest, old]);
    expect(a.accepted).toEqual(b.accepted);
    expect(a.rejected).toEqual(b.rejected);
    expect(a.rankings).toEqual(b.rankings);
    if (newerViews === null) {
      expect(a.accepted).toEqual([]);
      expect(a.rejected).toEqual([{ observation: latest, reason: "metrics_unavailable" }]);
    } else {
      expect(a.accepted[0]).toMatchObject({ observation: latest, weightedScoreLowerBound: newerViews });
      expect(a.rejectionReasons).toEqual({});
    }
    expect(a.rankings).toHaveLength(newerViews === 100 ? 1 : 0);
  });
  it.each([0, 100])("rejects equal-time unknown versus %s conflicts in both input orders", knownViews => {
    const known = refreshed(post(), knownViews), unknown = refreshed(post(), null);
    unknown.state = "rejected"; unknown.issues = ["engagement_unavailable"];
    for (const records of [[known, unknown], [unknown, known]]) {
      const result = review(records);
      expect(result.rejectionReasons).toEqual({ same_time_conflict: 2 });
      expect(result.observations).toEqual(records);
      expect(result.accepted).toEqual([]);
      expect(result.rankings).toEqual([]);
    }
  });
  it("still rejects unrelated producer issues on an unknown observation", () => {
    const p = refreshed(post(), null);
    expect(validateNativeSocialPost({ ...p, state: "rejected", issues: ["engagement_unavailable", "incomplete_extraction"] }, now).post).toBeUndefined();
    expect(validateNativeSocialPost({ ...p, state: "discovery_lead" }, now).post).toBeUndefined();
  });
  it("excludes unavailable latest counts from other posts' normalization", () => {
    const old = post(), latest = refreshed(old, null), other = refreshed(post("SYNTHETIC02"), 10);
    const result = review([old, latest, other], [spot(), spot(2)], manifest([old, post("SYNTHETIC02")], [spot(), spot(2)]));
    expect(result.rankings).toHaveLength(1);
    expect(result.rankings[0]).toMatchObject({ spotId: spot(2).id, score: 85 });
  });
  it("deduplicates identical observations and never inflates corroboration", () => {
    expect(review([post(), post()]).rankings[0].postCount).toBe(1);
  });
  it.each(["metrics", "content"])("rejects all same-instant %s conflicts, including different timezone strings", kind => {
    const p = post(), other = structuredClone(p);
    other.provenance.observedAt = "2026-09-09T21:00:00+09:00";
    if (kind === "metrics") { other.metrics.views = 50; other.evidence[0].metrics.views = 50; }
    else { other.contentText += " Different."; other.evidence[0].sourceText = other.contentText; }
    const result = review([p, other, refreshed(p, 200)]);
    expect(result.rejectionReasons.same_time_conflict).toBe(3);
    expect(result.rankings).toEqual([]);
  });
  it.each(["1K", "2M", "100", -1, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined, NaN])("rejects malformed counts %s", views => {
    const p = post(); (p.metrics as Record<string, unknown>).views = views;
    expect(review([p]).counts.acceptedPosts).toBe(0);
  });
  it("rejects per-evidence count merges and conflicting evidence", () => {
    const p = post(); p.metrics.likes = 5;
    p.evidence.push({ ...p.evidence[0], metrics: { ...metrics, views: null, likes: 5 } });
    expect(review([p]).rejectionReasons.incoherent_source_evidence).toBe(1);
  });
  it.each(["2026-09-08", "2026-09-08T12:00:00", "2026-02-30T12:00:00Z", "2026-09-08T24:00:00Z",
    "2026-09-08T12:00:00-00:00", "2026-09-08T12:00:00+25:00", " 2026-09-08T12:00:00Z"])("rejects inexact time %s", value => {
    expect(exactNativeSocialTime(value)).toBeNull();
    expect(review([post(undefined, { publishedAt: value })]).counts.acceptedPosts).toBe(0);
  });
  it("uses UTC Monday boundaries and rejects old weeks even with fresh observations", () => {
    expect(nativeSocialWeek(Date.parse("2026-09-07T08:59:59+09:00"))).toBe("2026-08-31");
    expect(nativeSocialWeek(Date.parse("2026-09-07T09:00:00+09:00"))).toBe("2026-09-07");
    expect(reviewNativeSocial({ records: [post()], discoveryLeads: [], socialSources: [] }, [spot()], manifest(),
      Date.parse("2026-09-14T00:00:00Z")).rankings).toEqual([]);
    expect(review([post(undefined, { weekStart: "2026-09-08" })]).rejectionReasons.outside_current_week).toBe(1);
  });
  it("rejects future publication and observations", () => {
    expect(review([refreshed(post(), 100, "2026-09-13T00:00:00Z")]).rejectionReasons.future_timestamp).toBe(1);
    expect(review([post(undefined, { publishedAt: "2026-09-12T00:00:00Z" })]).rejectionReasons.future_timestamp).toBe(1);
  });
  it.each(["https://youtube.com.evil.test/watch?v=SYNTHETIC01", "https://evil.test/youtube.com/watch?v=SYNTHETIC01",
    "http://www.youtube.com/watch?v=SYNTHETIC01", "https://user@www.youtube.com/watch?v=SYNTHETIC01",
    "https://www.youtube.com/watch?v=SYNTHETIC01&v=SYNTHETIC02", "https://www.youtube.com/watch?v=short",
    "https://www.instagram.com/explore/", "https://www.tiktok.com/@test"])("rejects false permalink %s", url => {
    expect(nativeSocialIdentity(url)).toBeNull();
  });
  it("revalidates platform, post ID and exact source permalink", () => {
    for (const change of [{ platform: "instagram" }, { externalId: "SYNTHETIC02" },
      { provenance: { ...post().provenance, sourceUrl: "https://www.youtube.com/watch?v=SYNTHETIC02" } }]) {
      expect(validateNativeSocialPost(post(undefined, change), now).reason).toBe("source_identity_mismatch");
    }
  });
  it("does not promote discovery leads, even with exact-looking metrics", () => {
    const result = reviewNativeSocial({ records: [], discoveryLeads: [post()], socialSources: [{ status: "discovery_only" }] }, [spot()], manifest(), now);
    expect(result).toMatchObject({ status: "unready", rankings: [], counts: { acceptedPosts: 0, discoveryLeads: 1 } });
    expect(result.discoveryLeads[0].acceptanceEligible).toBe(false);
  });
  it.each(["Gwangjang Market", "SeMA Other Branch"])("rejects changed canonical venue %s, never substring matches", name => {
    const s = spot(); s.name.en = name;
    expect(review([post()], [s]).unmatched[0].reason).toBe("venue_identity_mismatch");
  });
  it("requires renewed review for changed immutable content", () => {
    const p = refreshed(post(), 110); p.contentText += " Other branch."; p.evidence[0].sourceText = p.contentText;
    expect(review([p]).unmatched[0].reason).toBe("review_content_changed");
  });
  it("validates manifest hashes, source pins, evidence excerpts, and canonical review identity", () => {
    const mutations = [
      (m: ReturnType<typeof manifest>) => { m.mappings[0].bindingHash = "0".repeat(64); },
      (m: ReturnType<typeof manifest>) => { m.mappings[0].sourcePin = { ...m.mappings[0].sourcePin, jobId: "another-job" }; rehash(m); },
      (m: ReturnType<typeof manifest>) => { m.mappings[0].review.excerpt = "Invented evidence"; rehash(m); },
      (m: ReturnType<typeof manifest>) => { m.mappings[0].review.venueName = "A stall inside Test Venue"; rehash(m); },
    ];
    for (const mutate of mutations) { const m = manifest(); mutate(m); expect(() => validateNativeSocialManifest(m, now)).toThrow(); }
  });
  it.each(["ambiguous", "negative"])("requires explicit context review for %s claims", assessment => {
    const m = manifest(); m.mappings[0].review.assessment = assessment; rehash(m);
    expect(() => validateNativeSocialManifest(m, now)).toThrow();
    m.mappings[0].review.decision = "exact_context_review"; rehash(m);
    expect(validateNativeSocialManifest(m, now)).toHaveLength(1);
  });
  it.each([{ verified: false }, { localley_score: 3.9 }, { photos: [] },
    { photos: ["https://images.unsplash.com/stock.jpg"] }, { location: { coordinates: [139.69, 35.68] } }])("enforces baseline quality %j", changes => {
    const s = { ...spot(), ...changes }, m = manifest([post()], [s]);
    expect(review([post()], [s], m).unmatched[0].reason).toBe("spot_not_public_quality_seoul");
  });
  it("returns stable top five and the existing 55/20/15/10 formula", () => {
    const posts = Array.from({ length: 6 }, (_, i) => post(`SYNTHETIC0${i}`));
    const spots = posts.map((_, i) => spot(i + 1)), m = manifest(posts, spots);
    const a = review(posts, spots, m), b = review([...posts].reverse(), [...spots].reverse(), m);
    expect(a.rankings).toEqual(b.rankings);
    expect(a.rankings).toHaveLength(5);
    expect(a.rankings[0]).toMatchObject({ score: 85, spotId: spot().id });
  });
  it("uses all metric weights and platform/city logarithmic normalization", () => {
    const a = post(), b = post("SYNTHETIC02");
    a.metrics = { views: 10, likes: 2, comments: 3, shares: 4, saves: 5 }; a.evidence[0].metrics = { ...a.metrics };
    b.metrics.views = 1000; b.evidence[0].metrics.views = 1000;
    const m = manifest([a, b], [spot(), spot(2)]), result = review([a, b], [spot(), spot(2)], m);
    expect(result.accepted[0].weightedScoreLowerBound).toBe(222);
    expect(result.rankings[1].score).toBeCloseTo((Math.log1p(222) / Math.log1p(1000) * .75 + .1) * 100);
  });
  it("supports exact TikTok and Instagram permalinks with platform corroboration", () => {
    const posts = [post(), post("SYNTHETIC02"), post("SYNTHETIC03")];
    Object.assign(posts[1], { platform: "tiktok", externalId: "123456789", canonicalUrl: "https://www.tiktok.com/@synthetic/video/123456789" });
    Object.assign(posts[2], { platform: "instagram", externalId: "SYNTHETIC", canonicalUrl: "https://www.instagram.com/reel/SYNTHETIC" });
    posts.forEach(p => { p.provenance.sourceUrl = p.canonicalUrl; });
    const m = manifest(posts, [spot(), spot(), spot()]);
    const result = review(posts, [spot()], m);
    expect(result.rankings[0]).toMatchObject({ score: 100, platformCount: 3, postCount: 3, components: { corroboration: 1 } });
  });
  it("does not hide negative wording behind an ordinary positive review flag", () => {
    const p = post(); p.contentText = "SYNTHETIC: Avoid Test Venue in Seoul."; p.evidence[0].sourceText = p.contentText;
    expect(() => review([p], [spot()], manifest([p]))).toThrow("review binding");
  });
  it("does not mutate input evidence", () => {
    const p = post(), original = structuredClone(p);
    review([p, refreshed(p, 20)]);
    expect(p).toEqual(original);
  });
  it("never clears public rankings on empty input", () => {
    expect(reviewNativeSocial({ records: [], discoveryLeads: [], socialSources: [] }, [], undefined, now))
      .toMatchObject({ status: "unready", publicationReady: false, publicRankingsAction: "unchanged", rankings: [] });
  });
});
