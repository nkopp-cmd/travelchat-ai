import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: mocks.createSupabaseAdmin,
}));

import {
  getSocialTrendRetentionCutoffs,
  getWeekStart,
  normalizeSocialTrendItem,
  refreshWeeklySocialTrends,
  SOCIAL_SCOUT_CITIES,
} from "@/lib/weekly-social-trends";

describe("weekly social trend normalization", () => {
  afterEach(() => {
    delete process.env.WEEKLY_SOCIAL_TRENDS_ENABLED;
    delete process.env.APIFY_API_TOKEN;
    vi.clearAllMocks();
  });

  it("normalizes an Instagram result and removes tracking parameters", () => {
    const item = normalizeSocialTrendItem({
      platform: "instagram",
      weekStart: "2026-07-13",
      item: {
        id: "post-1",
        searchTerm: "Seoul hidden gems travel",
        url: "https://www.instagram.com/reel/ABC123/?utm_source=test&igsh=secret",
        caption: "Seoul locals keep returning to Tiny Noodle House.",
        videoPlayCount: 12_000,
        likesCount: 900,
        commentsCount: 45,
        timestamp: "2026-07-12T12:00:00Z",
      },
    });

    expect(item).toMatchObject({
      citySlug: "seoul",
      platform: "instagram",
      externalId: "post-1",
      viewCount: 12_000,
      likeCount: 900,
      commentCount: 45,
    });
    expect(item?.canonicalUrl).toBe("https://www.instagram.com/reel/ABC123/");
  });

  it("normalizes nested TikTok engagement metrics", () => {
    const item = normalizeSocialTrendItem({
      platform: "tiktok",
      weekStart: "2026-07-13",
      item: {
        id: "video-1",
        query: "Tokyo hidden gems travel",
        webVideoUrl: "https://www.tiktok.com/@local/video/123",
        text: "Tokyo Tiny Coffee Counter",
        stats: {
          playCount: 50_000,
          diggCount: 4_000,
          commentCount: 120,
        shareCount: 300,
        saveCount: 0,
        },
      },
    });

    expect(item).toMatchObject({
      citySlug: "tokyo",
      viewCount: 50_000,
      likeCount: 4_000,
      commentCount: 120,
      shareCount: 300,
    });
  });

  it("rejects off-platform URLs even when the city is valid", () => {
    const item = normalizeSocialTrendItem({
      platform: "instagram",
      weekStart: "2026-07-13",
      item: {
        searchTerm: "Bangkok hidden gems travel",
        url: "https://instagram.com.attacker.example/reel/ABC123",
        caption: "Bangkok hidden gem",
      },
    });

    expect(item).toBeNull();
  });

  it("maps compact Instagram hashtags to hyphenated city slugs", () => {
    const item = normalizeSocialTrendItem({
      platform: "instagram",
      weekStart: "2026-07-13",
      item: {
        id: "hong-kong-post",
        inputUrl: "https://www.instagram.com/explore/tags/hongkonghiddengems/",
        url: "https://www.instagram.com/p/HK123/",
        caption: "A quiet Hong Kong neighborhood cafe.",
        likesCount: 700,
        commentsCount: 20,
      },
    });

    expect(item).toMatchObject({
      citySlug: "hong-kong",
      likeCount: 700,
      commentCount: 20,
    });
  });

  it("uses Monday UTC as the weekly boundary", () => {
    expect(getWeekStart(new Date("2026-07-19T23:59:59Z"))).toBe("2026-07-13");
    expect(getWeekStart(new Date("2026-07-20T00:00:00Z"))).toBe("2026-07-20");
  });

  it("limits paid scouts to the documented high-coverage launch cohort", () => {
    expect(SOCIAL_SCOUT_CITIES.map((city) => city.slug)).toEqual([
      "seoul",
      "tokyo",
      "bangkok",
      "singapore",
      "osaka",
      "kyoto",
      "taipei",
      "hong-kong",
    ]);
  });

  it("bounds derived data to 16 weeks and stale starts to 30 minutes", () => {
    expect(getSocialTrendRetentionCutoffs(new Date("2026-07-14T12:00:00Z"))).toEqual({
      derivedBeforeWeek: "2026-03-24",
      staleStartingBefore: "2026-07-14T11:30:00.000Z",
    });
  });

  it("rejects cities outside the paid scout cohort", () => {
    expect(normalizeSocialTrendItem({
      platform: "youtube",
      weekStart: "2026-07-13",
      item: {
        id: "paris-video",
        query: "Paris hidden gems travel",
        url: "https://www.youtube.com/watch?v=abc123",
        title: "Paris hidden gems",
      },
    })).toBeNull();
  });

  it("does no database or paid-provider work while disabled", async () => {
    process.env.WEEKLY_SOCIAL_TRENDS_ENABLED = "false";
    process.env.APIFY_API_TOKEN = "must-not-be-used";

    await expect(refreshWeeklySocialTrends()).rejects.toThrow(
      "Weekly social trends are disabled.",
    );
    expect(mocks.createSupabaseAdmin).not.toHaveBeenCalled();
  });
});
