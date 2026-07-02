import { describe, expect, it } from "vitest";

import { buildItineraryDisplayPayload } from "@/lib/itineraries/display-payload";

describe("buildItineraryDisplayPayload", () => {
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
