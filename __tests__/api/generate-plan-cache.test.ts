// Push BL1: the second identical anonymous/free plan request is served from KV (no spot query, no model call),
// still spends the free plan, and paid tiers never read or write the cache.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { generateItineraryTextWithFallback } from "@/app/api/itineraries/generate/provider-fallback";
import { itinerarySpotPoolQuery } from "@/app/api/itineraries/generate/spot-pool";
import { checkAndIncrementUsage } from "@/lib/usage-tracking";

const DRAFT_ID = "3f2b8c4e-9a1d-4c6e-8b7a-1d2e3f4a5b6c";
const state = vi.hoisted(() => ({
  anonCookie: undefined as string | undefined,
  kept: [] as unknown[],
  userId: null as string | null,
  tier: "free" as string,
  kv: new Map<string, string>(),
  kvTtls: [] as Array<number | undefined>,
  kvReads: 0,
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimiters: { strict: vi.fn(async () => null) } }));
vi.mock("@/lib/auth/server", () => ({ auth: vi.fn(async () => ({ userId: state.userId })) }));
vi.mock("@/lib/usage-tracking", () => ({
  getUserTier: vi.fn(async () => state.tier),
  checkUsageLimit: vi.fn(async () => ({ allowed: true, currentUsage: 0, limit: 10, periodResetAt: null })),
  checkAndIncrementUsage: vi.fn(async () => ({ allowed: true, usage: { currentUsage: 1, limit: 10, periodResetAt: null }, tier: state.tier })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === "localley_anon_usage" && state.anonCookie !== undefined ? { name, value: state.anonCookie } : undefined),
    set: vi.fn(),
  })),
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/app/api/itineraries/generate/spot-pool", () => ({
  itinerarySpotPoolQuery: vi.fn(async () => ({ data: [{ id: "s1" }], error: null })),
}));
vi.mock("@/lib/spots/public-quality", () => ({ shouldShowPublicSpot: () => true }));
vi.mock("@/lib/itineraries/grounded-generation", () => ({
  buildItinerarySpotContext: () => "",
  getPaceStopRange: () => ({ min: 2, max: 6 }),
  groundGeneratedDailyPlans: (plans: unknown) => plans,
  hasItineraryGroundingCoverage: () => true,
  rankItineraryGroundingSpots: (spots: unknown) => spots,
  pinSelectedSpot: (spots: unknown) => ({ spots }),
  ensurePinnedSpot: (plans: unknown) => plans,
}));
vi.mock("@/lib/geocoding", () => ({ geocodeItineraryActivities: async (plans: unknown) => plans }));
vi.mock("@/lib/activity-images", () => ({
  addThumbnailsToItinerary: (plans: unknown) => plans,
  addAIThumbnailsToItinerary: async (plans: unknown) => plans,
}));
vi.mock("@/lib/trips/preview-draft-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trips/preview-draft-store")>()),
  keepServerDraft: vi.fn(async (itinerary: unknown) => {
    state.kept.push(itinerary);
    return { id: DRAFT_ID };
  }),
  previewDraftKv: () => ({
    get: async (key: string) => { state.kvReads += 1; return state.kv.get(key) ?? null; },
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      state.kv.set(key, value);
      state.kvTtls.push(options?.expirationTtl);
    },
    delete: async (key: string) => { state.kv.delete(key); },
  }),
}));

const day = (n: number) => ({
  day: n,
  theme: `Day ${n}`,
  activities: [
    { time: "10:00", type: "morning", name: `Gwangjang Market ${n}`, address: "Jongno-gu, Seoul", description: "Mung bean pancakes at the counter." },
    { time: "14:00", type: "afternoon", name: `Ikseon-dong Lanes ${n}`, address: "Jongno-gu, Seoul", description: "Hanok cafes and small shops." },
  ],
});
const modelJson = (days: number) => JSON.stringify({
  title: "Seoul like a local",
  subtitle: "Markets and lanes",
  localScore: 8,
  dailyPlans: Array.from({ length: days }, (_, i) => day(i + 1)),
});

vi.mock("@/app/api/itineraries/generate/provider-fallback", () => ({
  generateItineraryTextWithFallback: vi.fn(async () => ({
    rawContent: modelJson(2),
    provider: "glm",
    model: "glm-5.2",
    fallbackUsed: false,
    fallbackReason: undefined,
    primaryProvider: "glm",
    primaryModel: "glm-5.2",
    primaryConfigured: true,
  })),
}));

vi.mock("@/app/api/itineraries/generate/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/itineraries/generate/shared")>()),
  getOrCreateUserDbId: vi.fn(async () => null),
}));

const post = (body: unknown) => new NextRequest("https://www.localley.io/api/itineraries/generate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const outcomes = (info: { mock: { calls: unknown[][] } }) =>
  info.mock.calls.filter((call) => call[0] === "[generate] outcome").map((call) => call[1] as Record<string, unknown>);

describe("POST /api/itineraries/generate plan cache", () => {
  beforeEach(() => {
    state.anonCookie = undefined;
    state.kept = [];
    state.userId = null;
    state.tier = "free";
    state.kv.clear();
    state.kvTtls = [];
    state.kvReads = 0;
    vi.mocked(generateItineraryTextWithFallback).mockClear();
    vi.mocked(itinerarySpotPoolQuery).mockClear();
    vi.mocked(checkAndIncrementUsage).mockClear();
  });

  it("serves the second identical anonymous request from the cache with the same response shape", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { POST } = await import("@/app/api/itineraries/generate/route");
    const first = await POST(post({ city: "Seoul", days: 2, interests: ["food", "markets"] }));
    const second = await POST(post({ city: "seoul", days: 2, interests: ["markets", "food"] }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(generateItineraryTextWithFallback).toHaveBeenCalledTimes(1);
    expect(itinerarySpotPoolQuery).toHaveBeenCalledTimes(1);
    expect(outcomes(info).map((o) => [o.cache, o.provider, o.reason])).toEqual([["miss", "glm", "ok"], ["hit", "glm", "ok"]]);
    info.mockRestore();

    const [a, b] = [await first.json(), await second.json()];
    expect(b.itinerary).toEqual(a.itinerary);
    expect(b.isAnonymous).toBe(true);
    expect(b.requiresSaveUpgrade).toBe(true);
    expect(b.preview.id).toBe(DRAFT_ID);
    expect(b.meta).toMatchObject({ provider: "glm", cached: true });
    expect(state.kept).toHaveLength(2);
    expect(second.cookies.get("lly_draft")?.value).toBe(DRAFT_ID);
    expect(second.cookies.get("localley_anon_usage")?.value).toBe("1");
  });

  it("keeps the wizard preset 8 d and a custom request 24 h (Push BM1)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { POST } = await import("@/app/api/itineraries/generate/route");
    const preset = { city: "Tokyo", days: 3, interests: [], budget: "moderate", localnessLevel: 3, pace: "moderate", groupType: "solo" };
    const threeDays = { ...(await vi.mocked(generateItineraryTextWithFallback).getMockImplementation()!({} as never)), rawContent: modelJson(3) };
    vi.mocked(generateItineraryTextWithFallback).mockResolvedValueOnce(threeDays).mockResolvedValueOnce(threeDays);
    expect((await POST(post(preset))).status).toBe(200);
    expect((await POST(post({ ...preset, groupType: "couple" }))).status).toBe(200);
    info.mockRestore();
    expect(state.kvTtls.filter((ttl) => ttl === 8 * 86_400 || ttl === 86_400)).toEqual([8 * 86_400, 86_400]);
  });

  it("still spends a signed-in free user's monthly plan on a cache hit", async () => {
    state.userId = "user-free";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { POST } = await import("@/app/api/itineraries/generate/route");
    await POST(post({ city: "Seoul", days: 2 }));
    const hit = await POST(post({ city: "Seoul", days: 2 }));
    info.mockRestore();
    expect(hit.status).toBe(200);
    expect(generateItineraryTextWithFallback).toHaveBeenCalledTimes(1);
    expect(checkAndIncrementUsage).toHaveBeenCalledTimes(2);
  });

  it("never reads or writes the cache for a paid tier", async () => {
    state.userId = "user-pro";
    state.tier = "pro";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { POST } = await import("@/app/api/itineraries/generate/route");
    await POST(post({ city: "Seoul", days: 2 }));
    await POST(post({ city: "Seoul", days: 2 }));
    expect(outcomes(info).every((o) => !("cache" in o))).toBe(true);
    info.mockRestore();
    vi.unstubAllGlobals();
    expect(generateItineraryTextWithFallback).toHaveBeenCalledTimes(2);
    expect(state.kvReads).toBe(0);
    expect(state.kv.size).toBe(0);
  });
});
