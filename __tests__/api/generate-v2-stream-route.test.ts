import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_test" })),
  checkAndIncrementUsage: vi.fn(async () => ({
    allowed: true,
    usage: {
      currentUsage: 1,
      limit: 100,
      remaining: 99,
      periodType: "monthly",
      periodResetAt: "2026-08-01",
    },
    tier: "pro",
  })),
  generateItinerary: vi.fn(),
  geocodeItineraryActivities: vi.fn(),
  addThumbnailsToItinerary: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  insertedItineraryRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/usage-tracking", () => ({
  checkAndIncrementUsage: mocks.checkAndIncrementUsage,
}));

vi.mock("@/lib/llm", () => ({
  featureFlags: {
    isEnabledForTier: vi.fn(() => false),
  },
  getOrchestrator: vi.fn(() => ({
    generateItinerary: mocks.generateItinerary,
  })),
}));

vi.mock("@/lib/geocoding", () => ({
  geocodeItineraryActivities: mocks.geocodeItineraryActivities,
}));

vi.mock("@/lib/activity-images", () => ({
  addThumbnailsToItinerary: mocks.addThumbnailsToItinerary,
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function createSupabaseMock() {
  const userQuery = {
    select: vi.fn(() => userQuery),
    eq: vi.fn(() => userQuery),
    single: vi.fn(async () => ({
      data: { id: "user_db_test" },
      error: null,
    })),
  };

  const itineraryQuery = {
    insert: vi.fn((rows: Array<Record<string, unknown>>) => {
      mocks.insertedItineraryRows.push(...rows);
      return itineraryQuery;
    }),
    select: vi.fn(() => itineraryQuery),
    single: vi.fn(async () => ({
      data: { id: "itinerary_test" },
      error: null,
    })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "users") return userQuery;
      if (table === "itineraries") return itineraryQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function createStreamRequest() {
  return new NextRequest("https://www.localley.io/api/itineraries/generate-v2/stream", {
    method: "POST",
    body: JSON.stringify({
      city: "Seoul",
      days: 1,
      interests: ["cafes"],
      budget: "moderate",
      localnessLevel: 4,
      pace: "moderate",
      groupType: "couple",
    }),
    headers: {
      "content-type": "application/json",
    },
  });
}

function parseSSE(text: string) {
  return text
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk.replace(/^data:\s*/, ""))) as Array<{
      type: string;
      data: Record<string, unknown>;
    }>;
}

describe("/api/itineraries/generate-v2/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertedItineraryRows.length = 0;

    mocks.createSupabaseServerClient.mockResolvedValue(createSupabaseMock());
    mocks.geocodeItineraryActivities.mockImplementation(async (dailyPlans) =>
      dailyPlans.map((day: Record<string, unknown>) => ({
        ...day,
        activities: ((day.activities as Array<Record<string, unknown>>) || []).map(
          (activity, index) => ({
            ...activity,
            lat: 37.5665 + index,
            lng: 126.978 + index,
          }),
        ),
      })),
    );
    mocks.addThumbnailsToItinerary.mockImplementation((dailyPlans) =>
      dailyPlans.map((day: Record<string, unknown>) => ({
        ...day,
        activities: ((day.activities as Array<Record<string, unknown>>) || []).map(
          (activity) => ({
            ...activity,
            thumbnail: "https://images.unsplash.com/photo-1538485399081-7191377e8241?w=800&q=85",
          }),
        ),
      })),
    );
    mocks.generateItinerary.mockResolvedValue({
      success: true,
      data: {
        title: "Seoul Cafe Day",
        subtitle: "Quiet alleys and strong coffee",
        city: "Seoul",
        days: 1,
        localScore: 8,
        estimatedCost: "$40-80",
        highlights: ["Ikseon coffee"],
        insights: [{ label: "Cash tip", text: "Bring small bills.", kind: "local" }],
        dailyPlans: [
          {
            day: 1,
            theme: "Cafe alleys",
            activities: [
              {
                time: "10:00 AM",
                type: "morning",
                name: "Ikseon Teahouse",
                address: "Ikseon Teahouse, Jongno-gu, Seoul",
                description: "Order seasonal tea before the rush.",
                category: "cafe",
                localleyScore: 5,
                duration: "1 hour",
                cost: "$8-15",
              },
              {
                name: "Getting around",
                description: "Walk from Jongno 3-ga exit 4.",
                category: "Transport",
              },
            ],
          },
        ],
      },
      metrics: {
        totalLatencyMs: 100,
        providersUsed: ["glm"],
        cacheHits: 0,
        retryCount: 0,
      },
    });
  });

  it("streams a normalized itinerary and saves geocoded activities", async () => {
    const { POST } = await import("@/app/api/itineraries/generate-v2/stream/route");

    const response = await POST(createStreamRequest());
    const events = parseSSE(await response.text());
    const completeEvent = events.find((event) => event.type === "complete");

    expect(completeEvent?.data.success).toBe(true);
    expect(mocks.geocodeItineraryActivities).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          activities: [
            expect.objectContaining({ name: "Ikseon Teahouse" }),
          ],
        }),
      ]),
      "Seoul",
    );

    const savedActivities = mocks.insertedItineraryRows[0].activities as {
      dailyPlans: Array<{
        activities: Array<Record<string, unknown>>;
      }>;
      insights: Array<Record<string, unknown>>;
    };

    expect(savedActivities.dailyPlans[0].activities).toEqual([
      expect.objectContaining({
        name: "Ikseon Teahouse",
        lat: 37.5665,
        lng: 126.978,
        thumbnail: expect.stringContaining("images.unsplash.com"),
      }),
    ]);
    expect(savedActivities.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Bring small bills." }),
        expect.objectContaining({
          label: "Day 1 getting around",
          text: "Walk from Jongno 3-ga exit 4.",
          kind: "transport",
        }),
      ]),
    );
  });
});
