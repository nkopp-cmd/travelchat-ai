import { describe, expect, it } from "vitest";
import {
  isTipLikeActivity,
  sanitizeGeneratedDailyPlans,
} from "@/app/api/itineraries/generate/sanitize-itinerary";
import {
  buildItineraryPlanPayload,
  normalizeDailyPlansForDisplay,
} from "@/lib/itineraries/normalize-daily-plans";

describe("sanitizeGeneratedDailyPlans", () => {
  it("moves local and transport tips out of daily activities", () => {
    const result = sanitizeGeneratedDailyPlans([
      {
        day: 1,
        localTip: "Bring cash.",
        transportTips: "Use the metro.",
        activities: [
          {
            name: "Breakfast at Mangwon Market",
            description: "Start with local dumplings.",
            category: "Food",
          },
          {
            name: "Before you go",
            description: "Most stalls close early on Sundays.",
            category: "Advice",
          },
          {
            name: "Getting around",
            description: "Use exit 2 and walk five minutes.",
            category: "Transport",
          },
        ],
      },
    ]);

    expect(result[0].activities).toHaveLength(1);
    expect(result[0].activities[0].name).toBe("Breakfast at Mangwon Market");
    expect(result[0].localTip).toContain("Bring cash.");
    expect(result[0].localTip).toContain(
      "Before you go: Most stalls close early on Sundays.",
    );
    expect(result[0].transportTips).toContain("Use the metro.");
    expect(result[0].transportTips).toContain(
      "Use exit 2 and walk five minutes.",
    );
  });

  it("recognizes reminder and insight rows as tips", () => {
    expect(
      isTipLikeActivity({
        name: "Reminder",
        description: "Reserve popular restaurants before the trip.",
      }),
    ).toBe(true);

    expect(
      isTipLikeActivity({
        name: "Local insight for the day",
        description: "Go before lunch to avoid queues.",
      }),
    ).toBe(true);

    expect(
      isTipLikeActivity({
        name: "Getting there",
        description: "Walk from Anguk Station exit 3.",
      }),
    ).toBe(true);
  });

  it("moves imperative practical note rows into insights", () => {
    expect(
      isTipLikeActivity({
        name: "Bring cash for smaller vendors.",
      }),
    ).toBe(true);

    expect(
      isTipLikeActivity({
        name: "Reserve popular restaurants before the trip",
        description: "Weekend dinner slots book out fast.",
      }),
    ).toBe(true);
  });

  it("moves practical section rows into insights instead of day activities", () => {
    const result = normalizeDailyPlansForDisplay([
      {
        day: 1,
        activities: [
          {
            name: "Cafe Onion Anguk",
            description: "Start with coffee in the hanok courtyard.",
            category: "Cafe",
          },
          {
            name: "Opening hours",
            description: "Go before 10 AM for the calmest tables.",
          },
          {
            name: "Reservation",
            description: "Book weekend tea service before the trip.",
          },
          {
            name: "Language phrase",
            description: "Say annyeonghaseyo when entering small shops.",
          },
          {
            name: "Transit pass",
            description: "Use T-money and walk from Anguk Station exit 3.",
          },
        ],
      },
    ]);

    expect(result.dailyPlans[0].activities.map((activity) => activity.name)).toEqual([
      "Cafe Onion Anguk",
    ]);
    expect(result.insights).toEqual([
      expect.objectContaining({
        label: "Day 1 local tip",
        text: "Opening hours: Go before 10 AM for the calmest tables. Reservation: Book weekend tea service before the trip. Language phrase: Say annyeonghaseyo when entering small shops.",
      }),
      expect.objectContaining({
        label: "Day 1 getting around",
        text: "Transit pass: Use T-money and walk from Anguk Station exit 3.",
      }),
    ]);
  });

  it("treats generic meal or time-slot rows as tips but keeps named meal places", () => {
    expect(
      isTipLikeActivity({
        name: "Lunch",
        description: "Try a market stall near the museum.",
      }),
    ).toBe(true);

    expect(
      isTipLikeActivity({
        name: "Breakfast at Mangwon Market",
        description: "Start with local dumplings.",
        category: "Food",
      }),
    ).toBe(false);
  });

  it("normalizes display plans with all tips outside day sections", () => {
    const result = normalizeDailyPlansForDisplay([
      {
        day: 1,
        localTip: "Bring cash.",
        transportTips: "Use the metro.",
        activities: [
          {
            name: "Lunch at a real market",
            description: "Eat at a named stall.",
            category: "Food",
          },
          {
            name: "Things to know",
            description: "Many stalls close after lunch.",
            category: "Advice",
          },
          {
            name: "Use the metro between stops.",
            category: "Transport",
          },
        ],
      },
    ]);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].localTip).toBeUndefined();
    expect(result.dailyPlans[0].transportTips).toBeUndefined();
    expect(result.insights.map((insight) => insight.text)).toEqual([
      "Bring cash. Things to know: Many stalls close after lunch.",
      "Use the metro. Use the metro between stops.",
    ]);
  });

  it("extracts labeled tip lines from real activities without dropping the stop", () => {
    const result = normalizeDailyPlansForDisplay([
      {
        day: 1,
        activities: [
          {
            name: "Ikseon Teahouse",
            description:
              "Order seasonal tea before the afternoon rush.\nTip: Bring cash for smaller shops.\nGetting around: Walk from Jongno 3-ga exit 4.",
            category: "Cafe",
          },
        ],
      },
    ]);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].activities[0].description).toBe(
      "Order seasonal tea before the afternoon rush.",
    );
    expect(result.insights).toEqual([
      expect.objectContaining({
        label: "Day 1 local tip",
        text: "Tip: Bring cash for smaller shops.",
      }),
      expect.objectContaining({
        label: "Day 1 getting around",
        text: "Getting around: Walk from Jongno 3-ga exit 4.",
      }),
    ]);
  });

  it("extracts inline labeled tips from activity descriptions", () => {
    const result = normalizeDailyPlansForDisplay([
      {
        day: 1,
        activities: [
          {
            name: "Ikseon Teahouse",
            description:
              "Order seasonal tea before the afternoon rush. Tip: Bring cash for nearby shops. Getting around: Walk from Jongno 3-ga exit 4.",
            category: "Cafe",
          },
        ],
      },
    ]);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].activities[0].description).toBe(
      "Order seasonal tea before the afternoon rush.",
    );
    expect(result.insights).toEqual([
      expect.objectContaining({
        label: "Day 1 local tip",
        text: "Tip: Bring cash for nearby shops.",
      }),
      expect.objectContaining({
        label: "Day 1 getting around",
        text: "Getting around: Walk from Jongno 3-ga exit 4.",
      }),
    ]);
  });

  it("extracts numbered and dash-labeled tip lines from real activities", () => {
    const result = normalizeDailyPlansForDisplay([
      {
        day: 1,
        activities: [
          {
            name: "Cafe Onion Anguk",
            description:
              "Start with coffee in the hanok courtyard.\n1. Tip - Bring cash for nearby shops.\n2. Getting around - Walk from Anguk Station exit 3.",
            category: "Cafe",
          },
        ],
      },
    ]);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].activities[0].description).toBe(
      "Start with coffee in the hanok courtyard.",
    );
    expect(result.insights).toEqual([
      expect.objectContaining({
        label: "Day 1 local tip",
        text: "Tip: Bring cash for nearby shops.",
      }),
      expect.objectContaining({
        label: "Day 1 getting around",
        text: "Getting around: Walk from Anguk Station exit 3.",
      }),
    ]);
  });

  it("extracts food, booking, and route notes from real activities", () => {
    const result = normalizeDailyPlansForDisplay([
      {
        day: 1,
        activities: [
          {
            name: "Bupyeong Kkangtong Market",
            description:
              "Eat through named stalls after dark.\nWhat to order: seed hotteok and eomuk.\nBooking note: No reservation needed.\nRoute note: Start at Jagalchi Station.",
            category: "Market",
          },
        ],
      },
    ]);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].activities[0].description).toBe(
      "Eat through named stalls after dark.",
    );
    expect(result.insights).toEqual([
      expect.objectContaining({
        label: "Day 1 local tip",
        text: "What to order: seed hotteok and eomuk. Booking note: No reservation needed.",
      }),
      expect.objectContaining({
        label: "Day 1 getting around",
        text: "Route note: Start at Jagalchi Station.",
      }),
    ]);
  });

  it("moves activity-scoped note fields into insights and strips them from stops", () => {
    const result = normalizeDailyPlansForDisplay([
      {
        day: 1,
        activities: [
          {
            name: "Ikseon Teahouse",
            description: "Order seasonal tea in the hanok courtyard.",
            category: "Cafe",
            address: "Ikseon-dong, Jongno-gu, Seoul",
            tips: ["Bring cash for smaller shops."],
            whatToOrder: "Seasonal omija tea.",
            gettingAround: "Walk from Jongno 3-ga exit 4.",
          },
        ],
      },
    ]);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].activities[0]).toMatchObject({
      name: "Ikseon Teahouse",
      description: "Order seasonal tea in the hanok courtyard.",
      address: "Ikseon-dong, Jongno-gu, Seoul",
    });
    expect(result.dailyPlans[0].activities[0]).not.toHaveProperty("tips");
    expect(result.dailyPlans[0].activities[0]).not.toHaveProperty(
      "whatToOrder",
    );
    expect(result.dailyPlans[0].activities[0]).not.toHaveProperty(
      "gettingAround",
    );
    expect(result.insights).toEqual([
      expect.objectContaining({
        label: "Day 1 local tip",
        text: "Tip: Bring cash for smaller shops. What to order: Seasonal omija tea.",
      }),
      expect.objectContaining({
        label: "Day 1 getting around",
        text: "Getting around: Walk from Jongno 3-ga exit 4.",
      }),
    ]);
  });

  it("handles nested activity note objects without keeping them in day payloads", () => {
    const result = normalizeDailyPlansForDisplay([
      {
        day: 1,
        activities: [
          {
            name: "Bupyeong Kkangtong Market",
            description: "Eat through named stalls after dark.",
            category: "Market",
            bookingNote: { text: "No reservation needed, but go early." },
            routeNote: {
              start: "Start at Jagalchi Station.",
              end: "Exit through BIFF Square.",
            },
          },
        ],
      },
    ]);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].activities[0]).not.toHaveProperty(
      "bookingNote",
    );
    expect(result.dailyPlans[0].activities[0]).not.toHaveProperty("routeNote");
    expect(result.insights).toEqual([
      expect.objectContaining({
        label: "Day 1 local tip",
        text: "Booking note: No reservation needed, but go early.",
      }),
      expect.objectContaining({
        label: "Day 1 getting around",
        text: "Route note: Start at Jagalchi Station. Route note: Exit through BIFF Square.",
      }),
    ]);
  });

  it("supports structured itinerary payloads with top-level insights", () => {
    const payload = buildItineraryPlanPayload(
      [
        {
          day: 1,
          localTip: "Go before lunch.",
          activities: [
            {
              name: "Gwangjang Market",
              description: "Try bindaetteok at a named stall.",
              category: "market",
            },
          ],
        },
      ],
      [
        {
          id: "trip-cash",
          label: "Cash tip",
          text: "Bring small bills for market stalls.",
          kind: "local",
        },
      ],
    );

    const result = normalizeDailyPlansForDisplay(payload);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].localTip).toBeUndefined();
    expect(result.insights.map((insight) => insight.text)).toEqual([
      "Bring small bills for market stalls.",
      "Go before lunch.",
    ]);
  });

  it("dedupes repeated tips when legacy fields and top-level insights overlap", () => {
    const result = normalizeDailyPlansForDisplay(
      [
        {
          day: 1,
          localTip: "Bring small bills for market stalls.",
          transportTips: "Use exit 4.",
          activities: [
            {
              name: "Gwangjang Market",
              description: "Try bindaetteok at a named stall.",
              category: "market",
            },
          ],
        },
      ],
      [
        {
          id: "trip-cash",
          label: "Cash tip",
          text: "Bring small bills for market stalls.",
          kind: "local",
        },
        {
          id: "trip-route",
          label: "Route note",
          text: "Use exit 4.",
          kind: "transport",
        },
      ],
    );

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.insights.map((insight) => insight.text)).toEqual([
      "Bring small bills for market stalls.",
      "Use exit 4.",
    ]);
  });

  it("builds update payloads with tips outside day sections", () => {
    const normalized = normalizeDailyPlansForDisplay(
      [
        {
          day: 1,
          localTip: "Order at the counter before sitting.",
          transportTips: "Use exit 4.",
          activities: [
            {
              name: "Cafe Onion Anguk",
              description: "Start with coffee in a real cafe.",
              category: "Cafe",
            },
            {
              name: "Pro tip",
              description: "Weekday mornings are calmer.",
              category: "Advice",
            },
          ],
        },
      ],
      [{ label: "Booking note", text: "Reserve dinner.", kind: "local" }],
    );

    const payload = buildItineraryPlanPayload(
      normalized.dailyPlans,
      normalized.insights,
    );

    expect(normalized.dailyPlans[0].activities).toHaveLength(1);
    expect(normalized.dailyPlans[0]).not.toHaveProperty("localTip");
    expect(normalized.dailyPlans[0]).not.toHaveProperty("transportTips");
    expect(payload).toEqual({
      dailyPlans: normalized.dailyPlans,
      insights: expect.arrayContaining([
        expect.objectContaining({ text: "Reserve dinner." }),
        expect.objectContaining({
          text: "Order at the counter before sitting. Weekday mornings are calmer.",
        }),
        expect.objectContaining({ text: "Use exit 4." }),
      ]),
    });
  });
});
