// Push BM3: every spot planner link on a city hub carries the city.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { withHubCity } from "@/lib/spots/hub-city";
import { SpotCard } from "@/components/spots/spot-card";
import type { Spot } from "@/types";

vi.mock("@/lib/spot-analytics", () => ({ trackSpotEvent: vi.fn() }));
vi.mock("@/components/spots/save-spot-button", () => ({ SaveSpotButton: () => <button type="button">Save spot</button> }));

const spot = (over: Partial<Spot>): Spot => ({
  id: "04ac9f94-0000-4000-8000-000000000000", name: "Kissa", description: "A quiet coffee counter.", category: "Cafe",
  subcategories: [], location: { lat: 35.68, lng: 139.76 }, address: "1-2 Kanda, Chiyoda, Tokyo", localleyScore: 5,
  localPercentage: 80, bestTime: "Morning", photos: [], tips: [], verified: true, trending: false, ...over,
} as Spot);

describe("withHubCity", () => {
  it("fills a missing city from the hub and keeps a known city", () => {
    const tokyo = { name: "Tokyo", slug: "tokyo" };
    const [filled, kept] = withHubCity([spot({ cityName: undefined }), spot({ id: "b", cityName: "Seoul", citySlug: "seoul" })], tokyo);
    expect(filled).toMatchObject({ cityName: "Tokyo", citySlug: "tokyo" });
    expect(kept).toMatchObject({ cityName: "Seoul", citySlug: "seoul" });
  });

  it("changes nothing without a hub city", () => {
    const list = [spot({ cityName: undefined })];
    expect(withHubCity(list, undefined)).toBe(list);
  });

  it("gives the card's Add to trip link the hub city", () => {
    const [filled] = withHubCity([spot({ cityName: undefined })], { name: "Tokyo", slug: "tokyo" });
    const html = renderToStaticMarkup(<SpotCard spot={filled} />);
    expect(html).toContain("/itineraries/new?spot=04ac9f94-0000-4000-8000-000000000000&amp;city=Tokyo");
  });
});
