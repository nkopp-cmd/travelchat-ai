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
    expect(result[0].localTip).toContain("Before you go: Most stalls close early on Sundays.");
    expect(result[0].transportTips).toContain("Use the metro.");
    expect(result[0].transportTips).toContain("Use exit 2 and walk five minutes.");
  });

  it("recognizes reminder and insight rows as tips", () => {
    expect(
      isTipLikeActivity({
        name: "Reminder",
        description: "Reserve popular restaurants before the trip.",
      })
    ).toBe(true);

    expect(
      isTipLikeActivity({
        name: "Local insight for the day",
        description: "Go before lunch to avoid queues.",
      })
    ).toBe(true);
  });

  it("treats generic meal or time-slot rows as tips but keeps named meal places", () => {
    expect(
      isTipLikeActivity({
        name: "Lunch",
        description: "Try a market stall near the museum.",
      })
    ).toBe(true);

    expect(
      isTipLikeActivity({
        name: "Breakfast at Mangwon Market",
        description: "Start with local dumplings.",
        category: "Food",
      })
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
        ],
      },
    ]);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].localTip).toBeUndefined();
    expect(result.dailyPlans[0].transportTips).toBeUndefined();
    expect(result.insights.map((insight) => insight.text)).toEqual([
      "Bring cash. Things to know: Many stalls close after lunch.",
      "Use the metro.",
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
      ]
    );

    const result = normalizeDailyPlansForDisplay(payload);

    expect(result.dailyPlans[0].activities).toHaveLength(1);
    expect(result.dailyPlans[0].localTip).toBeUndefined();
    expect(result.insights.map((insight) => insight.text)).toEqual([
      "Bring small bills for market stalls.",
      "Go before lunch.",
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
      [{ label: "Booking note", text: "Reserve dinner.", kind: "local" }]
    );

    const payload = buildItineraryPlanPayload(normalized.dailyPlans, normalized.insights);

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
