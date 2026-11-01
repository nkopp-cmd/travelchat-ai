import { describe, expect, it } from "vitest";
import { formatViralMonth, parseViralFeed, spotViralMentions, viralSpotRefs } from "@/lib/viral/feed";
// @ts-expect-error plain ESM script without types
import { publicEvents } from "../../scripts/viral-scout.mjs";

const A = "6bff8713-ceaa-45f8-a8b8-3e39d4017b03", B = "15614d97-380f-4e8d-8aa6-aa6f43609bcf", C = "0b0c6f6e-1111-4222-8333-944445555666";
const event = (slug: string, citySlug: string, spotIds: string[]) => ({
  slug, label: `${slug} label`, person: "Justin Bieber", city: "Seoul", citySlug, month: "2026-10", summary: "x".repeat(900),
  firstSeen: "2026-10-23T00:00:00Z", lastSeen: "2026-10-30T00:00:00Z", articleCount: 18,
  sources: [{ title: "Bieber eats samgyetang", url: "https://www.mt.co.kr/a/1", publisher: "MoneyToday", date: "2026-10-23" }],
  spots: spotIds.map((spotId) => ({ spotId, note: "ate here" })),
});

describe("viral feed", () => {
  it("accepts the file the scout publishes", () => {
    const events = { "justin-bieber-seoul-2026-10": {
      slug: "justin-bieber-seoul-2026-10", personEn: "Justin Bieber", city: "seoul", month: "2026-10", summaryEn: "First visit in 13 years.",
      firstSeen: "2026-10-23T00:00:00Z", lastSeen: "2026-10-30T00:00:00Z",
      sources: { a1: { title: "Bieber in Seoul", url: "https://www.mt.co.kr/a/1", publisher: "MoneyToday", date: "2026-10-23" } },
      places: { p1: { spotId: A, status: "matched", note: "walked here" }, p2: { status: "review", note: "hotel" } },
    } };
    const parsed = parseViralFeed(JSON.parse(JSON.stringify(publicEvents(events, "2026-10-31T01:00:00.000Z"))));
    expect(parsed?.events).toHaveLength(1);
    expect(parsed?.events[0]).toMatchObject({ slug: "justin-bieber-seoul-2026-10", label: "Justin Bieber in Seoul, Oct 2026", citySlug: "seoul", spots: [{ spotId: A }] });
  });

  it("drops an invalid event, not the whole feed, and trims long text", () => {
    const parsed = parseViralFeed({ version: 1, updatedAt: "2026-10-31T00:00:00Z", events: [
      event("good-event", "seoul", [A]),
      { ...event("bad-source", "seoul", [B]), sources: [{ title: "x", url: "javascript:alert(1)", publisher: "x", date: null }] },
      { ...event("Bad Slug", "seoul", [B]) },
    ] });
    expect(parsed?.events.map((item) => item.slug)).toEqual(["good-event"]);
    expect(parsed?.events[0].summary).toHaveLength(600);
    expect(parseViralFeed({ version: 2, events: [] })).toBeNull();
    expect(parseViralFeed("not json")).toBeNull();
  });

  it("lists each spot once, newest event first, filtered by city and capped", () => {
    const feed = parseViralFeed({ version: 1, updatedAt: "x", events: [event("newest", "seoul", [A, B]), event("busan-one", "busan", [C]), event("older", "seoul", [B, C])] });
    expect(viralSpotRefs(feed, null).map((ref) => [ref.event.slug, ref.spotId])).toEqual([["newest", A], ["newest", B], ["busan-one", C]]);
    expect(viralSpotRefs(feed, "seoul").map((ref) => [ref.event.slug, ref.spotId])).toEqual([["newest", A], ["newest", B], ["older", C]]);
    expect(viralSpotRefs(feed, "seoul", 1)).toHaveLength(1);
    expect(viralSpotRefs(null, null)).toEqual([]);
  });

  it("lists the events that name one spot, with up to three sources", () => {
    const feed = parseViralFeed({ version: 1, updatedAt: "2026-10-31T00:00:00Z", events: [event("bieber", "seoul", [A, B]), event("other", "seoul", [C])] });
    const mentions = spotViralMentions(feed, A);
    expect(mentions).toEqual([{ slug: "bieber", label: "bieber label", month: "2026-10", note: "ate here", sources: [{ title: "MoneyToday", url: "https://www.mt.co.kr/a/1" }] }]);
    expect(spotViralMentions(feed, "missing")).toEqual([]);
    expect(spotViralMentions(null, A)).toEqual([]);
    expect(formatViralMonth("2026-10")).toBe("Oct 2026");
  });
});
