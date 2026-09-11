import { describe, expect, it } from "vitest";

import { buildItineraryDisplayPayload } from "@/lib/itineraries/display-payload";

describe("buildItineraryDisplayPayload", () => {
  it("retains canonical places with advice-like names and preserves their notes", () => {
    const activities = ["Coffee", "Note", "Getting around"].map((name, index) => ({
      spotId: `aaaaaaaa-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
      name,
      description: "Bring cash. A quiet neighborhood cafe with a courtyard.",
      notes: "My personal visit note",
      address: "Seoul",
      lat: 37.57,
      lng: 126.98,
    }));
    const original = [{ day: 1, activities }];
    const displayed = buildItineraryDisplayPayload(JSON.stringify(original));
    expect(displayed.dailyPlans[0].activities).toEqual(activities);
    const reopened = buildItineraryDisplayPayload(JSON.stringify(displayed.dailyPlans));
    expect(reopened.dailyPlans[0].activities).toEqual(activities);
  });

  it("keeps itinerary tips out of day activities and exposes them as trip insights", () => {
    const payload = JSON.stringify({
      dailyPlans: [
        {
          day: 1,
          theme: "Neighborhood route",
          activities: [
            {
              name: "Ikseon-dong Hanok Alley",
              description: "Walk the side lanes and stop for tea.",
              address: "Ikseon-dong, Jongno-gu, Seoul",
              category: "hidden-gem",
            },
            {
              name: "Getting around",
              description: "Take subway Line 3 to Jongno 3-ga and use Exit 4.",
            },
            {
              name: "Local tip",
              description: "Bring cash for small stalls before lunch.",
            },
          ],
        },
      ],
    });

    const result = buildItineraryDisplayPayload(payload);

    expect(result.dailyPlans).toHaveLength(1);
    expect(result.dailyPlans[0].activities).toEqual([
      expect.objectContaining({
        name: "Ikseon-dong Hanok Alley",
        address: "Ikseon-dong, Jongno-gu, Seoul",
      }),
    ]);
    expect(result.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "transport",
          text: "Take subway Line 3 to Jongno 3-ga and use Exit 4.",
        }),
        expect.objectContaining({
          kind: "local",
          text: "Bring cash for small stalls before lunch.",
        }),
      ]),
    );
  });
});
