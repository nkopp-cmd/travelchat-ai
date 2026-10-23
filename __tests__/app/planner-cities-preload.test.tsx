import { describe, expect, it, vi } from "vitest";

const preload = vi.hoisted(() => vi.fn());
vi.mock("react-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-dom")>()), preload }));

import NewItineraryLayout from "@/app/itineraries/new/layout";
import { PLANNER_CITIES_URL } from "@/lib/trips/planner-cities";

describe("planner city list preload", () => {
  it("preloads the exact URL the destination step fetches, with fetch()-compatible credentials", () => {
    NewItineraryLayout({ children: null });
    expect(preload).toHaveBeenCalledWith("/api/cities?minSpots=1", { as: "fetch", crossOrigin: "anonymous" });
    expect(PLANNER_CITIES_URL).toBe("/api/cities?minSpots=1");
  });
});
