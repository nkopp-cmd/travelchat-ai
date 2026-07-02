import { describe, expect, it } from "vitest";
import { getSpotActivitiesCopy } from "@/components/spots/spot-activities";

describe("SpotActivities", () => {
  it("describes Viator results as city-level instead of exact nearby picks", () => {
    expect(getSpotActivitiesCopy("Seoul", "Gwangjang Market")).toEqual({
      heading: "Bookable activities in Seoul",
      loadingDescription:
        "Finding city-level tours that can pair with Gwangjang Market.",
      description:
        "These are city-level tours and activities around Seoul, not exact walking-distance picks from Gwangjang Market.",
    });
  });
});
