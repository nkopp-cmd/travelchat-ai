import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/itineraries/generate/route";

const mocks = vi.hoisted(() => ({ user: vi.fn(), save: vi.fn(), admin: vi.fn(), fetch: vi.fn(), parse: vi.fn(), provider: vi.fn(), insert: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "owner" }) }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/activity-images", () => ({ addThumbnailsToItinerary: (plans: unknown) => plans, addAIThumbnailsToItinerary: vi.fn() }));
vi.mock("@/lib/subscription", () => ({ hasFeature: () => false }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: async () => "free", checkUsageLimit: async () => ({ allowed: true }), checkAndIncrementUsage: async () => ({ allowed: true, tier: "free" }) }));
vi.mock("@/lib/geocoding", () => ({ geocodeItineraryActivities: async (plans: unknown) => plans }));
vi.mock("@/lib/spots/public-quality", () => ({ applyPublicSpotVisibilityFilters: (query: unknown) => query, shouldShowPublicSpot: () => true }));
vi.mock("@/lib/itineraries/grounded-generation", () => ({ rankItineraryGroundingSpots: () => [], hasItineraryGroundingCoverage: () => true, groundGeneratedDailyPlans: (plans: unknown) => plans, getPaceStopRange: () => ({ min: 1, max: 5 }), buildItinerarySpotContext: () => "" }));
vi.mock("@/app/api/itineraries/generate/provider-fallback", () => ({ generateItineraryTextWithFallback: mocks.provider }));
vi.mock("@/app/api/itineraries/generate/shared", () => ({
  OPENAI_MODEL: "mock", SYSTEM_PROMPT: "mock", generateWithOpenAI: vi.fn(), getOrCreateUserDbId: mocks.user,
  parseAndSanitizeItinerary: mocks.parse,
}));
const id = "bbbbbbbb-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("MULTI_CITY_PREVIEW_API", "on");
  mocks.provider.mockResolvedValue({ rawContent: "mock", provider: "openai" });
  mocks.user.mockResolvedValue("internal-owner");
  mocks.save.mockResolvedValue({ data: { id }, error: null });
  const query = { select: () => query, ilike: () => query, gte: () => query, order: () => query, limit: async () => ({ data: [], error: null }), insert: mocks.insert, single: mocks.save };
  mocks.insert.mockReturnValue(query);
  mocks.admin.mockReturnValue({ from: () => query });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const modelId = "aaaaaaaa-1111-4111-8111-111111111111";

describe.each(["single-city", "multi-city"])("%s persistence outcomes", (mode) => {
  const days = mode === "single-city" ? 1 : 8;
  const generate = () => {
    mocks.parse.mockReturnValue({ id: modelId, title: "Keep this draft", dailyPlans: Array.from({ length: days }, (_, index) => ({ day: index + 1, activities: [{ name: "Cafe" }] })) });
    return POST(new NextRequest("https://localley.io/api/itineraries/generate", { method: "POST", body: JSON.stringify({
      ...(mode === "single-city" ? { city: "Seoul", days } : { corridor: { destinations: [{ destinationSlug: "seoul" }, { destinationSlug: "tokyo" }], totalDays: days } }),
      interests: ["Food & Dining"], budget: "moderate", pace: "relaxed",
    }) }));
  };

it.each(["save error", "data with error", "missing user", "helper throw", "insert throw", "return throw", "missing data", "missing id", "invalid id"])("returns the generated draft without XP on %s", async (failure) => {
  if (failure === "save error") mocks.save.mockResolvedValue({ data: null, error: { message: "failed" } });
  if (failure === "data with error") mocks.save.mockResolvedValue({ data: { id }, error: { message: "return failed" } });
  if (failure === "missing user") mocks.user.mockResolvedValue(null);
  if (failure === "helper throw") mocks.user.mockRejectedValue(new Error("offline"));
  if (failure === "insert throw") mocks.insert.mockImplementation(() => { throw new Error("insert failed"); });
  if (failure === "return throw") mocks.save.mockRejectedValue(new Error("return failed"));
  if (failure === "missing data") mocks.save.mockResolvedValue({ data: null, error: null });
  if (failure === "missing id") mocks.save.mockResolvedValue({ data: {}, error: null });
  if (failure === "invalid id") mocks.save.mockResolvedValue({ data: { id: "invalid" }, error: null });
  const response = await generate();
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({ success: false, generated: true, stored: false, error: "itinerary_not_saved", itinerary: { title: "Keep this draft" } });
  expect(result.itinerary.id).toBeUndefined();
  expect(result.itinerary.dailyPlans).toHaveLength(days);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.provider).toHaveBeenCalledTimes(1);
  expect(mocks.parse).toHaveBeenCalledTimes(1);
  if (mode === "multi-city") expect(result.itinerary.corridor.legs).toHaveLength(2);
});
it("returns the saved UUID rather than a model-supplied UUID and awards creation XP", async () => {
  const result = await (await generate()).json();
  expect(result).toMatchObject({ success: true, generated: true, stored: true, itinerary: { id } });
  expect(result.itinerary.id).not.toBe(modelId);
  expect(mocks.insert.mock.calls[0][0][0]).not.toHaveProperty("id");
  expect(mocks.provider).toHaveBeenCalledTimes(1);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.fetch.mock.calls[0][0]).toContain("/api/gamification/award");
});
});
