import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSupabaseAdmin: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.createSupabaseAdmin }));

import {
  APIFY_SPOT_DISCOVERY_QUERIES,
  mapApifyCategory,
  normalizeApifySpotCandidate,
  recommendLocalleyScore,
  refreshApifySpotDiscovery,
} from "@/lib/apify-spot-discovery";

describe("Apify spot discovery", () => {
  afterEach(() => {
    delete process.env.APIFY_SPOT_DISCOVERY_ENABLED;
    delete process.env.APIFY_API_TOKEN;
    vi.clearAllMocks();
  });

  it("normalizes a complete Google Maps result without personal review data", () => {
    const candidate = normalizeApifySpotCandidate({
      citySlug: "seoul",
      runId: "run-1",
      item: {
        placeId: "ChIJ-local-place",
        title: "Tiny Noodle House",
        address: "12 Eulji-ro, Seoul",
        location: { lat: 37.5665, lng: 126.978 },
        countryCode: "KR",
        url: "https://www.google.com/maps/place/Tiny+Noodle+House",
        imageUrl: "https://lh5.googleusercontent.com/p/photo",
        categoryName: "Noodle restaurant",
        totalScore: 4.7,
        reviewsCount: 180,
        searchString: "hidden gem restaurant",
        reviews: [{ name: "must not be retained", text: "private" }],
      },
    });

    expect(candidate).toMatchObject({
      placeId: "ChIJ-local-place",
      citySlug: "seoul",
      recommendedLocalleyScore: 5,
      totalScore: 4.7,
      reviewsCount: 180,
    });
    expect(JSON.stringify(candidate)).not.toContain("must not be retained");
  });

  it("rejects results outside the requested city country and safety radius", () => {
    const base = {
      placeId: "ChIJ-local-place",
      title: "Tiny Noodle House",
      address: "12 Eulji-ro, Seoul",
      url: "https://www.google.com/maps/place/x",
      imageUrl: "https://lh5.googleusercontent.com/p/photo",
      totalScore: 4.7,
      reviewsCount: 180,
    };
    expect(normalizeApifySpotCandidate({
      citySlug: "seoul",
      runId: "run-1",
      item: { ...base, countryCode: "JP", location: { lat: 37.5665, lng: 126.978 } },
    })).toBeNull();
    expect(normalizeApifySpotCandidate({
      citySlug: "seoul",
      runId: "run-1",
      item: { ...base, countryCode: "KR", location: { lat: 33.4996, lng: 126.5312 } },
    })).toBeNull();
  });

  it("rejects off-domain map and image URLs", () => {
    const base = {
      placeId: "ChIJ-local-place",
      title: "Tiny Noodle House",
      address: "12 Eulji-ro, Seoul",
      location: { lat: 37.5665, lng: 126.978 },
      totalScore: 4.7,
      reviewsCount: 180,
    };
    expect(normalizeApifySpotCandidate({
      citySlug: "seoul",
      runId: "run-1",
      item: { ...base, url: "https://google.com.attacker.example/maps/place/x", imageUrl: "https://lh5.googleusercontent.com/p/photo" },
    })).toBeNull();
    expect(normalizeApifySpotCandidate({
      citySlug: "seoul",
      runId: "run-1",
      item: { ...base, url: "https://www.google.com/maps/place/x", imageUrl: "https://attacker.example/photo" },
    })).toBeNull();
  });

  it("maps categories and recommends conservative Localley scores", () => {
    expect(mapApifyCategory("Coffee shop", [])).toBe("Cafe");
    expect(mapApifyCategory("Flea market", [])).toBe("Market");
    expect(recommendLocalleyScore(4.8, 300)).toBe(5);
    expect(recommendLocalleyScore(4.4, 1_200)).toBe(4);
    expect(recommendLocalleyScore(4.9, 8_000)).toBe(3);
  });

  it("keeps the paid query corpus and maximum result count bounded", () => {
    expect(APIFY_SPOT_DISCOVERY_QUERIES).toHaveLength(5);
    expect(new Set(APIFY_SPOT_DISCOVERY_QUERIES).size).toBe(5);
  });

  it("does no database or provider work while disabled", async () => {
    process.env.APIFY_SPOT_DISCOVERY_ENABLED = "false";
    process.env.APIFY_API_TOKEN = "must-not-be-used";
    await expect(refreshApifySpotDiscovery()).rejects.toThrow("Apify spot discovery is disabled.");
    expect(mocks.createSupabaseAdmin).not.toHaveBeenCalled();
  });
});
