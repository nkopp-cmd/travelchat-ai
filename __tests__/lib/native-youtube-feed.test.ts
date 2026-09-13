// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { parseNativeYouTubeFeed } from "../../lib/native-youtube-feed";
import { nativeContentDigest, nativeSocialDigest, nativeVenueIdentity, reviewNativeSocial } from "../../lib/native-social-trends";
import { buildChannelTrend, readSourceText, trendWrite } from "../../scripts/native-channel-trends.mjs";

const source = { channelId: `UC${"a".repeat(22)}`, ownerUrl: "https://example.test/market", citySlug: "tokyo" as const };
const observed = "2026-09-12T12:00:00.000Z", published = "2026-09-09T08:00:21+00:00", videoId = "SYNTHETIC01";
const channelUrl = `https://www.youtube.com/channel/${source.channelId}`;
function entry(id = videoId, date = published, views = ' views="100"') {
  return `<entry><yt:videoId>${id}</yt:videoId><yt:channelId>${source.channelId}</yt:channelId><title>SYNTHETIC Tokyo Test Market</title>
    <link rel="alternate" href="https://www.youtube.com/shorts/${id}"/><author><name>Synthetic owner</name><uri>${channelUrl}</uri></author>
    <published>${date}</published><updated>2026-09-12T01:00:00Z</updated><media:group><media:title>SYNTHETIC Tokyo Test Market</media:title>
    <media:description>SYNTHETIC: an exact Tokyo Test Market update. No actual post or venue.</media:description>
    <media:community><media:starRating count="9" average="5.00"/><media:statistics${views}/></media:community></media:group></entry>`;
}
function xml(entries = entry()) { return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <yt:channelId>${source.channelId.slice(2)}</yt:channelId><title>Synthetic channel</title><author><name>Synthetic owner</name><uri>${channelUrl}</uri></author>
  <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}"/><link rel="alternate" href="${channelUrl}"/>${entries}</feed>`; }
const spot = { id: "00000000-0000-4000-8000-000000000001", name: { en: "Tokyo Test Market" }, address: { en: "1-1 Test Street, Tokyo" },
  location: { type: "Point", coordinates: [139.77, 35.66] }, google_place_id: null, destination_id: null, local_area_id: null,
  verified: true, localley_score: 4, photos: ["https://cdn.localley.io/spots/synthetic.jpg"] };
const html = `SYNTHETIC Tokyo Test Market <a href="${channelUrl}/featured">Channel</a>`;
function approval() {
  const post = parseNativeYouTubeFeed(xml(), source, observed).records[0];
  return { ...source, reviewId: "synthetic-review", reviewedAt: "2026-09-12T11:00:00Z", validUntil: "2026-09-14T00:00:00Z",
    ownerPageSha256: createHash("sha256").update(html).digest("hex"), spotId: spot.id, venueName: spot.name.en, venueAddress: spot.address.en,
    venueIdentityDigest: nativeSocialDigest(nativeVenueIdentity(spot)), videoId, publishedAt: published, contentDigest: nativeContentDigest(post),
    assessment: "positive", decision: "exact_context_review", rationale: "SYNTHETIC explicit operator-reviewed exact market.",
    displaySummary: "Synthetic sample", channelLabel: "Synthetic owner channel", coverage: "Synthetic one-source fixture" };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("synthetic native public channel evidence", () => {
  it("preserves exact publication and raw source digest; does not call star ratings likes", () => {
    const value = xml(), result = parseNativeYouTubeFeed(value, source, observed), post = result.records[0];
    expect(post.publishedAt).toBe(published);
    expect(post.metrics).toEqual({ views: 100, likes: null, comments: null, shares: null, saves: null });
    expect(post.provenance.retrieval?.bodySha256).toBe(createHash("sha256").update(value).digest("hex"));
    expect(post.canonicalUrl).toBe(`https://www.youtube.com/watch?v=${videoId}`);
  });
  it("distinguishes missing views from observed zero", () => {
    expect(parseNativeYouTubeFeed(xml(entry(videoId, published, "")), source, observed).records[0]).toMatchObject({ state: "rejected", metrics: { views: null }, issues: ["engagement_unavailable"] });
    expect(parseNativeYouTubeFeed(xml(entry(videoId, published, ' views="0"')), source, observed).records[0]).toMatchObject({ state: "pending_place_match", metrics: { views: 0 } });
  });
  it("excludes old publications even when updated in the current week", () => {
    const result = parseNativeYouTubeFeed(xml(entry() + entry("SYNTHETIC02", "2026-08-01T00:00:00Z")), source, observed);
    expect(result.records).toHaveLength(1); expect(result.excluded).toEqual([{ videoId: "SYNTHETIC02", reason: "outside_current_week" }]);
  });
  it.each([' views="1.2K"', ' views="-1"', ' views="1.5"', ' views="9007199254740992"'])("rejects inexact counter %s", views => {
    expect(() => parseNativeYouTubeFeed(xml(entry(videoId, published, views)), source, observed)).toThrow();
  });
  it.each(["2026-09-09", "2026-09-09T08:00:21-00:00", "2026-09-31T00:00:00Z", "2026-09-13T00:00:00Z"])("rejects invalid/future publication %s", date => {
    expect(() => parseNativeYouTubeFeed(xml(entry(videoId, date)), source, observed)).toThrow();
  });
  it.each([
    () => xml(entry() + entry()),
    () => xml().replace("<yt:videoId>SYNTHETIC01", "<yt:videoId>wrong"),
    () => xml().replaceAll(source.channelId, `UC${"b".repeat(22)}`),
    () => xml().replace("<title>SYNTHETIC Tokyo Test Market</title>", "<title>Different</title>"),
    () => xml().replace("</feed>", ""),
    () => `<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]>${xml()}`,
    () => xml().replace("http://search.yahoo.com/mrss/", "https://evil.test/"),
    () => xml() + " ".repeat(512 * 1024),
  ])("rejects incomplete or conflicting source structure", make => {
    expect(() => parseNativeYouTubeFeed(make(), source, observed)).toThrow();
  });
  it("uses the unchanged quality gates and an explicit Tokyo review scope", () => {
    const result = buildChannelTrend(xml(), html, spot, observed, approval());
    expect(result.acceptance).toEqual({ posts: 1, ranks: 1 });
    expect(result.payload.rankings[0]).toMatchObject({ spotId: spot.id, rank: 1, source: { metrics: { views: 100, likes: null } } });
    expect(reviewNativeSocial({ records: result.manifest.mappings.map(row => row.reviewedObservation), discoveryLeads: [], socialSources: [] }, [spot], result.manifest, Date.parse(observed)).counts.acceptedPosts).toBe(0);
  });
  it.each([{ verified: false }, { localley_score: 2 }, { photos: [] }, { address: { en: "Other address" } },
    { location: { type: "Point", coordinates: [126.98, 37.56] } }])("does not alter venue eligibility to force acceptance: %j", changes => {
    expect(() => buildChannelTrend(xml(), html, { ...spot, ...changes }, observed, approval())).toThrow();
  });
  it("rejects changed owner, content and expired approval without producing rankings", () => {
    expect(() => buildChannelTrend(xml(), html + " changed", spot, observed, approval())).toThrow();
    expect(() => buildChannelTrend(xml().replace("an exact", "another"), html, spot, observed, approval())).toThrow();
    expect(() => buildChannelTrend(xml(), html, spot, "2026-09-14T00:00:00Z", approval())).toThrow();
  });
  it("allows coherent later decreases instead of retaining maximum counts", () => {
    const result = buildChannelTrend(xml(entry(videoId, published, ' views="20"')), html, spot, "2026-09-12T13:00:00.000Z", approval());
    expect(result.payload.rankings[0].source.metrics.views).toBe(20);
  });
  it("preserves one current snapshot and rejects stale or conflicting writes without touching venues", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE runtime_purpose(id INTEGER PRIMARY KEY,purpose TEXT); INSERT INTO runtime_purpose VALUES(1,'localley-preview'); CREATE TABLE spots(id TEXT); INSERT INTO spots VALUES('preserved');");
      db.exec(readFileSync("cloudflare/auth-proof/migrations/0008_current_trends.sql", "utf8"));
      const value = buildChannelTrend(xml(), html, spot, observed, approval()).payload;
      const first = trendWrite(value, undefined); expect(db.prepare(first.sql).run(...first.params).changes).toBe(1);
      const previous = db.prepare("SELECT * FROM native_current_trends").get();
      const repeat = trendWrite(value, previous); expect(db.prepare(repeat.sql).run(...repeat.params).changes).toBe(1);
      const next = { ...value, observedAt: "2026-09-12T13:00:00.000Z", expiresAt: "2026-09-13T13:00:00.000Z" };
      const update = trendWrite(next, previous); expect(db.prepare(update.sql).run(...update.params).changes).toBe(1);
      expect(db.prepare(repeat.sql).run(...repeat.params).changes).toBe(0);
      expect(() => trendWrite(value, db.prepare("SELECT * FROM native_current_trends").get())).toThrow();
      expect(() => trendWrite({ ...next, coverage: "conflict" }, db.prepare("SELECT * FROM native_current_trends").get())).toThrow();
      expect(db.prepare("SELECT * FROM spots").all()).toEqual([{ id: "preserved" }]);
    } finally { db.close(); }
  });
  it("rejects redirects and corrupt source bytes", async () => {
    await expect(readSourceText(source.ownerUrl, vi.fn().mockResolvedValue(new Response(null, { status: 302 })))).rejects.toThrow();
    await expect(readSourceText(source.ownerUrl, vi.fn().mockResolvedValue(new Response(new Uint8Array([255]))))).rejects.toThrow();
  });
  it("bounds source headers and body with one nonrenewable deadline", async () => {
    vi.useFakeTimers();
    const promise = readSourceText(source.ownerUrl, vi.fn().mockResolvedValue(new Response(new ReadableStream())));
    const check = expect(promise).rejects.toThrow(); await vi.advanceTimersByTimeAsync(20001); await check;
  });
});
