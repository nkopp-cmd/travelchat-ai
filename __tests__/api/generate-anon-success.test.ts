// Money path (push-localley X2): the first anonymous planner request must answer the fields that
// components/itineraries/wizard uses to store the preview and route to /itineraries/preview
// (isAnonymous || requiresSaveUpgrade, preview.id as a UUID). Without them the free plan never
// reaches Save -> checkout. The model, spot pool and draft store are mocked; the real parser runs.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const DRAFT_ID = "3f2b8c4e-9a1d-4c6e-8b7a-1d2e3f4a5b6c";
const state = vi.hoisted(() => ({ anonCookie: undefined as string | undefined, kept: [] as unknown[] }));

vi.mock("@/lib/rate-limit", () => ({ rateLimiters: { strict: vi.fn(async () => null) } }));
vi.mock("@/lib/auth/server", () => ({ auth: vi.fn(async () => ({ userId: null })) }));
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

const post = (body: unknown) => new NextRequest("https://www.localley.io/api/itineraries/generate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("POST /api/itineraries/generate anonymous success contract", () => {
  beforeEach(() => {
    state.anonCookie = undefined;
    state.kept = [];
  });

  it("returns the preview fields the wizard routes on, keeps the draft and spends the one free plan", async () => {
    const { POST } = await import("@/app/api/itineraries/generate/route");
    const response = await POST(post({ city: "Seoul", days: 2 }));
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.isAnonymous).toBe(true);
    expect(json.requiresSaveUpgrade).toBe(true);
    expect(json.preview?.id).toMatch(UUID);
    expect(json.itinerary.city).toBe("Seoul");
    expect(json.itinerary.days).toBe(2);
    expect(json.itinerary.dailyPlans).toHaveLength(2);
    expect(json.signupPrompt.signupUrl).toBe("/sign-up");

    expect(state.kept).toHaveLength(1);
    expect(response.cookies.get("lly_draft")?.value).toBe(DRAFT_ID);
    expect(response.cookies.get("localley_anon_usage")?.value).toBe("1");
  });
});
