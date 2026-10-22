import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({ default: {} }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
import { buildItineraryPins, ITINERARY_DAY_COLORS, ITINERARY_ROUTE_COLORS, itineraryDayColor, itineraryRouteColor } from "@/lib/itineraries/itinerary-pins";

const SPOT_ID = "550e8400-e29b-41d4-a716-446655440000";
const stop = (day: number, activityIndex: number, extra: Record<string, unknown> = {}) => ({
  lat: 1.29 + activityIndex / 100, lng: 103.85 + day / 100, activityName: `Stop ${day}.${activityIndex}`,
  day, activityIndex, category: "Food", ...extra,
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("itinerary photo pins", () => {
  it("numbers stops per day in visit order and draws one route per day", () => {
    const { spots, routes } = buildItineraryPins([stop(2, 1), stop(1, 1), stop(2, 0), stop(1, 0)]);
    expect(spots.map((spot) => [spot.id, spot.stop?.label])).toEqual([
      ["day1-0", "1"], ["day1-1", "2"], ["day2-0", "1"], ["day2-1", "2"],
    ]);
    expect(spots[3].stop).toMatchObject({ color: itineraryDayColor(2), ariaPrefix: "Day 2, stop 2" });
    expect(routes.map((route) => [route.key, route.points.length, route.color])).toEqual([
      ["day1", 2, itineraryRouteColor(1)], ["day2", 2, itineraryRouteColor(2)],
    ]);
  });

  it("links only real catalog spots and drops the time prefix the card already shows", () => {
    const { spots } = buildItineraryPins([
      stop(1, 0, { spotId: SPOT_ID, time: "9:00 AM", description: "9:00 AM - Hawker breakfast..." }),
      stop(1, 1, { spotId: "not-a-catalog-id" }),
      stop(1, 2),
    ]);
    expect(spots.map((spot) => spot.href)).toEqual([`/spots/${SPOT_ID}`, null, null]);
    expect(spots[0]).toMatchObject({ meta: "Day 1 · 9:00 AM", description: "Hawker breakfast..." });
    expect(spots[1].meta).toBe("Day 1");
    expect(spots[2].photos).toEqual([]);
  });

  it("keeps white badge text at 4.5:1 or better on every day colour", () => {
    for (const color of ITINERARY_DAY_COLORS) {
      expect((1.05) / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    expect(itineraryDayColor(11)).toBe(ITINERARY_DAY_COLORS[0]);
    expect(ITINERARY_ROUTE_COLORS).toHaveLength(ITINERARY_DAY_COLORS.length);
  });

  it("draws route lines bright enough for the dark map (luminance >= 0.3)", () => {
    for (const color of ITINERARY_ROUTE_COLORS) expect(luminance(color)).toBeGreaterThanOrEqual(0.3);
  });
});
